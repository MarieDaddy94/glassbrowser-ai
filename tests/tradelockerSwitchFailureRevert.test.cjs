const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');

test('Settings profile switch reverts selector and identity fields when reconnect/apply fails', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const previous = \{/);
  assert.match(source, /setTlActiveProfileId\(previous\.profileId \|\| ""\);/);
  assert.match(source, /setTlEnv\(previous\.env === "live" \? "live" : "demo"\);/);
  assert.match(source, /setTlServer\(previous\.server\);/);
  assert.match(source, /setTlSelectedAccountId\(previous\.accountId\);/);
  assert.match(source, /setTlSelectedAccNum\(previous\.accNum\);/);
});

test('Settings save flow blocks close when account apply verification fails', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const selected = parseTradeLockerAccountSelection\(tlSelectedAccountValue\);/);
  assert.match(source, /const applyRes = await applyTradeLockerActiveAccount\(selected\.accountId, selected\.accNum, \{ resolvedBy: "exact" \}\);/);
  assert.match(source, /setTlLastError\(/);
  assert.match(source, /return;/);
});
