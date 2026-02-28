const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('main process wires runtime ops external bridge and command result IPC', () => {
  const main = read('electron/main.cjs');

  assert.equal(main.includes("const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');"), true);
  assert.equal(main.includes("ipcMain.handle('runtime_ops:external_command:result'"), true);
  assert.equal(main.includes("wc.send('runtime_ops:external_command'"), true);
  assert.equal(main.includes('relayRuntimeOpsExternalCommand(command, payload || {}, { timeoutMs: requestedTimeoutMs })'), true);
  assert.equal(main.includes('runtimeOpsExternalBridge = createRuntimeOpsExternalBridge({'), true);
  assert.equal(main.includes('runtimeOpsExternalBridge?.stop?.();'), true);
});
