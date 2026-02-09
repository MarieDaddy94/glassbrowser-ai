const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('glass event registry defines typed constants for tradelocker/mt5/backtester domains', () => {
  const source = read('services/glassEvents.ts');
  assert.equal(source.includes('TRADELOCKER_ACCOUNT_CHANGED'), true);
  assert.equal(source.includes('MT5_TICKET'), true);
  assert.equal(source.includes('MT5_CONTROLS'), true);
  assert.equal(source.includes('BACKTESTER'), true);
  assert.equal(source.includes('dispatchGlassEvent'), true);
});

test('high-traffic modules use glass event registry constants', () => {
  const app = read('App.tsx');
  const settings = read('components/SettingsModal.tsx');
  const mt5 = read('components/MT5Interface.tsx');
  const backtesterRuntime = read('services/backtesterActionRuntime.ts');

  assert.equal(app.includes('GLASS_EVENT.TRADELOCKER_TICKET'), true);
  assert.equal(app.includes('GLASS_EVENT.MT5_TICKET'), true);
  assert.equal(settings.includes('GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED'), true);
  assert.equal(mt5.includes('GLASS_EVENT.MT5_CONTROLS'), true);
  assert.equal(backtesterRuntime.includes('GLASS_EVENT.BACKTESTER.REPLAY'), true);
});
