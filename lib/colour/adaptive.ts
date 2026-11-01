/** Uncalibrated comparison suggestions, never a colour measurement or confidence model.
 * Extends the old77429b5 catalogue heuristic with new display-controlled pairs.
 * Equal OKLCH coordinates control the other display dimensions approximately;
 * screen gamut, lighting, hue perception and juxtaposition remain confounds.
 */
import {z} from 'zod';
import {drapeTrials,needsDrapeConfirmation,type Axis,type ColourResponse,type TrialAnswer} from './index';
export const adaptiveResponseSchema=z.object({
 trialId:z.string().regex(/^AD:(temperature|value|chroma):\d{1,7}$/),photoId:z.string().min(1).max(200),revision:z.number().int().positive(),answer:z.enum(['A','B','both','neither','unsure']),confirmedOnDrape:z.literal(true),comment:z.string().max(4000).optional(),
 presentation:z.object({left:z.enum(['A','B']),right:z.enum(['A','B']),aColor:z.string().max(100),bColor:z.string().max(100),transform:z.string().max(300)}),
}).superRefine((r,c)=>{if(r.presentation.left===r.presentation.right)c.addIssue({code:'custom',message:'Comparison sides must differ'});});
export type AdaptiveColourResponse=z.infer<typeof adaptiveResponseSchema>;
export function readAdaptiveResponses(value:unknown):AdaptiveColourResponse[]{
 if(!Array.isArray(value))return [];
 return value.flatMap(item=>{const parsed=adaptiveResponseSchema.safeParse(item);return parsed.success?[parsed.data]:[];});
}
export type AdaptivePair={id:string;axis:Axis;family:string;a:{name:string;color:string};b:{name:string;color:string};positiveAnswer:'A'|'B';control:string};
const axes:Axis[]=['temperature','value','chroma'];
const names:Record<Axis,string>={temperature:'temperature',value:'depth',chroma:'chroma'};
const hues=[{name:'rose',h:15},{name:'teal',h:190},{name:'violet',h:300},{name:'ochre',h:85},{name:'blue',h:250},{name:'green',h:145}];
const colour=(l:number,c:number,h:number)=>`oklch(${l.toFixed(3)} ${c.toFixed(3)} ${((h+360)%360).toFixed(1)})`;
/** Sequence changes comparison family/contrast; revisits never become new independent families. */
export function adaptivePair(axis:Axis,index:number):AdaptivePair{
 const family=hues[index%hues.length],cycle=Math.floor(index/hues.length),small=cycle%2===1;
 const id=`AD:${axis}:${index}`;
 if(axis==='value')return{id,axis,family:family.name,a:{name:`Lighter ${family.name}`,color:colour(small?.72:.78,.075,family.h)},b:{name:`Deeper ${family.name}`,color:colour(small?.55:.46,.075,family.h)},positiveAnswer:'A',control:'Same designed hue and chroma; compare lighter with deeper.'};
 if(axis==='chroma')return{id,axis,family:family.name,a:{name:`Clearer ${family.name}`,color:colour(.67,small?.115:.14,family.h)},b:{name:`Softer ${family.name}`,color:colour(.67,small?.065:.035,family.h)},positiveAnswer:'A',control:'Same designed lightness and hue; compare clearer with softer.'};
 const pairs=[['Cool rose','Warm coral',350,35],['Blue teal','Yellow green',210,140],['Blue violet','Red violet',280,325],['Lemon','Gold',105,75],['Cool blue','Warm turquoise',265,215],['Blue green','Yellow green',185,135]] as const;
 const [a,b,ah,bh]=pairs[index%pairs.length];
 const delta=((bh-ah+540)%360)-180,middle=ah+delta/2,spread=small?.3:.5;
 return{id,axis,family:family.name,a:{name:a,color:colour(.68,.09,middle-delta*spread)},b:{name:b,color:colour(.68,.09,middle+delta*spread)},positiveAnswer:'B',control:'Same designed lightness and chroma; compare hue warmth. Temperature depends on hue context.'};
}
function pairFor(id:string):AdaptivePair|null{
 const match=/^AD:(temperature|value|chroma):(\d{1,7})$/.exec(id);
 return match?adaptivePair(match[1] as Axis,Number(match[2])):null;
}
export type AdaptiveAxisEvidence={axis:Axis;status:'unknown'|'mixed'|'broad'|'provisional';direction:'positive'|'negative'|null;families:number;statement:string;answers:number};
export function adaptiveEvidence(base:readonly ColourResponse[],extra:readonly AdaptiveColourResponse[]):AdaptiveAxisEvidence[]{
 type Vote={id:string;photoId:string;revision:number;axis:Axis;family:string;answer:TrialAnswer;positiveAnswer:'A'|'B'};
 const votes:Vote[]=[];
 for(const response of base){const pair=drapeTrials.find(item=>item.id===response.trialId);if(pair&&!needsDrapeConfirmation(response))votes.push({...response,id:pair.id,axis:pair.axis,family:pair.hueFamily,positiveAnswer:pair.positiveAnswer});}
 for(const response of extra){const pair=pairFor(response.trialId);if(pair)votes.push({...response,id:pair.id,axis:pair.axis,family:pair.family,positiveAnswer:pair.positiveAnswer});}
 const latest=new Map<string,Vote>();
 for(const vote of votes){const key=JSON.stringify([vote.id,vote.photoId]);const old=latest.get(key);if(!old||vote.revision>=old.revision)latest.set(key,vote);}
 return axes.map(axis=>{
  const rows=[...latest.values()].filter(row=>row.axis===axis),directional=rows.filter(row=>row.answer==='A'||row.answer==='B');
  const signs=new Set(directional.map(row=>row.answer===row.positiveAnswer?'positive':'negative'));
  const families=new Set(directional.map(row=>row.family)).size;
  const both=rows.some(row=>row.answer==='both');
  const status=signs.size>1?'mixed':both?'broad':families>=2?'provisional':'unknown';
  const direction=status==='provisional'?[...signs][0] as 'positive'|'negative':null;
  const words=axis==='temperature'?['warmer','cooler']:axis==='value'?['lighter','deeper']:['clearer','softer'];
  const statement=status==='mixed'?`${names[axis]} answers differ across comparisons; context may matter.`:status==='broad'?`Both directions worked in a ${names[axis]} comparison; breadth remains possible.`:status==='provisional'?`A provisional lean toward ${words[direction==='positive'?0:1]} colours across ${families} hue families.`:`Still uncertain about ${names[axis]}; more separate comparisons may help.`;
  return{axis,status,direction,families,statement,answers:rows.length};
 });
}
export function nextAdaptiveComparison(base:readonly ColourResponse[],extra:readonly AdaptiveColourResponse[]):{pair:AdaptivePair;reason:string;evidence:AdaptiveAxisEvidence[]}{
 const evidence=adaptiveEvidence(base,extra);
 const priority={mixed:0,unknown:1,broad:2,provisional:3};
 const ordered=[...evidence].sort((a,b)=>priority[a.status]-priority[b.status]||a.answers-b.answers||axes.indexOf(a.axis)-axes.indexOf(b.axis));
 const target=ordered[0],used=new Set(extra.map(response=>response.trialId));let index=0;
 while(used.has(`AD:${target.axis}:${index}`))index++;
 const pair=adaptivePair(target.axis,index);
 const reason=target.status==='mixed'?`Earlier ${names[target.axis]} answers disagree. Try another controlled hue context; a disagreement need not be forced into one label.`:target.status==='provisional'?`Check the provisional ${names[target.axis]} direction in another context. You can keep exploring or pause; nothing here establishes certainty.`:`${target.statement} This ${pair.family} comparison explores that question next.`;
 return{pair,reason,evidence};
}
