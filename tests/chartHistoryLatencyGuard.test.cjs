const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('app chart history timeout budget stays bounded for responsive panel switching', () => {
  const source = read('App.tsx');
  assert.equal(source.includes('const CHART_HISTORY_FETCH_TIMEOUT_MS = 12_000;'), true);
});

test('chart engine does not retry timeout failures to avoid doubled stall windows', () => {
  const source = read('services/chartEngine.ts');
  assert.equal(source.includes("msg.includes('timeout')"), false);
  assert.equal(source.includes("msg.includes('not connected')"), true);
  assert.equal(source.includes("msg.includes('upstream')"), true);
});
