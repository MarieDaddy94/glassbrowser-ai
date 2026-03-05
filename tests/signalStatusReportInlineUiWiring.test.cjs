const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('SignalInterface renders inline signal status reports with history controls', () => {
  const ui = read('components/SignalInterface.tsx');
  assert.equal(ui.includes('signalStatusReportsBySignalId?: Record<string, SignalStatusReportEntry[]>;'), true);
  assert.equal(ui.includes('const latestStatusReport = statusReports[0] || null;'), true);
  assert.equal(ui.includes('Agent report:'), true);
  assert.equal(ui.includes('Show previous reports'), true);
  assert.equal(ui.includes('Hide previous reports'), true);
});
