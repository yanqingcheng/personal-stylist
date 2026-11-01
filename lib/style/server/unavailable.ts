import 'server-only';
import { z } from 'zod';
import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';

// No provider request is made until a bounded accounting and dispatch path exists.
export async function unavailable(request:Request, schema:z.ZodType) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    if (!await activeUser()) return fail(401,'Sign in and activate your account');
    if (!schema.safeParse(await body(request)).success) return fail(400,'Invalid request');
    return fail(503,'This feature is not yet available');
  } catch { return fail(503,'This feature is not yet available'); }
}
