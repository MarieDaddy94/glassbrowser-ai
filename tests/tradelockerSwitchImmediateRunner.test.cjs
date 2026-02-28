const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('App defines immediate TradeLocker action runner for critical account ops', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(
    /const IMMEDIATE_TRADELOCKER_ACTION_IDS = (React\.)?useMemo/.test(source),
    true
  );
  assert.match(source, /'tradelocker\.connect'/);
  assert.match(source, /'tradelocker\.refresh_accounts'/);
  assert.match(source, /'tradelocker\.set_active_account'/);
  assert.match(source, /'tradelocker\.disconnect'/);
  assert.match(source, /const runActionCatalogImmediate = useCallback/);
  assert.match(source, /const immediateSource = `catalog_immediate:\$\{actionId\}`/);
  assert.match(source, /source:\s*immediateSource/);
  assert.match(source, /disableCooldown:\s*true/);
});

test('App wires immediate runner into TradeLocker and Settings surfaces', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /<TradeLockerInterface[\s\S]*onRunActionCatalogImmediate=\{runActionCatalogImmediate\}/);
  assert.match(source, /<SettingsModal[\s\S]*onRunActionCatalogImmediate=\{runActionCatalogImmediate\}/);
});
