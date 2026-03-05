const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('main process exposes mt5 lifecycle IPC endpoints in both entrypoints', () => {
  const electronMain = read('electron/main.cjs');
  const rootMain = read('main.cjs');

  for (const source of [electronMain, rootMain]) {
    assert.equal(source.includes("ipcMain.handle('mt5Bridge:heartbeat'"), true);
    assert.equal(source.includes("ipcMain.handle('mt5Bridge:lifecycleStatus'"), true);
    assert.equal(source.includes("ipcMain.handle('mt5Bridge:forceRestart'"), true);
    assert.equal(source.includes('startMt5BridgeHeartbeatLoop'), true);
    assert.equal(source.includes('BRIDGE_AUTH_HEADER'), true);
  }
});

test('python bridge enforces auth token and heartbeat endpoint', () => {
  const bridge = read('backend/mt5_bridge/app.py');
  assert.equal(bridge.includes('BRIDGE_AUTH_HEADER = "x-glass-bridge-token"'), true);
  assert.equal(bridge.includes('@app.middleware("http")'), true);
  assert.equal(bridge.includes('@app.get("/heartbeat")'), true);
  assert.equal(bridge.includes('if BRIDGE_AUTH_REQUIRED:'), true);
  assert.equal(bridge.includes('websocket.query_params.get("token")'), true);
});
