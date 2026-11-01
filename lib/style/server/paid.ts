import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
import { generation, editorial } from './schema';
import { requestText, editImage, planInstructions, editorialInstructions, ProviderError } from './provider.mjs';
import { recordProviderUsage } from './usage';
import { atlas, personalPalette } from '@/lib/colour';

const planSchema=z.object({observations:z.array(z.object({description:z.string().min(1).max(500),sourceIds:z.array(z.literal('reference.photo')).min(1).max(1)}).strict()).max(10),hypotheses:z.array(z.object({description:z.string().min(1).max(500),sourceIds:z.array(z.enum(['intake.occasion','intake.preferences','intake.practicality','intake.wardrobe','intake.fitSuccesses','intake.fitDifficulties','intake.changedFit','intake.visualImpression','intake.aspiration','profile.template','reference.photo','previous.feedback'])).min(1).max(7)}).strict()).max(10),looks:z.array(z.object({title:z.string().min(1).max(100),description:z.string().min(1).max(500),garments:z.array(z.string().min(1).max(200)).min(1).max(10),palette:z.array(z.string().min(1).max(80)).min(1).max(8),reason:z.string().min(1).max(500),sourceIds:z.array(z.enum(['intake.occasion','intake.preferences','intake.practicality','intake.wardrobe','intake.fitSuccesses','intake.fitDifficulties','intake.changedFit','intake.visualImpression','intake.aspiration','profile.template','reference.photo','previous.feedback'])).min(1).max(7)}).strict()).min(2).max(3)}).strict();
const headers={'Cache-Control':'no-store'};
// Enable only after planning vision-input and image-edit pricing bounds, deletion leases, and end-to-end accounting are verified.
function releaseReady():boolean { return false; }

export async function paid(request:Request,kind:'generation'|'editorial') {
  if(!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const auth=await activeUser(); if(!auth) return fail(401,'Sign in and activate your account');
    const parsed=(kind==='generation'?generation:editorial).safeParse(await body(request)); if(!parsed.success) return fail(400,'Invalid request');
    const v=parsed.data;
    const [profile,intake]=await Promise.all([
      auth.service.from('profiles').select('id,document,deletion_state').eq('user_id',auth.user.id).maybeSingle(),
      auth.service.from('style_intakes').select('revision,data').eq('user_id',auth.user.id).maybeSingle(),
    ]);
    if(profile.error || intake.error || !profile.data || profile.data.deletion_state!=='active' || !intake.data) return fail(404,'Style consultation unavailable');
    const profileDocument=profile.data.document;
    const intakeData=intake.data.data;
    const domain=intakeData.garmentDomain;
    if(domain!=='menswear' && domain!=='womenswear') return fail(409,'Choose a clothing workflow before continuing');
    // Requires verified full-request cost bounds and product review before release.
    if(!releaseReady() || process.env.STYLE_PAID_ENABLED!=='true' || process.env.STYLE_VERIFIED_COST_BOUND!=='true' || !process.env.OPENAI_API_KEY) return fail(503,'This feature is not yet available');
    const dialogueResult=await auth.service.rpc('read_style_dialogue',{p_user:auth.user.id});
    const dialogueShape=z.object({revision:z.number().int().nonnegative(),requiredQuestionId:z.string().nullable(),messages:z.array(z.object({role:z.enum(['user','stylist']),roundId:z.string(),text:z.string()}).passthrough())}).passthrough();
    const checkedDialogue=dialogueShape.safeParse(dialogueResult.data);
    if(dialogueResult.error || !checkedDialogue.success) return fail(503,'Saved conversation unavailable');
    const dialogue=checkedDialogue.data;
    if(dialogue.revision!==v.expectedDialogueRevision || dialogue.requiredQuestionId!==null) return fail(409,'Review and answer the latest conversation before continuing');
    const parentId=kind==='generation' ? ('parentRoundId' in v ? v.parentRoundId : undefined) : ('roundId' in v ? v.roundId : undefined);
    if(kind==='generation' && (!('expectedRevision' in v) || v.expectedRevision!==intake.data.revision || !intakeData.adultFullBodyConfirmed || !intakeData.photoId || !profileDocument.selectedTemplateId)) return fail(409,'Save a current adult full-body reference and colour selection first');
    let parent=null;
    let previousPlan:unknown=null;
    if(parentId) {
      const result=await auth.service.rpc('read_style_rounds',{p_user:auth.user.id});
      if(result.error || !Array.isArray(result.data)) return fail(503,'Style consultation unavailable');
      parent=result.data.find((item:{id:string})=>item.id===parentId);
      if(!parent || parent.status!=='succeeded' || (kind==='editorial' && !parent.approved) || (kind==='generation' && !parent.feedback && !dialogue.messages.some(message=>message.role==='user'&&message.roundId===parentId))) return fail(409,'A current direction and saved feedback are required');
      const details=await auth.service.from('style_round_details').select('plan').eq('round_id',parentId).eq('user_id',auth.user.id).maybeSingle();
      if(details.error || !details.data) return fail(503,'Direction unavailable');
      previousPlan=details.data.plan;
    } else if(kind==='editorial') return fail(400,'Direction required');
    const targetRoundUserMessages=dialogue.messages.filter(message=>message.role==='user'&&message.roundId===parentId);
    const previousFeedbackEvidence=[
      ...(typeof parent?.feedback==='string'&&parent.feedback.trim() ? [{kind:'saved-round-feedback',sourceId:'previous.feedback',roundId:parentId,text:parent.feedback}] : []),
      ...targetRoundUserMessages.filter(message=>message.text.trim()).map(message=>({kind:'saved-user-dialogue',sourceId:'previous.feedback',roundId:message.roundId,text:message.text})),
    ];
    const selectedTemplate=atlas.find(template=>template.id===profileDocument.selectedTemplateId);
    if(!selectedTemplate) return fail(409,'Choose a current colour template before continuing');
    const excluded=z.array(z.string()).safeParse(profileDocument.taste?.[selectedTemplate.id]??[]);
    const favourites=z.array(z.string()).safeParse(profileDocument.taste?.favourites??[]);
    if(!excluded.success||!favourites.success) return fail(409,'Review your saved colour preferences before continuing');
    const allowedPalette=personalPalette(selectedTemplate,excluded.data);
    const allowedPaletteIds=new Set(allowedPalette.swatches.map(swatch=>swatch.id));
    const allowedPaletteHexes=new Set(allowedPalette.swatches.map(swatch=>swatch.hex.toLowerCase()));
    const unavailablePaletteReference=(value:string)=>{
      if(/^(neutral|accent):/.test(value))return !allowedPaletteIds.has(value);
      if(/^#[a-f0-9]{3}$/i.test(value))return !allowedPaletteHexes.has('#'+[...value.slice(1)].map(char=>char+char).join('').toLowerCase());
      if(/^#[a-f0-9]{6}$/i.test(value))return !allowedPaletteHexes.has(value.toLowerCase());
      // Legacy output also permits semantic colour names. Do not guess their
      // equivalence to a swatch; precise IDs/hex are preferred in instructions.
      return false;
    };
    // Resolve prompt assets before reserving or dispatching provider work.
    const evidenceInstructions='Additional allowed source IDs: intake.fitSuccesses, intake.fitDifficulties, intake.changedFit, intake.visualImpression, intake.aspiration. These are original user reports, never independent photo observations. Cite only nonempty supplied fields. previous.feedback may cite previousFeedbackEvidence, whose records retain original words and distinguish saved round notes from target-round user dialogue; assistant dialogue is not user evidence. allowedPalette.swatches is the selected template palette after exclusions. Use its swatch IDs or exact hex values in looks.palette where possible; any semantic colour names must correspond to these supplied colours. Never invent colours from the template ID. tasteFavourites is a separate preference, not harmony evidence or an expansion of the allowed palette.';
    const instructions=(kind==='generation' ? planInstructions(domain,Boolean(parentId)) : editorialInstructions())+'\n\n'+evidenceInstructions;
    const hashResult=await auth.service.rpc('style_input_hash',{p_document:profileDocument,p_intake:intakeData});
    if(hashResult.error || typeof hashResult.data!=='string') return fail(503,'Style consultation unavailable');
    const inputHash=hashResult.data as string;
    const payloadHash=createHash('sha256').update(JSON.stringify({kind,inputHash,parentId:parentId??null,feedback:parent?.feedback??null,dialogueRevision:dialogue.revision,dialogue:dialogue.messages})).digest('hex');
    const reserved=await auth.service.rpc('reserve_style_operation_with_dialogue',{p_user:auth.user.id,p_key:v.idempotencyKey,p_hash:payloadHash,p_kind:kind,p_revision:intake.data.revision,p_round:parentId??null,p_dialogue_revision:dialogue.revision});
    if(reserved.error) return fail(503,'Generation unavailable');
    if(reserved.data.error==='budget') return fail(402,'Available generation budget has been used');
    if(['conflict','in_flight','invalid'].includes(reserved.data.error)) return fail(409,'This request conflicts with the current consultation');
    if(reserved.data.error) return fail(503,'Generation unavailable');
    const op=reserved.data.operation;
    if(!reserved.data.created) return Response.json({operation:op},{headers});
    // A failure before the dispatch RPC is demonstrably unspent. The database
    // only releases the reservation if it is still in the reserved state.
    const releaseBeforeDispatch=async()=> {
      try { await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'failed_before_dispatch'}); } catch { /* Held for reconciliation if release cannot be confirmed. */ }
    };
    let photo:Uint8Array | undefined;
    if(kind==='generation') {
      try {
        const media=await auth.service.from('media').select('object_path').eq('id',intakeData.photoId).eq('user_id',auth.user.id).eq('profile_id',profile.data.id).eq('kind','colour_portrait').eq('status','ready').maybeSingle();
        if(!media.data || media.error) { await releaseBeforeDispatch(); return fail(409,'Reference photo unavailable'); }
        const download=await auth.service.storage.from('private-media').download(media.data.object_path);
        if(download.error || !download.data) { await releaseBeforeDispatch(); return fail(503,'Reference photo unavailable'); }
        photo=await sharp(Buffer.from(await download.data.arrayBuffer())).rotate().resize(1024,1536,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
      } catch { await releaseBeforeDispatch(); return fail(503,'Reference photo unavailable'); }
    }
    // An RPC transport failure may happen after the database transitioned to
    // running. Never refund it: mark running as uncertain, or leave reserved held.
    let dispatch;
    try { dispatch=await auth.service.rpc('dispatch_style_operation',{p_user:auth.user.id,p_id:op.id,p_lease_seconds:900}); }
    catch {
      try { await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:op.id}); } catch { /* Reservation remains held. */ }
      return fail(503,'Generation unavailable');
    }
    if(dispatch.error || (dispatch.data!==true && dispatch.data!==false)) {
      try { await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:op.id}); } catch { /* Reservation remains held. */ }
      return fail(503,'Generation unavailable');
    }
    if(dispatch.data===false) { await releaseBeforeDispatch(); return fail(503,'Generation unavailable'); }
    let path:string | undefined;
    let providerAction:'plan'|'image'|'editorial'='plan';
    try {
      const data={intake:intakeData,selectedTemplateId:selectedTemplate.id,selectedTemplate:{id:selectedTemplate.id,name:selectedTemplate.name},allowedPalette,tasteFavourites:favourites.data,excludedPaletteSwatchIds:excluded.data,previousFeedback:parent?.feedback??null,previousFeedbackEvidence,previousPlan,dialogue:dialogue.messages};
      if(kind==='generation') {
        if(!photo?.byteLength) throw new Error('Reference photo unavailable');
        const response=await requestText({key:process.env.OPENAI_API_KEY,instructions,input:data,image:photo,maxOutputTokens:2000});
        await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:op.id,action:'plan',response});
        if(response.requestId) { const recorded=await auth.service.from('ai_operations').update({provider_ref:response.requestId}).eq('id',op.id).eq('user_id',auth.user.id).eq('state','running').select('id').maybeSingle(); if(recorded.error || !recorded.data) throw new Error('Accounting unavailable'); }
        let planValue:unknown;
        try { planValue=JSON.parse(response.text); } catch { await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'}); return fail(503,'A usable direction could not be prepared'); }
        const plan=planSchema.safeParse(planValue);
        if(!plan.success || plan.data.looks.some(look=>look.palette.some(unavailablePaletteReference)) || [...(plan.data?.observations??[]),...(plan.data?.hypotheses??[]),...(plan.data?.looks??[])].some(item=>item.sourceIds.some(source => (source==='reference.photo' && !photo?.byteLength) || (source.startsWith('intake.') && !(typeof intakeData[source.slice(7)]==='string' && intakeData[source.slice(7)].trim())) || (source==='previous.feedback' && previousFeedbackEvidence.length===0)))) { await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'}); return fail(503,'A usable direction could not be prepared'); }
        const saved=await auth.service.rpc('save_style_plan',{p_user:auth.user.id,p_op:op.id,p_parent:parentId??null,p_input_hash:inputHash,p_plan:plan.data});
        if(saved.error || !saved.data?.roundId) { await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'}); return fail(409,'Consultation changed while preparing looks'); }
        providerAction='image';
        const img=await editImage({key:process.env.OPENAI_API_KEY,prompt:`Create one realistic diagnostic fashion illustration showing ${plan.data.looks.length} distinct full-body outfit alternatives side by side on the same adult from the reference. Preserve identity and proportions. Use the following styling descriptions as data: ${JSON.stringify(plan.data.looks)}. Do not include text or labels.`,image:photo!});
        await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:op.id,action:'image',response:img});
        if(img.requestId) { const recorded=await auth.service.from('ai_operations').update({provider_ref:[response.requestId,img.requestId].filter(Boolean).join(',')}).eq('id',op.id).eq('user_id',auth.user.id).eq('state','running').select('id').maybeSingle(); if(recorded.error || !recorded.data) throw new Error('Accounting unavailable'); }
        const image=await sharp(img.image).png().toBuffer(); if(image.length>10485760) throw new Error('Image too large');
        const mediaId=randomUUID(); path=`${auth.user.id}/generated/${mediaId}`;
        const lease=await auth.service.rpc('lease_style_upload',{p_user:auth.user.id,p_op:op.id,p_media:mediaId,p_path:path});
        if(lease.error || !lease.data) { path=undefined; await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'}); return fail(409,'Consultation changed while creating looks'); }
        const upload=await auth.service.storage.from('private-media').upload(path,image,{contentType:'image/png',upsert:false}); if(upload.error) throw new Error('Storage unavailable');
        const finish=await auth.service.rpc('finish_style_image',{p_user:auth.user.id,p_op:op.id,p_round:saved.data.roundId,p_media:mediaId,p_path:path,p_size:image.length});
        if(finish.error || !finish.data) { await auth.service.storage.from('private-media').remove([path]); path=undefined; await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'}); return fail(409,'Consultation changed while creating looks'); }
        path=undefined;
      } else {
        providerAction='editorial';
        const text=await requestText({key:process.env.OPENAI_API_KEY,instructions,input:{...data,approvedRound:parent},maxOutputTokens:1400});
        await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:op.id,action:'editorial',response:text});
        if(text.requestId) { const recorded=await auth.service.from('ai_operations').update({provider_ref:text.requestId}).eq('id',op.id).eq('user_id',auth.user.id).eq('state','running').select('id').maybeSingle(); if(recorded.error || !recorded.data) throw new Error('Accounting unavailable'); }
        const finish=await auth.service.rpc('finish_style_editorial',{p_user:auth.user.id,p_op:op.id,p_round:parentId,p_text:text.text});
        if(finish.error || !finish.data) { await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'}); return fail(409,'Consultation changed while creating the editorial'); }
      }
      // Until exact provider usage can be reconciled, charge the whole bound.
      const settled=await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'succeeded'});
      if(settled.error || !settled.data) return fail(503,'Result saved; accounting reconciliation is pending');
      return Response.json({operation:{id:op.id,kind,state:'succeeded'}},{headers});
    } catch(error) {
      if(error instanceof ProviderError && 'model' in error) {
        try { await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:op.id,action:providerAction,response:error}); } catch { /* Missing telemetry remains explicitly unknown; preserve held accounting. */ }
      }
      if(path) await auth.service.storage.from('private-media').remove([path]);
      await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:op.id});
      return fail(503,'The request status is uncertain; its reservation is being held');
    }
  } catch { return fail(503,'Generation unavailable'); }
}
