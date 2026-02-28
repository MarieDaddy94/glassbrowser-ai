const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const identityPath = path.join(process.cwd(), 'services', 'tradeLockerIdentity.ts');
const appPath = path.join(process.cwd(), 'App.tsx');
const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');
const electronPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('tradeLockerIdentity exposes normalized account record helper and fallback key builder', () => {
  const source = fs.readFileSync(identityPath, 'utf8');
  assert.match(source, /export const buildTradeLockerAccountFallbackKey/);
  assert.match(source, /export const normalizeTradeLockerAccountRecord/);
  assert.match(source, /accountNum',\s*'accountNumber/);
});

test('App and TradeLocker panel use normalized TradeLocker account records', () => {
  const appSource = fs.readFileSync(appPath, 'utf8');
  const panelSource = fs.readFileSync(panelPath, 'utf8');
  assert.match(appSource, /normalizeTradeLockerAccountRecord\(acct,\s*\{\s*env,\s*server\s*\}\)/);
  assert.match(panelSource, /normalizeTradeLockerAccountRecord\(acct,\s*\{\s*env,\s*server\s*\}\)/);
});

test('electron tradelocker normalizes account list before caching', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /function normalizeAccountEntry/);
  assert.match(source, /function normalizeAccountsList/);
  assert.match(source, /const accounts = normalizeAccountsList\(Array\.isArray\(json\?\.accounts\) \? json\.accounts : \[\]\);/);
});
