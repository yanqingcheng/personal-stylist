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
const { atlas, drapeTrials, summariseEvidence, getCandidates, sampleCandidates, personalPalette } = loaded.exports;
const response = (trialId, photoId, answer, revision = 1, comment) => ({ trialId, photoId, answer, revision, comment });

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
