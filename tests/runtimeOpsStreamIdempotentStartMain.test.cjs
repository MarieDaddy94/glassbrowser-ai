const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('main runtime stream start is idempotent per renderer and emits reuse lifecycle', () => {
  const main = read('electron/main.cjs');

  assert.equal(main.includes('const forceRestart = opts?.forceRestart === true;'), true);
  assert.equal(main.includes('if (existing && !forceRestart) {'), true);
  assert.equal(main.includes("code: 'runtime_ops_stream_reused'"), true);
  assert.equal(main.includes('reused: true'), true);
  assert.equal(main.includes("code: 'runtime_ops_stream_connected'"), true);
  assert.equal(main.includes("code: 'runtime_ops_stream_closed'"), true);
});

