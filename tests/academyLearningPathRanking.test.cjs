const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('learning path service exposes goal templates and ranked path builder', () => {
  const source = read('services/academyLearningPathService.ts');

  assert.equal(source.includes('export const LEARNING_GOAL_TEMPLATES'), true);
  assert.equal(source.includes("'reduce_stopouts'"), true);
  assert.equal(source.includes("'fix_oversold_mean_reversion_trap'"), true);
  assert.equal(source.includes('export const buildLearningPathResult ='), true);
  assert.equal(source.includes('highlightedNodeIds'), true);
  assert.equal(source.includes('highlightedEdgeIds'), true);
  assert.equal(source.includes('steps: LearningPathStep[]'), true);
});
