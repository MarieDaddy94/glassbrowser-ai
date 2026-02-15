const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('calendar pnl snapshot uses identity-aware account matching and mismatch-only nulling', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const parseAccountIdentityFromKey = (value: any) => {'), true);
  assert.equal(source.includes('resolveTradeLockerIdentityMatchState'), true);
  assert.equal(source.includes('const activeAccountMatchState = resolveTradeLockerIdentityMatchState(requestedIdentity, activeIdentity);'), true);
  assert.equal(source.includes('const shouldForceMetricNull ='), true);
  assert.equal(source.includes("activeAccountMatchState === 'mismatch' &&"), true);
  assert.equal(source.includes('requestedFromKey != null;'), true);
  assert.equal(source.includes('const requestedIdentity = {'), true);
  assert.equal(source.includes('const activeIdentity = {'), true);
  assert.equal(source.includes('if (shouldForceMetricNull) {'), true);
  assert.equal(
    source.includes('if (!shouldForceMetricNull && (accountBalance == null || accountEquity == null) && tradeLockerApi?.getAccountMetrics) {'),
    true
  );
  assert.equal(
    source.includes("if (activeAccountMatchState !== 'mismatch' && !hasTradeLockerClosedLedgerEntries && tradeLockerApi?.getOrdersHistory) {"),
    true
  );
});
