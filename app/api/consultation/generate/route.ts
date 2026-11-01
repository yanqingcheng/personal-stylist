import {activeUser, body, fail, sameOrigin} from '@/lib/server/supabase';
import {generateConsultation, generationInput, readGenerationJobs} from '@/lib/consultation-generation';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
export async function GET(){
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to your consultation');return Response.json(await readGenerationJobs(auth),{headers});}
 catch{return fail(503,'Saved generation requests unavailable');}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{
  const auth=await activeUser();if(!auth)return fail(401,'Sign in to your consultation');
  const input=generationInput.safeParse(await body(request));if(!input.success)return fail(400,'Send a generation key and current conversation revision');
  const result=await generateConsultation(auth,input.data);
  return Response.json(result.body,{status:result.status,headers});
 }catch{return fail(503,'Could not confirm generation. Keep your request key and retry; do not start a duplicate request');}
}
