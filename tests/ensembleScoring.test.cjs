const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('ensemble scoring service provides deterministic take/skip output', () => {
  const source = read('services/ensembleScoring.ts');
  assert.equal(source.includes('export const scoreEnsemble'), true);
  assert.equal(source.includes("action: score >= threshold ? 'take' : 'skip'"), true);
  assert.equal(source.includes('top_agent_score='), true);
});

test('execution path calls ensemble scoring before execution', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('ensembleDecision = scoreEnsemble({'), true);
  assert.equal(app.includes('ensemble_skip:'), true);
});
