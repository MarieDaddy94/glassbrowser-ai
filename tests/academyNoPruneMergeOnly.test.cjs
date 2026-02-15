const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh merges in new rows without destructive replacement', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const mergeResult = mergeAcademyCasesMergeOnly(previousCases, mergeInput, 2);'), true);
  assert.equal(app.includes('const mergedBySignalId = new Map<string, AcademyCase>();'), true);
  assert.equal(app.includes('const snapshotIdentityKeys = new Set('), true);
  assert.equal(app.includes('const retainedCount = Number(mergeResult.retainedCount || 0);'), true);
  assert.equal(app.includes('let skippedRemovalCount = 0;'), true);
  assert.equal(app.includes('setAcademyCases(mergedCases);'), true);
  assert.equal(app.includes('prunedAfterStreakCount: 0,'), true);
});
