const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('app runtime stream state machine guards reconnect churn and tracks active stream refs', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('runtimeOpsActiveStreamIdRef'), true);
  assert.equal(app.includes('runtimeOpsStreamConnectedRef'), true);
  assert.equal(app.includes('runtimeOpsStreamConnectingRef'), true);
  assert.equal(app.includes('if (runtimeOpsStreamConnectedRef.current && runtimeOpsActiveStreamIdRef.current) return;'), true);
  assert.equal(app.includes('runtime_ops_stream_reused'), true);
  assert.equal(app.includes("code: 'runtime_ops_stream_fallback_enabled'"), true);
});
