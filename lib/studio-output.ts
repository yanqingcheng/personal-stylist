import 'server-only';
import {z} from 'zod';
import {resolveConsultationOutput} from './consultation-output';
import type {activeUser} from './server/supabase';

type Auth=NonNullable<Awaited<ReturnType<typeof activeUser>>>;
const legacyRounds=z.array(z.object({looks:z.array(z.object({mediaId:z.string(),title:z.string().optional(),description:z.string().optional()}))}));
export async function readStudioOutput(auth:Auth,id:string,source:string|undefined,revision:string|undefined){
 let title:string,description:string|undefined,assetPath:string,provenance:string;
 if(source==='legacy'){
  if(!z.uuid().safeParse(id).success)throw Error('output_unavailable');
  const profile=await auth.service.from('profiles').select('id').eq('user_id',auth.user.id).eq('deletion_state','active').maybeSingle();
  if(profile.error||!profile.data)throw Error('output_unavailable');
  const rounds=await auth.service.rpc('read_style_rounds',{p_user:auth.user.id});
  const parsed=legacyRounds.safeParse(rounds.data);
  const look=parsed.success?parsed.data.flatMap(round=>round.looks).find(look=>look.mediaId===id):undefined;
  if(rounds.error||!look)throw Error('output_unavailable');
  const media=await auth.service.from('media').select('object_path').eq('id',id).eq('user_id',auth.user.id).eq('profile_id',profile.data.id).eq('status','ready').maybeSingle();
  if(media.error||!media.data||!media.data.object_path.startsWith(auth.user.id+'/'))throw Error('output_unavailable');
  title=look.title||'Outfit study';description=look.description;assetPath=media.data.object_path;provenance='Saved outfit study';
 }else{
  // A library link binds the saved revision as well as the ID. Never substitute
  // the latest board, or display a changed document under an old link.
  if(source!==undefined||!revision||!/^[a-f0-9]{64}$/.test(revision))throw Error('output_unavailable');
  const output=await resolveConsultationOutput({service:auth.service,userId:auth.user.id,outputId:id,documentRevision:revision});
  title=output.board.title;description=output.board.description||output.board.caption;assetPath=output.assetPath;
  provenance=output.provenance==='prepared'?'Supplied prepared image':'Generated outfit illustration';
 }
 const signed=await auth.service.storage.from('private-media').createSignedUrl(assetPath,300);
 return {title,description,provenance,url:signed.error?null:signed.data?.signedUrl??null};
}

