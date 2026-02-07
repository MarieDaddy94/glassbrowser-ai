const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy case type includes attribution and resolved envelope fields', () => {
  const types = read('types.ts');
  assert.equal(types.includes("decisionOutcome?: ResolvedOutcomeEnvelope['decisionOutcome'] | null;"), true);
  assert.equal(types.includes("executionOutcome?: ResolvedOutcomeEnvelope['executionOutcome'] | null;"), true);
  assert.equal(types.includes('resolvedOutcomeEnvelope?: ResolvedOutcomeEnvelope | null;'), true);
  assert.equal(types.includes('attribution?: SignalAttributionRecord | null;'), true);
});

test('app normalizes and persists academy attribution payload fields', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("const resolvedOutcomeEnvelope = payload.resolvedOutcomeEnvelope"), true);
  assert.equal(app.includes('const resolvedOutcomeEnvelope = buildResolvedOutcomeEnvelope({'), true);
  assert.equal(app.includes('const attribution = buildSignalAttributionRecord({'), true);
  assert.equal(app.includes('decisionOutcome: resolvedOutcomeEnvelope?.decisionOutcome ?? null,'), true);
  assert.equal(app.includes('executionOutcome: resolvedOutcomeEnvelope?.executionOutcome ?? null,'), true);
  assert.equal(app.includes('attribution: attribution ?? null,'), true);
});

test('academy interface renders attribution split details', () => {
  const academy = read('components/AcademyInterface.tsx');
  assert.equal(academy.includes('Attribution'), true);
  assert.equal(academy.includes('Decision {selectedAttribution.decisionOutcome}'), true);
  assert.equal(academy.includes('Execution {selectedAttribution.executionOutcome}'), true);
  assert.equal(academy.includes('Alpha {formatBps(selectedAttribution.alphaBps)}'), true);
  assert.equal(academy.includes('Execution drag {formatBps(selectedAttribution.executionDragBps)}'), true);
});
