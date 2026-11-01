import {z} from 'zod';
import {consultationSchema,type ConsultationSnapshot} from '@/lib/consultation';

const attemptSchema=z.object({idempotencyKey:z.uuid(),replyTo:z.uuid(),expectedRevision:z.number().int().nonnegative(),certainty:z.enum(['unknown','budget-refused','known']),operationId:z.uuid().nullable()});
const profileSchema=z.object({profile:z.object({id:z.uuid(),deletion_state:z.literal('active')})});
const usageSchema=z.object({operations:z.array(z.object({id:z.uuid(),kind:z.string(),state:z.string()}))});
const responseSchema=z.object({consultation:consultationSchema.optional(),error:z.string().optional(),operation:z.object({id:z.uuid(),state:z.string()}).passthrough().optional()});
type ReplyResult={snapshot:ConsultationSnapshot|null;replyTo:string|null;error:string|null};

/** Explicit retry of a saved turn. Never posts another user message. */
export async function requestSavedStylistReply():Promise<ReplyResult>{
 let snapshot:ConsultationSnapshot|null=null,replyTo:string|null=null;let dispatchAttempted=false;
 try{
  const fresh=await fetch('/api/consultation',{cache:'no-store'});
  if(!fresh.ok)throw Error('Refresh the saved conversation before requesting its reply.');
  const saved=await fresh.json();snapshot=consultationSchema.parse(saved.consultation);replyTo=snapshot.pendingReplyTo;
  if(!replyTo)return{snapshot,replyTo,error:null};
  const profile=await fetch('/api/profile',{cache:'no-store'});
  if(!profile.ok)throw Error('Sign in to the active profile before retrying its saved reply.');
  const account=profileSchema.parse(await profile.json());
  const key='stylist-reply:'+account.profile.id+':'+replyTo;
  // If storage is unavailable, do not dispatch a request whose key cannot survive reload.
  const previous=attemptSchema.safeParse(JSON.parse(sessionStorage.getItem(key)||'null'));
  let attempt:z.infer<typeof attemptSchema>=previous.success&&previous.data.replyTo===replyTo?previous.data:{idempotencyKey:crypto.randomUUID(),replyTo,expectedRevision:snapshot.revision,certainty:'unknown',operationId:null};
  if(attempt.certainty==='budget-refused')attempt={...attempt,expectedRevision:snapshot.revision};
  sessionStorage.setItem(key,JSON.stringify(attempt));
  const usage=await fetch('/api/usage',{cache:'no-store'});
  if(!usage.ok)throw Error('Saved usage could not be checked. No reply was requested; check your allowance and retry.');
  const ledger=usageSchema.parse(await usage.json());
  // Usage intentionally omits message IDs. Conservatively pause for any held account operation.
  const held=ledger.operations.find(operation=>['reserved','running','uncertain'].includes(operation.state));
  if(held)return{snapshot,replyTo,error:held.state==='uncertain'?'A request on your account needs reconciliation and its reservation is held. No duplicate reply was requested. Check allowance and usage.':'A request on your account is still reserved or running. No duplicate reply was requested. Check its saved usage and try again after it finishes.'};
  dispatchAttempted=true;
  const response=await fetch('/api/consultation/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:attempt.idempotencyKey,expectedRevision:attempt.expectedRevision,replyTo:attempt.replyTo})});
  const result=responseSchema.safeParse(await response.json().catch(()=>null));
  if(!result.success)throw Error('The saved reply outcome is not confirmed. Its exact request key is retained; check usage before retrying.');
  if(result.data.consultation)snapshot=result.data.consultation;
  const answered=snapshot.messages.some(message=>message.role==='stylist'&&message.replyTo===replyTo);
  if(answered){sessionStorage.removeItem(key);return{snapshot,replyTo,error:null}}
  attempt={...attempt,certainty:response.status===402?'budget-refused':result.data.operation?'known':'unknown',operationId:result.data.operation?.id??attempt.operationId};
  sessionStorage.setItem(key,JSON.stringify(attempt));
  if(response.status===402)return{snapshot,replyTo,error:'The consultation allowance is exhausted. Your message is already saved. Review allowance and usage, then retry this saved stylist reply after funding is available.'};
  return{snapshot,replyTo,error:result.data.error||'The reply is not saved yet. Its exact request key is retained. Check saved usage before retrying.'};
 }catch(error){return{snapshot,replyTo,error:dispatchAttempted?'The reply request outcome is not confirmed. Your saved message and exact reply key are retained; check saved usage before retrying.':error instanceof z.ZodError?'Saved conversation or usage could not be verified. No reply was requested.':error instanceof Error?error.message:'Saved reply checks were unavailable. No reply was requested.'}}
}
