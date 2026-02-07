const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketReplay } = require('../electron/marketReplay.cjs');

test('market replay returns bars in time order', () => {
  const replay = createMarketReplay([
    { ts: 3000, open: 1, high: 2, low: 0.5, close: 1.5 },
    { ts: 1000, open: 1, high: 1.2, low: 0.8, close: 1.1 },
    { ts: 2000, open: 1.1, high: 1.3, low: 1.0, close: 1.2 }
  ]);

  const first = replay.next();
  const second = replay.next();
  const third = replay.next();
  const done = replay.next();

  assert.equal(first.ok, true);
  assert.equal(first.bar.ts, 1000);
  assert.equal(second.bar.ts, 2000);
  assert.equal(third.bar.ts, 3000);
  assert.equal(done.done, true);
});
