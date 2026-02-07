const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const tradeLockerHookPath = path.join(process.cwd(), 'hooks', 'useTradeLocker.ts');

test('TradeLocker auto-restore waits for startup bridge readiness and non-booting phase', () => {
  const source = fs.readFileSync(tradeLockerHookPath, 'utf8');
  assert.equal(source.includes('startupBridgeReady'), true);
  assert.equal(source.includes("startupPhase === \"booting\""), true);
  assert.equal(source.includes('autoConnectAttemptedRef.current'), true);
});
