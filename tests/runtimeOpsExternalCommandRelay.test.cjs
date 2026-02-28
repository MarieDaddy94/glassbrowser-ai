const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-relay-'));
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

test('runtime ops external bridge relays mode/action commands to renderer command relay', async () => {
  const userData = mkUserDataDir();
  const seen = [];
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async (command, payload) => {
      seen.push({ command, payload });
      if (command === 'mode.set') return { ok: true, mode: payload?.mode || null };
      if (command === 'action.run') return { ok: true, actionId: payload?.actionId || null };
      return { ok: true };
    },
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0
  });

  const start = await bridge.start();

  const modeRes = await requestJson({
    port: start.port,
    token: start.token,
    route: '/runtime-ops/v1/mode',
    method: 'POST',
    body: { mode: 'autonomous' }
  });
  assert.equal(modeRes.statusCode, 200);
  assert.equal(modeRes.body?.ok, true);

  const actionRes = await requestJson({
    port: start.port,
    token: start.token,
    route: '/runtime-ops/v1/action',
    method: 'POST',
    body: {
      actionId: 'chart.refresh',
      payload: { source: 'test' },
      confirm: true
    }
  });
  assert.equal(actionRes.statusCode, 200);
  assert.equal(actionRes.body?.ok, true);

  assert.equal(seen.length >= 2, true);
  assert.equal(seen[0].command, 'mode.set');
  assert.equal(seen[0].payload?.mode, 'autonomous');
  assert.equal(seen[1].command, 'action.run');
  assert.equal(seen[1].payload?.actionId, 'chart.refresh');
  assert.equal(seen[1].payload?.confirm, true);
  assert.deepEqual(seen[1].payload?.payload, { source: 'test' });

  await bridge.stop();
});

