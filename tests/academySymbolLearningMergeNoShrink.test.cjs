const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy symbol learning refresh merges without shrinking prior records', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const previousByKey = new Map<string, AcademySymbolLearning>();'), true);
  assert.equal(app.includes('const mergedByKey = new Map<string, AcademySymbolLearning>(previousByKey);'), true);
  assert.equal(app.includes('setAcademySymbolLearnings(merged);'), true);
  assert.equal(app.includes("source: 'academy_symbol_learning_merge_no_shrink'"), true);
});

