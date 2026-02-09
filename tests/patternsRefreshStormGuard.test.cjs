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
    setTimeout,
    clearTimeout,
    window: { setTimeout, clearTimeout }
  };
  vm.runInNewContext(transpiled, sandbox, { filename: `${relPath}.compiled.cjs` });
  return mod.exports;
};

test('pattern refresh coalescer collapses rapid schedules into one run', async () => {
  const { createPatternRefreshCoalescer } = loadTsModule('services/patternRefreshCoalescer.ts');
  let runs = 0;
  let coalesced = 0;
  let lastPayload = null;
  const timers = [];
  const clearCalls = [];
  const coalescer = createPatternRefreshCoalescer({
    delayMs: 25,
    onCoalesced: () => {
      coalesced += 1;
    },
    onRun: async (payload) => {
      runs += 1;
      lastPayload = payload;
    },
    setTimer: (handler, delay) => {
      const handle = setTimeout(handler, delay);
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      clearCalls.push(handle);
      clearTimeout(handle);
    }
  });

  coalescer.schedule({ sequence: 1 });
  coalescer.schedule({ sequence: 2 });
  coalescer.schedule({ sequence: 3 });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(runs, 1, 'expected one coalesced pattern refresh run');
  assert.equal(coalesced >= 2, true, 'expected coalesced callback for collapsed schedules');
  assert.equal(lastPayload.sequence, 3, 'latest payload should win');
  assert.equal(clearCalls.length >= 2, true, 'pending timers should be cleared when coalescing');
  coalescer.dispose();
});

test('App wires pattern watch sync through coalescer and broker-backed chart refresh path', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("import { createPatternRefreshCoalescer } from './services/patternRefreshCoalescer';"), true);
  assert.equal(app.includes('const patternWatchRefreshCoalescer = React.useMemo(() => {'), true);
  assert.equal(app.includes("recordPerf('patternWatchSyncCoalesced');"), true);
  assert.equal(app.includes('patternWatchRefreshCoalescer.schedule({'), true);
  assert.equal(app.includes('await chartEngine.addWatch({'), true);
  assert.equal(app.includes('requestChartRefresh(fetches);'), true);
  assert.equal(app.includes("requestBrokerWithAudit('getHistorySeries', { ...args, aggregate: args?.aggregate ?? true })"), true);
});

test('Patterns interface remains UI-only and avoids direct broker calls', () => {
  const source = read('components/PatternsInterface.tsx');
  assert.equal(source.includes('window.glass'), false);
  assert.equal(source.includes('broker.request'), false);
  assert.equal(source.includes('getHistorySeries'), false);
});

