const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('manual status refresh routes to report-only signal status reporting', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("const refreshSignalStatusesNow = useCallback(() => {"), true);
  assert.equal(app.includes("void runSignalStatusReport('manual');"), true);
  assert.equal(app.includes("eventType: 'signal_status_report_requested'"), true);
  assert.equal(app.includes("eventType: 'signal_status_report_generated'"), true);
  assert.equal(app.includes("eventType: 'signal_status_report_failed'"), true);
});
