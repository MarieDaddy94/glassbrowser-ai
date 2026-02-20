const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chart engine runs bounded pattern detection after history refresh', () => {
  const source = read('services/chartEngine.ts');

  assert.equal(source.includes('const PATTERN_REFRESH_BACKFILL_BARS = 6;'), true);
  assert.equal(source.includes('private detectPatternsForRecentClosedBars('), true);
  assert.equal(source.includes('const closedBarIndex = bars.length - 2;'), true);
  assert.equal(source.includes('for (let i = startIndex; i <= closedBarIndex; i += 1) {'), true);
  assert.equal(source.includes('this.detectPatternsForRecentClosedBars(session, detectionSource, PATTERN_REFRESH_BACKFILL_BARS);'), true);
});
