import { identity, serviceClient } from '@/lib/server/supabase';
export async function GET() {
  try {
    const user = await identity();
    if (!user) return Response.json({ authenticated: false, activated: false }, { headers: { 'Cache-Control': 'no-store' } });
    const { data } = await serviceClient().from('access_grants').select('cohort,active').eq('user_id', user.id).maybeSingle();
    return Response.json({ authenticated: true, activated: !!data?.active, ...(data?.active ? { cohort: data.cohort } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ authenticated: false, activated: false, unavailable: true }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
