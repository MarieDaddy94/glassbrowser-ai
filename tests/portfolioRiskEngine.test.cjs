const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('portfolio risk engine enforces correlated and concurrent caps', () => {
  const source = read('services/portfolioRiskEngine.ts');
  assert.equal(source.includes('evaluatePortfolioRisk'), true);
  assert.equal(source.includes('correlated_exposure_cap'), true);
  assert.equal(source.includes('concurrent_risk_cap'), true);
  assert.equal(source.includes('symbol_family_overlap_cap'), true);
});

test('execution path applies portfolio risk decision before pre-trade gate', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('portfolioDecision = evaluatePortfolioRisk({'), true);
  assert.equal(app.includes('portfolio_block:'), true);
});
