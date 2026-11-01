import 'server-only';
import { z } from 'zod';

export const intake = z.object({
  occasion: z.string().max(4000), preferences: z.string().max(4000),
  practicality: z.string().max(4000), wardrobe: z.string().max(4000),
  photoId: z.uuid().nullable(), adultFullBodyConfirmed: z.boolean(),
  garmentDomain: z.enum(['menswear','womenswear','']).optional(),
  fitSuccesses:z.string().max(4000).optional(), fitDifficulties:z.string().max(4000).optional(),
  changedFit:z.string().max(4000).optional(), visualImpression:z.string().max(4000).optional(), aspiration:z.string().max(4000).optional(),
}).strict();
export const saveIntake = z.object({ expectedRevision: z.number().int().nonnegative(), data: intake }).strict();
export const generation = z.object({ idempotencyKey: z.uuid(), expectedDialogueRevision:z.number().int().nonnegative(), expectedRevision: z.number().int().nonnegative(), parentRoundId: z.uuid().optional() }).strict();
export const editorial = z.object({ idempotencyKey: z.uuid(), expectedDialogueRevision:z.number().int().nonnegative(), roundId: z.uuid() }).strict();
export const feedback = z.object({ roundId: z.uuid(), expectedDialogueRevision:z.number().int().nonnegative(), feedback: z.string().max(8000), approve: z.boolean() }).strict();
