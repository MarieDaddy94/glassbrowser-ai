const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('types include TradeLocker rate-limit telemetry contracts', () => {
  const types = read('types.ts');
  const settingsTypes = read('components/settings/types.ts');

  assert.equal(types.includes('export interface TradeLockerRateLimitTelemetry {'), true);
  assert.equal(types.includes('export interface TradeLockerRateLimitRouteTelemetry {'), true);
  assert.equal(types.includes("export type TradeLockerRateLimitPolicy = 'safe' | 'balanced' | 'aggressive';"), true);
  assert.equal(types.includes('export interface TradeLockerRateLimitAccountTelemetry {'), true);
  assert.equal(types.includes('policy?: TradeLockerRateLimitPolicy;'), true);
  assert.equal(types.includes('topAccounts?: TradeLockerRateLimitAccountTelemetry[];'), true);
  assert.equal(types.includes('tradelockerRateLimitTelemetry?: TradeLockerRateLimitTelemetry | null;'), true);
  assert.equal(settingsTypes.includes("mode: 'normal' | 'guarded' | 'cooldown';"), true);
  assert.equal(settingsTypes.includes("policy?: 'safe' | 'balanced' | 'aggressive';"), true);
  assert.equal(settingsTypes.includes('topAccounts?: Array<{'), true);
  assert.equal(settingsTypes.includes('tradelockerRateLimitTelemetry?: {'), true);
});

test('app, hook, and panels wire telemetry end-to-end', () => {
  const hook = read('hooks/useTradeLocker.ts');
  const preload = read('electron/preload.cjs');
  const main = read('electron/main.cjs');
  const app = read('App.tsx');
  const monitor = read('components/MonitorInterface.tsx');
  const locker = read('components/TradeLockerInterface.tsx');

  assert.equal(hook.includes('rateLimitTelemetry?: TradeLockerRateLimitTelemetry | null;'), true);
  assert.equal(hook.includes('rateLimitPolicy?: \'safe\' | \'balanced\' | \'aggressive\' | null;'), true);
  assert.equal(hook.includes('scaleByRateLimitGovernor('), true);
  assert.equal(hook.includes('rateLimitTelemetry:'), true);
  assert.equal(preload.includes('getRateLimitPolicy: () => guardedInvoke(\'tradelocker\', \'tradelocker:getRateLimitPolicy\')'), true);
  assert.equal(preload.includes('setRateLimitPolicy: (args) => guardedInvoke(\'tradelocker\', \'tradelocker:setRateLimitPolicy\', args)'), true);
  assert.equal(main.includes("ipcMain.handle('tradelocker:getRateLimitPolicy'"), true);
  assert.equal(main.includes("ipcMain.handle('tradelocker:setRateLimitPolicy'"), true);
  assert.equal(app.includes('tradelockerRateLimitTelemetry: tlStatusMeta?.rateLimitTelemetry ?? null,'), true);
  assert.equal(app.includes('rateLimitTelemetry={tlStatusMeta?.rateLimitTelemetry ?? null}'), true);
  assert.equal(monitor.includes('const rateLimitTelemetry = liveHealth?.tradelockerRateLimitTelemetry || null;'), true);
  assert.equal(monitor.includes('setRateLimitPolicy'), true);
  assert.equal(monitor.includes("(['safe', 'balanced', 'aggressive'] as const).map"), true);
  assert.equal(monitor.includes('Route hot spots'), true);
  assert.equal(monitor.includes('Account hot spots'), true);
  assert.equal(locker.includes('rateLimitTelemetry?: TradeLockerRateLimitTelemetry | null;'), true);
  assert.equal(locker.includes('Rate governor:'), true);
  assert.equal(locker.includes('pressure'), true);
});
