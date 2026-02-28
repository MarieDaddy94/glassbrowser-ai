const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('monitor and app wiring expose runtime ops action/decision history surfaces', () => {
  const monitor = read('components/MonitorInterface.tsx');
  const app = read('App.tsx');

  assert.equal(monitor.includes('Recent Decisions'), true);
  assert.equal(monitor.includes('runtimeOpsState?.recentDecisions'), true);
  assert.equal(monitor.includes('Recent Actions'), true);
  assert.equal(monitor.includes('runtimeOpsState?.recentActions'), true);
  assert.equal(app.includes('runtimeOpsEvents={runtimeOpsEvents}'), true);
  assert.equal(app.includes('runtimeOpsState={runtimeOpsControllerState}'), true);
  assert.equal(app.includes('onRunRuntimeOpsAction={runRuntimeOpsAction}'), true);
});

