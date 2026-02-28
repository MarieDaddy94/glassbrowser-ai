const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('ensureTradeLockerAccount uses reconnect-first policy when disconnected', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /const ensureConnected = ensureTradeLockerConnectedRef\.current;/);
  assert.match(source, /if \(!connected && ensureConnected\)/);
  assert.match(source, /const connectRes = await ensureConnected\(/);
  assert.match(source, /resolvedBy:\s*'reconnect_retry'/);
});

test('ensureTradeLockerAccount retries switch once on connection-style errors', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /const retryable =/);
  assert.match(source, /errText\.includes\('not connected'\)/);
  assert.match(source, /errText\.includes\('disconnected'\)/);
  assert.match(source, /errText\.includes\('token'\)/);
  assert.match(source, /res = await setActiveAccount\(acct\.accountId,\s*acct\.accNum \?\? undefined\);/);
});
