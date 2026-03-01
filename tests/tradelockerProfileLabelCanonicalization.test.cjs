const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');
const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');

test('Settings profile loader always rebuilds canonical labels from normalized identity', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const label = buildTlProfileLabel\(env, server, email, accountId, accNum\);/);
  assert.equal(source.includes('labelRaw || buildTlProfileLabel'), false);
});

test('TradeLocker panel profile loader always rebuilds canonical labels from normalized identity', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.match(source, /const label = buildTradeLockerProfileLabel\(env, server, email, accountId, accNum\);/);
  assert.equal(source.includes('labelRaw || buildTradeLockerProfileLabel'), false);
});

