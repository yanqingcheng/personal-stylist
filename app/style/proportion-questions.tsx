'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import styles from './proportion-questions.module.css';

const questionIds=['vertical-impression','torso-leg-relation','shoulder-breadth','shoulder-edge'] as const;
const choiceSchema=z.enum(['A','B','both','neither','unsure']);
const answerSchema=z.object({questionId:z.enum(questionIds),answer:choiceSchema,statement:z.string().min(1).max(700),source:z.literal('user-visual-report'),updatedAt:z.string()});
export type ProportionAnswer=z.infer<typeof answerSchema>;
export type ProportionQuestionsProps={onComplete?:(answers:ProportionAnswer[])=>void;onSaved?:(answers:ProportionAnswer[],complete:boolean)=>void};
type QuestionId=typeof questionIds[number];
type Choice=z.infer<typeof choiceSchema>;
type Saved=Partial<Record<QuestionId,ProportionAnswer>>;
const record=z.record(z.string(),z.unknown());
const profileSchema=z.object({profile:z.object({revision:z.number().int().nonnegative(),deletion_state:z.string().optional(),document:record})});
const questions:{id:QuestionId;title:string;prompt:string;note:string;labels:readonly[string,string];statements:readonly[string,string]}[]=[
 {id:'vertical-impression',title:'The overall line',prompt:'In a straight-on photo, which overall outline feels closer to what you notice?',note:'This is an impression of the outline, not your measured height. Camera position and clothing can change it.',labels:['More extended line','More compact line'],statements:['My overall outline can appear more extended.','My overall outline can appear more compact.']},
 {id:'torso-leg-relation',title:'Where you notice length',prompt:'Which torso-to-leg relationship looks closer to your own observation?',note:'Compare the torso and legs within each diagram. This does not estimate your measurements or decide a trouser rise.',labels:['More length through the torso','More length through the legs'],statements:['I notice relatively more length through my torso.','I notice relatively more length through my legs.']},
 {id:'shoulder-breadth',title:'Shoulder span',prompt:'Which shoulder span looks closer relative to the rest of your outline?',note:'Only the span changes here. Broadness does not tell us whether the corners are sharp or rounded.',labels:['Relatively broader span','Relatively narrower span'],statements:['I notice a relatively broader shoulder span.','I notice a relatively narrower shoulder span.']},
 {id:'shoulder-edge',title:'The shoulder outline',prompt:'At a similar span, which shoulder edge looks closer to what you notice?',note:'The two spans are the same. Edge definition is separate from breadth, slope, strength and clothing preference.',labels:['More defined corners','More rounded corners'],statements:['I notice more defined corners in my shoulder outline.','I notice more rounded corners in my shoulder outline.']},
];
function readAnswers(document:Record<string,unknown>):Saved {
 const answers=record.safeParse(document.answers);const collection=record.safeParse(answers.success?answers.data.bodyProportionAnswers:undefined);const result:Saved={};
 if(collection.success)for(const id of questionIds){const parsed=answerSchema.safeParse(collection.data[id]);if(parsed.success&&parsed.data.questionId===id)result[id]=parsed.data;}
 return result;
}
const ordered=(answers:Saved)=>questionIds.flatMap(id=>answers[id]?[answers[id]]:[]);
function statementFor(question:typeof questions[number],choice:Choice){
 if(choice==='A')return question.statements[0];if(choice==='B')return question.statements[1];
 if(choice==='both')return `Both diagrams for ${question.title.toLowerCase()} can describe my observations in different photos or contexts.`;
 if(choice==='neither')return `Neither diagram for ${question.title.toLowerCase()} describes my observation well.`;
 return `I am unsure about ${question.title.toLowerCase()}; leave this observation open.`;
}

/** Original schematic drawings: no source portrait, inferred measurements or body-type labels. */
export function ProportionDiagram({questionId,side}:{questionId:QuestionId;side:'A'|'B'}){
 const a=side==='A';const upper=questionId==='shoulder-breadth'||questionId==='shoulder-edge';
 if(upper){
  const left=questionId==='shoulder-breadth'?(a?38:54):38;const right=180-left;
  const defined=questionId==='shoulder-edge'&&a;
  const contour=defined?`M 76 61 L 76 72 L ${left+12} 77 L ${left} 89 L ${left-2} 177 M 104 61 L 104 72 L ${right-12} 77 L ${right} 89 L ${right+2} 177`:`M 76 61 L 76 72 Q ${left} 76 ${left} 94 L ${left-2} 177 M 104 61 L 104 72 Q ${right} 76 ${right} 94 L ${right+2} 177`;
  return <svg viewBox="0 0 180 220" role="img" aria-label={`Diagram ${side}: ${questionId==='shoulder-breadth'?(a?'broader':'narrower')+' shoulder span with the same rounded edge':(a?'defined':'rounded')+' shoulder corners at the same span'}`}>
   <circle cx="90" cy="40" r="23" className={styles.outline}/><path d={contour} className={styles.outline}/><path d="M 64 111 L 65 177 Q 90 187 115 177 L 116 111" className={styles.quietLine}/>
   {questionId==='shoulder-breadth'?<path d={`M ${left} 66 V 57 H ${right} V 66`} className={styles.guide}/>:<><circle cx={left+6} cy="87" r="13" className={styles.guideCircle}/><circle cx={right-6} cy="87" r="13" className={styles.guideCircle}/></>}
  </svg>;
 }
 const vertical=questionId==='vertical-impression';const top=vertical?(a?16:32):16;const radius=vertical?(a?13:17):14;const shoulder=vertical?(a?58:77):60;const hip=vertical?(a?142:147):(a?153:124);const foot=vertical?(a?242:228):242;const span=vertical?(a?31:38):33;
 return <svg viewBox="0 0 180 260" role="img" aria-label={`Diagram ${side}: ${vertical?(a?'more extended overall line':'more compact overall line'):(a?'longer torso and shorter legs':'shorter torso and longer legs')} schematic`}>
  <circle cx="90" cy={top+radius} r={radius} className={styles.outline}/>
  <path d={`M 82 ${top+radius*2} L 82 ${shoulder-7} L ${90-span} ${shoulder} L 63 ${hip-14} Q 61 ${hip} 67 ${hip+10} L 68 ${foot} M 98 ${top+radius*2} L 98 ${shoulder-7} L ${90+span} ${shoulder} L 117 ${hip-14} Q 119 ${hip} 113 ${hip+10} L 112 ${foot} M 90 ${hip+7} L 90 ${foot-1} M 60 ${foot} H 76 M 104 ${foot} H 120`} className={styles.outline}/>
  <path d={`M ${90-span} ${shoulder+3} L 48 ${hip+14} M ${90+span} ${shoulder+3} L 132 ${hip+14}`} className={styles.quietLine}/>
  {!vertical&&<><path d={`M 61 ${hip} H 119`} className={styles.guide}/><path d={`M 143 ${shoulder} H 151 V ${hip} H 143 M 143 ${hip+6} H 151 V ${foot} H 143`} className={styles.guide}/></>}
 </svg>;
}

export default function ProportionQuestions({onComplete,onSaved}:ProportionQuestionsProps){
 const [saved,setSaved]=useState<Saved>({});const [drafts,setDrafts]=useState<Partial<Record<QuestionId,Choice>>>({});const [index,setIndex]=useState(0);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [status,setStatus]=useState('');const [error,setError]=useState('');const [finished,setFinished]=useState(false);
 const callbacks=useRef({onComplete,onSaved});const mounted=useRef(true);const lock=useRef(false);
 useEffect(()=>{callbacks.current={onComplete,onSaved}},[onComplete,onSaved]);
 const load=useCallback(async()=>{setLoading(true);setError('');try{const response=await fetch('/api/profile',{cache:'no-store'});if(!response.ok)throw new Error(response.status===401?'Sign in to save your observations.':'Your observations could not be loaded.');const value:unknown=await response.json();const result=profileSchema.parse(value);if(result.profile.deletion_state&&result.profile.deletion_state!=='active')throw new Error('Your profile is unavailable.');const answers=readAnswers(result.profile.document);if(!mounted.current)return;setSaved(answers);const missing=questionIds.findIndex(id=>!answers[id]);setIndex(missing<0?0:missing);setStatus(ordered(answers).length?'Your saved observations are here. You can change any answer.':'');callbacks.current.onSaved?.(ordered(answers),questionIds.every(id=>!!answers[id]));}catch(reason){if(mounted.current)setError(reason instanceof Error&&!(reason instanceof z.ZodError)?reason.message:'Your observations could not be loaded.');}finally{if(mounted.current)setLoading(false)}},[]);
 useEffect(()=>{mounted.current=true;const timer=setTimeout(()=>void load(),0);return()=>{mounted.current=false;clearTimeout(timer)}},[load]);
 const question=questions[index];const choice=drafts[question.id]??saved[question.id]?.answer;const complete=questionIds.every(id=>!!saved[id]);
 async function saveAndContinue(){
  if(!choice||loading||saving||lock.current)return;lock.current=true;setSaving(true);setError('');setStatus('Saving your observation…');
  try{
   // Read immediately before the revisioned merge so other profile fields and
   // other question answers are preserved; a concurrent save still returns409.
   const current=await fetch('/api/profile',{cache:'no-store'});if(!current.ok)throw new Error('Could not open your current profile. Your choice is still selected.');const raw:unknown=await current.json();const profile=profileSchema.parse(raw).profile;
   if(profile.deletion_state&&profile.deletion_state!=='active')throw new Error('Your profile is unavailable. Your choice is still selected.');
   const oldAnswers=record.safeParse(profile.document.answers);if(profile.document.answers!==undefined&&!oldAnswers.success)throw new Error('Your saved answers need review before this choice can be merged.');const answers=oldAnswers.success?oldAnswers.data:{};
   const oldCollection=record.safeParse(answers.bodyProportionAnswers);const collection=oldCollection.success?oldCollection.data:{};
   const answer:ProportionAnswer={questionId:question.id,answer:choice,statement:statementFor(question,choice),source:'user-visual-report',updatedAt:new Date().toISOString()};
   const document={...profile.document,answers:{...answers,bodyProportionAnswers:{...collection,[question.id]:answer}}};
   const response=await fetch('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:profile.revision,document})});
   if(!response.ok)throw new Error(response.status===409?'Your profile changed while saving. Your choice is still selected; save again to merge it with the latest profile.':'Your observation could not be saved. Your choice is still selected.');
   const value:unknown=await response.json();const result=profileSchema.parse(value);const next=readAnswers(result.profile.document);if(!next[question.id]||next[question.id]?.answer!==choice)throw new Error('Save could not be confirmed. Your choice is still selected.');
   if(!mounted.current)return;setSaved(next);setStatus('Saved to your profile.');const all=ordered(next),ready=questionIds.every(id=>!!next[id]);callbacks.current.onSaved?.(all,ready);
   if(index<questions.length-1)setIndex(index+1);else if(ready){setFinished(true);callbacks.current.onComplete?.(all);}else setIndex(questionIds.findIndex(id=>!next[id]));
  }catch(reason){if(mounted.current){setStatus('');setError(reason instanceof Error&&!(reason instanceof z.ZodError)?reason.message:'Your observation could not be saved. Your choice is still selected.');}}
  finally{lock.current=false;if(mounted.current)setSaving(false)}
 }
 return <section className={styles.panel} aria-label="Visual proportion observations">
  <header className={styles.header}><p className={styles.eyebrow}>YOUR OBSERVATIONS · {index+1} / {questions.length}</p><span>{ordered(saved).length} saved</span></header>
  <h2 className={styles.title}>{finished?'Your observations are saved.':question.title}</h2>
  {finished?<><p className={styles.copy}>These remain your reports. They do not determine a body type, measurement or clothing preference.</p><button type="button" className={styles.secondary} onClick={()=>{setFinished(false);setIndex(0)}}>Review my answers</button></>:<>
   <p className={styles.copy}>{question.prompt}</p><p className={styles.note}>{question.note}</p>
   <fieldset className={styles.fieldset} disabled={loading||saving}><legend className={styles.diagramNote}>Original schematic diagrams · illustrations, not photographs or measurements of you</legend>
    <div className={styles.pictures}>{(['A','B'] as const).map((side,i)=><button type="button" key={side} aria-pressed={choice===side} className={`${styles.picture} ${choice===side?styles.selected:''}`} onClick={()=>{setDrafts(values=>({...values,[question.id]:side}));setStatus('');setError('')}}><span className={styles.letter}>{side}</span><ProportionDiagram questionId={question.id} side={side}/><strong>{question.labels[i]}</strong></button>)}</div>
    <div className={styles.otherChoices}>{(['both','neither','unsure'] as const).map(answer=><button type="button" key={answer} aria-pressed={choice===answer} className={choice===answer?styles.selected:''} onClick={()=>{setDrafts(values=>({...values,[question.id]:answer}));setStatus('');setError('')}}>{answer==='unsure'?'Not sure':answer==='both'?'Both / varies':'Neither'}</button>)}</div>
   </fieldset>
   {choice&&<p className={styles.selection}>{saved[question.id]?.answer===choice?'Saved observation: ':'Your selection: '}{statementFor(question,choice)}</p>}
   <div className={styles.actions}><button type="button" className={styles.secondary} disabled={index===0||loading||saving} onClick={()=>{setIndex(value=>Math.max(0,value-1));setError('');setStatus('')}}>← Back</button><button type="button" className={styles.primary} disabled={!choice||loading||saving} onClick={()=>void saveAndContinue()}>{saving?'Saving…':index===questions.length-1?'Save and continue':'Save & next'} <span aria-hidden="true">→</span></button></div>
  </>}
  <p className={styles.status} role="status">{loading?'Loading saved observations…':status}</p>{error&&<p className={styles.error} role="alert">{error} {!ordered(saved).length&&<button type="button" onClick={()=>void load()}>Try loading again</button>}</p>}
  {complete&&!finished&&<p className={styles.note}>All four answers are saved. Reviewing them does not assign a type.</p>}
 </section>;
}
