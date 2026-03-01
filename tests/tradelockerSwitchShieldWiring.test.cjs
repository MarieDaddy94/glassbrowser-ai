const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const glassEventsPath = path.join(process.cwd(), 'services', 'glassEvents.ts');
const settingsModalPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');
const tradeLockerPanelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');
const useTradeLockerPath = path.join(process.cwd(), 'hooks', 'useTradeLocker.ts');

test('TradeLocker switch shield event key is defined', () => {
  const source = fs.readFileSync(glassEventsPath, 'utf8');
  assert.match(source, /TRADELOCKER_SWITCH_SHIELD:\s*'glass_tradelocker_switch_shield'/);
});

test('Settings and TradeLocker panel emit switch shield events', () => {
  const settingsSource = fs.readFileSync(settingsModalPath, 'utf8');
  const panelSource = fs.readFileSync(tradeLockerPanelPath, 'utf8');
  assert.match(settingsSource, /GLASS_EVENT\.TRADELOCKER_SWITCH_SHIELD/);
  assert.match(panelSource, /GLASS_EVENT\.TRADELOCKER_SWITCH_SHIELD/);
});

test('useTradeLocker consumes switch shield events and gates noncritical refresh paths', () => {
  const source = fs.readFileSync(useTradeLockerPath, 'utf8');
  assert.match(source, /const eventName = GLASS_EVENT\.TRADELOCKER_SWITCH_SHIELD/);
  assert.match(source, /if \(switchShieldActive\) return;\s*\n\s*if \(!api\?\.getOrdersHistory\) return;/);
  assert.match(source, /if \(switchShieldActive\) return;\s*\n\s*const hasTargets = positionsRaw\.length > 0 \|\| orders\.length > 0 \|\| watchSymbols\.length > 0;/);
  assert.match(source, /if \(switchShieldActive\) return;\s*\n\s*if \(watchSymbols\.length === 0\) return;/);
  assert.match(source, /if \(switchShieldUntilRef\.current > Date\.now\(\) && opts\?\.bypassSwitchShield !== true\) return;/);
});
