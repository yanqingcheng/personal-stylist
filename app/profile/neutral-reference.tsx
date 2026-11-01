'use client';
/* Private signed image URLs must not enter an image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColourReference } from '@/lib/colour-reference';
import styles from './neutral-reference.module.css';

type SourcePhoto={id:string;lighting?:string};
type Props = { onApproved:(reference:ColourReference|null)=>void;sourcePhotos?:SourcePhoto[];onBeforeGenerate?:()=>Promise<boolean> };
type Profile={revision:number;document:{photos?:SourcePhoto[]}};
function lightingRole(label=''):'daylight'|'indoor-colour-cast'|'supporting'|'unknown'{
  const text=label.trim().toLowerCase();
  // Use explicit user labels only. Ambiguous/mixed/blank labels stay unknown.
  if(/mixed|unknown|unsure/.test(text))return 'unknown';
  if(text==='indoor-colour-cast'||/\b(purple|blue|coloured|colored)\s+(light|lighting|cast)\b/.test(text))return 'indoor-colour-cast';
  if(text==='supporting')return 'supporting';
  if(/\b(daylight|outdoor|natural light)\b/.test(text)&&!/\b(indoor|artificial|cast)\b/.test(text))return 'daylight';
  return 'unknown';
}
export default function NeutralReference({onApproved,sourcePhotos,onBeforeGenerate}:Props) {
  const [reference,setReference] = useState<ColourReference|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [generationMessage,setGenerationMessage]=useState('Checking portrait preparation availability…');
  const [ready,setReady]=useState(false),[consent,setConsent]=useState(false),[generating,setGenerating]=useState(false),[uncertain,setUncertain]=useState(false);
  const [savedSources,setSavedSources]=useState<SourcePhoto[]>([]);
  const generationLock=useRef(false);
  const callback = useRef(onApproved);
  useEffect(()=>{callback.current=onApproved},[onApproved]);
  const load = useCallback(async()=>{
    try {
      const response = await fetch('/api/colour/reference',{cache:'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Reference unavailable');
      const next = data.reference as ColourReference|null;
      setReference(next);
      callback.current(next?.status==='approved'?next:null);
      return next;
    } catch (error) {
      callback.current(null);
      setReference(null);
      setMessage(error instanceof Error?error.message:'Reference unavailable');
      return null;
    } finally {setLoading(false)}
  },[]);
  const checkReadiness=useCallback(async()=>{
    try{
      const [availability,profile]=await Promise.all([fetch('/api/colour/reference/generate',{cache:'no-store'}),fetch('/api/profile',{cache:'no-store'})]);
      const gate=await availability.json(),saved=await profile.json();
      if(profile.ok&&Array.isArray(saved.profile?.document?.photos))setSavedSources(saved.profile.document.photos);
      setReady(availability.ok&&gate.ready===true);
      setGenerationMessage(availability.ok&&gate.ready===true?'Use two to four saved face photos. Lighting roles follow your labels; unlabelled lighting stays unknown.':gate.reasons?.includes('account_outside_release_scope')?'Portrait preparation is not available for this account.':'Portrait preparation is currently unavailable. You can still review an existing portrait below.');
    }catch{setReady(false);setGenerationMessage('Portrait preparation is temporarily unavailable. Check again later.')}
  },[]);
  useEffect(()=>{
    const start=setTimeout(()=>{void load();void checkReadiness()},0);
    const timer=setInterval(()=>void load(),240000);
    return ()=>{clearTimeout(start);clearInterval(timer)};
  },[load,checkReadiness]);
  async function generate(){
    if(generationLock.current||!ready||!consent||uncertain)return;
    generationLock.current=true;setGenerating(true);setGenerationMessage('Saving your source photos…');
    let attempted=false;
    try{
      if(onBeforeGenerate&&!(await onBeforeGenerate()))throw Error('Your photos could not be saved. Save them before preparing a portrait.');
      const response=await fetch('/api/profile',{cache:'no-store'}),data=await response.json();
      if(!response.ok||!Number.isInteger(data.profile?.revision)||!Array.isArray(data.profile?.document?.photos))throw Error('Your saved profile is unavailable. Reload before preparing a portrait.');
      const profile=data.profile as Profile,latest=profile.document.photos??[],selected=sourcePhotos??latest;
      if(selected.length<2||selected.length>4)throw Error('Save two to four original face photos before preparing a portrait.');
      if(selected.some(photo=>!latest.some(saved=>saved.id===photo.id)))throw Error('Your selected photos changed. Reload before preparing a portrait.');
      setSavedSources(latest);
      const sources=selected.map(photo=>({id:photo.id,lightingRole:lightingRole(latest.find(saved=>saved.id===photo.id)?.lighting)}));
      setGenerationMessage('Preparing your neutral-light portrait from your source photos. This can take a few minutes…');
      attempted=true;
      const generated=await fetch('/api/colour/reference/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),expectedRevision:profile.revision,consent:true,sources})});
      const result=await generated.json();
      if(!generated.ok){
        if([400,401,402,403,404,409].includes(generated.status)||result.code==='composite_release_blocked')attempted=false;
        throw Error(result.error||'Portrait preparation could not be confirmed.');
      }
      if(!result.referenceId||result.status!=='pending')throw Error('Portrait preparation is still unresolved.');
      attempted=false;await load();setConsent(false);setGenerationMessage('Your new portrait is saved and awaiting your likeness and colour review below.');
    }catch(error){
      if(attempted){setUncertain(true);setGenerationMessage(`${error instanceof Error?error.message:'The outcome is uncertain.'} Check the saved portrait before starting another request; no retry has been sent.`);await load()}
      else setGenerationMessage(error instanceof Error?error.message:'Portrait preparation is unavailable.');
    }finally{generationLock.current=false;setGenerating(false)}
  }
  async function decide(decision:'approved'|'rejected') {
    if (!reference||generating) return;
    setBusy(true);setMessage('Saving your review…');
    try {
      const response=await fetch('/api/colour/reference',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:reference.id,expectedRevision:reference.revision,decision})});
      const data=await response.json();
      if (!response.ok) { if(response.status===409) await load(); throw new Error(data.error || 'Review could not be saved'); }
      await load();
    } catch(error) {setMessage(error instanceof Error?error.message:'Review could not be saved')}
    finally {setBusy(false)}
  }
  const count=(sourcePhotos??savedSources).length;
  return <section className={styles.review} aria-label="Review your neutral-light portrait">
    <p className="eyebrow">YOUR NEUTRAL-LIGHT REFERENCE</p>
    <div className={styles.preparation}>
      <h3>Create your neutral-light portrait</h3>
      <p>Use your saved face photos together to infer a portrait in neutral light. You’ll review the generated likeness and colouring before using it.</p>
      <p>{count} saved source photo{count===1?'':'s'} · Two to four required</p>
      <label><input type="checkbox" checked={consent} disabled={busy||generating} onChange={event=>setConsent(event.target.checked)}/>These are photos of me as an adult. Use these photos to infer neutral light.</label>
      <div className={styles.actions}><button type="button" className="button primary" disabled={!ready||!consent||count<2||count>4||busy||generating||uncertain} onClick={()=>void generate()}>{generating?'Preparing portrait…':reference?'Create another neutral-light portrait':'Create neutral-light portrait'}</button><button type="button" className="text-button" disabled={generating||busy} onClick={()=>{void checkReadiness();void load()}}>Check preparation status</button></div>
      {generating&&<progress aria-label="Neutral-light portrait preparation in progress"/>}
      <p role="status" aria-live="polite">{generationMessage}</p>
    </div>
    {loading?<p role="status">Loading your saved reference…</p>:!reference?<div className={styles.empty}><p>{message||'Your portrait will appear here for review after preparation.'}</p></div>:<>
    <h3>Does this still look like you?</h3>
    <p>This generated portrait estimates neutral lighting from your original photos. It is an interpretation, not calibrated colour evidence. Check your likeness, skin, eyes and hair against the originals before using it in your colour mirror.</p>
    <div className={styles.comparison}>
      <div><h4>Original photos</h4><div className={styles.originals}>{reference.sources.map((source,index)=><figure key={source.id}><img src={source.url} alt={`Original source photo ${index+1}`} /><figcaption>Original {index+1}</figcaption></figure>)}</div></div>
      <figure className={styles.generated}><h4>Generated interpretation</h4><img src={reference.url} alt="Prepared neutral-light portrait awaiting your review" /><figcaption>{reference.provenance==='native-prepared'?'Prepared with AI for this consultation':'AI-generated reference'}</figcaption></figure>
    </div>
    {reference.status==='pending'?<div className={styles.actions}><button type="button" className="button primary" disabled={busy||generating} onClick={()=>void decide('approved')}>Approve likeness and colour</button><button type="button" className="button" disabled={busy||generating} onClick={()=>void decide('rejected')}>Reject this interpretation</button></div>:<p className={styles.result}>{reference.status==='approved'?'Approved by you. This reference can now be used in your colour mirror.':'Rejected by you. This interpretation will not be used in your colour mirror.'}</p>}
    <p role="status" aria-live="polite">{message}</p>
    <button type="button" className="text-button" disabled={busy||generating} onClick={()=>void load()}>Refresh prepared portrait</button>
    <p className={styles.note}>Your original photos stay unchanged. Approval records this portrait version separately; a replacement will need a fresh review.</p>
    </>}
  </section>;
}
