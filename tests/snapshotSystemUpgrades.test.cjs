const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const resolutionMapMs = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  '1D': 86_400_000,
  '1W': 604_800_000
};

const normalizeTimeframe = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return raw;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  if (unit === 'h' || unit === 'd' || unit === 'w') return `${amount}${unit.toUpperCase()}`;
  if (unit === 'm') return `${amount}m`;
  return raw;
};

const backtestEngineStub = {
  resolutionToMs: (value) => {
    const tf = normalizeTimeframe(value);
    return resolutionMapMs[tf] || 60_000;
  },
  computeSmaSeries: (bars, period) => {
    const p = Math.max(1, Number(period) || 1);
    return (Array.isArray(bars) ? bars : []).map((_, idx) => {
      if (idx + 1 < p) return null;
      let sum = 0;
      for (let i = idx - p + 1; i <= idx; i += 1) {
        sum += Number(bars[i]?.c || 0);
      }
      return sum / p;
    });
  },
  computeEmaSeries: (bars, period) => {
    const p = Math.max(1, Number(period) || 1);
    const k = 2 / (p + 1);
    let ema = null;
    return (Array.isArray(bars) ? bars : []).map((bar, idx) => {
      const close = Number(bar?.c || 0);
      if (!Number.isFinite(close)) return null;
      if (ema == null) {
        ema = close;
        return idx + 1 >= p ? ema : null;
      }
      ema = (close * k) + (ema * (1 - k));
      return idx + 1 >= p ? ema : null;
    });
  },
  computeAtrSeries: (bars, period) => {
    const p = Math.max(1, Number(period) || 1);
    const out = [];
    let prevClose = null;
    for (const bar of Array.isArray(bars) ? bars : []) {
      const h = Number(bar?.h || 0);
      const l = Number(bar?.l || 0);
      const c = Number(bar?.c || 0);
      const tr = prevClose == null
        ? Math.max(0, h - l)
        : Math.max(Math.abs(h - l), Math.abs(h - prevClose), Math.abs(l - prevClose));
      prevClose = c;
      out.push(tr);
    }
    return out.map((_, idx) => {
      if (idx + 1 < p) return null;
      let sum = 0;
      for (let i = idx - p + 1; i <= idx; i += 1) {
        sum += Number(out[i] || 0);
      }
      return sum / p;
    });
  },
  computeRsiSeries: (bars, period) => {
    const p = Math.max(2, Number(period) || 14);
    const closes = (Array.isArray(bars) ? bars : []).map((bar) => Number(bar?.c || 0));
    const out = new Array(closes.length).fill(null);
    for (let i = p; i < closes.length; i += 1) {
      let gains = 0;
      let losses = 0;
      for (let j = i - p + 1; j <= i; j += 1) {
        const delta = closes[j] - closes[j - 1];
        if (delta >= 0) gains += delta;
        else losses += Math.abs(delta);
      }
      if (losses === 0) out[i] = 100;
      else {
        const rs = gains / losses;
        out[i] = 100 - (100 / (1 + rs));
      }
    }
    return out;
  }
};

const symbolsStub = {
  normalizeSymbolKey: (value) => String(value || '').trim().toUpperCase().split('.')[0].replace(/\s+/g, ''),
  normalizeSymbolLoose: (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
  normalizeTimeframe
};

const createLocalStorageMock = (initial = {}, opts = {}) => {
  const map = new Map();
  for (const [key, value] of Object.entries(initial)) {
    map.set(String(key), String(value));
  }
  const localStorage = {
    getItem(key) {
      const k = String(key);
      return map.has(k) ? map.get(k) : null;
    },
    setItem(key, value) {
      if (opts.throwOnSet) {
        throw new Error(String(opts.throwOnSet));
      }
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    }
  };
  return { localStorage, map };
};

const loadChartEngine = (windowMock) => {
  const source = read('services/chartEngine.ts');
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
      if (id === './backtestEngine') return backtestEngineStub;
      if (id === './symbols') return symbolsStub;
      throw new Error(`Unsupported dependency in chartEngine test loader: ${id}`);
    },
    console,
    window: windowMock,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON
  };
  vm.runInNewContext(transpiled, sandbox, { filename: 'chartEngine.test.compiled.cjs' });
  return mod.exports.ChartEngine;
};

const buildBars = ({ startMs, count, stepMs, startPrice }) => {
  const out = [];
  let price = Number(startPrice || 1);
  for (let i = 0; i < count; i += 1) {
    const t = startMs + (i * stepMs);
    const o = price;
    const c = Number((o + 0.0002).toFixed(6));
    const h = Number((Math.max(o, c) + 0.0001).toFixed(6));
    const l = Number((Math.min(o, c) - 0.0001).toFixed(6));
    out.push({ t, o, h, l, c, v: 10 + i });
    price = c;
  }
  return out;
};

test('chart engine hydrates from persisted frame cache and supports manual clear', async () => {
  const now = 1_730_000_000_000;
  const bars = buildBars({
    startMs: now - (160 * resolutionMapMs['1H']),
    count: 160,
    stepMs: resolutionMapMs['1H'],
    startPrice: 1.1
  });
  const payload = {
    version: 1,
    savedAtMs: now,
    entries: {
      'tradelocker|default@@EURUSD::1H': {
        symbol: 'EURUSD',
        timeframe: '1H',
        partition: 'tradelocker|default',
        updatedAtMs: now,
        lastHistoryFetchAtMs: now,
        lastFullHistoryFetchAtMs: now,
        bars
      }
    }
  };
  const storage = createLocalStorageMock({
    glass_chart_frame_cache_v1: JSON.stringify(payload)
  });
  const ChartEngine = loadChartEngine({ localStorage: storage.localStorage });
  let fetchCalls = 0;
  const engine = new ChartEngine({
    getHistorySeries: async () => {
      fetchCalls += 1;
      return { ok: true, bars: [] };
    },
    nowMs: () => now + 1_000
  });

  const sessionId = engine.startSession({ symbol: 'EURUSD', timeframe: '1H' });
  await sleep(25);

  const snapshot = engine.getSnapshot(sessionId, { barsLimit: 600 });
  assert.ok(snapshot, 'expected hydrated snapshot');
  assert.equal(snapshot.barCount, bars.length);
  assert.equal(snapshot.health.source, 'cache');
  assert.equal(fetchCalls, 0, 'hydrated session should not immediately full-fetch');

  const telemetry = engine.getFrameCacheTelemetry();
  assert.equal(telemetry.hydrate.attempts >= 1, true);
  assert.equal(telemetry.hydrate.hits >= 1, true);
  assert.equal(telemetry.entries >= 1, true);
  assert.equal(telemetry.partitions.includes('tradelocker|default'), true);

  const clearRes = engine.clearPersistedFrameCache({ dropSessionBars: true });
  assert.equal(clearRes.ok, true);
  assert.equal(clearRes.entriesCleared >= 1, true);
  const clearedSnapshot = engine.getSnapshot(sessionId, { barsLimit: 10 });
  assert.ok(clearedSnapshot);
  assert.equal(clearedSnapshot.barCount, 0);
  assert.equal(engine.getFrameCacheTelemetry().entries, 0);
});

test('chart engine tracks full/incremental fetch mix and broker/account cache partitions', async () => {
  let now = 1_735_000_000_000;
  const stepMs = resolutionMapMs['1m'];
  const firstBars = buildBars({
    startMs: now - (220 * stepMs),
    count: 220,
    stepMs,
    startPrice: 1.2
  });
  const overlap = firstBars.slice(-4).map((bar, idx) => (
    idx === 3
      ? { ...bar, c: Number((bar.c + 0.0003).toFixed(6)), h: Number((bar.h + 0.0003).toFixed(6)) }
      : { ...bar }
  ));
  const tailStartPrice = overlap[overlap.length - 1].c;
  const newBars = buildBars({
    startMs: firstBars[firstBars.length - 1].t + stepMs,
    count: 2,
    stepMs,
    startPrice: tailStartPrice
  });
  const secondBars = [...overlap, ...newBars];
  let callCount = 0;
  const storage = createLocalStorageMock();
  const ChartEngine = loadChartEngine({ localStorage: storage.localStorage });
  const engine = new ChartEngine({
    getHistorySeries: async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: true,
          bars: firstBars,
          fetchedAtMs: now,
          brokerId: 'mt5',
          accountId: 'ACC-001'
        };
      }
      return {
        ok: true,
        bars: secondBars,
        fetchedAtMs: now + 20_000,
        brokerId: 'mt5',
        accountId: 'ACC-001'
      };
    },
    nowMs: () => now,
    maxBars: 600
  });

  const sessionId = engine.startSession({ symbol: 'EURUSD', timeframe: '1m', barsBackfill: 220 });
  await sleep(50);
  const before = engine.getSnapshot(sessionId, { barsLimit: 600 });
  assert.ok(before);
  const beforeLastTs = before.barsTail[before.barsTail.length - 1].t;

  now += 20_000;
  await engine.refreshSessionsForSymbol('EURUSD', ['1m'], { force: true });
  const after = engine.getSnapshot(sessionId, { barsLimit: 600 });
  assert.ok(after);
  const afterLastTs = after.barsTail[after.barsTail.length - 1].t;
  assert.equal(after.barCount >= before.barCount, true);
  assert.equal(afterLastTs > beforeLastTs, true, 'incremental merge should append newer bars');

  const telemetry = engine.getFrameCacheTelemetry();
  assert.equal(telemetry.fetchMix.full >= 1, true);
  assert.equal(telemetry.fetchMix.incremental >= 1, true);
  assert.equal(telemetry.partitions.includes('mt5|acc-001'), true);
});

test('chart engine records persisted frame cache flush failures with explicit warning signal', async () => {
  const now = 1_740_000_000_000;
  const bars = buildBars({
    startMs: now - (80 * resolutionMapMs['5m']),
    count: 80,
    stepMs: resolutionMapMs['5m'],
    startPrice: 1.3
  });
  const storage = createLocalStorageMock({}, { throwOnSet: 'disk full' });
  const ChartEngine = loadChartEngine({ localStorage: storage.localStorage });
  const warnCalls = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnCalls.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    const engine = new ChartEngine({
      getHistorySeries: async () => ({
        ok: true,
        bars,
        fetchedAtMs: now,
        brokerId: 'tradelocker',
        accountId: 'demo'
      }),
      nowMs: () => now
    });
    const sessionId = engine.startSession({ symbol: 'GBPUSD', timeframe: '5m', barsBackfill: 80 });
    await sleep(1_350);
    const telemetry = engine.getFrameCacheTelemetry();
    assert.equal(telemetry.persist.flushFailures >= 1, true);
    assert.equal(String(telemetry.persist.lastFlushError || '').toLowerCase().includes('disk full'), true);
    assert.equal(warnCalls.some((line) => line.includes('frame cache persist failed')), true);

    const clearRes = engine.clearPersistedFrameCache({ dropSessionBars: true });
    assert.equal(clearRes.ok, true);
    const snap = engine.getSnapshot(sessionId, { barsLimit: 20 });
    assert.ok(snap);
    assert.equal(snap.barCount, 0);
  } finally {
    console.warn = originalWarn;
  }
});

test('app publishes chart frame cache telemetry and monitor exposes clear controls', () => {
  const app = read('App.tsx');
  const monitor = read('components/MonitorInterface.tsx');
  assert.equal(app.includes('const chartFrameCache = chartEngine.getFrameCacheTelemetry();'), true);
  assert.equal(app.includes('chartFrameCache,'), true);
  assert.equal(app.includes('onClearSnapshotFrameCache={clearSnapshotFrameCache}'), true);
  assert.equal(monitor.includes('title="Snapshot Frame Cache"'), true);
  assert.equal(monitor.includes('Clear Cache'), true);
  assert.equal(monitor.includes('Clear + Reset'), true);
});

test('app performs startup snapshot prewarm and snapshot UI keeps freshness badges', () => {
  const app = read('App.tsx');
  const ui = read('components/SnapshotInterface.tsx');
  assert.equal(app.includes('const snapshotStartupPrewarmRef = React.useRef<{ key: string; atMs: number } | null>(null);'), true);
  assert.equal(app.includes("await ensureConnect('startup_snapshot_prewarm');"), true);
  assert.equal(app.includes('chartEngine.refreshSessionsForSymbol(symbol, activeTimeframes, {'), true);
  assert.equal(ui.includes('const getFreshnessTargetMs = (timeframe: string) => {'), true);
  assert.equal(ui.includes('const freshnessBadges = useMemo(() => {'), true);
});
