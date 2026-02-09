const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const brokerRuntimePath = path.join(process.cwd(), 'services', 'catalogBrokerRuntime.ts');
const hookPath = path.join(process.cwd(), 'hooks', 'useTradeLocker.ts');
const appPath = path.join(process.cwd(), 'App.tsx');
const settingsPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');
const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');

test('catalog broker runtime broadcasts TradeLocker account-switch events', () => {
  const source = fs.readFileSync(brokerRuntimePath, 'utf8');
  assert.equal(source.includes('GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED'), true);
  assert.equal(source.includes("source: 'catalog'"), true);
});

test('useTradeLocker listens for account-switch events and refreshes config/state', () => {
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.equal(source.includes('tradelocker.saved_config.refresh'), true);
  assert.equal(source.includes('const eventName = GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED;'), true);
  assert.equal(source.includes('window.addEventListener(eventName, onAccountChanged as EventListener);'), true);
  assert.equal(source.includes('await refreshSavedConfig();'), true);
  assert.equal(source.includes('await refreshSnapshot();'), true);
  assert.equal(source.includes('await refreshOrders();'), true);
  assert.equal(source.includes('await refreshAccountMetrics();'), true);
  assert.equal(source.includes('await refreshQuotes();'), true);
});

test('telegram TradeLocker account-hint path dispatches switch event and refreshes target positions', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes("source: 'telegram'"), true);
  assert.equal(source.includes('dispatchGlassEvent(GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED'), true);
  assert.equal(source.includes('const snapRes = await api.getSnapshot({ includeOrders: false });'), true);
});

test('settings and TradeLocker panel direct account switches broadcast coherence events', () => {
  const settingsSource = fs.readFileSync(settingsPath, 'utf8');
  const panelSource = fs.readFileSync(panelPath, 'utf8');
  assert.equal(settingsSource.includes('GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED'), true);
  assert.equal(settingsSource.includes('source: "settings_modal_select_direct"'), true);
  assert.equal(panelSource.includes('GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED'), true);
  assert.equal(panelSource.includes("source: 'tradelocker_panel_direct'"), true);
});
