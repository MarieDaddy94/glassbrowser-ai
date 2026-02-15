const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('settings modal declares TradeLocker active-account callback before reconnect callback', () => {
  const source = read('components/SettingsModal.tsx');
  const applyIdx = source.indexOf('const applyTradeLockerActiveAccount = useCallback');
  const reconnectIdx = source.indexOf('const reconnectTradeLockerProfile = useCallback');
  assert.equal(applyIdx >= 0, true);
  assert.equal(reconnectIdx >= 0, true);
  assert.equal(applyIdx < reconnectIdx, true);
});
