const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-auth-'));
}

function requestJson({ port, token = null, route, method = 'GET', body = null }) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: route,
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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

test('runtime ops external bridge requires bearer token and allows authorized request', async () => {
  const userData = mkUserDataDir();
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async () => ({ ok: true }),
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0
  });
  const start = await bridge.start();

  const unauthorized = await requestJson({
    port: start.port,
    route: '/runtime-ops/v1/health'
  });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.body?.ok, false);

  const authorized = await requestJson({
    port: start.port,
    token: start.token,
    route: '/runtime-ops/v1/health'
  });
  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.body?.ok, true);
  assert.equal(typeof authorized.body?.pid, 'number');

  await bridge.stop();
});

