import type { AcademyCase, AcademyLesson, AcademySymbolLearning, LearningGraphDiffSnapshot, LearningGraphFilters, LearningGraphSnapshot } from '../types';
import { WorkerTaskRouter } from './workerTaskRouter';
import { runWorkerTaskWithFallback } from './workerFallbackPolicy';
import { buildAcademyLearningGraph } from './academyLearningGraph';
import { buildLearningGraphDiffSnapshot } from './academyLearningGraphDiffService';
import { buildLearningGraphEdgeBundleMap, type LearningGraphEdgeBundleResult } from './learningGraphEdgeBundling';

const router = new WorkerTaskRouter();
let workerRef: Worker | null = null;
let workerBound = false;
let workerDisabled = false;

const ensureWorker = () => {
  if (workerDisabled) return null;
  if (!workerRef) {
    try {
      workerRef = new Worker(new URL('../workers/academyLearningGraph.worker.ts', import.meta.url), { type: 'module' });
      workerBound = false;
    } catch {
      workerDisabled = true;
      workerRef = null;
      return null;
    }
  }
  if (workerRef && !workerBound) {
    workerRef.addEventListener('message', (event) => router.handleWorkerMessage(event.data));
    workerRef.addEventListener('error', () => {
      workerDisabled = true;
      try {
        workerRef?.terminate();
      } catch {
        // ignore
      }
      workerRef = null;
    });
    workerBound = true;
  }
  return workerRef;
};

type WorkerBuildGraphInput = {
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings: AcademySymbolLearning[];
  filters: LearningGraphFilters | null;
};

export const buildLearningGraphSnapshotWithWorker = async (input: WorkerBuildGraphInput) => {
  const taskId = `academy_graph_snapshot_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const fallback = () => buildAcademyLearningGraph(input);
  const workerRes = await runWorkerTaskWithFallback<WorkerBuildGraphInput, LearningGraphSnapshot>({
    domain: 'academy_learning_graph_snapshot',
    router,
    ensureWorker,
    envelope: {
      id: taskId,
      type: 'buildLearningGraphSnapshot',
      timeoutMs: 4_000,
      payload: input
    },
    fallback
  });
  return {
    snapshot: workerRes.data || fallback(),
    fallbackUsed: workerRes.fallbackUsed
  };
};

export const buildLearningGraphDiffWithWorker = async (input: {
  base: LearningGraphSnapshot;
  compare: LearningGraphSnapshot;
}) => {
  const taskId = `academy_graph_diff_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const fallback = () => buildLearningGraphDiffSnapshot(input);
  const workerRes = await runWorkerTaskWithFallback<typeof input, LearningGraphDiffSnapshot>({
    domain: 'academy_learning_graph_diff',
    router,
    ensureWorker,
    envelope: {
      id: taskId,
      type: 'buildLearningGraphDiff',
      timeoutMs: 3_500,
      payload: input
    },
    fallback
  });
  return {
    diff: workerRes.data || fallback(),
    fallbackUsed: workerRes.fallbackUsed
  };
};

export const buildLearningGraphBundleWithWorker = async (input: {
  snapshot: LearningGraphSnapshot;
  zoomBand: 'far' | 'mid' | 'near';
}) => {
  const taskId = `academy_graph_bundle_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const fallback = () => buildLearningGraphEdgeBundleMap(input);
  const workerRes = await runWorkerTaskWithFallback<typeof input, LearningGraphEdgeBundleResult>({
    domain: 'academy_learning_graph_bundle',
    router,
    ensureWorker,
    envelope: {
      id: taskId,
      type: 'buildLearningGraphBundle',
      timeoutMs: 2_500,
      payload: input
    },
    fallback
  });
  return {
    bundle: workerRes.data || fallback(),
    fallbackUsed: workerRes.fallbackUsed
  };
};
