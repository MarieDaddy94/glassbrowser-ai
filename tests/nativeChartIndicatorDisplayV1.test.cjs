const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('native chart indicator row renders V1 indicator summaries', () => {
  const source = read('components/NativeChartInterface.tsx');

  assert.equal(source.includes("from '../services/indicatorMath'"), true);
  assert.equal(source.includes('computeSessionVwap('), true);
  assert.equal(source.includes('computeBollinger20x2('), true);
  assert.equal(source.includes('computeIchimoku9526('), true);
  assert.equal(source.includes('computeFibRetracementFromSwings('), true);
  assert.equal(source.includes('indicatorParts.push(`VWAP ${formatPrice(vwap.value)}`)'), true);
  assert.equal(source.includes('indicatorParts.push(`BB20 ${formatPrice(bb.lower)}/${formatPrice(bb.basis)}/${formatPrice(bb.upper)}`)'), true);
  assert.equal(source.includes('indicatorParts.push(`ICHI ${String(ichimoku.bias).toUpperCase()}`)'), true);
  assert.equal(source.includes('indicatorParts.push(`FIB ${fib.nearestLevel}`)'), true);
});
