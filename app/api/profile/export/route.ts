import { activeUser, fail } from '@/lib/server/supabase';
export async function GET() {
  try { const auth = await activeUser(); if (!auth) return fail(401, 'Sign in and activate your account');
    const { data, error } = await auth.service.from('profiles').select('revision,schema_version,current_step,pause_reason,document,updated_at').eq('user_id',auth.user.id).eq('deletion_state','active').maybeSingle();
    if (error || !data) return fail(404, 'Profile unavailable');
    const document = { ...data.document }; delete document.photos; delete document.referencePhotoId;
    if (Array.isArray(document.trials)) document.trials = document.trials.map((trial: Record<string, unknown>) => { const copy = { ...trial }; delete copy.photoId; return copy; });
    return Response.json({ profile: { ...data, document } }, { headers: { 'Cache-Control':'no-store', 'Content-Disposition':'attachment; filename="profile.json"' } });
  } catch { return fail(503, 'Export unavailable'); }
}
