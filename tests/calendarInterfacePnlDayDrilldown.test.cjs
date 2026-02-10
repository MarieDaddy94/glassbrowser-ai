const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('calendar pnl tab includes selectable day cells and closed-trade drilldown rendering', () => {
  const calendar = read('components/CalendarInterface.tsx');

  assert.equal(calendar.includes('const pnlSelectedTrades = useMemo(() => {'), true);
  assert.equal(calendar.includes('setPnlSelectedDateKey(dateKey)'), true);
  assert.equal(calendar.includes('Select a day to view closed trades.'), true);
  assert.equal(calendar.includes('No closed trades for this day.'), true);
  assert.equal(calendar.includes('pnlSelectedTrades.map((trade) => ('), true);
  assert.equal(calendar.includes('R {trade.rMultiple != null ? trade.rMultiple.toFixed(2) : \'--\'}'), true);
});

