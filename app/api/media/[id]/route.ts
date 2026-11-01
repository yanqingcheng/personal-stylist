import { z } from 'zod';
import { activeUser, fail, sameOrigin } from '@/lib/server/supabase';
export async function GET(_request:Request, context:{params:Promise<{id:string}>}) {
  try { const auth = await activeUser(); if (!auth) return fail(401,'Sign in and activate your account');
    const {id} = await context.params; if (!z.uuid().safeParse(id).success) return fail(404,'Photo unavailable');
    const {data:m} = await auth.service.from('media').select('object_path').eq('id',id).eq('user_id',auth.user.id).eq('status','ready').maybeSingle();
    if (!m) return fail(404,'Photo unavailable');
    const {data,error} = await auth.service.storage.from('private-media').createSignedUrl(m.object_path,60);
    if (error) return fail(503,'Photo unavailable');
    return Response.json({url:data.signedUrl},{headers:{'Cache-Control':'no-store'}});
  } catch { return fail(503,'Photo unavailable'); }
}
export async function DELETE(request:Request, context:{params:Promise<{id:string}>}) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const auth = await activeUser(); if (!auth) return fail(401,'Sign in and activate your account');
    const {id} = await context.params; if (!z.uuid().safeParse(id).success) return fail(404,'Photo unavailable');
    const changed = await auth.service.from('media').update({status:'deleting'}).eq('id',id).eq('user_id',auth.user.id).in('status',['ready','pending','failed','deleting']).select('object_path').maybeSingle();
    if (changed.error) return fail(503,'Photo deletion incomplete; retry');
    if (!changed.data) return fail(409,'Photo is unavailable or still processing');
    const removed = await auth.service.storage.from('private-media').remove([changed.data.object_path]);
    if (removed.error) return fail(503,'Photo deletion incomplete; retry');
    const deleted = await auth.service.from('media').delete().eq('id',id).eq('user_id',auth.user.id).eq('status','deleting');
    if (deleted.error) return fail(503,'Photo deletion incomplete; retry');
    return Response.json({ok:true});
  } catch { return fail(503,'Photo deletion incomplete; retry'); }
}
