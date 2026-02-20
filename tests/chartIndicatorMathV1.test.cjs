const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('indicatorMath exports VWAP, Bollinger, Ichimoku, and Fib calculators', () => {
  const source = read('services/indicatorMath.ts');

  assert.equal(source.includes('export const computeSessionVwap'), true);
  assert.equal(source.includes('export const computeBollinger20x2'), true);
  assert.equal(source.includes('export const computeIchimoku9526'), true);
  assert.equal(source.includes('export const computeFibRetracementFromSwings'), true);
  assert.equal(source.includes('const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];'), true);
});
