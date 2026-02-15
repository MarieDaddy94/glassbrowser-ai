const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('TradeLocker panel keeps local action fallback responsive under panel source cooldown', () => {
  const source = read('components/TradeLockerInterface.tsx');
  assert.equal(source.includes('fallback?.();'), true);
  assert.equal(source.includes('void runPanelAction(actionId, payload);'), true);
});

test('Native chart panel keeps local action fallback responsive under panel source cooldown', () => {
  const source = read('components/NativeChartInterface.tsx');
  assert.equal(source.includes('fallback?.();'), true);
  assert.equal(source.includes('void runPanelAction(actionId, payload);'), true);
});
