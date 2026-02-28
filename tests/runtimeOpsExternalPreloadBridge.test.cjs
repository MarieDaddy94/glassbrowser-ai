const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime ops external preload bridge exposes command listener and reply invoke', () => {
  const preload = read('electron/preload.cjs');

  assert.equal(preload.includes("ipcRenderer.on('runtime_ops:external_command'"), true);
  assert.equal(preload.includes('const runtimeOpsExternalCommandListeners = new Set();'), true);
  assert.equal(preload.includes('const guardedOnRuntimeOpsExternalCommand = (handler) => {'), true);
  assert.equal(preload.includes("replyExternalCommand: (payload) => guardedInvoke('bridge', 'runtime_ops:external_command:result', payload || {})"), true);
  assert.equal(preload.includes("subscribeExternalCommand: () => guardedInvoke('bridge', 'runtime_ops:external_command:subscribe')"), true);
  assert.equal(preload.includes("unsubscribeExternalCommand: () => guardedInvoke('bridge', 'runtime_ops:external_command:unsubscribe')"), true);
  assert.equal(preload.includes('onExternalCommand: guardedOnRuntimeOpsExternalCommand'), true);
});
