const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'App.tsx');

test('App forwards renderer errors to runtime bridge and tracks forward counter', () => {
  const source = fs.readFileSync(APP, 'utf8');
  assert.equal(source.includes("source: 'renderer_error'"), true);
  assert.equal(source.includes('runtimeOpsApi.emitRendererEvent'), true);
  assert.equal(source.includes('runtimeOpsExternalStatsRef.current.rendererErrorForwarded += 1;'), true);
  assert.equal(source.includes('runtime_ops_renderer_event_forward_failed'), true);
});
