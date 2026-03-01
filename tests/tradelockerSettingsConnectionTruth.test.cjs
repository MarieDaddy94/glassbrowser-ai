const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');

test('Settings modal derives TradeLocker badge from connectionState and degraded auth', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const \[tlConnectionState, setTlConnectionState\] = useState<TradeLockerConnectionState>\("disconnected"\);/);
  assert.match(source, /if \(tlConnectionState === "degraded_account_auth"\) return \{ dot: "bg-amber-500 animate-pulse", label: "DEGRADED \(ACCOUNT AUTH\)" \};/);
  assert.match(source, /const applyTradeLockerStatus = useCallback\(\(stat: any\) => \{/);
});

test('Settings modal loads accounts when token is connected even before full account-route health', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /if \(stat\?\.ok && \(stat\.connected \|\| stat\.tokenConnected\) && tl\.getAccounts\) \{/);
});
