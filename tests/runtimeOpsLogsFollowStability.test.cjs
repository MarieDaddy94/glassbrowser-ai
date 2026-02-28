const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime ops CLI logs follow parser supports buffered SSE and retry loop', () => {
  const client = read('scripts/runtimeOpsClient.cjs');

  assert.equal(client.includes('function createSseParser(onEvent)'), true);
  assert.equal(client.includes('const retry ='), true);
  assert.equal(client.includes('while (true) {'), true);
  assert.equal(client.includes('SSE stream closed. Retrying in'), true);
  assert.equal(client.includes('manualAbort = true;'), true);
});

