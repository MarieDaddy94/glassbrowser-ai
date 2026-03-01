const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(process.cwd(), 'electron', 'tradelocker.cjs'), 'utf8');

test('reconcile checkpoint storage methods exist and persist by account key', () => {
  assert.match(source, /getActiveAccountKey\(\)/);
  assert.match(source, /getReconcileCheckpoint\(accountKey = null\)/);
  assert.match(source, /setReconcileCheckpoint\(accountKey, checkpoint\)/);
  assert.match(source, /this\.state\.reconcileCheckpoints = \{ \.\.\.this\.reconcileCheckpointByAccountKey \}/);
});

test('reconcileAccountState performs bounded reconciliation and updates checkpoint', () => {
  assert.match(source, /async reconcileAccountState\(\{ reason = 'manual', force = false \} = \{\}\)/);
  assert.match(source, /result\.ordersHistory = await this\.getOrdersHistory\(\)/);
  assert.match(source, /lastReconciledAtMs: captureAtMs/);
  assert.match(source, /this\.lastReconcileAtMs = captureAtMs/);
});

