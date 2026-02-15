const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy merge keeps rich rows when incoming repair rows are sparse', () => {
  const mergeService = read('services/academyMergeService.ts');
  const app = read('App.tsx');

  assert.equal(mergeService.includes('const isSparseComparedTo = (candidate: MergeAcademyCase, baseline: MergeAcademyCase) => {'), true);
  assert.equal(mergeService.includes('if (isSparseComparedTo(incoming, current)) return current;'), true);
  assert.equal(mergeService.includes('export const pickPreferredAcademyCase = (current: MergeAcademyCase, incoming: MergeAcademyCase) => {'), true);
  assert.equal(app.includes('const preferred = pickPreferredAcademyCase(existing as any, nextEntry as any) as AcademyCase;'), true);
});

