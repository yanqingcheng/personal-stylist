import 'server-only';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {serviceClient} from '@/lib/server/supabase';
import {demoDocument} from '@/lib/demo';
const boardSchema=demoDocument.shape.boards.unwrap().element;
const generatedResult=z.object({id:z.uuid(),board:boardSchema,assetPath:z.string().min(1),documentRevision:z.string().regex(/^[a-f0-9]{64}$/),provenance:z.enum(['dynamic','prepared'])});
type Service=ReturnType<typeof serviceClient>;
export type ConsultationOutput={board:z.infer<typeof boardSchema>;assetPath:string;documentRevision:string;provenance:'dynamic'|'prepared';jobId?:string};
export async function resolveConsultationOutput({service,userId,outputId,documentRevision}:{service:Service;userId:string;outputId:string;documentRevision?:string}):Promise<ConsultationOutput>{
 const profile=await service.from('profiles').select('id,deletion_state').eq('user_id',userId).maybeSingle();
 if(profile.error||!profile.data||profile.data.deletion_state!=='active')throw new Error('output_unavailable');
 if(z.uuid().safeParse(outputId).success){
  const job=await service.from('consultation_generation_jobs').select('id,user_id,profile_id,status,result').eq('id',outputId).eq('user_id',userId).eq('profile_id',profile.data.id).maybeSingle();
  if(job.error)throw new Error('output_unavailable');
  if(job.data){
   const result=generatedResult.safeParse(job.data.result);
   if(job.data.status!=='succeeded'||!result.success||result.data.id!==job.data.id||result.data.board.id!==job.data.id||!result.data.assetPath.startsWith(userId+'/'))throw new Error('output_unavailable');
   if(documentRevision&&result.data.documentRevision!==documentRevision)throw new Error('output_changed');
   const media=await service.from('media').select('id').eq('user_id',userId).eq('profile_id',profile.data.id).eq('status','ready').eq('object_path',result.data.assetPath).maybeSingle();
   if(media.error||!media.data)throw new Error('output_unavailable');
   return {board:result.data.board,assetPath:result.data.assetPath,documentRevision:result.data.documentRevision,provenance:result.data.provenance,jobId:job.data.id};
  }
 }
 const stored=await service.storage.from('private-media').download(userId+'/demo/document.json');
 if(stored.error||!stored.data||stored.data.size>2_000_000)throw new Error('output_unavailable');
 const parsed=demoDocument.safeParse(JSON.parse(await stored.data.text()));
 if(!parsed.success)throw new Error('output_unavailable');
 const hash=createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
 if(documentRevision&&hash!==documentRevision)throw new Error('output_changed');
 const board=parsed.data.boards.find(item=>item.id===outputId);
 if(!board)throw new Error('output_unavailable');
 return {board,assetPath:userId+'/demo/'+board.path,documentRevision:hash,provenance:'prepared'};
}
