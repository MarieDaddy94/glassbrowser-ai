const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtimeOpsClient exposes actions and target commands', () => {
  const source = read('scripts/runtimeOpsClient.cjs');
  assert.equal(source.includes("route: '/runtime-ops/v1/actions'"), true);
  assert.equal(source.includes("route: '/runtime-ops/v1/targets'"), true);
  assert.equal(source.includes("route: '/runtime-ops/v1/tradelocker/switch'"), true);
  assert.equal(source.includes("if (command === 'actions')"), true);
  assert.equal(source.includes("if (command === 'target' || command === 'targets')"), true);
  assert.equal(source.includes("if (command === 'tl-switch' || command === 'tradelocker-switch')"), true);
});
