export function studioOutputHref(output:{id:string;provenance:string;documentRevision?:string}){
 return `/studio/output/${encodeURIComponent(output.id)}?${output.provenance==='legacy'?'source=legacy':`revision=${encodeURIComponent(output.documentRevision||'')}`}`;
}
