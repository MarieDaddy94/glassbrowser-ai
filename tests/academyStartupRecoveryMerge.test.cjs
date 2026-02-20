const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('academy startup recovery merges backup data and re-upserts it', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const recoverAcademyFromShutdownBackup = useCallback(async'), true);
  assert.equal(source.includes('mergeAcademyCasesMergeOnly('), true);
  assert.equal(source.includes('setAcademyCases(mergedCases);'), true);
  assert.equal(source.includes('setAcademyLessons(mergedLessons);'), true);
  assert.equal(source.includes('setAcademySymbolLearnings(mergedSymbolLearnings);'), true);
  assert.equal(source.includes('clearAcademyShutdownBackup();'), true);
  assert.equal(source.includes('academy_recovery_case:'), true);
  assert.equal(source.includes('academy_recovery_lesson:'), true);
  assert.equal(source.includes('academy_recovery_symbol_learning:'), true);
});

