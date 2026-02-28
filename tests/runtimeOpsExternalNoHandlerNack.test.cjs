const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('preload runtime external command path sends no_handler nack when no renderer listeners exist', () => {
  const preload = read('electron/preload.cjs');
  assert.equal(preload.includes("runtime_ops:external_command"), true);
  assert.equal(preload.includes("code: 'no_handler'"), true);
  assert.equal(preload.includes("runtime_ops:external_command:result"), true);
});
