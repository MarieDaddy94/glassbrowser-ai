const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-actions-'));
}

function requestJson({ port, token, route }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          json = { ok: false, raw };
        }
        resolve({ statusCode: Number(res.statusCode || 0), body: json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('runtime ops /actions relays actions.list command and returns safety metadata', async () => {
  const userData = mkUserDataDir();
  const seen = [];
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async (command) => {
      seen.push(command);
      if (command !== 'actions.list') {
        return { ok: false, error: 'unexpected command' };
      }
      return {
        ok: true,
        actions: [
          {
            id: 'chart.refresh',
            domain: 'chart',
            summary: 'Refresh chart state',
            requiresBroker: false,
            requiresVision: false,
            safety: { gates: [], requiresConfirmation: false }
          }
        ]
      };
    },
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0
  });

  const start = await bridge.start();
  const res = await requestJson({
    port: start.port,
    token: start.token,
    route: '/runtime-ops/v1/actions'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.deepEqual(seen, ['actions.list']);
  assert.equal(Array.isArray(res.body?.actions), true);
  assert.equal(res.body.actions[0]?.id, 'chart.refresh');
  assert.deepEqual(res.body.actions[0]?.safety, { gates: [], requiresConfirmation: false });

  await bridge.stop();
});
