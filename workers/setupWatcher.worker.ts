import { evaluateSetupWatchers } from "../services/setupWatcherService";
import type { SetupWatcher } from "../types";
import type { Candle } from "../services/backtestEngine";

type SetupWatcherState = {
  lastBarTs?: number;
  pending?: {
    signalIndex: number;
    entryIndex: number;
    side: "BUY" | "SELL";
    signalBarTime: number;
  };
};

type EvaluateWatchersPayload = {
  watchers: SetupWatcher[];
  bars: Candle[];
  symbol: string;
  timeframe: string;
  stateEntries?: Array<[string, SetupWatcherState]>;
};

const toStateMap = (entries: unknown) => {
  const map = new Map<string, SetupWatcherState>();
  if (!Array.isArray(entries)) return map;
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const id = String(entry[0] || "").trim();
    if (!id) continue;
    const value = entry[1];
    if (value && typeof value === "object") {
      map.set(id, value as SetupWatcherState);
    } else {
      map.set(id, {});
    }
  }
  return map;
};

self.onmessage = (evt: MessageEvent) => {
  const envelope = evt?.data || {};
  const id = String(envelope?.id || "");
  const type = String(envelope?.type || "");
  try {
    if (type === "evaluateWatchers") {
      const payload = (envelope?.payload || {}) as EvaluateWatchersPayload;
      const watchers = Array.isArray(payload.watchers) ? payload.watchers : [];
      const bars = Array.isArray(payload.bars) ? payload.bars : [];
      const symbol = String(payload.symbol || "").trim();
      const timeframe = String(payload.timeframe || "").trim();
      const stateMap = toStateMap(payload.stateEntries);
      const signals = evaluateSetupWatchers(watchers, bars, symbol, timeframe, stateMap);
      (self as any).postMessage({
        id,
        ok: true,
        data: {
          signals,
          stateEntries: Array.from(stateMap.entries())
        }
      });
      return;
    }
    if (type === "evaluateBatch") {
      const payload = envelope?.payload || {};
      const watchers = Array.isArray(payload?.watchers) ? payload.watchers : [];
      const symbol = String(payload?.symbol || "").trim();
      const result = watchers.map((watcher: any) => ({
        id: watcher?.id || null,
        symbol,
        active: watcher?.enabled !== false
      }));
      (self as any).postMessage({
        id,
        ok: true,
        data: { result }
      });
      return;
    }
    (self as any).postMessage({ id, ok: false, error: `Unsupported worker task: ${type}` });
  } catch (err: any) {
    (self as any).postMessage({
      id,
      ok: false,
      error: err?.message ? String(err.message) : "setupWatcher worker failed"
    });
  }
};

export {};
