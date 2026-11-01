import 'server-only';
import { z } from 'zod';

export const intake = z.object({
  occasion: z.string().max(4000), preferences: z.string().max(4000),
  practicality: z.string().max(4000), wardrobe: z.string().max(4000),
  photoId: z.uuid().nullable(), adultFullBodyConfirmed: z.boolean(),
}).strict();
export const saveIntake = z.object({ expectedRevision: z.number().int().nonnegative(), data: intake }).strict();
export const generation = z.object({ idempotencyKey: z.uuid(), expectedRevision: z.number().int().nonnegative(), parentRoundId: z.uuid().optional() }).strict();
export const editorial = z.object({ idempotencyKey: z.uuid(), roundId: z.uuid() }).strict();
export const feedback = z.object({ roundId: z.uuid(), feedback: z.string().max(8000), approve: z.boolean() }).strict();
