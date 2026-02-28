const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const electronPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('TradeLocker getStatus exposes token/account health contract and degraded connection state', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /getConnectionStateSnapshot\(\)/);
  assert.match(source, /tokenConnected:/);
  assert.match(source, /accountContextReady:/);
  assert.match(source, /accountRouteHealthy:/);
  assert.match(source, /connectionState:/);
  assert.match(source, /degradedReason:/);
  assert.match(source, /lastAccountAuthError:/);
  assert.match(source, /lastAccountAuthAtMs:/);
});

