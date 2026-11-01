/* Private signed media is displayed directly; never image-proxied. */
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {activeUser} from '@/lib/server/supabase';
import {readStudioOutput} from '@/lib/studio-output';
import './output.css';

export default async function SavedOutput({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{source?:string;revision?:string}>}){
 const {id}=await params;const {source,revision}=await searchParams;
 let output:Awaited<ReturnType<typeof readStudioOutput>>|null=null;
 let signedIn=false;
 try{const auth=await activeUser();signedIn=!!auth;if(auth)output=await readStudioOutput(auth,id,source,revision);}catch{/* An unavailable exact output must never fall back to another saved board. */}
 if(signedIn&&!output)notFound();
 return <main className="saved-output">
  <nav aria-label="Saved image navigation"><Link href="/studio#library">← Your library</Link><Link href="/style">Return to consultation ↗</Link></nav>
  <p className="saved-output-kicker">THE PERSONAL EDIT / SAVED IMAGE</p>
  {output?<><h1>{output.title}</h1><p className="saved-output-note">{output.provenance}. Viewing a saved image keeps your current consultation in place.</p>{output.url?<img className="saved-output-image" src={output.url} alt={output.title||'Saved outfit study'}/>:<p role="status">This saved image is temporarily unavailable. Reload to try again.</p>}{output.description&&<p className="saved-output-description">{output.description}</p>}</>:<><h1>Saved image unavailable.</h1><p role="status">{signedIn?'This exact image could not be opened. Return to your library and try again.':'Sign in to open your saved images.'}</p>{!signedIn&&<Link href="/login">Sign in ↗</Link>}</>}
 </main>;
}
