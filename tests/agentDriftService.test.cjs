const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('agent drift service computes segmented drift and rank freshness', () => {
  const source = read('services/agentDriftService.ts');
  assert.equal(source.includes('computeAgentDriftReports'), true);
  assert.equal(source.includes('segmentKeyOf'), true);
  assert.equal(source.includes('buildRankFreshnessState'), true);
  assert.equal(source.includes('pickSeverity'), true);
  assert.equal(source.includes("return 'poor'"), true);
});

test('app publishes drift reports and rank freshness to health snapshot', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('agentDriftReportsRef.current = computeAgentDriftReports'), true);
  assert.equal(app.includes('rankFreshness = buildRankFreshnessState'), true);
  assert.equal(app.includes('agentDrift:'), true);
  assert.equal(app.includes('rankFreshness,'), true);
});
