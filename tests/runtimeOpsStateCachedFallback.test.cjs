const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-state-cache-'));
}

function requestJson({ port, token, route, method = 'GET', body = null }) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {})
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
    if (payload) req.write(payload);
    req.end();
  });
}

test('runtime ops /state falls back to fresh cached controller state when relay times out', async () => {
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
        lastExternalCommandAtMs: Date.now()
      },
      updatedAtMs: Date.now()
    })
  });

  const start = await bridge.start();
  const res = await requestJson({
    port: start.port,
    token: start.token,
    route: '/runtime-ops/v1/state'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.stale, true);
  assert.equal(res.body?.state?.mode, 'autonomous');
  assert.equal(res.body?.state?.streamStatus, 'connected');

  await bridge.stop();
});

test('runtime ops /state returns relay timeout when cache is stale/unavailable', async () => {
  const userData = mkUserDataDir();
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async () => ({ ok: false, code: 'timeout', error: 'simulated timeout' }),
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0,
    getControllerStateSnapshot: () => ({
      state: {
        mode: 'observe_only',
        streamStatus: 'disconnected'
      },
      updatedAtMs: Date.now() - 120_000
    })
  });

  const start = await bridge.start();
  const res = await requestJson({
    port: start.port,
    token: start.token,
    route: '/runtime-ops/v1/state'
  });

  assert.equal(res.statusCode, 503);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.code, 'timeout');

  await bridge.stop();
});
