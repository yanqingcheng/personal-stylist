// Provider transport. Callers must reserve the full configured bound before use.
// There are deliberately no retries: a lost response can still be billable.
const base = 'https://api.openai.com/v1';
const textModel = 'gpt-6.1-sol';
const imageModel = 'gpt-image-2.5-sunburst';

export class ProviderError extends Error {
  constructor(message, requestId = null) { super(message); this.requestId = requestId; }
}

async function post(path, key, payload, fetcher, timeoutMs) {
  const response = await fetcher(`${base}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, ...(payload instanceof FormData ? {} : {'Content-Type':'application/json'}) },
    body: payload instanceof FormData ? payload : JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs),
  });
  const requestId = response.headers.get('x-request-id');
  if (!response.ok) throw new ProviderError('Provider request did not complete', requestId);
  let json;
  try { json = await response.json(); } catch { throw new ProviderError('Provider response invalid',requestId); }
  return { json, requestId };
}

/** @param {{key: string, instructions: string, input: unknown, maxOutputTokens: number, image?: Uint8Array, fetcher?: typeof fetch}} options */
export async function requestText({key, instructions, input, maxOutputTokens, image = undefined, fetcher = fetch}) {
  if (image !== undefined && (!(image instanceof Uint8Array) || image.byteLength === 0 || image.byteLength > 10485760)) throw new ProviderError('Invalid reference image');
  const content = [{type:'input_text',text:JSON.stringify(input)}];
  if (image !== undefined) content.push({type:'input_image',image_url:`data:image/jpeg;base64,${Buffer.from(image).toString('base64')}`,detail:'high'});
  const {json,requestId} = await post('/responses', key, {model:textModel, instructions, input:[{role:'user',content}], max_output_tokens:maxOutputTokens, store:false}, fetcher, 90000);
  const parts = Array.isArray(json.output) ? json.output.flatMap(item => item.type === 'message' && Array.isArray(item.content) ? item.content.filter(c => c.type === 'output_text').map(c => c.text) : []) : [];
  if (json.status !== 'completed' || parts.length !== 1 || typeof parts[0] !== 'string' || !parts[0].trim()) throw new ProviderError('Provider response invalid',requestId);
  return { text:parts[0], requestId };
}

export async function editImage({key, prompt, image, fetcher = fetch}) {
  const form = new FormData();
  form.set('model',imageModel); form.set('prompt',prompt); form.set('image',new Blob([image],{type:'image/jpeg'}),'reference.jpg');
  form.set('size','1024x1536'); form.set('quality','medium'); form.set('n','1'); form.set('output_format','png');
  const {json,requestId}=await post('/images/edits',key,form,fetcher,180000);
  const result=json.data?.[0]?.b64_json;
  if (typeof result !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result) || result.length > 14000000) throw new ProviderError('Provider response invalid',requestId);
  return { image:Buffer.from(result,'base64'), requestId };
}
