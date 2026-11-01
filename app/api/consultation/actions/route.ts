import {createHash} from 'node:crypto';
import {z} from 'zod';
import {activeUser,body,fail,sameOrigin} from '@/lib/server/supabase';
import {resolveConsultationOutput} from '@/lib/consultation-output';
import {consultationAiReady,loadConsultationContext,normaliseConsultationImage} from '@/lib/consultation-provider';
import {requestText,ProviderError} from '@/lib/style/server/provider.mjs';
import {recordProviderUsage} from '@/lib/style/server/usage';
import {paidAccountInScope} from '@/lib/paid-release';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
const inputSchema=z.object({action:z.enum(['reject_all','request_revision','approve','editorial']),idempotencyKey:z.uuid(),expectedRevision:z.number().int().nonnegative(),outputId:z.string().min(1).max(200),documentRevision:z.string().regex(/^[a-f0-9]{64}$/),feedback:z.string().max(12000).optional()}).strict();
export async function GET(){
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to your consultation');const result=await auth.service.rpc('read_consultation_actions',{p_user:auth.user.id});if(result.error)return fail(503,'Saved actions unavailable');return Response.json({actions:result.data},{headers});}catch{return fail(503,'Saved actions unavailable');}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to your consultation');
  const parsed=inputSchema.safeParse(await body(request));if(!parsed.success)return fail(400,'Choose a current style sheet and action');const input=parsed.data;
  let output;
  try{output=await resolveConsultationOutput({service:auth.service,userId:auth.user.id,outputId:input.outputId,documentRevision:input.documentRevision})}catch(error){return fail(error instanceof Error&&error.message==='output_changed'?409:404,'The owned output is unavailable or changed. Review it before continuing')}
  const board=output.board,hash=output.documentRevision;
  const payloadHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const created=await auth.service.rpc('create_consultation_action',{p_user:auth.user.id,p_id:input.idempotencyKey,p_kind:input.action,p_revision:input.expectedRevision,p_output_id:input.outputId,p_output_hash:hash,p_payload_hash:payloadHash,p_feedback:input.feedback??''});
  if(created.error)return fail(503,'Could not confirm the saved action. Retry with the same key');
  if(created.data?.error)return fail(409,created.data.error==='pending'?'Wait for the stylist reply before this action':created.data.error==='approval'?'Explicit current approval is required':'The consultation changed. Reload before continuing');
  if(input.action!=='editorial'||created.data.action.status==='succeeded')return Response.json(created.data,{headers});
  if(!paidAccountInScope(auth.user.id,process.env.CONSULTATION_TEST_USER_ID)||!consultationAiReady()||process.env.CONSULTATION_AI_ENABLED!=='true'||process.env.CONSULTATION_VERIFIED_COST_BOUND!=='true'||!process.env.OPENAI_API_KEY)return Response.json({...created.data,error:'Editorial request saved. Autonomous dispatch is not enabled.',code:'autonomous_disabled'},{status:503,headers});
  const context=await loadConsultationContext({service:auth.service,userId:auth.user.id,expectedRevision:input.expectedRevision,mode:'voice'});
  const imageFile=await auth.service.storage.from('private-media').download(output.assetPath);
  if(imageFile.error||!imageFile.data||imageFile.data.size>10485760)return fail(409,'The approved sheet image is unavailable; no editorial call was made');
  const image=await normaliseConsultationImage(new Uint8Array(await imageFile.data.arrayBuffer()));
  const imageHash=createHash('sha256').update(image).digest('hex');
  const images:Uint8Array[]=[image];
  const visualImages=[{imageIndex:1,role:'approved-generated-style-sheet',sha256:imageHash,limits:'Garments/rendering only; never body evidence.'}];
  const visualGaps:string[]=[];
  const profile=await auth.service.from('profiles').select('id,document').eq('user_id',auth.user.id).maybeSingle();
  const reference=z.uuid().safeParse(profile.data?.document.referencePhotoId);
  const photos=z.array(z.object({id:z.uuid()}).passthrough()).safeParse(profile.data?.document.photos??[]);
  if(profile.data&&reference.success&&photos.success&&photos.data.some(photo=>photo.id===reference.data)){
   const original=await auth.service.from('media').select('object_path').eq('id',reference.data).eq('user_id',auth.user.id).eq('profile_id',profile.data.id).eq('status','ready').eq('kind','colour_portrait').maybeSingle();
   try{if(!original.data||original.error)throw new Error('reference');const file=await auth.service.storage.from('private-media').download(original.data.object_path);if(file.error||!file.data||file.data.size>10485760)throw new Error('reference');const bytes=await normaliseConsultationImage(new Uint8Array(await file.data.arrayBuffer()));images.push(bytes);visualImages.push({imageIndex:2,role:'owned-original-reference',sha256:createHash('sha256').update(bytes).digest('hex'),limits:'Only visible regions; framing/full-body coverage unconfirmed. No new body classification or measurements.'});}catch{visualGaps.push('Original reference unavailable; do not imply it was inspected.')}
  }else visualGaps.push('No selected original reference in this profile photo list.');

  const reserved=await auth.service.rpc('start_consultation_editorial',{p_user:auth.user.id,p_action:input.idempotencyKey,p_key:input.idempotencyKey,p_hash:createHash('sha256').update(context.inputHash+hash+JSON.stringify(visualImages)).digest('hex')});
  if(reserved.error)return fail(503,'Editorial reservation unavailable');
  if(reserved.data?.error)return Response.json({...created.data,error:reserved.data.error==='budget'?'Available editorial allowance is exhausted':'Editorial is unavailable for the current approval or price configuration'},{status:reserved.data.error==='budget'?402:409,headers});
  const operation=reserved.data.operation;
  // Link the durable reservation before dispatch so a crash/uncertain call is
  // visible through this job rather than looking like an unstarted request.
  const linked=await auth.service.from('consultation_actions').update({operation_id:operation.id}).eq('id',input.idempotencyKey).eq('user_id',auth.user.id).eq('status','pending').select('id').maybeSingle();
  if(linked.error||(reserved.data.created&&!linked.data)){
   if(reserved.data.created)await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'failed_before_dispatch'});
   return fail(503,'Editorial reservation could not be linked to its saved job');
  }
  if(!reserved.data.created)return Response.json({...created.data,operation},{status:202,headers});
  const uncertain=async()=>{await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:operation.id});await auth.service.from('consultation_actions').update({status:'uncertain'}).eq('id',input.idempotencyKey).eq('user_id',auth.user.id).eq('operation_id',operation.id)};
  let dispatch;
  try{dispatch=await auth.service.rpc('dispatch_style_operation',{p_user:auth.user.id,p_id:operation.id,p_lease_seconds:180});}catch{await uncertain();return fail(503,'Editorial status uncertain; reservation held');}
  if(dispatch.error||typeof dispatch.data!=='boolean'){await uncertain();return fail(503,'Editorial status uncertain; reservation held');}
  if(!dispatch.data){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'failed_before_dispatch'});return fail(409,'Approval changed before dispatch');}
  const claimed=await auth.service.rpc('claim_consultation_action',{p_user:auth.user.id,p_action:input.idempotencyKey,p_op:operation.id});
  if(claimed.error||claimed.data?.error){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'rejected_result'});return fail(409,'The approved consultation changed');}
  try{
   const response=await requestText({key:process.env.OPENAI_API_KEY,instructions:'Write a joyful, specific personal style editorial grounded ONLY in this explicitly approved whole style sheet and the saved user words. Inspect the attached actual sheet for garment effects; do not assume its desired prompt was achieved. Generated illustrations are never body evidence. Preserve hard practical bans and loved details. Explain useful construction combinations, exceptions and uncertainty. No new body/colour/personality classification, no invented wardrobe, retailers, prices or stock, and no claim of a new image. Approval is already verified by the application for this exact sheet/hash/revision. Return plain text: an evocative short title, a concise personal story and useful style principles. Keep under 450 words.',input:{...context.input,operation:'approved-whole-sheet-editorial',approvedWholeSheet:board,visualEvidence:{images:visualImages,gaps:visualGaps}},images,maxOutputTokens:2000});
   await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,action:'editorial',response});
   const finished=await auth.service.rpc('finish_consultation_action',{p_user:auth.user.id,p_action:input.idempotencyKey,p_op:operation.id,p_result:response.text,p_asset_path:null});
   if(finished.error||finished.data?.error){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'rejected_result'});return fail(409,'Editorial was not applied because approval changed');}
   const settled=await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'succeeded'});
   if(settled.error||settled.data!==true)return fail(503,'Editorial saved; allowance reconciliation pending');
   return Response.json(finished.data,{headers});
  }catch(error){
   if(error instanceof ProviderError&&'model' in error){try{await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,action:'editorial',response:error})}catch{}}
   await uncertain();return fail(503,'Editorial status uncertain. Saved approval remains; reservation held');
  }
 }catch{return fail(503,'Consultation action unavailable');}
}
