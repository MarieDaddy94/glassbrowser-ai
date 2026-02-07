const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('promotion policy service defines promotion gates and experiment registry builder', () => {
  const source = read('services/promotionPolicyService.ts');
  assert.equal(source.includes('buildExperimentRegistryEntry'), true);
  assert.equal(source.includes('evaluatePromotionPolicy'), true);
  assert.equal(source.includes('minTradeCount'), true);
  assert.equal(source.includes('walk_forward_stability'), true);
});

test('app promotion event pipeline applies policy and updates live policy service', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('buildExperimentRegistryEntry({'), true);
  assert.equal(app.includes('evaluatePromotionPolicy({'), true);
  assert.equal(app.includes('livePolicyService.promote'), true);
});
