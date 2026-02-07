const test = require('node:test');
const assert = require('node:assert/strict');
const { createSimAdapter } = require('../electron/brokerRegistry.cjs');

test('sim broker order lifecycle', async () => {
  const sim = createSimAdapter();

  const placed = await sim.handlers.placeOrder({
    symbol: 'EURUSD',
    side: 'BUY',
    qty: 1,
    orderType: 'MARKET'
  });
  assert.equal(placed.ok, true);
  assert.ok(placed.order?.id);

  const list = await sim.handlers.getOrders();
  assert.equal(list.ok, true);
  assert.equal(list.orders.length, 1);

  const fill = await sim.handlers.fillOrder({ orderId: placed.order.id, fillQty: 1, fillPrice: 1.2345 });
  assert.equal(fill.ok, true);
  assert.equal(fill.position.symbol, 'EURUSD');

  const positions = await sim.handlers.getPositions();
  assert.equal(positions.ok, true);
  assert.equal(positions.positions.length, 1);

  const close = await sim.handlers.closePosition({ positionId: fill.position.id });
  assert.equal(close.ok, true);
});

test('sim broker supports failure injection', async () => {
  const sim = createSimAdapter();
  const res = await sim.handlers.placeOrder({
    symbol: 'EURUSD',
    side: 'SELL',
    qty: 2,
    simulate: { error: 'Rate limit', code: 'RATE_LIMIT', status: 429, retryAfterMs: 500, retryable: true }
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'RATE_LIMIT');
  assert.equal(res.status, 429);
  assert.equal(res.retryAfterMs, 500);
});

test('sim broker fillOrder is idempotent for already-filled orders', async () => {
  const sim = createSimAdapter();

  const placed = await sim.handlers.placeOrder({
    symbol: 'EURUSD',
    side: 'BUY',
    qty: 1,
    orderType: 'MARKET'
  });
  assert.equal(placed.ok, true);
  assert.ok(placed.order?.id);
  assert.ok(placed.position?.id);

  const firstPositionId = placed.position.id;
  const refill = await sim.handlers.fillOrder({ orderId: placed.order.id, fillQty: 1, fillPrice: 1.2345 });
  assert.equal(refill.ok, true);
  assert.equal(refill.position?.id, firstPositionId);

  const positions = await sim.handlers.getPositions();
  assert.equal(positions.ok, true);
  assert.equal(positions.positions.length, 1);
});
