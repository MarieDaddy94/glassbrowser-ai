const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-renderer-sse-'));
}

test('runtime ops SSE publishes renderer_error events', async () => {
  const userData = mkUserDataDir();
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async () => ({ ok: true }),
    getRuntimeEvents: () => [],
    getRuntimeDroppedCount: () => 0
  });

  let req = null;
  try {
    const start = await bridge.start();

    const textPromise = new Promise((resolve, reject) => {
      let collected = '';
      let settled = false;
      let emitted = false;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        if (req) {
          try { req.destroy(); } catch { /* ignore */ }
        }
        if (error) reject(error);
        else resolve(value);
      };

      req = http.request({
        host: '127.0.0.1',
        port: start.port,
        path: '/runtime-ops/v1/events?replayLast=0',
        method: 'GET',
        headers: {
          authorization: `Bearer ${start.token}`,
          accept: 'text/event-stream'
        }
      });

      req.on('response', (res) => {
        res.on('data', (chunk) => {
          collected += chunk.toString('utf8');
          if (!emitted && collected.includes('event: bridge_state')) {
            emitted = true;
            bridge.onRuntimeEvent({
              id: 'evt_renderer_1',
              seq: 7,
              ts: Date.now(),
              source: 'renderer_error',
              level: 'error',
              code: 'renderer_live_error',
              message: 'renderer crash sample'
            });
          }
          if (collected.includes('renderer_error') && collected.includes('renderer_live_error')) {
            finish(collected, null);
          }
        });
        res.on('error', (err) => finish(collected, err));
      });
      req.on('error', (err) => finish(collected, err));
      req.end();

      setTimeout(() => finish(collected, null), 2500);
    });

    const text = await textPromise;
    assert.equal(text.includes('renderer_error'), true);
    assert.equal(text.includes('renderer_live_error'), true);
  } finally {
    try {
      if (req) req.destroy();
    } catch {
      // ignore
    }
    await bridge.stop();
  }
});
