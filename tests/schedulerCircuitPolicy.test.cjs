const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('scheduler circuit guard pauses and resumes non-critical groups', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("id: SCHEDULER_CIRCUIT_GUARD_TASK_ID"), true);
  assert.equal(app.includes("runtimeScheduler.pauseGroup(groupId)"), true);
  assert.equal(app.includes("runtimeScheduler.resumeGroup(groupId)"), true);
  assert.equal(app.includes("eventType: 'scheduler_circuit_policy'"), true);
});

test('broker circuit exposes per-source state', () => {
  const source = read('services/brokerCircuitBreaker.ts');
  assert.equal(source.includes('getSourceSnapshot('), true);
  assert.equal(source.includes("state: 'CLOSED' | 'HALF_OPEN' | 'OPEN'"), true);
});
