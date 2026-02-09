const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('TradeLocker order submissions in App route through guarded broker request path', () => {
  const source = read('App.tsx');
  const directBypass = /window\.glass!?\.tradelocker!?\.placeOrder\s*\(/.test(source);
  assert.equal(directBypass, false);

  const guardedCalls = source.match(/requestBrokerWithAudit\(\s*'placeOrder'/g) || [];
  assert.equal(guardedCalls.length >= 2, true);
  assert.equal(source.includes("source: 'trade_execute'"), true);
  assert.equal(source.includes("source: 'ticket_execute'"), true);
  assert.equal(source.includes("brokerId: 'tradelocker'"), true);
  assert.equal(source.includes('submitTradeLockerOrderBatch({'), true);
  assert.equal(source.includes("LEGACY_TL_SUBMISSION_FLAG_KEY = 'execution.useLegacyTradeLockerSubmission'"), true);
});
