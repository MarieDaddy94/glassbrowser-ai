const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('preload exposes app shutdown listener and ready acknowledgement bridge', () => {
  const source = read('electron/preload.cjs');
  assert.equal(source.includes("ipcRenderer.on('app:prepare-shutdown'"), true);
  assert.equal(source.includes('const onAppPrepareShutdown = (handler) => {'), true);
  assert.equal(source.includes('const guardedOnAppPrepareShutdown = (handler) => {'), true);
  assert.equal(source.includes('onPrepareShutdown: guardedOnAppPrepareShutdown,'), true);
  assert.equal(source.includes("notifyShutdownReady: (payload) => guardedInvoke('bridge', 'app:shutdown-ready', payload || {})"), true);
});

