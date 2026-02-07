import type { BacktestTrade } from "../services/backtestEngine";
import { summarizeTrades } from "../services/backtestEngine";

const computeReplayPerformance = (replayTrades: BacktestTrade[], resolutionMs: number | null) => {
  const closed = replayTrades.filter((trade) => trade.outcome === "win" || trade.outcome === "loss");
  if (closed.length === 0) {
    return {
      curve: [] as Array<{ index: number; equity: number }>,
      netR: 0,
      maxDrawdown: 0,
      maxDrawdownPct: null as number | null,
      avgR: null as number | null,
      medianR: null as number | null,
      avgHoldBars: null as number | null,
      avgHoldMs: null as number | null,
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
  const avgHoldMs = resolutionMs && avgHoldBars != null ? avgHoldBars * resolutionMs : null;
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

self.onmessage = (evt: MessageEvent) => {
  const envelope = evt?.data || {};
  const id = String(envelope?.id || "");
  const type = String(envelope?.type || "");
  try {
    if (type === "aggregateReplayStats") {
      const payload = envelope?.payload || {};
      const trades = Array.isArray(payload?.trades) ? payload.trades as BacktestTrade[] : [];
      const resolutionMsRaw = Number(payload?.resolutionMs || 0);
      const resolutionMs = Number.isFinite(resolutionMsRaw) && resolutionMsRaw > 0 ? resolutionMsRaw : null;
      (self as any).postMessage({
        id,
        ok: true,
        data: {
          stats: summarizeTrades(trades),
          performance: computeReplayPerformance(trades, resolutionMs)
        }
      });
      return;
    }
    (self as any).postMessage({ id, ok: false, error: `Unsupported worker task: ${type}` });
  } catch (err: any) {
    (self as any).postMessage({
      id,
      ok: false,
      error: err?.message ? String(err.message) : "replayAggregation worker failed"
    });
  }
};

export {};
