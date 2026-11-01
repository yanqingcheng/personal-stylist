/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(relative,overrides={}){const file=path.join(root,relative),m=new Module(file,module);m.filename=file;m.paths=module.paths;const original=m.require.bind(m);m.require=name=>{if(name==='server-only'||name.endsWith('.css'))return {};if(name in overrides)return overrides[name];if(name.startsWith('@/'))return load(name.slice(2)+'.ts',overrides);if(name.startsWith('./')&&!name.endsWith('.css'))return load(path.relative(root,path.resolve(path.dirname(file),name))+'.ts',overrides);return original(name)};m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports;}
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const hash='a'.repeat(64);
function fixture(){
 const journey={stage:8,revision:17,approvedOutputId:ids[1],approvedOutputHash:hash,activeBoardId:ids[1]};
 const signed=[],queries=[];
 const rows=ids.map((id,i)=>({id,user_id:'owner',profile_id:'profile',status:'succeeded',result:{id,board:{id,kind:'initial',title:['First saved board','Second saved board'][i],options:[{id:'look',title:'Look'}]},assetPath:`owner/${id}.png`,documentRevision:hash,provenance:'dynamic'}}));
 const service={from(table){const filters=[];const query={select(){return query},eq(key,value){filters.push([key,value]);return query},async maybeSingle(){queries.push({table,filters});const data=table==='profiles'?[{id:'profile',user_id:'owner',deletion_state:'active'}]:table==='consultation_generation_jobs'?rows:table==='media'?rows.map(row=>({id:row.id,user_id:'owner',profile_id:'profile',status:'ready',object_path:row.result.assetPath})):[];return {data:data.find(row=>filters.every(([key,value])=>row[key]===value))??null,error:null}}};return query},storage:{from(){return {async createSignedUrl(asset){signed.push(asset);return {data:{signedUrl:`https://fixture.invalid/${asset}`},error:null}},async download(){return {data:null,error:Error('missing')}}}}}};
 return {auth:{user:{id:'owner'},service},journey,signed,queries};
}
const {readStudioOutput}=load('lib/studio-output.ts');
const {studioOutputHref}=load('lib/studio-output-link.ts');
test('two library links resolve their exact owned board and image without changing current journey',async()=>{const f=fixture(),before=structuredClone(f.journey);for(let i=0;i<2;i++){const href=studioOutputHref({id:ids[i],provenance:'dynamic',documentRevision:hash}),url=new URL(href,'https://local.invalid');assert.equal(url.pathname,`/studio/output/${ids[i]}`);const output=await readStudioOutput(f.auth,ids[i],undefined,url.searchParams.get('revision'));assert.equal(output.title,['First saved board','Second saved board'][i]);assert.equal(output.url,`https://fixture.invalid/owner/${ids[i]}.png`)}assert.deepEqual(f.journey,before);assert.equal(f.signed.length,2)});
test('foreign IDs, stale hashes and missing hashes never sign or substitute a board',async()=>{const f=fixture();for(const [auth,id,revision] of [[{...f.auth,user:{id:'foreign'}},ids[0],hash],[f.auth,'33333333-3333-4333-8333-333333333333',hash],[f.auth,ids[0],'b'.repeat(64)],[f.auth,ids[0],undefined]])await assert.rejects(()=>readStudioOutput(auth,id,undefined,revision));assert.deepEqual(f.signed,[])});
module.exports={load,fixture,ids,hash};
