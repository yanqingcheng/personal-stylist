import { activeUser,body,fail,sameOrigin } from '@/lib/server/supabase';
import { consultationInput,consultationSnapshot } from '@/lib/consultation';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
export async function GET(){
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to open your private consultation');
  const result=await auth.service.rpc('read_consultation',{p_user:auth.user.id});
  if(result.error)return fail(503,'Saved consultation unavailable');
  const parsed=consultationSnapshot.safeParse(result.data);
  if(!parsed.success)return fail(404,'Private consultation unavailable');
  return Response.json({consultation:parsed.data},{headers});
 }catch{return fail(503,'Saved consultation unavailable');}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to open your private consultation');
  const input=consultationInput.safeParse(await body(request));if(!input.success)return fail(400,'Write a message of up to 12,000 characters');
  const result=await auth.service.rpc('append_consultation_user',{
   p_user:auth.user.id,p_message:input.data.idempotencyKey,p_revision:input.data.expectedRevision,
   p_text:input.data.text,p_board:input.data.activeBoardId??null,
  });
  if(result.error)return fail(503,'Could not confirm the save. Keep your message and retry');
  if(result.data?.error==='conflict'){
   const latest=consultationSnapshot.safeParse(result.data.consultation);
   return Response.json({error:'Your conversation changed. Your message has not been overwritten; load the latest and retry.',...(latest.success?{consultation:latest.data}:{})},{status:409,headers});
  }
  if(result.data?.error)return fail(404,'Private consultation unavailable');
  const saved=consultationSnapshot.safeParse(result.data?.consultation);
  if(!saved.success)return fail(503,'Could not confirm the saved message. Retry with the same message key');
  return Response.json({consultation:saved.data,replayed:result.data.replayed===true},{headers});
 }catch{return fail(503,'Saved consultation unavailable. Keep your message and retry');}
}
