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

test('calendar pnl engine filters closed trade entries and computes realized pnl aggregates', () => {
  const source = read('services/calendarPnlEngine.ts');
  assert.equal(source.includes('buildCalendarPnlSnapshot'), true);
  assert.equal(source.includes('realizedPnl'), true);
  assert.equal(source.includes('positionClosedPnl'), true);

  const mod = loadTsModule('services/calendarPnlEngine.ts');
  const { buildCalendarPnlSnapshot } = mod;
  assert.equal(typeof buildCalendarPnlSnapshot, 'function');

  const snapshot = buildCalendarPnlSnapshot({
    monthKey: '2026-01',
    timezone: 'UTC',
    entries: [
      {
        kind: 'trade',
        id: 'trade-1',
        action: 'BUY',
        symbol: 'EURUSD',
        status: 'CLOSED',
        broker: 'tradelocker',
        agentId: 'agent_a',
        positionClosedAtMs: Date.UTC(2026, 0, 2, 14, 0, 0),
        realizedPnl: 120
      },
      {
        kind: 'trade',
        id: 'trade-2',
        action: 'SELL',
        symbol: 'GBPUSD',
        positionStatus: 'CLOSED',
        closedAtMs: Date.UTC(2026, 0, 2, 15, 0, 0),
        positionClosedPnl: -45
      },
      {
        kind: 'note',
        id: 'ignore-me',
        positionClosedAtMs: Date.UTC(2026, 0, 2, 16, 0, 0),
        realizedPnl: 999
      }
    ]
  });

  assert.equal(snapshot.monthSummary.tradeCount, 2);
  assert.equal(snapshot.monthSummary.wins, 1);
  assert.equal(snapshot.monthSummary.losses, 1);
  assert.equal(snapshot.monthSummary.netPnl, 75);
  assert.equal(snapshot.cells.length, 1);
  assert.equal(snapshot.cells[0].dateKey, '2026-01-02');
  assert.equal(snapshot.cells[0].tradeCount, 2);
  assert.equal(Array.isArray(snapshot.tradesByDate['2026-01-02']), true);
  assert.equal(snapshot.tradesByDate['2026-01-02'].length, 2);
});

