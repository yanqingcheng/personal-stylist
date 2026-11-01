/** Uncalibrated comparison suggestions, never a colour measurement or confidence model.
 * Extends the old77429b5 catalogue heuristic with new display-controlled pairs.
 * Equal OKLCH coordinates control the other display dimensions approximately;
 * screen gamut, lighting, hue perception and juxtaposition remain confounds.
 */
import {z} from 'zod';
import {atlas,drapeTrials,needsDrapeConfirmation,type Axis,type ColourResponse,type TrialAnswer,type Template} from './index';
export const adaptiveResponseSchema=z.object({
 trialId:z.string().regex(/^AD:(temperature|value|chroma):\d{1,7}$/),photoId:z.string().min(1).max(200),revision:z.number().int().positive(),answer:z.enum(['A','B','both','neither','unsure']),confirmedOnDrape:z.literal(true),comparisonId:z.string().max(200).optional(),comment:z.string().max(4000).optional(),
 presentation:z.object({left:z.enum(['A','B']),right:z.enum(['A','B']),aColor:z.string().max(100),bColor:z.string().max(100),transform:z.string().max(300),referenceVersion:z.string().max(200).optional()}),
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
/** Identity uses the actual 8-bit sRGB swatches, independent of labels/order.
 * OKLCH conversion follows CSS Color4/Oklab coordinates. Clipping to this bounded
 * display gamut is an engineering identity rule, not calibration of a person.
 * https://www.w3.org/TR/css-color-4/#color-conversion-code
 */
export function canonicalColour(input:string):string{
 const value=input.trim().toLowerCase();
 const hex=/^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
 if(hex)return '#'+(hex[1].length===3?[...hex[1]].map(c=>c+c).join(''):hex[1]);
 const channel=(n:number)=>Math.round(Math.max(0,Math.min(255,n))).toString(16).padStart(2,'0');
 const rgb=/^rgba?\(([^)]+)\)$/.exec(value);
 if(rgb){const parts=rgb[1].split('/')[0].trim().split(/[ ,]+/);if(parts.length>=3)return '#'+parts.slice(0,3).map(c=>channel(parseFloat(c)*(c.endsWith('%')?2.55:1))).join('');}
 const lch=/^oklch\(([\d.]+)(%)?\s+([\d.]+)\s+([\d.+-]+)(?:deg)?\)$/.exec(value);
 if(lch){const l=Number(lch[1])/(lch[2]?100:1),c=Number(lch[3]),h=Number(lch[4])*Math.PI/180,a=c*Math.cos(h),b=c*Math.sin(h);
  const x=(l+.3963377774*a+.2158037573*b)**3,y=(l-.1055613458*a-.0638541728*b)**3,z=(l-.0894841775*a-1.291485548*b)**3;
  const encode=(v:number)=>channel(255*(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055));
  return '#'+[4.0767416621*x-3.3077115913*y+.2309699292*z,-1.2684380046*x+2.6097574011*y-.3413193965*z,-.0041960863*x-.7034186147*y+1.707614701*z].map(encode).join('');
 }
 return value.replace(/\s+/g,' ');
}
export const comparisonIdentity=(a:string,b:string)=>[canonicalColour(a),canonicalColour(b)].sort().join('|');
const colour=(l:number,c:number,h:number)=>canonicalColour(`oklch(${l.toFixed(3)} ${c.toFixed(3)} ${((h+360)%360).toFixed(1)})`);
/** Legacy indices remain readable, but the scheduler only uses the12 distinct variants per axis. */
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
export type ColourContext={photoId?:string;referenceVersion?:string};
/** Fingerprint the displayed source and effective crop, never a signed URL. */
export function colourComparisonVersion(photoId:string,sourceVersion?:string,crop?:{x:number;y:number;width:number;height:number}):string{
 const framing=crop?[crop.x,crop.y,crop.width,crop.height].map(n=>Number(n.toFixed(6))).join(','):'full';
 return `ctx1:${sourceVersion??photoId}:${framing}`;
}
export function responseInColourContext(response:ColourResponse|AdaptiveColourResponse,context:ColourContext){
 if(context.photoId&&response.photoId!==context.photoId)return false;
 if(!context.referenceVersion)return true;
 // Unknown legacy framing stays in history, never silently matches a known crop.
 return response.presentation?.referenceVersion===context.referenceVersion;
}
export function adaptiveEvidence(base:readonly ColourResponse[],extra:readonly AdaptiveColourResponse[],context:ColourContext={}):AdaptiveAxisEvidence[]{
 type Vote={id:string;photoId:string;revision:number;axis:Axis;family:string;answer:TrialAnswer;positiveAnswer:'A'|'B'};
 const votes:Vote[]=[];
 for(const response of base.filter(r=>responseInColourContext(r,context))){const pair=drapeTrials.find(item=>item.id===response.trialId);if(pair&&pair.evidenceQuality==='display-controlled'&&!needsDrapeConfirmation(response))votes.push({...response,id:pair.id,axis:pair.axis,family:pair.hueFamily,positiveAnswer:pair.positiveAnswer});}
 for(const response of extra.filter(r=>responseInColourContext(r,context))){const pair=pairFor(response.trialId);if(pair)votes.push({...response,id:pair.id,axis:pair.axis,family:pair.family,positiveAnswer:pair.positiveAnswer});}
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
export function seenComparisonIdentities(base:readonly ColourResponse[],extra:readonly AdaptiveColourResponse[]):Set<string>{
 const seen=new Set<string>();
 for(const response of base){const pair=drapeTrials.find(t=>t.id===response.trialId);const a=response.presentation?.aHex??pair?.a_hex,b=response.presentation?.bHex??pair?.b_hex;if(a&&b)seen.add(comparisonIdentity(a,b));}
 for(const response of extra){if(response.comparisonId)seen.add(response.comparisonId);seen.add(comparisonIdentity(response.presentation.aColor,response.presentation.bColor));}
 return seen;
}
export function nextAdaptiveComparison(base:readonly ColourResponse[],extra:readonly AdaptiveColourResponse[],context:ColourContext={}):{pair:AdaptivePair|null;reason:string;evidence:AdaptiveAxisEvidence[];remaining:number;recommendPalettes:boolean}{
 const evidence=adaptiveEvidence(base,extra,context),seen=seenComparisonIdentities(base,extra);
 const available=axes.flatMap(axis=>Array.from({length:hues.length*2},(_,index)=>adaptivePair(axis,index))).filter(pair=>!seen.has(comparisonIdentity(pair.a.color,pair.b.color)));
 const priority={mixed:0,unknown:1,broad:2,provisional:3};
 const ordered=[...evidence].sort((a,b)=>Number(a.status==='provisional')-Number(b.status==='provisional')||a.answers-b.answers||priority[a.status]-priority[b.status]||axes.indexOf(a.axis)-axes.indexOf(b.axis));
 const target=ordered.find(axis=>available.some(pair=>pair.axis===axis.axis));
 const pair=target?available.find(pair=>pair.axis===target.axis)??null:null;
 const recommendPalettes=!pair||evidence.every(axis=>axis.status==='provisional');
 const reason=!pair?'You have seen the available distinct comparisons. Some factors may remain inconclusive; compare a few palette starting points rather than repeating the same questions.':target?.status==='mixed'?`Earlier ${names[pair.axis]} answers differ. This unseen pair explores another context without forcing one label.`:target?.status==='provisional'?`A provisional ${names[pair.axis]} direction is available. You can compare a few palettes now, or try this unseen pair.`:`${target?.statement} This unseen ${pair.family} pair adds a different comparison.`;
 return{pair,reason,evidence,remaining:available.length,recommendPalettes};
}
/** A short exploration set, not calibrated suitability or a frozen taxonomy. */
export function adaptivePaletteChoices(base:readonly ColourResponse[],extra:readonly AdaptiveColourResponse[],context:ColourContext={}):{templates:Template[];evidence:AdaptiveAxisEvidence[];supported:boolean;reason:string}{
 const evidence=adaptiveEvidence(base,extra,context),directional=evidence.filter(axis=>axis.status==='provisional');
 const penalty=(template:Template)=>directional.reduce((sum,axis)=>{const coordinate=template.anchor_coords[axes.indexOf(axis.axis)],target=axis.direction==='positive'?.65:-.65;return sum+(coordinate-target)**2;},0);
 const ranked=[...atlas].sort((a,b)=>penalty(a)-penalty(b)||a.id.localeCompare(b.id));
 const chosen:Template[]=[];
 while(chosen.length<5&&ranked.length){
  let best=0;
  if(chosen.length){let bestValue=-Infinity;ranked.forEach((candidate,index)=>{const distance=Math.min(...chosen.map(item=>evidence.reduce((sum,axis,i)=>sum+(axis.status==='provisional'?0:(candidate.anchor_coords[i]-item.anchor_coords[i])**2),0)));const value=distance-4*penalty(candidate);if(value>bestValue){bestValue=value;best=index;}});}
  chosen.push(ranked.splice(best,1)[0]);
 }
 return{templates:chosen,evidence,supported:directional.length>0,reason:directional.length?`These five starting points use the provisional directions and keep alternatives for factors that remain open. Your answers do not establish a certain type.`:'The evidence is inconclusive. These five contrasting palettes are exploration options, not a ranking of what suits you. You can choose another palette from the full collection.'};
}
