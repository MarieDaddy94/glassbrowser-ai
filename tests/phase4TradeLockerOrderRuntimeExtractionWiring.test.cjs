const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 tradelocker order runtime extraction wiring is present', () => {
  const app = read('App.tsx');
  const hook = read('hooks/orchestrators/useTradeLockerOrderRuntime.ts');

  assert.equal(
    app.includes("import { useTradeLockerOrderRuntime } from './hooks/orchestrators/useTradeLockerOrderRuntime';"),
    true
  );
  assert.equal(app.includes('} = useTradeLockerOrderRuntime({'), true);
  assert.equal(app.includes('const handleTradeLockerClosePosition = useCallback((id: string, qty?: number) => {'), false);
  assert.equal(app.includes('const handleTradeLockerCancelOrder = useCallback((orderId: string) => {'), false);
  assert.equal(app.includes('const handleTradeLockerPlaceOrder = useCallback(async (args: any) => {'), false);
  assert.equal(app.includes('handleTradeLockerPlaceOrderRef.current = handleTradeLockerPlaceOrder;'), true);

  assert.equal(hook.includes('const handleTradeLockerClosePosition = React.useCallback((id: string, qty?: number) => {'), true);
  assert.equal(hook.includes('const handleTradeLockerCancelOrder = React.useCallback((orderId: string) => {'), true);
  assert.equal(hook.includes('const handleTradeLockerPlaceOrder = React.useCallback(async (argsInput: any) => {'), true);
  assert.equal(hook.includes('submitTradeLockerOrderBatch({'), true);
  assert.equal(hook.includes("addNotification('TradeLocker Rejected', err, 'error');"), true);
});

