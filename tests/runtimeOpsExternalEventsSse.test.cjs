const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const { createRuntimeOpsExternalBridge } = require('../services/runtimeOpsExternalBridge.cjs');

function mkUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glass-runtime-ops-sse-'));
}

test('runtime ops external bridge SSE endpoint replays recent runtime events', async () => {
  const userData = mkUserDataDir();
  const replayEvents = [
    { id: 'evt_1', seq: 1, ts: Date.now() - 1000, source: 'runtime', level: 'info', message: 'hello one' },
    { id: 'evt_2', seq: 2, ts: Date.now(), source: 'runtime', level: 'warn', message: 'hello two' }
  ];
  const bridge = createRuntimeOpsExternalBridge({
    app: { getPath: () => userData },
    relayExternalCommand: async () => ({ ok: true }),
    getRuntimeEvents: () => replayEvents,
    getRuntimeDroppedCount: () => 0
  });
  const start = await bridge.start();

  const text = await new Promise((resolve, reject) => {
    let collected = '';
    const req = http.request({
      host: '127.0.0.1',
      port: start.port,
      path: '/runtime-ops/v1/events?replayLast=2',
      method: 'GET',
      headers: {
        authorization: `Bearer ${start.token}`,
        accept: 'text/event-stream'
      }
    });
    req.on('response', (res) => {
      res.on('data', (chunk) => {
        collected += chunk.toString('utf8');
        if (collected.includes('hello one') && collected.includes('hello two')) {
          try {
            req.destroy();
          } catch {
            // ignore
          }
          resolve(collected);
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
    setTimeout(() => resolve(collected), 1200);
  });

  assert.equal(text.includes('event: runtime_event'), true);
  assert.equal(text.includes('hello one'), true);
  assert.equal(text.includes('hello two'), true);

  await bridge.stop();
});

