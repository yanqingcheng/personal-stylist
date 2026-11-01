'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import styles from './usage.module.css';

const amount=z.number().nonnegative().finite();
const callSchema=z.object({action:z.string(),model:z.string(),modelSource:z.enum(['reported','requested']),
  reportedUsage:z.record(z.string(),z.unknown()).nullable(),estimatedMicrousd:amount.nullable(),rateVersion:z.string().nullable(),rateSource:z.string().nullable(),
  pricingBasis:z.enum(['usage-estimate','usage-upper-estimate']).nullish(),pricingGap:z.string().nullish(),
  actualMicrousd:amount.nullable(),reconciliationRef:z.string().nullable(),createdAt:z.string()});
const usageSchema=z.object({summary:z.object({operationCount:amount,heldMicrousd:amount,accountingSpentMicrousd:amount,
  reportedCallCount:amount,recordedCallCount:amount,pricedCallCount:amount,estimatedMicrousd:amount.nullable(),reconciledCallCount:amount,actualMicrousd:amount.nullable()}),
  operations:z.array(z.object({id:z.string(),kind:z.string(),state:z.string(),created_at:z.string(),reserved_microusd:amount,settled_microusd:amount,pricing_version:z.string().nullable(),settlement_basis:z.string().optional(),calls:z.array(callSchema)}))});
type Usage=z.infer<typeof usageSchema>;
const dollars=(value:number|null)=>value===null?'Unknown':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6}).format(value/1_000_000);
const readable=(value:string)=>value.replaceAll('_',' ');

export default function UsagePage() {
  const [data,setData]=useState<Usage|null>(null);
  const [message,setMessage]=useState('Loading your usage…');
  const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const response=await fetch('/api/usage',{cache:'no-store'});
      if(!response.ok) throw new Error(response.status===401?'Sign in and activate your account to view your usage.':'Usage is temporarily unavailable. Please try again.');
      const value:unknown=await response.json();
      setData(usageSchema.parse(value));setMessage('');
    } catch(error) { setMessage(error instanceof Error && !(error instanceof z.ZodError)?error.message:'Usage is temporarily unavailable. Please try again.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer)},[load]);
  const summary=data?.summary;
  return <div className="shell">
    <header className="topbar"><Link className="wordmark" href="/">PERSONAL STYLIST</Link><Link href="/studio">Your studio →</Link></header>
    <main className={styles.main}>
      <p className="eyebrow">YOUR ACCOUNT / USAGE</p><h1>What your study uses.</h1>
      <p className="body-copy">Your AI actions, reported token usage and costs in US dollars. Reserved budget, estimated costs and provider-confirmed charges are shown separately.</p>
      <button className="text-button" disabled={loading} onClick={()=>void load()}>{loading?'Refreshing…':'Refresh usage'}</button>
      {message&&<p role="status" className="callout">{message}{message.startsWith('Sign in')&&<> <Link href="/login">Sign in →</Link></>}</p>}
      {summary&&<>
        <div className={styles.cards}>
          <section><p>Account allowance used</p><strong>{dollars(summary.accountingSpentMicrousd)}</strong><span>Completed calls use reported-usage estimates where covered, including conservative upper estimates when billing details are missing. This is not a provider invoice.</span></section>
          <section><p>Budget held</p><strong>{dollars(summary.heldMicrousd)}</strong><span>Reservations for reserved, running or uncertain operations.</span></section>
          <section><p>Priced estimate subtotal</p><strong>{summary.pricedCallCount?dollars(summary.estimatedMicrousd):'Unpriced'}</strong><span>{summary.pricedCallCount} of {summary.recordedCallCount} recorded calls have valid price estimates. Unpriced calls are excluded, never treated as free.</span></section>
          <section><p>Provider-reconciled actual subtotal</p><strong>{summary.reconciledCallCount?dollars(summary.actualMicrousd):'Unknown'}</strong><span>{summary.reconciledCallCount} recorded calls have explicit charge reconciliation. Token counts alone do not establish actual charges.</span></section>
        </div>
        <p className="body-copy">{summary.operationCount} recorded operation{summary.operationCount===1?'':'s'} · {summary.reportedCallCount} calls with provider-reported token usage. Totals cover your account; the list shows the latest 100 operations.</p>
        {!data?.operations.length?<div className="callout"><strong>No recorded operations yet.</strong><br/>Actual provider charges remain unknown. Your next recorded action will appear here.</div>:
          <div className={styles.operations}>{data.operations.map(operation=><article className={styles.operation} key={operation.id}>
            <div className={styles.heading}><h2>{readable(operation.kind)}</h2><span>{readable(operation.state)}</span></div>
            <p className={styles.meta}>{new Date(operation.created_at).toLocaleString()} · Pricing version: {operation.pricing_version||'Unknown'} · Settlement: {readable(operation.settlement_basis||'engineering reserve')}</p>
            <dl className={styles.costs}><div><dt>Initial risk reservation</dt><dd>{dollars(operation.reserved_microusd)}</dd></div><div><dt>Allowance used</dt><dd>{dollars(operation.settled_microusd)}</dd></div></dl>
            {['reserved','running','uncertain'].includes(operation.state)&&<p className="small">This operation’s reservation is held. Final accounting is pending; uncertain requests may still be billable.</p>}
            {!operation.calls.length?<p className="callout">Provider usage pending or unavailable. Cost is unpriced; actual charge is unknown.</p>:operation.calls.map(call=><section className={styles.call} key={call.action}>
              <h3>{readable(call.action)}</h3><p>{call.model} <span className={styles.meta}>({call.modelSource==='reported'?'provider-reported model':'requested model; provider model unreported'})</span></p>
              <p>{call.pricingBasis==='usage-upper-estimate'?'Conservative upper estimate':'Usage estimate'}: {call.estimatedMicrousd===null?'Unpriced':dollars(call.estimatedMicrousd)} · Provider-reconciled actual: {dollars(call.actualMicrousd)}</p>
              {call.pricingGap&&<p className={styles.meta}>{call.pricingGap}</p>}
              {call.rateVersion&&<p className={styles.meta}>Rate version: {call.rateVersion}{call.rateSource&&<> · <a href={call.rateSource} rel="noreferrer" target="_blank">Pricing source</a></>}</p>}
              {call.reconciliationRef&&<p className={styles.meta}>Reconciliation: {call.reconciliationRef}</p>}
              {call.reportedUsage?<details><summary>Provider-reported token usage</summary><pre>{JSON.stringify(call.reportedUsage,null,2)}</pre></details>:<p className={styles.meta}>Provider did not supply usable token usage. This does not mean zero tokens or zero cost.</p>}
            </section>)}
          </article>)}</div>}
      </>}
    </main>
  </div>;
}
