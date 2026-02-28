const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-'));
}

test('runtime ops external bridge writes discovery file with token/port and removes it on stop', async () => {
  const userData = mkUserDataDir();
  const logs = [];
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    appendMainLog: (line) => logs.push(String(line || '')),
    relayExternalCommand: async () => ({ ok: true }),
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0,
    getBridgeSnapshot: () => ({ mode: 'autonomous', streamStatus: 'connected' })
  });

  const start = await bridge.start();
  assert.equal(start.ok, true);
  assert.equal(Number.isFinite(Number(start.port)), true);
  assert.equal(typeof start.token, 'string');
  assert.equal(start.token.length > 10, true);

  const discoveryPath = path.join(userData, 'runtime-ops-bridge.json');
  assert.equal(fs.existsSync(discoveryPath), true);
  const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
  assert.equal(discovery.version, 'v1');
  assert.equal(discovery.port, start.port);
  assert.equal(discovery.pid, process.pid);
  assert.equal(typeof discovery.token, 'string');
  assert.equal(discovery.token.length > 10, true);

  await bridge.stop();
  assert.equal(fs.existsSync(discoveryPath), false);
});

