const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('monitor exposes runtime logs tab with merged feed and filtering controls', () => {
  const monitor = read('components/MonitorInterface.tsx');

  assert.equal(monitor.includes("setOpsTab('logs')"), true);
  assert.equal(monitor.includes('Live Logs'), true);
  assert.equal(monitor.includes('mergedRuntimeLogs'), true);
  assert.equal(monitor.includes('filteredRuntimeLogs'), true);
  assert.equal(monitor.includes('logSourceFilter'), true);
  assert.equal(monitor.includes('logLevelFilter'), true);
  assert.equal(monitor.includes('followTail'), true);
  assert.equal(monitor.includes("Stream {runtimeOpsState?.streamStatus || 'disconnected'}"), true);
});

