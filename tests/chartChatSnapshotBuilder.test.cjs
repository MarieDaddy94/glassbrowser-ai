const test = require('node:test');
const assert = require('node:assert/strict');

const modPromise = import('../services/chartChatSnapshotBuilder.js');

const makeBars = (count, startTs) => {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      t: startTs + i * 60_000,
      o: 100 + i,
      h: 101 + i,
      l: 99 + i,
      c: 100 + i,
      v: 10 + i
    });
  }
  return out;
};

test('buildChartSnapshotPayload returns frames + meta', async () => {
  const { buildChartSnapshotPayload } = await modPromise;
  const snapshots = [
    { symbol: 'XAUUSD.R', timeframe: '5m', barsTail: makeBars(4, 1_000), barCount: 462, updatedAtMs: 111 },
    { symbol: 'XAUUSD.R', timeframe: '15m', barsTail: makeBars(4, 2_000), barCount: 278, updatedAtMs: 222 },
    { symbol: 'XAUUSD.R', timeframe: '1H', barsTail: makeBars(4, 3_000), barCount: 227, updatedAtMs: 333 },
    { symbol: 'XAUUSD.R', timeframe: '4H', barsTail: makeBars(4, 4_000), barCount: 175, updatedAtMs: 444 }
  ];

  const res = buildChartSnapshotPayload({
    msgId: 'm1',
    symbol: 'XAUUSD.R',
    timeframes: ['5m', '15m', '1h', '4h'],
    snapshots,
    maxCandles: 3,
    maxPayloadChars: 100_000,
    capturedAtMs: 999,
    imageIncluded: true
  });

  assert.equal(res.payload.symbol, 'XAUUSD.R');
  assert.equal(res.payload.frames.length, 4);
  assert.equal(res.payload.frames[0].barsCount, 462);
  assert.equal(res.payload.frames[0].candles.length, 3);
  assert.equal(res.payload.diagnostics.reasonCode, undefined);
});

test('buildChartSnapshotPayload sets NO_SYMBOL_SELECTED when symbol missing', async () => {
  const { buildChartSnapshotPayload } = await modPromise;
  const res = buildChartSnapshotPayload({
    msgId: 'm2',
    symbol: '',
    timeframes: ['5m'],
    snapshots: [],
    maxCandles: 3,
    maxPayloadChars: 100_000
  });

  assert.equal(res.payload.diagnostics.reasonCode, 'NO_SYMBOL_SELECTED');
});

test('buildChartSnapshotPayload sets STORE_EMPTY when symbol does not match', async () => {
  const { buildChartSnapshotPayload } = await modPromise;
  const snapshots = [
    { symbol: 'EURUSD', timeframe: '5m', barsTail: makeBars(2, 1_000), barCount: 12, updatedAtMs: 111 }
  ];

  const res = buildChartSnapshotPayload({
    msgId: 'm3',
    symbol: 'XAUUSD.R',
    timeframes: ['5m'],
    snapshots,
    maxCandles: 3,
    maxPayloadChars: 100_000
  });

  assert.equal(res.payload.frames.length, 0);
  assert.equal(res.payload.diagnostics.reasonCode, 'STORE_EMPTY');
});

test('payload truncation preserves barsCount and warns', async () => {
  const { buildChartSnapshotPayload } = await modPromise;
  const snapshots = [
    { symbol: 'XAUUSD.R', timeframe: '5m', barsTail: makeBars(120, 1_000), barCount: 462, updatedAtMs: 111 }
  ];

  const res = buildChartSnapshotPayload({
    msgId: 'm4',
    symbol: 'XAUUSD.R',
    timeframes: ['5m'],
    snapshots,
    maxCandles: 120,
    maxPayloadChars: 400
  });

  assert.equal(res.truncated, true);
  assert.equal(res.payload.frames[0].barsCount, 462);
  assert.ok(Array.isArray(res.payload.diagnostics.warnings));
  assert.ok(res.payload.diagnostics.warnings.includes('PAYLOAD_STRIPPED'));
});

test('resolveModelType returns vision when image present', async () => {
  const { resolveModelType, buildChartSnapshotContext } = await modPromise;
  assert.equal(resolveModelType([{ dataUrl: 'data:image/png;base64,abc' }]), 'vision');
  assert.equal(resolveModelType(null), 'text');
  assert.equal(buildChartSnapshotContext(null), '');
});
