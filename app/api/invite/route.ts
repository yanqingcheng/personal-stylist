import { createHash } from 'node:crypto';
import { z } from 'zod';
import { body, fail, identity, sameOrigin, serviceClient } from '@/lib/server/supabase';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, 'Forbidden');
  try {
    const user = await identity(); if (!user) return fail(401, 'Sign in first');
    const parsed = z.object({ phrase: z.string().min(1).max(200) }).strict().safeParse(await body(request));
    if (!parsed.success) return fail(400, 'Enter your invite phrase');
    const normalized = parsed.data.phrase.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
    const digest = createHash('sha256').update(normalized).digest('hex');
    const { data, error } = await serviceClient().rpc('redeem_invite', { p_user: user.id, p_digest: digest });
    if (error) return fail(503, 'Invite redemption unavailable');
    if (data.status === 'activated') return Response.json(data);
    return fail(data.status === 'rate_limited' ? 429 : 403, data.status === 'full' ? 'This invite is full' : data.status === 'rate_limited' ? 'Too many attempts; try again later' : data.status === 'disabled' ? 'This account is disabled' : 'Invite is invalid or expired');
  } catch { return fail(503, 'Invite redemption unavailable'); }
}
