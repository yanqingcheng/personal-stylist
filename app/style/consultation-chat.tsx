'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { consultationSchema, type ConsultationMessage, type ConsultationSnapshot } from '@/lib/consultation';
import ConsultationLive from './consultation-live';

export type ConsultationChatProps = {
  activeBoardId?:string|null;
  onMessages?:(messages:ConsultationMessage[])=>void;
  onSnapshot?:(snapshot:ConsultationSnapshot)=>void;
};

export default function ConsultationChat({activeBoardId=null,onMessages,onSnapshot}:ConsultationChatProps) {
  const [consultation,setConsultation]=useState<ConsultationSnapshot|null>(null);
  const [draft,setDraft]=useState('');
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [connectionError,setConnectionError]=useState('');
  const [loading,setLoading]=useState(true);
  const [autonomous,setAutonomous]=useState(false);
  const [liveActive,setLiveActive]=useState(false);
  const current=useRef<ConsultationSnapshot|null>(null);
  const alive=useRef(true);
  const submitLock=useRef(false);
  const callback=useRef(onMessages);
  const snapshotCallback=useRef(onSnapshot);
  const retry=useRef<{idempotencyKey:string;text:string;activeBoardId:string|null}|null>(null);
  const end=useRef<HTMLDivElement>(null);
  const pending=Boolean(consultation?.pendingCount);

  useEffect(()=>{callback.current=onMessages},[onMessages]);
  useEffect(()=>{snapshotCallback.current=onSnapshot},[onSnapshot]);
  useEffect(()=>{void fetch('/api/consultation/respond',{cache:'no-store'}).then(r=>r.json()).then(data=>setAutonomous(data.available===true)).catch(()=>setAutonomous(false))},[]);
  const receive=useCallback((snapshot:ConsultationSnapshot)=>{
    if(!alive.current || (current.current && snapshot.revision<current.current.revision)) return;
    const changed=!current.current || snapshot.revision!==current.current.revision;
    current.current=snapshot;
    setConsultation(snapshot);
    snapshotCallback.current?.(snapshot);
    if(changed) callback.current?.(snapshot.messages);
  },[]);

  useEffect(()=>{
    alive.current=true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    async function poll() {
      try {
        const response=await fetch('/api/consultation',{cache:'no-store',signal:controller.signal});
        if(!response.ok) {
          if(alive.current)setConnectionError(response.status===401?'Sign in to open your conversation.':'Could not refresh your conversation. Reconnecting…');
          return;
        }
        const result:unknown=await response.json();
        const envelope=typeof result==='object' && result!==null && 'consultation' in result ? result.consultation : null;
        receive(consultationSchema.parse(envelope));
        if(alive.current)setConnectionError('');
      } catch {
        if(!controller.signal.aborted && alive.current) setConnectionError('Could not refresh your conversation. Reconnecting…');
      } finally {
        if(alive.current && !controller.signal.aborted) {
          setLoading(false);
          timer=setTimeout(()=>void poll(),current.current?.pendingCount ? 2000 : 5000);
        }
      }
    }
    void poll();
    return()=>{alive.current=false;controller.abort();if(timer)clearTimeout(timer)};
  },[receive,pending]);

  const lastMessageId=consultation?.messages.at(-1)?.id;
  const displayMessages=(consultation?.messages??[]).reduce<Array<{message:ConsultationMessage;fragments:ConsultationMessage[]}>>((groups,message)=>{
    const previous=groups.at(-1);
    if(message.liveOperationId&&previous?.message.liveOperationId===message.liveOperationId&&previous.message.role===message.role&&previous.message.source===message.source){
      previous.fragments.push(message);
      previous.message={...previous.message,text:previous.message.text+message.text,endMs:message.endMs};
    }else groups.push({message:{...message},fragments:[message]});
    return groups;
  },[]);
  useEffect(()=>{
    // Scroll the conversation itself, without pulling the whole atelier away from a board.
    const target=end.current;
    const list=target?.parentElement;
    if(target && list) list.scrollTop=list.scrollHeight;
  },[lastMessageId]);

  const canSend=Boolean(consultation && draft.trim() && draft.length<=12000 && !sending && !pending && !liveActive);

  async function send() {
    if(!canSend || submitLock.current || !current.current) return;
    submitLock.current=true;
    setSending(true);setError('');
    const text=draft;
    const previous=retry.current;
    const attempt=previous && previous.text===text && previous.activeBoardId===activeBoardId
      ? previous : {idempotencyKey:crypto.randomUUID(),text,activeBoardId};
    retry.current=attempt;
    try {
      const response=await fetch('/api/consultation',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...attempt,expectedRevision:current.current.revision}),
      });
      const result:unknown=await response.json().catch(()=>null);
      const envelope=typeof result==='object' && result!==null && 'consultation' in result ? result.consultation : null;
      const parsed=consultationSchema.safeParse(envelope);
      if(parsed.success) receive(parsed.data);
      if(!response.ok) throw new Error(response.status===409
        ? 'Your conversation changed. Your draft is still here; review the latest messages and send again.'
        : response.status===401?'Sign in to send your message. Your draft is still here.'
        : 'Your message could not be confirmed. Your draft is still here; check the conversation before trying again.');
      if(!parsed.success) throw new Error('Your message could not be confirmed. Your draft is still here; check the conversation before trying again.');
      if(alive.current) {setDraft(value=>value===text?'':value);retry.current=null;setError('');}
      if(autonomous){
        const reply=await fetch('/api/consultation/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:crypto.randomUUID(),expectedRevision:parsed.data.revision,replyTo:attempt.idempotencyKey})});
        const result=await reply.json();const saved=consultationSchema.safeParse(result.consultation);if(saved.success)receive(saved.data);
        if(!reply.ok)throw new Error(result.error||'Your message is saved, but the stylist reply is unavailable.');
      }
    } catch(reason) {
      if(alive.current) setError(reason instanceof Error?reason.message:'Your message could not be confirmed. Your draft is still here.');
    } finally {
      submitLock.current=false;
      if(alive.current)setSending(false);
    }
  }

  return <section className="sc-conversation" aria-label="Your stylist conversation">
    <header><div><h2>A little conversation.<br/>A more personal edit.</h2><p>Private, saved consultation · Text and voice share this history</p></div></header>
    <div className="sc-messages" role="log" aria-label="Saved conversation" aria-live="polite" aria-relevant="additions text" aria-busy={loading}>
      {displayMessages.map(({message,fragments})=><article className={`sc-message sc-message--${message.role}`} data-role={message.role} data-live-operation={message.liveOperationId??undefined} data-fragment-count={fragments.length} key={message.id}>
        <p className="sc-message-author">{message.role==='user'?'You':message.source==='api'?'AI stylist':'Supervised stylist reply'}</p>
        <div className="sc-message-text" style={{whiteSpace:'pre-wrap'}}>{message.text}</div>
        {message.activeBoardId&&<p className="sc-message-context">About an outfit study</p>}
      </article>)}
      {consultation&&!consultation.messages.length&&<div className="sc-message sc-message--opening">
        <p className="sc-message-author">To begin</p>
        <p>What would you most like these outfits to help you feel?</p>
      </div>}
      <div ref={end}/>
    </div>
    <p className="sc-status" role="status">{loading?'Opening your conversation…':!consultation?'Your conversation has not loaded yet.':sending?'Saving your message…':pending?'Message saved · Awaiting your stylist’s reply.':'Your conversation is saved to your account.'}</p>
    {connectionError&&<p className="sc-status sc-status--error" role="status">{connectionError}</p>}
    {error&&<p className="sc-status sc-status--error" role="alert">{error}</p>}
    <form className="sc-composer" onSubmit={event=>{event.preventDefault();void send()}}>
      <label htmlFor="consultation-message">{activeBoardId?'Your thoughts on this outfit study':'Tell your stylist'}</label>
      <textarea id="consultation-message" name="message" rows={3} maxLength={12000} value={draft}
        disabled={sending||liveActive} placeholder={pending?'Add a thought while your stylist considers your message…':'What feels right, what would you change, or what would you like to explore?'}
        onChange={event=>setDraft(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send()}}}
        aria-describedby="consultation-composer-hint"/>
      <div className="sc-composer-actions">
        <p id="consultation-composer-hint">{pending?'You can keep writing. Send when your stylist has replied.':'Enter to send · Shift + Enter for a new line'}</p>
        <button type="submit" disabled={!canSend}>{sending?'Sending…':'Send message'} <span aria-hidden="true">↗</span></button>
      </div>
    </form>
    {consultation&&!sending&&!pending&&<ConsultationLive expectedRevision={consultation.revision} onSaved={receive} onActive={setLiveActive}/>}
  </section>;
}
