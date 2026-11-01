import { createHash } from 'node:crypto';
import { z } from 'zod';
import { activeUser, fail, sameOrigin } from '@/lib/server/supabase';
import { CONSULTATION_INSTRUCTIONS, loadConsultationContext, consultationAiReady } from '@/lib/consultation-provider';
import { voiceAvailability, validateVoiceWav, transcribeVoice, spokenConsultationReply, recordVoiceUsage, VoiceProviderError, VOICE_PRICING_VERSION } from '@/lib/consultation-voice';

export const maxDuration=300;
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
const metadata=z.object({idempotencyKey:z.uuid(),expectedRevision:z.coerce.number().int().nonnegative(),activeBoardId:z.string().min(1).max(200).nullable()}).strict();

export async function GET(){
  try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to use your private consultation');return Response.json(voiceAvailability(),{headers})}
  catch{return fail(503,'Voice is unavailable. Continue in the text conversation.')}
}

export async function POST(request:Request){
  if(!sameOrigin(request))return fail(403,'Forbidden');
  try{
    const auth=await activeUser();if(!auth)return fail(401,'Sign in to use your private consultation');
    if(Number(request.headers.get('content-length')||0)>1_050_000)return fail(413,'Keep each spoken message under 30 seconds');
    const form=await request.formData();
    const parsed=metadata.safeParse({idempotencyKey:form.get('idempotencyKey'),expectedRevision:form.get('expectedRevision'),activeBoardId:form.get('activeBoardId')});
    const audio=form.get('audio');
    if(!parsed.success||!(audio instanceof File)||audio.size>960044||audio.type!=='audio/wav')return fail(400,'Use the consultation microphone to record up to 30 seconds');
    let wav:Buffer;
    try{wav=validateVoiceWav(new Uint8Array(await audio.arrayBuffer()))}catch{return fail(400,'Use the consultation microphone to record up to 30 seconds')}
    // No paid work or ledger mutation before explicit prompt/budget release.
    if(!voiceAvailability().available||!consultationAiReady())return Response.json({error:'Voice replies are awaiting release. Continue in the saved text conversation.',code:'voice_release_blocked'},{status:503,headers});
    const input=parsed.data;
    const context=await loadConsultationContext({service:auth.service,userId:auth.user.id,expectedRevision:input.expectedRevision,mode:'voice'});
    const hash=createHash('sha256').update(wav).update(JSON.stringify({inputHash:context.inputHash,board:input.activeBoardId,pricingVersion:VOICE_PRICING_VERSION})).digest('hex');
    const reserved=await auth.service.rpc('reserve_consultation_operation',{p_user:auth.user.id,p_key:input.idempotencyKey,p_hash:hash,p_revision:input.expectedRevision,p_reply_to:input.idempotencyKey,p_mode:'voice'});
    if(reserved.error)return fail(503,'Voice preparation unavailable');
    if(reserved.data?.error==='budget')return fail(402,'Your available voice allowance has been used');
    if(reserved.data?.error)return fail(409,'Your conversation changed. Reload it before recording another message');
    const operation=reserved.data?.operation;if(!operation?.id)return fail(503,'Voice preparation unavailable');
    if(!reserved.data.created)return Response.json({operation,replayed:true},{headers});
    const uncertain=async()=>{try{await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:operation.id})}catch{/* Reservation remains held. */}};
    let dispatched;
    try{dispatched=await auth.service.rpc('dispatch_style_operation',{p_user:auth.user.id,p_id:operation.id,p_lease_seconds:900})}
    catch{await uncertain();return fail(503,'Voice request status is uncertain; do not automatically retry')}
    if(dispatched.error||(dispatched.data!==true&&dispatched.data!==false)){await uncertain();return fail(503,'Voice request status is uncertain; do not automatically retry')}
    if(!dispatched.data){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'failed_before_dispatch'});return fail(503,'Voice preparation is unavailable')}
    try{
      const transcript=await transcribeVoice({key:process.env.OPENAI_API_KEY!,wav});
      await recordVoiceUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,stage:'transcription',response:transcript});
      const reply=await spokenConsultationReply({key:process.env.OPENAI_API_KEY!,transcript:transcript.text,instructions:CONSULTATION_INSTRUCTIONS,input:{...context.input,activeBoardId:input.activeBoardId}});
      await recordVoiceUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,stage:'reply',response:reply});
      const appended=await auth.service.rpc('append_provider_reply',{p_user:auth.user.id,p_op:operation.id,p_reply_to:input.idempotencyKey,p_revision:input.expectedRevision,p_text:reply.text,p_user_text:transcript.text,p_board:input.activeBoardId});
      if(appended.error||appended.data?.error||!appended.data?.consultation)throw new Error('Spoken exchange could not be saved');
      const settled=await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'succeeded'});
      if(settled.error||settled.data!==true){await uncertain();return fail(503,'Your spoken exchange is saved; accounting reconciliation is pending')}
      return Response.json({consultation:appended.data.consultation,audioBase64:reply.audioBase64,contentType:reply.contentType,transcript:transcript.text,reply:reply.text},{headers});
    }catch(error){
      if(error instanceof VoiceProviderError){try{await recordVoiceUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,stage:error.stage,response:error})}catch{/* Usage remains explicitly unknown. */}}
      await uncertain();return fail(503,'Voice request status is uncertain; its reservation is held. Do not automatically retry');
    }
  }catch{return fail(503,'Voice is unavailable. Continue in the saved text conversation.')}
}
