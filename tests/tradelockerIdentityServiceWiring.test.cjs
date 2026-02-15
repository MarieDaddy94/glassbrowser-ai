const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('shared TradeLocker identity service exposes canonical account/profile helpers', () => {
  const source = read('services/tradeLockerIdentity.ts');
  assert.equal(source.includes('export const buildTradeLockerAccountKey'), true);
  assert.equal(source.includes('export const parseTradeLockerAccountKey'), true);
  assert.equal(source.includes('export const parseTradeLockerAccountNumber'), true);
  assert.equal(source.includes('export const resolveTradeLockerIdentityMatchState'), true);
  assert.equal(source.includes('export const buildTradeLockerProfileId'), true);
  assert.equal(source.includes('export const normalizeTradeLockerProfileId'), true);
});

test('Settings modal and TradeLocker panel import shared TradeLocker identity helpers', () => {
  const settingsSource = read('components/SettingsModal.tsx');
  const panelSource = read('components/TradeLockerInterface.tsx');
  assert.equal(settingsSource.includes("from \"../services/tradeLockerIdentity\""), true);
  assert.equal(panelSource.includes("from '../services/tradeLockerIdentity'"), true);
});
