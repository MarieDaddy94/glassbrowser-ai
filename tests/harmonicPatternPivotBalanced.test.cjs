const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('harmonic engine uses balanced pivot extraction with fractal lookback and swing filter', () => {
  const source = read('services/harmonicPatternEngine.ts');

  assert.equal(source.includes('const HARMONIC_LOOKBACK = 3;'), true);
  assert.equal(source.includes('const MIN_PIVOT_SPACING_BARS = 2;'), true);
  assert.equal(source.includes('const extractPivotsBalanced = ('), true);
  assert.equal(source.includes('for (let i = lookback; i < list.length - lookback; i += 1) {'), true);
  assert.equal(source.includes('const minSwing = Math.max(refPrice * 0.0035, Math.abs(atr) * 0.6);'), true);
  assert.equal(source.includes('if (Math.abs(pivot.price - prev.price) < minSwing) continue;'), true);
});
