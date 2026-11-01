import Link from 'next/link';
import {notFound} from 'next/navigation';
import {activeUser} from '@/lib/server/supabase';
import {readStudioEditorial} from '@/lib/studio-editorial';
import './editorial.css';
export default async function SavedEditorial({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revision?:string}>}){
 const {id}=await params;const {revision}=await searchParams;
 let editorial:Awaited<ReturnType<typeof readStudioEditorial>>|null=null;
 let signedIn=false;
 try{const auth=await activeUser();signedIn=!!auth;if(auth)editorial=await readStudioEditorial(auth,id,revision);}catch{/* Never substitute the latest editorial for an unavailable exact saved action. */}
 if(signedIn&&!editorial)notFound();
 return <main className="saved-editorial"><nav aria-label="Saved editorial navigation"><Link href="/studio">← Your studio</Link><Link href="/style">Return to consultation ↗</Link></nav><p className="saved-editorial-kicker">THE PERSONAL EDIT / SAVED EDITORIAL</p>{editorial?<><h1>Your saved editorial.</h1><p className="saved-editorial-provenance">Written for {editorial.outputTitle}, the sheet approved when this editorial was saved. Your current consultation stays in place.</p><article aria-label="Saved editorial text">{editorial.text}</article></>:<><h1>Sign in to read your editorial.</h1><Link href="/login">Sign in ↗</Link></>}</main>;
}
