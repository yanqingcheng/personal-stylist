import {activeUser,body,fail,sameOrigin} from '@/lib/server/supabase';
import {readGenerationRecovery,recoverGeneration,recoveryInput} from '@/lib/consultation-generation-recovery';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
export async function GET(){
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to your consultation');return Response.json(await readGenerationRecovery(auth),{headers});}
 catch{return fail(503,'Saved recovery unavailable');}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to your consultation');
  const input=recoveryInput.safeParse(await body(request));if(!input.success)return fail(400,'Send the saved attempt and replacement request');
  const result=await recoverGeneration(auth,input.data);return Response.json(result.body,{status:result.status,headers});
 }catch{return fail(503,'Could not confirm the replacement. Reopen recovery and continue its saved request; do not start another attempt.');}
}
