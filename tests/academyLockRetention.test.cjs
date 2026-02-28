const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy lock service and refresh merge keep locked cases out of auto-prune', () => {
  const lockService = read('services/academyCaseLockService.ts');
  const app = read('App.tsx');

  assert.equal(lockService.includes("const LOCK_KIND = 'academy_case_lock';"), true);
  assert.equal(lockService.includes("const LOCK_PREFIX = 'academy_case_lock:';"), true);
  assert.equal(lockService.includes('export const lockCase = async'), true);
  assert.equal(lockService.includes('export const listLocks = async'), true);
  assert.equal(lockService.includes('updatedAfterMs:'), true);

  assert.equal(app.includes('const academyCaseLocksRef = React.useRef<Map<string, AcademyCaseLockRecord>>(new Map());'), true);
  assert.equal(app.includes('listAcademyCaseLocks(lockListOptions)'), true);
  assert.equal(app.includes('for (const [signalId, lockInfo] of lockMap.entries()) {'), true);
  assert.equal(app.includes('locked: true,'), true);
  assert.equal(app.includes('academyMissingCaseStreakRef'), false);
  assert.equal(app.includes("source: 'academy_refresh_skipped_removal'"), true);
});
