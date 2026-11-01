import { fail, sameOrigin, userClient } from '@/lib/server/supabase';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'Forbidden');
  try { const client = await userClient(); await client.auth.signOut(); return Response.json({ ok: true }); }
  catch { return fail(503, 'Sign-out unavailable'); }
}
