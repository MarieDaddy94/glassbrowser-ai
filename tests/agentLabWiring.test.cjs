const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Agent Lab passes production action-catalog runner through to harness', () => {
  const lab = read('components/AgentLabInterface.tsx');
  const app = read('App.tsx');
  assert.equal(lab.includes('<AgentTestHarnessPanel onRunActionCatalog={onRunActionCatalog} />'), true);
  assert.equal(app.includes('<AgentLabInterface onRunActionCatalog={runActionCatalog} />'), true);
});

test('Agent test harness executes scenarios and replay via action catalog with live-shaped results', () => {
  const harness = read('components/AgentTestHarnessPanel.tsx');
  assert.equal(harness.includes("onRunActionCatalog({ actionId: 'agent_test.run', payload })"), true);
  assert.equal(harness.includes("onRunActionCatalog({ actionId: 'truth.replay', payload: { runId, limit: 600 } })"), true);
  assert.equal(harness.includes('if (!res?.ok) {'), true);
  assert.equal(harness.includes('setStatus(res?.error ||'), true);
});
