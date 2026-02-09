const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Backtester routes heavy replay/stat workloads through worker clients with local fallback', () => {
  const source = read('components/BacktesterInterface.tsx');

  assert.equal(source.includes('runBacktestSimulationWorker'), true);
  assert.equal(source.includes('runBacktestAnalysisWorker'), true);
  assert.equal(source.includes('aggregateReplayWorker'), true);
  assert.equal(source.includes('aggregateReplayLocal'), true);

  assert.equal(source.includes('const WORKER_TRADE_THRESHOLD = 4000;'), true);
  assert.equal(source.includes('const REPLAY_AGG_WORKER_THRESHOLD = 2000;'), true);
  assert.equal(source.includes('const useWorkerCompute = bars.length >= WORKER_TRADE_THRESHOLD;'), true);
  assert.equal(source.includes('const replayAggregationWorkerEnabled = replayTrades.length >= REPLAY_AGG_WORKER_THRESHOLD;'), true);

  assert.equal(source.includes('runBacktestSimulationWorker({'), true);
  assert.equal(source.includes('runBacktestAnalysisWorker({'), true);
  assert.equal(source.includes('aggregateReplayWorker({'), true);
  assert.equal(source.includes('setWorkerReplayAggregation(aggregateReplayLocal(replayTrades, resolution));'), true);
  assert.equal(source.includes('const fallback = await runOptimizerLocal(optBars);'), true);
});

test('backtest worker client is queue-budgeted and supports cancellation/error fallback paths', () => {
  const source = read('services/backtestComputeWorkerClient.ts');
  assert.equal(source.includes("const QUEUE_BUDGET_NAME = 'backtest.worker.queue';"), true);
  assert.equal(source.includes('const WORKER_QUEUE_MAX = 120;'), true);
  assert.equal(source.includes('cacheBudgetManager.register({'), true);
  assert.equal(source.includes("handle?.worker.postMessage({ type: 'cancel', requestId });"), true);
  assert.equal(source.includes('queuedTask.reject(new Error(\'Worker queue budget exceeded.\'));'), true);
});
