const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('auto-lock path persists academy_case_lock records and warns on lock write failures', () => {
  const app = read('App.tsx');
  const lockService = read('services/academyCaseLockService.ts');

  assert.equal(lockService.includes("const LOCK_KIND = 'academy_case_lock';"), true);
  assert.equal(lockService.includes('export const lockCase = async'), true);

  assert.equal(app.includes('lockAcademyCase({'), true);
  assert.equal(app.includes('source: lockSource,'), true);
  assert.equal(app.includes('reason: lockReason,'), true);
  assert.equal(app.includes("source: 'academy_auto_lock_failed',"), true);
});
