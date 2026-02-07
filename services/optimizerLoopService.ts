import {
  type BacktestStats,
  type BacktestTrade,
  type Candle,
  buildStrategyConfig,
  generateBreakRetestTrades,
  generateFvgRetraceTrades,
  generateMeanReversionTrades,
  generateRangeBreakoutTrades,
  generateTrendPullbackTrades,
  simulateTrades,
  summarizeTrades
} from './backtestEngine';
import { normalizeExecutionConfig, type ExecutionConfig } from './executionModel';
import {
  loadBacktestOptimizationHistory,
  type BacktestOptimizationStrategy,
  type BacktestParamGrid,
  type TimeFilter
} from './backtestResearchService';
import { runBacktestOptimizationWorker } from './backtestComputeWorkerClient';
import { hashStringSampled } from './stringHash';
import { normalizeTimeframeKey } from './symbols';

export type BacktestRunTrade = {
  id: string;
  setup: string;
  side: 'BUY' | 'SELL';
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitTime?: number | null;
  exitPrice?: number | null;
  outcome?: 'win' | 'loss' | 'open' | null;
  rMultiple?: number | null;
  mae?: number | null;
  mfe?: number | null;
};

export type BacktestRunMetrics = {
  tradeCount: number;
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  avgR: number | null;
  payoffRatio: number | null;
  netR: number;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
};

export type BacktestRun = {
  schemaVersion: number;
  runId: string;
  createdAtMs: number;
  symbol: string;
  timeframe: string;
  dateRange: {
    fromMs: number;
    toMs: number;
  };
  strategyId: string | null;
  params: Record<string, any>;
  execution: ExecutionConfig;
  timeFilter?: TimeFilter | null;
  trades: BacktestRunTrade[];
  equityCurve: Array<{ ts: number; equity: number }>;
  metrics: BacktestRunMetrics;
  notes?: Record<string, any>;
};

export type OptimizationObjective = {
  minTradeCount?: number;
  minExpectancy?: number | null;
  minEdgeMargin?: number | null;
  maxDrawdown?: number | null;
  minProfitFactor?: number | null;
  weights?: {
    winRate?: number;
    expectancy?: number;
    drawdown?: number;
  };
  penaltyWeight?: number;
};

export type OptimizationValidation = {
  mode?: 'percent' | 'last_days' | 'walk_forward';
  splitPercent?: number;
  lastDays?: number;
  trainDays?: number;
  testDays?: number;
  stepDays?: number;
  minTrades?: number;
};

export type OptimizerPreset = {
  id: string;
  name: string;
  objective: OptimizationObjective;
};

export const DEFAULT_OPTIMIZER_PRESETS: OptimizerPreset[] = [
  {
    id: 'winrate_dd',
    name: 'WinRate + Low DD',
    objective: {
      minTradeCount: 50,
      minExpectancy: 0.02,
      minEdgeMargin: 0.02,
      maxDrawdown: 8,
      minProfitFactor: 1.15,
      weights: { winRate: 0.55, expectancy: 0.1, drawdown: 0.35 },
      penaltyWeight: 0.7
    }
  },
  {
    id: 'balanced',
    name: 'Balanced',
    objective: {
      minTradeCount: 50,
      minExpectancy: 0.02,
      minEdgeMargin: 0.02,
      maxDrawdown: 12,
      minProfitFactor: 1.2,
      weights: { winRate: 0.35, expectancy: 0.35, drawdown: 0.3 },
      penaltyWeight: 0.55
    }
  },
  {
    id: 'aggressive',
    name: 'Expectancy / Growth',
    objective: {
      minTradeCount: 50,
      minExpectancy: 0.03,
      minEdgeMargin: 0.02,
      maxDrawdown: 18,
      minProfitFactor: 1.3,
      weights: { winRate: 0.2, expectancy: 0.55, drawdown: 0.25 },
      penaltyWeight: 0.5
    }
  }
];

export type OptimizerProgress = {
  phase: 'train' | 'test' | 'idle';
  done: number;
  total: number;
  pct: number;
  label?: string;
};

export type OptimizerSession = {
  schemaVersion: number;
  sessionId: string;
  status: 'running' | 'completed' | 'failed';
  symbol: string;
  timeframe: string;
  strategy: BacktestOptimizationStrategy;
  rangeDays: number;
  baselineRunId?: string | null;
  objective: OptimizationObjective;
  validation: OptimizationValidation;
  createdAtMs: number;
  updatedAtMs: number;
  progress?: OptimizerProgress | null;
  error?: string | null;
};

export type OptimizerMetricsPack = {
  tradeCount: number;
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  netR: number;
  maxDrawdown: number;
  avgWinR?: number | null;
  avgLossR?: number | null;
  payoffRatio?: number | null;
  edgeMargin?: number | null;
};

export type OptimizerCandidate = {
  params: Record<string, any>;
  paramsHash?: string;
  train: OptimizerMetricsPack;
  test: OptimizerMetricsPack;
  score: number;
  stabilityScore: number;
  isPareto: boolean;
  penalty?: number;
  stabilityPenalty?: number;
};

export type ParamsEvaluation = {
  metrics: OptimizerMetricsPack;
  stats: BacktestStats;
  performance: { netR: number; maxDrawdown: number };
  trades: BacktestTrade[];
};

export type TradeDiagnostics = {
  winStreaks: Array<{ length: number; count: number }>;
  lossStreaks: Array<{ length: number; count: number }>;
  lossByHour: Array<{ hour: number; count: number }>;
  lossByDay: Array<{ day: number; count: number }>;
  avgWinR: number | null;
  avgLossR: number | null;
  payoffRatio: number | null;
  maeAvailable: boolean;
  mfeAvailable: boolean;
  losses: number;
  trades: number;
  worstFold?: {
    index: number;
    maxDrawdown: number;
    trainStartMs: number | null;
    trainEndMs: number | null;
    testStartMs: number | null;
    testEndMs: number | null;
  } | null;
};

export type OptimizerResults = {
  sessionId: string;
  recommended: OptimizerCandidate | null;
  recommendedDiagnostics?: TradeDiagnostics | null;
  pareto: OptimizerCandidate[];
  topCandidates: OptimizerCandidate[];
  evaluated: number;
  totalCombos: number;
  warnings: string[];
};

type StartOptimizerArgs = {
  baselineRunId?: string;
  symbol: string;
  timeframe: string;
  strategy: BacktestOptimizationStrategy;
  rangeDays: number;
  paramGrid: BacktestParamGrid;
  timeFilter?: TimeFilter;
  execution?: Partial<ExecutionConfig>;
  objective?: OptimizationObjective;
  objectivePreset?: string;
  validation?: OptimizationValidation;
  maxCombos?: number;
};

type OptimizerSessionState = {
  session: OptimizerSession;
  results?: OptimizerResults | null;
};

const SESSION_SCHEMA_VERSION = 1;
const RUN_SCHEMA_VERSION = 1;
const MAX_RESULTS = 20;
const EVAL_CACHE_MAX = 2000;
const PERSISTED_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PERSISTED_CACHE_ENGINE_VERSION = '1';

const activeSessions = new Map<string, OptimizerSessionState>();
const evalCache = new Map<string, { stats: BacktestStats; performance: { netR: number; maxDrawdown: number }; tradeCount: number }>();

const nowMs = () => Date.now();


const normalizeStrategy = (value: any): BacktestOptimizationStrategy => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'BREAK_RETEST') return 'BREAK_RETEST';
  if (raw === 'FVG_RETRACE') return 'FVG_RETRACE';
  if (raw === 'TREND_PULLBACK') return 'TREND_PULLBACK';
  if (raw === 'MEAN_REVERSION') return 'MEAN_REVERSION';
  return 'RANGE_BREAKOUT';
};

const normalizeObjective = (objective?: OptimizationObjective | null, presetId?: string | null) => {
  const preset = DEFAULT_OPTIMIZER_PRESETS.find((item) => item.id === presetId) || DEFAULT_OPTIMIZER_PRESETS[1];
  const base = preset ? preset.objective : {};
  const weights = {
    winRate: base.weights?.winRate ?? 0.4,
    expectancy: base.weights?.expectancy ?? 0.4,
    drawdown: base.weights?.drawdown ?? 0.3
  };
  const next: OptimizationObjective = {
    minTradeCount: base.minTradeCount ?? 30,
    maxDrawdown: base.maxDrawdown ?? null,
    minProfitFactor: base.minProfitFactor ?? null,
    minExpectancy: base.minExpectancy ?? null,
    minEdgeMargin: base.minEdgeMargin ?? null,
    penaltyWeight: base.penaltyWeight ?? 0.4,
    weights,
    ...(objective || {})
  };
  return next;
};

const normalizeValidation = (validation?: OptimizationValidation | null) => {
  const mode = validation?.mode === 'last_days' ? 'last_days' : validation?.mode === 'walk_forward' ? 'walk_forward' : 'percent';
  const splitPercent = Number.isFinite(Number(validation?.splitPercent))
    ? Math.max(50, Math.min(90, Number(validation?.splitPercent)))
    : 70;
  const lastDays = Number.isFinite(Number(validation?.lastDays))
    ? Math.max(5, Math.floor(Number(validation?.lastDays)))
    : 30;
  const trainDays = Number.isFinite(Number(validation?.trainDays))
    ? Math.max(10, Math.floor(Number(validation?.trainDays)))
    : 90;
  const testDays = Number.isFinite(Number(validation?.testDays))
    ? Math.max(5, Math.floor(Number(validation?.testDays)))
    : 30;
  const stepDays = Number.isFinite(Number(validation?.stepDays))
    ? Math.max(5, Math.floor(Number(validation?.stepDays)))
    : 30;
  const minTrades = Number.isFinite(Number(validation?.minTrades))
    ? Math.max(1, Math.floor(Number(validation?.minTrades)))
    : 10;
  return { mode, splitPercent, lastDays, trainDays, testDays, stepDays, minTrades };
};

const buildEquityCurve = (trades: BacktestTrade[]) => {
  const closed = trades.filter((t) => t.rMultiple != null);
  if (closed.length === 0) return { curve: [], netR: 0, maxDrawdown: 0, maxDrawdownPct: null };
  const sorted = [...closed].sort((a, b) => {
    const aTime = Number(a.exitTime ?? a.entryTime ?? 0);
    const bTime = Number(b.exitTime ?? b.entryTime ?? 0);
    return aTime - bTime;
  });
  const curve: Array<{ ts: number; equity: number }> = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of sorted) {
    const r = Number.isFinite(Number(trade.rMultiple)) ? Number(trade.rMultiple) : 0;
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    curve.push({ ts: Number(trade.exitTime ?? trade.entryTime ?? 0), equity });
  }
  const maxDrawdownPct = peak > 0 ? maxDrawdown / peak : null;
  return { curve, netR: equity, maxDrawdown, maxDrawdownPct };
};

const buildTradeMetrics = (stats: BacktestStats, netR: number, maxDrawdown: number, maxDrawdownPct: number | null) => {
  const tradeCount = stats.closed || stats.total || 0;
  const avgR = stats.expectancy != null ? Number(stats.expectancy) : null;
  const payoffRatio =
    stats.avgWinR != null && stats.avgLossR != null && stats.avgLossR !== 0
      ? Math.abs(Number(stats.avgWinR) / Number(stats.avgLossR))
      : null;
  return {
    tradeCount,
    winRate: stats.winRate ?? null,
    expectancy: stats.expectancy ?? null,
    profitFactor: stats.profitFactor ?? null,
    avgR,
    payoffRatio,
    netR,
    maxDrawdown,
    maxDrawdownPct
  } as BacktestRunMetrics;
};

const isHourInWindow = (hour: number, startHour: number, endHour: number) => {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
};

const filterByTimeWindow = (trades: BacktestTrade[], filter?: TimeFilter) => {
  if (!filter) return trades;
  const startHour = Number.isFinite(Number(filter.startHour)) ? Math.max(0, Math.min(23, Math.floor(Number(filter.startHour)))) : null;
  const endHour = Number.isFinite(Number(filter.endHour)) ? Math.max(0, Math.min(23, Math.floor(Number(filter.endHour)))) : null;
  if (startHour == null || endHour == null) return trades;
  const timezone = filter.timezone === 'local' ? 'local' : 'utc';
  return trades.filter((trade) => {
    const ts = trade.entryTime;
    if (!Number.isFinite(Number(ts))) return false;
    const date = new Date(Number(ts));
    const hour = timezone === 'local' ? date.getHours() : date.getUTCHours();
    return isHourInWindow(hour, startHour, endHour);
  });
};

const buildTradeList = (trades: BacktestTrade[], maxTrades = 5000) => {
  const trimmed = trades.slice(-maxTrades);
  return trimmed.map((trade) => ({
    id: String(trade.id || ''),
    setup: String(trade.setup || ''),
    side: trade.side === 'SELL' ? 'SELL' : 'BUY',
    entryTime: Number(trade.entryTime || 0),
    entryPrice: Number(trade.entryPrice || 0),
    stopLoss: Number(trade.stopLoss || 0),
    takeProfit: Number(trade.takeProfit || 0),
    exitTime: trade.exitTime != null ? Number(trade.exitTime) : null,
    exitPrice: trade.exitPrice != null ? Number(trade.exitPrice) : null,
    outcome: trade.outcome || null,
    rMultiple: trade.rMultiple != null ? Number(trade.rMultiple) : null,
    mae: null,
    mfe: null
  })) as BacktestRunTrade[];
};

export const buildBacktestRun = (args: {
  symbol: string;
  timeframe: string;
  rangeDays: number;
  bars: Candle[];
  trades: BacktestTrade[];
  stats: BacktestStats;
  execution: ExecutionConfig;
  timeFilter?: TimeFilter | null;
  strategyId?: string | null;
  params?: Record<string, any>;
  notes?: Record<string, any>;
  maxTrades?: number;
}) => {
  const symbol = String(args.symbol || '').trim();
  const timeframe = normalizeTimeframeKey(String(args.timeframe || '').trim());
  if (!symbol || !timeframe || !Array.isArray(args.bars) || args.bars.length === 0) return null;
  const bars = args.bars;
  const fromMs = Number(bars[0]?.t || 0);
  const toMs = Number(bars[bars.length - 1]?.t || 0);
  const createdAtMs = nowMs();
  const runId = `run_${createdAtMs}_${Math.random().toString(16).slice(2, 8)}`;
  const trades = Array.isArray(args.trades) ? args.trades : [];
  const equity = buildEquityCurve(trades);
  const metrics = buildTradeMetrics(args.stats, equity.netR, equity.maxDrawdown, equity.maxDrawdownPct);
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId,
    createdAtMs,
    symbol,
    timeframe,
    dateRange: { fromMs, toMs },
    strategyId: args.strategyId || null,
    params: args.params || {},
    execution: normalizeExecutionConfig(args.execution),
    timeFilter: args.timeFilter || null,
    trades: buildTradeList(trades, args.maxTrades),
    equityCurve: equity.curve,
    metrics,
    notes: args.notes || {}
  } as BacktestRun;
};

const saveAgentMemory = async (entry: {
  key: string;
  kind: string;
  symbol?: string | null;
  timeframe?: string | null;
  summary?: string | null;
  payload?: any;
  tags?: string[];
  familyKey?: string | null;
  source?: string | null;
  scope?: string | null;
  category?: string | null;
  subcategory?: string | null;
}) => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.upsertAgentMemory) return;
  await ledger.upsertAgentMemory({
    key: entry.key,
    familyKey: entry.familyKey || null,
    scope: entry.scope || null,
    category: entry.category || null,
    subcategory: entry.subcategory || null,
    kind: entry.kind,
    symbol: entry.symbol || null,
    timeframe: entry.timeframe || null,
    summary: entry.summary || null,
    payload: entry.payload || null,
    source: entry.source || 'optimizer',
    tags: entry.tags || []
  });
};

export const persistBacktestRun = async (run: BacktestRun) => {
  if (!run) return null;
  const key = `backtest_run:${run.runId}`;
  const familyKey = `backtest_run:${run.symbol}:${run.timeframe}`;
  const summary = `Backtest run ${run.symbol} ${run.timeframe} trades ${run.metrics.tradeCount} WR ${formatPct(run.metrics.winRate)}`;
  await saveAgentMemory({
    key,
    familyKey,
    scope: 'shared',
    category: 'backtest',
    subcategory: 'run',
    kind: 'backtest_run',
    symbol: run.symbol,
    timeframe: run.timeframe,
    summary,
    payload: run,
    tags: [run.symbol, run.timeframe, run.strategyId || 'multi', 'backtest', 'run'].filter(Boolean)
  });
  return run;
};

const formatPct = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
};

const formatR = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(2)}R`;
};

const persistOptimizerExperimentRegistry = async (
  session: OptimizerSession,
  args: StartOptimizerArgs,
  results: OptimizerResults,
  paramGridSummary: ParamGridSummary | null,
  paramGridHash: string | null
) => {
  const candidate = results.recommended;
  if (!candidate) return;
  const score = Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : null;
  const tradeCount = candidate.test?.tradeCount ?? null;
  const winRate = candidate.test?.winRate ?? null;
  const paramsHash = candidate.paramsHash || hashStringSampled(stableStringify(candidate.params));
  const summary = [
    `${session.symbol} ${session.timeframe}`,
    session.strategy,
    `score ${score != null ? score.toFixed(3) : '--'}`,
    `WR ${winRate != null ? `${(winRate * 100).toFixed(1)}%` : '--'}`,
    `trades ${tradeCount ?? '--'}`
  ].join(' | ');

  const payload = {
    schemaVersion: 1,
    source: 'optimizer',
    sessionId: session.sessionId,
    symbol: session.symbol,
    timeframe: session.timeframe,
    strategy: session.strategy,
    createdAtMs: session.createdAtMs,
    updatedAtMs: nowMs(),
    inputs: {
      rangeDays: session.rangeDays,
      baselineRunId: session.baselineRunId ?? null,
      objectivePreset: args.objectivePreset ?? null,
      objective: session.objective,
      validation: session.validation,
      timeFilter: args.timeFilter ?? null,
      execution: normalizeExecutionConfig(args.execution),
      maxCombos: args.maxCombos ?? null,
      paramGridHash,
      paramGridSummary
    },
    outputs: {
      params: candidate.params,
      paramsHash,
      metrics: candidate.test,
      score,
      penalties: {
        penalty: Number.isFinite(Number(candidate.penalty)) ? Number(candidate.penalty) : null,
        stabilityPenalty: Number.isFinite(Number(candidate.stabilityPenalty)) ? Number(candidate.stabilityPenalty) : null
      },
      recommendedDiagnostics: results.recommendedDiagnostics || null,
      evaluated: results.evaluated,
      totalCombos: results.totalCombos,
      paretoCount: results.pareto.length,
      warnings: results.warnings
    }
  };

  await saveAgentMemory({
    key: `experiment_registry:optimizer:${session.sessionId}`,
    familyKey: `experiment_registry:${session.symbol}:${session.timeframe}:${session.strategy}`,
    kind: 'experiment_registry',
    symbol: session.symbol,
    timeframe: session.timeframe,
    summary,
    payload,
    tags: [session.symbol, session.timeframe, session.strategy, 'experiment', 'optimizer'].filter(Boolean),
    source: 'optimizer'
  });
};

const normalizeMetric = (value: number | null, min: number, max: number, invert = false) => {
  if (value == null || !Number.isFinite(value)) return 0;
  if (max === min) return 0.5;
  let n = (value - min) / (max - min);
  n = Math.max(0, Math.min(1, n));
  return invert ? 1 - n : n;
};

const computePenalty = (train: OptimizerMetricsPack, test: OptimizerMetricsPack, penaltyWeight: number) => {
  const penaltyFor = (trainVal: number | null, testVal: number | null) => {
    if (trainVal == null || testVal == null || !Number.isFinite(trainVal) || !Number.isFinite(testVal)) return 0;
    if (trainVal === 0) return 0;
    const diff = trainVal - testVal;
    if (diff <= 0) return 0;
    return diff / Math.max(1e-6, Math.abs(trainVal));
  };
  const winPenalty = penaltyFor(train.winRate ?? null, test.winRate ?? null);
  const expPenalty = penaltyFor(train.expectancy ?? null, test.expectancy ?? null);
  const netPenalty = penaltyFor(train.netR ?? null, test.netR ?? null);
  const avg = (winPenalty + expPenalty + netPenalty) / 3;
  return Math.max(0, avg) * penaltyWeight;
};

const computeEdgeMetrics = (stats: BacktestStats) => {
  const avgWinR = stats.avgWinR ?? null;
  const avgLossR = stats.avgLossR ?? null;
  const payoffRatio =
    avgWinR != null && avgLossR != null && avgLossR !== 0
      ? Math.abs(Number(avgWinR) / Number(avgLossR))
      : null;
  const breakEvenWinRate =
    payoffRatio != null && Number.isFinite(payoffRatio)
      ? 1 / (1 + payoffRatio)
      : null;
  const edgeMargin =
    stats.winRate != null && breakEvenWinRate != null
      ? Number(stats.winRate) - breakEvenWinRate
      : null;
  return { avgWinR, avgLossR, payoffRatio, breakEvenWinRate, edgeMargin };
};

const stableStringify = (value: any) => {
  const seen = new WeakSet();
  const stringify = (input: any): any => {
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input)) return null;
    seen.add(input);
    if (Array.isArray(input)) return input.map((item) => stringify(item));
    const keys = Object.keys(input).sort();
    const output: Record<string, any> = {};
    for (const key of keys) {
      output[key] = stringify(input[key]);
    }
    return output;
  };
  try {
    return JSON.stringify(stringify(value));
  } catch {
    return JSON.stringify(value);
  }
};

type ParamGridSummary = {
  keys: string[];
  counts: Array<{ key: string; count: number }>;
  totalCombos: number | null;
};

const buildParamGridSummary = (grid?: BacktestParamGrid | null): ParamGridSummary | null => {
  if (!grid || typeof grid !== 'object') return null;
  const counts = Object.entries(grid)
    .map(([key, value]) => {
      const count = Array.isArray(value) ? value.length : value != null ? 1 : 0;
      return { key, count };
    })
    .filter((entry) => entry.count > 0);
  if (counts.length === 0) return { keys: [], counts: [], totalCombos: 0 };
  let total = 1;
  for (const entry of counts) {
    const next = total * Math.max(1, entry.count);
    total = next > 1_000_000 ? 1_000_000 : next;
  }
  return { keys: counts.map((entry) => entry.key), counts, totalCombos: total };
};

let persistentCacheEnabled: boolean | null = null;
const isPersistentCacheEnabled = () => {
  if (persistentCacheEnabled != null) return persistentCacheEnabled;
  if (typeof window === 'undefined') {
    persistentCacheEnabled = false;
    return persistentCacheEnabled;
  }
  const ledger = (window as any)?.glass?.tradeLedger;
  persistentCacheEnabled =
    typeof ledger?.getOptimizerEvalCache === 'function' &&
    typeof ledger?.putOptimizerEvalCache === 'function';
  return persistentCacheEnabled;
};

const fetchPersistentCache = async (cacheKey: string) => {
  if (!isPersistentCacheEnabled()) return null;
  try {
    const ledger = (window as any)?.glass?.tradeLedger;
    const res = await ledger.getOptimizerEvalCache({ key: cacheKey, touch: true });
    if (!res?.ok || !res.entry) return null;
    if (res.entry.engineVersion && res.entry.engineVersion !== PERSISTED_CACHE_ENGINE_VERSION) {
      return null;
    }
    if (res.entry.expiresAtMs && res.entry.expiresAtMs <= Date.now()) {
      return null;
    }
    return res.entry;
  } catch {
    return null;
  }
};

const persistCacheEntry = async (cacheKey: string, payload: any) => {
  if (!isPersistentCacheEnabled()) return;
  try {
    const ledger = (window as any)?.glass?.tradeLedger;
    await ledger.putOptimizerEvalCache({
      key: cacheKey,
      payload,
      engineVersion: PERSISTED_CACHE_ENGINE_VERSION,
      expiresAtMs: Date.now() + PERSISTED_CACHE_TTL_MS
    });
  } catch {
    // ignore cache persistence errors
  }
};

const buildBarsKey = (bars: Candle[], context: string) => {
  if (!bars.length) return `${context}|0`;
  const first = Number(bars[0]?.t || 0);
  const last = Number(bars[bars.length - 1]?.t || 0);
  return `${context}|${bars.length}|${first}|${last}`;
};

const buildEvalCacheKey = (
  strategy: BacktestOptimizationStrategy,
  params: Record<string, any>,
  bars: Candle[],
  timeFilter: TimeFilter | undefined,
  execution: Partial<ExecutionConfig> | undefined,
  context: string
) => {
  const barsKey = buildBarsKey(bars, context);
  const paramsHash = hashStringSampled(stableStringify(params));
  const filterHash = timeFilter ? hashStringSampled(stableStringify(timeFilter)) : '0';
  const execHash = execution ? hashStringSampled(stableStringify(normalizeExecutionConfig(execution))) : '0';
  return `${strategy}|${barsKey}|${paramsHash}|${filterHash}|${execHash}`;
};

const rememberEvalCache = (
  key: string,
  value: { stats: BacktestStats; performance: { netR: number; maxDrawdown: number }; tradeCount: number }
) => {
  evalCache.set(key, value);
  if (evalCache.size <= EVAL_CACHE_MAX) return;
  const oldestKey = evalCache.keys().next().value;
  if (oldestKey) evalCache.delete(oldestKey);
};

const evaluateParams = (
  strategy: BacktestOptimizationStrategy,
  params: Record<string, any>,
  bars: Candle[],
  timeFilter?: TimeFilter,
  execution?: Partial<ExecutionConfig>
) => {
  const config = buildStrategyConfig(strategy, params);
  let trades: BacktestTrade[] = [];
  if (strategy === 'BREAK_RETEST') {
    trades = generateBreakRetestTrades(bars, config as any);
  } else if (strategy === 'FVG_RETRACE') {
    trades = generateFvgRetraceTrades(bars, config as any);
  } else if (strategy === 'TREND_PULLBACK') {
    trades = generateTrendPullbackTrades(bars, config as any);
  } else if (strategy === 'MEAN_REVERSION') {
    trades = generateMeanReversionTrades(bars, config as any);
  } else {
    trades = generateRangeBreakoutTrades(bars, config as any);
  }
  const simulated = simulateTrades(bars, trades, { execution });
  const filtered = filterByTimeWindow(simulated, timeFilter);
  const stats = summarizeTrades(filtered);
  const equity = buildEquityCurve(filtered);
  const tradeCount = stats.closed || stats.total || 0;
  return {
    stats,
    performance: {
      netR: equity.netR,
      maxDrawdown: equity.maxDrawdown
    },
    tradeCount
  };
};

const evaluateParamsCached = async (
  strategy: BacktestOptimizationStrategy,
  params: Record<string, any>,
  bars: Candle[],
  timeFilter: TimeFilter | undefined,
  execution: Partial<ExecutionConfig> | undefined,
  cacheContext: string
) => {
  const key = buildEvalCacheKey(strategy, params, bars, timeFilter, execution, cacheContext);
  const cached = evalCache.get(key);
  if (cached) return cached;
  const persistent = await fetchPersistentCache(key);
  if (persistent?.payload) {
    const payload = persistent.payload;
    if (payload && payload.stats && payload.performance) {
      const restored = {
        stats: payload.stats,
        performance: payload.performance,
        tradeCount: payload.tradeCount || 0
      };
      rememberEvalCache(key, restored);
      return restored;
    }
  }
  const result = evaluateParams(strategy, params, bars, timeFilter, execution);
  rememberEvalCache(key, result);
  void persistCacheEntry(key, result);
  return result;
};

const evaluateParamsDetailed = (
  strategy: BacktestOptimizationStrategy,
  params: Record<string, any>,
  bars: Candle[],
  timeFilter?: TimeFilter,
  execution?: Partial<ExecutionConfig>
) => {
  const config = buildStrategyConfig(strategy, params);
  let trades: BacktestTrade[] = [];
  if (strategy === 'BREAK_RETEST') {
    trades = generateBreakRetestTrades(bars, config as any);
  } else if (strategy === 'FVG_RETRACE') {
    trades = generateFvgRetraceTrades(bars, config as any);
  } else if (strategy === 'TREND_PULLBACK') {
    trades = generateTrendPullbackTrades(bars, config as any);
  } else if (strategy === 'MEAN_REVERSION') {
    trades = generateMeanReversionTrades(bars, config as any);
  } else {
    trades = generateRangeBreakoutTrades(bars, config as any);
  }
  const simulated = simulateTrades(bars, trades, { execution });
  const filtered = filterByTimeWindow(simulated, timeFilter);
  const stats = summarizeTrades(filtered);
  const equity = buildEquityCurve(filtered);
  const tradeCount = stats.closed || stats.total || 0;
  return {
    trades: filtered,
    stats,
    performance: {
      netR: equity.netR,
      maxDrawdown: equity.maxDrawdown
    },
    tradeCount
  };
};

export const evaluateParamsOnBars = (
  strategy: BacktestOptimizationStrategy,
  params: Record<string, any>,
  bars: Candle[],
  timeFilter?: TimeFilter,
  execution?: Partial<ExecutionConfig>
): ParamsEvaluation => {
  const detail = evaluateParamsDetailed(strategy, params, bars, timeFilter, execution);
  const edge = computeEdgeMetrics(detail.stats);
  const tradeCount = detail.stats.closed || detail.stats.total || 0;
  const metrics: OptimizerMetricsPack = {
    tradeCount,
    winRate: detail.stats.winRate ?? null,
    expectancy: detail.stats.expectancy ?? null,
    profitFactor: detail.stats.profitFactor ?? null,
    netR: detail.performance.netR,
    maxDrawdown: detail.performance.maxDrawdown,
    avgWinR: edge.avgWinR ?? null,
    avgLossR: edge.avgLossR ?? null,
    payoffRatio: edge.payoffRatio ?? null,
    edgeMargin: edge.edgeMargin ?? null
  };

  return {
    metrics,
    stats: detail.stats,
    performance: detail.performance,
    trades: detail.trades
  };
};

const aggregateFoldMetrics = (folds: Array<{ stats: BacktestStats; performance: { netR: number; maxDrawdown: number } }>) => {
  let wins = 0;
  let losses = 0;
  let closed = 0;
  let totalR = 0;
  let sumWinsR = 0;
  let sumLossR = 0;
  let netR = 0;
  let maxDrawdown = 0;

  for (const fold of folds) {
    const stats = fold.stats;
    const foldClosed = stats.closed || stats.total || 0;
    const foldWins = stats.wins || 0;
    const foldLosses = stats.losses || 0;
    closed += foldClosed;
    wins += foldWins;
    losses += foldLosses;
    if (stats.expectancy != null && foldClosed > 0) {
      totalR += Number(stats.expectancy) * foldClosed;
    }
    if (stats.avgWinR != null && foldWins > 0) {
      sumWinsR += Number(stats.avgWinR) * foldWins;
    }
    if (stats.avgLossR != null && foldLosses > 0) {
      sumLossR += Math.abs(Number(stats.avgLossR)) * foldLosses;
    }
    netR += Number(fold.performance.netR) || 0;
    maxDrawdown = Math.max(maxDrawdown, Number(fold.performance.maxDrawdown) || 0);
  }

  const winRate = closed > 0 ? wins / closed : null;
  const expectancy = closed > 0 ? totalR / closed : null;
  const profitFactor = sumLossR > 0 ? sumWinsR / sumLossR : null;
  const avgWinR = wins > 0 ? sumWinsR / wins : null;
  const avgLossR = losses > 0 ? -sumLossR / losses : null;
  const payoffRatio =
    avgWinR != null && avgLossR != null && avgLossR !== 0
      ? Math.abs(avgWinR / avgLossR)
      : null;
  const breakEvenWinRate =
    payoffRatio != null && Number.isFinite(payoffRatio)
      ? 1 / (1 + payoffRatio)
      : null;
  const edgeMargin =
    winRate != null && breakEvenWinRate != null
      ? winRate - breakEvenWinRate
      : null;

  return {
    tradeCount: closed,
    winRate,
    expectancy,
    profitFactor,
    netR,
    maxDrawdown,
    avgWinR,
    avgLossR,
    payoffRatio,
    edgeMargin
  } as OptimizerMetricsPack;
};

const computeFoldStabilityPenalty = (folds: OptimizerMetricsPack[], penaltyWeight: number) => {
  if (folds.length < 2) return 0;
  const series = (key: keyof OptimizerMetricsPack) =>
    folds.map((fold) => fold[key]).filter((value): value is number => Number.isFinite(Number(value))).map(Number);
  const penaltyForSeries = (values: number[]) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    if (!Number.isFinite(mean) || mean === 0) return 0;
    const avgDev = values.reduce((acc, v) => acc + Math.abs(v - mean), 0) / values.length;
    return avgDev / Math.max(1e-6, Math.abs(mean));
  };
  const winPenalty = penaltyForSeries(series('winRate'));
  const expPenalty = penaltyForSeries(series('expectancy'));
  const netPenalty = penaltyForSeries(series('netR'));
  const avg = (winPenalty + expPenalty + netPenalty) / 3;
  return Math.max(0, avg) * penaltyWeight;
};

const buildTradeDiagnostics = (trades: BacktestTrade[]): TradeDiagnostics => {
  const closed = trades.filter((trade) => trade.outcome === 'win' || trade.outcome === 'loss');
  const ordered = [...closed].sort((a, b) => Number(a.entryTime || 0) - Number(b.entryTime || 0));
  const winStreaks = new Map<number, number>();
  const lossStreaks = new Map<number, number>();
  let streakType: 'win' | 'loss' | null = null;
  let streakLen = 0;

  for (const trade of ordered) {
    const outcome = trade.outcome === 'win' ? 'win' : trade.outcome === 'loss' ? 'loss' : null;
    if (!outcome) continue;
    if (streakType === outcome) {
      streakLen += 1;
      continue;
    }
    if (streakType === 'win' && streakLen > 0) {
      winStreaks.set(streakLen, (winStreaks.get(streakLen) || 0) + 1);
    }
    if (streakType === 'loss' && streakLen > 0) {
      lossStreaks.set(streakLen, (lossStreaks.get(streakLen) || 0) + 1);
    }
    streakType = outcome;
    streakLen = 1;
  }

  if (streakType === 'win' && streakLen > 0) {
    winStreaks.set(streakLen, (winStreaks.get(streakLen) || 0) + 1);
  } else if (streakType === 'loss' && streakLen > 0) {
    lossStreaks.set(streakLen, (lossStreaks.get(streakLen) || 0) + 1);
  }

  const lossByHour = new Map<number, number>();
  const lossByDay = new Map<number, number>();
  for (const trade of closed) {
    if (trade.outcome !== 'loss') continue;
    const ts = Number(trade.entryTime || 0);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const date = new Date(ts);
    const hour = date.getUTCHours();
    const day = date.getUTCDay();
    lossByHour.set(hour, (lossByHour.get(hour) || 0) + 1);
    lossByDay.set(day, (lossByDay.get(day) || 0) + 1);
  }

  const stats = summarizeTrades(closed);
  const avgWinR = stats.avgWinR ?? null;
  const avgLossR = stats.avgLossR ?? null;
  const lossCount =
    Number.isFinite(Number(stats.losses))
      ? Number(stats.losses)
      : closed.filter((trade) => trade.outcome === 'loss').length;
  const payoffRatio =
    avgWinR != null && avgLossR != null && avgLossR !== 0 ? Math.abs(avgWinR / avgLossR) : null;

  const toSortedList = (map: Map<number, number>) =>
    Array.from(map.entries())
      .map(([key, count]) => ({ length: key, count }))
      .sort((a, b) => b.count - a.count || b.length - a.length);

  const toTopBuckets = (map: Map<number, number>, label: 'hour' | 'day') =>
    Array.from(map.entries())
      .map(([value, count]) => ({ [label]: value, count } as { hour: number; count: number } | { day: number; count: number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3) as Array<{ hour: number; count: number }> | Array<{ day: number; count: number }>;

  return {
    winStreaks: toSortedList(winStreaks),
    lossStreaks: toSortedList(lossStreaks),
    lossByHour: toTopBuckets(lossByHour, 'hour') as Array<{ hour: number; count: number }>,
    lossByDay: toTopBuckets(lossByDay, 'day') as Array<{ day: number; count: number }>,
    avgWinR,
    avgLossR,
    payoffRatio,
    maeAvailable: false,
    mfeAvailable: false,
    losses: lossCount,
    trades: closed.length,
    worstFold: null
  };
};

const findIndexAtOrAfter = (bars: Candle[], target: number) => {
  let lo = 0;
  let hi = bars.length - 1;
  let best = bars.length;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const ts = Number(bars[mid]?.t || 0);
    if (ts >= target) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
};

const sliceBarsByTime = (bars: Candle[], fromMs: number, toMs: number) => {
  if (!bars.length) return [];
  const start = findIndexAtOrAfter(bars, fromMs);
  const end = findIndexAtOrAfter(bars, toMs);
  if (start >= bars.length || start >= end) return [];
  return bars.slice(start, end);
};

const buildWalkForwardFolds = (bars: Candle[], trainDays: number, testDays: number, stepDays: number) => {
  const folds: Array<{
    trainBars: Candle[];
    testBars: Candle[];
    trainStartMs: number;
    trainEndMs: number;
    testStartMs: number;
    testEndMs: number;
  }> = [];
  if (!bars.length) return folds;
  const trainMs = Math.max(1, trainDays) * 24 * 60 * 60 * 1000;
  const testMs = Math.max(1, testDays) * 24 * 60 * 60 * 1000;
  const stepMs = Math.max(1, stepDays) * 24 * 60 * 60 * 1000;
  const firstTs = Number(bars[0]?.t || 0);
  const lastTs = Number(bars[bars.length - 1]?.t || 0);
  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs)) return folds;

  let cursor = firstTs;
  let guard = 0;
  while (cursor + trainMs + testMs <= lastTs && guard < 200) {
    const trainStart = cursor;
    const trainEnd = trainStart + trainMs;
    const testEnd = trainEnd + testMs;
    const trainBars = sliceBarsByTime(bars, trainStart, trainEnd);
    const testBars = sliceBarsByTime(bars, trainEnd, testEnd);
    if (trainBars.length >= 10 && testBars.length >= 5) {
      folds.push({
        trainBars,
        testBars,
        trainStartMs: trainStart,
        trainEndMs: trainEnd,
        testStartMs: trainEnd,
        testEndMs: testEnd
      });
    }
    cursor += stepMs;
    guard += 1;
  }

  return folds;
};

const computeParetoFront = (candidates: OptimizerCandidate[]) => {
  const front: OptimizerCandidate[] = [];
  for (const a of candidates) {
    let dominated = false;
    for (const b of candidates) {
      if (a === b) continue;
      const aWin = a.test.winRate ?? -Infinity;
      const bWin = b.test.winRate ?? -Infinity;
      const aExp = a.test.expectancy ?? -Infinity;
      const bExp = b.test.expectancy ?? -Infinity;
      const aDd = a.test.maxDrawdown ?? Infinity;
      const bDd = b.test.maxDrawdown ?? Infinity;
      const betterOrEqual = bWin >= aWin && bExp >= aExp && bDd <= aDd;
      const strictlyBetter = bWin > aWin || bExp > aExp || bDd < aDd;
      if (betterOrEqual && strictlyBetter) {
        dominated = true;
        break;
      }
    }
    if (!dominated) front.push(a);
  }
  return front;
};

const saveSessionState = async (session: OptimizerSession, results?: OptimizerResults | null) => {
  const summary = `${session.symbol} ${session.timeframe} ${session.status}`;
  const payload = {
    ...session,
    stats: results?.recommended?.test
      ? {
          total: results.recommended.test.tradeCount,
          winRate: results.recommended.test.winRate,
          expectancy: results.recommended.test.expectancy,
          profitFactor: results.recommended.test.profitFactor
        }
      : null,
    performance: results?.recommended?.test
      ? {
          netR: results.recommended.test.netR,
          maxDrawdown: results.recommended.test.maxDrawdown
        }
      : null,
    resultsSummary: results
      ? {
          recommended: results.recommended,
          paretoCount: results.pareto.length,
          evaluated: results.evaluated,
          totalCombos: results.totalCombos
        }
      : null
  };
  await saveAgentMemory({
    key: `optimizer_session:${session.sessionId}`,
    familyKey: `optimizer_session:${session.symbol}:${session.timeframe}`,
    kind: 'optimizer_session',
    symbol: session.symbol,
    timeframe: session.timeframe,
    summary,
    payload,
    tags: [session.symbol, session.timeframe, session.strategy, 'optimizer'].filter(Boolean),
    source: 'optimizer'
  });

  if (results) {
    await saveAgentMemory({
      key: `optimizer_results:${session.sessionId}`,
      familyKey: `optimizer_session:${session.sessionId}`,
      kind: 'optimizer_results',
      symbol: session.symbol,
      timeframe: session.timeframe,
      summary: `Optimizer results ${session.symbol} ${session.timeframe}`,
      payload: results,
      tags: [session.symbol, session.timeframe, session.strategy, 'optimizer', 'results'].filter(Boolean),
      source: 'optimizer'
    });
  }
};

export const getLatestOptimizerSession = async (opts: { symbol?: string; timeframe?: string; baselineRunId?: string } = {}) => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.listAgentMemory) return null;
  const res = await ledger.listAgentMemory({
    limit: 10,
    kind: 'optimizer_session',
    symbol: opts.symbol || undefined,
    timeframe: opts.timeframe || undefined
  });
  if (!res?.ok || !Array.isArray(res.memories)) return null;
  const entries = res.memories;
  if (opts.baselineRunId) {
    const found = entries.find((entry: any) => entry?.payload?.baselineRunId === opts.baselineRunId);
    return found?.payload || null;
  }
  return entries[0]?.payload || null;
};

export const getOptimizerResults = async (sessionId: string) => {
  const state = activeSessions.get(sessionId);
  if (state?.results) return state.results;
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.getAgentMemory) return null;
  const res = await ledger.getAgentMemory({ key: `optimizer_results:${sessionId}`, touch: true });
  return res?.ok ? (res.memory?.payload as OptimizerResults) : null;
};

export const getOptimizerStatus = async (sessionId: string) => {
  const state = activeSessions.get(sessionId);
  if (state?.session) return state.session;
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.getAgentMemory) return null;
  const res = await ledger.getAgentMemory({ key: `optimizer_session:${sessionId}`, touch: true });
  return res?.ok ? (res.memory?.payload as OptimizerSession) : null;
};

export const startOptimizationSession = async (
  args: StartOptimizerArgs,
  opts?: { onProgress?: (progress: OptimizerProgress) => void }
) => {
  const symbol = String(args.symbol || '').trim();
  const timeframe = normalizeTimeframeKey(String(args.timeframe || '').trim());
  const strategy = normalizeStrategy(args.strategy);
  if (!symbol || !timeframe) throw new Error('Optimizer requires symbol and timeframe.');
  if (!args.paramGrid || Object.keys(args.paramGrid).length === 0) {
    throw new Error('Optimizer requires a parameter grid.');
  }

  const now = nowMs();
  const sessionId = `opt_${now}_${Math.random().toString(16).slice(2, 8)}`;
  const objective = normalizeObjective(args.objective || null, args.objectivePreset || null);
  const validation = normalizeValidation(args.validation || null);
  const session: OptimizerSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId,
    status: 'running',
    symbol,
    timeframe,
    strategy,
    rangeDays: Math.max(1, Math.floor(Number(args.rangeDays) || 90)),
    baselineRunId: args.baselineRunId || null,
    objective,
    validation,
    createdAtMs: now,
    updatedAtMs: now,
    progress: { phase: 'idle', done: 0, total: 0, pct: 0 }
  };
  const paramGridSummary = buildParamGridSummary(args.paramGrid);
  const paramGridHash = args.paramGrid ? hashStringSampled(stableStringify(args.paramGrid)) : null;

  activeSessions.set(sessionId, { session, results: null });
  await saveSessionState(session, null);

  const updateProgress = (progress: OptimizerProgress) => {
    const state = activeSessions.get(sessionId);
    if (!state) return;
    state.session = { ...state.session, progress, updatedAtMs: nowMs() };
    activeSessions.set(sessionId, state);
    opts?.onProgress?.(progress);
  };

  const finalizeSession = async (next: OptimizerSession, results?: OptimizerResults | null) => {
    const state = activeSessions.get(sessionId);
    const updated = { ...next, updatedAtMs: nowMs() };
    if (state) {
      state.session = updated;
      state.results = results || null;
      activeSessions.set(sessionId, state);
    }
    await saveSessionState(updated, results || null);
  };

  const run = async () => {
    try {
      const history = await loadBacktestOptimizationHistory({
        symbol,
        strategy,
        timeframe,
        rangeDays: session.rangeDays,
        timeFilter: args.timeFilter,
        maxCombos: args.maxCombos,
        paramGrid: args.paramGrid
      });

      if (!history.ok || !Array.isArray(history.bars) || history.bars.length === 0) {
        throw new Error(history.error || 'Broker history unavailable for optimization.');
      }

      const bars = history.bars;
      const validation = session.validation;
      const warnings: string[] = [];
      const cacheContext = `${symbol}|${timeframe}|${session.rangeDays}`;
      let trainBars = bars;
      let testBars: Candle[] = [];
      let useWalkForward = validation.mode === 'walk_forward';
      let walkForwardFolds: Array<{
        trainBars: Candle[];
        testBars: Candle[];
        trainStartMs: number;
        trainEndMs: number;
        testStartMs: number;
        testEndMs: number;
      }> = [];

      if (useWalkForward) {
        walkForwardFolds = buildWalkForwardFolds(
          bars,
          validation.trainDays || 90,
          validation.testDays || 30,
          validation.stepDays || 30
        );
        if (walkForwardFolds.length < 2) {
          warnings.push('Walk-forward folds too small; falling back to single split.');
          useWalkForward = false;
        }
      }

      if (!useWalkForward) {
        let splitIndex = Math.floor((bars.length - 1) * (validation.splitPercent / 100));
        if (validation.mode === 'last_days') {
          const cutoff = bars[bars.length - 1]?.t - validation.lastDays * 24 * 60 * 60 * 1000;
          const idx = bars.findIndex((bar) => Number(bar?.t) >= cutoff);
          if (idx > 0) splitIndex = idx;
        }
        splitIndex = Math.max(10, Math.min(splitIndex, bars.length - 2));
        trainBars = bars.slice(0, splitIndex + 1);
        testBars = bars.slice(splitIndex + 1);
        if (testBars.length < 10) warnings.push('Test window too small; results may be unstable.');
      }

      const totalCombos = Math.max(1, Math.floor(Number(args.maxCombos) || 200));

      updateProgress({ phase: 'train', done: 0, total: totalCombos, pct: 0, label: 'Training' });

      const trainResult = await runBacktestOptimizationWorker(
        {
          request: {
            symbol,
            strategy,
            timeframe,
            rangeDays: session.rangeDays,
            timeFilter: args.timeFilter,
            maxCombos: totalCombos,
            paramGrid: args.paramGrid,
            execution: args.execution
          },
          bars: useWalkForward ? (walkForwardFolds[0]?.trainBars || trainBars) : trainBars,
          runId: sessionId,
          startedAtMs: now
        },
        {
          includeResults: true,
          onProgress: (progress) => {
            const pct = progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
            updateProgress({
              phase: 'train',
              done: progress.done,
              total: progress.total,
              pct: Math.round(pct * 100),
              label: `Training ${progress.done}/${progress.total}`
            });
          }
        }
      );

      const configs = Array.isArray(trainResult.allConfigs) ? trainResult.allConfigs : [];
      if (!trainResult.ok || configs.length === 0) {
        throw new Error(trainResult.error || 'Training optimization returned no results.');
      }

      const minTrades = Math.max(1, Math.floor(Number(objective.minTradeCount) || 1));
      const weights = objective.weights || { winRate: 0.4, expectancy: 0.4, drawdown: 0.3 };
      const penaltyWeight = Number.isFinite(Number(objective.penaltyWeight)) ? Number(objective.penaltyWeight) : 0.4;

      const seenParams = new Set<string>();
      const uniqueParams: Record<string, any>[] = [];
      for (const entry of configs) {
        const hash = hashStringSampled(stableStringify(entry.params));
        if (seenParams.has(hash)) continue;
        seenParams.add(hash);
        uniqueParams.push(entry.params);
      }

      const evaluated: OptimizerCandidate[] = [];
      const batchSize = 25;
      const evalTotal = useWalkForward ? uniqueParams.length : configs.length;
      updateProgress({ phase: 'test', done: 0, total: evalTotal, pct: 0, label: 'Testing' });

      if (useWalkForward) {
        if (uniqueParams.length === 0) warnings.push('No candidates returned from training pass.');
        for (let i = 0; i < uniqueParams.length; i += 1) {
          const params = uniqueParams[i];
          const paramsHash = hashStringSampled(stableStringify(params));
          const trainFolds: Array<{ stats: BacktestStats; performance: { netR: number; maxDrawdown: number } }> = [];
          const testFolds: Array<{ stats: BacktestStats; performance: { netR: number; maxDrawdown: number } }> = [];
          const testFoldMetrics: OptimizerMetricsPack[] = [];

          for (let f = 0; f < walkForwardFolds.length; f += 1) {
            const fold = walkForwardFolds[f];
            const trainEval = await evaluateParamsCached(
              strategy,
              params,
              fold.trainBars,
              args.timeFilter,
              args.execution,
              `${cacheContext}|train${f}`
            );
            const testEval = await evaluateParamsCached(
              strategy,
              params,
              fold.testBars,
              args.timeFilter,
              args.execution,
              `${cacheContext}|test${f}`
            );
            trainFolds.push({ stats: trainEval.stats, performance: trainEval.performance });
            testFolds.push({ stats: testEval.stats, performance: testEval.performance });
            const foldEdge = computeEdgeMetrics(testEval.stats);
            testFoldMetrics.push({
              tradeCount: testEval.tradeCount,
              winRate: testEval.stats.winRate ?? null,
              expectancy: testEval.stats.expectancy ?? null,
              profitFactor: testEval.stats.profitFactor ?? null,
              netR: Number(testEval.performance.netR) || 0,
              maxDrawdown: Number(testEval.performance.maxDrawdown) || 0,
              avgWinR: foldEdge.avgWinR,
              avgLossR: foldEdge.avgLossR,
              payoffRatio: foldEdge.payoffRatio,
              edgeMargin: foldEdge.edgeMargin
            });
          }

          const train = aggregateFoldMetrics(trainFolds);
          const test = aggregateFoldMetrics(testFolds);
          const penalty = computePenalty(train, test, penaltyWeight);
          const stabilityPenalty = computeFoldStabilityPenalty(testFoldMetrics, penaltyWeight);

          evaluated.push({
            params,
            paramsHash,
            train,
            test,
            score: 0,
            stabilityScore: Math.max(0, Math.min(1, 1 - (penalty + stabilityPenalty))),
            isPareto: false,
            penalty,
            stabilityPenalty
          });

          if ((i + 1) % batchSize === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 0));
          }
          const pct = evalTotal > 0 ? Math.min(1, (i + 1) / evalTotal) : 0;
          updateProgress({
            phase: 'test',
            done: i + 1,
            total: evalTotal,
            pct: Math.round(pct * 100),
            label: `Testing ${i + 1}/${evalTotal}`
          });
        }
      } else {
        const filtered = configs.filter((entry) => (entry.stats?.closed || entry.stats?.total || 0) >= minTrades);
        const candidates = filtered.length > 0 ? filtered : configs;
        if (candidates.length === 0) warnings.push('No candidates met minimum trade count.');

        for (let i = 0; i < candidates.length; i += 1) {
          const entry = candidates[i];
          const paramsHash = hashStringSampled(stableStringify(entry.params));
          const trainStats = entry.stats || ({} as BacktestStats);
          const trainPerf = entry.performance || { netR: 0, maxDrawdown: 0 };
          const trainEdge = computeEdgeMetrics(trainStats);
          const train: OptimizerMetricsPack = {
            tradeCount: trainStats.closed || trainStats.total || 0,
            winRate: trainStats.winRate ?? null,
            expectancy: trainStats.expectancy ?? null,
            profitFactor: trainStats.profitFactor ?? null,
            netR: Number(trainPerf.netR) || 0,
            maxDrawdown: Number(trainPerf.maxDrawdown) || 0,
            avgWinR: trainEdge.avgWinR,
            avgLossR: trainEdge.avgLossR,
            payoffRatio: trainEdge.payoffRatio,
            edgeMargin: trainEdge.edgeMargin
          };

          const testEval = await evaluateParamsCached(strategy, entry.params, testBars, args.timeFilter, args.execution, cacheContext);
          const testStats = testEval.stats;
          const testEdge = computeEdgeMetrics(testStats);
          const test: OptimizerMetricsPack = {
            tradeCount: testEval.tradeCount,
            winRate: testStats.winRate ?? null,
            expectancy: testStats.expectancy ?? null,
            profitFactor: testStats.profitFactor ?? null,
            netR: Number(testEval.performance.netR) || 0,
            maxDrawdown: Number(testEval.performance.maxDrawdown) || 0,
            avgWinR: testEdge.avgWinR,
            avgLossR: testEdge.avgLossR,
            payoffRatio: testEdge.payoffRatio,
            edgeMargin: testEdge.edgeMargin
          };

          evaluated.push({
            params: entry.params,
            paramsHash,
            train,
            test,
            score: 0,
            stabilityScore: 0,
            isPareto: false
          });

          if ((i + 1) % batchSize === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 0));
          }
          const pct = evalTotal > 0 ? Math.min(1, (i + 1) / evalTotal) : 0;
          updateProgress({
            phase: 'test',
            done: i + 1,
            total: evalTotal,
            pct: Math.round(pct * 100),
            label: `Testing ${i + 1}/${evalTotal}`
          });
        }
      }

      const filteredCandidates = evaluated.filter((candidate) => {
        if (candidate.test.tradeCount < minTrades) return false;
        if (objective.minExpectancy != null) {
          if (candidate.test.expectancy == null || candidate.test.expectancy < objective.minExpectancy) return false;
        }
        if (objective.minEdgeMargin != null) {
          if (candidate.test.edgeMargin == null || candidate.test.edgeMargin < objective.minEdgeMargin) return false;
        }
        if (objective.minProfitFactor != null) {
          if (candidate.test.profitFactor == null || candidate.test.profitFactor < objective.minProfitFactor) return false;
        }
        if (objective.maxDrawdown != null && candidate.test.maxDrawdown > objective.maxDrawdown) return false;
        return true;
      });

      const pool = filteredCandidates.length > 0 ? filteredCandidates : evaluated;
      if (pool.length === 0) warnings.push('No candidates left after applying constraints.');

      const winRates = pool.map((c) => c.test.winRate ?? 0);
      const expectancies = pool.map((c) => c.test.expectancy ?? 0);
      const drawdowns = pool.map((c) => c.test.maxDrawdown ?? 0);
      const minWin = Math.min(...winRates);
      const maxWin = Math.max(...winRates);
      const minExp = Math.min(...expectancies);
      const maxExp = Math.max(...expectancies);
      const minDd = Math.min(...drawdowns);
      const maxDd = Math.max(...drawdowns);

      for (const candidate of pool) {
        const winScore = normalizeMetric(candidate.test.winRate ?? 0, minWin, maxWin, false);
        const expScore = normalizeMetric(candidate.test.expectancy ?? 0, minExp, maxExp, false);
        const ddScore = normalizeMetric(candidate.test.maxDrawdown ?? 0, minDd, maxDd, true);
        const penalty = candidate.penalty ?? computePenalty(candidate.train, candidate.test, penaltyWeight);
        const stabilityPenalty = candidate.stabilityPenalty ?? 0;
        const rawScore = winScore * (weights.winRate ?? 0) + expScore * (weights.expectancy ?? 0) + ddScore * (weights.drawdown ?? 0);
        candidate.score = rawScore - penalty - stabilityPenalty;
        candidate.stabilityScore = Math.max(0, Math.min(1, 1 - (penalty + stabilityPenalty)));
        candidate.penalty = penalty;
        candidate.stabilityPenalty = stabilityPenalty;
      }

      const pareto = computeParetoFront(pool);
      for (const candidate of pareto) candidate.isPareto = true;
      pool.sort((a, b) => b.score - a.score);
      const topCandidates = pool.slice(0, MAX_RESULTS);
      const recommended = topCandidates[0] || null;
      let recommendedDiagnostics: TradeDiagnostics | null = null;
      if (recommended) {
        if (useWalkForward && walkForwardFolds.length > 0) {
          const trades: BacktestTrade[] = [];
          let worstFold: TradeDiagnostics['worstFold'] = null;
          let worstDd = -Infinity;
          for (let i = 0; i < walkForwardFolds.length; i += 1) {
            const fold = walkForwardFolds[i];
            const detail = evaluateParamsDetailed(strategy, recommended.params, fold.testBars, args.timeFilter, args.execution);
            trades.push(...detail.trades);
            const dd = Number(detail.performance.maxDrawdown) || 0;
            if (dd >= worstDd) {
              worstDd = dd;
              worstFold = {
                index: i + 1,
                maxDrawdown: dd,
                trainStartMs: fold.trainStartMs || null,
                trainEndMs: fold.trainEndMs || null,
                testStartMs: fold.testStartMs || null,
                testEndMs: fold.testEndMs || null
              };
            }
          }
          if (trades.length > 0) {
            recommendedDiagnostics = buildTradeDiagnostics(trades);
            recommendedDiagnostics.worstFold = worstFold;
          }
        } else if (testBars.length > 0) {
          const detail = evaluateParamsDetailed(strategy, recommended.params, testBars, args.timeFilter, args.execution);
          if (detail.trades.length > 0) {
            recommendedDiagnostics = buildTradeDiagnostics(detail.trades);
          }
        }
      }
      const results: OptimizerResults = {
        sessionId,
        recommended,
        recommendedDiagnostics,
        pareto: pareto.slice(0, MAX_RESULTS),
        topCandidates,
        evaluated: pool.length,
        totalCombos: configs.length,
        warnings
      };

      try {
        await persistOptimizerExperimentRegistry(session, args, results, paramGridSummary, paramGridHash);
      } catch {
        // ignore registry persistence errors
      }

      await finalizeSession({ ...session, status: 'completed', progress: { phase: 'idle', done: pool.length, total: pool.length, pct: 100 } }, results);
    } catch (err: any) {
      const message = err?.message ? String(err.message) : 'Optimizer failed.';
      await finalizeSession({ ...session, status: 'failed', error: message }, null);
    }
  };

  void run();
  return session;
};

export type OptimizationRefinementProposal = {
  sessionId: string;
  symbol: string;
  timeframe: string;
  strategy: BacktestOptimizationStrategy;
  objectivePreset: string;
  paramGrid: BacktestParamGrid;
  rationale: string[];
  diagnostics?: TradeDiagnostics | null;
  baseParams?: Record<string, any> | null;
};

export type OptimizationRefinementResult = {
  ok: boolean;
  error?: string;
  proposal?: OptimizationRefinementProposal | null;
};

const PARAM_MIN: Record<string, number> = {
  lookbackBars: 2,
  atrPeriod: 2,
  atrMult: 0.1,
  rr: 0.2,
  cooldownBars: 0,
  bufferAtrMult: 0,
  maxWaitBars: 0,
  minGapAtrMult: 0,
  fastEma: 2,
  slowEma: 5,
  minTrendBars: 1,
  smaPeriod: 5,
  bandAtrMult: 0.1,
  stopAtrMult: 0.1,
  rsiPeriod: 5,
  rsiOversold: 5,
  rsiOverbought: 50
};

const PARAM_MAX: Record<string, number> = {
  rsiOversold: 50,
  rsiOverbought: 95
};

const clampNumber = (value: number, min?: number, max?: number) => {
  let next = value;
  if (Number.isFinite(min)) next = Math.max(min as number, next);
  if (Number.isFinite(max)) next = Math.min(max as number, next);
  return next;
};

const uniqueNumbers = (values: number[]) => {
  const seen = new Set<number>();
  const next: number[] = [];
  for (const raw of values) {
    const num = Number(raw);
    if (!Number.isFinite(num)) continue;
    const rounded = Math.round(num * 10000) / 10000;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    next.push(rounded);
  }
  return next;
};

const buildNumericGrid = (key: string, value: number) => {
  const min = PARAM_MIN[key];
  const max = PARAM_MAX[key];
  if (!Number.isFinite(value)) return [];
  const isInt = Math.abs(value - Math.round(value)) < 1e-6;
  const normalized = clampNumber(value, min, max);
  if (!Number.isFinite(normalized)) return [];
  if (normalized <= 0 && !isInt) return uniqueNumbers([normalized]);

  let candidates: number[] = [];
  if (isInt) {
    const base = Math.round(normalized);
    const step = base <= 0 ? 1 : 1;
    candidates = [base - step, base, base + step];
  } else {
    const delta = normalized * 0.15;
    candidates = [normalized - delta, normalized, normalized + delta];
  }

  const clamped = candidates.map((val) => clampNumber(val, min, max));
  const finalValues = uniqueNumbers(clamped).filter((val) => (min != null ? val >= min : true));
  return finalValues.length > 0 ? finalValues : uniqueNumbers([normalized]);
};

const buildRefinedParamGrid = (params: Record<string, any> | null | undefined): BacktestParamGrid => {
  const grid: BacktestParamGrid = {};
  if (!params || typeof params !== 'object') return grid;

  for (const [key, raw] of Object.entries(params)) {
    if (raw == null) continue;
    if (Array.isArray(raw) && raw.length > 0) {
      const first = raw[0];
      if (typeof first === 'number') {
        const next = buildNumericGrid(key, Number(first));
        if (next.length > 0) (grid as any)[key] = next;
      } else if (typeof first === 'string' || typeof first === 'boolean') {
        (grid as any)[key] = [first];
      }
      continue;
    }
    if (typeof raw === 'number') {
      const next = buildNumericGrid(key, Number(raw));
      if (next.length > 0) (grid as any)[key] = next;
      continue;
    }
    if (typeof raw === 'boolean' || typeof raw === 'string') {
      (grid as any)[key] = [raw];
    }
  }

  return grid;
};

const pickObjectivePreset = (
  candidate: OptimizerCandidate,
  diagnostics?: TradeDiagnostics | null,
  objective?: OptimizationObjective | null
) => {
  const dd = Number(candidate?.test?.maxDrawdown);
  const winRate = Number(candidate?.test?.winRate);
  const expectancy = Number(candidate?.test?.expectancy);
  const objectiveDd = Number(objective?.maxDrawdown);
  const reasons: string[] = [];
  let preset = 'balanced';

  if (Number.isFinite(dd) && (dd > 12 || (Number.isFinite(objectiveDd) && dd > objectiveDd))) {
    preset = 'winrate_dd';
    reasons.push('Drawdown elevated; bias toward winRate + low DD preset.');
  } else if (Number.isFinite(expectancy) && expectancy > 0.05 && (!Number.isFinite(winRate) || winRate < 0.5)) {
    preset = 'aggressive';
    reasons.push('Expectancy strong with modest win rate; allow growth preset.');
  }

  if (diagnostics?.losses && diagnostics.losses > 0 && diagnostics.lossByHour?.[0]) {
    const topHour = diagnostics.lossByHour[0];
    if (topHour.count / diagnostics.losses > 0.4) {
      reasons.push(`Losses cluster at hour ${topHour.hour}; consider a time filter or session gate.`);
    }
  }

  if (diagnostics?.losses && diagnostics.losses > 0 && diagnostics.lossByDay?.[0]) {
    const topDay = diagnostics.lossByDay[0];
    if (topDay.count / diagnostics.losses > 0.4) {
      reasons.push(`Losses cluster on day ${topDay.day}; consider a day-of-week filter.`);
    }
  }

  return { preset, reasons };
};

export const proposeOptimizationRefinement = async (args: {
  sessionId?: string;
  baselineRunId?: string;
  symbol?: string;
  timeframe?: string;
}): Promise<OptimizationRefinementResult> => {
  const sessionId = args.sessionId ? String(args.sessionId).trim() : '';
  let session = sessionId ? await getOptimizerStatus(sessionId) : null;
  if (!session) {
    session = await getLatestOptimizerSession({
      symbol: args.symbol,
      timeframe: args.timeframe,
      baselineRunId: args.baselineRunId
    });
  }
  if (!session) return { ok: false, error: 'Optimizer session not found.' };

  const results = await getOptimizerResults(session.sessionId);
  if (!results) return { ok: false, error: 'Optimizer results unavailable.' };

  const candidate = results.recommended || results.topCandidates?.[0] || null;
  if (!candidate) return { ok: false, error: 'No optimizer candidates found to refine.' };

  const paramGrid = buildRefinedParamGrid(candidate.params);
  const diagnostics = results.recommendedDiagnostics || null;
  const pick = pickObjectivePreset(candidate, diagnostics, session.objective || null);
  const rationale = pick.reasons.length > 0 ? pick.reasons : ['Refined grid centers around the best candidate params.'];

  return {
    ok: true,
    proposal: {
      sessionId: session.sessionId,
      symbol: session.symbol,
      timeframe: session.timeframe,
      strategy: session.strategy,
      objectivePreset: pick.preset,
      paramGrid,
      rationale,
      diagnostics,
      baseParams: candidate.params
    }
  };
};
