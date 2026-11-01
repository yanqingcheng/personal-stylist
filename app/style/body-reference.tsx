'use client';
/* Private signed URLs must bypass image proxies. */
/* eslint-disable @next/next/no-img-element */
import { useCallback,useEffect,useId,useRef,useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { BodyReferenceSnapshot } from '@/lib/body-reference';
export type { BodyReferenceSnapshot } from '@/lib/body-reference';
type Props={onReady?:(snapshot:BodyReferenceSnapshot|null)=>void};
async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await fetch(path,{...init,cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error||'Body reference unavailable');return value as T}
const post=(value:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const endpoint='/api/style/body-reference';
export default function BodyReference({onReady}:Props){
 const input=useId(),callback=useRef(onReady);const[state,setState]=useState<BodyReferenceSnapshot|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[progress,setProgress]=useState<{done:number;total:number;text:string}|null>(null),[adult,setAdult]=useState(false),[fullBody,setFullBody]=useState(false);
 useEffect(()=>{callback.current=onReady},[onReady]);
 const load=useCallback(async()=>{try{const result=await request<{bodyReference:BodyReferenceSnapshot}>(endpoint);setState(result.bodyReference);callback.current?.(result.bodyReference);return result.bodyReference}catch(error){setMessage(error instanceof Error?error.message:'Body references unavailable');callback.current?.(null);return null}finally{setLoading(false)}},[]);
 useEffect(()=>{const start=setTimeout(()=>void load(),0);const refresh=setInterval(()=>void load(),240000);return()=>{clearTimeout(start);clearInterval(refresh)}},[load]);
 async function act(action:'select'|'prepare'|'approve'|'reject',mediaId?:string){if(!state||busy)return;setBusy(true);setMessage('Saving your body reference…');callback.current?.(null);try{await request(endpoint,post({action,expectedRevision:state.revision,...(action==='select'?{mediaId}:{}),...(action==='prepare'?{confirmedAdult:adult,confirmedFullBody:fullBody}:{})}));await load();if(action==='select'){setAdult(false);setFullBody(false)}setMessage(action==='approve'?'Original body reference approved.':action==='prepare'?'Your original is ready for review. No generated image has been created.':action==='reject'?'Review rejected. Select another body photo or prepare it again.':'Body source selected.')}catch(error){setMessage(error instanceof Error?error.message:'Save failed');await load()}finally{setBusy(false)}}
 async function remove(id:string){setBusy(true);try{await request(`/api/media/${id}`,{method:'DELETE'});await load();setMessage('Body photo removed. Your face photos are unchanged.')}catch(error){setMessage(error instanceof Error?error.message:'Removal failed')}finally{setBusy(false)}}
 async function upload(event:React.ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.target.files??[]);event.target.value='';if(!files.length||!state||busy)return;
  const room=4-state.photos.length-state.pending.filter(item=>item.status!=='failed').length;if(files.length>room){setMessage(`You can add ${Math.max(0,room)} more body photos. Remove an earlier body upload to make room.`);return}
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key){setMessage('Private storage is unavailable');return}
  setBusy(true);setMessage('');callback.current?.(null);const storage=createClient(url,key).storage.from('private-media');const failures:string[]=[];let added=0;
  try{for(let index=0;index<files.length;index++){
   const file=files[index];let pendingId:string|null=null;setProgress({done:index,total:files.length,text:`Uploading body photo ${index+1} of ${files.length}: ${file.name}`});
   try{
    const ext=file.name.toLowerCase().split('.').pop(),contentType=file.type||(ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='png'?'image/png':ext==='webp'?'image/webp':'');if(!['image/jpeg','image/png','image/webp'].includes(contentType)||!file.size||file.size>10485760)throw Error('Use a JPEG, PNG or WebP up to 10 MB');
    const prepared=await request<{media:{id:string;objectPath:string};upload:{token:string}}>(endpoint,post({action:'upload',contentType,byteSize:file.size}));pendingId=prepared.media.id;
    const uploaded=await storage.uploadToSignedUrl(prepared.media.objectPath,prepared.upload.token,file,{contentType});if(uploaded.error)throw Error('Upload did not finish. Check your connection.');
    setProgress({done:index,total:files.length,text:`Processing body photo ${index+1} of ${files.length}…`});await request(`/api/media/${prepared.media.id}/finalize`,post({}));pendingId=null;added++;
   }catch(error){if(pendingId){try{await request(`/api/media/${pendingId}`,{method:'DELETE'})}catch{/* Pending record remains available for explicit cleanup. */}}failures.push(`${file.name}: ${error instanceof Error?error.message:'Upload failed'}`)}
   setProgress({done:index+1,total:files.length,text:`${index+1} of ${files.length} body uploads completed`});
  }await load();setMessage(`${added} body photo${added===1?'':'s'} saved. ${failures.join(' ')}`)}finally{setBusy(false);setProgress(null)}
 }
 const selected=state?.photos.find(photo=>photo.id===state.selectedSourceId);
 return <section className="sc-reference sc-body-reference" aria-label="Your body photos and reference">
  <div className="sc-upload"><h3>Your body reference</h3><p>Add photos showing your whole body, with head and feet visible, in ordinary fitted clothing. These are separate from your face photos.</p><p>{state?.photos.length??0} of 4 body photos · Up to 10 MB each · Stored privately</p>
   <label htmlFor={input}>Add body photos</label><input id={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={loading||busy||!state||(state.photos.length+state.pending.filter(item=>item.status!=='failed').length>=4)} onChange={upload}/>
   {progress&&<div role="status"><progress max={progress.total} value={progress.done} aria-label="Body photo upload progress"/><p>{progress.text}</p></div>}
   {loading&&<p role="status">Opening your body photos…</p>}<p role="status" aria-live="polite">{message}</p>{!state&&!loading&&<button type="button" onClick={()=>void load()}>Retry opening body photos</button>}
   {state?.pending.map(item=><button type="button" key={item.id} disabled={busy||item.status==='processing'} onClick={()=>void remove(item.id)}>Cancel {item.status} body upload</button>)}
  </div>
  {selected&&<figure className="sc-selected-photo"><img src={selected.url} alt="Your selected original body photograph"/><figcaption>Original body photo · no generated anatomy or composite</figcaption></figure>}
  <div className="sc-photo-strip">{state?.photos.map((photo,index)=><div key={photo.id}><button type="button" disabled={busy} aria-pressed={selected?.id===photo.id} onClick={()=>void act('select',photo.id)}><img src={photo.url} alt={`Body source ${index+1}`}/><span>{selected?.id===photo.id?'Selected body source':`Select body photo ${index+1}`}</span></button><button type="button" disabled={busy} onClick={()=>void remove(photo.id)}>Remove body photo {index+1}</button></div>)}</div>
  {selected&&state?.referenceStatus==='uploaded'&&<div><label><input type="checkbox" checked={adult} disabled={busy} onChange={event=>setAdult(event.target.checked)}/>This photo shows me as an adult.</label><label><input type="checkbox" checked={fullBody} disabled={busy} onChange={event=>setFullBody(event.target.checked)}/>My head, body and feet are visible in this photo.</label><p>Use this original as the body reference. Generated body preparation is not available yet.</p><button type="button" disabled={busy||!adult||!fullBody} onClick={()=>void act('prepare')}>Prepare original body reference</button></div>}
  {state?.referenceStatus==='pending'&&<div><p>Review this original: is your whole body visible and is this the photo you want to use?</p><button type="button" disabled={busy} onClick={()=>void act('approve')}>Approve original body reference</button><button type="button" disabled={busy} onClick={()=>void act('reject')}>Choose another body reference</button></div>}
  {state?.referenceStatus==='approved'&&<p>Approved original body reference · coverage confirmed by you. Clothing, pose and camera perspective still affect what can be observed.</p>}
 </section>;
}
