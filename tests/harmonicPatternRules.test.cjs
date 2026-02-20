const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('harmonic engine defines all seven families with normalized tolerance contract', () => {
  const source = read('services/harmonicPatternEngine.ts');

  assert.equal(source.includes("type HarmonicPatternType ="), true);
  assert.equal(source.includes("'gartley'"), true);
  assert.equal(source.includes("'bat'"), true);
  assert.equal(source.includes("'butterfly'"), true);
  assert.equal(source.includes("'crab'"), true);
  assert.equal(source.includes("'deep_crab'"), true);
  assert.equal(source.includes("'cypher'"), true);
  assert.equal(source.includes("'shark'"), true);
  assert.equal(source.includes('const RATIO_TOLERANCE_DEFAULT = 0.02;'), true);
  assert.equal(source.includes('const RATIO_TOLERANCE_STRICT = 0.015;'), true);
  assert.equal(source.includes('const evaluateGartley = ('), true);
  assert.equal(source.includes('const evaluateBat = ('), true);
  assert.equal(source.includes('const evaluateButterfly = ('), true);
  assert.equal(source.includes('const evaluateCrab = ('), true);
  assert.equal(source.includes('const evaluateDeepCrab = ('), true);
  assert.equal(source.includes('const evaluateCypher = ('), true);
  assert.equal(source.includes('const evaluateShark = ('), true);
});
