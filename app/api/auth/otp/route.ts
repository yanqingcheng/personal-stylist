import { z } from 'zod';
import { body, fail, sameOrigin, userClient } from '@/lib/server/supabase';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'Forbidden');
  try {
    const parsed = z.object({ email: z.email().max(254) }).strict().safeParse(await body(request));
    if (!parsed.success) return fail(400, 'Enter a valid email address');
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (!site || new URL(site).origin !== new URL(request.url).origin) return fail(503, 'Sign-in is not configured');
    const client = await userClient();
    const { error } = await client.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: `${site.replace(/\/$/, '')}/auth/callback` } });
    if (error) return fail(503, 'Could not send sign-in email');
    return Response.json({ ok: true });
  } catch { return fail(503, 'Sign-in is unavailable'); }
}
