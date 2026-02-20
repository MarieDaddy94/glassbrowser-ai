const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal prompt includes indicator V1 rule behind internal feature flag', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('signalIndicatorFeatureFlags'), true);
  assert.equal(app.includes('signalIndicatorContextV1'), true);
  assert.equal(
    app.includes('CHART_SNAPSHOT_JSON frames may include indicators.v1 (VWAP, Bollinger 20/2, Ichimoku 9/26/52, Fibonacci). Use them when present.'),
    true
  );
});
