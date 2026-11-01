import { activeUser, fail } from '@/lib/server/supabase';
import { readAccountUsage } from '@/lib/style/server/usage';

export async function GET() {
  try {
    const auth=await activeUser();
    if(!auth) return fail(401,'Sign in and activate your account to view usage');
    const usage=await readAccountUsage({service:auth.service,userId:auth.user.id});
    return Response.json(usage,{headers:{'Cache-Control':'private, no-store'}});
  } catch { return fail(503,'Usage is temporarily unavailable'); }
}
