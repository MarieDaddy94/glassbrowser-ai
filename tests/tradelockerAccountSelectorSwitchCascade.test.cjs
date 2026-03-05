const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'hooks/orchestrators/useTradeLockerAccountSelectorRuntime.ts');

test('account selector switch delegates to canonical snapshot-source switch flow', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const handleTradeLockerAccountSelectorSelect = React.useCallback('), true);
  assert.equal(source.includes('const res = await handleSnapshotSourceChange(nextKey);'), true);
  assert.equal(source.includes('setTlAccountSelectorOpen(false);'), true);
});

test('account selector emits switch telemetry events for requested/succeeded/failed', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes("eventType: 'tradelocker_account_selector_switch_requested'"), true);
  assert.equal(source.includes("eventType: 'tradelocker_account_selector_switch_succeeded'"), true);
  assert.equal(source.includes("eventType: 'tradelocker_account_selector_switch_failed'"), true);
});

test('manual balance refresh keeps active account metrics sync and queues inactive cards', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('if (activeTradeLockerAccountKey && tlRefreshAccountMetrics) {'), true);
  assert.equal(source.includes('await tlRefreshAccountMetrics();'), true);
  assert.equal(source.includes('.filter((item) => !item.isActive)'), true);
});
