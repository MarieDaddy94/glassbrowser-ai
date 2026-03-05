const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('status report flow is report-only and does not mutate lifecycle status', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('Report-only path: never mutate signal.status in this pipeline.'), true);
  assert.equal(app.includes("kind: 'signal_status_report'"), true);
  assert.equal(app.includes("eventType: 'signal_status_report_generated'"), true);
});
