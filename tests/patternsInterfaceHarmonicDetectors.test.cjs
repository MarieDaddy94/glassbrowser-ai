const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('pattern panel exposes all harmonic detector toggles with compact detail formatter', () => {
  const source = read('components/PatternsInterface.tsx');

  assert.equal(source.includes("{ id: 'harmonic_gartley', label: 'Harmonic Gartley' }"), true);
  assert.equal(source.includes("{ id: 'harmonic_bat', label: 'Harmonic Bat' }"), true);
  assert.equal(source.includes("{ id: 'harmonic_butterfly', label: 'Harmonic Butterfly' }"), true);
  assert.equal(source.includes("{ id: 'harmonic_crab', label: 'Harmonic Crab' }"), true);
  assert.equal(source.includes("{ id: 'harmonic_deep_crab', label: 'Harmonic Deep Crab' }"), true);
  assert.equal(source.includes("{ id: 'harmonic_cypher', label: 'Harmonic Cypher' }"), true);
  assert.equal(source.includes("{ id: 'harmonic_shark', label: 'Harmonic Shark' }"), true);
  assert.equal(source.includes('const formatHarmonicDetail = (evt: PatternEvent) => {'), true);
  assert.equal(source.includes("String(payload.family || '').trim().toLowerCase() !== 'harmonic'"), true);
});
