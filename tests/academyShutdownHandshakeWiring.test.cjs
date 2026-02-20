const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('main process performs close interception with shutdown handshake', () => {
  const source = read('electron/main.cjs');
  assert.equal(source.includes('const SHUTDOWN_PREPARE_TIMEOUT_MS = 5000;'), true);
  assert.equal(source.includes("win.webContents.send('app:prepare-shutdown'"), true);
  assert.equal(source.includes('waitForShutdownReady('), true);
  assert.equal(source.includes("ipcMain.handle('app:shutdown-ready'"), true);
});

