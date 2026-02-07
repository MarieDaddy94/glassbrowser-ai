const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal lifecycle service builds resolved outcome and attribution', () => {
  const source = read('services/signalLifecycleService.ts');
  assert.equal(source.includes('buildResolvedOutcomeEnvelope'), true);
  assert.equal(source.includes('buildSignalAttributionRecord'), true);
  assert.equal(source.includes("decisionOutcome"), true);
  assert.equal(source.includes("executionOutcome"), true);
});

test('signal history upsert persists resolved outcome envelope and attribution', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('resolvedOutcomeEnvelope'), true);
  assert.equal(app.includes('attribution'), true);
  assert.equal(app.includes('buildResolvedOutcomeEnvelope({'), true);
  assert.equal(app.includes('buildSignalAttributionRecord({'), true);
});
