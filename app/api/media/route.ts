import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
const schema = z.object({ kind:z.literal('colour_portrait'), contentType:z.enum(['image/jpeg','image/png','image/webp']), byteSize:z.number().int().positive().max(10485760) }).strict();
export async function POST(request:Request) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try { const auth = await activeUser(); if (!auth) return fail(401,'Sign in and activate your account');
    // Expired upload tokens can no longer recreate these temporary paths.
    const leases=await auth.service.from('upload_leases').select('id,object_path').eq('user_id',auth.user.id).lt('expires_at',new Date().toISOString());
    if (!leases.error && leases.data.length) { const removed=await auth.service.storage.from('private-media').remove(leases.data.map(item=>item.object_path)); if (!removed.error) await auth.service.from('upload_leases').delete().eq('user_id',auth.user.id).in('id',leases.data.map(item=>item.id)); }
    const parsed = schema.safeParse(await body(request)); if (!parsed.success) return fail(400,'Use a JPEG, PNG or WebP up to 10 MB');
    const id = randomUUID(), objectPath = `${auth.user.id}/pending/${id}`;
    const { data, error } = await auth.service.rpc('create_pending_media',{ p_user:auth.user.id,p_id:id,p_path:objectPath,p_kind:parsed.data.kind,p_type:parsed.data.contentType,p_size:parsed.data.byteSize });
    if (error) return fail(503,'Upload unavailable'); if (data.error) return fail(403,data.error === 'storage_limit' ? 'Photo limit reached' : 'Upload unavailable');
    const signed = await auth.service.storage.from('private-media').createSignedUploadUrl(objectPath, { upsert:false });
    if (signed.error) { await auth.service.from('media').update({status:'failed'}).eq('id',id); return fail(503,'Upload unavailable'); }
    return Response.json({ media:{ id, objectPath }, upload:{ token:signed.data.token } });
  } catch { return fail(503,'Upload unavailable'); }
}

export async function GET() {
  try { const auth=await activeUser(); if(!auth) return fail(401,'Sign in and activate your account');
    const {data,error}=await auth.service.from('media').select('id,status,created_at').eq('user_id',auth.user.id).in('status',['pending','failed']);
    if(error) return fail(503,'Pending uploads unavailable');
    return Response.json({pending:data},{headers:{'Cache-Control':'no-store'}});
  } catch { return fail(503,'Pending uploads unavailable'); }
}
