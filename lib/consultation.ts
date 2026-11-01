import { z } from 'zod';
export const consultationInput=z.object({
 idempotencyKey:z.uuid(),text:z.string().min(1).max(12000).refine(text=>text.trim().length>0),
 expectedRevision:z.number().int().nonnegative(),activeBoardId:z.string().min(1).max(200).nullable().optional(),
}).strict();
export const consultationMessage=z.object({
 id:z.uuid(),role:z.enum(['user','stylist']),text:z.string(),source:z.enum(['user','native-codex','api']),
 createdAt:z.string(),replyTo:z.uuid().nullable(),activeBoardId:z.string().nullable(),
 liveOperationId:z.uuid().nullable().optional(),liveEventId:z.string().nullable().optional(),
 startMs:z.number().int().nonnegative().nullable().optional(),endMs:z.number().int().nonnegative().nullable().optional(),
});
export const consultationSnapshot=z.object({
 revision:z.number().int().nonnegative(),messages:z.array(consultationMessage),
 pendingReplyTo:z.uuid().nullable(),pendingCount:z.number().int().nonnegative(),
 status:z.enum(['ready','awaiting-native-reply']),approvedOutputId:z.string().nullable(),approvedOutputHash:z.string().nullable(),
});
export type ConsultationMessage=z.infer<typeof consultationMessage>;
export type Consultation=z.infer<typeof consultationSnapshot>;
export type ConsultationInput=z.infer<typeof consultationInput>;

export type ConsultationSnapshot=Consultation;
export const consultationSchema=consultationSnapshot;
