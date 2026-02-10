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

test('calendar pnl engine buckets same close timestamp into timezone-correct day keys', () => {
  const mod = loadTsModule('services/calendarPnlEngine.ts');
  const { buildCalendarPnlSnapshot } = mod;

  const trade = {
    kind: 'trade',
    id: 'tz-trade-1',
    action: 'BUY',
    symbol: 'NAS100',
    status: 'CLOSED',
    positionClosedAtMs: Date.UTC(2026, 0, 1, 0, 30, 0),
    realizedPnl: 25
  };

  const ny = buildCalendarPnlSnapshot({
    monthKey: '2025-12',
    timezone: 'America/New_York',
    entries: [trade]
  });
  assert.equal(ny.monthSummary.tradeCount, 1);
  assert.equal(ny.cells[0].dateKey, '2025-12-31');

  const utc = buildCalendarPnlSnapshot({
    monthKey: '2026-01',
    timezone: 'UTC',
    entries: [trade]
  });
  assert.equal(utc.monthSummary.tradeCount, 1);
  assert.equal(utc.cells[0].dateKey, '2026-01-01');
});

