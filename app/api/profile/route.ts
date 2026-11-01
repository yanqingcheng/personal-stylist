import { z } from 'zod';
import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
const documentSchema = z.object({ version: z.number().int().min(1).max(1).optional(), photos: z.array(z.object({ id: z.uuid(), lighting: z.string().max(4000).optional() }).strict()).max(4).optional(), referencePhotoId: z.uuid().nullable().optional(), reflections: z.union([z.string().max(20000), z.record(z.string(), z.unknown())]).optional(), answers: z.record(z.string(), z.unknown()).optional(), trials: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(), selectedTemplateId: z.string().max(200).nullable().optional(), taste: z.record(z.string(), z.unknown()).optional() }).strict();
const patch = z.object({ expectedRevision: z.number().int().nonnegative(), currentStep: z.string().min(1).max(100).optional(), pauseReason: z.string().max(2000).nullable().optional(), document: documentSchema.optional() }).strict();
export async function GET() {
  try { const auth = await activeUser(); if (!auth) return fail(401, 'Sign in and activate your account');
    const { data, error } = await auth.service.from('profiles').select('*').eq('user_id', auth.user.id).maybeSingle();
    if (error || !data || data.deletion_state === 'deleted') return fail(404, 'Profile unavailable');
    if (data.deletion_state === 'deleting') return Response.json({deletionPending:true},{headers:{'Cache-Control':'no-store'}});
    return Response.json({ profile: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return fail(503, 'Profile unavailable'); }
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'Forbidden');
  try { const auth = await activeUser(); if (!auth) return fail(401, 'Sign in and activate your account');
    const parsed = patch.safeParse(await body(request)); if (!parsed.success) return fail(400, 'Invalid profile');
    const v = parsed.data;
    // Preserve the pause reason when it was not included.
    let pause = v.pauseReason;
    if (pause === undefined) { const { data } = await auth.service.from('profiles').select('pause_reason').eq('user_id', auth.user.id).maybeSingle(); pause = data?.pause_reason ?? null; }
    const { data, error } = await auth.service.rpc('save_profile', { p_user: auth.user.id, p_revision: v.expectedRevision, p_step: v.currentStep ?? null, p_pause: pause, p_document: v.document ?? null });
    if (error) return fail(503, 'Save unavailable');
    if (data.error === 'conflict') return Response.json(data, { status: 409 });
    if (data.error) return fail(403, 'Profile unavailable');
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return fail(503, 'Save unavailable'); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'Forbidden');
  try {
    const auth = await activeUser(); if (!auth) return fail(401, 'Sign in and activate your account');
    const started = await auth.service.rpc('begin_profile_deletion', {p_user:auth.user.id});
    if (started.error || !started.data) return fail(404, 'Profile unavailable');
    const {data: items,error: listError} = await auth.service.from('media').select('object_path').eq('user_id',auth.user.id);
    if (listError) return fail(503,'Deletion incomplete; please retry');
    if (items.length) { const result = await auth.service.storage.from('private-media').remove(items.map(item => item.object_path)); if (result.error) return fail(503,'Deletion incomplete; please retry'); }
    // Keep cost and reservation records for reconciliation; detach personal result references.
    const operations = await auth.service.from('ai_operations').update({round_id:null,result_ref:null}).eq('user_id',auth.user.id);
    if (operations.error) return fail(503,'Deletion incomplete; please retry');
    const rounds = await auth.service.from('rounds').delete().eq('user_id',auth.user.id);
    if (rounds.error) return fail(503,'Deletion incomplete; please retry');
    const media = await auth.service.from('media').delete().eq('user_id',auth.user.id);
    if (media.error) return fail(503,'Deletion incomplete; please retry');
    const {data:leases,error:leaseError}=await auth.service.from('upload_leases').select('id,object_path,expires_at').eq('user_id',auth.user.id);
    if(leaseError) return fail(503,'Deletion incomplete; please retry');
    const expired=leases.filter(lease=>new Date(lease.expires_at).getTime()<=Date.now());
    if(expired.length) { const removed=await auth.service.storage.from('private-media').remove(expired.map(lease=>lease.object_path)); if(removed.error) return fail(503,'Deletion incomplete; please retry'); const cleared=await auth.service.from('upload_leases').delete().eq('user_id',auth.user.id).in('id',expired.map(lease=>lease.id)); if(cleared.error) return fail(503,'Deletion incomplete; please retry'); }
    if(expired.length < leases.length) return Response.json({pending:true},{status:202,headers:{'Cache-Control':'no-store'}});
    const profile = await auth.service.from('profiles').update({document:{},current_step:'deleted',pause_reason:null,deletion_state:'deleted',updated_at:new Date().toISOString()}).eq('user_id',auth.user.id).eq('deletion_state','deleting');
    if (profile.error) return fail(503,'Deletion incomplete; please retry');
    return Response.json({ok:true});
  } catch { return fail(503,'Deletion incomplete; please retry'); }
}
