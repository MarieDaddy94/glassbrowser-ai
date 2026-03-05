const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('manual signal status report trigger uses report pipeline and not outcome mutation', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("const runSignalStatusReport = useCallback(async (source: 'manual' | 'chart_update') => {"), true);
  assert.equal(app.includes("const refreshSignalStatusesNow = useCallback(() => {"), true);
  assert.equal(app.includes("void runSignalStatusReport('manual');"), true);
  assert.equal(app.includes('Report-only path: never mutate signal.status in this pipeline.'), true);
});
