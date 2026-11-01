'use client';
/* Private signed URLs bypass an image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type SavedPhoto={id:string;lighting?:string};
type ProfileDocument={version?:1;photos?:SavedPhoto[];referencePhotoId?:string|null;reflections?:string|Record<string,unknown>;answers?:Record<string,unknown>;trials?:unknown[]|Record<string,unknown>;selectedTemplateId?:string|null;taste?:Record<string,unknown>};
type Profile={revision:number;document:ProfileDocument};
export interface ProfileSnapshot {profileRevision:number;photos:{id:string;url:string}[];referencePhotoId:string|null}
type Props={onReady?:(profile:ProfileSnapshot|null)=>void};
class RequestError extends Error {constructor(message:string,readonly status:number){super(message)}}
async function request<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch(path,{...init,cache:'no-store'});
  const data=await response.json();
  if (!response.ok) throw new RequestError(data.error || 'This action could not be completed',response.status);
  return data as T;
}
const json=(value:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});

export default function ConsultationUpload({onReady}:Props) {
  const inputId=useId();
  const callback=useRef(onReady);
  useEffect(()=>{callback.current=onReady},[onReady]);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [draft,setDraft]=useState<ProfileDocument|null>(null);
  const [urls,setUrls]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [progress,setProgress]=useState<{done:number;total:number;phase:string}|null>(null);
  const [pending,setPending]=useState<{id:string;status:string}[]>([]);
  const [cleanup,setCleanup]=useState<string[]>([]);
  const pendingRemoval=useRef<string|null>(null);
  const refresh=useCallback(async(saved:Profile)=>{
    const entries=await Promise.all((saved.document.photos||[]).map(async photo=>{
      try {const signed=await request<{url:string}>(`/api/media/${photo.id}`);return [photo.id,signed.url] as const}
      catch {return [photo.id,''] as const}
    }));
    const next=Object.fromEntries(entries);setUrls(current=>({...current,...next}));
    const photos=entries.filter(([,url])=>!!url).map(([id,url])=>({id,url}));
    const referencePhotoId=photos.some(photo=>photo.id===saved.document.referencePhotoId)?saved.document.referencePhotoId!:photos[0]?.id||null;
    callback.current?.({profileRevision:saved.revision,photos,referencePhotoId});
  },[]);
  const load=useCallback(async()=>{
    try {
      const saved=await request<{profile?:Profile;deletionPending?:boolean}>('/api/profile');
      if (!saved.profile || saved.deletionPending) throw new Error('Your private profile is unavailable. Sign in with an activated account.');
      setProfile(saved.profile);await refresh(saved.profile);
      const uploads=await request<{pending:{id:string;status:string}[]}>('/api/media');setPending(uploads.pending||[]);
      setMessage('');
    } catch(error) {setMessage(error instanceof Error?error.message:'Photos unavailable');callback.current?.(null)}
    finally {setLoading(false)}
  },[refresh]);
  useEffect(()=>{const start=setTimeout(()=>void load(),0);return()=>clearTimeout(start)},[load]);
  useEffect(()=>{if(!profile || draft || busy)return;const timer=setInterval(()=>void refresh(profile),45000);return()=>clearInterval(timer)},[profile,draft,busy,refresh]);

  async function save(next:ProfileDocument,base:Profile) {
    setDraft(next);callback.current?.(null);
    try {
      const saved=await request<{profile:Profile}>('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:base.revision,document:next})});
      setProfile(saved.profile);setDraft(null);await refresh(saved.profile);return saved.profile;
    } catch(error) {
      setMessage(error instanceof RequestError && error.status===409?'Your profile changed elsewhere. Your uploaded photos are retained here. Retry save to merge them with the latest profile.':`${error instanceof Error?error.message:'Save failed'}. Your uploaded photos remain here; retry save.`);
      return null;
    }
  }
  async function deleteObject(id:string) {
    try {await request(`/api/media/${id}`,{method:'DELETE'});setCleanup(current=>current.filter(item=>item!==id));setPending(current=>current.filter(item=>item.id!==id));return true}
    catch {setCleanup(current=>current.includes(id)?current:[...current,id]);setMessage('Photo removed from this selection, but private storage cleanup needs a retry before its upload slot is free.');return false}
  }
  async function retrySave() {
    if (!draft || !profile) return;
    setBusy(true);
    try {
      const latest=(await request<{profile:Profile}>('/api/profile')).profile;
      const originalIds=new Set((profile.document.photos||[]).map(photo=>photo.id));
      const additions=(draft.photos||[]).filter(photo=>!originalIds.has(photo.id));
      const photos=[...(latest.document.photos||[]).filter(photo=>photo.id!==pendingRemoval.current)];
      for(const photo of additions) if(!photos.some(item=>item.id===photo.id))photos.push(photo);
      if(photos.length>4)throw new Error('The other profile now has more photos. Your new uploads are still retained here; remove a photo from the other session, then retry.');
      const selected=draft.referencePhotoId;
      const next={...latest.document,photos,referencePhotoId:photos.some(photo=>photo.id===selected)?selected:photos[0]?.id||null};
      const saved=await save(next,latest);
      if(saved){const remove=pendingRemoval.current;pendingRemoval.current=null;if(remove)await deleteObject(remove);else setMessage('Your photos are saved.');}
    } catch(error) {setMessage(error instanceof Error?error.message:'Save could not be retried')}
    finally {setBusy(false)}
  }
  async function upload(event:React.ChangeEvent<HTMLInputElement>) {
    const files=Array.from(event.target.files||[]);event.target.value='';
    if(!files.length || !profile)return;
    const current=draft||profile.document, room=4-(current.photos||[]).length;
    if(files.length>room){setMessage(room>0?`You can add ${room} more photo${room===1?'':'s'}. Select up to ${room}.`:'You have four photos. Remove one below before adding another.');return}
    const storageUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,storageKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(!storageUrl||!storageKey){setMessage('Private photo storage is unavailable. Please try again later.');return}
    setBusy(true);callback.current?.(null);setMessage('');
    const client=createClient(storageUrl,storageKey);
    let next={...current,photos:[...(current.photos||[])]};const errors:string[]=[];
    try {
      for(let index=0;index<files.length;index++) {
        const file=files[index];let pendingId:string|null=null;
        setProgress({done:index,total:files.length,phase:`Uploading photo ${index+1} of ${files.length}: ${file.name}`});
        try {
          const extension=file.name.toLowerCase().split('.').pop();const contentType=file.type||(extension==='jpg'||extension==='jpeg'?'image/jpeg':extension==='png'?'image/png':extension==='webp'?'image/webp':'');
          if(!['image/jpeg','image/png','image/webp'].includes(contentType)||!file.size||file.size>10485760)throw new Error('Choose a non-empty JPEG, PNG or WebP up to 10 MB.');
          const prepared=await request<{media:{id:string;objectPath:string};upload:{token:string}}>('/api/media',json({kind:'colour_portrait',contentType,byteSize:file.size}));
          pendingId=prepared.media.id;
          const uploaded=await client.storage.from('private-media').uploadToSignedUrl(prepared.media.objectPath,prepared.upload.token,file,{contentType});
          if(uploaded.error)throw new Error('Upload failed. Check your connection and retry.');
          setProgress({done:index,total:files.length,phase:`Finishing photo ${index+1} of ${files.length}…`});
          await request(`/api/media/${prepared.media.id}/finalize`,json({}));pendingId=null;
          next={...next,photos:[...next.photos,{id:prepared.media.id,lighting:''}],referencePhotoId:next.referencePhotoId||prepared.media.id};
          setDraft(next);
          const signed=await request<{url:string}>(`/api/media/${prepared.media.id}`).catch(()=>null);
          if(signed)setUrls(currentUrls=>({...currentUrls,[prepared.media.id]:signed.url}));
        } catch(error) {
          if(pendingId)await deleteObject(pendingId);
          errors.push(`${file.name}: ${error instanceof Error?error.message:'Upload failed'}`);
        }
        setProgress({done:index+1,total:files.length,phase:`${index+1} of ${files.length} photo uploads completed`});
      }
      if(next.photos.length>(current.photos||[]).length){setProgress(previous=>previous?{...previous,phase:'Saving your photos…'}:null);const saved=await save(next,profile);if(saved)setMessage(`Your ${next.photos.length} photo${next.photos.length===1?' is':'s are'} saved.${errors.length?' '+errors.join(' '):''}`)}
      else {setMessage(errors.join(' ')||'No photos added.');await refresh(profile)}
    } finally {setBusy(false);setProgress(null)}
  }
  async function select(id:string) {
    if(!profile)return;setBusy(true);
    const saved=await save({...profile.document,referencePhotoId:id},profile);
    if(saved)setMessage('Reference photo selected.');setBusy(false);
  }
  async function remove(id:string) {
    if(!profile)return;setBusy(true);pendingRemoval.current=id;
    const photos=(profile.document.photos||[]).filter(photo=>photo.id!==id);
    const saved=await save({...profile.document,photos,referencePhotoId:profile.document.referencePhotoId===id?photos[0]?.id||null:profile.document.referencePhotoId},profile);
    if(saved){pendingRemoval.current=null;if(await deleteObject(id))setMessage('Photo removed. You can add another.');}setBusy(false);
  }
  const document=draft||profile?.document,photos=document?.photos||[];
  const selected=photos.find(photo=>photo.id===document?.referencePhotoId)||photos[0];
  return <section className="sc-reference" aria-label="Your private consultation photos">
    <div className="sc-upload"><h3>Your photos, your consultation.</h3><p>Add clear photos of yourself in different lighting. A portrait showing your face, neck and hair is a useful starting point.</p>
      <p>{photos.length} of 4 photos · {Math.max(0,4-photos.length)} remaining · JPEG, PNG or WebP · up to 10 MB each · Stored privately</p>
      <label htmlFor={inputId}>Add your photos</label><input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={loading||busy||!!draft||photos.length>=4} onChange={upload}/>
      {photos.length>=4&&<p>You have four photos. Remove one below to make room for another.</p>}
      {progress&&<div role="status" aria-live="polite"><progress max={progress.total} value={progress.done} aria-label="Completed photo uploads"/><p>{progress.phase}</p></div>}
      {loading&&<p role="status">Opening your private photos…</p>}
      <p role="status" aria-live="polite">{message}</p>
      {!profile&&!loading&&<button type="button" onClick={()=>void load()}>Retry opening photos</button>}
      {draft&&<div><p>Your unsaved photo selection is kept here. Keep this page open until it is saved.</p><button type="button" disabled={busy} onClick={()=>void retrySave()}>Retry save with latest profile</button></div>}
      {cleanup.map(id=><button type="button" key={id} disabled={busy} onClick={()=>void deleteObject(id)}>Retry private photo cleanup</button>)}
      {pending.filter(item=>!cleanup.includes(item.id)).map(item=><button type="button" key={item.id} disabled={busy} onClick={()=>void deleteObject(item.id)}>Cancel interrupted {item.status} upload</button>)}
    </div>
    {selected&&<div className="sc-selected-photo">{urls[selected.id]?<img src={urls[selected.id]} alt="Your selected consultation reference"/>:<p>Photo preview unavailable. Your saved photo record is retained.</p>}</div>}
    <div className="sc-photo-strip">{photos.map((photo,index)=><div key={photo.id}><button type="button" disabled={busy||!!draft} aria-pressed={selected?.id===photo.id} aria-label={`Use photo ${index+1} as your reference`} onClick={()=>void select(photo.id)}>{urls[photo.id]?<img src={urls[photo.id]} alt={`Your photo ${index+1}`}/>:<span>Photo {index+1}</span>}<span>{selected?.id===photo.id?'Selected reference':`Photo ${index+1}`}</span></button><button type="button" disabled={busy||!!draft} onClick={()=>void remove(photo.id)}>Remove photo {index+1}</button></div>)}</div>
  </section>;
}
