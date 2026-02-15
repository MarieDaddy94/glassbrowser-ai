const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('upsertAcademyCase auto-locks WIN/LOSS outcomes and persists lock records', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const isAutoLockOutcome = useCallback((outcome: any) => {'), true);
  assert.equal(app.includes('payload = applyAutoLockMetadata(payload, now);'), true);
  assert.equal(app.includes('const shouldAutoLock = isAutoLockOutcome(payload.outcome ?? payload.status);'), true);
  assert.equal(app.includes('if (shouldAutoLock) {'), true);
  assert.equal(app.includes("const lockReason = payload.lockReason || 'outcome_win_loss_auto_lock';"), true);
  assert.equal(app.includes('const lockResult = await lockAcademyCase({'), true);
  assert.equal(app.includes('academyCaseLocksRef.current.set(caseId, {'), true);
});

