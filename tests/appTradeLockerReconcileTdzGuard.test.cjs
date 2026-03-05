const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'App.tsx');

test('TradeLocker reconcile callback avoids direct late refresh symbol reads', () => {
  const source = fs.readFileSync(APP, 'utf8');
  const start = source.indexOf('const reconcileTradeLockerStrategyRuntime = useCallback(async (input: {');
  const end = source.indexOf('const noteTradeLockerTenantActivity = useCallback', start);
  assert.equal(start > -1, true);
  assert.equal(end > start, true);

  const block = source.slice(start, end);
  assert.match(block, /runRefreshBurst/);
  assert.match(block, /refreshSnapshotRef\.current/);
  assert.match(block, /refreshOrdersRef\.current/);
  assert.match(block, /refreshOrdersHistoryRef\.current/);
  assert.match(block, /refreshAccountMetricsRef\.current/);
  assert.match(block, /refreshQuotesRef\.current/);

  assert.equal(block.includes('tlRefreshSnapshot('), false);
  assert.equal(block.includes('tlRefreshOrders('), false);
  assert.equal(block.includes('tlRefreshOrdersHistory('), false);
  assert.equal(block.includes('tlRefreshAccountMetrics('), false);
  assert.equal(block.includes('tlRefreshQuotes('), false);
  assert.equal(block.includes('tlRefreshAccounts)'), false);
});
