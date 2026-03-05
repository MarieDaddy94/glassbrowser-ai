const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal scan supports one-run outcome-gate bypass and keeps default gate path', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('bypassOutcomeGate?: boolean;'), true);
  assert.equal(app.includes('const bypassOutcomeGate = opts?.bypassOutcomeGate === true;'), true);
  assert.equal(app.includes('if (outcomeGateEnabled && !bypassOutcomeGate) {'), true);
  assert.equal(app.includes("void runSignalScan('manual', { bypassOutcomeGate: true });"), true);
  assert.equal(app.includes("eventType: 'signal_scan_forced_bypass_requested'"), true);
});
