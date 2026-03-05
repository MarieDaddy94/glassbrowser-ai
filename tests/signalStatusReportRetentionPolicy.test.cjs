const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal status report retention keeps latest plus previous two entries', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const SIGNAL_STATUS_REPORT_HISTORY_LIMIT = 3;'), true);
  assert.equal(app.includes('const deduped = [entry, ...existing.filter((item) => String(item?.id || \'\') !== entry.id)];'), true);
  assert.equal(app.includes('deduped.slice(0, SIGNAL_STATUS_REPORT_HISTORY_LIMIT)'), true);
});
