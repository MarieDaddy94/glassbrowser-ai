const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');
const cacheBudgetManagerStub = {
  getCacheBudgetManager: () => ({
    register: () => {},
    noteGet: () => {},
    noteSet: () => {},
    noteEviction: () => {},
    setSize: () => {}
  })
};

const loadTsModule = (relPath, requireMap = {}) => {
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
    require: (id) => {
      if (Object.prototype.hasOwnProperty.call(requireMap, id)) return requireMap[id];
      throw new Error(`Unsupported dependency in ${relPath}: ${id}`);
    },
    console,
    Date,
    Math,
    JSON
  };
  vm.runInNewContext(transpiled, sandbox, { filename: `${relPath}.compiled.cjs` });
  return mod.exports;
};

test('snapshot history fetcher reuses shared history cache for repeated incremental requests', async () => {
  const historyCacheModule = loadTsModule('services/historySharedCache.ts', {
    './cacheBudgetManager': cacheBudgetManagerStub
  });
  const symbolsModule = loadTsModule('services/symbols.ts');
  const fetcherModule = loadTsModule('services/snapshotHistoryFetcher.ts', {
    './historySharedCache': historyCacheModule,
    './symbols': symbolsModule
  });

  const { HistorySharedCache } = historyCacheModule;
  const { createSnapshotHistoryFetcher } = fetcherModule;
  const cache = new HistorySharedCache();
  let now = Date.now();
  let brokerFetches = 0;

  const fetchHistory = createSnapshotHistoryFetcher({
    cache,
    nowMs: () => now,
    resolvePartition: () => 'tradelocker|acc-01',
    fetcher: async (args) => {
      brokerFetches += 1;
      return {
        ok: true,
        bars: [
          { t: Number(args.from || 0), o: 1, h: 1.01, l: 0.99, c: 1, v: 1 },
          { t: Number(args.to || 0), o: 1, h: 1.02, l: 0.98, c: 1.01, v: 2 }
        ],
        fetchedAtMs: now,
        brokerId: 'tradelocker'
      };
    }
  });

  const first = await fetchHistory({
    symbol: 'EURUSD',
    resolution: '1m',
    from: now - 60_000,
    to: now,
    aggregate: false,
    maxAgeMs: 60_000
  });
  assert.equal(first?.ok, true);
  assert.equal(brokerFetches, 1);

  now += 3_000;
  const second = await fetchHistory({
    symbol: 'eurusd',
    resolution: '1m',
    from: now - 55_000,
    to: now,
    aggregate: false,
    maxAgeMs: 60_000
  });
  assert.equal(second?.ok, true);
  assert.equal(second?.cacheHit, true);
  assert.equal(brokerFetches, 1, 'expected shared history cache hit for repeated request');
});

test('snapshot history fetcher refetches when cache is stale or request coverage expands', async () => {
  const historyCacheModule = loadTsModule('services/historySharedCache.ts', {
    './cacheBudgetManager': cacheBudgetManagerStub
  });
  const symbolsModule = loadTsModule('services/symbols.ts');
  const fetcherModule = loadTsModule('services/snapshotHistoryFetcher.ts', {
    './historySharedCache': historyCacheModule,
    './symbols': symbolsModule
  });

  const { HistorySharedCache } = historyCacheModule;
  const { createSnapshotHistoryFetcher } = fetcherModule;
  const cache = new HistorySharedCache();
  let now = Date.now();
  let brokerFetches = 0;

  const fetchHistory = createSnapshotHistoryFetcher({
    cache,
    nowMs: () => now,
    resolvePartition: () => 'tradelocker|acc-02',
    fetcher: async (args) => {
      brokerFetches += 1;
      return {
        ok: true,
        bars: [{ t: Number(args.from || 0), c: 1 }, { t: Number(args.to || 0), c: 1.01 }],
        fetchedAtMs: now
      };
    }
  });

  await fetchHistory({
    symbol: 'XAUUSD',
    resolution: '5m',
    from: now - 300_000,
    to: now,
    aggregate: true,
    maxAgeMs: 20_000
  });
  assert.equal(brokerFetches, 1);

  // Older lookback requirement cannot be satisfied by prior cached range.
  now += 5_000;
  await fetchHistory({
    symbol: 'XAUUSD',
    resolution: '5m',
    from: now - 600_000,
    to: now,
    aggregate: true,
    maxAgeMs: 20_000
  });
  assert.equal(brokerFetches, 2);

  // Cache freshness expires.
  now += 25_000;
  await fetchHistory({
    symbol: 'XAUUSD',
    resolution: '5m',
    from: now - 300_000,
    to: now,
    aggregate: true,
    maxAgeMs: 20_000
  });
  assert.equal(brokerFetches, 3);
});

test('app wires chart history requests through snapshot history fetcher', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("import { createSnapshotHistoryFetcher } from './services/snapshotHistoryFetcher';"), true);
  assert.equal(app.includes('const chartHistorySeriesFetcher = React.useMemo(() => {'), true);
  assert.equal(app.includes('createSnapshotHistoryFetcher({'), true);
  assert.equal(app.includes('getHistorySeries: chartHistorySeriesFetcher,'), true);
});
