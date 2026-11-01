'use client';
import { useEffect, useRef, useState } from 'react';
import type { Consultation } from '@/lib/consultation';

type Props={expectedRevision:number;activeBoardId?:string|null;onSaved?:(consultation:Consultation)=>void};
function wavBlob(samples:Float32Array){
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
  text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,index)=>{const value=Math.max(-1,Math.min(1,sample));view.setInt16(44+index*2,value<0?value*32768:value*32767,true)});
  return new Blob([buffer],{type:'audio/wav'});
}
export default function ConsultationVoice({expectedRevision,activeBoardId=null,onSaved}:Props){
  const [available,setAvailable]=useState(false),[status,setStatus]=useState('Checking voice availability…'),[recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[audioUrl,setAudioUrl]=useState('');
  const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),playback=useRef(''),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;void fetch('/api/consultation/voice',{cache:'no-store'}).then(async response=>{const data=await response.json();if(mounted.current){setAvailable(response.ok&&data.available===true);setStatus(data.reason||'Voice is unavailable. Continue in the text conversation.')}}).catch(()=>setStatus('Voice is unavailable. Continue in the text conversation.'));return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);if(recorder.current){recorder.current.onstop=null;if(recorder.current.state==='recording')recorder.current.stop()}stream.current?.getTracks().forEach(track=>track.stop());if(playback.current)URL.revokeObjectURL(playback.current)}},[]);
  async function send(blob:Blob,revision:number,key:string){
    setBusy(true);setStatus('Preparing your spoken message…');
    try{
      const context=new AudioContext();let decoded:AudioBuffer;
      try{decoded=await context.decodeAudioData(await blob.arrayBuffer())}finally{await context.close()}
      if(decoded.duration<=0||decoded.duration>30)throw new Error('Keep each spoken message under 30 seconds. Please record again.');
      const resampler=new OfflineAudioContext(1,Math.floor(decoded.duration*16000),16000),source=resampler.createBufferSource();source.buffer=decoded;source.connect(resampler.destination);source.start();
      const normalized=await resampler.startRendering(),audio=wavBlob(normalized.getChannelData(0));
      const form=new FormData();form.set('audio',audio,'utterance.wav');form.set('idempotencyKey',key);form.set('expectedRevision',String(revision));if(activeBoardId)form.set('activeBoardId',activeBoardId);
      setStatus('Listening to your message and preparing a reply…');
      const response=await fetch('/api/consultation/voice',{method:'POST',body:form});const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Voice turn could not be completed. Do not automatically retry a sent request.');
      if(data.consultation)onSaved?.(data.consultation as Consultation);
      if(typeof data.audioBase64==='string'){
        const bytes=Uint8Array.from(atob(data.audioBase64),character=>character.charCodeAt(0));if(playback.current)URL.revokeObjectURL(playback.current);playback.current=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));setAudioUrl(playback.current);
      }
      setStatus('Your spoken message and reply are saved in this conversation. Play the AI-generated voice below.');
    }catch(error){setStatus(error instanceof Error?error.message:'Voice turn failed. Your typed conversation remains available.')}
    finally{setBusy(false)}
  }
  async function start(){
    if(!available||busy)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setStatus('Recording is unavailable in this browser. Please use the text conversation.');return}
    try{
      const media=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=media;
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      const device=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=device;const chunks:Blob[]=[];const revision=expectedRevision,key=crypto.randomUUID();
      device.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
      device.onstop=()=>{if(timer.current)clearTimeout(timer.current);media.getTracks().forEach(track=>track.stop());setRecording(false);if(mounted.current)void send(new Blob(chunks,{type:device.mimeType}),revision,key)};
      device.start();setRecording(true);setStatus('Recording — stop when you finish, up to 30 seconds.');timer.current=setTimeout(()=>{if(device.state==='recording')device.stop()},29500);
    }catch{stream.current?.getTracks().forEach(track=>track.stop());setStatus('Microphone access was unavailable. You can continue by typing.')}
  }
  return <div className="sc-voice"><button type="button" disabled={!available||busy} onClick={()=>{if(recording)recorder.current?.stop();else void start()}} aria-pressed={recording}>{recording?'Stop and send spoken message':busy?'Preparing voice reply…':'Speak to your stylist'}</button><p role="status" aria-live="polite">{status}</p>{audioUrl&&<audio controls src={audioUrl} aria-label="AI-generated stylist reply"/>}</div>;
}
