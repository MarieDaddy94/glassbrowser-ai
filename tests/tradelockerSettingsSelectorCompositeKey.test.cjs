const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sectionPath = path.join(process.cwd(), 'components', 'settings', 'BrokerAdapterSection.tsx');
const settingsPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');

test('BrokerAdapterSection uses composite account selector value for TradeLocker accounts', () => {
  const source = fs.readFileSync(sectionPath, 'utf8');
  assert.match(source, /value=\{tlSelectedAccountValue\}/);
  assert.match(source, /const value = accNum \? `\$\{accountId\}:\$\{accNum\}` : accountId;/);
});

test('SettingsModal supports parsing composite TradeLocker account selector values', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const parseTradeLockerAccountSelection = \(value: string\)/);
  assert.match(source, /if \(raw\.includes\(":"\)\)/);
  assert.match(source, /const \[accountIdRaw, accNumRaw\] = raw\.split\(":"\);/);
});
