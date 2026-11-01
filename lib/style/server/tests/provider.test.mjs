import test from 'node:test';
import assert from 'node:assert/strict';
import {requestText,editImage} from '../provider.mjs';

test('text model and private response settings are server selected',async()=>{
 let calls=0;
 const result=await requestText({key:'test',instructions:'fixed',input:{preference:'example'},maxOutputTokens:500,fetcher:async(url,init)=>{
  calls++; assert.equal(url,'https://api.openai.com/v1/responses'); const body=JSON.parse(init.body);
  assert.equal(body.model,'gpt-6.1-sol'); assert.equal(body.store,false); assert.equal(body.max_output_tokens,500);
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'draft'}]}]}),{headers:{'x-request-id':'req-test'}});
 }});
 assert.equal(result.text,'draft'); assert.equal(calls,1);
});
test('image edit uses one bounded server-selected reference and makes no retries',async()=>{
 let calls=0;
 const result=await editImage({key:'test',prompt:'fixed plan',image:new Uint8Array([1,2]),fetcher:async(url,init)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(init.body.get('model'),'gpt-image-2.5-sunburst');assert.equal(init.body.get('size'),'1024x1536');assert.equal(init.body.get('n'),'1');
  return new Response(JSON.stringify({data:[{b64_json:'AQI='}]}));
 }});
 assert.deepEqual([...result.image],[1,2]); assert.equal(calls,1);
 await assert.rejects(()=>editImage({key:'test',prompt:'fixed',image:new Uint8Array([1]),fetcher:async()=>{calls++;throw Error('network')}})); assert.equal(calls,2);
});
test('invalid response is rejected rather than claimed successful',async()=>{
 await assert.rejects(()=>requestText({key:'test',instructions:'fixed',input:{},maxOutputTokens:10,fetcher:async()=>new Response('{"status":"incomplete","output":[]}')}));
});

test('planning transmits one private reference as a Responses vision input',async()=>{
 let calls=0;
 await requestText({key:'test',instructions:'fixed',input:{preference:'blue'},image:new Uint8Array([1,2,3]),maxOutputTokens:500,fetcher:async(url,init)=>{
  calls++; const body=JSON.parse(init.body);
  assert.equal(url,'https://api.openai.com/v1/responses'); assert.equal(body.store,false);
  assert.deepEqual(body.input,[{role:'user',content:[{type:'input_text',text:'{"preference":"blue"}'},{type:'input_image',image_url:'data:image/jpeg;base64,AQID',detail:'high'}]}]);
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'draft'}]}]}));
 }});
 assert.equal(calls,1);
});
test('text-only requests contain no reference, and invalid image inputs never dispatch',async()=>{
 let calls=0;
 const fetcher=async(_url,init)=>{calls++; const body=JSON.parse(init.body);assert.deepEqual(body.input,[{role:'user',content:[{type:'input_text',text:'{}'}]}]);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'draft'}]}]}));};
 await requestText({key:'test',instructions:'fixed',input:{},maxOutputTokens:10,fetcher});
 await assert.rejects(()=>requestText({key:'test',instructions:'fixed',input:{},image:new Uint8Array(),maxOutputTokens:10,fetcher}));
 await assert.rejects(()=>requestText({key:'test',instructions:'fixed',input:{},image:'https://example.com/photo.jpg',maxOutputTokens:10,fetcher}));
 assert.equal(calls,1);
});
