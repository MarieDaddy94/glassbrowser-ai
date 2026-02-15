const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh reconciles missing lock records for WIN/LOSS cases', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const pendingAutoLockBySignalId = new Map<string, AcademyCase>();'), true);
  assert.equal(app.includes('if (!lockMap.has(signalId)) {'), true);
  assert.equal(app.includes('pendingAutoLockBySignalId.set(signalId, next);'), true);
  assert.equal(app.includes('const autoLockReconcileLimit = 250;'), true);
  assert.equal(app.includes('const pendingAutoLockEntries = Array.from(pendingAutoLockBySignalId.entries()).slice(0, autoLockReconcileLimit);'), true);
  assert.equal(app.includes('const lockResult = await lockAcademyCase({'), true);
  assert.equal(app.includes("source: 'system_repair',"), true);
  assert.equal(app.includes("reason: 'outcome_win_loss_auto_lock',"), true);
  assert.equal(app.includes('autoLockReconciledCount += 1;'), true);
});

