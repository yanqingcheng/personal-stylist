import 'server-only';
import {z} from 'zod';
import {resolveConsultationOutput} from './consultation-output';
import type {activeUser} from './server/supabase';
type Auth=NonNullable<Awaited<ReturnType<typeof activeUser>>>;
const editorialSchema=z.object({id:z.uuid(),kind:z.literal('editorial'),status:z.literal('succeeded'),outputId:z.string().min(1).max(200),outputHash:z.string().regex(/^[a-f0-9]{64}$/),result:z.string().min(1).max(20000),createdAt:z.string()});
export async function readStudioEditorial(auth:Auth,id:string,revision:string|undefined){
 if(!z.uuid().safeParse(id).success||!revision||!/^[a-f0-9]{64}$/.test(revision))throw Error('editorial_unavailable');
 // This owner-filtered read also enforces active profile and access grant.
 const saved=await auth.service.rpc('read_consultation_actions',{p_user:auth.user.id});
 if(saved.error||!Array.isArray(saved.data))throw Error('editorial_unavailable');
 const parsed=editorialSchema.safeParse(saved.data.find((action: {id?:unknown})=>action?.id===id));
 if(!parsed.success||parsed.data.outputHash!==revision)throw Error('editorial_unavailable');
 const action=parsed.data;
 const output=await resolveConsultationOutput({service:auth.service,userId:auth.user.id,outputId:action.outputId,documentRevision:revision});
 return {text:action.result,createdAt:action.createdAt,outputTitle:output.board.title};
}
