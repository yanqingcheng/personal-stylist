'use client';
/* Private signed images are displayed directly, with identical source/crop on both sides. */
/* eslint-disable @next/next/no-img-element */
import {useState,type CSSProperties} from 'react';
import {drapeLeft,type ColourResponse,type TrialAnswer} from '@/lib/colour';
import {nextAdaptiveComparison,type AdaptiveColourResponse} from '@/lib/colour/adaptive';
import styles from './adaptive-colour.module.css';
export type AdaptiveColourProps={
 referenceUrl:string|undefined;photoId:string;referenceLabel?:string;
 baseResponses:readonly ColourResponse[];responses:readonly AdaptiveColourResponse[];
 framing?:{sourceMediaId:string;sourceVersion:string;sourceWidth:number;sourceHeight:number;crop:{x:number;y:number;width:number;height:number}};
 crop?:{zoom:number;y:number};busy?:boolean;
 onAnswer:(response:AdaptiveColourResponse)=>Promise<boolean|void>|boolean|void;
 onContinue?:()=>void;onPause?:()=>void;
};
/** Mount key={photoId}; the caller appends exact responses and saves with profile revision CAS. */
export default function AdaptiveColour(props:AdaptiveColourProps){
 const [current,setCurrent]=useState(()=>nextAdaptiveComparison(props.baseResponses,props.responses));
 const [submitted,setSubmitted]=useState<AdaptiveColourResponse|null>(null);
 const [comment,setComment]=useState('');const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [paused,setPaused]=useState(false);
 const extra=submitted&&!props.responses.some(r=>r.trialId===submitted.trialId&&r.photoId===submitted.photoId&&r.revision===submitted.revision)?[...props.responses,submitted]:props.responses;
 const next=nextAdaptiveComparison(props.baseResponses,extra),pair=current.pair;
 const left=drapeLeft(pair.id,props.photoId),right=left==='A'?'B':'A';
 const latest=extra.filter(r=>r.trialId===pair.id&&r.photoId===props.photoId).reduce<AdaptiveColourResponse|undefined>((a,r)=>!a||r.revision>=a.revision?r:a,undefined);
 const disabled=saving||props.busy||!props.referenceUrl||!props.photoId;
 const framing=props.framing;
 const viewport:CSSProperties=framing?{aspectRatio:`${framing.crop.width*framing.sourceWidth} / ${framing.crop.height*framing.sourceHeight}`}:{aspectRatio:'3 / 4'};
 const imageStyle:CSSProperties=framing?{position:'absolute',maxWidth:'none',left:`${-100*framing.crop.x/framing.crop.width}%`,top:`${-100*framing.crop.y/framing.crop.height}%`,width:`${100/framing.crop.width}%`,height:`${100/framing.crop.height}%`,objectFit:'fill'}:{objectPosition:`50% ${props.crop?.y??50}%`,transform:`scale(${props.crop?.zoom??1})`};
 const transform=JSON.stringify(framing?{sourceMediaId:framing.sourceMediaId,sourceVersion:framing.sourceVersion,crop:framing.crop}:props.crop??{zoom:1,y:50});
 async function answer(value:TrialAnswer){
  if(disabled)return;
  const response:AdaptiveColourResponse={trialId:pair.id,photoId:props.photoId,revision:(latest?.revision??0)+1,answer:value,confirmedOnDrape:true,comment,presentation:{left,right,aColor:pair.a.color,bColor:pair.b.color,transform}};
  setSaving(true);setError('');
  try{if(await props.onAnswer(response)===false)throw Error('The observation was not saved. Please retry.');setSubmitted(response);}
  catch(e){setError(e instanceof Error?e.message:'Could not save this observation.');}
  finally{setSaving(false);}
 }
 return <section className={styles.adaptive} aria-label="Continue adaptive colour comparisons">
  <p className={styles.eyebrow}>YOUR NEXT COLOUR QUESTION</p><h2>Let’s test what is still uncertain</h2>
  <div className={styles.evidence} aria-live="polite">{next.evidence.map(axis=><p key={axis.axis}><strong>{axis.axis==='value'?'Depth':axis.axis[0].toUpperCase()+axis.axis.slice(1)}</strong>{axis.statement}</p>)}</div>
  <p>These comparisons suggest questions from your observations. They do not measure your colouring or establish a certain result.</p>
  {paused?<div className={styles.notice}><p>Your observations stay saved. Unresolved factors remain uncertain.</p><button type="button" onClick={()=>setPaused(false)}>Keep comparing</button></div>:<>
   <h3>{pair.axis==='value'?'Depth':pair.axis[0].toUpperCase()+pair.axis.slice(1)} · {pair.family}</h3><p>{current.reason}</p><p className={styles.control}>{pair.control}</p>
   <div className={styles.panels}>{([left,right] as const).map(side=>{const colour=side==='A'?pair.a:pair.b;return <button type="button" key={side} className={styles.panel} style={{background:colour.color}} aria-label={`Choose ${side}: ${colour.name}`} aria-pressed={submitted?.answer===side} disabled={disabled} onClick={()=>void answer(side)}><span className={styles.tag}>{side}</span><span className={styles.viewport} style={viewport}>{props.referenceUrl?<img src={props.referenceUrl} alt="The same unchanged reference face and neck" style={imageStyle}/>:<span>Reference unavailable. Return to your saved photos.</span>}</span><span className={styles.swatch}/><span className={styles.name}>{colour.name}</span></button>;})}</div>
   <p className={styles.method}>{props.referenceLabel??'Your selected reference.'} Both sides use exactly the same image and crop. This is colour adjacency, not reflected fabric light; lighting and screen differences remain unresolved.</p>
   <label className={styles.comment}>What do you notice about your face? <span>Optional · original words saved with this comparison</span><textarea value={comment} maxLength={4000} disabled={saving} onChange={event=>setComment(event.target.value)}/></label>
   <div className={styles.choices}>{(['both','neither','unsure'] as const).map(value=><button key={value} type="button" disabled={disabled} aria-pressed={submitted?.answer===value} onClick={()=>void answer(value)}>{value==='unsure'?'Not sure':value[0].toUpperCase()+value.slice(1)}</button>)}</div>
   {error&&<p role="alert" className={styles.notice}>{error}</p>}
   {submitted&&<p role="status" className={styles.notice}>Observation saved: {submitted.answer==='unsure'?'not sure':submitted.answer}. Both, neither and uncertainty remain in your history; they are not counted as a neutral colour factor.</p>}
   <div className={styles.actions}><button type="button" className={styles.primary} disabled={!submitted||disabled} onClick={()=>{setCurrent(next);setSubmitted(null);setComment('');setError('');}}>Next useful comparison →</button><button type="button" disabled={saving} onClick={()=>{setPaused(true);props.onPause?.();}}>Pause comparisons</button></div>
  </>}
  {props.onContinue&&<button type="button" className={styles.optional} disabled={saving} onClick={props.onContinue}>Explore candidate palettes without claiming certainty →</button>}
 </section>;
}
