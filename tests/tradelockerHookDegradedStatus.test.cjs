const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const hookPath = path.join(process.cwd(), 'hooks', 'useTradeLocker.ts');

test('TradeLocker hook maps degraded account-auth state into connection status and UI meta', () => {
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.match(source, /TradeLockerConnectionStatus = "disconnected" \| "connecting" \| "connected" \| "degraded_account_auth" \| "error"/);
  assert.match(source, /const degraded = rawConnectionState === "degraded_account_auth"/);
  assert.match(source, /if \(status === "degraded_account_auth"\) return \{ dot: "bg-amber-500 animate-pulse", label: "DEGRADED \(ACCOUNT AUTH\)" \};/);
});

