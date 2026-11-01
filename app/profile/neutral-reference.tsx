'use client';
/* Private signed image URLs must not enter an image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColourReference } from '@/lib/colour-reference';
import styles from './neutral-reference.module.css';

type Props = { onApproved:(reference:ColourReference|null)=>void };
export default function NeutralReference({onApproved}:Props) {
  const [reference,setReference] = useState<ColourReference|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
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
      setMessage('');
    } catch (error) {
      callback.current(null);
      setReference(null);
      setMessage(error instanceof Error?error.message:'Reference unavailable');
    } finally {setLoading(false)}
  },[]);
  useEffect(()=>{
    const start=setTimeout(()=>void load(),0);
    const timer=setInterval(()=>void load(),240000);
    return ()=>{clearTimeout(start);clearInterval(timer)};
  },[load]);
  async function decide(decision:'approved'|'rejected') {
    if (!reference) return;
    setBusy(true);setMessage('Saving your review…');
    try {
      const response=await fetch('/api/colour/reference',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:reference.id,expectedRevision:reference.revision,decision})});
      const data=await response.json();
      if (!response.ok) { if(response.status===409) await load(); throw new Error(data.error || 'Review could not be saved'); }
      await load();
    } catch(error) {setMessage(error instanceof Error?error.message:'Review could not be saved')}
    finally {setBusy(false)}
  }
  if (loading) return <p role="status">Loading your prepared reference…</p>;
  if (!reference) return <div className={styles.empty}><p>{message || 'A prepared neutral-light portrait will appear here when it is ready for your review.'}</p><button type="button" className="text-button" onClick={()=>void load()}>Check for a prepared portrait</button></div>;
  return <section className={styles.review} aria-label="Review your neutral-light portrait">
    <p className="eyebrow">YOUR NEUTRAL-LIGHT REFERENCE</p>
    <h3>Does this still look like you?</h3>
    <p>This generated portrait estimates neutral lighting from your original photos. It is an interpretation, not calibrated colour evidence. Check your likeness, skin, eyes and hair against the originals before using it in your colour mirror.</p>
    <div className={styles.comparison}>
      <div><h4>Original photos</h4><div className={styles.originals}>{reference.sources.map((source,index)=><figure key={source.id}><img src={source.url} alt={`Original source photo ${index+1}`} /><figcaption>Original {index+1}</figcaption></figure>)}</div></div>
      <figure className={styles.generated}><h4>Generated interpretation</h4><img src={reference.url} alt="Prepared neutral-light portrait awaiting your review" /><figcaption>{reference.provenance==='native-prepared'?'Prepared with AI for this consultation':'AI-generated reference'}</figcaption></figure>
    </div>
    {reference.status==='pending'?<div className={styles.actions}><button type="button" className="button primary" disabled={busy} onClick={()=>void decide('approved')}>Approve likeness and colour</button><button type="button" className="button" disabled={busy} onClick={()=>void decide('rejected')}>Reject this interpretation</button></div>:<p className={styles.result}>{reference.status==='approved'?'Approved by you. This reference can now be used in your colour mirror.':'Rejected by you. This interpretation will not be used in your colour mirror.'}</p>}
    <p role="status" aria-live="polite">{message}</p>
    <button type="button" className="text-button" disabled={busy} onClick={()=>void load()}>Refresh prepared portrait</button>
    <p className={styles.note}>Your original photos stay unchanged. Approval records this portrait version separately; a replacement will need a fresh review.</p>
  </section>;
}
