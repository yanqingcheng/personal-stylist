import { z } from 'zod';
import { body, fail, sameOrigin, userClient } from '@/lib/server/supabase';
const schema = z.object({ mode:z.enum(['signup','signin']), email:z.email().max(254), password:z.string().min(10).max(128) }).strict();
export async function POST(request:Request) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const parsed=schema.safeParse(await body(request));
    if (!parsed.success) return fail(400,'Enter an email address and a password of 10 to 128 characters.');
    const {mode,email,password}=parsed.data;
    const client=await userClient();
    const result=mode==='signup' ? await client.auth.signUp({email,password}) : await client.auth.signInWithPassword({email,password});
    if (result.error) return fail(400, mode==='signup' ? 'Could not create the account. If you already have one, sign in.' : 'Email or password was not accepted.');
    if (!result.data.session) return fail(503,'Password access is not configured yet.');
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch { return fail(503,'Sign-in is unavailable.'); }
}
