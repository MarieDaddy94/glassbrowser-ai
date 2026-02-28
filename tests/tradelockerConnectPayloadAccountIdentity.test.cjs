const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const runtimePath = path.join(process.cwd(), 'services', 'catalogBrokerRuntime.ts');

test('tradelocker.connect normalizes account identity aliases before connect call', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /const accountId = parseTradeLockerAccountNumber\(payload\.accountId \?\? payload\.id \?\? payload\.accountID\)/);
  assert.match(source, /const accNum = parseTradeLockerAccountNumber\(payload\.accNum \?\? payload\.accountNum \?\? payload\.accountNumber\)/);
});

test('tradelocker.connect forwards accountId and accNum into bridge payload', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /accountId:\s*accountId \?\? undefined/);
  assert.match(source, /accNum:\s*accNum \?\? undefined/);
});

test('tradelocker.connect forwards profileKey for per-profile secret resolution', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /const profileKey =/);
  assert.match(source, /profileKey:\s*profileKey \|\| undefined/);
});
