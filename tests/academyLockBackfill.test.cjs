const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh backfill applies lock metadata when reconstructing from resolved history', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const resolvedHistoryBySignalId = new Map<string, SignalHistoryEntry>();'), true);
  assert.equal(app.includes("buildAcademyCaseFromSignalHistory(historyEntry, { source: 'academy_repair' })"), true);
  assert.equal(app.includes('const lockInfo = lockMap.get(key);'), true);
  assert.equal(app.includes('built.locked = true;'), true);
  assert.equal(app.includes("built.lockSource = lockInfo.source || built.lockSource || 'signal_button';"), true);
  assert.equal(app.includes('upsertCase(nextBySignalId, built);'), true);
});
