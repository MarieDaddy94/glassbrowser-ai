const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('meta labeler supports take/skip/size_down decisions', () => {
  const source = read('services/metaLabeler.ts');
  assert.equal(source.includes('export const evaluateMetaLabel'), true);
  assert.equal(source.includes("decision: 'skip'"), true);
  assert.equal(source.includes("decision: 'size_down'"), true);
  assert.equal(source.includes("decision: 'take'"), true);
});

test('execution path evaluates meta label decision', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('metaLabelDecision = evaluateMetaLabel({'), true);
  assert.equal(app.includes('meta_skip:'), true);
});
