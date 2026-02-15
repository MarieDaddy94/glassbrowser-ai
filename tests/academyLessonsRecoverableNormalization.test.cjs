const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy lesson normalization recovers title from summary/context before dropping row', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const summaryDraft = String('), true);
  assert.equal(app.includes('const explicitTitle = String(payload.title || payload.lessonTitle || \'\').trim();'), true);
  assert.equal(app.includes('const derivedTitle = explicitTitle || ('), true);
  assert.equal(app.includes("summaryDraft.length > 96 ? `${summaryDraft.slice(0, 93).trimEnd()}...` : summaryDraft"), true);
  assert.equal(app.includes('if (!title && !hasLessonMarkers) return null;'), true);
  assert.equal(app.includes("title: title || `Recovered lesson ${lessonId}`,"), true);
});

