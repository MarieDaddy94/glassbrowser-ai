const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('lesson lifecycle service supports apply/pin/promote/deprecate transitions', () => {
  const source = read('services/academyLessonLifecycleService.ts');

  assert.equal(source.includes("type AcademyLessonLifecycleAction ="), true);
  assert.equal(source.includes("'apply'"), true);
  assert.equal(source.includes("'pin'"), true);
  assert.equal(source.includes("'demote_candidate'"), true);
  assert.equal(source.includes("'promote'"), true);
  assert.equal(source.includes("'deprecate'"), true);
  assert.equal(source.includes('export const patchLessonLifecycle ='), true);
  assert.equal(source.includes('export const evaluatePromotionDecision ='), true);
  assert.equal(source.includes("if (input.action === 'demote_candidate') {"), true);
});
