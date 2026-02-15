const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy lessons refresh merges without shrinking previously materialized lessons', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const previousById = new Map<string, AcademyLesson>();'), true);
  assert.equal(app.includes('const mergedById = new Map<string, AcademyLesson>(previousById);'), true);
  assert.equal(app.includes('let retainedCount = 0;'), true);
  assert.equal(app.includes('setAcademyLessons(merged);'), true);
  assert.equal(app.includes("source: 'academy_lessons_merge_no_shrink'"), true);
});

