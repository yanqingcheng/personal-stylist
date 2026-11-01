import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {activeUser,body,fail,sameOrigin,type serviceClient} from '@/lib/server/supabase';
import {colourFraming,colourFramingSource,colourFramingProposal,suggestColourFraming,manualColourFraming,COLOUR_FRAMING_INSTRUCTIONS} from '@/lib/colour-framing';
import {requestText,ProviderError} from '@/lib/style/server/provider.mjs';
import {recordProviderUsage} from '@/lib/style/server/usage';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
type Auth={user:{id:string};service:ReturnType<typeof serviceClient>};
async function loadSource(auth:Auth,sourceMediaId:string){
 const profile=await auth.service.from('profiles').select('id,revision,deletion_state').eq('user_id',auth.user.id).maybeSingle();
 if(profile.error||profile.data?.deletion_state!=='active')throw new Error('source_unavailable');
 const valid=await auth.service.rpc('colour_framing_source_valid',{p_user:auth.user.id,p_media:sourceMediaId});
 if(valid.error||valid.data!==true)throw new Error('source_unavailable');
 const media=await auth.service.from('media').select('object_path,kind').eq('id',sourceMediaId).eq('user_id',auth.user.id).eq('profile_id',profile.data.id).eq('status','ready').maybeSingle();
 if(media.error||!media.data)throw new Error('source_unavailable');
 const file=await auth.service.storage.from('private-media').download(media.data.object_path);
 if(file.error||!file.data||file.data.size>10485760||file.data.size===0)throw new Error('source_unavailable');
 const bytes=Buffer.from(await file.data.arrayBuffer());
 const decoder=sharp(bytes,{limitInputPixels:16_000_000,animated:false});const info=await decoder.metadata();
 if(!['jpeg','png','webp'].includes(info.format??'')||(info.pages??1)>1)throw new Error('source_unavailable');
 const oriented=await decoder.rotate().resize(1536,1536,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer({resolveWithObject:true});
 const source=colourFramingSource.parse({sourceMediaId,sourceVersion:createHash('sha256').update(bytes).digest('hex'),kind:media.data.kind==='colour_reference'?'approved-composite':'original',width:oriented.info.width,height:oriented.info.height});
 return {source,image:oriented.data,profileRevision:profile.data.revision};
}
async function savedFraming(auth:Auth,sourceMediaId:string,sourceVersion:string){
 const saved=await auth.service.rpc('read_colour_framing',{p_user:auth.user.id,p_media:sourceMediaId,p_version:sourceVersion});
 if(saved.error)throw new Error('framing_unavailable');
 return saved.data?colourFraming.parse(saved.data):null;
}
function enabled(){return process.env.COLOUR_FRAMING_ENABLED==='true'&&process.env.COLOUR_FRAMING_VERIFIED_COST_BOUND==='true'&&Boolean(process.env.OPENAI_API_KEY)}
export async function GET(request:Request){
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to frame your reference');const id=z.uuid().safeParse(new URL(request.url).searchParams.get('sourceMediaId'));if(!id.success)return fail(400,'Choose a reference image');
 const loaded=await loadSource(auth,id.data);const framing=await savedFraming(auth,id.data,loaded.source.sourceVersion);
 return Response.json({...loaded,image:undefined,framing,framingRevision:framing?.framingRevision??0,autoAvailable:enabled()},{headers});
 }catch{return fail(404,'This owned reference is unavailable or no longer approved');}
}
export async function PATCH(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to frame your reference');const input=manualColourFraming.safeParse(await body(request));if(!input.success)return fail(400,'Choose a valid crop inside the image');const v=input.data;const loaded=await loadSource(auth,v.sourceMediaId);
 if(loaded.source.sourceVersion!==v.sourceVersion||loaded.profileRevision!==v.expectedProfileRevision)return fail(409,'The source or profile changed; reload before adjusting its frame');
 const saved=await auth.service.rpc('save_colour_framing',{p_user:auth.user.id,p_media:v.sourceMediaId,p_version:v.sourceVersion,p_profile_revision:v.expectedProfileRevision,p_framing_revision:v.expectedFramingRevision,p_crop:v.crop,p_provenance:'manual',p_uncertainty:'low',p_reason:'Framing adjusted by you; this does not establish image or colour accuracy.',p_model:null,p_model_source:null,p_op:null});
 if(saved.error)return fail(503,'Framing could not be saved');if(saved.data?.error)return fail(409,'This framing changed; reload before saving');
 return Response.json({source:loaded.source,profileRevision:loaded.profileRevision,framing:colourFraming.parse(saved.data.framing),framingRevision:saved.data.framing.framingRevision},{headers});
 }catch{return fail(503,'Framing could not be saved. Your manual adjustment is still yours to retry.');}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to frame your reference');const input=suggestColourFraming.safeParse(await body(request));if(!input.success)return fail(400,'Choose a current reference for automatic framing');const v=input.data;
 const loaded=await loadSource(auth,v.sourceMediaId);if(loaded.source.sourceVersion!==v.sourceVersion||loaded.profileRevision!==v.expectedProfileRevision)return fail(409,'The source or profile changed; reload before automatic framing');
 if(!enabled())return Response.json({error:'Automatic framing is not enabled. You can adjust the frame manually.',code:'framing_disabled'},{status:503,headers});
 const hash=createHash('sha256').update(JSON.stringify({purpose:'colour-face-neck-framing-v1',...v})).digest('hex');
 const reserved=await auth.service.rpc('reserve_colour_framing',{p_user:auth.user.id,p_key:v.idempotencyKey,p_hash:hash,p_media:v.sourceMediaId,p_version:v.sourceVersion,p_profile_revision:v.expectedProfileRevision,p_framing_revision:v.expectedFramingRevision});
 if(reserved.error)return fail(503,'Framing allowance unavailable');if(reserved.data?.error)return fail(reserved.data.error==='budget'?402:409,'Automatic framing is unavailable for this source, current frame or allowance');const op=reserved.data.operation;
 if(!reserved.data.created){const framing=await savedFraming(auth,v.sourceMediaId,v.sourceVersion);return Response.json({source:loaded.source,profileRevision:loaded.profileRevision,framing,framingRevision:framing?.framingRevision??0,operation:op},{status:op.state==='succeeded'?200:202,headers});}
 let dispatched;
 try{dispatched=await auth.service.rpc('dispatch_colour_framing',{p_user:auth.user.id,p_op:op.id,p_media:v.sourceMediaId,p_profile_revision:v.expectedProfileRevision,p_framing_revision:v.expectedFramingRevision,p_version:v.sourceVersion});}catch{await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:op.id});return fail(503,'Framing status is uncertain; its reservation is held');}
 if(dispatched.error||typeof dispatched.data!=='boolean'){await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:op.id});return fail(503,'Framing status is uncertain; its reservation is held');}
 if(!dispatched.data){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'failed_before_dispatch'});return fail(409,'The source or frame changed before dispatch');}
 try{
 const response=await requestText({key:process.env.OPENAI_API_KEY!,instructions:COLOUR_FRAMING_INSTRUCTIONS,input:{source:loaded.source,coordinateSpace:'normalized-full-oriented-source',purpose:'same-face-neck-crop-for-both-drapes'},image:loaded.image,maxOutputTokens:600});
 await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:op.id,action:'composite',response});
 const proposal=colourFramingProposal.safeParse(JSON.parse(response.text));if(!proposal.success){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'});return fail(503,'The model did not return a usable frame. Please adjust it manually.');}
 const current=await loadSource(auth,v.sourceMediaId);if(current.source.sourceVersion!==v.sourceVersion){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'});return fail(409,'The source image changed during framing');}
 const saved=await auth.service.rpc('save_colour_framing',{p_user:auth.user.id,p_media:v.sourceMediaId,p_version:v.sourceVersion,p_profile_revision:v.expectedProfileRevision,p_framing_revision:v.expectedFramingRevision,p_crop:proposal.data.crop,p_provenance:'gpt',p_uncertainty:proposal.data.uncertainty,p_reason:proposal.data.reason,p_model:response.model,p_model_source:response.modelSource,p_op:op.id});
 if(saved.error||saved.data?.error){await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'rejected_result'});return fail(409,'The profile or framing changed. Its newer adjustment was preserved.');}
 const settled=await auth.service.rpc('settle_style_operation',{p_user:auth.user.id,p_id:op.id,p_outcome:'succeeded'});if(settled.error||settled.data!==true)return fail(503,'Framing saved; allowance reconciliation pending');
 return Response.json({source:loaded.source,profileRevision:loaded.profileRevision,framing:colourFraming.parse(saved.data.framing),framingRevision:saved.data.framing.framingRevision,operation:{id:op.id,state:'succeeded'}},{headers});
 }catch(error){if(error instanceof ProviderError&&'model'in error){try{await recordProviderUsage({service:auth.service,userId:auth.user.id,operationId:op.id,action:'composite',response:error})}catch{}}await auth.service.rpc('mark_style_uncertain',{p_user:auth.user.id,p_op:op.id});return fail(503,'Framing status is uncertain; its reservation is held');}
 }catch{return fail(503,'Automatic framing is temporarily unavailable. You can still adjust it manually.');}
}
