const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chart update status report trigger coalesces with global throttle and in-flight queue', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const SIGNAL_STATUS_REPORT_GLOBAL_THROTTLE_MS = 30_000;'), true);
  assert.equal(app.includes('const SIGNAL_STATUS_REPORT_SIGNAL_FRESHNESS_MS = 60_000;'), true);
  assert.equal(app.includes('const signalStatusReportInFlightRef = React.useRef(false);'), true);
  assert.equal(app.includes("const signalStatusReportPendingRef = React.useRef<'manual' | 'chart_update' | null>(null);"), true);
  assert.equal(app.includes("if (source === 'chart_update' && now - signalStatusReportLastAtRef.current < SIGNAL_STATUS_REPORT_GLOBAL_THROTTLE_MS) {"), true);
  assert.equal(app.includes("signalStatusReportTriggerRef.current = trigger;"), true);
  assert.equal(app.includes("void runSignalStatusReport('chart_update');"), true);
});
