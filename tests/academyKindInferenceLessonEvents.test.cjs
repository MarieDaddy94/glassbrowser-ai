const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('lesson event keys are classified as calendar_event before generic lesson_ routing', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');
  const json = read('electron/tradeLedger.cjs');

  for (const source of [sqlite, json]) {
    assert.equal(source.includes('function looksLikeAcademyLessonPayload(payload) {'), true);
    const eventBranch = source.indexOf("key.startsWith('lesson_created:')");
    const genericLessonBranch = source.indexOf("if (key.startsWith('lesson_')) {");
    assert.equal(eventBranch >= 0 && genericLessonBranch >= 0, true);
    assert.equal(eventBranch < genericLessonBranch, true);
    assert.equal(
      source.includes("return looksLikeAcademyLessonPayload(payload) ? 'academy_lesson' : 'calendar_event';"),
      true
    );
  }
});

