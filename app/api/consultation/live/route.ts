import { createHash } from 'node:crypto';
import { z } from 'zod';
import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
import { loadConsultationContext } from '@/lib/consultation-provider';
import { createLiveSession, closeLiveSession, liveAvailability, monitorLive, LIVE_PRICING_VERSION } from '@/lib/consultation-live';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
const offer=z.object({idempotencyKey:z.uuid(),expectedRevision:z.number().int().nonnegative(),sdp:z.string().min(1).max(64000)}).strict();
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in for your private consultation');
  const parsed=offer.safeParse(await body(request));if(!parsed.success)return fail(400,'A current conversation and WebRTC offer are required');
  const readiness=liveAvailability(auth.user.id);
  if(!readiness.available)return Response.json({error:readiness.reason,code:readiness.code},{status:503,headers});
  const input=parsed.data,context=await loadConsultationContext({service:auth.service,userId:auth.user.id,expectedRevision:input.expectedRevision,mode:'voice'});
  const hash=createHash('sha256').update(JSON.stringify({context:context.inputHash,sdp:input.sdp,pricingVersion:LIVE_PRICING_VERSION})).digest('hex');
  const reserved=await auth.service.rpc('reserve_live_consultation',{p_user:auth.user.id,p_key:input.idempotencyKey,p_hash:hash,p_revision:input.expectedRevision});
  if(reserved.error)return fail(503,'The shared Live budget ledger is unavailable');
  if(reserved.data?.error){
   const reason=reserved.data.error;
   const message=reason==='budget'?'The remaining shared account budget cannot cover this Live reservation.'
    :reason==='in_flight'?'Another operation is active or awaiting reconciliation. Finish it before starting Live.'
    :reason==='unavailable'?'Live budget admission is disabled or its reservation price is not configured.'
    :reason==='conflict'?'The saved conversation changed. Reload it before starting Live.'
    :reason==='forbidden'?'This account is not permitted to start Live.':'Live call could not be reserved';
   return Response.json({error:message,code:`live_${reason}`},{status:reason==='budget'?402:reason==='unavailable'?503:409,headers});
  }
  const op=reserved.data?.operation;if(!op?.id)return fail(503,'Live call unavailable');
  if(!reserved.data.created)return Response.json({operation:op,replayed:true},{headers});
  const uncertain=()=>auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:op.id});
  const dispatch=await auth.service.rpc('dispatch_style_operation',{p_user:auth.user.id,p_id:op.id,p_lease_seconds:900});
  if(dispatch.error||dispatch.data!==true){if(dispatch.data===false)await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'failed_before_dispatch'});else await uncertain();return fail(503,'Live call unavailable; uncertain reservations remain held')}
  let providerSessionId:string|undefined;
  try{
   const created=await createLiveSession({key:process.env.OPENAI_API_KEY!,sdp:input.sdp,history:context.snapshot.messages});providerSessionId=created.session.id;
   const bound=await auth.service.rpc('bind_live_consultation',{p_user:auth.user.id,p_op:op.id,p_session:created.session.id});
   if(bound.error||!bound.data?.bound)throw new Error('Live binding failed');
   const answer=await auth.service.from('consultation_live_sessions').update({sdp_answer:created.transport.sdp}).eq('operation_id',op.id).eq('user_id',auth.user.id).select('operation_id').maybeSingle();if(answer.error||!answer.data)throw new Error('SDP save failed');
   return Response.json({operationId:op.id},{status:201,headers});
  }catch{if(providerSessionId)await closeLiveSession(process.env.OPENAI_API_KEY!,providerSessionId);await uncertain();return fail(503,'Live initialization is uncertain; do not automatically retry')}
 }catch{return fail(503,'Live call unavailable')}
}
export async function GET(request:Request){
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in for your private consultation');
  const id=new URL(request.url).searchParams.get('operationId');
  if(!id)return Response.json(liveAvailability(auth.user.id),{headers});
  if(!z.uuid().safeParse(id).success)return fail(404,'Live call unavailable');
  const readiness=liveAvailability(auth.user.id);
  if(!readiness.available)return Response.json({error:readiness.reason,code:readiness.code},{status:503,headers});
  const operation=await auth.service.from('ai_operations').select('base_revision').eq('id',id).eq('user_id',auth.user.id).eq('kind','live').eq('state','running').maybeSingle();
  if(operation.error||!operation.data)return fail(404,'Live call unavailable');
  const context=await loadConsultationContext({service:auth.service,userId:auth.user.id,expectedRevision:operation.data.base_revision,mode:'voice'});
  const claim=await auth.service.rpc('claim_live_monitor',{p_user:auth.user.id,p_op:id});
  if(claim.error||!claim.data?.providerSessionId)return fail(409,'This live call already has a monitor or is unavailable');
  const answer=await auth.service.from('consultation_live_sessions').select('sdp_answer').eq('operation_id',id).eq('user_id',auth.user.id).maybeSingle();
  if(answer.error||typeof answer.data?.sdp_answer!=='string'){await closeLiveSession(process.env.OPENAI_API_KEY!,claim.data.providerSessionId);await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:id});return fail(503,'Live connection answer is unavailable')}
  const sdpAnswer=answer.data.sdp_answer;
  const encoder=new TextEncoder();
  const stream=new ReadableStream<Uint8Array>({async start(controller){try{await monitorLive({key:process.env.OPENAI_API_KEY!,service:auth.service,userId:auth.user.id,operationId:id,sessionId:claim.data.providerSessionId,startedAt:claim.data.startedAt,input:context.input,signal:request.signal,onEvent:event=>controller.enqueue(encoder.encode(JSON.stringify(event.type==='monitor.ready'?{...event,sdp:sdpAnswer}:event)+'\n'))})}finally{try{controller.close()}catch{/* Reader disconnected. */}}}});
  return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson','X-Accel-Buffering':'no'}});
 }catch{return fail(503,'Live monitoring unavailable')}
}
