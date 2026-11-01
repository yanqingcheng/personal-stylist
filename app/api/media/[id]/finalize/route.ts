import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activeUser, fail, sameOrigin } from '@/lib/server/supabase';
export async function POST(request:Request, context:{params:Promise<{id:string}>}) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try { const auth = await activeUser(); if (!auth) return fail(401,'Sign in and activate your account');
    const { id } = await context.params; if (!z.uuid().safeParse(id).success) return fail(404,'Photo unavailable');
    const { data: m } = await auth.service.from('media').update({status:'processing'}).eq('id',id).eq('user_id',auth.user.id).eq('status','pending').select('*').maybeSingle();
    if (!m) return fail(404,'Pending photo unavailable');
    const storage = auth.service.storage.from('private-media');
    try {
      const {data: blob,error} = await storage.download(m.object_path); if (error || !blob || blob.size !== m.byte_size || blob.size > 10485760) throw new Error('invalid size');
      const input = Buffer.from(await blob.arrayBuffer());
      const metadata = await sharp(input,{ limitInputPixels:40000000, failOn:'error' }).metadata();
      const formats: Record<string,string> = { jpeg:'image/jpeg',png:'image/png',webp:'image/webp' };
      if (!metadata.width || !metadata.height || metadata.width < 100 || metadata.height < 100 || formats[metadata.format ?? ''] !== m.content_type || (metadata.pages ?? 1) !== 1) throw new Error('invalid image');
      const normalized = await sharp(input,{limitInputPixels:40000000,failOn:'error'}).rotate().jpeg({quality:90}).toBuffer();
      if (normalized.length > 10485760) throw new Error('normalized image too large');
      const path = `${auth.user.id}/ready/${randomUUID()}.jpg`;
      const upload = await storage.upload(path,normalized,{contentType:'image/jpeg',upsert:false}); if (upload.error) throw upload.error;
      const saved = await auth.service.rpc('finish_media', { p_user:auth.user.id, p_id:id, p_path:path, p_size:normalized.length });
      if (!saved.data || saved.error) { await storage.remove([path]); throw new Error('save failed'); }
      await storage.remove([m.object_path]);
      return Response.json({media:{id,kind:m.kind,content_type:'image/jpeg',byte_size:normalized.length,status:'ready',created_at:m.created_at}});
    } catch { await auth.service.from('media').update({status:'failed'}).eq('id',id).eq('status','processing'); await storage.remove([m.object_path]); return fail(400,'Photo could not be processed; use a valid JPEG, PNG or WebP'); }
  } catch { return fail(503,'Photo processing unavailable'); }
}
