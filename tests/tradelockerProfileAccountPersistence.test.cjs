const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const tradeLockerPanelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');
const settingsModalPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');
const brokerSectionPath = path.join(process.cwd(), 'components', 'settings', 'BrokerAdapterSection.tsx');

test('TradeLocker panel profiles include persisted account identity and restore active account on selection', () => {
  const source = fs.readFileSync(tradeLockerPanelPath, 'utf8');
  assert.equal(source.includes('accountId?: number | null;'), true);
  assert.equal(source.includes('accNum?: number | null;'), true);
  assert.equal(source.includes('const parseTradeLockerAccountId = (value: any): number | null => {'), true);
  assert.equal(source.includes('accountId: parseTradeLockerAccountId(entry?.accountId),'), true);
  assert.equal(source.includes('accNum: parseTradeLockerAccountId(entry?.accNum),'), true);
  assert.equal(source.includes("runPanelAction('tradelocker.set_active_account'"), true);
  assert.equal(source.includes('const savedCfg = await tlApi?.getSavedConfig?.();'), true);
});

test('Settings modal saves/restores account identity with TradeLocker login profiles', () => {
  const source = fs.readFileSync(settingsModalPath, 'utf8');
  assert.equal(source.includes('const accountId = parseTradeLockerId(tlSelectedAccountId);'), true);
  assert.equal(source.includes('const accNum = parseTradeLockerId(tlSelectedAccNum);'), true);
  assert.equal(source.includes('setTlSelectedAccountId(accountId != null ? String(accountId) : "");'), true);
  assert.equal(source.includes('setTlSelectedAccNum(accNum != null ? String(accNum) : "");'), true);
  assert.equal(source.includes('void applyTradeLockerActiveAccount(accountId, accNum);'), true);
  assert.equal(source.includes('profile.id === tlActiveProfileId'), true);
});

test('Broker settings copy reflects account-aware TradeLocker profile storage', () => {
  const source = fs.readFileSync(brokerSectionPath, 'utf8');
  assert.equal(source.includes('Profiles store env/server/email plus the selected account.'), true);
});
