import { evaluateSetupWatchers } from "./setupWatcherService";
import type { SetupSignal, SetupWatcher } from "../types";
import type { Candle } from "./backtestEngine";
import { WorkerTaskRouter } from "./workerTaskRouter";
import { runWorkerTaskWithFallback } from "./workerFallbackPolicy";

type SetupWatcherState = {
  lastBarTs?: number;
  pending?: {
    signalIndex: number;
    entryIndex: number;
    side: "BUY" | "SELL";
    signalBarTime: number;
  };
};

type EvaluateWatchersInput = {
  watchers: SetupWatcher[];
  bars: Candle[];
  symbol: string;
  timeframe: string;
  stateMap: Map<string, SetupWatcherState>;
  timeoutMs?: number;
};

const router = new WorkerTaskRouter();
let workerRef: Worker | null = null;
let listenerBound = false;
let workerDisabled = false;

const ensureWorker = () => {
  if (workerDisabled) return null;
  if (!workerRef) {
    try {
      workerRef = new Worker(new URL("../workers/setupWatcher.worker.ts", import.meta.url), { type: "module" });
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

const evaluateWatchersFallback = (input: EvaluateWatchersInput): SetupSignal[] => {
  return evaluateSetupWatchers(
    input.watchers,
    input.bars,
    input.symbol,
    input.timeframe,
    input.stateMap
  );
};

export const evaluateWatchersWorker = async (input: EvaluateWatchersInput): Promise<SetupSignal[]> => {
  const stateEntries = Array.from(input.stateMap.entries());
  const taskId = `setup_watchers_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const workerRes = await runWorkerTaskWithFallback<{
    watchers: SetupWatcher[];
    bars: Candle[];
    symbol: string;
    timeframe: string;
    stateEntries: Array<[string, SetupWatcherState]>;
  }, {
    signals?: SetupSignal[];
    stateEntries?: Array<[string, SetupWatcherState]>;
  }>({
    domain: "setup_watcher",
    router,
    ensureWorker,
    envelope: {
      id: taskId,
      type: "evaluateWatchers",
      timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : 3_500,
      payload: {
        watchers: input.watchers,
        bars: input.bars,
        symbol: input.symbol,
        timeframe: input.timeframe,
        stateEntries
      }
    },
    fallback: async () => {
      const signals = evaluateWatchersFallback(input);
      return { signals, stateEntries: Array.from(input.stateMap.entries()) };
    }
  });
  const data = workerRes.data;
  const nextSignals = Array.isArray(data?.signals) ? data.signals : null;
  const nextStateEntries = Array.isArray(data?.stateEntries) ? data.stateEntries : null;
  if (!nextSignals || !nextStateEntries) {
    return evaluateWatchersFallback(input);
  }

  input.stateMap.clear();
  for (const entry of nextStateEntries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const id = String(entry[0] || "").trim();
    if (!id) continue;
    const value = entry[1];
    if (value && typeof value === "object") {
      input.stateMap.set(id, value as SetupWatcherState);
    } else {
      input.stateMap.set(id, {});
    }
  }
  return nextSignals;
};
