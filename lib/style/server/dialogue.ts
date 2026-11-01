import 'server-only';
import { z } from 'zod';

export const dialogueInput = z.object({
  roundId: z.uuid(), text: z.string().min(1).max(8000).refine(text => text.trim().length > 0),
  expectedRevision: z.number().int().nonnegative(), expectedIntakeRevision: z.number().int().nonnegative(),
  clientMessageId: z.uuid(), answerTo: z.uuid().optional(),
}).strict();
export const savedDialogue = z.object({
  available: z.literal(true), mode: z.literal('saved-plan-assistant'), revision: z.number().int().nonnegative(),
  requiredQuestionId: z.uuid().nullable(),
  messages: z.array(z.object({id:z.uuid(), role:z.enum(['user','stylist']), text:z.string(), kind:z.enum(['message','question','answer']), roundId:z.uuid(), answerTo:z.uuid().nullable(), createdAt:z.string()})),
});
const savedPlan = z.object({looks:z.array(z.object({title:z.string().max(200).optional(),description:z.string().max(2000).optional(),reason:z.string().max(4000).optional(),sourceIds:z.array(z.string().max(100)).optional()}).passthrough()).max(10)}).passthrough();
const sources:Record<string,string> = {'intake.occasion':'your saved occasion','intake.preferences':'your saved preferences','intake.practicality':'your practical requirements','intake.wardrobe':'your wardrobe notes','profile.template':'your selected colour template','reference.photo':'the reference photo cited by the saved plan','previous.feedback':'earlier saved feedback'};

/** Rule-based assistance over saved text only. No model, vision or paid operation. */
export function consultationReply(input:{text:string; plan:unknown; answerTo?:string; domain:string}) {
  const text=input.text.trim();
  const question=/\?|^(why|how|what|which|could|can|would|is|are|do|does)\b/i.test(text);
  const rejectAll=/\b(none of (these|them)|reject (them )?all|hate (them )?all|(?:do not|don[’']?t) like (any|anything|them|these)|nothing (works|feels right)|all (wrong|bad)|dislike (them )?all|(?:like|love) (nothing|none))\b/i.test(text);
  const dislike=/\b(dislike|hate|(?:do not|don[’']?t) like|not (right|me)|doesn[’']?t (work|feel)|unhappy|unsure|not convinced|not keen|nah)\b/i.test(text);
  const specific=/\b(neck|neckline|collar|shoulder|sleeve|waist|hem|volume|texture|fabric|material|colour|color|lapel|trouser|skirt|jacket|dress|shirt|fit|tight|loose|wide|length|render|drew|drawn)\b/i.test(text);
  const likedClauses=text.split(/(?:[;.!?]|\bbut\b|\band\b)/i).map(clause=>clause.trim()).filter(clause=>/\b(i (love|like|enjoy)|keep|preserve|favourite|favorite)\b/i.test(clause)&&!(/\b(don[’']?t|do not|not sure|dislike|nothing|none)\b/i.test(clause)));
  const likes=likedClauses.length ? `You explicitly mentioned keeping or liking: ${likedClauses.map(clause=>`“${clause}”`).join('; ')}. Your full original message is saved alongside this reading; correct me if I misunderstood.\n\n` : '';
  const direction=input.domain==='mixed'?'the garment’s collar or neckline, shoulder construction, waist ease, hem or volume, texture, or overall mood':input.domain==='menswear'?'collar opening, shoulder construction, trouser shape, texture, or overall mood':'neckline, waist shaping, hem or volume, texture, or overall mood';
  const clarification=/\b(neck|neckline|collar)\b/i.test(text)?`For the ${input.domain==='mixed'?'collar or neckline':input.domain==='menswear'?'collar':'neckline'}, would you prefer a wider opening, a lower opening, or a different edge shape? Keep any texture or detail you explicitly liked; tell me which opening to try first.`:/\b(waist|tight|loose)\b/i.test(text)?'Would you like more ease, less waist shaping, or a different waist position? Choose the first change to test while keeping the details you liked.':/\b(hem|length)\b/i.test(text)?'Which hem would you change, and would you like it longer or shorter? We can keep the details you liked while testing that one change.':`What should change first: ${direction}? Name one thing to change and, if there is one, a detail you want to keep. You can reject every option; that does not end your consultation.`;
  if(rejectAll || ((dislike||/^(no|nope|nah|meh)[.! ]*$/i.test(text))&&!specific&&!question)) return {kind:'question' as const,text:likes+`I’ve saved your wording without replacing your earlier notes.\n\n${clarification}`};
  if(question) {
    const parsed=savedPlan.safeParse(input.plan);
    const terms=text.toLowerCase().match(/[a-z]{4,}/g)?.filter(word=>!['what','which','would','could','these','there','about','looks','look','does','this','that','have','with','your','mine','explain'].includes(word)) ?? [];
    const looks=parsed.success?parsed.data.looks:[];
    const matches=looks.filter(look=>terms.some(term=>`${look.title??''} ${look.description??''} ${look.reason??''}`.toLowerCase().includes(term)));
    const selected=(matches.length?matches:looks).filter(look=>look.reason?.trim()).slice(0,3);
    const reasons=selected.map((look,index)=>`${look.title||`Option ${index+1}`}: “${look.reason}”${look.sourceIds?.length?` (saved sources: ${look.sourceIds.map(id=>sources[id]??'an unrecognised saved source').join(', ')})`:''}`).join('\n\n');
    const answer=reasons?`Here is the ${matches.length?'relevant ':''}reasoning recorded with this plan:\n\n${reasons}\n\nThese are saved styling hypotheses. I cannot inspect the rendered image, verify fit or proportions, or establish new body or colour facts here. ${matches.length?'If this does not address your question, name the option and detail you mean.':'I could not reliably match your question to one detail, so these are the available reasons rather than a new personal explanation.'}`:'The saved plan has no usable reason for that question. I cannot honestly establish why this detail suits you from the evidence available here. Name the option and detail you want to test, and we can keep that question with the next revision.';
    return input.answerTo?{kind:'question' as const,text:likes+answer+`\n\nYour earlier clarification is still open: ${clarification}`}:{kind:'message' as const,text:likes+answer};
  }
  const rendering=/\b(drew|drawn|render|rendering|distort|proportions|wider shoulders)\b/i.test(text);
  return {kind:'message' as const,text:likes+`I’ve saved ${input.answerTo?'your answer':'your message'} exactly as written and kept the earlier conversation.${rendering?' A reported drawing error is a rendering correction, not evidence that your body or garment preferences changed. Any affected visual comparison remains inconclusive.':''} ${specific?'The next revision should use these specific garment notes alongside your earlier likes and constraints.':'Your wording remains available for the next revision; I have not inferred a body characteristic or a garment preference you did not state.'} This does not approve a direction. New visual options remain a separate request, subject to feature availability and your allowance.`};
}
