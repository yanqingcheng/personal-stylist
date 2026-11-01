import { randomUUID } from 'node:crypto';
import { activeUser,body,fail,sameOrigin } from '@/lib/server/supabase';
import { bodyReferenceAction,type BodyReferenceSnapshot } from '@/lib/body-reference';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

export async function GET(){
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to open your body references');
  const profile=await auth.service.from('profiles').select('id').eq('user_id',auth.user.id).eq('deletion_state','active').maybeSingle();
  if(profile.error||!profile.data)return fail(404,'Profile unavailable');
  const [media,state]=await Promise.all([
   auth.service.from('media').select('id,object_path,status').eq('user_id',auth.user.id).eq('profile_id',profile.data.id).eq('kind','body_reference').order('created_at'),
   auth.service.from('style_body_references').select('*').eq('user_id',auth.user.id).eq('profile_id',profile.data.id).maybeSingle(),
  ]);
  if(media.error||state.error)return fail(503,'Body references unavailable');
  const photos=await Promise.all(media.data.filter(item=>item.status==='ready').map(async item=>{
   const signed=await auth.service.storage.from('private-media').createSignedUrl(item.object_path,300);if(signed.error)throw Error('Photo signing unavailable');return{id:item.id,url:signed.data.signedUrl};
  }));
  const selected=photos.find(photo=>photo.id===state.data?.selected_media_id);
  const snapshot:BodyReferenceSnapshot={revision:state.data?.revision??0,photos,pending:media.data.filter(item=>item.status!=='ready').map(({id,status})=>({id,status})),selectedSourceId:selected?.id??null,referenceStatus:selected?state.data.reference_status:'empty',referenceUrl:selected?.url??null,provenance:selected?'original':null,coverage:selected&&state.data?.confirmed_adult&&state.data?.confirmed_full_body?'user-confirmed-full-body':'unconfirmed',generatedReferenceStatus:'not-prepared'};
  return Response.json({bodyReference:snapshot},{headers});
 }catch{return fail(503,'Body references unavailable')}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to save your body references');
  const parsed=bodyReferenceAction.safeParse(await body(request));if(!parsed.success)return fail(400,'Choose valid body photos and confirm adult full-body coverage before preparing a reference');
  const input=parsed.data;
  if(input.action==='upload'){
   const id=randomUUID(),objectPath=`${auth.user.id}/pending/${id}`;
   const pending=await auth.service.rpc('create_pending_media',{p_user:auth.user.id,p_id:id,p_path:objectPath,p_kind:'body_reference',p_type:input.contentType,p_size:input.byteSize});
   if(pending.error)return fail(503,'Body upload unavailable');if(pending.data?.error)return fail(409,pending.data.error==='storage_limit'?'You can keep four body photos, with a shared 100 MB account storage limit. Remove an old upload to make room.':'Body upload unavailable');
   const signed=await auth.service.storage.from('private-media').createSignedUploadUrl(objectPath,{upsert:false});
   if(signed.error){await auth.service.from('media').update({status:'failed'}).eq('id',id).eq('user_id',auth.user.id);return fail(503,'Private body upload unavailable')}
   return Response.json({media:{id,objectPath},upload:{token:signed.data.token}},{headers});
  }
  const saved=await auth.service.rpc('write_body_reference',{p_user:auth.user.id,p_revision:input.expectedRevision,p_action:input.action,p_media:input.action==='select'?input.mediaId:null,p_adult:input.action==='prepare'&&input.confirmedAdult,p_full_body:input.action==='prepare'&&input.confirmedFullBody});
  if(saved.error)return fail(503,'Body reference could not be saved');
  if(saved.data?.error)return fail(409,saved.data.error==='conflict'?'Your body reference changed. Reload before reviewing it.':'Choose a ready body photo you own; face portraits cannot be used as body evidence.');
  return Response.json({ok:true},{headers});
 }catch{return fail(503,'Body reference could not be saved')}
}
