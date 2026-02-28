const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('snapshot source switch flow captures previous key and reverts on failure', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /const previousKey = resolveSnapshotSourceKey\(\);/);
  assert.match(source, /const fail = \(message: string\) => \{/);
  assert.match(source, /if \(previousKey\) setTlSnapshotSourceKey\(previousKey\);/);
  assert.match(source, /addNotification\('TradeLocker Account',\s*message,\s*'warning'\);/);
});

test('snapshot source switch runs in account lock and verifies identity before success', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /return withTradeLockerAccountLock\(async \(\) => \{/);
  assert.match(source, /const switchRes = await ensureTradeLockerAccount\(targetEntry\.accountKey,\s*'snapshot_manual'\);/);
  assert.match(source, /const matchState = resolveTradeLockerIdentityMatchState\(/);
  assert.match(source, /if \(matchState === 'mismatch'\)/);
});
