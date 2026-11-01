'use client';
import { useEffect, useRef, useState } from 'react';
import type { Consultation } from '@/lib/consultation';
type Props={activeBoardId?:string|null;expectedRevision:number;onSaved?:(consultation:Consultation)=>void;onActive?:(active:boolean)=>void};
export default function ConsultationLive({activeBoardId=null,expectedRevision,onSaved,onActive}:Props){
 const [available,setAvailable]=useState(false),[active,setActive]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('Checking GPT-Live availability…'),[userText,setUserText]=useState(''),[stylistText,setStylistText]=useState('');
 const peer=useRef<RTCPeerConnection|null>(null),media=useRef<MediaStream|null>(null),channel=useRef<RTCDataChannel|null>(null),audio=useRef<HTMLAudioElement|null>(null),monitor=useRef<AbortController|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;void fetch('/api/consultation/live',{cache:'no-store'}).then(async response=>{const data=await response.json();if(mounted.current){setAvailable(response.ok&&data.available===true);setStatus(data.reason||'GPT-Live is unavailable')}}).catch(()=>{if(mounted.current)setStatus('GPT-Live is unavailable. Continue by typing.')});return()=>{mounted.current=false;if(channel.current?.readyState==='open')channel.current.send(JSON.stringify({type:'session.close'}));media.current?.getTracks().forEach(track=>track.stop());peer.current?.close();monitor.current?.abort()}},[]);
 function release(){media.current?.getTracks().forEach(track=>track.stop());peer.current?.close();monitor.current?.abort();peer.current=null;setActive(false);setBusy(false);onActive?.(false)}
 async function start(){
  if(!available||busy||active)return;setBusy(true);onActive?.(true);setUserText('');setStylistText('');
  // Capture the viewed board once so offer and monitor resolve the same choice.
  const startingBoardId=activeBoardId;
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});media.current=stream;
   const pc=new RTCPeerConnection();peer.current=pc;pc.ontrack=event=>{if(audio.current){audio.current.srcObject=event.streams[0];void audio.current.play().catch(()=>setStatus('Press play to hear the AI voice.'))}};
   for(const track of stream.getTracks())pc.addTrack(track,stream);
   const dc=pc.createDataChannel('oai-events');channel.current=dc;
   dc.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='session.started')setStatus('Connected to GPT-Live. You can speak and interrupt naturally.');if(data.type==='session.closed')setStatus('Call ended. Waiting for saved history and final usage.')}catch{/* Server monitor owns trusted persistence. */}};
   await pc.setLocalDescription(await pc.createOffer());
   if(pc.iceGatheringState!=='complete')await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Microphone connection timed out')),10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);resolve()}})});
   const response=await fetch('/api/consultation/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),expectedRevision,activeBoardId:startingBoardId,sdp:pc.localDescription?.sdp})});const created=await response.json();
   if(!response.ok||!created.operationId)throw new Error(created.error||'Live call could not be started. Do not automatically retry.');
   const abort=new AbortController();monitor.current=abort;const query=new URLSearchParams({operationId:created.operationId});if(startingBoardId)query.set('activeBoardId',startingBoardId);const watched=await fetch(`/api/consultation/live?${query}`,{signal:abort.signal,cache:'no-store'});
   if(!watched.ok||!watched.body)throw new Error('Server monitoring could not be established. Call status requires reconciliation.');
   const reader=watched.body.getReader(),decoder=new TextDecoder();let pending='',ready=false;
   setActive(true);setBusy(false);
   while(true){const next=await reader.read();if(next.done)break;pending+=decoder.decode(next.value,{stream:true});let end:number;
    while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line)continue;const event=JSON.parse(line);
     if(event.type==='monitor.ready'&&!ready){ready=true;await pc.setRemoteDescription({type:'answer',sdp:event.sdp})}
     if(event.type==='transcript'){if(event.role==='user')setUserText(value=>value+event.delta);else setStylistText(value=>value+event.delta);if(event.consultation)onSaved?.(event.consultation as Consultation)}
     if(event.type==='uncertain')setStatus(event.message);
     if(event.type==='complete')setStatus('Your GPT-Live conversation is saved.');
    }
   }
   release();
  }catch(error){setStatus(error instanceof Error?error.message:'Live connection failed');release()}
 }
 function stop(){if(channel.current?.readyState==='open')channel.current.send(JSON.stringify({type:'session.close'}));media.current?.getTracks().forEach(track=>track.stop());setBusy(true);setStatus('Ending the call and saving final conversation details…')}
 return <section className="sc-live"><button type="button" disabled={!available||busy} onClick={()=>{if(active)stop();else void start()}}>{active?'End live conversation':'Talk with GPT-Live'}</button><p role="status" aria-live="polite">{status}</p><p>AI-generated voice · full-duplex · short calls up to 60 seconds</p><audio ref={audio} autoPlay controls aria-label="GPT-Live stylist voice"/>{userText&&<p><strong>You: </strong>{userText}</p>}{stylistText&&<p><strong>Stylist: </strong>{stylistText}</p>}</section>;
}
