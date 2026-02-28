const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');

test('SettingsModal account selection switch captures previous state and reverts on failure', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const previousAccountId = tlSelectedAccountId;/);
  assert.match(source, /const previousAccNum = tlSelectedAccNum;/);
  assert.match(source, /setTlSelectedAccountId\(previousAccountId\);/);
  assert.match(source, /setTlSelectedAccNum\(previousAccNum\);/);
  assert.match(source, /TradeLocker switch failed at/);
});

test('SettingsModal applies account switch through shared transactional apply helper', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const applyTradeLockerActiveAccount = useCallback/);
  assert.match(source, /stage:\s*"set_active_account"/);
  assert.match(source, /stage:\s*"verify"/);
  assert.match(source, /resolvedBy = "accountId_fallback"/);
});

test('SettingsModal profile switching avoids eager account-list clearing and reconnects when disconnected', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.doesNotMatch(source, /setTlAccounts\(\[\]\);/);
  assert.match(source, /const shouldReconnectProfile = !tlConnected \|\| !sameEnvironment;/);
});
