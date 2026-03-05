const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'App.tsx');

test('App defines tlMarketBus before first strategy-runtime callback usage', () => {
  const source = fs.readFileSync(APP, 'utf8');
  const marketBusDecl = source.indexOf('const tlMarketBus = React.useMemo(');
  const listRuntimesDecl = source.indexOf('const listTradeLockerStrategyRuntimes = useCallback(() => {');

  assert.equal(marketBusDecl > -1, true);
  assert.equal(listRuntimesDecl > -1, true);
  assert.equal(marketBusDecl < listRuntimesDecl, true);
});

