const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('App tracks TradeLocker switch shield activations in runtime stats', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /switchShieldActivations:\s*0/);
  assert.match(source, /tradeLockerSwitchStatsRef\.current\.switchShieldActivations \+= 1/);
  assert.match(source, /tradeLockerSwitchShieldActivations:\s*Number\(tradeLockerSwitchStatsRef\.current\.switchShieldActivations \|\| 0\)/);
});
