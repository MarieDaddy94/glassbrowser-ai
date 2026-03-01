const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (relPath) => fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

test('catalog broker runtime wires reconcile and cancel-all through TradeLocker bridge', () => {
  const source = read('services/catalogBrokerRuntime.ts');
  assert.match(source, /actionId === 'tradelocker\.cancel_all_orders'/);
  assert.match(source, /tl\?\.cancelAllOrders/);
  assert.match(source, /actionId === 'tradelocker\.reconcile_account_state'/);
  assert.match(source, /tl\?\.reconcileAccountState/);
});

test('action catalog includes reconcile account state action', () => {
  const source = read('services/actionCatalog.ts');
  assert.match(source, /'tradelocker\.reconcile_account_state'/);
  assert.match(source, /auditEventType: 'tradelocker_reconcile_account_state'/);
});

