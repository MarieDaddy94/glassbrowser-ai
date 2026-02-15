const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('health snapshot exposes academy quality and repair counters', () => {
  const app = read('App.tsx');
  const types = read('types.ts');

  assert.equal(app.includes('academyRichCaseCount: Number(academyDataQualityStatsRef.current.richCaseCount || 0),'), true);
  assert.equal(app.includes('academySparseCaseCount: Number(academyDataQualityStatsRef.current.sparseCaseCount || 0),'), true);
  assert.equal(app.includes('academyLessonValidCount: Number(academyDataQualityStatsRef.current.lessonValidCount || 0),'), true);
  assert.equal(app.includes('academyLessonDroppedCount: Number(academyDataQualityStatsRef.current.lessonDroppedCount || 0),'), true);
  assert.equal(app.includes('academyRepairUpserts: Number(academyDataQualityStatsRef.current.repairUpserts || 0),'), true);

  assert.equal(types.includes('academyRichCaseCount?: number | null;'), true);
  assert.equal(types.includes('academySparseCaseCount?: number | null;'), true);
  assert.equal(types.includes('academyLessonValidCount?: number | null;'), true);
  assert.equal(types.includes('academyLessonDroppedCount?: number | null;'), true);
  assert.equal(types.includes('academyRepairUpserts?: number | null;'), true);
});

