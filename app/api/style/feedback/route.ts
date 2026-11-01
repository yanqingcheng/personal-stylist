import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
import { feedback } from '@/lib/style/server/schema';
export async function POST(request:Request) {
  if (!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const auth=await activeUser(); if (!auth) return fail(401,'Sign in and activate your account');
    const input=feedback.safeParse(await body(request)); if (!input.success) return fail(400,'Invalid feedback');
    const {data,error}=await auth.service.rpc('save_style_feedback_with_dialogue',{p_user:auth.user.id,p_round:input.data.roundId,p_feedback:input.data.feedback,p_approve:input.data.approve,p_dialogue_revision:input.data.expectedDialogueRevision});
    if (error) return fail(503,'Feedback unavailable');
    if (data.error==='stale' || data.error==='in_flight') return fail(409,'This direction has changed; refresh before continuing');
    if (data.error) return fail(404,'Direction unavailable');
    return Response.json(data,{headers:{'Cache-Control':'no-store'}});
  } catch { return fail(503,'Feedback unavailable'); }
}
