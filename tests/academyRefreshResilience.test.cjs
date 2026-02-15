const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh is merge-only with no prune/removal path', () => {
  const app = read('App.tsx');

  assert.equal(app.includes("const limit = Number.isFinite(Number(opts?.limit)) ? Math.max(50, Math.min(50000, Math.floor(Number(opts?.limit)))) : 50000;"), true);
  assert.equal(app.includes('const caseListOptions = {'), true);
  assert.equal(app.includes('buildIncrementalListOptions(limit, opts?.force ? null : syncCursor.casesUpdatedAfterMs, true)'), true);
  assert.equal(app.includes("ledger.listAgentMemory({ limit: Math.max(limit, 50000), kind: 'signal_history', includeArchived: true })"), true);
  assert.equal(app.includes("ledger.listAgentMemory({ limit: Math.max(limit, 50000), kind: 'signal_entry', includeArchived: true })"), true);
  assert.equal(app.includes('listAcademyCaseLocks(Math.max(limit, 50000))'), true);

  assert.equal(app.includes('const mergeResult = mergeAcademyCasesMergeOnly(previousCases, mergeInput, 2);'), true);
  assert.equal(app.includes('const mergedBySignalId = new Map<string, AcademyCase>();'), true);
  assert.equal(app.includes('for (const entry of mergeResult.merged as AcademyCase[]) {'), true);
  assert.equal(app.includes('let skippedRemovalCount = 0;'), true);

  assert.equal(app.includes('missingStreakThreshold'), false);
  assert.equal(app.includes('academyMissingCaseStreakRef'), false);
  assert.equal(app.includes('maxCaseLogSize'), false);
  assert.equal(app.includes('.slice(0, maxCaseLogSize);'), false);

  assert.equal(app.includes("source: 'academy_merge_no_prune_applied'"), true);
  assert.equal(app.includes("source: 'academy_refresh_skipped_removal'"), true);
  assert.equal(app.includes('skipped_removal'), true);
});
