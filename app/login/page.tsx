"use client";
import Link from "next/link";
import { useState } from "react";

export default function Login() {
  const [email,setEmail]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent) { e.preventDefault(); setBusy(true); setMessage(""); try { const r=await fetch('/api/auth/otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}); if(!r.ok) throw new Error('Sign-in is unavailable. Please try again later.'); setMessage('Check your email for a sign-in link.'); } catch(e) {setMessage(e instanceof Error?e.message:'Sign-in failed.');} finally {setBusy(false);} }
  return <div className="shell"><header className="topbar"><Link className="wordmark" href="/">PERSONAL STYLIST <span> / COLOUR STUDY</span></Link><Link href="/colour-system">The colour system ↗</Link></header><main className="narrow"><p className="eyebrow">YOUR PRIVATE SPACE / 01</p><h1>Welcome <em>in.</em></h1><p className="lede">Sign in to save your study and return to it later. You’ll need an invitation to begin.</p><form onSubmit={submit} className="form-stack"><label htmlFor="email">Email address</label><input id="email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><button className="button primary" disabled={busy}>{busy?'Sending…':'Send sign-in link'} <span>↗</span></button><p role="status" className="notice">{message}</p></form><p className="small">Your photographs are used for your own comparisons. No AI processing is involved in this study.</p></main></div>;
}
