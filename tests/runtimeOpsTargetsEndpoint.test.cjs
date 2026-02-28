const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-targets-'));
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

test('runtime ops /targets returns deterministic renderer target topology', async () => {
  const userData = mkUserDataDir();
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async () => ({ ok: true }),
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0,
    getTargetState: () => ({
      selectedWebContentsId: 17,
      selectedSource: 'external_command_subscriber',
      selectedIsSubscribed: true,
      selectedIsStreamSubscriber: true,
      commandSubscribers: [{ webContentsId: 17, subscribedAtMs: 101, lastSeenAtMs: 202 }],
      streamSubscribers: [{ webContentsId: 17, streamId: 'runtime_stream_abc', subscribedAtMs: 101 }],
      lastResponderWebContentsId: 17,
      preferredWebContentsId: 17
    })
  });

  const start = await bridge.start();
  const res = await requestJson({
    port: start.port,
    token: start.token,
    route: '/runtime-ops/v1/targets'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.target?.selectedWebContentsId, 17);
  assert.equal(res.body?.target?.selectedSource, 'external_command_subscriber');
  assert.equal(Array.isArray(res.body?.target?.commandSubscribers), true);
  assert.equal(res.body?.target?.commandSubscribers?.length, 1);

  await bridge.stop();
});
