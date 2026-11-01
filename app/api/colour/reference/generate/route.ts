import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
import { colourGenerationGate, colourGenerationRequest, COLOUR_COMPOSITE_PROMPT_VERSION } from '@/lib/colour-generation';
import { editColourComposite, CompositeProviderError } from '@/lib/colour-composite-provider.mjs';
import { recordProviderUsage } from '@/lib/style/server/usage';

export const maxDuration=300;
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const mimeType=z.enum(['image/jpeg','image/png','image/webp']);
const photoList=z.array(z.object({id:z.uuid()}).passthrough()).max(4);

export async function POST(request:Request) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const auth=await activeUser(); if (!auth) return fail(401,'Sign in and activate your account');
    const parsed=colourGenerationRequest.safeParse(await body(request));
    if (!parsed.success) return fail(400,'Choose four different source photos and confirm processing consent');
    const input=parsed.data, sourceIds=input.sources.map(source=>source.id);
    const profile=await auth.service.from('profiles').select('id,revision,document,deletion_state').eq('user_id',auth.user.id).maybeSingle();
    if (profile.error || !profile.data || profile.data.deletion_state!=='active') return fail(404,'Profile unavailable');
    if (profile.data.revision!==input.expectedRevision) return fail(409,'Your profile changed. Reload before preparing a portrait');
    const listed=photoList.safeParse(profile.data.document?.photos);
    if (!listed.success || sourceIds.some(id=>!listed.data.some(photo=>photo.id===id))) return fail(409,'Save all four original photos to your profile first');
    const media=await auth.service.from('media').select('id,object_path,content_type,byte_size').eq('user_id',auth.user.id).eq('profile_id',profile.data.id).eq('kind','colour_portrait').eq('status','ready').in('id',sourceIds);
    if (media.error || media.data.length!==4) return fail(409,'One or more source photos are unavailable');
    const gate=colourGenerationGate();
    // Intentionally before any reservation, download, upload or model invocation.
    // Image 2.5's $2 estimate is not a verified maximum; env flags cannot bypass it.
    if (!gate.ready) return Response.json({error:'Dynamic portrait preparation is awaiting release',code:'composite_release_blocked',reasons:gate.reasons},{status:503,headers});

    const hash=createHash('sha256').update(JSON.stringify({sources:input.sources,revision:input.expectedRevision,model:gate.model,promptVersion:COLOUR_COMPOSITE_PROMPT_VERSION,pricingVersion:gate.pricingVersion})).digest('hex');
    const reserved=await auth.service.rpc('reserve_colour_generation',{p_user:auth.user.id,p_key:input.idempotencyKey,p_hash:hash,p_revision:input.expectedRevision,p_sources:sourceIds,p_pricing_version:gate.pricingVersion});
    if (reserved.error) return fail(503,'Portrait preparation unavailable');
    if (reserved.data?.error==='budget') return fail(402,'Available portrait preparation budget has been used');
    if (['conflict','in_flight','invalid'].includes(reserved.data?.error)) return fail(409,'This request conflicts with the current profile');
    if (reserved.data?.error || !reserved.data?.operation) return fail(503,'Portrait preparation unavailable');
    const operation=reserved.data.operation;
    if (!reserved.data.created) return Response.json({operation},{headers});
    const release=async()=>{try {await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'failed_before_dispatch'})} catch {/* Keep reservation if release is unconfirmed. */}};
    const uncertain=async()=>{try {await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:operation.id})} catch {/* Reservation remains held. */}};
    const sources=[];
    try {
      for (const source of input.sources) {
        const photo=media.data.find(item=>item.id===source.id)!;
        const checkedMime=mimeType.safeParse(photo.content_type);
        if (!checkedMime.success || photo.byte_size<=0 || photo.byte_size>10485760) throw new Error('Invalid photo');
        const downloaded=await auth.service.storage.from('private-media').download(photo.object_path);
        if (downloaded.error || !downloaded.data || downloaded.data.size>10485760) throw new Error('Photo unavailable');
        sources.push({bytes:new Uint8Array(await downloaded.data.arrayBuffer()),mimeType:checkedMime.data,lightingRole:source.lightingRole});
      }
    } catch {await release();return fail(503,'Source photos could not be prepared')}
    let dispatch;
    try {dispatch=await auth.service.rpc('dispatch_colour_generation',{p_user:auth.user.id,p_op:operation.id,p_sources:sourceIds})}
    catch {await uncertain();return fail(503,'Portrait request status is uncertain; its reservation is held')}
    if (dispatch.error || (dispatch.data!==true && dispatch.data!==false)) {await uncertain();return fail(503,'Portrait request status is uncertain; its reservation is held')}
    if (!dispatch.data) {await release();return fail(409,'Profile changed before portrait preparation')}
    let cleanupPath:string|undefined;
    try {
      const result=await editColourComposite({key:process.env.OPENAI_API_KEY!,sources});
      await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,action:'composite',response:result});
      if (result.requestId) {
        const saved=await auth.service.from('ai_operations').update({provider_ref:result.requestId}).eq('id',operation.id).eq('user_id',auth.user.id).eq('state','running').select('id').maybeSingle();
        if (saved.error || !saved.data) throw new Error('Accounting unavailable');
      }
      const mediaId=randomUUID(), path=`${auth.user.id}/generated/${mediaId}`;
      const lease=await auth.service.rpc('lease_colour_generation_upload',{p_user:auth.user.id,p_op:operation.id,p_media:mediaId,p_path:path});
      if (lease.error || lease.data!==true) throw new Error('Upload lease unavailable');
      cleanupPath=path;
      const uploaded=await auth.service.storage.from('private-media').upload(path,result.image,{contentType:'image/png',upsert:false});
      if (uploaded.error) throw new Error('Private storage unavailable');
      const finished=await auth.service.rpc('finish_colour_generation',{p_user:auth.user.id,p_op:operation.id,p_media:mediaId,p_path:path,p_size:result.image.length,p_sources:sourceIds});
      if (finished.error || !finished.data?.referenceId) throw new Error('Reference could not be saved');
      cleanupPath=undefined;
      // This is the shared ledger's conservative settlement, not an actual-dollar claim.
      const settled=await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:operation.id,p_outcome:'succeeded'});
      if (settled.error || settled.data!==true) {await uncertain();return fail(503,'Portrait saved pending your review; accounting reconciliation is pending')}
      return Response.json({operation:{id:operation.id,kind:'composite',state:'succeeded'},referenceId:finished.data.referenceId,status:'pending'},{headers});
    } catch(error) {
      if (error instanceof CompositeProviderError && 'dispatchStarted' in error && error.dispatchStarted===false) {
        try {await auth.service.rpc('release_colour_generation_unspent',{p_user:auth.user.id,p_op:operation.id})} catch {/* Keep unconfirmed reservation held. */}
        return fail(400,'Source photos could not be decoded for portrait preparation');
      }
      if (error instanceof CompositeProviderError) {
        try {await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:operation.id,action:'composite',response:error})} catch {/* Missing usage stays unknown. */}
      }
      if (cleanupPath) {try {await auth.service.storage.from('private-media').remove([cleanupPath])} catch {/* Registered lease retains cleanup responsibility. */}}
      await uncertain();
      return fail(503,'Portrait request status is uncertain; its reservation is held');
    }
  } catch {return fail(503,'Portrait preparation unavailable')}
}
