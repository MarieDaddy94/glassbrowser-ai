const test = require('node:test');
const assert = require('node:assert/strict');

const modPromise = import('../services/queueMetrics.js');

test('queue metrics track max depth and wait', async () => {
  const { createQueueMetrics } = await modPromise;
  const metrics = createQueueMetrics();

  metrics.noteDepth(1);
  metrics.noteDepth(4);
  metrics.noteDepth(2);

  metrics.noteWait(50);
  metrics.noteWait(10);
  metrics.noteWait(75);

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.maxDepth, 4);
  assert.equal(snapshot.maxWaitMs, 75);
});

test('queue metrics reset clears maxima', async () => {
  const { createQueueMetrics } = await modPromise;
  const metrics = createQueueMetrics();

  metrics.noteDepth(3);
  metrics.noteWait(120);
  metrics.reset();

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.maxDepth, 0);
  assert.equal(snapshot.maxWaitMs, 0);
});
