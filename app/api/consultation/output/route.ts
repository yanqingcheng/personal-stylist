import {createHash} from 'node:crypto';
import {z} from 'zod';
import {activeUser,body,fail,sameOrigin} from '@/lib/server/supabase';
import {demoDocument} from '@/lib/demo';
const input=z.object({outputId:z.string().min(1).max(200),expectedRevision:z.number().int().nonnegative(),documentRevision:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export async function POST(request:Request){
 if(!sameOrigin(request))return fail(403,'Forbidden');
 try{const auth=await activeUser();if(!auth)return fail(401,'Sign in to your consultation');const parsed=input.safeParse(await body(request));if(!parsed.success)return fail(400,'Choose a current style sheet');
 const saved=await auth.service.storage.from('private-media').download(`${auth.user.id}/demo/document.json`);if(saved.error||!saved.data||saved.data.size>2000000)return fail(404,'Style sheet unavailable');
 const doc=demoDocument.parse(JSON.parse(await saved.data.text()));const hash=createHash('sha256').update(JSON.stringify(doc)).digest('hex');
 if(hash!==parsed.data.documentRevision||!doc.boards.some(board=>board.id===parsed.data.outputId))return fail(409,'The style sheet changed. Review it before approving');
 const result=await auth.service.rpc('approve_consultation_output',{p_user:auth.user.id,p_revision:parsed.data.expectedRevision,p_output_id:parsed.data.outputId,p_output_hash:hash});
 if(result.error)return fail(503,'Approval could not be saved');if(result.data?.error)return fail(409,result.data.error==='pending'?'Wait for the stylist’s reply before approving':'The conversation changed. Review it before approving');return Response.json(result.data,{headers:{'Cache-Control':'no-store'}});
 }catch{return fail(503,'Approval could not be saved')}
}
