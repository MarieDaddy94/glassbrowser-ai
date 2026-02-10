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

test('calendar pnl engine month summary stays deterministic for mixed outcomes', () => {
  const mod = loadTsModule('services/calendarPnlEngine.ts');
  const { buildCalendarPnlSnapshot } = mod;

  const snapshot = buildCalendarPnlSnapshot({
    monthKey: '2026-03',
    timezone: 'UTC',
    entries: [
      {
        kind: 'trade',
        id: 'sum-1',
        action: 'BUY',
        status: 'CLOSED',
        symbol: 'EURUSD',
        positionClosedAtMs: Date.UTC(2026, 2, 4, 10, 0, 0),
        realizedPnl: 100
      },
      {
        kind: 'trade',
        id: 'sum-2',
        action: 'BUY',
        status: 'CLOSED',
        symbol: 'EURUSD',
        positionClosedAtMs: Date.UTC(2026, 2, 4, 12, 0, 0),
        realizedPnl: -40
      },
      {
        kind: 'trade',
        id: 'sum-3',
        action: 'SELL',
        status: 'CLOSED',
        symbol: 'XAUUSD',
        positionClosedAtMs: Date.UTC(2026, 2, 6, 14, 0, 0),
        realizedPnl: 20
      }
    ]
  });

  assert.equal(snapshot.monthSummary.tradeCount, 3);
  assert.equal(snapshot.monthSummary.netPnl, 80);
  assert.equal(snapshot.monthSummary.activeDays, 2);
  assert.equal(snapshot.monthSummary.wins, 2);
  assert.equal(snapshot.monthSummary.losses, 1);
  assert.equal(snapshot.monthSummary.bestDayPnl, 60);
  assert.equal(snapshot.monthSummary.worstDayPnl, 20);
  assert.equal(snapshot.kpis.avgWin, 60);
  assert.equal(snapshot.kpis.avgLoss, -40);
});

