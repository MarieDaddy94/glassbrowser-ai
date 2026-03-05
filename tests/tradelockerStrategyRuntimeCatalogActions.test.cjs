const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (relPath) => fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

test('action catalog includes TradeLocker strategy runtime actions', () => {
  const source = read('services/actionCatalog.ts');
  assert.match(source, /'tradelocker\.strategy_runtime\.list'/);
  assert.match(source, /'tradelocker\.strategy_runtime\.set_state'/);
  assert.match(source, /'tradelocker\.strategy_runtime\.assign_accounts'/);
  assert.match(source, /'tradelocker\.strategy_runtime\.reconcile'/);
});

test('catalog broker runtime handles TradeLocker strategy runtime actions', () => {
  const source = read('services/catalogBrokerRuntime.ts');
  assert.match(source, /actionId === 'tradelocker\.strategy_runtime\.list'/);
  assert.match(source, /actionId === 'tradelocker\.strategy_runtime\.set_state'/);
  assert.match(source, /actionId === 'tradelocker\.strategy_runtime\.assign_accounts'/);
  assert.match(source, /actionId === 'tradelocker\.strategy_runtime\.reconcile'/);
  assert.match(source, /listTradeLockerStrategyRuntimes/);
  assert.match(source, /setTradeLockerStrategyRuntimeState/);
  assert.match(source, /assignTradeLockerStrategyRuntimeAccounts/);
  assert.match(source, /reconcileTradeLockerStrategyRuntime/);
});

