const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const electronPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('setActiveAccount resolves accountId/accNum through strict cached-pair resolver', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /const accounts = Array\.isArray\(this\.accountsCache\?\.accounts\) \? this\.accountsCache\.accounts : \[\];/);
  assert.match(source, /resolveTradeLockerAccountPair\(accounts,\s*\{[\s\S]*accountId,[\s\S]*accNum,[\s\S]*allowSingleAccountFallback:\s*false[\s\S]*\}\)/);
});

test('setActiveAccount returns deterministic unresolved-account code', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /code:\s*'ACCOUNT_UNRESOLVED'/);
  assert.match(source, /TradeLocker account could not be resolved\./);
});
