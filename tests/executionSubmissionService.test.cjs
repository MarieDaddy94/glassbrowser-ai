const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('execution submission service centralizes multi-account TradeLocker submission flow', () => {
  const source = read('services/executionSubmissionService.ts');
  assert.equal(source.includes('export const submitTradeLockerOrderBatch'), true);
  assert.equal(source.includes('executionTargets'), true);
  assert.equal(source.includes('withAccountLock'), true);
  assert.equal(source.includes('ensureAccount'), true);
  assert.equal(source.includes('submitForAccount'), true);
});

test('execution submission service supports snapshot-account restore and deterministic result envelope', () => {
  const source = read('services/executionSubmissionService.ts');
  assert.equal(source.includes('restoreAttempted'), true);
  assert.equal(source.includes('restoreError'), true);
  assert.equal(source.includes('restoredAccountKey'), true);
  assert.equal(source.includes('primaryResult'), true);
  assert.equal(source.includes('route'), true);
});
