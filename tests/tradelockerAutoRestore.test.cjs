const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const hookPath = path.join(process.cwd(), 'hooks', 'useTradeLocker.ts');

test('TradeLocker startup auto-restore no longer requires autoConnect toggle', () => {
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.equal(source.includes('if (!savedConfig?.autoConnect) return;'), false);
});

test('TradeLocker startup auto-restore requires persisted account identity', () => {
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.match(source, /const activeProfile = loadActiveTradeLockerAutoRestoreProfile\(\);/);
  assert.match(source, /const accountId = activeProfile\?\.accountId \?\? savedConfig\?\.accountId \?\? null;/);
  assert.match(source, /if \(!server \|\| !email \|\| \(accountId == null && accNum == null\)\) return;/);
});
