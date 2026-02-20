const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('snapshot payload/status carries indicator summaries for panel visibility', () => {
  const builder = read('services/chartChatSnapshotBuilder.js');
  const app = read('App.tsx');
  const snapshot = read('components/SnapshotInterface.tsx');

  assert.equal(builder.includes('const coerceIndicatorSummary = (indicators) => {'), true);
  assert.equal(builder.includes('indicators: coerceIndicatorSummary(best?.indicators),'), true);
  assert.equal(app.includes('indicators: frame?.indicators && typeof frame.indicators === \'object\''), true);
  assert.equal(snapshot.includes('Indicators: VWAP'), true);
});
