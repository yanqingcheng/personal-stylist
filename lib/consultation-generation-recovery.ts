import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {activeUser} from '@/lib/server/supabase';
import {generateConsultation,generationInput} from '@/lib/consultation-generation';

type Auth=NonNullable<Awaited<ReturnType<typeof activeUser>>>;
const recoverySchema=z.object({oldJobId:z.uuid(),heldMicrousd:z.number().int().positive(),state:z.enum(['available','claimed']),request:generationInput.nullable(),newJobId:z.uuid().nullable()});
const savedSchema=z.object({recovery:recoverySchema.nullable()});
export const recoveryInput=z.object({oldJobId:z.uuid(),request:generationInput}).strict();
export async function readGenerationRecovery(auth:Auth){
 const saved=await auth.service.rpc('read_consultation_generation_recovery',{p_user:auth.user.id});
 if(saved.error)throw new Error('recovery unavailable');
 return savedSchema.parse(saved.data);
}
export async function recoverGeneration(auth:Auth,input:z.infer<typeof recoveryInput>){
 if(input.request.mode!=='dynamic'||input.request.adultConfirmed!==true)return {status:400,body:{error:'Confirm the adult reference and request dynamic generation.'}};
 const claim=await auth.service.rpc('claim_consultation_generation_recovery',{p_user:auth.user.id,p_old:input.oldJobId,p_request:input.request,p_payload_hash:createHash('sha256').update(JSON.stringify(input.request)).digest('hex')});
 if(claim.error)throw new Error('recovery claim unavailable');
 const reply=z.object({error:z.string().optional(),replayed:z.boolean().optional(),recovery:recoverySchema.nullable().optional()}).parse(claim.data);
 if(reply.error)return {status:409,body:{error:reply.error==='claimed'?'A replacement is already saved. Continue that same request.':'This recovery is unavailable or the conversation changed.',code:reply.error,recovery:reply.recovery??null}};
 const recovery=recoverySchema.parse(reply.recovery);
 if(!recovery.request||recovery.newJobId!==recovery.request.idempotencyKey)throw new Error('invalid recovery');
 // Always use the saved request, including after lost transport. SQL serializes
 // the claim; the existing runner serializes creation/reservation/dispatch.
 const generated=await generateConsultation(auth,recovery.request);
 return {status:generated.status,body:{...generated.body,recovery}};
}
