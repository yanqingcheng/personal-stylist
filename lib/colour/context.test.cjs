/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file).exports;const m=new Module(file,module);cache.set(file,m);m.filename=file;m.paths=module.paths;const original=m.require.bind(m);m.require=name=>name==='./index'?load(path.join(__dirname,'index.ts')):original(name);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);return m.exports;}
const {adaptiveEvidence,adaptivePair,adaptivePaletteChoices,colourComparisonVersion,responseInColourContext}=load(path.join(__dirname,'adaptive.ts'));
const photoId='photo';const crop={x:.2,y:.1,width:.6,height:.5};
const version=colourComparisonVersion(photoId,'source',crop);
const response=(index,referenceVersion=version)=>{const pair=adaptivePair('temperature',index);return{trialId:pair.id,photoId,revision:1,answer:'B',confirmedOnDrape:true,presentation:{left:'A',right:'B',aColor:pair.a.color,bColor:pair.b.color,transform:'{}',referenceVersion}}};
test('known source and effective crop quarantine old/unknown context without deleting history',()=>{
 const rows=[response(0),response(1)],context={photoId,referenceVersion:version};
 assert.equal(adaptiveEvidence([],rows,context)[0].status,'provisional');
 for(const referenceVersion of [colourComparisonVersion(photoId,'changed',crop),colourComparisonVersion(photoId,'source',{...crop,y:.2}),colourComparisonVersion(photoId,'source')]){assert.equal(adaptiveEvidence([],rows,{photoId,referenceVersion})[0].status,'unknown');assert.equal(adaptiveEvidence([], [response(0,referenceVersion),response(1,referenceVersion)],{photoId,referenceVersion})[0].status,'provisional');}
 const legacy=response(0);delete legacy.presentation.referenceVersion;
 assert.equal(responseInColourContext(legacy,context),false);
 assert.equal(responseInColourContext(legacy,{}),true);
 assert.equal(rows.length,2);
 assert.equal(adaptiveEvidence([],rows,{photoId:'other',referenceVersion:version})[0].status,'unknown');
});
test('confounded original pairs cannot manufacture supported shortlist, controlled adaptive answers can',()=>{
 const base=['T1','T2'].map(trialId=>({trialId,photoId,revision:1,answer:'B',confirmedOnDrape:true,presentation:{referenceVersion:version}}));
 const context={photoId,referenceVersion:version};
 assert.equal(adaptivePaletteChoices(base,[],context).supported,false);
 const result=adaptivePaletteChoices(base,[response(0),response(1)],context);
 assert.equal(result.supported,true);assert.equal(result.evidence[0].direction,'positive');assert.equal(result.templates.length,5);
 assert.ok(result.templates.every(template=>template.anchor_coords[0]>0));
});
