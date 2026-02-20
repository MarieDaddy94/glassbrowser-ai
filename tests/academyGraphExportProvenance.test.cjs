const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy export payload includes learning graph provenance and patch notes', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const buildAcademyExportPayload = useCallback(() => {'), true);
  assert.equal(app.includes('learningGraphPathSummary: academyLearningPathSummaryRef.current || null,'), true);
  assert.equal(app.includes('lessonPatchNotes: academyLessonPatchNotesRef.current,'), true);
  assert.equal(app.includes('provenance: {'), true);
  assert.equal(app.includes('lessonIds: lessonIds.slice(0, 400),'), true);
  assert.equal(app.includes('evidenceCaseIds: evidenceCaseIds.slice(0, 800),'), true);
  assert.equal(app.includes('experimentCaseIds: experimentCaseIds.slice(0, 800)'), true);
  assert.equal(app.includes("eventType: 'academy_graph_export_provenance'"), true);
});
