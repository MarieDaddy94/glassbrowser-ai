import { buildAcademyLearningGraph } from '../services/academyLearningGraph';
import { buildLearningGraphDiffSnapshot } from '../services/academyLearningGraphDiffService';
import { buildLearningGraphEdgeBundleMap } from '../services/learningGraphEdgeBundling';

self.onmessage = (event: MessageEvent) => {
  const envelope = event?.data || {};
  const id = String(envelope?.id || '').trim();
  const type = String(envelope?.type || '').trim();
  const payload = envelope?.payload || {};
  try {
    if (type === 'buildLearningGraphSnapshot') {
      const data = buildAcademyLearningGraph(payload);
      (self as any).postMessage({ id, ok: true, data });
      return;
    }
    if (type === 'buildLearningGraphDiff') {
      const data = buildLearningGraphDiffSnapshot(payload);
      (self as any).postMessage({ id, ok: true, data });
      return;
    }
    if (type === 'buildLearningGraphBundle') {
      const data = buildLearningGraphEdgeBundleMap(payload);
      (self as any).postMessage({ id, ok: true, data });
      return;
    }
    (self as any).postMessage({ id, ok: false, error: `Unsupported worker task: ${type}` });
  } catch (err: any) {
    (self as any).postMessage({
      id,
      ok: false,
      error: err?.message ? String(err.message) : 'academy learning graph worker failed'
    });
  }
};

export {};
