import { z } from 'zod';
import type { serviceClient } from './server/supabase';

export const bodyReferenceAction=z.discriminatedUnion('action',[
 z.object({action:z.literal('upload'),contentType:z.enum(['image/jpeg','image/png','image/webp']),byteSize:z.number().int().positive().max(10485760)}).strict(),
 z.object({action:z.literal('select'),expectedRevision:z.number().int().nonnegative(),mediaId:z.uuid()}).strict(),
 z.object({action:z.literal('prepare'),expectedRevision:z.number().int().nonnegative(),confirmedAdult:z.literal(true),confirmedFullBody:z.literal(true)}).strict(),
 z.object({action:z.enum(['approve','reject']),expectedRevision:z.number().int().nonnegative()}).strict(),
]);
export type BodyReferenceSnapshot={
 revision:number;
 photos:{id:string;url:string}[];
 pending:{id:string;status:string}[];
 selectedSourceId:string|null;
 referenceStatus:'empty'|'uploaded'|'pending'|'approved';
 referenceUrl:string|null;
 provenance:'original'|null;
 coverage:'user-confirmed-full-body'|'unconfirmed';
 generatedReferenceStatus:'not-prepared';
};

/** Server caller must still inspect actual pixels; coverage is the user's report. */
export async function loadApprovedBodySource({service,userId,profileId}:{service:ReturnType<typeof serviceClient>;userId:string;profileId:string}){
 const state=await service.from('style_body_references').select('selected_media_id,revision,reference_status,confirmed_adult,confirmed_full_body').eq('user_id',userId).eq('profile_id',profileId).maybeSingle();
 if(state.error||!state.data?.selected_media_id||state.data.reference_status!=='approved'||!state.data.confirmed_adult||!state.data.confirmed_full_body)throw Error('body_reference_required');
 const media=await service.from('media').select('id,object_path').eq('id',state.data.selected_media_id).eq('user_id',userId).eq('profile_id',profileId).eq('kind','body_reference').eq('status','ready').maybeSingle();
 if(media.error||!media.data)throw Error('body_source_unavailable');
 return {id:media.data.id as string,objectPath:media.data.object_path as string,bodyRevision:state.data.revision as number,coverage:'user-confirmed-full-body' as const,referenceProvenance:'original' as const};
}
