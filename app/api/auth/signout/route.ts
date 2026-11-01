import { fail, sameOrigin, userClient } from '@/lib/server/supabase';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'Forbidden');
  try { const client = await userClient(); const { error } = await client.auth.signOut(); if (error) return fail(503, 'Sign-out unavailable'); return Response.json({ ok: true }); }
  catch { return fail(503, 'Sign-out unavailable'); }
}
