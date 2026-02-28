const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime bridge exposes tradelocker switch endpoint and command relay', () => {
  const source = read('services/runtimeOpsExternalBridge.cjs');
  assert.equal(source.includes("pathname === `${API_PREFIX}/tradelocker/switch`"), true);
  assert.equal(source.includes("relayCommand('tradelocker.switch'"), true);
});

test('App external command dispatcher handles tradelocker.switch', () => {
  const source = read('App.tsx');
  assert.equal(source.includes("command === 'tradelocker.switch'"), true);
  assert.equal(source.includes("source: 'external_codex'"), true);
  assert.equal(source.includes('makePrimary: true'), true);
});

test('runtime ops types include tradelocker switch command and payload', () => {
  const source = read('types.ts');
  assert.equal(source.includes("| 'tradelocker.switch'"), true);
  assert.equal(source.includes('export interface RuntimeOpsTradeLockerSwitchPayload'), true);
  assert.equal(source.includes('export interface RuntimeOpsTradeLockerSwitchResult'), true);
});

