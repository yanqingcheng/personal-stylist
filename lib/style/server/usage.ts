import 'server-only';
import { z } from 'zod';
import type { serviceClient } from '@/lib/server/supabase';
import { reportedUsage } from './provider.mjs';

const responseSchema = z.object({
  model:z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
  modelSource:z.enum(['reported','requested']),
  requestId:z.unknown().optional(), usage:z.unknown().optional(),
  serviceTier:z.string().max(80).nullish(), serviceTierSource:z.string().max(80).nullish(),
  endpoint:z.string().max(120).nullish(), region:z.string().max(80).nullish(),
});
type Service = ReturnType<typeof serviceClient>;
export type UsageAction = 'plan'|'image'|'editorial'|'dialogue'|'composite'|'transcription'|'voice'|'inspection';

/** Retain every provider subcall before validating/saving its content.
 * SQL owns the versioned rate card and operation coverage checks. Estimates and
 * conservative usage ceilings never populate provider/invoice actual fields.
 * Missing usage remains unpriced; unknown outcomes retain their full hold.
 */
export async function recordProviderUsage({service,userId,operationId,action,response}: {
  service:Service; userId:string; operationId:string; action:UsageAction; response:unknown;
}) {
  const parsed=responseSchema.parse(response);
  const requestId=typeof parsed.requestId==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(parsed.requestId) ? parsed.requestId : null;
  // All current transports use api.openai.com. Images use the direct edits API,
  // where cache discounts do not apply. An absent text tier stays UNKNOWN.
  const rawEndpoint=parsed.endpoint?.replace(/^\/v1/, '');
  const endpoint=rawEndpoint==='/responses'?'responses':rawEndpoint==='/images/edits'?'images.edits':rawEndpoint;
  const context={
    endpoint:endpoint ?? (parsed.model.startsWith('gpt-image-')?'images.edits':'responses'),
    serviceTier:parsed.serviceTier ?? 'unknown',serviceTierSource:parsed.serviceTierSource ?? 'unknown',
    region:parsed.region ?? 'global',
  };
  const saved=await service.rpc('record_style_provider_usage',{
    p_user:userId,p_op:operationId,p_action:action,p_model:parsed.model,p_model_source:parsed.modelSource,
    p_request_id:requestId,p_usage:reportedUsage(parsed.usage),p_context:context,
  });
  if(saved.error || saved.data!==true)throw new Error('Usage could not be recorded');
}

export async function readAccountUsage({service,userId}:{service:Service;userId:string}) {
  const result=await service.rpc('read_style_usage',{p_user:userId});
  if(result.error || !result.data)throw new Error('Usage unavailable');
  return result.data;
}
