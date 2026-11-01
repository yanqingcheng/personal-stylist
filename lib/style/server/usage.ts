import 'server-only';
import { z } from 'zod';
import type { serviceClient } from '@/lib/server/supabase';
import { reportedUsage } from './provider.mjs';

const responseSchema = z.object({
  model:z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
  modelSource:z.enum(['reported','requested']),
  requestId:z.unknown().optional(), usage:z.unknown().optional(),
});
const rateSchema = z.object({
  model:z.string().min(1).max(120), version:z.string().min(1).max(120), sourceUrl:z.url().max(500),
  // The server caller must verify that these rates cover every modality in this request.
  coversAllModalities:z.literal(true),
  inputMicrousdPerToken:z.number().finite().nonnegative(),
  cachedInputMicrousdPerToken:z.number().finite().nonnegative(),
  outputMicrousdPerToken:z.number().finite().nonnegative(),
}).strict();
export type VerifiedUsageRates = z.infer<typeof rateSchema>;
type Service = ReturnType<typeof serviceClient>;

/** Call after every provider response, before validating/saving its content.
 * No prices are configured by default. A rate card is an operator-verified quote,
 * never a browser value; this helper cannot establish current provider pricing.
 * Missing modality/count information stays unpriced. This never mutates the ledger.
 */
export async function recordProviderUsage({service,userId,operationId,action,response,rates}: {
  service:Service; userId:string; operationId:string; action:'plan'|'image'|'editorial'|'dialogue'|'composite'|'transcription'|'voice';
  response:unknown; rates?:VerifiedUsageRates;
}) {
  const parsed=responseSchema.parse(response);
  const operation=await service.from('ai_operations').select('id,pricing_version').eq('id',operationId).eq('user_id',userId).maybeSingle();
  if(operation.error || !operation.data) throw new Error('Usage operation unavailable');
  const usage=reportedUsage(parsed.usage);
  const validatedRates=rates ? rateSchema.parse(rates) : null;
  const input=usage?.input_tokens, output=usage?.output_tokens, details=usage?.input_tokens_details;
  const cached=details && typeof details==='object' ? details.cached_tokens : undefined;
  let estimate:number|null=null;
  if(validatedRates && parsed.modelSource==='reported' && validatedRates.model===parsed.model &&
    typeof input==='number' && typeof output==='number' && typeof cached==='number' && cached<=input) {
    const amount=Math.ceil((input-cached)*validatedRates.inputMicrousdPerToken + cached*validatedRates.cachedInputMicrousdPerToken + output*validatedRates.outputMicrousdPerToken);
    if(Number.isSafeInteger(amount) && amount>=0) estimate=amount;
  }
  const requestId=typeof parsed.requestId==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(parsed.requestId) ? parsed.requestId : null;
  const saved=await service.from('style_provider_usage').upsert({
    user_id:userId,operation_id:operationId,action,model:parsed.model,model_source:parsed.modelSource,
    provider_request_id:requestId,reported_usage:usage,pricing_version:operation.data.pricing_version,
    estimated_microusd:estimate,rate_version:estimate===null ? null : validatedRates?.version,
    rate_source:estimate===null ? null : validatedRates?.sourceUrl,
  },{onConflict:'operation_id,action',ignoreDuplicates:true});
  if(saved.error) throw new Error('Usage could not be recorded');
}

export async function readAccountUsage({service,userId}:{service:Service;userId:string}) {
  const result=await service.rpc('read_style_usage',{p_user:userId});
  if(result.error || !result.data) throw new Error('Usage unavailable');
  return result.data;
}
