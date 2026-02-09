const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('health snapshot includes scheduler cadence stats for signal auto refresh task', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const schedulerStats = runtimeScheduler.getStats();'), true);
  assert.equal(app.includes('const signalSchedulerTask = (schedulerStats.tasks || []).find((entry) => entry.id === SIGNAL_AUTO_REFRESH_TASK_ID) || null;'), true);
  assert.equal(app.includes('scheduler: {'), true);
  assert.equal(app.includes('signalTaskId: SIGNAL_AUTO_REFRESH_TASK_ID,'), true);
  assert.equal(app.includes('runCount: signalSchedulerTask.runCount,'), true);
  assert.equal(app.includes('errorCount: signalSchedulerTask.errorCount,'), true);
});

test('perf snapshot includes broker coordinator dedupe/cache hit telemetry', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const coordinatorStats = brokerRequestCoordinator.getStats();'), true);
  assert.equal(app.includes('brokerCoordinatorCacheHits: coordinatorStats.cacheHits,'), true);
  assert.equal(app.includes('brokerCoordinatorDedupeHits: coordinatorStats.dedupeHits,'), true);
  assert.equal(app.includes('brokerCoordinatorCacheHitRate: coordinatorStats.cacheHitRate,'), true);
  assert.equal(app.includes('brokerCoordinatorDedupeRate: coordinatorStats.dedupeRate'), true);
});

test('monitor exposes scheduler and coordinator telemetry labels', () => {
  const monitor = read('components/MonitorInterface.tsx');
  assert.equal(monitor.includes('MetricCard title="Scheduler"'), true);
  assert.equal(monitor.includes('Coord Cache Hits'), true);
  assert.equal(monitor.includes('Coord Dedupe Hits'), true);
  assert.equal(monitor.includes('Coord Cache Rate'), true);
  assert.equal(monitor.includes('Coord Dedupe Rate'), true);
});

test('broker coordinator tracks dedupe/cache counters in coordinator stats', () => {
  const source = read('services/brokerRequestCoordinator.ts');
  assert.equal(source.includes('private requests = 0;'), true);
  assert.equal(source.includes('private cacheHits = 0;'), true);
  assert.equal(source.includes('private dedupeHits = 0;'), true);
  assert.equal(source.includes('this.requests += 1;'), true);
  assert.equal(source.includes('this.cacheHits += 1;'), true);
  assert.equal(source.includes('this.dedupeHits += 1;'), true);
  assert.equal(source.includes('cacheHitRate: requests > 0 ? cacheHits / requests : 0,'), true);
  assert.equal(source.includes('dedupeRate: requests > 0 ? dedupeHits / requests : 0'), true);
});
