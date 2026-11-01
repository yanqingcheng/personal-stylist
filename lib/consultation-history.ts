import type { ConsultationMessage } from './consultation';

/** Model context keeps original conversation semantics, not persistence/transport IDs. */
export function consultationHistory(messages:readonly ConsultationMessage[]){
 return messages.map(({role,source,text,activeBoardId,startMs,endMs})=>({
  role,source,text,
  ...(activeBoardId!==null&&activeBoardId!==undefined?{activeBoardId}:{}),
  ...(startMs!==null&&startMs!==undefined?{startMs}:{}),
  ...(endMs!==null&&endMs!==undefined?{endMs}:{}),
 }));
}
