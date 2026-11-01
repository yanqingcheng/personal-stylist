import { z } from 'zod';
import { COMPOSITE_MODEL, COMPOSITE_PRICING } from './colour-composite-provider.mjs';

export const colourGenerationRequest = z.object({
  idempotencyKey:z.uuid(),
  expectedRevision:z.number().int().nonnegative(),
  consent:z.literal(true),
  sources:z.array(z.object({id:z.uuid(),lightingRole:z.enum(['daylight','indoor-colour-cast','supporting','unknown'])}).strict()).length(4),
}).strict().refine(value=>new Set(value.sources.map(source=>source.id)).size===4,{message:'Choose four different source photos'});

export const COLOUR_COMPOSITE_PROMPT_VERSION = 'neutral-light-generic-v1';
// Root owns explicit prompt acceptance. Neither an environment flag nor a browser
// request can enable this while the Image 2.5 reservation is only an estimate.
function releaseReady():boolean { return false; }
export function colourGenerationGate() {
  const reasons:string[]=[];
  if (!releaseReady()) reasons.push('prompt_acceptance_pending');
  if (!COMPOSITE_PRICING.hardBound) reasons.push('verified_cost_bound_missing');
  if (process.env.COLOUR_COMPOSITE_ENABLED!=='true') reasons.push('operator_disabled');
  if (!process.env.OPENAI_API_KEY) reasons.push('provider_not_configured');
  return {ready:reasons.length===0,reasons,model:COMPOSITE_MODEL,pricingVersion:COMPOSITE_PRICING.version};
}
