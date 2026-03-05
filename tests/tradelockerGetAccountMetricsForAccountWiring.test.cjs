const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('TradeLocker client exposes account-scoped metrics fetch without active-account mutation', () => {
  const source = read('electron/tradelocker.cjs');
  assert.equal(source.includes('async getAccountMetricsForAccount({ accountId, accNum, maxAgeMs = 15_000 } = {}) {'), true);
  assert.equal(source.includes('accNumOverride: parsedAccNum'), true);
  assert.equal(source.includes('this.apiJson(`/trade/accounts/${parsedAccountId}/state`, {'), true);
});

test('IPC handlers and preload expose tradelocker:getAccountMetricsForAccount', () => {
  const electronMain = read('electron/main.cjs');
  const main = read('main.cjs');
  const preload = read('electron/preload.cjs');
  assert.equal(electronMain.includes("ipcMain.handle('tradelocker:getAccountMetricsForAccount'"), true);
  assert.equal(main.includes("ipcMain.handle('tradelocker:getAccountMetricsForAccount'"), true);
  assert.equal(preload.includes("getAccountMetricsForAccount: (opts) => guardedInvoke('tradelocker', 'tradelocker:getAccountMetricsForAccount', opts)"), true);
});

test('contracts and renderer types include tradelocker:getAccountMetricsForAccount', () => {
  const contractJson = read('contracts/ipc.contract.json');
  const contractTs = read('contracts/ipc.contract.ts');
  const globals = read('global.d.ts');
  assert.equal(contractJson.includes('"name": "tradelocker:getAccountMetricsForAccount"'), true);
  assert.equal(contractTs.includes('"name": "tradelocker:getAccountMetricsForAccount"'), true);
  assert.equal(globals.includes('getAccountMetricsForAccount: (opts: {'), true);
});
