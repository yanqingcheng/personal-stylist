import { z } from 'zod';
import { COMPOSITE_MODEL, COMPOSITE_PRICING } from './colour-composite-provider.mjs';

export const colourGenerationRequest = z.object({
  idempotencyKey:z.uuid(),
  expectedRevision:z.number().int().nonnegative(),
  consent:z.literal(true),
  // A single source parses so the route can return an actionable 409.
  sources:z.array(z.object({id:z.uuid(),lightingRole:z.enum(['daylight','indoor-colour-cast','supporting','unknown'])}).strict()).min(1).max(4),
}).strict().refine(value=>new Set(value.sources.map(source=>source.id)).size===value.sources.length,{message:'Choose different source photos'});

export const COLOUR_COMPOSITE_PROMPT_VERSION = 'neutral-light-generic-v2';
// Operator release uses the shared ledger's conservative engineering reservation.
// This does not turn an estimate into an enforced provider maximum.
export function colourGenerationGate(userId?:string) {
  const reasons:string[]=[];
  if (process.env.COLOUR_COMPOSITE_RELEASE_APPROVED!=='true') reasons.push('release_disabled');
  if (process.env.COLOUR_COMPOSITE_ENABLED!=='true') reasons.push('operator_disabled');
  const scope=(process.env.COLOUR_COMPOSITE_TEST_USER_ID??'').split(',').map(value=>value.trim()).filter(Boolean);
  if(scope.length&&(!userId||!scope.includes(userId))) reasons.push('account_outside_release_scope');
  if (!process.env.OPENAI_API_KEY) reasons.push('provider_not_configured');
  return {ready:reasons.length===0,reasons,model:COMPOSITE_MODEL,pricingVersion:COMPOSITE_PRICING.version,promptVersion:COLOUR_COMPOSITE_PROMPT_VERSION,reservationKind:'engineering-estimate' as const,reserveEstimateMicrousd:COMPOSITE_PRICING.reserveEstimateMicrousd,providerHardBound:COMPOSITE_PRICING.hardBound};
}
