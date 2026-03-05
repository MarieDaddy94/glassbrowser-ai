const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appSource = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
const tradeLockerInterfaceSource = fs.readFileSync(path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx'), 'utf8');
const settingsSource = fs.readFileSync(path.join(process.cwd(), 'components', 'SettingsModal.tsx'), 'utf8');
const monitorSource = fs.readFileSync(path.join(process.cwd(), 'components', 'MonitorInterface.tsx'), 'utf8');

test('App wires TradeLocker strategy runtime context into catalog broker runtime', () => {
  assert.match(appSource, /listTradeLockerStrategyRuntimes/);
  assert.match(appSource, /setTradeLockerStrategyRuntimeState/);
  assert.match(appSource, /assignTradeLockerStrategyRuntimeAccounts/);
  assert.match(appSource, /reconcileTradeLockerStrategyRuntime/);
  assert.match(appSource, /tradelockerShards:/);
  assert.match(appSource, /tradelockerTenants:/);
  assert.match(appSource, /tradelockerFanout:/);
  assert.match(appSource, /tradelockerScheduler:/);
});

test('TradeLocker panel surfaces strategy matrix controls', () => {
  assert.match(tradeLockerInterfaceSource, /strategyMatrixRows\?: TradeLockerStrategyMatrixRow\[\]/);
  assert.match(tradeLockerInterfaceSource, /Strategy Matrix/);
  assert.match(tradeLockerInterfaceSource, /tradelocker\.strategy_runtime\.set_state/);
  assert.match(tradeLockerInterfaceSource, /tradelocker\.strategy_runtime\.assign_accounts/);
  assert.match(tradeLockerInterfaceSource, /tradelocker\.strategy_runtime\.reconcile/);
});

test('Settings and Monitor include multi-account strategy surfaces', () => {
  assert.match(settingsSource, /TradeLocker Strategy Assignments/);
  assert.match(settingsSource, /tradelocker\.strategy_runtime\.assign_accounts/);
  assert.match(monitorSource, /MetricCard title="TradeLocker Shards"/);
});

