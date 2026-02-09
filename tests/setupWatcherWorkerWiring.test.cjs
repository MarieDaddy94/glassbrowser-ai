const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('setup watcher evaluations run through worker router with timeout + fallback policy', () => {
  const source = read('services/setupWatcherWorkerClient.ts');
  assert.equal(source.includes('new WorkerTaskRouter()'), true);
  assert.equal(source.includes('runWorkerTaskWithFallback'), true);
  assert.equal(source.includes('domain: "setup_watcher"'), true);
  assert.equal(source.includes('type: "evaluateWatchers"'), true);
  assert.equal(source.includes('timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : 3_500'), true);
  assert.equal(source.includes('fallback: async () => {'), true);
  assert.equal(source.includes('evaluateWatchersFallback(input)'), true);
});

test('setup watcher worker path supports cancellation and empty fast-return when aborted', () => {
  const source = read('services/setupWatcherWorkerClient.ts');
  const router = read('services/workerTaskRouter.ts');
  assert.equal(source.includes('signal?: AbortSignal | null;'), true);
  assert.equal(source.includes('if (input.signal?.aborted) return [];'), true);
  assert.equal(source.includes('router.cancel(taskId, "setup watcher canceled");'), true);
  assert.equal(source.includes('input.signal?.addEventListener("abort", cancel, { once: true });'), true);
  assert.equal(router.includes('cancel(id: string, reason = "worker task canceled")'), true);
});

test('App setup watcher flows call evaluateWatchersWorker on both chart-close and background ticks', () => {
  const app = read('App.tsx');
  const hits = app.match(/evaluateWatchersWorker\(\{/g) || [];
  assert.equal(hits.length >= 2, true);
  assert.equal(app.includes("ingestSetupSignals(filteredSignals, 'native_chart');"), true);
  assert.equal(app.includes("ingestSetupSignals(filteredSignals, 'background');"), true);
});
