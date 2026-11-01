import { createHash } from 'node:crypto';
import { z } from 'zod';
import { activeUser,body,fail,sameOrigin } from '@/lib/server/supabase';
import { requestText,ProviderError } from '@/lib/style/server/provider.mjs';
import { recordProviderUsage } from '@/lib/style/server/usage';
import { consultationAiReady,loadConsultationContext,CONSULTATION_INSTRUCTIONS,CONSULTATION_MODEL,CONSULTATION_MAX_OUTPUT_TOKENS } from '@/lib/consultation-provider';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
const inputSchema=z.object({idempotencyKey:z.uuid(),expectedRevision:z.number().int().nonnegative(),replyTo:z.uuid()}).strict();
const disabled=()=>Response.json({error:'Autonomous replies are not enabled. Your saved message is still available for the supervised consultation.',code:'autonomous_disabled'},{status:503,headers});
export async function GET(){
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to open your consultation');
  const scoped=!process.env.CONSULTATION_TEST_USER_ID||auth.user.id===process.env.CONSULTATION_TEST_USER_ID;
  const available=scoped&&consultationAiReady()&&process.env.CONSULTATION_AI_ENABLED==='true'&&process.env.CONSULTATION_VERIFIED_COST_BOUND==='true'&&!!process.env.OPENAI_API_KEY;
  return Response.json({available,model:CONSULTATION_MODEL,reason:available?null:'Autonomous replies are not enabled'},{headers});
 }catch{return fail(503,'Consultation readiness unavailable');}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to open your consultation');
  const parsed=inputSchema.safeParse(await body(request));if(!parsed.success)return fail(400,'Invalid reply request');
  if(process.env.CONSULTATION_TEST_USER_ID&&auth.user.id!==process.env.CONSULTATION_TEST_USER_ID)return disabled();
  if(!consultationAiReady()||process.env.CONSULTATION_AI_ENABLED!=='true'||process.env.CONSULTATION_VERIFIED_COST_BOUND!=='true'||!process.env.OPENAI_API_KEY)return disabled();
  const input=parsed.data;
  // A retry can arrive after its target was answered and the session revision
  // advanced. Return the existing operation rather than recomputing/dispatching.
  const existing=await auth.service.from('ai_operations').select('id,kind,state,base_revision,client_request_id').eq('user_id',auth.user.id).eq('idempotency_key',input.idempotencyKey).maybeSingle();
  if(existing.error)return fail(503,'Reply status unavailable');
  if(existing.data){
   if(existing.data.kind!=='dialogue'||existing.data.base_revision!==input.expectedRevision||existing.data.client_request_id!==input.replyTo)return fail(409,'This reply key belongs to a different request');
   const current=await auth.service.rpc('read_consultation',{p_user:auth.user.id});
   if(current.error||!current.data)return fail(503,'Saved reply status unavailable');
   return Response.json({consultation:current.data,operation:{id:existing.data.id,kind:existing.data.kind,state:existing.data.state}},{status:existing.data.state==='succeeded'?200:202,headers});
  }
  let context;
  try{context=await loadConsultationContext({service:auth.service,userId:auth.user.id,expectedRevision:input.expectedRevision,replyTo:input.replyTo});}
  catch(error){if(error instanceof Error&&['context_conflict','target_unavailable'].includes(error.message))return fail(409,'The conversation changed. Reload before requesting a reply');if(error instanceof Error&&error.message==='context_too_large')return fail(409,'This saved conversation exceeds the current bounded reply size. No call was made');return fail(503,'Saved consultation context unavailable');}
  const hash=createHash('sha256').update(JSON.stringify({context:context.inputHash,replyTo:input.replyTo,model:CONSULTATION_MODEL,maxOutputTokens:CONSULTATION_MAX_OUTPUT_TOKENS})).digest('hex');
  const reserved=await auth.service.rpc('reserve_consultation_operation',{p_user:auth.user.id,p_key:input.idempotencyKey,p_hash:hash,p_revision:input.expectedRevision,p_reply_to:input.replyTo,p_mode:'text'});
  if(reserved.error)return fail(503,'Reply reservation unavailable');
  if(reserved.data?.error==='budget')return fail(402,'The available consultation allowance has been used. Your saved messages remain available');
  if(['conflict','in_flight','invalid','answered'].includes(reserved.data?.error))return fail(409,'The reply request conflicts with the current consultation');
  if(reserved.data?.error)return fail(503,'Autonomous reply is unavailable');
  const operation=reserved.data.operation;
  if(!reserved.data.created)return Response.json({consultation:context.snapshot,operation},{status:operation.state==='succeeded'?200:202,headers});
  const uncertain=async()=>{try{await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:operation.id})}catch{/* Keep the reservation held. */}};
  let dispatch;
  try{dispatch=await auth.service.rpc('dispatch_style_operation',{p_user:auth.user.id,p_id:operation.id,p_lease_seconds:180});}
  catch{await uncertain();return fail(503,'Reply status is uncertain; its reservation remains held');}
  if(dispatch.error||typeof dispatch.data!=='boolean'){await uncertain();return fail(503,'Reply status is uncertain; its reservation remains held');}
  if(!dispatch.data){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'failed_before_dispatch'});return fail(409,'The consultation changed before dispatch');}
  try{
   const response=await requestText({key:process.env.OPENAI_API_KEY,instructions:CONSULTATION_INSTRUCTIONS,input:context.input,images:context.images,maxOutputTokens:CONSULTATION_MAX_OUTPUT_TOKENS});
   await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,action:'dialogue',response});
   const saved=await auth.service.rpc('append_provider_reply',{p_user:auth.user.id,p_op:operation.id,p_reply_to:input.replyTo,p_revision:input.expectedRevision,p_text:response.text,p_user_text:null,p_board:null});
   if(saved.error||saved.data?.error){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'rejected_result'});return fail(409,'The reply could not be applied to the changed consultation');}
   const settled=await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'succeeded'});
   if(settled.error||settled.data!==true)return fail(503,'Reply saved; allowance reconciliation is pending');
   return Response.json({consultation:saved.data.consultation,operation:{...operation,state:'succeeded'}},{headers});
  }catch(error){
   if(error instanceof ProviderError&&'model' in error){try{await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,action:'dialogue',response:error})}catch{/* Unknown usage never becomes zero. */}}
   await uncertain();return fail(503,'The reply status is uncertain. Its reservation is held; no automatic retry was made');
  }
 }catch{return fail(503,'Autonomous reply unavailable');}
}
