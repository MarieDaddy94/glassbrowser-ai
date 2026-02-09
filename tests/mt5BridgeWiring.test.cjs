const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('MT5 interface routes generic symbol/history lookups through broker request bridge with MT5 context', () => {
  const source = read('components/MT5Interface.tsx');
  assert.equal(source.includes('requestBrokerCoordinated'), true);
  assert.equal(source.includes('brokerId: "mt5"'), true);
  assert.equal(source.includes('"searchInstruments"'), true);
  assert.equal(source.includes('"getHistorySeries"'), true);
  assert.equal(source.includes('source: "mt5.panel.chart.history"'), true);
  assert.equal(source.includes('source: "mt5.panel.symbol.resolve"'), true);
});

test('MT5 interface keeps local bridge fallback for account-local operations', () => {
  const source = read('components/MT5Interface.tsx');
  assert.equal(source.includes('fetchMt5(`/symbols?query='), true);
  assert.equal(source.includes('fetchMt5("/history/series"'), true);
});

test('useMt5Bridge remains account-local and does not call generic broker.request directly', () => {
  const source = read('hooks/useMt5Bridge.ts');
  assert.equal(source.includes('window.glass?.mt5'), true);
  assert.equal(source.includes('window.glass?.broker?.request'), false);
});
