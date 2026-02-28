const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime ops preload bridge exposes diagnostics stream APIs and listener cleanup', () => {
  const preload = read('electron/preload.cjs');

  assert.equal(preload.includes("ipcRenderer.on('diagnostics:runtime:event'"), true);
  assert.equal(preload.includes('const diagnosticsRuntimeEventListeners = new Set();'), true);
  assert.equal(preload.includes('const guardedOnRuntimeDiagnosticsEvent = (handler) => {'), true);
  assert.equal(preload.includes("startRuntimeStream: (args) => guardedInvoke('diagnostics', 'diagnostics:runtimeStream:start', args)"), true);
  assert.equal(preload.includes("stopRuntimeStream: (args) => guardedInvoke('diagnostics', 'diagnostics:runtimeStream:stop', args)"), true);
  assert.equal(preload.includes('onRuntimeEvent: guardedOnRuntimeDiagnosticsEvent'), true);
  assert.equal(preload.includes('return () => diagnosticsRuntimeEventListeners.delete(handler);'), true);
});

