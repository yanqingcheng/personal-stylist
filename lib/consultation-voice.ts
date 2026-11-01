import { reportedUsage } from './style/server/provider.mjs';
import type { serviceClient } from './server/supabase';

// Official docs checked 2026-11-01:
// https://developers.openai.com/api/docs/guides/speech-to-text
// https://developers.openai.com/api/docs/guides/audio-chat-completions
// This is a bounded chained turn, not a GPT-Live/WebRTC session.
export const VOICE_TRANSCRIPTION_MODEL='gpt-transcribe';
export const VOICE_REPLY_MODEL='gpt-audio-1.5';
export const VOICE_PRICING_VERSION='consultation-voice-unverified-2026-11-01';
export const VOICE_MAX_SECONDS=30;
function releaseReady():boolean{return false}
export function voiceAvailability(){const available=releaseReady()&&process.env.CONSULTATION_VOICE_ENABLED==='true'&&!!process.env.OPENAI_API_KEY;return {available,mode:'recorded-turn' as const,maxSeconds:VOICE_MAX_SECONDS,reason:available?'Record a spoken message of up to 30 seconds. The reply uses an AI-generated voice.':'Voice replies are awaiting release. You can continue in the saved text conversation.'}}

export class VoiceProviderError extends Error {
  constructor(message:string,readonly stage:'transcription'|'reply',readonly requestId:string|null=null,readonly usage:ReturnType<typeof reportedUsage>=null){super(message)}
}
export function validateVoiceWav(bytes:Uint8Array){
  const wav=Buffer.from(bytes);
  if(wav.length<46||wav.length>44+VOICE_MAX_SECONDS*32000||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE'||wav.toString('ascii',12,16)!=='fmt '||wav.readUInt32LE(16)!==16||wav.readUInt16LE(20)!==1||wav.readUInt16LE(22)!==1||wav.readUInt32LE(24)!==16000||wav.readUInt32LE(28)!==32000||wav.readUInt16LE(32)!==2||wav.readUInt16LE(34)!==16||wav.toString('ascii',36,40)!=='data'||wav.readUInt32LE(40)!==wav.length-44||wav.readUInt32LE(4)!==wav.length-8||(wav.length-44)%2!==0)throw new Error('Record up to 30 seconds using the consultation microphone');
  return wav;
}
function requestId(response:Response){const id=response.headers.get('x-request-id');return id&&/^[A-Za-z0-9._:-]{1,200}$/.test(id)?id:null}
async function post(path:string,key:string,payload:FormData|Record<string,unknown>,stage:'transcription'|'reply',fetcher:typeof fetch){
  let response:Response;
  try{response=await fetcher(`https://api.openai.com/v1${path}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,...(payload instanceof FormData?{}:{'Content-Type':'application/json'})},body:payload instanceof FormData?payload:JSON.stringify(payload),signal:AbortSignal.timeout(90000)})}
  catch{throw new VoiceProviderError('Voice request outcome is uncertain; do not automatically retry',stage)}
  const id=requestId(response);let value:unknown;
  try{value=await response.json()}catch{throw new VoiceProviderError('Voice response could not be read',stage,id)}
  if(typeof value!=='object'||value===null)throw new VoiceProviderError('Voice response was invalid',stage,id);
  const result=value as Record<string,unknown>,usage=reportedUsage(result.usage);
  if(!response.ok)throw new VoiceProviderError('Voice provider did not complete this turn',stage,id,usage);
  return {result,requestId:id,usage};
}
export async function transcribeVoice({key,wav,fetcher=fetch}:{key:string;wav:Uint8Array;fetcher?:typeof fetch}){
  const bytes=validateVoiceWav(wav),form=new FormData();form.set('model',VOICE_TRANSCRIPTION_MODEL);form.set('file',new Blob([new Uint8Array(bytes)],{type:'audio/wav'}),'utterance.wav');
  const response=await post('/audio/transcriptions',key,form,'transcription',fetcher);
  const text=response.result.text;
  if(typeof text!=='string'||!text.trim()||text.length>12000)throw new VoiceProviderError('No usable speech transcript was returned','transcription',response.requestId,response.usage);
  return {text,requestId:response.requestId,usage:response.usage,model:VOICE_TRANSCRIPTION_MODEL,modelSource:'requested' as const};
}
export async function spokenConsultationReply({key,transcript,instructions,input,fetcher=fetch}:{key:string;transcript:string;instructions:string;input:unknown;fetcher?:typeof fetch}){
  const response=await post('/chat/completions',key,{model:VOICE_REPLY_MODEL,store:false,modalities:['text','audio'],audio:{voice:'alloy',format:'wav'},max_completion_tokens:800,messages:[{role:'system',content:instructions+' Reply conversationally in at most 100 words. Do not claim to inspect images that are not supplied. The voice is AI-generated.'},{role:'user',content:JSON.stringify({savedConsultation:input,spokenMessage:transcript})}]},'reply',fetcher);
  const choices=response.result.choices;
  const first=Array.isArray(choices)&&choices.length===1?choices[0]:null;
  const message=first&&typeof first==='object'?'message' in first?first.message:null:null;
  const audio=message&&typeof message==='object'&&'audio' in message?message.audio:null;
  const text=audio&&typeof audio==='object'&&'transcript' in audio?audio.transcript:null;
  const encoded=audio&&typeof audio==='object'&&'data' in audio?audio.data:null;
  if(typeof text!=='string'||!text.trim()||text.length>20000||typeof encoded!=='string'||encoded.length>8_000_000||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new VoiceProviderError('No complete spoken reply was returned','reply',response.requestId,response.usage);
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new VoiceProviderError('Spoken reply audio was invalid','reply',response.requestId,response.usage);
  return {text,audioBase64:encoded,contentType:'audio/wav',requestId:response.requestId,usage:response.usage,model:VOICE_REPLY_MODEL,modelSource:'requested' as const};
}
export async function recordVoiceUsage({service,userId,operationId,stage,response}:{service:ReturnType<typeof serviceClient>;userId:string;operationId:string;stage:'transcription'|'reply';response:{requestId:string|null;usage:unknown;model?:string}}){
  const operation=await service.from('ai_operations').select('pricing_version').eq('id',operationId).eq('user_id',userId).maybeSingle();
  if(operation.error||!operation.data)throw new Error('Voice accounting unavailable');
  const saved=await service.from('style_provider_usage').upsert({user_id:userId,operation_id:operationId,action:stage==='transcription'?'transcription':'voice',model:response.model||(stage==='transcription'?VOICE_TRANSCRIPTION_MODEL:VOICE_REPLY_MODEL),model_source:'requested',provider_request_id:response.requestId,reported_usage:reportedUsage(response.usage),pricing_version:operation.data.pricing_version},{onConflict:'operation_id,action',ignoreDuplicates:true});
  if(saved.error)throw new Error('Voice usage could not be saved');
}
