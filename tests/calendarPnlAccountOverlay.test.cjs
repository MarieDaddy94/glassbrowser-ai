const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const loadTsModule = (relPath) => {
  const source = read(relPath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText;
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    require: () => ({}),
    console,
    Date,
    Math,
    Intl
  };
  vm.runInNewContext(transpiled, sandbox, { filename: `${relPath}.compiled.cjs` });
  return mod.exports;
};

test('calendar pnl snapshot includes account overlays, account filtering, and source summary', () => {
  const mod = loadTsModule('services/calendarPnlEngine.ts');
  const { buildCalendarPnlSnapshot } = mod;

  const snapshot = buildCalendarPnlSnapshot({
    monthKey: '2026-02',
    timezone: 'UTC',
    entries: [
      {
        kind: 'trade',
        id: 'a1',
        broker: 'tradelocker',
        accountKey: 'tradelocker:demo:main:101:1',
        accountId: 101,
        accNum: 1,
        status: 'CLOSED',
        positionClosedAtMs: Date.UTC(2026, 1, 4, 10, 0, 0),
        realizedPnl: 150,
        realizedPnlSource: 'trade_ledger'
      },
      {
        kind: 'trade',
        id: 'b1',
        broker: 'tradelocker',
        accountKey: 'tradelocker:demo:main:102:2',
        accountId: 102,
        accNum: 2,
        status: 'CLOSED',
        positionClosedAtMs: Date.UTC(2026, 1, 4, 11, 0, 0),
        realizedPnl: -40,
        realizedPnlSource: 'tradelocker_orders_history'
      },
      {
        kind: 'trade',
        id: 'a2',
        broker: 'tradelocker',
        accountKey: 'tradelocker:demo:main:101:1',
        accountId: 101,
        accNum: 1,
        status: 'CLOSED',
        positionClosedAtMs: Date.UTC(2026, 1, 7, 11, 0, 0),
        realizedPnl: 20,
        realizedPnlSource: 'broker_position'
      }
    ]
  });

  assert.equal(snapshot.availableAccounts.length, 2);
  assert.equal(snapshot.accountSummaries.length, 2);
  assert.equal(snapshot.sourceSummary.ledgerTrades, 1);
  assert.equal(snapshot.sourceSummary.brokerTrades, 2);
  assert.equal(Array.isArray(snapshot.accountOverlaysByDate['2026-02-04']), true);
  assert.equal(snapshot.accountOverlaysByDate['2026-02-04'].length, 2);

  const filtered = buildCalendarPnlSnapshot({
    monthKey: '2026-02',
    timezone: 'UTC',
    accountKey: 'tradelocker:demo:main:101:1',
    entries: [
      {
        kind: 'trade',
        id: 'a1',
        broker: 'tradelocker',
        accountKey: 'tradelocker:demo:main:101:1',
        accountId: 101,
        accNum: 1,
        status: 'CLOSED',
        positionClosedAtMs: Date.UTC(2026, 1, 4, 10, 0, 0),
        realizedPnl: 150,
        realizedPnlSource: 'trade_ledger'
      },
      {
        kind: 'trade',
        id: 'b1',
        broker: 'tradelocker',
        accountKey: 'tradelocker:demo:main:102:2',
        accountId: 102,
        accNum: 2,
        status: 'CLOSED',
        positionClosedAtMs: Date.UTC(2026, 1, 4, 11, 0, 0),
        realizedPnl: -40,
        realizedPnlSource: 'tradelocker_orders_history'
      }
    ]
  });

  assert.equal(filtered.selectedAccountKey, 'tradelocker:demo:main:101:1');
  assert.equal(filtered.monthSummary.tradeCount, 1);
  assert.equal(filtered.monthSummary.netPnl, 150);
});
