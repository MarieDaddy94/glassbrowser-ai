const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const runtimePath = path.join(process.cwd(), 'services', 'catalogBrokerRuntime.ts');

test('catalog runtime normalizes TradeLocker set-active payload aliases', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /parseTradeLockerAccountNumber\(payload\.accountId \?\? payload\.id \?\? payload\.accountID\)/);
  assert.match(source, /parseTradeLockerAccountNumber\(payload\.accNum \?\? payload\.accountNum \?\? payload\.accountNumber\)/);
});

test('catalog runtime returns deterministic account-switch error codes', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /code:\s*'account_unresolved'/);
  assert.match(source, /code:\s*'tradelocker_disconnected'/);
  assert.match(source, /code:\s*'switch_verification_failed'/);
});
