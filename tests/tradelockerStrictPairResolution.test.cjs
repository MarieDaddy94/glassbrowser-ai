const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const electronPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('strict account pair resolver is used in account context and active-account paths', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /function resolveTradeLockerAccountPair\(accounts,\s*\{/);
  assert.match(source, /const resolved = resolveTradeLockerAccountPair\(accounts,\s*\{[\s\S]*allowSingleAccountFallback:\s*false[\s\S]*\}\);/);
  assert.match(source, /const resolved = resolveTradeLockerAccountPair\(accounts,\s*\{[\s\S]*allowSingleAccountFallback:\s*true[\s\S]*\}\);/);
  assert.doesNotMatch(source, /if \(hasAccountId && aId != null && aId === accountId\) return true;\s*if \(hasAccNum && aAccNum != null && aAccNum === accNum\) return true;/);
});

