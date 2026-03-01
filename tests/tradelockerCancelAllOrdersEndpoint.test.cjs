const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (relPath) => fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

test('TradeLocker client exposes cancelAllOrders account endpoint', () => {
  const source = read('electron/tradelocker.cjs');
  assert.match(source, /async cancelAllOrders\(\{ reason = null \} = \{\}\)/);
  assert.match(source, /this\.apiRequestMeta\(`\/trade\/accounts\/\$\{this\.state\.accountId\}\/orders`, \{\s*method: 'DELETE'/);
});

test('main and preload expose cancelAllOrders bridge method', () => {
  const mainSource = read('electron/main.cjs');
  const preloadSource = read('electron/preload.cjs');
  assert.match(mainSource, /ipcMain\.handle\('tradelocker:cancelAllOrders'/);
  assert.match(preloadSource, /cancelAllOrders: \(args\) => guardedInvoke\('tradelocker', 'tradelocker:cancelAllOrders', args\)/);
});

