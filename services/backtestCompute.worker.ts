/// <reference lib="webworker" />

import {
  runBacktestOptimizationOnBars,
  type BacktestOptimizationHistory,
  type BacktestOptimizationRequest
} from './backtestResearchService';
import {
  type BacktestSetupId,
  type BacktestTrade,
  type BacktestStats,
  type BiasLabel,
  type Candle,
  type BreakRetestConfig,
  type FvgRetraceConfig,
  type MeanReversionConfig,
  type RangeBreakoutConfig,
  type TrendPullbackConfig,
  generateBreakRetestTrades,
  generateFvgRetraceTrades,
  generateMeanReversionTrades,
  generateRangeBreakoutTrades,
  generateTrendPullbackTrades,
  simulateTrades,
  summarizeTrades
} from './backtestEngine';
import type { ExecutionConfig } from './executionModel';

type OptimizationBarsPayload = {
  request: BacktestOptimizationRequest;
  bars: Candle[];
  history?: BacktestOptimizationHistory;
  runId?: string;
  startedAtMs?: number;
  progressInterval?: number;
  includeResults?: boolean;
};

type OptimizerSort = 'netR' | 'expectancy' | 'profitFactor' | 'winRate' | 'maxDrawdown';

type OptimizerResult = {
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

type OptimizerSetupPayload = {
  id: BacktestSetupId;
  base: RangeBreakoutConfig | BreakRetestConfig | FvgRetraceConfig | TrendPullbackConfig | MeanReversionConfig;
  grid: Record<string, any[]>;
};

type OptimizerConfluence = {
  enabled: boolean;
  apply: boolean;
  biasReference: 'signal' | 'entry';
  allowNeutral: boolean;
  entryTiming: ExecutionConfig['entryTiming'];
  htfBiasByIndex?: BiasLabel[];
};

type SetupOptimizerPayload = {
  bars: Candle[];
  tieBreaker: 'sl' | 'tp';
  execution: ExecutionConfig;
  confluence: OptimizerConfluence;
  maxCombos: number;
  sortBy: OptimizerSort;
  topN: number;
  setups: OptimizerSetupPayload[];
};

type BacktestSimulationPayload = {
  bars: Candle[];
  tieBreaker: 'sl' | 'tp';
  execution: ExecutionConfig;
  confluence: OptimizerConfluence;
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

type BacktestSimulationAnalysis = NonNullable<BacktestSimulationPayload['analysis']>;
type BacktestAnalysisPayload = {
  bars: Candle[];
  trades: BacktestTrade[];
  analysis: BacktestSimulationAnalysis;
};

type WorkerRequest =
  | { type: 'optimize_request'; requestId: string; payload: OptimizationBarsPayload }
  | { type: 'setup_optimizer_request'; requestId: string; payload: SetupOptimizerPayload }
  | { type: 'simulate_request'; requestId: string; payload: BacktestSimulationPayload }
  | { type: 'analysis_request'; requestId: string; payload: BacktestAnalysisPayload }
  | { type: 'cancel'; requestId: string };

type WorkerResponse =
  | { type: 'progress'; requestId: string; progress: { done: number; total: number } }
  | { type: 'result'; requestId: string; result: any }
  | { type: 'error'; requestId: string; error: string };

const cancelledRequests = new Set<string>();

const computeEquityStats = (trades: Array<{ entryIndex: number; rMultiple?: number | null }>) => {
  if (!trades.length) return { netR: 0, maxDrawdown: 0 };
  const closed = trades.filter((trade) => trade.rMultiple != null);
  if (!closed.length) return { netR: 0, maxDrawdown: 0 };
  const sorted = [...closed].sort((a, b) => a.entryIndex - b.entryIndex);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of sorted) {
    const r = Number.isFinite(Number(trade.rMultiple)) ? Number(trade.rMultiple) : 0;
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return { netR: equity, maxDrawdown };
};

const buildGrid = <T extends Record<string, any>>(
  base: T,
  inputs: Partial<Record<keyof T, any[]>>,
  maxCombos: number
) => {
  let results: T[] = [base];
  for (const key of Object.keys(inputs) as Array<keyof T>) {
    const values = inputs[key];
    if (!values || values.length === 0) continue;
    const next: T[] = [];
    for (const item of results) {
      for (const value of values) {
        next.push({ ...item, [key]: value });
        if (next.length >= maxCombos) break;
      }
      if (next.length >= maxCombos) break;
    }
    results = next;
    if (results.length >= maxCombos) break;
  }
  return results;
};

const estimateCombos = (inputs: Record<string, any[]>) => {
  let count = 1;
  for (const values of Object.values(inputs)) {
    count *= Math.max(1, values.length || 0);
  }
  return count;
};

const applyConfluenceFilter = (
  trades: any[],
  confluence: OptimizerConfluence
) => {
  if (!confluence.apply || !confluence.enabled || !confluence.htfBiasByIndex) return trades;
  const biasSeries = confluence.htfBiasByIndex;
  return trades
    .map((trade) => {
      const refIndex =
        confluence.biasReference === 'signal'
          ? trade.signalIndex
          : confluence.entryTiming === 'signal_close'
            ? trade.signalIndex
            : trade.entryIndex;
      const bias: BiasLabel = biasSeries[refIndex] || 'neutral';
      const matches =
        bias === 'neutral'
          ? confluence.allowNeutral
          : (bias === 'bull' && trade.side === 'BUY') || (bias === 'bear' && trade.side === 'SELL');
      if (!matches) return null;
      return trade;
    })
    .filter(Boolean);
};

const buildReplayTrades = (trades: BacktestTrade[], cutoff: number) => {
  return trades
    .filter((trade) => trade.entryIndex <= cutoff)
    .map((trade) => {
      if (trade.exitIndex != null && trade.exitIndex <= cutoff) return trade;
      return { ...trade, outcome: 'open', exitIndex: undefined, exitReason: 'open', rMultiple: undefined };
    });
};

const findIndexAtOrAfter = (times: number[], target: number) => {
  let lo = 0;
  let hi = times.length - 1;
  let best = times.length;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] >= target) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
};

const computeValidationData = (
  bars: Candle[],
  trades: BacktestTrade[],
  replayCutoffIndex: number,
  cfg: BacktestSimulationAnalysis['validation']
) => {
  if (!cfg?.enabled || bars.length === 0) return null;
  const useReplay = cfg.useReplayWindow;
  const evalBars = useReplay ? bars.slice(0, Math.max(1, replayCutoffIndex + 1)) : bars;
  const evalTrades = useReplay ? buildReplayTrades(trades, replayCutoffIndex) : trades;
  if (evalBars.length < 10) return null;

  let splitIndex = Math.floor((evalBars.length - 1) * (cfg.splitPercent / 100));
  if (cfg.mode === 'last_days') {
    const lastBarTime = evalBars[evalBars.length - 1]?.t ?? 0;
    const lookbackMs = Math.max(1, Math.floor(Number(cfg.lastDays) || 1)) * 24 * 60 * 60 * 1000;
    const cutoff = lastBarTime - lookbackMs;
    splitIndex = 0;
    for (let i = 0; i < evalBars.length; i += 1) {
      if (evalBars[i].t >= cutoff) {
        splitIndex = Math.max(0, i - 1);
        break;
      }
    }
  }

  splitIndex = Math.max(1, Math.min(evalBars.length - 2, splitIndex));
  const splitTime = evalBars[splitIndex]?.t ?? null;

  const trainTrades = evalTrades.filter((trade) => trade.entryIndex <= splitIndex);
  const testTrades = evalTrades.filter((trade) => trade.entryIndex > splitIndex);
  const trainStats = summarizeTrades(trainTrades);
  const testStats = summarizeTrades(testTrades);
  const trainEquity = computeEquityStats(trainTrades);
  const testEquity = computeEquityStats(testTrades);

  return {
    splitIndex,
    splitTime,
    trainTrades,
    testTrades,
    trainStats,
    testStats,
    trainEquity,
    testEquity,
    trainBars: splitIndex + 1,
    testBars: Math.max(0, evalBars.length - splitIndex - 1),
    totalBars: evalBars.length
  };
};

const computeWalkForwardData = (
  bars: Candle[],
  trades: BacktestTrade[],
  replayCutoffIndex: number,
  cfg: BacktestSimulationAnalysis['walkForward']
) => {
  if (!cfg?.enabled || bars.length === 0) return null;
  const useReplay = cfg.useReplayWindow;
  const evalBars = useReplay ? bars.slice(0, Math.max(1, replayCutoffIndex + 1)) : bars;
  const evalTrades = useReplay ? buildReplayTrades(trades, replayCutoffIndex) : trades;
  if (evalBars.length < 10) return null;

  const trainMs = Math.max(1, cfg.trainDays) * 24 * 60 * 60 * 1000;
  const testMs = Math.max(1, cfg.testDays) * 24 * 60 * 60 * 1000;
  const stepMs = Math.max(1, cfg.stepDays) * 24 * 60 * 60 * 1000;
  const times = evalBars.map((bar) => bar.t);
  const lastTime = times[times.length - 1];
  const minTrades = Math.max(0, Math.floor(cfg.minTrades));

  const folds: Array<{
    id: string;
    trainStart: number;
    trainEnd: number;
    testStart: number;
    testEnd: number;
    trainStats: BacktestStats;
    testStats: BacktestStats;
    trainEquity: { netR: number; maxDrawdown: number };
    testEquity: { netR: number; maxDrawdown: number };
  }> = [];

  let foldStart = times[0];
  while (foldStart + trainMs + testMs <= lastTime) {
    const trainStartIdx = findIndexAtOrAfter(times, foldStart);
    const trainEndIdx = Math.max(trainStartIdx, findIndexAtOrAfter(times, foldStart + trainMs) - 1);
    const testStartIdx = Math.max(trainEndIdx + 1, findIndexAtOrAfter(times, foldStart + trainMs));
    const testEndIdx = Math.max(testStartIdx, findIndexAtOrAfter(times, foldStart + trainMs + testMs) - 1);

    if (testStartIdx >= times.length || testStartIdx > testEndIdx) break;

    const trainTrades = evalTrades.filter((trade) => trade.entryIndex >= trainStartIdx && trade.entryIndex <= trainEndIdx);
    const testTrades = evalTrades.filter((trade) => trade.entryIndex >= testStartIdx && trade.entryIndex <= testEndIdx);
    if (minTrades > 0 && (trainTrades.length < minTrades || testTrades.length < minTrades)) {
      foldStart += stepMs;
      continue;
    }

    folds.push({
      id: `${folds.length + 1}`,
      trainStart: times[trainStartIdx],
      trainEnd: times[trainEndIdx],
      testStart: times[testStartIdx],
      testEnd: times[testEndIdx],
      trainStats: summarizeTrades(trainTrades),
      testStats: summarizeTrades(testTrades),
      trainEquity: computeEquityStats(trainTrades),
      testEquity: computeEquityStats(testTrades)
    });

    foldStart += stepMs;
  }

  if (folds.length === 0) return { folds, summary: null };

  const testNetR = folds.map((f) => f.testEquity.netR);
  const testExpectancy = folds.map((f) => f.testStats.expectancy).filter((v): v is number => v != null);
  const testWinRate = folds.map((f) => f.testStats.winRate).filter((v): v is number => v != null);
  const testPf = folds.map((f) => f.testStats.profitFactor).filter((v): v is number => v != null);
  const testDd = folds.map((f) => f.testEquity.maxDrawdown);
  const positiveNet = testNetR.filter((v) => v > 0).length;

  const avg = (values: number[]) => values.length > 0
    ? values.reduce((acc, v) => acc + v, 0) / values.length
    : null;
  const std = (values: number[]) => {
    if (values.length === 0) return null;
    const mean = avg(values);
    if (mean == null) return null;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  };
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const scoreFromCv = (cv: number | null, cap: number) => {
    if (cv == null) return null;
    const bounded = Math.min(cap, Math.max(0, cv));
    return clamp01(1 - bounded / cap);
  };

  const avgNetR = avg(testNetR);
  const avgExpectancy = avg(testExpectancy);
  const avgWinRate = avg(testWinRate);
  const avgProfitFactor = avg(testPf);
  const avgMaxDrawdown = avg(testDd);
  const positiveNetPct = folds.length > 0 ? positiveNet / folds.length : null;

  const netRStd = std(testNetR);
  const winRateStd = std(testWinRate);
  const pfStd = std(testPf);
  const cvNetR = netRStd != null && avgNetR != null
    ? netRStd / Math.max(1e-6, Math.abs(avgNetR))
    : null;
  const cvWinRate = winRateStd != null && avgWinRate != null
    ? winRateStd / Math.max(1e-6, Math.abs(avgWinRate))
    : null;
  const cvPf = pfStd != null && avgProfitFactor != null
    ? pfStd / Math.max(1e-6, Math.abs(avgProfitFactor))
    : null;

  const netRStability = scoreFromCv(cvNetR, 1.5) ?? 0;
  const winRateStability = scoreFromCv(cvWinRate, 0.5) ?? 0;
  const pfStability = scoreFromCv(cvPf, 0.75) ?? 0;
  const positiveScore = positiveNetPct ?? 0;
  const stabilityScore = Math.round(
    100 * (0.45 * positiveScore + 0.3 * netRStability + 0.15 * winRateStability + 0.1 * pfStability)
  );

  const recentCount = Math.min(3, folds.length);
  const recentFolds = recentCount > 0 ? folds.slice(-recentCount) : [];
  const recentNetR = avg(recentFolds.map((f) => f.testEquity.netR));
  const recentWinRate = avg(
    recentFolds
      .map((f) => f.testStats.winRate)
      .filter((v): v is number => v != null)
  );
  const recentProfitFactor = avg(
    recentFolds
      .map((f) => f.testStats.profitFactor)
      .filter((v): v is number => v != null)
  );
  const lastTwo = folds.slice(-2);
  const lastTwoNegative = lastTwo.length === 2 && lastTwo.every((f) => f.testEquity.netR < 0);
  const driftFlags: string[] = [];

  if (positiveNetPct != null && positiveNetPct < 0.5) {
    driftFlags.push('Less than half of folds positive.');
  }
  if (avgNetR != null && recentNetR != null && avgNetR > 0 && recentNetR < avgNetR * 0.4) {
    driftFlags.push('Recent net R below historical mean.');
  }
  if (avgWinRate != null && recentWinRate != null && recentWinRate < avgWinRate - 0.15) {
    driftFlags.push('Recent win rate below historical mean.');
  }
  if (avgProfitFactor != null && recentProfitFactor != null && avgProfitFactor >= 1.1 && recentProfitFactor < 1.0) {
    driftFlags.push('Recent profit factor below 1.0.');
  }
  if (lastTwoNegative) {
    driftFlags.push('Two recent folds negative.');
  }
  if (stabilityScore < 50) {
    driftFlags.push('Low stability score.');
  }

  return {
    folds,
    summary: {
      folds: folds.length,
      avgNetR,
      avgExpectancy,
      avgWinRate,
      avgProfitFactor,
      avgMaxDrawdown,
      positiveNetPct,
      stabilityScore,
      driftFlags,
      recentNetR,
      recentWinRate,
      recentProfitFactor
    }
  };
};

const runBacktestSimulation = async (payload: BacktestSimulationPayload) => {
  const { bars, tieBreaker, execution, confluence, setups } = payload;
  if (!Array.isArray(bars) || bars.length === 0) {
    return { ok: false, trades: [] as BacktestTrade[], error: 'No bars provided.' };
  }
  const candidates: BacktestTrade[] = [];
  if (setups.range?.enabled) {
    candidates.push(...generateRangeBreakoutTrades(bars, setups.range as RangeBreakoutConfig));
  }
  if (setups.breakRetest?.enabled) {
    candidates.push(...generateBreakRetestTrades(bars, setups.breakRetest as BreakRetestConfig));
  }
  if (setups.fvg?.enabled) {
    candidates.push(...generateFvgRetraceTrades(bars, setups.fvg as FvgRetraceConfig));
  }
  if (setups.trend?.enabled) {
    candidates.push(...generateTrendPullbackTrades(bars, setups.trend as TrendPullbackConfig));
  }
  if (setups.mean?.enabled) {
    candidates.push(...generateMeanReversionTrades(bars, setups.mean as MeanReversionConfig));
  }
  candidates.sort((a, b) => a.entryIndex - b.entryIndex);
  const filtered = applyConfluenceFilter(candidates, confluence);
  const simulated = simulateTrades(bars, filtered as BacktestTrade[], { tieBreaker, execution });
  if (payload.analysis) {
    const validation = computeValidationData(
      bars,
      simulated,
      payload.analysis.replayCutoffIndex,
      payload.analysis.validation
    );
    const walkForward = computeWalkForwardData(
      bars,
      simulated,
      payload.analysis.replayCutoffIndex,
      payload.analysis.walkForward
    );
    return { ok: true, trades: simulated, analysis: { validation, walkForward } };
  }
  return { ok: true, trades: simulated };
};

const runBacktestAnalysis = async (payload: BacktestAnalysisPayload) => {
  const { bars, trades, analysis } = payload;
  if (!analysis) {
    return { ok: true, analysis: { validation: null, walkForward: null } };
  }
  if (!Array.isArray(bars) || bars.length === 0) {
    return { ok: false, analysis: { validation: null, walkForward: null }, error: 'No bars provided.' };
  }
  const validation = computeValidationData(bars, trades, analysis.replayCutoffIndex, analysis.validation);
  const walkForward = computeWalkForwardData(bars, trades, analysis.replayCutoffIndex, analysis.walkForward);
  return { ok: true, analysis: { validation, walkForward } };
};

const runSetupOptimizer = async (payload: SetupOptimizerPayload) => {
  const startedAt = Date.now();
  const { bars, tieBreaker, execution, confluence, maxCombos, sortBy, topN, setups } = payload;
  const results: OptimizerResult[] = [];
  let attempted = 0;
  let estimated = 0;
  let truncated = false;

  for (const setup of setups) {
    if (attempted >= maxCombos) {
      truncated = true;
      break;
    }

    const inputs = setup.grid || {};
    const comboEstimate = estimateCombos(inputs);
    estimated += comboEstimate;

    const remaining = Math.max(0, maxCombos - attempted);
    const grids = buildGrid(setup.base as any, inputs as any, remaining);
    if (grids.length < comboEstimate) truncated = true;

    for (const cfg of grids) {
      if (attempted >= maxCombos) {
        truncated = true;
        break;
      }

      let trades: any[] = [];
      if (setup.id === 'range_breakout') {
        trades = generateRangeBreakoutTrades(bars, cfg as RangeBreakoutConfig);
      } else if (setup.id === 'break_retest') {
        trades = generateBreakRetestTrades(bars, cfg as BreakRetestConfig);
      } else if (setup.id === 'fvg_retrace') {
        trades = generateFvgRetraceTrades(bars, cfg as FvgRetraceConfig);
      } else if (setup.id === 'trend_pullback') {
        trades = generateTrendPullbackTrades(bars, cfg as TrendPullbackConfig);
      } else if (setup.id === 'mean_reversion') {
        trades = generateMeanReversionTrades(bars, cfg as MeanReversionConfig);
      }

      const filtered = applyConfluenceFilter(trades, confluence);
      const simulated = simulateTrades(bars, filtered, { tieBreaker, execution });
      const stats = summarizeTrades(simulated);
      const equity = computeEquityStats(simulated);

      results.push({
        id: `${setup.id}_${attempted}`,
        setup: setup.id,
        stats,
        netR: equity.netR,
        maxDrawdown: equity.maxDrawdown,
        winRate: stats.winRate,
        expectancy: stats.expectancy,
        profitFactor: stats.profitFactor,
        params: cfg as Record<string, any>
      });

      attempted += 1;
    }
  }

  const scoreFor = (result: OptimizerResult) => {
    if (sortBy === 'expectancy') return result.expectancy ?? -Infinity;
    if (sortBy === 'profitFactor') return result.profitFactor ?? -Infinity;
    if (sortBy === 'winRate') return result.winRate ?? -Infinity;
    if (sortBy === 'maxDrawdown') return -result.maxDrawdown;
    return result.netR;
  };

  results.sort((a, b) => scoreFor(b) - scoreFor(a));
  const trimmed = results.slice(0, Math.max(1, Math.min(200, topN)));

  return {
    ok: true,
    results: trimmed,
    summary: {
      attempted,
      estimated,
      durationMs: Date.now() - startedAt,
      truncated
    }
  };
};

const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'cancel') {
    cancelledRequests.add(message.requestId);
    return;
  }

  if (message.type === 'optimize_request') {
    const { requestId, payload } = message;
    try {
      const result = await runBacktestOptimizationOnBars(
        payload.request,
        payload.bars,
        {
          runId: payload.runId,
          startedAtMs: payload.startedAtMs,
          history: payload.history
        },
        {
          progressInterval: payload.progressInterval,
          includeResults: payload.includeResults,
          shouldCancel: () => cancelledRequests.has(requestId),
          onProgress: (progress) => {
            const response: WorkerResponse = { type: 'progress', requestId, progress };
            ctx.postMessage(response);
          }
        }
      );
      const response: WorkerResponse = { type: 'result', requestId, result };
      ctx.postMessage(response);
    } catch (err: any) {
      const response: WorkerResponse = {
        type: 'error',
        requestId,
        error: err?.message ? String(err.message) : 'Worker optimization failed.'
      };
      ctx.postMessage(response);
    } finally {
      cancelledRequests.delete(requestId);
    }
    return;
  }

  if (message.type === 'setup_optimizer_request') {
    const { requestId, payload } = message;
    try {
      const result = await runSetupOptimizer(payload);
      const response: WorkerResponse = { type: 'result', requestId, result };
      ctx.postMessage(response);
    } catch (err: any) {
      const response: WorkerResponse = {
        type: 'error',
        requestId,
        error: err?.message ? String(err.message) : 'Worker optimizer failed.'
      };
      ctx.postMessage(response);
    }
    return;
  }

  if (message.type === 'simulate_request') {
    const { requestId, payload } = message;
    try {
      const result = await runBacktestSimulation(payload);
      const response: WorkerResponse = { type: 'result', requestId, result };
      ctx.postMessage(response);
    } catch (err: any) {
      const response: WorkerResponse = {
        type: 'error',
        requestId,
        error: err?.message ? String(err.message) : 'Worker simulation failed.'
      };
      ctx.postMessage(response);
    } finally {
      cancelledRequests.delete(requestId);
    }
    return;
  }

  if (message.type === 'analysis_request') {
    const { requestId, payload } = message;
    try {
      const result = await runBacktestAnalysis(payload);
      const response: WorkerResponse = { type: 'result', requestId, result };
      ctx.postMessage(response);
    } catch (err: any) {
      const response: WorkerResponse = {
        type: 'error',
        requestId,
        error: err?.message ? String(err.message) : 'Worker analysis failed.'
      };
      ctx.postMessage(response);
    } finally {
      cancelledRequests.delete(requestId);
    }
    return;
  }
});
