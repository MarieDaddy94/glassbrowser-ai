import type {
  BacktestOptimizationHistory,
  BacktestOptimizationOptions,
  BacktestOptimizationRequest,
  BacktestOptimizationResult
} from './backtestResearchService';
import type {
  BacktestSetupId,
  BacktestStats,
  BacktestTrade,
  BiasLabel,
  Candle,
  BreakRetestConfig,
  FvgRetraceConfig,
  MeanReversionConfig,
  RangeBreakoutConfig,
  TrendPullbackConfig
} from './backtestEngine';
import type { ExecutionConfig } from './executionModel';
import { getCacheBudgetManager } from './cacheBudgetManager';

export type OptimizerSort = 'netR' | 'expectancy' | 'profitFactor' | 'winRate' | 'maxDrawdown';

export type OptimizerResult = {
  id: string;
  setup: BacktestSetupId;
  stats: BacktestStats;
  netR: number;
  maxDrawdown: number;
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  params: Record<string, any>;
};

export type SetupOptimizerSummary = {
  attempted: number;
  estimated: number;
  durationMs: number;
  truncated: boolean;
};

export type SetupOptimizerResponse = {
  ok: boolean;
  results: OptimizerResult[];
  summary: SetupOptimizerSummary;
  error?: string;
};

export type SetupOptimizerPayload = {
  bars: Candle[];
  tieBreaker: 'sl' | 'tp';
  execution: ExecutionConfig;
  confluence: {
    enabled: boolean;
    apply: boolean;
    biasReference: 'signal' | 'entry';
    allowNeutral: boolean;
    entryTiming: ExecutionConfig['entryTiming'];
    htfBiasByIndex?: BiasLabel[];
  };
  maxCombos: number;
  sortBy: OptimizerSort;
  topN: number;
  setups: Array<{
    id: BacktestSetupId;
    base: RangeBreakoutConfig | BreakRetestConfig | FvgRetraceConfig | TrendPullbackConfig | MeanReversionConfig;
    grid: Record<string, any[]>;
  }>;
};

export type OptimizationWorkerPayload = {
  request: BacktestOptimizationRequest;
  bars: Candle[];
  history?: BacktestOptimizationHistory;
  runId?: string;
  startedAtMs?: number;
  progressInterval?: number;
  includeResults?: boolean;
};

export type BacktestSimulationPayload = {
  bars: Candle[];
  tieBreaker: 'sl' | 'tp';
  execution: ExecutionConfig;
  confluence: {
    enabled: boolean;
    apply: boolean;
    biasReference: 'signal' | 'entry';
    allowNeutral: boolean;
    entryTiming: ExecutionConfig['entryTiming'];
    htfBiasByIndex?: BiasLabel[];
  };
  analysis?: {
    replayCutoffIndex: number;
    validation: {
      enabled: boolean;
      mode: 'percent' | 'last_days';
      splitPercent: number;
      lastDays: number;
      useReplayWindow: boolean;
    };
    walkForward: {
      enabled: boolean;
      trainDays: number;
      testDays: number;
      stepDays: number;
      minTrades: number;
      useReplayWindow: boolean;
    };
  };
  setups: {
    range?: RangeBreakoutConfig;
    breakRetest?: BreakRetestConfig;
    fvg?: FvgRetraceConfig;
    trend?: TrendPullbackConfig;
    mean?: MeanReversionConfig;
  };
};

export type BacktestSimulationResult = {
  ok: boolean;
  trades: BacktestTrade[];
  analysis?: {
    validation: any | null;
    walkForward: any | null;
  };
  error?: string;
};

export type BacktestAnalysisPayload = {
  bars: Candle[];
  trades: BacktestTrade[];
  analysis: NonNullable<BacktestSimulationPayload['analysis']>;
};

export type BacktestAnalysisResult = {
  ok: boolean;
  analysis?: {
    validation: any | null;
    walkForward: any | null;
  };
  error?: string;
};

type WorkerProgress = {
  done: number;
  total: number;
  label?: string;
};

type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: any) => void;
  onProgress?: (progress: WorkerProgress) => void;
  cancelTimer?: number;
  workerId?: number;
};

type WorkerTask = {
  requestId: string;
  message: any;
  onProgress?: (progress: WorkerProgress) => void;
  shouldCancel?: () => boolean;
  resolve: (result: any) => void;
  reject: (error: any) => void;
};

type WorkerHandle = {
  id: number;
  worker: Worker;
  busy: boolean;
};

const pending = new Map<string, PendingRequest>();
const queued: WorkerTask[] = [];
const workerPool: WorkerHandle[] = [];
const queueBudgetMirror = new Map<string, { createdAtMs: number }>();
const QUEUE_BUDGET_NAME = 'backtest.worker.queue';
const WORKER_QUEUE_MAX = 120;
const cacheBudgetManager = getCacheBudgetManager();
cacheBudgetManager.register({
  name: QUEUE_BUDGET_NAME,
  maxEntries: WORKER_QUEUE_MAX,
  maxAgeMs: 5 * 60_000
});

const getPoolSize = () => {
  if (typeof navigator === 'undefined') return 1;
  const cores = Number(navigator.hardwareConcurrency || 0);
  if (!Number.isFinite(cores) || cores <= 0) return 1;
  if (cores >= 8) return 3;
  if (cores >= 4) return 2;
  return 1;
};

const scheduleCancelCheck = (
  requestId: string,
  shouldCancel: (() => boolean) | undefined,
  workerId: number
) => {
  if (!shouldCancel) return;
  const timer = window.setInterval(() => {
    try {
      if (!shouldCancel()) return;
      const handle = workerPool.find((item) => item.id === workerId);
      handle?.worker.postMessage({ type: 'cancel', requestId });
    } catch {
      // ignore cancel failures
    }
  }, 250);
  const entry = pending.get(requestId);
  if (entry) entry.cancelTimer = timer;
};

const handleWorkerMessage = (handle: WorkerHandle, event: MessageEvent<any>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  const requestId = String(message.requestId || '');
  if (!requestId) return;
  const entry = pending.get(requestId);
  if (!entry) return;

  if (message.type === 'progress') {
    entry.onProgress?.(message.progress || { done: 0, total: 0 });
    return;
  }

  if (entry.cancelTimer) {
    window.clearInterval(entry.cancelTimer);
  }
  pending.delete(requestId);
  handle.busy = false;
  dispatchQueued();

  if (message.type === 'result') {
    entry.resolve(message.result);
    return;
  }

  entry.reject(new Error(message.error || 'Worker failed.'));
};

const replaceWorker = (handle: WorkerHandle) => {
  try {
    handle.worker.terminate();
  } catch {
    // ignore terminate failures
  }
  handle.worker = new Worker(new URL('./backtestCompute.worker.ts', import.meta.url), { type: 'module' });
  handle.worker.addEventListener('message', (event: MessageEvent<any>) => handleWorkerMessage(handle, event));
  handle.worker.addEventListener('error', (event) => handleWorkerError(handle, event));
};

const handleWorkerError = (handle: WorkerHandle, event: any) => {
  const err = event?.message || 'Worker error.';
  for (const [key, entry] of pending.entries()) {
    if (entry.workerId !== handle.id) continue;
    if (entry.cancelTimer) {
      window.clearInterval(entry.cancelTimer);
    }
    entry.reject(new Error(err));
    pending.delete(key);
  }
  handle.busy = false;
  replaceWorker(handle);
  dispatchQueued();
};

const createWorkerHandle = (id: number): WorkerHandle => {
  const handle: WorkerHandle = {
    id,
    worker: new Worker(new URL('./backtestCompute.worker.ts', import.meta.url), { type: 'module' }),
    busy: false
  };
  handle.worker.addEventListener('message', (event: MessageEvent<any>) => handleWorkerMessage(handle, event));
  handle.worker.addEventListener('error', (event) => handleWorkerError(handle, event));
  return handle;
};

const ensurePool = () => {
  const target = getPoolSize();
  while (workerPool.length < target) {
    workerPool.push(createWorkerHandle(workerPool.length));
  }
};

const dispatchQueued = () => {
  if (queued.length === 0) return;
  ensurePool();
  for (const handle of workerPool) {
    if (queued.length === 0) break;
    if (handle.busy) continue;
    const task = queued.shift();
    if (!task) break;
    if (task.shouldCancel && task.shouldCancel()) {
      queueBudgetMirror.delete(task.requestId);
      cacheBudgetManager.setSize(QUEUE_BUDGET_NAME, queueBudgetMirror.size);
      task.reject(new Error('Worker task cancelled.'));
      continue;
    }
    queueBudgetMirror.delete(task.requestId);
    cacheBudgetManager.noteGet(QUEUE_BUDGET_NAME, task.requestId, true);
    cacheBudgetManager.setSize(QUEUE_BUDGET_NAME, queueBudgetMirror.size);
    handle.busy = true;
    pending.set(task.requestId, {
      resolve: task.resolve,
      reject: task.reject,
      onProgress: task.onProgress,
      workerId: handle.id
    });
    scheduleCancelCheck(task.requestId, task.shouldCancel, handle.id);
    handle.worker.postMessage(task.message);
  }
};

const enqueueTask = (task: WorkerTask) => {
  queued.push(task);
  queueBudgetMirror.set(task.requestId, { createdAtMs: Date.now() });
  cacheBudgetManager.noteSet(QUEUE_BUDGET_NAME, task.requestId);
  cacheBudgetManager.apply(QUEUE_BUDGET_NAME, queueBudgetMirror, (entry) => Number(entry?.createdAtMs || 0) || null);
  if (queueBudgetMirror.size < queued.length) {
    const allowed = new Set(queueBudgetMirror.keys());
    const retained: WorkerTask[] = [];
    for (const queuedTask of queued) {
      if (allowed.has(queuedTask.requestId)) {
        retained.push(queuedTask);
      } else {
        cacheBudgetManager.noteEviction(QUEUE_BUDGET_NAME, 1, 'lru');
        queuedTask.reject(new Error('Worker queue budget exceeded.'));
      }
    }
    queued.length = 0;
    queued.push(...retained);
  }
  cacheBudgetManager.setSize(QUEUE_BUDGET_NAME, queueBudgetMirror.size);
  dispatchQueued();
};

export async function runBacktestOptimizationWorker(
  payload: OptimizationWorkerPayload,
  options: BacktestOptimizationOptions = {}
): Promise<BacktestOptimizationResult> {
  const requestId = `worker_opt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const progressInterval = Number.isFinite(Number(options.progressInterval))
    ? Math.max(1, Math.floor(Number(options.progressInterval)))
    : undefined;

  return new Promise((resolve, reject) => {
    enqueueTask({
      requestId,
      onProgress: options.onProgress,
      shouldCancel: options.shouldCancel,
      resolve,
      reject,
      message: {
        type: 'optimize_request',
        requestId,
        payload: { ...payload, progressInterval, includeResults: options.includeResults === true }
      }
    });
  });
}

export async function runSetupOptimizerWorker(
  payload: SetupOptimizerPayload
): Promise<SetupOptimizerResponse> {
  const requestId = `worker_setup_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    enqueueTask({
      requestId,
      resolve,
      reject,
      message: {
        type: 'setup_optimizer_request',
        requestId,
        payload
      }
    });
  });
}

export async function runBacktestSimulationWorker(
  payload: BacktestSimulationPayload
): Promise<BacktestSimulationResult> {
  const requestId = `worker_sim_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    enqueueTask({
      requestId,
      resolve,
      reject,
      message: {
        type: 'simulate_request',
        requestId,
        payload
      }
    });
  });
}

export async function runBacktestAnalysisWorker(
  payload: BacktestAnalysisPayload
): Promise<BacktestAnalysisResult> {
  const requestId = `worker_analysis_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  return new Promise((resolve, reject) => {
    enqueueTask({
      requestId,
      resolve,
      reject,
      message: {
        type: 'analysis_request',
        requestId,
        payload
      }
    });
  });
}
