import { z } from 'zod';
import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
import type { ColourReference } from '@/lib/colour-reference';

const review = z.object({ id:z.uuid(), expectedRevision:z.number().int().nonnegative(), decision:z.enum(['approved','rejected']) }).strict();
const headers = { 'Cache-Control':'no-store' };

export async function GET() {
  try {
    const auth = await activeUser();
    if (!auth) return fail(401,'Sign in and activate your account');
    const profile = await auth.service.from('profiles').select('id,deletion_state').eq('user_id',auth.user.id).maybeSingle();
    if (profile.error || profile.data?.deletion_state !== 'active') return fail(403,'Profile unavailable');
    const {data:r,error} = await auth.service.from('colour_references').select('*').eq('user_id',auth.user.id).eq('is_current',true).maybeSingle();
    if (error) return fail(503,'Prepared reference unavailable');
    if (!r) return Response.json({reference:null},{headers});
    const ids = [r.media_id,...r.source_media_ids] as string[];
    const media = await auth.service.from('media').select('id,object_path,kind').eq('user_id',auth.user.id).eq('profile_id',profile.data.id).eq('status','ready').in('id',ids);
    if (media.error) return fail(503,'Reference photos unavailable');
    const generated = media.data.find(item=>item.id===r.media_id && item.kind==='colour_reference');
    const originals = (r.source_media_ids as string[]).map(id=>media.data.find(item=>item.id===id && (item.kind==='colour_portrait'||(r.provenance==='native-prepared'&&item.kind==='archived_source'))));
    // Native prepared lineage may retain earlier archived originals; API lineage stays current.
    // Deleted/withdrawn or foreign-profile sources never remain usable.
    if (!generated || originals.some(item=>!item)) return Response.json({reference:null},{headers});
    const signed = await Promise.all([generated,...originals].map(async item=>{
      const result = await auth.service.storage.from('private-media').createSignedUrl(item!.object_path,300);
      if (result.error) throw new Error('signing failed');
      return {id:item!.id,url:result.data.signedUrl};
    }));
    const reference:ColourReference = {id:r.id,revision:r.revision,status:r.status,mediaId:r.media_id,sourceMediaIds:r.source_media_ids,provenance:r.provenance,provenanceNote:r.provenance_note,createdAt:r.created_at,reviewedAt:r.reviewed_at,approvalVersion:r.approval_version,url:signed[0].url,sources:signed.slice(1)};
    return Response.json({reference},{headers});
  } catch { return fail(503,'Prepared reference unavailable'); }
}

export async function PATCH(request:Request) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const auth = await activeUser();
    if (!auth) return fail(401,'Sign in and activate your account');
    const parsed = review.safeParse(await body(request));
    if (!parsed.success) return fail(400,'Invalid reference review');
    const v = parsed.data;
    const result = await auth.service.rpc('review_colour_reference',{p_user:auth.user.id,p_id:v.id,p_revision:v.expectedRevision,p_decision:v.decision});
    if (result.error) return fail(503,'Review could not be saved');
    if (result.data?.error==='conflict') return fail(409,'This reference changed. Reload it before reviewing.');
    if (result.data?.error) return fail(403,'Reference or source photos unavailable');
    return Response.json({ok:true},{headers});
  } catch { return fail(503,'Review could not be saved'); }
}
