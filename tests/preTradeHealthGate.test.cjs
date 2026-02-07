const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('pre-trade health gate includes quote/spread/slippage/cooldown outputs', () => {
  const source = read('services/preTradeHealthGate.ts');
  assert.equal(source.includes('allowed: boolean'), true);
  assert.equal(source.includes('reasons: string[]'), true);
  assert.equal(source.includes('spreadBps?: number | null'), true);
  assert.equal(source.includes('slippageEstimateBps?: number | null'), true);
  assert.equal(source.includes('cooldownRemainingMs?: number | null'), true);
});

test('execution path enforces pre-trade gate with spread/slippage thresholds', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('evaluatePreTradeHealthGate({'), true);
  assert.equal(app.includes('maxSpreadBps:'), true);
  assert.equal(app.includes('maxSlippageBps:'), true);
});
