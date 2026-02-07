export function createQueueMetrics() {
  let maxDepth = 0;
  let maxWaitMs = 0;

  const noteDepth = (depth) => {
    const next = Number(depth);
    if (!Number.isFinite(next)) return;
    if (next > maxDepth) maxDepth = next;
  };

  const noteWait = (waitMs) => {
    const next = Number(waitMs);
    if (!Number.isFinite(next)) return;
    if (next > maxWaitMs) maxWaitMs = next;
  };

  const snapshot = () => ({ maxDepth, maxWaitMs });

  const reset = () => {
    maxDepth = 0;
    maxWaitMs = 0;
  };

  return {
    noteDepth,
    noteWait,
    snapshot,
    reset
  };
}
