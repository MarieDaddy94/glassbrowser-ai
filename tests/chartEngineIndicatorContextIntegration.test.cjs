const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chart engine integrates indicator V1 context and telemetry', () => {
  const source = read('services/chartEngine.ts');

  assert.equal(source.includes("from './indicatorMath'"), true);
  assert.equal(source.includes("indicatorContextVersion: 'v1'"), true);
  assert.equal(source.includes('vwapSession: vwap.sessionKey || null'), true);
  assert.equal(source.includes('bbBasis: bb.basis ?? null'), true);
  assert.equal(source.includes('ichimokuBias: ichimoku.bias || null'), true);
  assert.equal(source.includes('fibNearestLevel: fib.nearestLevel ?? null'), true);
  assert.equal(source.includes('indicatorTags.push(\'bb_squeeze\')'), true);
  assert.equal(source.includes('indicatorCoverageCount:'), true);
  assert.equal(source.includes('fibAnchorMissingCount:'), true);
  assert.equal(source.includes('indicatorComputeMs:'), true);
});
