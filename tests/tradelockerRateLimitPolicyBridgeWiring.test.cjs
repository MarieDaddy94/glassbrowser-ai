const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('TradeLocker rate-limit policy controls are wired across main, preload, and types', () => {
  const main = read('electron/main.cjs');
  const preload = read('electron/preload.cjs');
  const globals = read('global.d.ts');

  assert.equal(main.includes("ipcMain.handle('tradelocker:getRateLimitPolicy'"), true);
  assert.equal(main.includes("ipcMain.handle('tradelocker:setRateLimitPolicy'"), true);

  assert.equal(preload.includes("getRateLimitPolicy: () => guardedInvoke('tradelocker', 'tradelocker:getRateLimitPolicy')"), true);
  assert.equal(preload.includes("setRateLimitPolicy: (args) => guardedInvoke('tradelocker', 'tradelocker:setRateLimitPolicy', args)"), true);

  assert.equal(globals.includes('getRateLimitPolicy: () => Promise<{'), true);
  assert.equal(globals.includes('setRateLimitPolicy: (args: {'), true);
  assert.equal(globals.includes("rateLimitPolicy?: 'safe' | 'balanced' | 'aggressive';"), true);
});
