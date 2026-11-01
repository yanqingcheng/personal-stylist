'use client';
import {useEffect,useState} from 'react';
import NeutralReference from '@/app/profile/neutral-reference';
import ColourMirror from '@/app/profile/colour-mirror';
import {atlas} from '@/lib/colour';
import type {ColourReference} from '@/lib/colour-reference';

export default function DemoColourPreview(){
 const [reference,setReference]=useState<ColourReference|null>(null);
 const [templateId,setTemplateId]=useState('');
 const [favourites,setFavourites]=useState<string[]>([]);
 const [crop,setCrop]=useState({zoom:1.6,y:25});
 useEffect(()=>{let active=true;void fetch('/api/profile',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(result=>{if(active&&result?.profile?.document?.selectedTemplateId)setTemplateId(result.profile.document.selectedTemplateId)}).catch(()=>{});return()=>{active=false}},[]);
 const template=atlas.find(item=>item.id===templateId);
 return <div><NeutralReference onApproved={setReference}/>{reference&&<section aria-label="Prepared reference colour exploration"><h3>One approved reference. A different colour story.</h3><p>This mirror uses the generated portrait you approved. The face pixels stay identical as adjacent colours change. Palette choices here are an exploration for the recording; use your colour study to save favourites.</p>{!template?<label>Choose a starting palette <select value={templateId} onChange={event=>setTemplateId(event.target.value)}><option value="">Choose a palette</option>{atlas.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:<ColourMirror referenceUrl={reference.url} referenceLabel="Your approved native-prepared neutral-light composite. Inferred colour, not calibrated measurement." template={template} favourites={favourites} crop={crop} onCrop={setCrop} onTemplate={setTemplateId} onFavourite={hex=>setFavourites(current=>current.includes(hex)?current.filter(value=>value!==hex):[...current,hex])}/>}</section>}</div>;
}
