const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');

test('TradeLocker history mapper extracts broader broker fields and tags account identity', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.equal(source.includes('const readBrokerHistoryNumber = useCallback((order: any, keys: string[]): number | null => {'), true);
  assert.equal(source.includes('const readBrokerHistoryTimestampMs = useCallback((order: any, keys: string[]): number | null => {'), true);
  assert.equal(source.includes("if (historyAllAccounts) return true;"), true);
  assert.equal(source.includes("if (matchState === 'mismatch') return false;"), true);
  assert.equal(source.includes("return matchState === 'match';"), true);
  assert.equal(source.includes("'netProfit'"), true);
  assert.equal(source.includes("'profitValue'"), true);
  assert.equal(source.includes("'closedProfit'"), true);
  assert.equal(source.includes("readBrokerHistoryNumber(order, ['stopLoss', 'sl', 'slPrice', 'stop', 'stopPrice'])"), true);
  assert.equal(source.includes("readBrokerHistoryNumber(order, ['takeProfit', 'tp', 'tpPrice', 'take', 'takePrice'])"), true);
  assert.equal(source.includes('account: accountIdentity,'), true);
  assert.equal(source.includes('acct: accountIdentity,'), true);
  assert.equal(source.includes('accountKey'), true);
  assert.equal(source.includes("{Number.isFinite(Number(o.stopLoss)) && Number(o.stopLoss) > 0 ? formatPrice(Number(o.stopLoss)) : '--'}"), true);
  assert.equal(source.includes("{Number.isFinite(Number(o.takeProfit)) && Number(o.takeProfit) > 0 ? formatPrice(Number(o.takeProfit)) : '--'}"), true);
});
