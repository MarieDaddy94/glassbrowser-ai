import type { BacktestStats, BacktestTrade } from "./backtestEngine";
import { summarizeTrades, resolutionToMs } from "./backtestEngine";
import { WorkerTaskRouter } from "./workerTaskRouter";
import { runWorkerTaskWithFallback } from "./workerFallbackPolicy";

export type ReplayAggregationPerformance = {
  curve: Array<{ index: number; equity: number }>;
  netR: number;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  avgR: number | null;
  medianR: number | null;
  avgHoldBars: number | null;
  avgHoldMs: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
};

export type ReplayAggregationResult = {
  stats: BacktestStats;
  performance: ReplayAggregationPerformance;
};

type ReplayAggregationInput = {
  trades: BacktestTrade[];
  resolution: string;
  timeoutMs?: number;
};

const router = new WorkerTaskRouter();
let workerRef: Worker | null = null;
let listenerBound = false;
let workerDisabled = false;

const computeReplayPerformanceFallback = (replayTrades: BacktestTrade[], resolution: string): ReplayAggregationPerformance => {
  const closed = replayTrades.filter((trade) => trade.outcome === "win" || trade.outcome === "loss");
  if (closed.length === 0) {
    return {
      curve: [],
      netR: 0,
      maxDrawdown: 0,
      maxDrawdownPct: null,
      avgR: null,
      medianR: null,
      avgHoldBars: null,
      avgHoldMs: null,
      maxWinStreak: 0,
      maxLossStreak: 0
    };
  }

  const sorted = [...closed].sort((a, b) => a.entryIndex - b.entryIndex);
  const curve: Array<{ index: number; equity: number }> = [];
  const rValues: number[] = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let totalHoldBars = 0;
  let holdCount = 0;

  for (const trade of sorted) {
    const r = Number.isFinite(Number(trade.rMultiple)) ? Number(trade.rMultiple) : 0;
    rValues.push(r);
    equity += r;
    curve.push({ index: trade.entryIndex, equity });
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);

    if (trade.outcome === "win") {
      winStreak += 1;
      lossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (trade.outcome === "loss") {
      lossStreak += 1;
      winStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    }

    if (trade.exitIndex != null && trade.entryIndex != null) {
      totalHoldBars += Math.max(0, trade.exitIndex - trade.entryIndex);
      holdCount += 1;
    }
  }

  const avgR = rValues.length > 0 ? rValues.reduce((acc, value) => acc + value, 0) / rValues.length : null;
  const sortedR = [...rValues].sort((a, b) => a - b);
  let medianR: number | null = null;
  if (sortedR.length > 0) {
    const mid = Math.floor(sortedR.length / 2);
    medianR = sortedR.length % 2 === 0 ? (sortedR[mid - 1] + sortedR[mid]) / 2 : sortedR[mid];
  }

  const avgHoldBars = holdCount > 0 ? totalHoldBars / holdCount : null;
  const resMs = resolutionToMs(resolution);
  const avgHoldMs = resMs && avgHoldBars != null ? avgHoldBars * resMs : null;
  const maxDrawdownPct = peak > 0 ? maxDrawdown / peak : null;

  return {
    curve,
    netR: equity,
    maxDrawdown,
    maxDrawdownPct,
    avgR,
    medianR,
    avgHoldBars,
    avgHoldMs,
    maxWinStreak,
    maxLossStreak
  };
};

const aggregateReplayFallback = (input: ReplayAggregationInput): ReplayAggregationResult => {
  return {
    stats: summarizeTrades(input.trades || []),
    performance: computeReplayPerformanceFallback(input.trades || [], input.resolution)
  };
};

export const aggregateReplayLocal = (trades: BacktestTrade[], resolution: string): ReplayAggregationResult =>
  aggregateReplayFallback({ trades, resolution });

const ensureWorker = () => {
  if (workerDisabled) return null;
  if (!workerRef) {
    try {
      workerRef = new Worker(new URL("../workers/replayAggregation.worker.ts", import.meta.url), { type: "module" });
      listenerBound = false;
    } catch {
      workerDisabled = true;
      workerRef = null;
      return null;
    }
  }
  if (workerRef && !listenerBound) {
    workerRef.addEventListener("message", (event) => {
      router.handleWorkerMessage(event.data);
    });
    workerRef.addEventListener("error", () => {
      workerDisabled = true;
      try {
        workerRef?.terminate();
      } catch {
        // ignore
      }
      workerRef = null;
    });
    listenerBound = true;
  }
  return workerRef;
};

export const aggregateReplayWorker = async (input: ReplayAggregationInput): Promise<ReplayAggregationResult> => {
  const resolutionMs = resolutionToMs(input.resolution);
  const taskId = `replay_agg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const workerRes = await runWorkerTaskWithFallback<{
    trades: BacktestTrade[];
    resolutionMs: number | null;
  }, ReplayAggregationResult>({
    domain: "replay_aggregation",
    router,
    ensureWorker,
    envelope: {
      id: taskId,
      type: "aggregateReplayStats",
      timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : 3_000,
      payload: {
        trades: Array.isArray(input.trades) ? input.trades : [],
        resolutionMs
      }
    },
    fallback: () => aggregateReplayFallback(input)
  });
  if (!workerRes.data) return aggregateReplayFallback(input);
  return workerRes.data;
};
