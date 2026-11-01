import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { serviceClient } from './server/supabase';
import { CONSULTATION_INSTRUCTIONS } from './consultation-provider';
import { requestText, reportedUsage } from './style/server/provider.mjs';

// Official contract checked 2026-11-01:
// /api/docs/guides/voice-webrtc?api=live and /api/docs/guides/voice-server-controls?api=live
export const LIVE_MODEL='gpt-live-1';
export const LIVE_MAX_SECONDS=60;
export const LIVE_MAX_DELEGATIONS=3;
export const LIVE_BACKEND_OUTPUT_TOKENS=600;
export const LIVE_PRICING_VERSION='live-60s-3delegations-engineering-reserve-2026-11-01';
// Published voice rate $0.05/minute. Backend use is additional, not included.
export const LIVE_VOICE_MICROUSD_PER_MINUTE=50_000;
function releaseReady():boolean{return false}
export function liveAvailability(){return {available:releaseReady()&&process.env.CONSULTATION_LIVE_ENABLED==='true'&&!!process.env.OPENAI_API_KEY,model:LIVE_MODEL,maxSeconds:LIVE_MAX_SECONDS,mode:'full-duplex' as const,reason:'GPT-Live is awaiting release. Your saved text consultation is available.'}}
const created=z.object({session:z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)}),transport:z.object({type:z.literal('webrtc'),sdp:z.string().min(1).max(100000)})});
export async function createLiveSession({key,sdp,history,fetcher=fetch}:{key:string;sdp:string;history:{role:string;text:string}[];fetcher?:typeof fetch}){
  // Keep exact saved text, dropping oldest whole messages to fit startup history.
  const seed=history.slice(-30);while(seed.reduce((sum,item)=>sum+item.text.length,0)>16000)seed.shift();
  const response=await fetcher('https://api.openai.com/v1/live/sessions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({session:{model:LIVE_MODEL,store:false,audio:{output:{voice:'marin'}},instructions:'You are an AI personal stylist in a full-duplex conversation. Be warm and concise. Delegate substantive styling questions and changes to the backend. Never claim a visual inspection or completed action without backend evidence. The backend holds the saved consultation and preferences. Do not silently approve outfits. Do not speak secrets or private reasoning.',input:seed.map(item=>({type:'message',role:item.role==='user'?'user':'assistant',content:[{type:item.role==='user'?'input_text':'output_text',text:item.text}]})),delegation:{type:'client',acknowledgement_delay_ms:800},client:{data_channel:{allowed_client_events:['session.close'],allowed_server_events:[{type:'session.started'},{type:'session.closed'},{type:'session.input_transcript.delta'},{type:'session.output_transcript.delta'},{type:'error'}]}}},transport:{type:'webrtc',sdp}})});
  if(!response.ok)throw new Error('Live initialization outcome requires reconciliation');
  return created.parse(await response.json());
}
export function closeLiveSession(key:string,sessionId:string){
  return new Promise<boolean>(resolve=>{const socket=new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`,{headers:{Authorization:`Bearer ${key}`},handshakeTimeout:5000});let done=false;const finish=(confirmed:boolean)=>{if(done)return;done=true;clearTimeout(timer);socket.terminate();resolve(confirmed)};const timer=setTimeout(()=>finish(false),8000);socket.on('open',()=>socket.send(JSON.stringify({type:'session.close',event_id:randomUUID()})));socket.on('message',data=>{try{if(JSON.parse(data.toString()).type==='session.closed')finish(true)}catch{/* Wait for explicit finalization. */}});socket.on('error',()=>finish(false));socket.on('close',()=>finish(false))});
}
type Service=ReturnType<typeof serviceClient>;
const fragment=z.object({type:z.enum(['session.input_transcript.delta','session.output_transcript.delta']),event_id:z.string().min(1).max(200),delta:z.string().min(1).max(20000),start_ms:z.number().int().nonnegative(),end_ms:z.number().int().nonnegative()});
/** Runs only inside the held-open monitor request. Never trust browser transcripts. */
export function monitorLive({key,service,userId,operationId,sessionId,startedAt,input,signal,onEvent}:{key:string;service:Service;userId:string;operationId:string;sessionId:string;startedAt:string;input:unknown;signal:AbortSignal;onEvent:(event:Record<string,unknown>)=>void}){
  return new Promise<void>((resolve)=>{
    const socket=new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`,{headers:{Authorization:`Bearer ${key}`},handshakeTimeout:10000,maxPayload:1_048_576});
    let finished=false,closing=false,confirmed=false,persistenceFailed=false,backendFailed=false,sequence=Promise.resolve(),backend=Promise.resolve(),delegations=0;
    let drain:ReturnType<typeof setTimeout>|undefined;
    const seen=new Set<string>();const usage:Record<string,unknown>[]=[];const liveFragments:Record<string,unknown>[]=[];
    const emit=(event:Record<string,unknown>)=>{try{onEvent(event)}catch{/* Disconnected browser; server still finalizes. */}};
    const settle=async()=>{
      if(finished)return;finished=true;clearTimeout(deadline);if(drain)clearTimeout(drain);signal.removeEventListener('abort',stop);
      try{
        await backend.catch(()=>{});await sequence.catch(()=>{});confirmed=confirmed&&!persistenceFailed&&!backendFailed;
        if(!confirmed){await closeLiveSession(key,sessionId);await service.from('consultation_live_sessions').update({status:'uncertain',backend_usage:usage}).eq('operation_id',operationId).eq('user_id',userId);await service.rpc('mark_style_uncertain',{p_user:userId,p_op:operationId});emit({type:'uncertain',message:'Live finalization is unconfirmed; its reservation is held.'})}
        else{const result=await service.rpc('settle_style_operation',{p_user:userId,p_id:operationId,p_outcome:'succeeded'});if(result.error||result.data!==true){await service.rpc('mark_style_uncertain',{p_user:userId,p_op:operationId});emit({type:'uncertain',message:'Conversation saved; accounting reconciliation is pending.'})}else emit({type:'complete'})}
      }catch{emit({type:'uncertain',message:'Final accounting could not be confirmed. The reservation remains held.'})}
      finally{socket.terminate();resolve()}
    };
    const stop=()=>{
      if(closing||finished)return;closing=true;
      if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'session.close',event_id:randomUUID()}));
      drain=setTimeout(()=>void settle(),8000);
    };
    signal.addEventListener('abort',stop,{once:true});
    const deadline=setTimeout(stop,Math.max(0,new Date(startedAt).getTime()+LIVE_MAX_SECONDS*1000-Date.now()));
    socket.on('open',()=>{if(closing||signal.aborted){socket.send(JSON.stringify({type:'session.close',event_id:randomUUID()}));return}emit({type:'monitor.ready'})});
    socket.on('error',()=>{stop();void settle()});
    socket.on('close',()=>{void settle()});
    socket.on('message',data=>{
      let event:Record<string,unknown>;try{event=JSON.parse(data.toString())}catch{stop();return}
      const part=fragment.safeParse(event);
      if(part.success){
        const item=part.data;if(item.end_ms<item.start_ms||item.end_ms>120000){stop();return}
        const role=item.type==='session.input_transcript.delta'?'user':'stylist';liveFragments.push({role,delta:item.delta,startMs:item.start_ms,endMs:item.end_ms});
        sequence=sequence.then(async()=>{const saved=await service.rpc('append_live_fragment',{p_user:userId,p_op:operationId,p_event:item.event_id,p_role:role,p_delta:item.delta,p_start:item.start_ms,p_end:item.end_ms});if(saved.error||saved.data?.error)throw new Error('Transcript save failed');emit({type:'transcript',role,delta:item.delta,startMs:item.start_ms,endMs:item.end_ms,consultation:saved.data?.consultation})}).catch(()=>{persistenceFailed=true;stop()});
      }else if(event.type==='session.delegation.created'&&!closing){
        const raw=event.delegation,id=raw&&typeof raw==='object'&&'id'in raw?raw.id:null;
        if(typeof id!=='string'||seen.has(id))return;seen.add(id);
        if(++delegations>LIVE_MAX_DELEGATIONS){stop();return}
        backend=backend.then(async()=>{
          if(closing)return;
          socket.send(JSON.stringify({type:'session.thinking.append',event_id:randomUUID(),delegation_id:id,content:''}));
          const saved=await service.rpc('read_consultation',{p_user:userId});
          if(saved.error||!saved.data||typeof saved.data!=='object')throw new Error('Active consultation unavailable');
          const current={savedContext:input,savedHistory:saved.data,liveFragments};
          if(Buffer.byteLength(JSON.stringify(current))>96000)throw new Error('Live context exceeds bound');
          const reply=await requestText({key,instructions:CONSULTATION_INSTRUCTIONS+' Give a concise useful response under 150 words. This result is for the voice agent to communicate.',input:current,maxOutputTokens:LIVE_BACKEND_OUTPUT_TOKENS});
          usage.push({delegationId:id,model:reply.model,modelSource:reply.modelSource,requestId:reply.requestId,reportedUsage:reportedUsage(reply.usage)});
          const recorded=await service.from('consultation_live_sessions').update({backend_usage:usage}).eq('operation_id',operationId).eq('user_id',userId);if(recorded.error)throw new Error('Usage save failed');
          // Each commentary append is limited to 500 tokens. Small UTF-8 chunks
          // stay conservatively below that cap without guessing a tokenizer.
          let chunk='';
          for(const character of reply.text){if(Buffer.byteLength(chunk+character)>300){if(!closing&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'session.commentary.append',event_id:randomUUID(),delegation_id:id,content:chunk}));chunk=''}chunk+=character}
          if(chunk&&!closing&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'session.commentary.append',event_id:randomUUID(),delegation_id:id,content:chunk}));
        }).catch(()=>{backendFailed=true;stop()});
      }else if(event.type==='error'){backendFailed=true;stop()}
      else if(event.type==='session.closed'){
        const seconds=event.usage&&typeof event.usage==='object'&&'seconds'in event.usage?event.usage.seconds:null;
        if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0){stop();return}
        sequence=sequence.then(async()=>{const updated=await service.from('consultation_live_sessions').update({status:'closed',final_seconds:seconds,close_reason:typeof event.reason==='string'?event.reason.slice(0,100):null,backend_usage:usage}).eq('operation_id',operationId).eq('user_id',userId);if(updated.error)throw new Error('Close save failed');confirmed=!persistenceFailed&&!backendFailed;emit({type:'session.closed',seconds})});
        void sequence.then(()=>settle(),()=>{confirmed=false;void settle()});
      }
    });
  });
}
