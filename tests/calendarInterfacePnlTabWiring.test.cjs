const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('calendar interface exposes pnl tab wiring and loader contract', () => {
  const calendar = read('components/CalendarInterface.tsx');
  const app = read('App.tsx');

  assert.equal(calendar.includes("onLoadPnlSnapshot?: (input: CalendarPnlLoadInput)"), true);
  assert.equal(calendar.includes('pnlEnabled?: boolean;'), true);
  assert.equal(calendar.includes("runPanelAction(\n        'calendar.pnl.snapshot'"), true);
  assert.equal(calendar.includes('PnL Calendar'), true);
  assert.equal(calendar.includes('Net P&amp;L'), true);

  assert.equal(app.includes('const loadCalendarPnlSnapshot = useCallback(async (input?: {'), true);
  assert.equal(app.includes('buildCalendarPnlSnapshot({'), true);
  assert.equal(app.includes('onLoadPnlSnapshot={loadCalendarPnlSnapshot}'), true);
});

