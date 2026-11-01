/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test runner. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const filename = path.join(__dirname, 'index.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(compiled, filename);
const { atlas, drapeTrials, summariseEvidence, getCandidates, sampleCandidates, personalPalette, nextColourComparison } = loaded.exports;
const response = (trialId, photoId, answer, revision = 1, comment) => ({ trialId, photoId, answer, revision, comment, confirmedOnDrape: true });

test('atlas is complete with distinct embedded seasons and every wardrobe role', () => {
  assert.equal(atlas.length, 31);
  assert.equal(new Set(atlas.map((t) => t.id)).size, 31);
  assert.equal(atlas.filter((t) => t.canonical_season).length, 12);
  assert.equal(new Set(atlas.filter((t) => t.canonical_season).map((t) => t.canonical_season)).size, 12);
  assert.equal(drapeTrials.length, 8);
  for (const t of atlas) {
    assert.equal(Object.keys(t.neutrals).length, 5);
    assert.equal(Object.keys(t.accents).length, 8);
    assert.ok([...Object.values(t.neutrals), ...Object.values(t.accents)].every((hex) => /^#[\da-f]{6}$/i.test(hex)));
  }
});

test('empty, both, neither and conflicting evidence never force neutral', () => {
  const empty = summariseEvidence([]);
  assert.equal(getCandidates(empty).candidates.length, 31);
  assert.ok(getCandidates(empty).candidates.some((t) => t.name === 'Black Opal'));
  assert.equal(summariseEvidence([response('T1','p','both')]).temperature.status, 'broad');
  assert.equal(summariseEvidence([response('T1','p','neither')]).temperature.status, 'unknown');
  assert.equal(summariseEvidence([response('T1','p','A'), response('T1','q','B')]).temperature.status, 'conflicting');
  assert.equal(summariseEvidence([response('T1','p','A'), response('T2','p','B')]).temperature.range, null);
});

test('latest per photo and distinct hue families drive provisional ranges', () => {
  const one = summariseEvidence([response('T1','p','A'), response('T1','q','A')]);
  assert.equal(one.temperature.status, 'unknown');
  const summary = summariseEvidence([response('T1','p','A',1), response('T1','p','B',2,'my own words'), response('T2','p','B')]);
  assert.deepEqual(summary.temperature.range, [0.1, 1]);
  assert.equal(summary.temperature.trialVotes[0].responses[0].comment, 'my own words');
  assert.equal(summary.value.range, null);
  assert.ok(getCandidates(summary).candidates.every((t) => t.anchor_coords[0] >= 0.1));
  assert.equal(summariseEvidence([response('T1','p','B'), response('T2','p','B'), response('T3','p','both')]).temperature.range, null);
});

test('candidate-empty fallback and deterministic comparison sample', () => {
  const summary = summariseEvidence([]);
  summary.temperature.range = [2, 3];
  assert.deepEqual(getCandidates(summary), { candidates: [], broaderExploration: true });
  const all = summariseEvidence([]);
  const sample = sampleCandidates(atlas, all);
  assert.equal(sample.length, 3);
  assert.equal(sample[0].id, [...atlas].map((t) => t.id).sort()[0]);
  assert.deepEqual(sample.map((t) => t.id), sampleCandidates([...atlas].reverse(), all).map((t) => t.id));
});

test('taste exclusions preserve underlying palette and reveal missing roles', () => {
  const template = atlas.find((t) => t.name === 'Black Opal');
  const result = personalPalette(template, ['neutral:light_shirt', 'accent:red']);
  assert.deepEqual(result.missingRoles, ['neutral:light_shirt', 'accent:red']);
  assert.equal(result.swatches.length, 11);
  assert.ok(template.neutrals.light_shirt);
});


test('ambiguous old reversed placement is excluded until the user confirms it', () => {
  const old = {trialId:'T1',photoId:'private',revision:1,answer:'A',presentation:{left:'B',right:'A',aHex:'#000000',bHex:'#ffffff',transform:'contain-center'}};
  const original=structuredClone(old);
  assert.equal(summariseEvidence([old]).temperature.trialVotes[0].status,'no-direction');
  assert.deepEqual(old,original);
  const confirmed={...old,revision:2,answer:'B',confirmedOnDrape:true};
  assert.equal(summariseEvidence([old,confirmed]).temperature.trialVotes[0].status,'positive');
});


test('next comparison covers untested axes before repeating one', () => {
  assert.equal(nextColourComparison([]).trialId,'T1');
  assert.equal(nextColourComparison([response('T1','p','B')]).trialId,'V1');
  assert.equal(nextColourComparison([response('T1','p','B'),response('V1','p','A')]).trialId,'C1');
});
test('conflict selects an unused family without changing any answers', () => {
  const input=[response('T1','p','A'),response('T2','p','B')];
  const before=structuredClone(input); const result=nextColourComparison(input);
  assert.equal(result.action,'compare'); assert.equal(result.trialId,'T3'); assert.match(result.reason,/differ/); assert.deepEqual(input,before);
});
test('repeated questions do not create independence and broad evidence stays broad', () => {
  const input=[response('T1','p','both'),response('T1','q','both'),response('V1','p','neither'),response('C1','p','unsure')];
  assert.equal(summariseEvidence(input).temperature.status,'broad');
  const result=nextColourComparison(input); assert.equal(result.trialId,'T2'); assert.match(result.reason,/both colours/i);
  assert.equal(summariseEvidence(input).temperature.range,null);
});
test('ambiguous legacy answers require confirmation; later confirmed choice resolves it', () => {
  const legacy={trialId:'T1',photoId:'p',answer:'A',revision:1,presentation:{left:'B',right:'A',aHex:'#000000',bHex:'#ffffff',transform:'contain-center'}};
  assert.deepEqual(nextColourComparison([legacy]),{action:'confirm',trialId:'T1',photoId:'p',reason:'Please confirm which colour you meant in this earlier comparison before it guides the next step.'});
  assert.notEqual(nextColourComparison([legacy,{...legacy,revision:2,confirmedOnDrape:true}]).action,'confirm');
});
test('explicit pause and exhausted or fully provisional evidence do not invent neutrality', () => {
  assert.equal(nextColourComparison([],true).action,'pause');
  const all=drapeTrials.map(t=>response(t.id,'p','unsure'));
  assert.equal(nextColourComparison(all).action,'pause'); assert.match(nextColourComparison(all).reason,/inconclusive/);
  const resolved=['T1','T2','V1','V2','C1','C2'].map(id=>response(id,'p',id[0]==='T'?'B':'A'));
  assert.equal(nextColourComparison(resolved).action,'pause'); assert.match(nextColourComparison(resolved).reason,/provisional/);
});
