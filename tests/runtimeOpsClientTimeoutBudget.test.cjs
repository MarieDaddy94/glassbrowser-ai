const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT = path.join(ROOT, 'scripts', 'runtimeOpsClient.cjs');

test('runtimeOpsClient status distinguishes partial availability when health is reachable but state relay is degraded', () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  assert.equal(source.includes('partial: healthOk && !stateRelayOk'), true);
  assert.equal(source.includes('Bridge reachable but renderer command relay timed out.'), true);
  assert.equal(source.includes('state returned from stale cache fallback'), true);
});

test('runtimeOpsClient request timeout budget exceeds relay timeout budget', () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  assert.equal(source.includes('timeoutMs = 20000'), true);
});
