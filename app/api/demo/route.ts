import { createHash } from 'node:crypto';
import { activeUser, fail } from '@/lib/server/supabase';
import { demoDocument } from '@/lib/demo';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
export async function GET(){
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to view your private prepared demo');
  const profile=await auth.service.from('profiles').select('deletion_state').eq('user_id',auth.user.id).maybeSingle();
  if(profile.error||profile.data?.deletion_state!=='active')return fail(404,'Private demo unavailable');
  const prefix=auth.user.id+'/demo/';
  const saved=await auth.service.storage.from('private-media').download(prefix+'document.json');
  if(saved.error||!saved.data)return Response.json({status:'awaiting_content'},{headers});
  if(saved.data.size>2_000_000)return fail(503,'Prepared content is not ready to display');
  const document=demoDocument.safeParse(JSON.parse(await saved.data.text()));
  if(!document.success)return fail(503,'Prepared content is not ready to display');
  const paths=[...document.data.references.map(item=>item.path),...document.data.boards.map(item=>item.path),...(document.data.editorial?.path?[document.data.editorial.path]:[])];
  const entries=await Promise.all([...new Set(paths)].map(async path=>{
   const result=await auth.service.storage.from('private-media').createSignedUrl(prefix+path,180);
   return [path,result.error?null:result.data.signedUrl] as const;
  }));
  const revision=createHash('sha256').update(JSON.stringify(document.data)).digest('hex');
  const storageScope=createHash('sha256').update(auth.user.id).digest('hex').slice(0,24);
  return Response.json({status:'ready',document:document.data,revision,storageScope,urls:Object.fromEntries(entries)},{headers});
 }catch{return fail(503,'Private prepared demo unavailable');}
}
