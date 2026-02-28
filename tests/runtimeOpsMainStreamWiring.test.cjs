const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime ops main stream hub is wired with start/stop handlers and renderer broadcast', () => {
  const main = read('electron/main.cjs');

  assert.equal(main.includes("const runtimeStreamSubscribersByWebContentsId = new Map();"), true);
  assert.equal(main.includes("wc.send('diagnostics:runtime:event', payload);"), true);
  assert.equal(main.includes("ipcMain.handle('diagnostics:runtimeStream:start'"), true);
  assert.equal(main.includes("ipcMain.handle('diagnostics:runtimeStream:stop'"), true);
  assert.equal(main.includes('function startRuntimeStreamForSender(evt, opts = {}) {'), true);
  assert.equal(main.includes('function stopRuntimeStreamForSender(evt, opts = {}) {'), true);
  assert.equal(main.includes("code: 'runtime_ops_stream_started'"), true);
  assert.equal(main.includes("code: 'runtime_ops_stream_stopped'"), true);
});

