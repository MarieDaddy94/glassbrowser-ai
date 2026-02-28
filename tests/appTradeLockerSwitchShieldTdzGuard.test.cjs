const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('App defines setTradeLockerSwitchShield before first runtime use', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  const declIdx = source.indexOf('const setTradeLockerSwitchShield = useCallback(');
  const firstCallIdx = source.indexOf('setTradeLockerSwitchShield({');

  assert.notStrictEqual(declIdx, -1, 'setTradeLockerSwitchShield declaration missing');
  assert.notStrictEqual(firstCallIdx, -1, 'setTradeLockerSwitchShield first call missing');
  assert.ok(
    declIdx < firstCallIdx,
    'setTradeLockerSwitchShield must be declared before first call to avoid TDZ startup crash'
  );
});
