const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-state-freshness-'));
}

function requestJson({ port, token, route, method = 'GET' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method,
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

test('runtime ops /state serves stale cached response for relay timeout when cache is within freshness window', async () => {
  const userData = mkUserDataDir();
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async () => ({ ok: false, code: 'timeout', error: 'simulated timeout' }),
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0,
    getControllerStateSnapshot: () => ({
      state: {
        mode: 'autonomous',
        streamStatus: 'connected',
        externalRelayHealthy: true,
        lastExternalCommandAtMs: Date.now() - 500
      },
      updatedAtMs: Date.now() - 55_000
    })
  });

  const started = await bridge.start();
  const res = await requestJson({
    port: started.port,
    token: started.token,
    route: '/runtime-ops/v1/state'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.stale, true);
  assert.equal(res.body?.state?.mode, 'autonomous');
  assert.equal(res.body?.state?.streamStatus, 'connected');
  assert.equal(Number(res.body?.staleAgeMs || 0) <= 60_000, true);

  await bridge.stop();
});
