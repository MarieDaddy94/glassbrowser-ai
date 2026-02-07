const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('auto demotion policy service is implemented', () => {
  const source = read('services/promotionPolicyService.ts');
  assert.equal(source.includes('evaluateAutoDemotionPolicy'), true);
  assert.equal(source.includes('drawdown_breach'), true);
  assert.equal(source.includes('drift_breach'), true);
});

test('live policy service supports promote/demote rollback state', () => {
  const source = read('services/livePolicyService.ts');
  assert.equal(source.includes('promote('), true);
  assert.equal(source.includes('demote('), true);
  assert.equal(source.includes("action: rollbackTarget ? 'rollback' : 'demote'"), true);
});

test('monitor exposes promotion center controls', () => {
  const monitor = read('components/MonitorInterface.tsx');
  assert.equal(monitor.includes('Promotion Center'), true);
  assert.equal(monitor.includes('Evaluate'), true);
  assert.equal(monitor.includes('Promote'), true);
  assert.equal(monitor.includes('Auto Demote'), true);
});
