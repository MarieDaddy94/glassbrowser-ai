const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('calendar events and rules workflow remains present after pnl tab addition', () => {
  const calendar = read('components/CalendarInterface.tsx');
  const app = read('App.tsx');

  assert.equal(calendar.includes('Automation Rules'), true);
  assert.equal(calendar.includes('Session Analytics'), true);
  assert.equal(calendar.includes('No calendar events yet.'), true);
  assert.equal(calendar.includes("{ limit, kind: 'calendar_event' }"), true);
  assert.equal(calendar.includes('onRefreshRules?.()'), true);

  assert.equal(app.includes("onSyncEvents={() => syncEconomicCalendar({ force: true, reason: 'panel' })}"), true);
  assert.equal(app.includes("kind: 'calendar_event'"), true);
});

