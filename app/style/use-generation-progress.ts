'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {z} from 'zod';

const requestSchema=z.object({purpose:z.enum(['silhouette','synthesis']),renderScope:z.literal('body_concept'),idempotencyKey:z.uuid(),expectedRevision:z.number().int().nonnegative(),mode:z.enum(['prepared','dynamic']),adultConfirmed:z.literal(true).optional(),actionId:z.uuid().optional(),parentOutputId:z.string().optional()}).strict();
export type GenerateRequest=z.infer<typeof requestSchema>;
const attemptSchema=z.object({request:requestSchema,startedAt:z.number().finite().positive(),transport:z.enum(['sending','acknowledged','unknown'])});
type Attempt=z.infer<typeof attemptSchema>;
const ledgerSchema=z.object({operations:z.array(z.object({id:z.string(),state:z.string()}))});
export type ProgressJob={id:string;state:'pending'|'running'|'succeeded'|'failed'|'uncertain';operationId:string|null;createdAt:string};

/** Keep the exact request key across reloads; saved server jobs remain authoritative. */
export function useGenerationProgress<T extends ProgressJob>(profileId:string|null,jobs:T[]){
 const [attempt,setAttempt]=useState<Attempt|null>(null),[now,setNow]=useState(0);
 const currentAttempt=useRef<Attempt|null>(null);
 const key=profileId?'stylist-generation:'+profileId:null;
 const persist=useCallback((value:Attempt|null)=>{currentAttempt.current=value;setAttempt(value);if(key)try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key)}catch{/* The current tab still retains its exact key. */}},[key]);
 useEffect(()=>{const timer=setTimeout(()=>{if(!key){currentAttempt.current=null;setAttempt(null);return}try{const saved=attemptSchema.safeParse(JSON.parse(sessionStorage.getItem(key)||'null'));currentAttempt.current=saved.success?{...saved.data,transport:saved.data.transport==='sending'?'unknown':saved.data.transport}:null;setAttempt(currentAttempt.current)}catch{currentAttempt.current=null;setAttempt(null)}},0);return()=>clearTimeout(timer)},[key]);
 const tracked=attempt?jobs.find(job=>job.id===attempt.request.idempotencyKey):undefined;
 useEffect(()=>{if(!attempt||!tracked)return;const controller=new AbortController();const timer=setTimeout(()=>{void(async()=>{
  if(tracked.state==='succeeded'||tracked.state==='failed'){
   if(!tracked.operationId){persist(null);return}
   // A published/failed job can precede ledger settlement. Verify the hold, never infer it.
   try{const response=await fetch('/api/usage',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('usage');const ledger=ledgerSchema.safeParse(await response.json());const operation=ledger.success?ledger.data.operations.find(op=>op.id===tracked.operationId):undefined;if(controller.signal.aborted)return;if(operation&&['succeeded','rejected_result','failed_before_dispatch'].includes(operation.state)){persist(null);return}}catch{/* Keep the exact request and expose its budget link. */}
   if(!controller.signal.aborted&&attempt.transport!=='unknown')persist({...attempt,transport:'unknown'});
  }else if(attempt.transport==='unknown'&&(tracked.state!=='pending'||tracked.operationId===null))persist({...attempt,transport:'acknowledged'});
 })()},0);return()=>{clearTimeout(timer);controller.abort()}},[attempt,tracked,persist]);
 const activeJob=[...jobs].reverse().find(job=>job.state==='running'||job.state==='uncertain');
 const awaitingLedger=Boolean(attempt&&tracked?.operationId&&(tracked.state==='succeeded'||tracked.state==='failed'));
 const blocked=Boolean(activeJob||awaitingLedger||attempt?.transport==='sending'||attempt?.transport==='unknown');
 const timing=Boolean(attempt?.transport==='sending'||tracked?.state==='running'||activeJob?.state==='running');
 useEffect(()=>{if(!timing)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[timing]);
 const started=attempt?.startedAt??Date.parse(activeJob?.createdAt??'');
 const seconds=Number.isFinite(started)?Math.max(0,Math.floor((now-started)/1000)):0;
 const elapsed=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 return {attempt,tracked,activeJob,blocked,elapsed,
  start:(request:GenerateRequest)=>persist({request,startedAt:Date.now(),transport:'sending'}),
  acknowledge:()=>{if(currentAttempt.current)persist({...currentAttempt.current,transport:'acknowledged'})},
  unknown:()=>{if(currentAttempt.current)persist({...currentAttempt.current,transport:'unknown'})},
  clear:()=>persist(null),
 };
}
