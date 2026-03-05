const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('browser chrome exposes additive TradeLocker account selector prop and renders selector', () => {
  const chrome = read('components/BrowserChrome.tsx');
  assert.equal(chrome.includes('tradeLockerAccountSelector?: TradeLockerAccountSelectorModel;'), true);
  assert.equal(chrome.includes('<AccountSelector model={tradeLockerAccountSelector} />'), true);
});

test('app wires selector model into BrowserChrome', () => {
  const app = read('App.tsx');
  const shell = read('components/app/AppShellContent.tsx');
  assert.equal(shell.includes('tradeLockerAccountSelector={tradeLockerAccountSelectorModel || undefined}'), true);
  assert.equal(app.includes('useTradeLockerAccountSelectorRuntime({'), true);
  assert.equal(app.includes('tradeLockerAccountSelectorModel'), true);
});

test('account selector component exposes card-list controls and refresh UX', () => {
  const selector = read('components/tradelocker/AccountSelector.tsx');
  const types = read('types.ts');
  assert.equal(selector.includes('Select Account'), true);
  assert.equal(selector.includes('Search accounts...'), true);
  assert.equal(selector.includes('Refresh balances'), true);
  assert.equal(selector.includes('TradeLockerAccountSelectorModel'), true);
  assert.equal(types.includes('onSelect: (accountKey: string) => void;'), true);
});
