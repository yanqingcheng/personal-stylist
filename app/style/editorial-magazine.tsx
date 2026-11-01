'use client';
/* Private signed approved-sheet URLs bypass image proxies. */
/* eslint-disable @next/next/no-img-element */
import{useCallback,useEffect,useId,useRef,useState,type CSSProperties}from'react';
import type{SavedEditorialLayout}from'@/lib/consultation-editorial-layout';
import styles from'./editorial-magazine.module.css';
type Props={outputId:string;documentRevision:string;editorialActionId:string;expectedRevision:number};
type Envelope={available:boolean;reason?:string|null;result:SavedEditorialLayout|null;error?:string};
export default function EditorialMagazine(props:Props){
 const titleId=useId(),lock=useRef(false),key=useRef<string|null>(null);
 const[result,setResult]=useState<SavedEditorialLayout|null>(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Opening your illustrated editorial…'),[uncertain,setUncertain]=useState(false);
 const{outputId,documentRevision,editorialActionId,expectedRevision}=props;
 const query=new URLSearchParams({outputId,documentRevision,editorialActionId,expectedRevision:String(expectedRevision)}).toString();
 const load=useCallback(async()=>{
  try{const response=await fetch('/api/consultation/editorial-layout?'+query,{cache:'no-store'}),data=await response.json()as Envelope;if(!response.ok)throw Error(data.error||'Illustrated editorial unavailable');setResult(data.result);setEnabled(data.available);setUncertain(data.result?.status==='uncertain');setMessage(data.result?.status==='succeeded'?'Your illustrated editorial is saved.':data.result?.status==='uncertain'?'The illustration outcome needs reconciliation. No retry will be sent.':data.reason??'Illustrate the saved editorial using your approved outfits.');}
  catch(error){setResult(null);setEnabled(false);setMessage(error instanceof Error?error.message:'Illustrated editorial unavailable')}
 },[query]);
 useEffect(()=>{key.current=null;const start=setTimeout(()=>void load(),0);return()=>clearTimeout(start)},[load]);
 useEffect(()=>{const interval=setInterval(()=>void load(),result?.status==='pending'||result?.status==='running'?3000:240000);return()=>clearInterval(interval)},[load,result?.status]);
 async function create(){
  if(lock.current||!enabled||uncertain)return;lock.current=true;setBusy(true);setMessage('Designing and illustrating your magazine spread from the approved outfits…');
  key.current??=crypto.randomUUID();
  let attempted=true;
  try{const response=await fetch('/api/consultation/editorial-layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({outputId,documentRevision,editorialActionId,expectedRevision,idempotencyKey:key.current})}),data=await response.json()as Envelope;if(!response.ok){if(response.status<500||(data as Envelope&{code?:string}).code==='editorial_layout_disabled')attempted=false;throw Error(data.error||'Illustration could not be confirmed')}setResult(data.result);setEnabled(data.available);setMessage(data.result?.status==='succeeded'?'Your illustrated editorial is saved.':'Your illustration request is saved. No duplicate request has been sent.');}
  catch(error){if(attempted)setUncertain(true);setMessage(error instanceof Error?error.message:'Illustration outcome is unknown. Check the saved status before trying again.');}
  finally{lock.current=false;setBusy(false)}
 }
 const layout=result?.status==='succeeded'?result.layout:null;
 return <section className={styles.wrapper} aria-label="Your illustrated editorial">
  {!layout&&<div className={styles.controls}><h3>Make it a personal magazine.</h3><p>Turn your saved editorial and approved outfits into an illustrated spread with its own composition and garment drawings.</p><button type="button" disabled={!enabled||busy||uncertain||result?.status==='running'||result?.status==='pending'} onClick={()=>void create()}>{busy?'Designing your editorial…':'Illustrate my editorial'}</button>{busy&&<progress aria-label="Illustrated editorial preparation in progress"/>}</div>}
  <p className={styles.status} role="status" aria-live="polite">{message}</p>
  {layout&&<article className={`${styles.magazine} ${styles[layout.composition]}`} style={{'--magazine-paper':layout.palette.paper,'--magazine-ink':layout.palette.ink,'--magazine-accent':layout.palette.accent}as CSSProperties}>
   <header className={styles.heading}><p className={styles.kicker}>YOUR PERSONAL STYLE EDIT</p><h2>{layout.title}</h2><p className={styles.standfirst}>{layout.standfirst}</p></header>
   <div className={styles.drawings}>{layout.illustrations.map((drawing,index)=><figure key={drawing.lookId}><svg viewBox="0 0 300 420" role="img" aria-labelledby={`${titleId}-${index}`}><title id={`${titleId}-${index}`}>{drawing.caption}</title>{drawing.paths.map((part,partIndex)=><path key={partIndex} d={part.d} fill={part.fill} stroke={part.stroke} strokeWidth={part.strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>)}</svg><figcaption>{drawing.caption}</figcaption></figure>)}</div>
   <div className={styles.copy} style={{columnCount:layout.columns}}>{layout.sections.map((section,index)=><section key={index}><h3>{section.heading}</h3><p>{section.body}</p></section>)}</div>
   <aside className={styles.note}>{layout.styleNote}</aside><footer className={styles.provenance}>Illustrated from your approved outfit sheet · garment concepts, not verified fit or body measurements</footer>
  </article>}
  {layout&&result?.approvedSheetUrl&&<details className={styles.reference}><summary>Compare with your approved outfit sheet</summary><img src={result.approvedSheetUrl} alt="The exact approved outfit sheet used for this illustrated editorial"/></details>}
  <button type="button" className={styles.refresh} disabled={busy} onClick={()=>void load()}>Refresh saved editorial</button>
 </section>;
}
