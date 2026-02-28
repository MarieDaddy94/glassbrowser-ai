const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');

test('TradeLocker panel uses immediate runner for connect and active-account switch operations', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.match(source, /const runImmediateTradeLockerAction = useCallback/);
  assert.match(source, /runImmediateTradeLockerAction\('tradelocker\.connect'/);
  assert.match(source, /runImmediateTradeLockerAction\(\s*'tradelocker\.set_active_account'/);
});

test('TradeLocker panel does not keep failed saved-profile selection and reports explicit error', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.match(source, /setSavedProfileId\(previousProfileId\);/);
  assert.match(source, /setAddAccountError\(/);
  assert.doesNotMatch(source, /ignore account auto-restore errors from saved profile selection/);
});
