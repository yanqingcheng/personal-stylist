import{createHash}from'node:crypto';
import{z}from'zod';
import{activeUser,body,fail,sameOrigin}from'@/lib/server/supabase';
import{resolveConsultationOutput}from'@/lib/consultation-output';
import{consultationAiReady,loadConsultationContext,normaliseConsultationImage}from'@/lib/consultation-provider';
import{EDITORIAL_LAYOUT_VERSION,requestEditorialLayout,validateEditorialSpread}from'@/lib/consultation-editorial-layout';
import{recordProviderUsage}from'@/lib/style/server/usage';
import{ProviderError}from'@/lib/style/server/provider.mjs';
export const maxDuration=180;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
const sourceSchema=z.object({editorialActionId:z.uuid(),outputId:z.string().min(1).max(200),documentRevision:z.string().regex(/^[a-f0-9]{64}$/),expectedRevision:z.coerce.number().int().nonnegative()}).strict();
const postSchema=sourceSchema.extend({idempotencyKey:z.uuid()}).strict();
type Auth=NonNullable<Awaited<ReturnType<typeof activeUser>>>;
function available(userId:string){return process.env.EDITORIAL_LAYOUT_ENABLED==='true'&&consultationAiReady()&&process.env.CONSULTATION_AI_ENABLED==='true'&&process.env.CONSULTATION_VERIFIED_COST_BOUND==='true'&&!!process.env.OPENAI_API_KEY&&(!process.env.CONSULTATION_TEST_USER_ID||process.env.CONSULTATION_TEST_USER_ID===userId)}
async function approvedSource(auth:Auth,input:z.infer<typeof sourceSchema>){
 const action=await auth.service.from('consultation_actions').select('id,result').eq('id',input.editorialActionId).eq('user_id',auth.user.id).eq('kind','editorial').eq('status','succeeded').maybeSingle();
 if(action.error||!action.data?.result)throw Error('editorial_unavailable');
 const textHash=createHash('sha256').update(action.data.result).digest('hex');
 const checked=await auth.service.rpc('editorial_layout_approval_current',{p_user:auth.user.id,p_action:input.editorialActionId,p_revision:input.expectedRevision,p_output:input.outputId,p_output_hash:input.documentRevision,p_editorial_hash:textHash});
 if(checked.error||checked.data!==true)throw Error('approval_changed');
 const output=await resolveConsultationOutput({service:auth.service,userId:auth.user.id,outputId:input.outputId,documentRevision:input.documentRevision});
 return{output,text:action.data.result as string,textHash};
}
async function present(auth:Auth,input:z.infer<typeof sourceSchema>,source:Awaited<ReturnType<typeof approvedSource>>,id?:string){
 let query=auth.service.from('consultation_editorial_layouts').select('id,status,layout').eq('user_id',auth.user.id).eq('editorial_action_id',input.editorialActionId).eq('output_id',input.outputId).eq('output_hash',input.documentRevision).eq('base_revision',input.expectedRevision);
 if(id)query=query.eq('id',id);
 const saved=await query.order('created_at',{ascending:false}).limit(1).maybeSingle();if(saved.error)throw Error('layout_unavailable');
 const signed=await auth.service.storage.from('private-media').createSignedUrl(source.output.assetPath,300);if(signed.error)throw Error('sheet_unavailable');
 const layout=saved.data?.status==='succeeded'?validateEditorialSpread(saved.data.layout,source.output.board.options.map(option=>option.id)):null;
 return{available:available(auth.user.id),reason:available(auth.user.id)?null:'Illustrated editorials are not enabled for this account or environment.',result:saved.data?{id:saved.data.id,status:saved.data.status,layout,approvedSheetUrl:signed.data.signedUrl,outputId:input.outputId,documentRevision:input.documentRevision}:null};
}
export async function GET(request:Request){
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to open your illustrated editorial');const parsed=sourceSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return fail(400,'Choose the current approved sheet and its saved editorial');const source=await approvedSource(auth,parsed.data);return Response.json(await present(auth,parsed.data,source),{headers});}catch{return fail(409,'The approved sheet or saved editorial changed. Review the current direction before illustrating it.');}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to illustrate your editorial');const parsed=postSchema.safeParse(await body(request));if(!parsed.success)return fail(400,'Choose the current approved sheet and its saved editorial');const input=parsed.data;
  if(!available(auth.user.id))return Response.json({error:'Illustrated editorials are not enabled for this account or environment.',code:'editorial_layout_disabled'},{status:503,headers});
  const source=await approvedSource(auth,input),context=await loadConsultationContext({service:auth.service,userId:auth.user.id,expectedRevision:input.expectedRevision,mode:'voice'});
  const file=await auth.service.storage.from('private-media').download(source.output.assetPath);if(file.error||!file.data||file.data.size>10485760)return fail(409,'The approved sheet image is unavailable. No illustration call was made.');
  const image=await normaliseConsultationImage(new Uint8Array(await file.data.arrayBuffer())),imageHash=createHash('sha256').update(image).digest('hex');
  const evidence={operation:'illustrate-saved-approved-editorial',savedEditorial:source.text,approvedLooks:source.output.board.options,profileReports:context.input.profileReports,styleIntakeReports:context.input.styleIntakeReports,bodyReference:context.input.bodyReference,visualEvidence:{images:[{imageIndex:1,role:'approved-generated-style-sheet',sha256:imageHash,limits:'Garments and rendering only, never body evidence. No original body/face pixels attached.'}]}};
  if(Buffer.byteLength(JSON.stringify(evidence))>64000)return fail(409,'This saved editorial exceeds the bounded illustration context. No call was made.');
  const hash=createHash('sha256').update(JSON.stringify({input,version:EDITORIAL_LAYOUT_VERSION,textHash:source.textHash,imageHash,contextHash:context.inputHash})).digest('hex');
  const started=await auth.service.rpc('start_editorial_layout',{p_user:auth.user.id,p_id:input.idempotencyKey,p_action:input.editorialActionId,p_revision:input.expectedRevision,p_output:input.outputId,p_output_hash:input.documentRevision,p_editorial_hash:source.textHash,p_payload_hash:hash});
  if(started.error)return fail(503,'Illustrated editorial reservation unavailable');if(started.data?.error)return fail(started.data.error==='budget'?402:409,started.data.error==='budget'?'Available editorial allowance is exhausted.':'Current approval, saved text or request status prevents illustration.');
  if(!started.data?.created)return Response.json(await present(auth,input,source,input.idempotencyKey),{status:started.data?.status==='succeeded'?200:202,headers});
  const operationId=started.data.operationId;
  const uncertain=async()=>{await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:operationId});await auth.service.from('consultation_editorial_layouts').update({status:'uncertain',updated_at:new Date().toISOString()}).eq('id',input.idempotencyKey).eq('user_id',auth.user.id)};
  let dispatched;
  try{dispatched=await auth.service.rpc('dispatch_editorial_layout',{p_user:auth.user.id,p_id:input.idempotencyKey})}catch{await uncertain();return fail(503,'Illustration dispatch is uncertain; its reservation remains held.');}
  if(dispatched.error||typeof dispatched.data!=='boolean'){await uncertain();return fail(503,'Illustration dispatch is uncertain; its reservation remains held.');}
  if(!dispatched.data){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operationId,p_outcome:'failed_before_dispatch'});await auth.service.from('consultation_editorial_layouts').update({status:'failed'}).eq('id',input.idempotencyKey).eq('user_id',auth.user.id);return fail(409,'Approval changed before illustration. No call was made.');}
  let published=false;
  try{
   const planned=await requestEditorialLayout({key:process.env.OPENAI_API_KEY!,input:evidence,image,lookIds:source.output.board.options.map(option=>option.id)});
   await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId,action:'editorial',response:planned.response});
   const layout=planned.parse();
   const finished=await auth.service.rpc('finish_editorial_layout',{p_user:auth.user.id,p_id:input.idempotencyKey,p_layout:layout});if(finished.error||finished.data!==true)throw Error('Approval changed before publication');published=true;
   const settled=await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operationId,p_outcome:'succeeded'});if(settled.error||settled.data!==true)return fail(503,'Illustrated editorial saved; accounting reconciliation is pending.');
   return Response.json(await present(auth,input,source,input.idempotencyKey),{headers});
  }catch(error){if(published){await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:operationId});return fail(503,'Illustrated editorial saved. Refresh its status; any unresolved accounting remains held.');}if(error instanceof ProviderError&&'model'in error){try{await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId,action:'editorial',response:error})}catch{/* Unknown usage remains held. */}}await uncertain();return fail(503,'Illustration outcome is uncertain. Its reservation remains held; no retry was sent.');}
 }catch{return fail(409,'The approved sheet or saved editorial is unavailable or changed. No new layout was published.');}
}
