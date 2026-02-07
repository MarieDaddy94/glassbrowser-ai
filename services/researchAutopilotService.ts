import {
  loadBacktestOptimizationHistory,
  type BacktestOptimizationStrategy,
  type BacktestParamGrid,
  type TimeFilter
} from './backtestResearchService';
import {
  DEFAULT_OPTIMIZER_PRESETS,
  evaluateParamsOnBars,
  getOptimizerResults,
  getOptimizerStatus,
  proposeOptimizationRefinement,
  startOptimizationSession,
  type OptimizationObjective,
  type OptimizationValidation,
  type OptimizerCandidate,
  type OptimizerResults
} from './optimizerLoopService';
import { normalizeExecutionConfig, type ExecutionConfig } from './executionModel';
import { hashStringSampled } from './stringHash';
import { classifyRegime, summarizeRegimeCoverage, type RegimeCoverageSummary } from './regimeClassifier';

export type ResearchRobustnessPlan = {
  spreadBpsVariants?: number[];
  slippagePctVariants?: number[];
  oosShiftDays?: number[];
};

export type ResearchAutopilotConfig = {
  symbol: string;
  timeframe: string;
  strategy: BacktestOptimizationStrategy;
  objectivePreset?: string;
  objective?: OptimizationObjective;
  validation?: OptimizationValidation;
  timeFilter?: TimeFilter;
  rangeDays?: number;
  maxCombos?: number;
  maxExperiments?: number;
  maxRuntimeSec?: number;
  plateauLimit?: number;
  minDelta?: number;
  maxRobustnessFailures?: number;
  maxRateLimitPauses?: number;
  paramGrid?: BacktestParamGrid;
  searchSpacePreset?: string;
  execution?: Partial<ExecutionConfig>;
  robustness?: ResearchRobustnessPlan;
  robustnessLevel?: 'lite' | 'standard' | 'strict';
  allowRegimeBrittle?: boolean;
  requiredRegimePassRate?: number;
  criticalRegimes?: string[];
  minRegimesSeen?: number;
  targetRegimeKey?: string | null;
  minTargetRegimeSamples?: number;
};

export type ResearchSessionStatus = 'running' | 'paused' | 'stopped' | 'completed' | 'failed';

export type ResearchSessionStats = {
  experimentsPlanned: number;
  experimentsRun: number;
  bestScore: number | null;
  bestExperimentId?: string | null;
  lastExperimentId?: string | null;
  warnings?: string[];
  lastError?: string | null;
  robustnessFailures?: number;
  rateLimitPauses?: number;
  targetRegimeKey?: string | null;
  targetRegimeOutcome?: { foundChampion: boolean; reason?: string | null; samples?: number | null } | null;
  champion?: {
    experimentId?: string | null;
    experimentNoteId?: string | null;
    paramsHash?: string | null;
    score?: number | null;
    decision?: string | null;
    testMetrics?: Record<string, any> | null;
    robustnessWorstCase?: Record<string, any> | null;
    regimeCoverageSummary?: RegimeCoverageSummary | null;
    penalties?: {
      penalty?: number | null;
      stabilityPenalty?: number | null;
    } | null;
    updatedAtMs?: number | null;
  } | null;
  championsByRegime?: Record<string, RegimeChampionRecord> | null;
  regimeFrequency?: Record<string, number> | null;
};

export type RegimeChampionRecord = {
  regimeKey: string;
  experimentNoteId?: string | null;
  paramsHash?: string | null;
  score?: number | null;
  decision?: string | null;
  testMetrics?: Record<string, any> | null;
  robustnessWorstCase?: Record<string, any> | null;
  penalties?: {
    penalty?: number | null;
    stabilityPenalty?: number | null;
  } | null;
  updatedAtMs?: number | null;
};

export type ResearchSession = {
  sessionId: string;
  status: ResearchSessionStatus;
  symbol: string;
  timeframe: string;
  strategy: BacktestOptimizationStrategy;
  objectivePreset?: string | null;
  config: ResearchAutopilotConfig;
  stats: ResearchSessionStats;
  createdAtMs: number;
  updatedAtMs: number;
};

type ActiveSession = {
  session: ResearchSession;
  stopRequested: boolean;
  stepIndex: number;
  noImproveCount: number;
  robustFailCount: number;
  rateLimitPauses: number;
  seenFingerprints: Set<string>;
};

const activeSessions = new Map<string, ActiveSession>();

const nowMs = () => Date.now();
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const inferRobustnessLevel = (plan?: ResearchRobustnessPlan | null) => {
  const spreads = plan?.spreadBpsVariants || [];
  const slippage = plan?.slippagePctVariants || [];
  const shifts = plan?.oosShiftDays || [];
  const maxSpread = spreads.length ? Math.max(...spreads) : 0;
  const maxSlippage = slippage.length ? Math.max(...slippage) : 0;
  const maxShift = shifts.length ? Math.max(...shifts) : 0;
  if (maxSpread >= 15 || maxSlippage >= 0.03 || maxShift >= 14) return 'strict';
  if (maxSpread <= 5 && maxSlippage <= 0.01 && maxShift <= 0) return 'lite';
  return 'standard';
};

const normalizeConfig = (config: ResearchAutopilotConfig): ResearchAutopilotConfig => {
  const preset = DEFAULT_OPTIMIZER_PRESETS.find((p) => p.id === config.objectivePreset) || DEFAULT_OPTIMIZER_PRESETS[1];
  const robustness = {
    spreadBpsVariants: Array.isArray(config.robustness?.spreadBpsVariants)
      ? config.robustness?.spreadBpsVariants
      : [0, 10],
    slippagePctVariants: Array.isArray(config.robustness?.slippagePctVariants)
      ? config.robustness?.slippagePctVariants
      : [0, 0.02],
    oosShiftDays: Array.isArray(config.robustness?.oosShiftDays)
      ? config.robustness?.oosShiftDays
      : [0, 7]
  };
  const robustnessLevel = config.robustnessLevel || inferRobustnessLevel(robustness);
  const regimeDefaults = robustnessLevel === 'lite'
    ? { passRate: 0.5, critical: ['high_trend_ny'], minSeen: 1 }
    : robustnessLevel === 'strict'
      ? { passRate: 0.75, critical: ['high_trend_ny', 'high_range_ny', 'high_trend_london'], minSeen: 3 }
      : { passRate: 0.6, critical: ['high_trend_ny', 'high_range_ny'], minSeen: 2 };
  const targetDefaults = robustnessLevel === 'lite' ? 1 : robustnessLevel === 'strict' ? 3 : 2;
  return {
    ...config,
    objectivePreset: config.objectivePreset || preset.id,
    rangeDays: Number.isFinite(Number(config.rangeDays)) ? Math.max(1, Math.floor(Number(config.rangeDays))) : 90,
    maxCombos: Number.isFinite(Number(config.maxCombos)) ? Math.max(20, Math.floor(Number(config.maxCombos))) : 200,
    maxExperiments: Number.isFinite(Number(config.maxExperiments)) ? Math.max(1, Math.floor(Number(config.maxExperiments))) : 3,
    maxRuntimeSec: Number.isFinite(Number(config.maxRuntimeSec)) ? Math.max(60, Math.floor(Number(config.maxRuntimeSec))) : 900,
    plateauLimit: Number.isFinite(Number(config.plateauLimit)) ? Math.max(1, Math.floor(Number(config.plateauLimit))) : 2,
    minDelta: Number.isFinite(Number(config.minDelta)) ? Math.max(0, Number(config.minDelta)) : undefined,
    maxRobustnessFailures: Number.isFinite(Number(config.maxRobustnessFailures))
      ? Math.max(1, Math.floor(Number(config.maxRobustnessFailures)))
      : undefined,
    maxRateLimitPauses: Number.isFinite(Number(config.maxRateLimitPauses))
      ? Math.max(1, Math.floor(Number(config.maxRateLimitPauses)))
      : undefined,
    robustness,
    robustnessLevel,
    allowRegimeBrittle: typeof config.allowRegimeBrittle === 'boolean' ? config.allowRegimeBrittle : false,
    requiredRegimePassRate: Number.isFinite(Number(config.requiredRegimePassRate))
      ? Math.max(0, Math.min(1, Number(config.requiredRegimePassRate)))
      : regimeDefaults.passRate,
    criticalRegimes: Array.isArray(config.criticalRegimes) && config.criticalRegimes.length > 0
      ? config.criticalRegimes.map((entry) => String(entry))
      : regimeDefaults.critical,
    minRegimesSeen: Number.isFinite(Number(config.minRegimesSeen))
      ? Math.max(1, Math.floor(Number(config.minRegimesSeen)))
      : regimeDefaults.minSeen,
    targetRegimeKey: config.targetRegimeKey ? String(config.targetRegimeKey) : null,
    minTargetRegimeSamples: Number.isFinite(Number(config.minTargetRegimeSamples))
      ? Math.max(1, Math.floor(Number(config.minTargetRegimeSamples)))
      : targetDefaults
  };
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

const buildExperimentFingerprint = (payload: Record<string, any>) => {
  return hashStringSampled(stableStringify(payload), 2048);
};

const resolveStopPolicy = (config: ResearchAutopilotConfig) => {
  const level = config.robustnessLevel || 'standard';
  const defaults = level === 'lite'
    ? { minDelta: 0.01, maxRobustnessFailures: 4, maxRateLimitPauses: 3 }
    : level === 'strict'
      ? { minDelta: 0.03, maxRobustnessFailures: 2, maxRateLimitPauses: 2 }
      : { minDelta: 0.02, maxRobustnessFailures: 3, maxRateLimitPauses: 2 };
  return {
    minDelta: config.minDelta != null ? config.minDelta : defaults.minDelta,
    plateauLimit: config.plateauLimit || 2,
    maxRobustnessFailures: config.maxRobustnessFailures || defaults.maxRobustnessFailures,
    maxRateLimitPauses: config.maxRateLimitPauses || defaults.maxRateLimitPauses
  };
};

const fetchParamGridFromPreset = async (
  symbol: string,
  timeframe: string,
  strategy: BacktestOptimizationStrategy,
  presetKey?: string | null
): Promise<BacktestParamGrid | null> => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.getAgentMemory) return null;
  const key = presetKey || `backtest_preset:${symbol}:${strategy}:${timeframe}`;
  try {
    let res = await ledger.getAgentMemory({ key, touch: true });
    if (!res?.ok && !presetKey) {
      const fallbackKey = `backtest_preset:${symbol}:${strategy}`;
      res = await ledger.getAgentMemory({ key: fallbackKey, touch: true });
    }
    const grid = res?.memory?.payload?.paramGrid;
    if (grid && typeof grid === 'object') return grid;
  } catch {
    // ignore
  }
  return null;
};

const persistSession = async (session: ResearchSession) => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.createResearchSession) return;
  await ledger.createResearchSession({
    sessionId: session.sessionId,
    status: session.status,
    symbol: session.symbol,
    timeframe: session.timeframe,
    strategy: session.strategy,
    objectivePreset: session.objectivePreset || null,
    config: session.config,
    stats: session.stats,
    createdAtMs: session.createdAtMs,
    updatedAtMs: session.updatedAtMs
  });
};

const appendStep = async (sessionId: string, stepIndex: number, kind: string, payload?: any) => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.appendResearchStep) return;
  await ledger.appendResearchStep({ sessionId, stepIndex, kind, payload });
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

const saveAgentMemory = async (entry: {
  key: string;
  familyKey?: string | null;
  kind: string;
  symbol?: string | null;
  timeframe?: string | null;
  summary?: string | null;
  payload?: any;
  tags?: string[];
  source?: string | null;
}) => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.upsertAgentMemory) return;
  await ledger.upsertAgentMemory({
    key: entry.key,
    familyKey: entry.familyKey || null,
    kind: entry.kind,
    symbol: entry.symbol || null,
    timeframe: entry.timeframe || null,
    summary: entry.summary || null,
    payload: entry.payload || null,
    source: entry.source || 'research_autopilot',
    tags: entry.tags || []
  });
};

const buildOptimizerSummary = (results: OptimizerResults | null | undefined) => {
  if (!results) return null;
  return {
    evaluated: results.evaluated,
    totalCombos: results.totalCombos,
    paretoCount: results.pareto.length,
    recommendedScore: Number.isFinite(Number(results.recommended?.score)) ? Number(results.recommended?.score) : null,
    recommendedTrades: results.recommended?.test?.tradeCount ?? null,
    recommendedWinRate: results.recommended?.test?.winRate ?? null
  };
};

const persistResearchExperimentRegistry = async (input: {
  experimentId: string;
  sessionId: string;
  config: ResearchAutopilotConfig;
  objective: OptimizationObjective;
  execution: ExecutionConfig;
  decision: string | null;
  candidate: OptimizerCandidate;
  paramsHash: string | null;
  paramGridHash: string | null;
  paramGridSummary: ParamGridSummary | null;
  refinedGridHash: string | null;
  refinedGridSummary: ParamGridSummary | null;
  round1Results: OptimizerResults | null;
  round2Results: OptimizerResults | null;
  robustnessWorstCase: any;
  coverageSummary: RegimeCoverageSummary | null;
  regimeGate: { ok: boolean; reason: string | null; warnings: string[] };
}) => {
  const score = Number.isFinite(Number(input.candidate.score)) ? Number(input.candidate.score) : null;
  const tradeCount = input.candidate.test?.tradeCount ?? null;
  const winRate = input.candidate.test?.winRate ?? null;
  const summary = [
    `${input.config.symbol} ${input.config.timeframe}`,
    input.config.strategy,
    input.decision ? String(input.decision).toUpperCase() : 'RUN',
    `score ${score != null ? score.toFixed(3) : '--'}`,
    `WR ${winRate != null ? `${(winRate * 100).toFixed(1)}%` : '--'}`,
    `trades ${tradeCount ?? '--'}`
  ].join(' | ');

  const payload = {
    schemaVersion: 1,
    source: 'research_autopilot',
    experimentId: input.experimentId,
    sessionId: input.sessionId,
    symbol: input.config.symbol,
    timeframe: input.config.timeframe,
    strategy: input.config.strategy,
    createdAtMs: nowMs(),
    updatedAtMs: nowMs(),
    inputs: {
      rangeDays: input.config.rangeDays,
      objectivePreset: input.config.objectivePreset ?? null,
      objective: input.objective,
      validation: input.config.validation ?? null,
      timeFilter: input.config.timeFilter ?? null,
      execution: input.execution,
      robustness: input.config.robustness ?? null,
      robustnessLevel: input.config.robustnessLevel ?? null,
      targetRegimeKey: input.config.targetRegimeKey ?? null,
      minTargetRegimeSamples: input.config.minTargetRegimeSamples ?? null,
      paramGridHash: input.paramGridHash,
      paramGridSummary: input.paramGridSummary,
      refinedGridHash: input.refinedGridHash,
      refinedGridSummary: input.refinedGridSummary
    },
    outputs: {
      decision: input.decision,
      score,
      paramsHash: input.paramsHash,
      recommendedParams: input.candidate.params,
      testMetrics: input.candidate.test,
      penalties: {
        penalty: Number.isFinite(Number(input.candidate.penalty)) ? Number(input.candidate.penalty) : null,
        stabilityPenalty: Number.isFinite(Number(input.candidate.stabilityPenalty)) ? Number(input.candidate.stabilityPenalty) : null
      },
      robustnessWorstCase: input.robustnessWorstCase || null,
      regimeCoverageSummary: input.coverageSummary || null,
      regimeGate: input.regimeGate,
      round1Summary: buildOptimizerSummary(input.round1Results),
      round2Summary: buildOptimizerSummary(input.round2Results)
    }
  };

  await saveAgentMemory({
    key: `experiment_registry:research:${input.experimentId}`,
    familyKey: `experiment_registry:${input.config.symbol}:${input.config.timeframe}:${input.config.strategy}`,
    kind: 'experiment_registry',
    symbol: input.config.symbol,
    timeframe: input.config.timeframe,
    summary,
    payload,
    tags: [input.config.symbol, input.config.timeframe, input.config.strategy, 'experiment', 'research'].filter(Boolean),
    source: 'research_autopilot'
  });
};

const resolveObjective = (config: ResearchAutopilotConfig): OptimizationObjective => {
  const preset = DEFAULT_OPTIMIZER_PRESETS.find((p) => p.id === config.objectivePreset) || DEFAULT_OPTIMIZER_PRESETS[1];
  const base = preset.objective || {};
  return {
    minTradeCount: base.minTradeCount ?? 30,
    maxDrawdown: base.maxDrawdown ?? null,
    minProfitFactor: base.minProfitFactor ?? null,
    minExpectancy: base.minExpectancy ?? null,
    minEdgeMargin: base.minEdgeMargin ?? null,
    penaltyWeight: base.penaltyWeight ?? 0.4,
    weights: base.weights,
    ...(config.objective || {})
  };
};

const waitForCompletion = async (
  sessionId: string,
  onProgress?: (progress: { pct: number; done: number; total: number; label?: string }) => void
) => {
  const startedAt = nowMs();
  const timeoutMs = 240_000;
  let lastSession = await getOptimizerStatus(sessionId);
  while (nowMs() - startedAt < timeoutMs) {
    if (lastSession && lastSession.status !== 'running') break;
    await sleep(2000);
    lastSession = await getOptimizerStatus(sessionId);
    if (lastSession?.progress) {
      onProgress?.({
        pct: lastSession.progress.pct,
        done: lastSession.progress.done,
        total: lastSession.progress.total,
        label: lastSession.progress.label
      });
    }
  }
  return lastSession;
};

const selectCandidate = (results: OptimizerResults | null | undefined): OptimizerCandidate | null => {
  if (!results) return null;
  return results.recommended || results.topCandidates?.[0] || null;
};

const splitTestWindow = (bars: Array<{ t: number }>, validation?: OptimizationValidation | null) => {
  if (!bars.length) return { startMs: null, endMs: null };
  const lastTs = bars[bars.length - 1]?.t ?? null;
  const firstTs = bars[0]?.t ?? null;
  if (!Number.isFinite(Number(lastTs)) || !Number.isFinite(Number(firstTs))) return { startMs: null, endMs: null };
  const mode = validation?.mode === 'last_days' ? 'last_days' : validation?.mode === 'walk_forward' ? 'walk_forward' : 'percent';
  if (mode === 'last_days') {
    const lastDays = Number.isFinite(Number(validation?.lastDays)) ? Math.max(5, Math.floor(Number(validation?.lastDays))) : 30;
    return { startMs: Number(lastTs) - lastDays * 24 * 60 * 60 * 1000, endMs: Number(lastTs) };
  }
  if (mode === 'walk_forward') {
    const testDays = Number.isFinite(Number(validation?.testDays)) ? Math.max(5, Math.floor(Number(validation?.testDays))) : 30;
    return { startMs: Number(lastTs) - testDays * 24 * 60 * 60 * 1000, endMs: Number(lastTs) };
  }
  const splitPercent = Number.isFinite(Number(validation?.splitPercent))
    ? Math.max(50, Math.min(90, Number(validation?.splitPercent)))
    : 70;
  const splitIndex = Math.max(1, Math.min(bars.length - 2, Math.floor((bars.length - 1) * (splitPercent / 100))));
  const startMs = bars[splitIndex]?.t ?? lastTs;
  return { startMs, endMs: Number(lastTs) };
};

const sliceBars = <T extends { t: number }>(bars: T[], startMs: number, endMs: number) => {
  return bars.filter((bar) => bar.t >= startMs && bar.t <= endMs);
};

const buildExecutionVariant = (base: ExecutionConfig, variant: { spreadBps?: number; slippagePct?: number }) => {
  const next: Partial<ExecutionConfig> = {};
  if (Number.isFinite(Number(variant.spreadBps))) {
    next.spreadModel = 'percent';
    next.spreadPct = Number(variant.spreadBps) / 100;
  }
  if (Number.isFinite(Number(variant.slippagePct))) {
    next.slippageModel = 'percent';
    next.slippagePct = Number(variant.slippagePct);
  }
  return { ...base, ...next };
};

const checkGuardrails = (metrics: any, objective: OptimizationObjective) => {
  const failures: string[] = [];
  if (objective.minTradeCount != null && metrics.tradeCount < objective.minTradeCount) failures.push('tradeCount');
  if (objective.maxDrawdown != null && metrics.maxDrawdown > objective.maxDrawdown) failures.push('maxDrawdown');
  if (objective.minProfitFactor != null && (metrics.profitFactor == null || metrics.profitFactor < objective.minProfitFactor)) failures.push('profitFactor');
  if (objective.minExpectancy != null && (metrics.expectancy == null || metrics.expectancy < objective.minExpectancy)) failures.push('expectancy');
  if (objective.minEdgeMargin != null && (metrics.edgeMargin == null || metrics.edgeMargin < objective.minEdgeMargin)) failures.push('edgeMargin');
  return { ok: failures.length === 0, failures };
};

const evaluateRegimeGate = (coverage: RegimeCoverageSummary | null, config: ResearchAutopilotConfig) => {
  const warnings: string[] = [];
  const allowBrittle = config.allowRegimeBrittle === true;
  const minRegimesSeen = Number.isFinite(Number(config.minRegimesSeen))
    ? Math.max(1, Math.floor(Number(config.minRegimesSeen)))
    : 2;
  if (!coverage || coverage.regimesSeenCount === 0) {
    warnings.push('insufficient regime coverage');
    return { ok: allowBrittle, reason: 'insufficient_regime_coverage', warnings };
  }
  if (coverage.regimesSeenCount < minRegimesSeen) {
    warnings.push('insufficient regime variety');
    return { ok: allowBrittle, reason: 'insufficient_regime_variety', warnings };
  }
  const requiredPassRate = Number.isFinite(Number(config.requiredRegimePassRate))
    ? Number(config.requiredRegimePassRate)
    : 0.6;
  if (coverage.passRate < requiredPassRate) {
    warnings.push(`regime pass rate below ${(requiredPassRate * 100).toFixed(0)}%`);
    if (!allowBrittle) return { ok: false, reason: 'low_regime_pass_rate', warnings };
  }
  const critical = Array.isArray(config.criticalRegimes) ? config.criticalRegimes.map((entry) => String(entry)) : [];
  const brittleCritical = critical.filter((key) => coverage.brittleRegimes.includes(key));
  if (brittleCritical.length > 0) {
    warnings.push(`critical regime failed: ${brittleCritical.join(', ')}`);
    if (!allowBrittle) return { ok: false, reason: 'critical_regime_failure', warnings };
  }
  return { ok: true, reason: null, warnings };
};

const incrementRegimeFrequency = (stats: ResearchSessionStats, keys: string[]) => {
  if (!keys.length) return;
  const next: Record<string, number> = { ...(stats.regimeFrequency || {}) };
  for (const key of keys) {
    if (!key) continue;
    next[key] = (next[key] || 0) + 1;
  }
  stats.regimeFrequency = next;
};

const updateRegimeChampion = (
  stats: ResearchSessionStats,
  record: RegimeChampionRecord,
  minDelta: number
) => {
  if (!record?.regimeKey) return;
  const prev = stats.championsByRegime?.[record.regimeKey];
  const prevScore = Number(prev?.score ?? -Infinity);
  const nextScore = Number(record.score ?? -Infinity);
  if (!Number.isFinite(nextScore)) return;
  if (!prev || nextScore > prevScore + minDelta) {
    stats.championsByRegime = {
      ...(stats.championsByRegime || {}),
      [record.regimeKey]: record
    };
  }
};

const evaluateRobustness = async (
  strategy: BacktestOptimizationStrategy,
  params: Record<string, any>,
  bars: Array<{ t: number; h?: number | null; l?: number | null; c?: number | null }>,
  validation: OptimizationValidation | undefined,
  timeFilter: TimeFilter | undefined,
  execution: ExecutionConfig,
  plan: ResearchRobustnessPlan,
  timeframe?: string,
  symbol?: string
) => {
  const { startMs, endMs } = splitTestWindow(bars, validation);
  if (!startMs || !endMs) return { ok: false, error: 'No test window available.' };
  const baseTestBars = sliceBars(bars as any[], startMs, endMs);
  if (baseTestBars.length === 0) return { ok: false, error: 'Empty test bars.' };
  const baseRegimeLabel = classifyRegime({
    bars: baseTestBars as any[],
    timeframe,
    symbol,
    referenceBars: bars as any[]
  });

  const results: any[] = [];
  for (const spreadBps of plan.spreadBpsVariants || []) {
    if (spreadBps === 0) continue;
    const exec = buildExecutionVariant(execution, { spreadBps });
    const evalRes = evaluateParamsOnBars(strategy, params, baseTestBars as any[], timeFilter, exec);
    results.push({ kind: 'spread', spreadBps, metrics: evalRes.metrics, regimeLabel: baseRegimeLabel });
  }
  for (const slippagePct of plan.slippagePctVariants || []) {
    if (slippagePct === 0) continue;
    const exec = buildExecutionVariant(execution, { slippagePct });
    const evalRes = evaluateParamsOnBars(strategy, params, baseTestBars as any[], timeFilter, exec);
    results.push({ kind: 'slippage', slippagePct, metrics: evalRes.metrics, regimeLabel: baseRegimeLabel });
  }
  for (const shiftDays of plan.oosShiftDays || []) {
    if (shiftDays === 0) continue;
    const shiftMs = shiftDays * 24 * 60 * 60 * 1000;
    const shiftedEnd = endMs - shiftMs;
    const shiftedStart = startMs - shiftMs;
    const shiftedBars = sliceBars(bars as any[], shiftedStart, shiftedEnd);
    if (shiftedBars.length === 0) continue;
    const evalRes = evaluateParamsOnBars(strategy, params, shiftedBars as any[], timeFilter, execution);
    const regimeLabel = classifyRegime({
      bars: shiftedBars as any[],
      timeframe,
      symbol,
      referenceBars: bars as any[]
    });
    results.push({ kind: 'oos_shift', shiftDays, metrics: evalRes.metrics, regimeLabel });
  }

  return { ok: true, baseTestBars: baseTestBars.length, baseRegimeLabel, variants: results };
};

export const startResearchSession = async (config: ResearchAutopilotConfig) => {
  const normalized = normalizeConfig(config);
  const sessionId = `research_${nowMs()}_${Math.random().toString(16).slice(2, 8)}`;
  const session: ResearchSession = {
    sessionId,
    status: 'running',
    symbol: normalized.symbol,
    timeframe: normalized.timeframe,
    strategy: normalized.strategy,
    objectivePreset: normalized.objectivePreset || null,
    config: normalized,
    stats: {
      experimentsPlanned: normalized.maxExperiments || 1,
      experimentsRun: 0,
      bestScore: null,
      bestExperimentId: null,
      lastExperimentId: null,
      warnings: [],
      lastError: null,
      robustnessFailures: 0,
      rateLimitPauses: 0,
      targetRegimeKey: normalized.targetRegimeKey || null,
      targetRegimeOutcome: null,
      champion: null,
      championsByRegime: {},
      regimeFrequency: {}
    },
    createdAtMs: nowMs(),
    updatedAtMs: nowMs()
  };

  const state: ActiveSession = {
    session,
    stopRequested: false,
    stepIndex: 0,
    noImproveCount: 0,
    robustFailCount: 0,
    rateLimitPauses: 0,
    seenFingerprints: new Set()
  };
  activeSessions.set(sessionId, state);
  await persistSession(session);

  void runSession(state);
  return session;
};

const runSession = async (state: ActiveSession) => {
  const session = state.session;
  const { config } = session;
  const startTime = nowMs();
  const stopPolicy = resolveStopPolicy(config);
  const objective = resolveObjective(config);
  const execution = normalizeExecutionConfig(config.execution);

  let paramGrid = config.paramGrid || null;
  if (!paramGrid || Object.keys(paramGrid).length === 0) {
    paramGrid = await fetchParamGridFromPreset(config.symbol, config.timeframe, config.strategy, config.searchSpacePreset);
  }
  if (!paramGrid || Object.keys(paramGrid).length === 0) {
    session.status = 'failed';
    session.stats.lastError = 'Missing param grid or saved preset.';
    session.updatedAtMs = nowMs();
    await persistSession(session);
    return;
  }
  const paramGridHash = hashStringSampled(stableStringify(paramGrid), 2048);
  const paramGridSummary = buildParamGridSummary(paramGrid);

  for (let expIndex = 0; expIndex < (config.maxExperiments || 1); expIndex += 1) {
    if (state.stopRequested) {
      session.status = 'stopped';
      session.updatedAtMs = nowMs();
      await persistSession(session);
      return;
    }
    if (nowMs() - startTime > (config.maxRuntimeSec || 900) * 1000) {
      session.status = 'completed';
      session.updatedAtMs = nowMs();
      await persistSession(session);
      return;
    }

    state.stepIndex += 1;
    const fingerprintPayload = {
      symbol: config.symbol,
      timeframe: config.timeframe,
      strategy: config.strategy,
      objectivePreset: config.objectivePreset || null,
      rangeDays: config.rangeDays || null,
      maxCombos: config.maxCombos || null,
      validation: config.validation || null,
      timeFilter: config.timeFilter || null,
      execution,
      robustness: config.robustness || null,
      targetRegimeKey: config.targetRegimeKey || null,
      minTargetRegimeSamples: config.minTargetRegimeSamples || null,
      paramGridHash
    };
    const fingerprint = buildExperimentFingerprint(fingerprintPayload);
    await appendStep(session.sessionId, state.stepIndex, 'experiment_start', { index: expIndex + 1, fingerprint });
    if (state.seenFingerprints.has(fingerprint)) {
      await appendStep(session.sessionId, state.stepIndex, 'skipped_duplicate', { index: expIndex + 1, fingerprint });
      continue;
    }
    state.seenFingerprints.add(fingerprint);

    let round1Results: OptimizerResults | null = null;
    let round2Results: OptimizerResults | null = null;
    let experimentId: string | null = null;

    try {
      const sessionOne = await startOptimizationSession({
        symbol: config.symbol,
        timeframe: config.timeframe,
        strategy: config.strategy,
        rangeDays: config.rangeDays || 90,
        paramGrid,
        timeFilter: config.timeFilter,
        objective,
        objectivePreset: config.objectivePreset,
        validation: config.validation,
        maxCombos: config.maxCombos
      });

      const completedOne = await waitForCompletion(sessionOne.sessionId);
      if (!completedOne || completedOne.status === 'failed') {
        throw new Error(completedOne?.error || 'Round 1 failed.');
      }
      round1Results = await getOptimizerResults(sessionOne.sessionId);
      await appendStep(session.sessionId, state.stepIndex, 'round1_complete', { sessionId: sessionOne.sessionId });

      const refinement = await proposeOptimizationRefinement({ sessionId: sessionOne.sessionId });
      const refinedGrid =
        refinement.ok && refinement.proposal?.paramGrid && Object.keys(refinement.proposal.paramGrid).length > 0
          ? refinement.proposal.paramGrid
          : paramGrid;
      const refinedGridHash = hashStringSampled(stableStringify(refinedGrid), 2048);
      const refinedGridSummary = buildParamGridSummary(refinedGrid);

      const sessionTwo = await startOptimizationSession({
        symbol: config.symbol,
        timeframe: config.timeframe,
        strategy: config.strategy,
        rangeDays: config.rangeDays || 90,
        paramGrid: refinedGrid,
        timeFilter: config.timeFilter,
        objective,
        objectivePreset: refinement.ok ? refinement.proposal?.objectivePreset || config.objectivePreset : config.objectivePreset,
        validation: config.validation,
        maxCombos: config.maxCombos
      });

      const completedTwo = await waitForCompletion(sessionTwo.sessionId);
      if (!completedTwo || completedTwo.status === 'failed') {
        throw new Error(completedTwo?.error || 'Round 2 failed.');
      }
      round2Results = await getOptimizerResults(sessionTwo.sessionId);
      await appendStep(session.sessionId, state.stepIndex, 'round2_complete', { sessionId: sessionTwo.sessionId });

      const candidate = selectCandidate(round2Results);
      if (!candidate) throw new Error('No candidate returned from round 2.');
      const paramsHash = hashStringSampled(stableStringify(candidate.params));

      const history = await loadBacktestOptimizationHistory({
        symbol: config.symbol,
        strategy: config.strategy,
        timeframe: config.timeframe,
        rangeDays: config.rangeDays,
        paramGrid: paramGrid
      } as any);

      const robustness = history?.ok
        ? await evaluateRobustness(
          config.strategy,
          candidate.params,
          history.bars as any[],
          config.validation,
          config.timeFilter,
          execution,
          config.robustness || {},
          config.timeframe,
          config.symbol
        )
        : { ok: false, error: history?.error || 'History unavailable for robustness.' };

      const guard = checkGuardrails(candidate.test, objective);
      const candidateRegimeLabel = robustness?.baseRegimeLabel
        ? robustness.baseRegimeLabel
        : classifyRegime({
          bars: (history?.bars || []) as any[],
          timeframe: config.timeframe,
          symbol: config.symbol,
          referenceBars: (history?.bars || []) as any[]
        });
      const regimeKeys = new Set<string>();
      if (candidateRegimeLabel?.regimeKey) regimeKeys.add(candidateRegimeLabel.regimeKey);
      if (robustness.ok && Array.isArray(robustness.variants)) {
        for (const variant of robustness.variants) {
          const key = variant?.regimeLabel?.regimeKey;
          if (key) regimeKeys.add(key);
        }
      }
      const rawWorstCase = robustness.ok && Array.isArray(robustness.variants) && robustness.variants.length > 0
        ? robustness.variants.reduce((worst, variant) => {
          const worstDd = Number(worst?.metrics?.maxDrawdown ?? -Infinity);
          const nextDd = Number(variant?.metrics?.maxDrawdown ?? -Infinity);
          if (!Number.isFinite(nextDd)) return worst;
          return nextDd > worstDd ? variant : worst;
        }, null as any)
        : null;
      const robustnessWorstCase = rawWorstCase
        ? {
          ...rawWorstCase,
          pass: checkGuardrails(rawWorstCase.metrics, objective).ok
        }
        : null;
      const robustPass = robustness.ok && Array.isArray(robustness.variants)
        ? robustness.variants.every((variant) => checkGuardrails(variant.metrics, objective).ok)
        : false;
      const regimeEvals = [
        { regimeLabel: candidateRegimeLabel, pass: guard.ok, metrics: candidate.test },
        ...(Array.isArray(robustness.variants)
          ? robustness.variants.map((variant) => ({
            regimeLabel: variant.regimeLabel,
            pass: checkGuardrails(variant.metrics, objective).ok,
            metrics: variant.metrics
          }))
          : [])
      ];
      const regimeCounts = new Map<string, number>();
      for (const entry of regimeEvals) {
        const key = entry?.regimeLabel?.regimeKey;
        if (!key) continue;
        regimeCounts.set(key, (regimeCounts.get(key) || 0) + 1);
      }
      const coverageSummary = summarizeRegimeCoverage(regimeEvals);
      const regimeGate = evaluateRegimeGate(coverageSummary, config);
      let decision = guard.ok && robustPass ? 'adopt' : guard.ok ? 'investigate' : 'reject';
      if (decision === 'adopt' && !regimeGate.ok) {
        decision = 'investigate';
      }
      const targetWarnings: string[] = [];
      const targetRegimeKey = config.targetRegimeKey ? String(config.targetRegimeKey) : null;
      const targetMinSamples = Number.isFinite(Number(config.minTargetRegimeSamples))
        ? Math.max(1, Math.floor(Number(config.minTargetRegimeSamples)))
        : 1;
      let targetOutcome: { foundChampion: boolean; reason?: string | null; samples?: number | null } | null = null;
      if (targetRegimeKey) {
        const targetSamples = regimeCounts.get(targetRegimeKey) || 0;
        if (targetSamples < targetMinSamples) {
          targetWarnings.push(`target regime samples ${targetSamples}/${targetMinSamples}`);
          if (decision === 'adopt') decision = 'investigate';
          targetOutcome = {
            foundChampion: false,
            reason: 'insufficient_target_regime_samples',
            samples: targetSamples
          };
        } else if (coverageSummary?.brittleRegimes?.includes(targetRegimeKey) && !config.allowRegimeBrittle) {
          targetWarnings.push(`target regime brittle: ${targetRegimeKey}`);
          if (decision === 'adopt') decision = 'investigate';
          targetOutcome = {
            foundChampion: false,
            reason: 'target_regime_brittle',
            samples: targetSamples
          };
        } else {
          targetOutcome = {
            foundChampion: decision === 'adopt',
            reason: decision === 'adopt' ? null : 'target_regime_not_adopted',
            samples: targetSamples
          };
        }
      }

      const ledger = (window as any)?.glass?.tradeLedger;
      const experimentNoteId = `exp_${nowMs()}_${Math.random().toString(16).slice(2, 8)}`;
      experimentId = experimentNoteId;
      if (ledger?.createExperimentNote) {
        const now = nowMs();
        const noteRes = await ledger.createExperimentNote({
          id: experimentNoteId,
          createdAtMs: now,
          updatedAtMs: now,
          symbol: config.symbol,
          timeframe: config.timeframe,
          strategy: config.strategy,
          round1SessionId: round1Results?.sessionId || null,
          round2SessionId: round2Results?.sessionId || null,
          objectivePreset: config.objectivePreset || null,
          hypothesis: refinement?.proposal?.rationale?.[0] || 'Autopilot refinement experiment.',
          refinementDiff: refinement?.proposal?.paramGrid ? { gridKeys: Object.keys(refinement.proposal.paramGrid) } : null,
          resultSummary: {
            round1: round1Results,
            round2: round2Results,
            robustness,
            regimeCoverageSummary: coverageSummary,
            regimeGate,
            targetRegimeKey,
            targetRegimeOutcome: targetOutcome
          },
          decision,
          recommendedParams: candidate.params,
          recommendedMetrics: candidate.test,
          rangeDays: config.rangeDays,
          tags: [config.symbol, config.timeframe, config.strategy, 'research'].filter(Boolean),
          source: 'research_autopilot'
        });
        if (noteRes?.ok && noteRes.note?.id) {
          experimentId = String(noteRes.note.id);
        }
      }

      try {
        if (experimentId) {
          await persistResearchExperimentRegistry({
            experimentId,
            sessionId: session.sessionId,
            config,
            objective,
            execution,
            decision,
            candidate,
            paramsHash,
            paramGridHash,
            paramGridSummary,
            refinedGridHash,
            refinedGridSummary,
            round1Results,
            round2Results,
            robustnessWorstCase,
            coverageSummary,
            regimeGate
          });
        }
      } catch {
        // ignore registry persistence errors
      }

      if (regimeKeys.size > 0) {
        incrementRegimeFrequency(session.stats, Array.from(regimeKeys));
      }
      if (guard.ok && coverageSummary && regimeKeys.size > 0) {
        const brittleRegimes = Array.isArray(coverageSummary.brittleRegimes) ? coverageSummary.brittleRegimes : [];
        for (const key of regimeKeys) {
          const passForRegime = !brittleRegimes.includes(key);
          if (!passForRegime && !config.allowRegimeBrittle) continue;
          updateRegimeChampion(session.stats, {
            regimeKey: key,
            experimentNoteId: experimentId || null,
            paramsHash,
            score: Number(candidate.score),
            decision,
            testMetrics: candidate.test || null,
            robustnessWorstCase: robustnessWorstCase || null,
            penalties: {
              penalty: Number.isFinite(Number(candidate.penalty)) ? Number(candidate.penalty) : null,
              stabilityPenalty: Number.isFinite(Number(candidate.stabilityPenalty)) ? Number(candidate.stabilityPenalty) : null
            },
            updatedAtMs: nowMs()
          }, stopPolicy.minDelta);
        }
      }

      const score = Number(candidate.score);
      const minDelta = stopPolicy.minDelta;
      const isImprovement = Number.isFinite(score)
        && (session.stats.bestScore == null || score > (session.stats.bestScore + minDelta));
      if (isImprovement) {
        session.stats.bestScore = score;
        session.stats.bestExperimentId = experimentId;
        state.noImproveCount = 0;
        session.stats.champion = {
          experimentId: experimentId || null,
          experimentNoteId: experimentId || null,
          paramsHash,
          score,
          decision,
          testMetrics: candidate.test || null,
          robustnessWorstCase: robustnessWorstCase || null,
          regimeCoverageSummary: coverageSummary || null,
          penalties: {
            penalty: Number.isFinite(Number(candidate.penalty)) ? Number(candidate.penalty) : null,
            stabilityPenalty: Number.isFinite(Number(candidate.stabilityPenalty)) ? Number(candidate.stabilityPenalty) : null
          },
          updatedAtMs: nowMs()
        };
      } else {
        state.noImproveCount += 1;
      }

      if (robustPass) {
        state.robustFailCount = 0;
      } else {
        state.robustFailCount += 1;
      }
      if (regimeGate.warnings.length > 0) {
        session.stats.warnings = [...(session.stats.warnings || []), ...regimeGate.warnings].slice(-5);
      }
      if (targetWarnings.length > 0) {
        session.stats.warnings = [...(session.stats.warnings || []), ...targetWarnings].slice(-5);
      }
      if (targetRegimeKey) {
        session.stats.targetRegimeKey = targetRegimeKey;
        session.stats.targetRegimeOutcome = targetOutcome;
      }
      session.stats.robustnessFailures = state.robustFailCount;

      session.stats.experimentsRun += 1;
      session.stats.lastExperimentId = experimentId;
      session.updatedAtMs = nowMs();
      await persistSession(session);
      await appendStep(session.sessionId, state.stepIndex, 'experiment_complete', {
        experimentId,
        decision,
        score,
        paramsHash,
        fingerprint,
        robustPass,
        robustnessWorstCase
      });

      if (state.noImproveCount >= stopPolicy.plateauLimit) {
        await appendStep(session.sessionId, state.stepIndex, 'stop_plateau', {
          limit: stopPolicy.plateauLimit,
          minDelta: stopPolicy.minDelta
        });
        session.status = 'completed';
        session.updatedAtMs = nowMs();
        await persistSession(session);
        return;
      }
      if (state.robustFailCount >= stopPolicy.maxRobustnessFailures) {
        await appendStep(session.sessionId, state.stepIndex, 'stop_robustness', {
          failures: state.robustFailCount,
          limit: stopPolicy.maxRobustnessFailures
        });
        session.status = 'completed';
        session.updatedAtMs = nowMs();
        await persistSession(session);
        return;
      }
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : 'Research experiment failed.';
      session.stats.lastError = msg;
      session.stats.warnings = [...(session.stats.warnings || []), msg].slice(-5);
      session.updatedAtMs = nowMs();
      await persistSession(session);
      await appendStep(session.sessionId, state.stepIndex, 'error', { message: msg });
      if (msg.toLowerCase().includes('rate limit')) {
        state.rateLimitPauses += 1;
        session.stats.rateLimitPauses = state.rateLimitPauses;
        await appendStep(session.sessionId, state.stepIndex, 'rate_limit_pause', {
          count: state.rateLimitPauses,
          limit: stopPolicy.maxRateLimitPauses
        });
        if (state.rateLimitPauses >= stopPolicy.maxRateLimitPauses) {
          await appendStep(session.sessionId, state.stepIndex, 'stop_rate_limit', {
            count: state.rateLimitPauses,
            limit: stopPolicy.maxRateLimitPauses
          });
          session.status = 'stopped';
          session.stats.lastError = 'Stopped after repeated rate-limit pauses.';
          session.updatedAtMs = nowMs();
          await persistSession(session);
          return;
        }
        session.status = 'paused';
        session.updatedAtMs = nowMs();
        await persistSession(session);
        await sleep(15_000);
        session.status = 'running';
        session.updatedAtMs = nowMs();
        await persistSession(session);
        continue;
      }
    }
  }

  session.status = 'completed';
  session.updatedAtMs = nowMs();
  await persistSession(session);
};

export const getResearchStatus = async (sessionId: string) => {
  const active = activeSessions.get(sessionId);
  if (active) return active.session;
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.getResearchSession) return null;
  const res = await ledger.getResearchSession({ sessionId });
  return res?.ok ? res.session : null;
};

export const getResearchResults = async (sessionId: string) => {
  const session = await getResearchStatus(sessionId);
  const ledger = (window as any)?.glass?.tradeLedger;
  let steps: any[] = [];
  if (ledger?.listResearchSteps) {
    const res = await ledger.listResearchSteps({ sessionId, limit: 50 });
    if (res?.ok && Array.isArray(res.steps)) steps = res.steps;
  }
  return { session, steps };
};

export const exportResearchSession = async (sessionId: string) => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.getResearchSession) return null;
  const sessionRes = await ledger.getResearchSession({ sessionId });
  if (!sessionRes?.ok || !sessionRes.session) return null;
  const session = sessionRes.session;
  let steps: any[] = [];
  if (ledger?.listResearchSteps) {
    const res = await ledger.listResearchSteps({ sessionId, limit: 500 });
    if (res?.ok && Array.isArray(res.steps)) steps = res.steps;
  }

  const noteIds = new Set<string>();
  for (const step of steps) {
    const payload = step?.payload || {};
    if (payload.experimentId) noteIds.add(String(payload.experimentId));
    if (payload.experimentNoteId) noteIds.add(String(payload.experimentNoteId));
  }
  const championNote = session?.stats?.champion?.experimentNoteId;
  if (championNote) noteIds.add(String(championNote));

  const experimentNotes: any[] = [];
  if (ledger?.getExperimentNote) {
    for (const noteId of noteIds) {
      const res = await ledger.getExperimentNote({ id: noteId });
      if (res?.ok && res.note) experimentNotes.push(res.note);
    }
  }

  const dashboard = await buildPerformanceDashboardModel(sessionId, { sessionLimit: 10 });
  return { session, steps, experimentNotes, dashboard };
};

export const buildPerformanceDashboardModel = async (
  sessionId: string,
  options?: { sessionLimit?: number }
) => {
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.getResearchSession) return null;
  const sessionRes = await ledger.getResearchSession({ sessionId });
  if (!sessionRes?.ok || !sessionRes.session) return null;
  const session = sessionRes.session as ResearchSession;

  const sessionSeries: Array<{
    ts: number;
    sessionId?: string | null;
    bestScore?: number | null;
    bestEdgeMargin?: number | null;
    worstDD?: number | null;
    robustnessPassRate?: number | null;
    overfitPenalty?: number | null;
    decisions?: { adopt: number; investigate: number; reject: number };
  }> = [];
  const experimentSeries: Array<{ ts: number; decision?: string | null; score?: number | null }> = [];

  if (ledger?.listResearchSessions) {
    const limit = Number.isFinite(Number(options?.sessionLimit))
      ? Math.max(3, Math.min(50, Math.floor(Number(options?.sessionLimit))))
      : 10;
    try {
      const res = await ledger.listResearchSessions({
        limit,
        symbol: session.symbol,
        timeframe: session.timeframe,
        strategy: session.strategy
      });
      const sessions = Array.isArray(res?.sessions) ? res.sessions : [];
      const ordered = sessions.slice().sort((a, b) => (Number(a?.updatedAtMs) || 0) - (Number(b?.updatedAtMs) || 0));
      for (const entry of ordered) {
        const stats = entry?.stats || {};
        const ts = Number(entry?.updatedAtMs || entry?.createdAtMs || 0);
        const decisionCounts = { adopt: 0, investigate: 0, reject: 0 };
        let robustPass = 0;
        let robustTotal = 0;
        if (ledger?.listResearchSteps && entry?.sessionId) {
          const stepsRes = await ledger.listResearchSteps({ sessionId: String(entry.sessionId), limit: 200 });
          const steps = Array.isArray(stepsRes?.steps) ? stepsRes.steps : [];
          for (const step of steps) {
            const decision = String(step?.payload?.decision || '').toLowerCase();
            if (decision === 'adopt') decisionCounts.adopt += 1;
            else if (decision === 'reject') decisionCounts.reject += 1;
            else if (decision === 'investigate') decisionCounts.investigate += 1;
            if (step?.payload?.robustPass !== undefined) {
              robustTotal += 1;
              if (step.payload.robustPass) robustPass += 1;
            }
          }
        }
        const robustnessPassRate = robustTotal > 0 ? robustPass / robustTotal : null;
        const bestEdgeMargin = stats?.champion?.testMetrics?.edgeMargin ?? null;
        const worstDD = stats?.champion?.robustnessWorstCase?.metrics?.maxDrawdown
          ?? stats?.champion?.testMetrics?.maxDrawdown
          ?? null;
        const penaltyRaw = stats?.champion?.penalties?.penalty;
        const stabilityRaw = stats?.champion?.penalties?.stabilityPenalty;
        const penaltyVal = Number.isFinite(Number(penaltyRaw)) ? Number(penaltyRaw) : null;
        const stabilityVal = Number.isFinite(Number(stabilityRaw)) ? Number(stabilityRaw) : null;
        const overfitPenalty =
          penaltyVal != null || stabilityVal != null
            ? (penaltyVal ?? 0) + (stabilityVal ?? 0)
            : null;
        sessionSeries.push({
          ts,
          sessionId: entry?.sessionId ? String(entry.sessionId) : null,
          bestScore: Number.isFinite(Number(stats?.bestScore)) ? Number(stats.bestScore) : null,
          bestEdgeMargin: Number.isFinite(Number(bestEdgeMargin)) ? Number(bestEdgeMargin) : null,
          worstDD: Number.isFinite(Number(worstDD)) ? Number(worstDD) : null,
          robustnessPassRate,
          overfitPenalty,
          decisions: decisionCounts
        });
      }
    } catch {
      // ignore session series errors
    }
  }

  if (ledger?.listResearchSteps) {
    try {
      const stepsRes = await ledger.listResearchSteps({ sessionId, limit: 200 });
      const steps = Array.isArray(stepsRes?.steps) ? stepsRes.steps : [];
      for (const step of steps) {
        if (!step?.createdAtMs) continue;
        const decision = step?.payload?.decision ? String(step.payload.decision) : null;
        const score = Number.isFinite(Number(step?.payload?.score)) ? Number(step.payload.score) : null;
        if (decision || score != null) {
          experimentSeries.push({ ts: Number(step.createdAtMs), decision, score });
        }
      }
    } catch {
      // ignore steps series errors
    }
  }

  let recentExperiments: any[] = [];
  if (ledger?.listExperimentNotes) {
    try {
      const res = await ledger.listExperimentNotes({
        limit: 10,
        symbol: session.symbol,
        timeframe: session.timeframe,
        strategy: session.strategy
      });
      if (res?.ok && Array.isArray(res.notes)) {
        recentExperiments = res.notes.map((note: any) => ({
          id: String(note.id),
          decision: note.decision || null,
          createdAtMs: note.createdAtMs || null,
          symbol: note.symbol || null,
          timeframe: note.timeframe || null,
          strategy: note.strategy || null,
          summary: note.summary || null,
          metrics: note.recommendedMetrics || null
        }));
      }
    } catch {
      // ignore
    }
  }

  return {
    generatedAtMs: nowMs(),
    globalChampion: session.stats?.champion || null,
    championsByRegime: session.stats?.championsByRegime || null,
    regimeFrequency: session.stats?.regimeFrequency || null,
    recentExperiments,
    sessionSeries,
    experimentSeries,
    trendSeries: []
  };
};

export const stopResearchSession = async (sessionId: string) => {
  const active = activeSessions.get(sessionId);
  if (active) {
    active.stopRequested = true;
    active.session.status = 'stopped';
    active.session.updatedAtMs = nowMs();
    await persistSession(active.session);
    return active.session;
  }
  const session = await getResearchStatus(sessionId);
  if (session) {
    session.status = 'stopped';
    session.updatedAtMs = nowMs();
    await persistSession(session);
    return session;
  }
  return null;
};
