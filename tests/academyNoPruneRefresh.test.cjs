const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh retains previously materialized cases and never prunes on refresh', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const mergeResult = mergeAcademyCasesMergeOnly(previousCases, mergeInput, 2);'), true);
  assert.equal(app.includes('const mergedBySignalId = new Map<string, AcademyCase>();'), true);
  assert.equal(app.includes('let skippedRemovalCount = 0;'), true);
  assert.equal(app.includes("source: 'academy_refresh_skipped_removal'"), true);
  assert.equal(app.includes("source: 'academy_merge_no_prune_applied'"), true);
  assert.equal(app.includes('academyMissingCaseStreakRef'), false);
});
