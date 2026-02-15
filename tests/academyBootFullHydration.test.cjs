const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy lessons and symbol learnings force full hydration at startup with delta fallback safety', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('void refreshAcademyLessons({ force: true });'), true);
  assert.equal(app.includes('void refreshAcademySymbolLearnings({ force: true });'), true);
  assert.equal(app.includes('refreshAcademyLessons({ force: false })'), true);
  assert.equal(app.includes('refreshAcademySymbolLearnings({ force: false })'), true);
  assert.equal(app.includes('if (!opts?.force && !opts?._fullRetry && entries.length === 0 && academyLessonsRef.current.length === 0 && Number(syncCursor.lessonsUpdatedAfterMs || 0) > 0) {'), true);
  assert.equal(app.includes("return refreshAcademyLessons({ ...opts, force: true, _fullRetry: true, limit });"), true);
  assert.equal(app.includes('if (!opts?.force && !opts?._fullRetry && entries.length === 0 && academySymbolLearningsRef.current.length === 0 && Number(syncCursor.symbolLearningsUpdatedAfterMs || 0) > 0) {'), true);
  assert.equal(app.includes("return refreshAcademySymbolLearnings({ ...opts, force: true, _fullRetry: true, limit });"), true);
});

