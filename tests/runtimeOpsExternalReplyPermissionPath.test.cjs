const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('preload routes runtime ops invoke paths through bridge scope to avoid diagnostics permission volatility', () => {
  const preload = read('electron/preload.cjs');
  assert.equal(preload.includes("guardedInvoke('bridge', 'runtime_ops:external_command:subscribe')"), true);
  assert.equal(preload.includes("guardedInvoke('bridge', 'runtime_ops:external_command:unsubscribe')"), true);
  assert.equal(preload.includes("guardedInvoke('bridge', 'runtime_ops:controller_state:update'"), true);
  assert.equal(preload.includes("guardedInvoke('bridge', 'runtime_ops:renderer_event'"), true);
  assert.equal(preload.includes("guardedInvoke('bridge', 'runtime_ops:external_command:result'"), true);
});
