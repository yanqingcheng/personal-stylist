import { activeUser, body, fail, sameOrigin } from '@/lib/server/supabase';
import { consultationReply, dialogueInput, savedDialogue } from '@/lib/style/server/dialogue';
const headers={'Cache-Control':'no-store'};

export async function GET() {
  try {
    const auth=await activeUser(); if(!auth) return fail(401,'Sign in and activate your account');
    const result=await auth.service.rpc('read_style_dialogue',{p_user:auth.user.id});
    if(result.error) return fail(503,'Saved conversation unavailable');
    const parsed=savedDialogue.safeParse(result.data);
    if(!parsed.success) return fail(503,'Saved conversation unavailable');
    return Response.json({dialogue:parsed.data},{headers});
  } catch { return fail(503,'Saved conversation unavailable'); }
}
export async function POST(request:Request) {
  if(!sameOrigin(request)) return fail(403,'Forbidden');
  try {
    const auth=await activeUser(); if(!auth) return fail(401,'Sign in and activate your account');
    const parsed=dialogueInput.safeParse(await body(request)); if(!parsed.success) return fail(400,'Write a message of up to 8,000 characters');
    const input=parsed.data;
    const [saved,details,intake]=await Promise.all([
      auth.service.rpc('read_style_dialogue',{p_user:auth.user.id}),
      auth.service.from('style_round_details').select('plan').eq('round_id',input.roundId).eq('user_id',auth.user.id).maybeSingle(),
      auth.service.from('style_intakes').select('data').eq('user_id',auth.user.id).maybeSingle(),
    ]);
    const dialogue=savedDialogue.safeParse(saved.data);
    if(saved.error||details.error||intake.error||!dialogue.success||!details.data||!intake.data) return fail(503,'Saved conversation unavailable; your message has not been discarded');
    const domain=intake.data.data.garmentDomain;
    if(domain!=='menswear'&&domain!=='womenswear'&&domain!=='mixed') return fail(409,'Choose menswear, womenswear, or mixed garments before continuing; your message has not been discarded');
    const reply=consultationReply({text:input.text,plan:details.data.plan,answerTo:input.answerTo,domain});
    const result=await auth.service.rpc('append_style_dialogue',{
      p_user:auth.user.id,p_round:input.roundId,p_revision:input.expectedRevision,p_intake_revision:input.expectedIntakeRevision,
      p_message:input.clientMessageId,p_text:input.text,p_answer_to:input.answerTo??null,p_reply:reply.text,p_reply_kind:reply.kind,
    });
    if(result.error) return fail(503,'Could not confirm the save. Keep your message and retry');
    if(['conflict','stale','in_flight','question'].includes(result.data?.error)) return Response.json({error:'The saved conversation changed. Reload it while keeping your message.',code:result.data.error},{status:409,headers});
    if(result.data?.error) return fail(404,'Direction unavailable');
    const updated=savedDialogue.safeParse(result.data?.dialogue);
    if(!updated.success) return fail(503,'Could not confirm the saved conversation. Keep your message and retry');
    return Response.json({dialogue:updated.data},{headers});
  } catch { return fail(503,'Conversation unavailable. Your message is still here'); }
}
