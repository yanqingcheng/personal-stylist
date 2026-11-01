import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
import { saveIntake } from '@/lib/style/server/schema';

const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  try {
    const auth = await activeUser(); if (!auth) return fail(401, 'Sign in and activate your account');
    const profile = await auth.service.from('profiles').select('id,deletion_state').eq('user_id',auth.user.id).maybeSingle();
    if (profile.error || !profile.data || profile.data.deletion_state !== 'active') return fail(404,'Profile unavailable');
    const [saved, rounds, operations] = await Promise.all([
      auth.service.from('style_intakes').select('revision,data').eq('user_id',auth.user.id).maybeSingle(),
      auth.service.from('rounds').select('id,parent_round_id,status,feedback,media_ids,created_at').eq('user_id',auth.user.id).order('created_at'),
      auth.service.from('ai_operations').select('id,kind,state,round_id').eq('user_id',auth.user.id).order('created_at'),
    ]);
    if (saved.error || rounds.error || operations.error) return fail(503,'Style consultation unavailable');
    return Response.json({intake:saved.data,rounds:rounds.data.map(r=>({id:r.id,parentRoundId:r.parent_round_id,status:r.status,feedback:r.feedback,looks:(r.media_ids ?? []).map((mediaId:string)=>({mediaId})),approved:false,editorial:null,createdAt:r.created_at})),operations:operations.data.map(o=>({id:o.id,kind:o.kind,state:o.state,roundId:o.round_id}))},{headers});
  } catch { return fail(503,'Style consultation unavailable'); }
}
export async function PUT(request:Request) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const auth=await activeUser(); if(!auth) return fail(401,'Sign in and activate your account');
    const parsed=saveIntake.safeParse(await body(request)); if(!parsed.success) return fail(400,'Invalid style intake');
    const {data,error}=await auth.service.rpc('save_style_intake',{p_user:auth.user.id,p_revision:parsed.data.expectedRevision,p_data:parsed.data.data});
    if(error) return fail(503,'Save unavailable');
    if(data.error==='conflict') return Response.json(data,{status:409,headers});
    if(data.error==='photo') return fail(400,'Select one of your ready photos');
    if(data.error) return fail(403,'Profile unavailable');
    return Response.json(data,{headers});
  } catch { return fail(503,'Save unavailable'); }
}
