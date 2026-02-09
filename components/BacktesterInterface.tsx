import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  BacktestTrade,
  BacktestStats,
  Candle,
  ConfluenceConfig,
  DEFAULT_BREAK_RETEST_CONFIG,
  DEFAULT_FVG_RETRACE_CONFIG,
  DEFAULT_MEAN_REVERSION_CONFIG,
  DEFAULT_RANGE_BREAKOUT_CONFIG,
  DEFAULT_TREND_PULLBACK_CONFIG,
  ExecutionConfig,
  BreakRetestConfig,
  FvgRetraceConfig,
  BiasLabel,
  MeanReversionConfig,
  RangeBreakoutConfig,
  TrendPullbackConfig,
  computeBiasSeries,
  generateBreakRetestTrades,
  generateFvgRetraceTrades,
  generateMeanReversionTrades,
  generateRangeBreakoutTrades,
  generateTrendPullbackTrades,
  mapHtfBiasToLtf,
  resolutionToMs,
  simulateTrades,
  summarizeTrades
} from '../services/backtestEngine';
import {
  type BacktestOptimizationResult,
  type BacktestOptimizationStrategy,
  type BacktestParamGrid
} from '../services/backtestResearchService';
import { GLASS_EVENT } from '../services/glassEvents';
import {
  type SetupOptimizerPayload
} from '../services/backtestComputeWorkerClient';
import {
  DEFAULT_OPTIMIZER_PRESETS as DEFAULT_LOOP_PRESETS,
  buildBacktestRun,
  getOptimizerResults,
  getOptimizerStatus,
  persistBacktestRun,
  startOptimizationSession,
  type OptimizerResults,
  type OptimizerSession,
  type TradeDiagnostics
} from '../services/optimizerLoopService';
import {
  type ResearchSession
} from '../services/researchAutopilotService';
import { aggregateReplayLocal, aggregateReplayWorker, type ReplayAggregationResult } from '../services/replayAggregationWorkerClient';
import { hashStringSampled } from '../services/stringHash';
import { getRuntimeScheduler } from '../services/runtimeScheduler';
import type { ExperimentNote, TaskPlaybookRun, TaskTreeResumeEntry, TaskTreeRunEntry } from '../types';
import type { TaskTreeRunSummary } from '../services/taskTreeService';

type BacktestResearchModule = typeof import('../services/backtestResearchService');
type BacktestWorkerModule = typeof import('../services/backtestComputeWorkerClient');
type ResearchAutopilotModule = typeof import('../services/researchAutopilotService');

let backtestResearchModulePromise: Promise<BacktestResearchModule> | null = null;
const loadBacktestResearchModule = () => {
  if (!backtestResearchModulePromise) backtestResearchModulePromise = import('../services/backtestResearchService');
  return backtestResearchModulePromise;
};

let backtestWorkerModulePromise: Promise<BacktestWorkerModule> | null = null;
const loadBacktestWorkerModule = () => {
  if (!backtestWorkerModulePromise) backtestWorkerModulePromise = import('../services/backtestComputeWorkerClient');
  return backtestWorkerModulePromise;
};

let researchAutopilotModulePromise: Promise<ResearchAutopilotModule> | null = null;
const loadResearchAutopilotModule = () => {
  if (!researchAutopilotModulePromise) researchAutopilotModulePromise = import('../services/researchAutopilotService');
  return researchAutopilotModulePromise;
};

const loadBacktestHistory = async (...args: Parameters<BacktestResearchModule['loadBacktestHistory']>) => {
  const mod = await loadBacktestResearchModule();
  return mod.loadBacktestHistory(...args);
};

const loadBacktestOptimizationHistory = async (...args: Parameters<BacktestResearchModule['loadBacktestOptimizationHistory']>) => {
  const mod = await loadBacktestResearchModule();
  return mod.loadBacktestOptimizationHistory(...args);
};

const runBacktestOptimization = async (...args: Parameters<BacktestResearchModule['runBacktestOptimization']>) => {
  const mod = await loadBacktestResearchModule();
  return mod.runBacktestOptimization(...args);
};

const runBacktestOptimizationWorker = async (...args: Parameters<BacktestWorkerModule['runBacktestOptimizationWorker']>) => {
  const mod = await loadBacktestWorkerModule();
  return mod.runBacktestOptimizationWorker(...args);
};

const runSetupOptimizerWorker = async (...args: Parameters<BacktestWorkerModule['runSetupOptimizerWorker']>) => {
  const mod = await loadBacktestWorkerModule();
  return mod.runSetupOptimizerWorker(...args);
};

const runBacktestSimulationWorker = async (...args: Parameters<BacktestWorkerModule['runBacktestSimulationWorker']>) => {
  const mod = await loadBacktestWorkerModule();
  return mod.runBacktestSimulationWorker(...args);
};

const runBacktestAnalysisWorker = async (...args: Parameters<BacktestWorkerModule['runBacktestAnalysisWorker']>) => {
  const mod = await loadBacktestWorkerModule();
  return mod.runBacktestAnalysisWorker(...args);
};

const OptimizerLoopPanel = React.lazy(() => import('./backtester/OptimizerLoopPanel'));
const BatchOptimizerPanel = React.lazy(() => import('./backtester/BatchOptimizerPanel'));
const TrainingPackPanel = React.lazy(() => import('./backtester/TrainingPackPanel'));
const ResearchAutopilotPanel = React.lazy(() => import('./backtester/ResearchAutopilotPanel'));
const AgentMemoryPanel = React.lazy(() => import('./backtester/AgentMemoryPanel'));
const ReplayChartPanel = React.lazy(() => import('./backtester/ReplayChartPanel'));
const TimelineTruthPanel = React.lazy(() => import('./backtester/TimelineTruthPanel'));
const StatsPerformancePanel = React.lazy(() => import('./backtester/StatsPerformancePanel'));
const ValidationPanel = React.lazy(() => import('./backtester/ValidationPanel'));
const StrategyConfigPanel = React.lazy(() => import('./backtester/StrategyConfigPanel'));

const getResearchResults = async (...args: Parameters<ResearchAutopilotModule['getResearchResults']>) => {
  const mod = await loadResearchAutopilotModule();
  return mod.getResearchResults(...args);
};

const getResearchStatus = async (...args: Parameters<ResearchAutopilotModule['getResearchStatus']>) => {
  const mod = await loadResearchAutopilotModule();
  return mod.getResearchStatus(...args);
};

const startResearchSession = async (...args: Parameters<ResearchAutopilotModule['startResearchSession']>) => {
  const mod = await loadResearchAutopilotModule();
  return mod.startResearchSession(...args);
};

const stopResearchSession = async (...args: Parameters<ResearchAutopilotModule['stopResearchSession']>) => {
  const mod = await loadResearchAutopilotModule();
  return mod.stopResearchSession(...args);
};

const exportResearchSession = async (...args: Parameters<ResearchAutopilotModule['exportResearchSession']>) => {
  const mod = await loadResearchAutopilotModule();
  return mod.exportResearchSession(...args);
};

interface BacktesterInterfaceProps {
  activeSymbol?: string;
  isConnected: boolean;
  onOpenSettings?: () => void;
  onSymbolChange?: (symbol: string) => void;
  resolveSymbol?: (raw: string) => Promise<string>;
  onSendTrainingMessage?: (text: string) => void | boolean;
  onSendToWatchlist?: (payload: { strategy: string; params: Record<string, any>; symbol?: string; timeframe?: string; mode?: 'suggest' | 'paper' | 'live' }) => void;
  onFocusChart?: (symbol: string, timeframe?: string) => void;
  onPersistOptimization?: (result: BacktestOptimizationResult, opts?: { source?: string; createWatcher?: boolean; watcherMode?: 'suggest' | 'paper' | 'live'; watcherEnabled?: boolean }) => void | Promise<void>;
  activePlaybookRun?: TaskPlaybookRun | null;
  recentPlaybookRuns?: TaskPlaybookRun[] | null;
  taskTreeResumeEntries?: TaskTreeResumeEntry[] | null;
  onResumeTaskTreeRun?: (input: {
    taskType: 'signal' | 'action';
    runId: string;
    action?: 'resume' | 'abort' | 'approve' | 'skip';
  }) => void;
  taskTreeRuns?: TaskTreeRunEntry[] | null;
  actionTaskTreeRuns?: TaskTreeRunEntry[] | null;
  onReplayTaskTree?: (summary: TaskTreeRunSummary) => void;
  onResumePlaybookRun?: (
    runId: string,
    opts?: {
      action?: 'resume' | 'approve' | 'skip' | 'abort';
      stepId?: string | null;
      actionId?: string | null;
      overrides?: {
        symbol?: string;
        timeframe?: string;
        strategy?: string;
        timeframes?: string[];
        data?: Record<string, any>;
      };
    }
  ) => void;
  onCreateWatchProfile?: (payload: {
    strategy: string;
    params: Record<string, any>;
    symbol?: string;
    timeframe?: string;
    objectivePresetId?: string | null;
    objectivePresetName?: string | null;
    baselineRunId?: string | null;
    optimizerSessionId?: string | null;
    regimeConstraint?: { mode: 'require' | 'exclude'; keys: string[] } | null;
    mode?: 'suggest' | 'paper' | 'live';
    enabled?: boolean;
  }) => void | Promise<void>;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<{
    ok: boolean;
    error?: string;
    data?: any;
  }>;
  onReady?: () => void;
}

export interface BacktesterSummary {
  symbol: string;
  timeframe: string;
  rangeDays: number;
  bars: number;
  stats: BacktestStats;
  performance: {
    netR: number;
    maxDrawdown: number;
    maxDrawdownPct: number | null;
    avgR: number | null;
    medianR: number | null;
    avgHoldMs: number | null;
    maxWinStreak: number;
    maxLossStreak: number;
  };
  updatedAtMs: number | null;
  source?: string | null;
  validation?: Record<string, any>;
  walkForward?: Record<string, any>;
  execution?: ExecutionConfig;
  validationConfig?: ValidationConfig;
  walkForwardConfig?: WalkForwardConfig;
}

export interface BacktesterTrainingPack {
  meta: Record<string, any>;
  summary: Record<string, any>;
  episodes: Record<string, any>[];
}

export type BacktesterOptimizationApply = {
  strategy: string;
  params: Record<string, any>;
  symbol?: string;
  timeframe?: string;
  rangeDays?: number;
};

export interface BacktesterHandle {
  getSummary: () => BacktesterSummary | null;
  getTrainingPack: (opts?: { maxEpisodes?: number; offset?: number; limit?: number }) => BacktesterTrainingPack | null;
  applyOptimization: (payload: BacktesterOptimizationApply) => void;
  listOptimizerPresets: () => OptimizerPreset[];
  saveOptimizerPreset: (opts?: {
    mode?: 'new' | 'update';
    presetId?: string | null;
    name?: string | null;
    config?: OptimizerConfig | null;
    symbol?: string | null;
    timeframe?: string | null;
  }) => { ok: boolean; preset?: OptimizerPreset; error?: string };
  loadOptimizerPreset: (id: string) => { ok: boolean; preset?: OptimizerPreset; error?: string };
  deleteOptimizerPreset: (id: string, opts?: { confirmed?: boolean }) => { ok: boolean; deletedId?: string; error?: string };
  exportOptimizerPresets: (opts?: { mode?: 'clipboard' | 'download' | 'return' }) => Promise<{ ok: boolean; payload?: string; error?: string }>;
  importOptimizerPresets: (rawText: string) => { ok: boolean; imported?: number; error?: string };
  listBatchPresets: () => BatchPreset[];
  saveBatchPreset: (opts?: {
    mode?: 'new' | 'update';
    presetId?: string | null;
    name?: string | null;
    config?: BatchPreset['config'] | null;
  }) => { ok: boolean; preset?: BatchPreset; error?: string };
  loadBatchPreset: (id: string) => { ok: boolean; preset?: BatchPreset; error?: string };
  deleteBatchPreset: (id: string, opts?: { confirmed?: boolean }) => { ok: boolean; deletedId?: string; error?: string };
  runBatchOptimization: (opts?: { config?: BatchPreset['config'] | null }) => void;
  cancelBatchOptimization: () => void;
  clearBatchResults: () => void;
  exportBatchResults: (opts?: {
    format?: 'csv' | 'json';
    mode?: 'clipboard' | 'download' | 'return';
  }) => Promise<{ ok: boolean; payload?: string; error?: string }>;
}

const STORAGE_KEY = 'glass_backtester_config_v1';
const OPTIMIZER_PRESET_KEY = 'glass_backtester_optimizer_presets_v1';
const BATCH_PRESET_KEY = 'glass_backtester_batch_presets_v1';
const MEMORY_PRESET_KEY = 'glass_backtester_memory_presets_v1';
const RESOLUTIONS = ['1m', '5m', '15m', '30m', '1H', '4H', '1D'];
const MAX_BARS = 200_000;
const MAX_RANGE_DAYS = 10000;
const DEFAULT_RANGE_DAYS = 90;
const DEFAULT_DISPLAY_BARS = 240;
const MAX_TRAINING_EPISODES = 2000;
const WORKER_TRADE_THRESHOLD = 4000;
const REPLAY_AGG_WORKER_THRESHOLD = 2000;
const WORKER_CACHE_MAX = 4;
const WORKER_CACHE_TTL_MS = 5 * 60_000;
const KNOWN_REGIME_KEYS = [
  'high_trend_ny',
  'high_range_ny',
  'high_trend_london',
  'high_range_london',
  'low_range_ny'
];

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const clampRangeDays = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_RANGE_DAYS;
  return Math.max(1, Math.min(MAX_RANGE_DAYS, Math.floor(value)));
};

type RealismPresetLevel = 'custom' | 'lite' | 'standard' | 'strict';

type CacheEntry<T> = { value: T; computedAtMs: number };

function getCacheEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, ttlMs: number) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (ttlMs > 0 && Date.now() - entry.computedAtMs > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCacheEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, maxEntries: number) {
  cache.set(key, { value, computedAtMs: Date.now() });
  if (cache.size <= maxEntries) return;
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [entryKey, entry] of cache.entries()) {
    if (entry.computedAtMs < oldestAt) {
      oldestAt = entry.computedAtMs;
      oldestKey = entryKey;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

const EXECUTION_REALISM_PRESETS: Record<'lite' | 'standard' | 'strict', { label: string; config: Partial<ExecutionConfig> }> = {
  lite: {
    label: 'Lite',
    config: {
      spreadModel: 'percent',
      spreadPct: 0.01,
      slippageModel: 'none',
      slippagePct: 0,
      commissionModel: 'none',
      commissionPct: 0,
      sessionCostOverrides: {
        asia: { spreadMult: 1, slippageMult: 1, commissionMult: 1 },
        london: { spreadMult: 1, slippageMult: 1, commissionMult: 1 },
        ny: { spreadMult: 1, slippageMult: 1, commissionMult: 1 }
      },
      volatilitySlippageEnabled: false,
      partialFillMode: 'none',
      newsSpikeAtrMult: 0,
      newsSpikeSlippageMult: 1,
      newsSpikeSpreadMult: 1
    }
  },
  standard: {
    label: 'Standard',
    config: {
      spreadModel: 'percent',
      spreadPct: 0.02,
      slippageModel: 'percent',
      slippagePct: 0.01,
      commissionModel: 'percent',
      commissionPct: 0.01,
      sessionCostOverrides: {
        asia: { spreadMult: 1.1, slippageMult: 1.1, commissionMult: 1 },
        london: { spreadMult: 1, slippageMult: 1, commissionMult: 1 },
        ny: { spreadMult: 1.05, slippageMult: 1.05, commissionMult: 1 }
      },
      volatilitySlippageEnabled: true,
      volatilitySlippageLookback: 50,
      volatilitySlippageLowThresh: 0.8,
      volatilitySlippageHighThresh: 1.2,
      volatilitySlippageLowMult: 0.8,
      volatilitySlippageMidMult: 1,
      volatilitySlippageHighMult: 1.5,
      partialFillMode: 'range',
      partialFillAtrMult: 2,
      partialFillMinRatio: 0.5,
      partialFillOnExit: true,
      newsSpikeAtrMult: 3,
      newsSpikeSlippageMult: 2,
      newsSpikeSpreadMult: 1.5
    }
  },
  strict: {
    label: 'Strict',
    config: {
      spreadModel: 'percent',
      spreadPct: 0.04,
      slippageModel: 'percent',
      slippagePct: 0.03,
      commissionModel: 'percent',
      commissionPct: 0.02,
      sessionCostOverrides: {
        asia: { spreadMult: 1.25, slippageMult: 1.25, commissionMult: 1.1 },
        london: { spreadMult: 1.1, slippageMult: 1.1, commissionMult: 1.05 },
        ny: { spreadMult: 1.15, slippageMult: 1.15, commissionMult: 1.05 }
      },
      volatilitySlippageEnabled: true,
      volatilitySlippageLookback: 50,
      volatilitySlippageLowThresh: 0.8,
      volatilitySlippageHighThresh: 1.2,
      volatilitySlippageLowMult: 0.7,
      volatilitySlippageMidMult: 1,
      volatilitySlippageHighMult: 2,
      partialFillMode: 'range',
      partialFillAtrMult: 1.5,
      partialFillMinRatio: 0.35,
      partialFillOnExit: true,
      newsSpikeAtrMult: 2.5,
      newsSpikeSlippageMult: 2.5,
      newsSpikeSpreadMult: 2
    }
  }
};

const getRegimeDefaults = (level: 'lite' | 'standard' | 'strict') => {
  if (level === 'lite') {
    return { passRate: 0.5, critical: ['high_trend_ny'], minSeen: 1, allowBrittle: false };
  }
  if (level === 'strict') {
    return {
      passRate: 0.75,
      critical: ['high_trend_ny', 'high_range_ny', 'high_trend_london'],
      minSeen: 3,
      allowBrittle: false
    };
  }
  return {
    passRate: 0.6,
    critical: ['high_trend_ny', 'high_range_ny'],
    minSeen: 2,
    allowBrittle: false
  };
};

const normalizeSessionOverride = (raw?: Partial<ExecutionConfig['sessionCostOverrides']['asia']>) => ({
  spreadMult: Number.isFinite(Number(raw?.spreadMult)) ? Number(raw?.spreadMult) : 1,
  spreadBps: Number.isFinite(Number(raw?.spreadBps)) ? Number(raw?.spreadBps) : 0,
  slippageMult: Number.isFinite(Number(raw?.slippageMult)) ? Number(raw?.slippageMult) : 1,
  slippageBps: Number.isFinite(Number(raw?.slippageBps)) ? Number(raw?.slippageBps) : 0,
  commissionMult: Number.isFinite(Number(raw?.commissionMult)) ? Number(raw?.commissionMult) : 1,
  commissionBps: Number.isFinite(Number(raw?.commissionBps)) ? Number(raw?.commissionBps) : 0
});

type OptimizerSort = 'netR' | 'expectancy' | 'profitFactor' | 'winRate' | 'maxDrawdown';

type OptimizerConfig = {
  sortBy: OptimizerSort;
  maxCombos: number;
  topN: number;
  useReplayWindow: boolean;
  useConfluence: boolean;
  range: {
    enabled: boolean;
    lookbackBars: string;
    atrMult: string;
    rr: string;
    breakoutMode: string;
    bufferAtrMult: string;
  };
  breakRetest: {
    enabled: boolean;
    lookbackBars: string;
    atrMult: string;
    rr: string;
    breakoutMode: string;
    bufferAtrMult: string;
    retestBars: string;
    retestBufferAtrMult: string;
    retestConfirm: string;
  };
  fvg: {
    enabled: boolean;
    atrMult: string;
    rr: string;
    maxWaitBars: string;
    entryMode: string;
    minGapAtrMult: string;
  };
  trend: {
    enabled: boolean;
    fastEma: string;
    slowEma: string;
    atrMult: string;
    rr: string;
    confirmMode: string;
    pullbackEma: string;
    minTrendBars: string;
  };
  mean: {
    enabled: boolean;
    smaPeriod: string;
    bandAtrMult: string;
    stopAtrMult: string;
    rr: string;
    useRsiFilter: string;
    rsiPeriod: string;
  };
};

type OptimizerPreset = {
  id: string;
  name: string;
  createdAtMs: number;
  updatedAtMs: number;
  symbol?: string;
  timeframe?: string;
  config: OptimizerConfig;
};

type BatchPreset = {
  id: string;
  name: string;
  createdAtMs: number;
  updatedAtMs: number;
  config: {
    symbolsInput: string;
    timeframesInput: string;
    strategy: BacktestOptimizationStrategy;
    rangeDays: number;
    maxCombos: number;
  };
};

type AgentMemoryFilterPreset = {
  id: string;
  name: string;
  createdAtMs: number;
  updatedAtMs: number;
  filters: {
    agentId: string;
    scope: string;
    category: string;
    subcategory: string;
    symbol: string;
    timeframe: string;
    kind: string;
    limit: number;
    query: string;
  };
};

type BatchOptimizationRow = {
  key: string;
  symbol: string;
  timeframe: string;
  result: BacktestOptimizationResult;
};

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

type ValidationConfig = {
  enabled: boolean;
  mode: 'percent' | 'last_days';
  splitPercent: number;
  lastDays: number;
  useReplayWindow: boolean;
};

type WalkForwardConfig = {
  enabled: boolean;
  trainDays: number;
  testDays: number;
  stepDays: number;
  minTrades: number;
  useReplayWindow: boolean;
};

const CHART_COLORS = {
  bg: '#050505',
  grid: 'rgba(255,255,255,0.08)',
  up: '#22c55e',
  down: '#f87171',
  wick: 'rgba(148,163,184,0.7)',
  replay: 'rgba(34,211,238,0.75)',
  entry: '#38bdf8',
  stop: '#f97316',
  tp: '#22c55e',
  highlightWin: 'rgba(34,197,94,0.12)',
  highlightLoss: 'rgba(248,113,113,0.12)',
  highlightOpen: 'rgba(148,163,184,0.08)',
  entryLine: 'rgba(226,232,240,0.8)',
  exit: '#eab308',
  wfTest: 'rgba(56,189,248,0.08)',
  wfMarker: 'rgba(56,189,248,0.4)'
};

function toNumber(value: any, fallback: number | null = null) {
  if (value == null) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return value.toFixed(decimals);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function formatR(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(2)}R`;
}

function formatAge(ms: number | null | undefined) {
  if (!ms || ms <= 0) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(1, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatTs(ts: number | null | undefined) {
  if (!ts || ts <= 0) return '--';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function formatDurationMs(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '--';
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

function formatRetryIn(retryAtMs: number | null | undefined) {
  if (!retryAtMs || !Number.isFinite(retryAtMs)) return '--';
  return formatDurationMs(Math.max(0, retryAtMs - Date.now()));
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function normalizeResolution(raw: string) {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return '';
  const match = RESOLUTIONS.find((res) => res.toLowerCase() === cleaned.toLowerCase());
  return match || cleaned;
}

function parseNumberList(raw: string, fallback: number, opts?: { min?: number; max?: number }) {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return [fallback];
  const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
  const values = parts
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value))
    .map((value) => {
      if (opts?.min != null && value < opts.min) return opts.min;
      if (opts?.max != null && value > opts.max) return opts.max;
      return value;
    });
  if (values.length === 0) return [fallback];
  return Array.from(new Set(values));
}

function parseEnumList<T extends string>(raw: string, allowed: T[], fallback: T) {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return [fallback];
  const allowedMap = new Map(allowed.map((value) => [value.toLowerCase(), value]));
  const values = cleaned
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => allowedMap.get(part))
    .filter((value): value is T => Boolean(value));
  if (values.length === 0) return [fallback];
  return Array.from(new Set(values));
}

function parseBoolList(raw: string, fallback: boolean) {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return [fallback];
  const values = cleaned
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (part === 'true' || part === '1' || part === 'yes') return true;
      if (part === 'false' || part === '0' || part === 'no') return false;
      return null;
    })
    .filter((value): value is boolean => value !== null);
  if (values.length === 0) return [fallback];
  return Array.from(new Set(values));
}

function parseRegimeList(raw: string) {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return [];
  const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
  const unique = new Set<string>();
  for (const part of parts) {
    unique.add(part);
  }
  return Array.from(unique);
}

function findIndexAtOrAfter(times: number[], target: number) {
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
}

function buildGrid<T extends Record<string, any>>(
  base: T,
  inputs: Partial<Record<keyof T, any[]>>,
  maxCombos: number
) {
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
}

function computeEquityStats(trades: BacktestTrade[]) {
  const closed = trades.filter((trade) => trade.outcome === 'win' || trade.outcome === 'loss');
  if (closed.length === 0) {
    return { netR: 0, maxDrawdown: 0 };
  }
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
}

function normalizeBars(raw: any[]): Candle[] {
  const next: Candle[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const t = toNumber(item?.t ?? item?.time ?? item?.timestamp);
    const o = toNumber(item?.o ?? item?.open);
    const h = toNumber(item?.h ?? item?.high);
    const l = toNumber(item?.l ?? item?.low);
    const c = toNumber(item?.c ?? item?.close);
    if (t == null || o == null || h == null || l == null || c == null) continue;
    const ms = t > 1e12 ? Math.floor(t) : Math.floor(t * 1000);
    next.push({ t: ms, o, h, l, c, v: toNumber(item?.v ?? item?.volume) });
  }
  return next.sort((a, b) => a.t - b.t);
}

function readStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredConfig(payload: any) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function readOptimizerPresets(): OptimizerPreset[] {
  try {
    const raw = localStorage.getItem(OPTIMIZER_PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id && item.name && item.config)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        createdAtMs: Number(item.createdAtMs) || Date.now(),
        updatedAtMs: Number(item.updatedAtMs) || Number(item.createdAtMs) || Date.now(),
        symbol: item.symbol ? String(item.symbol) : undefined,
        timeframe: item.timeframe ? String(item.timeframe) : undefined,
        config: item.config as OptimizerConfig
      }));
  } catch {
    return [];
  }
}

function writeOptimizerPresets(presets: OptimizerPreset[]) {
  try {
    localStorage.setItem(OPTIMIZER_PRESET_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

function readBatchPresets(): BatchPreset[] {
  try {
    const raw = localStorage.getItem(BATCH_PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id && item.name && item.config)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        createdAtMs: Number(item.createdAtMs) || Date.now(),
        updatedAtMs: Number(item.updatedAtMs) || Number(item.createdAtMs) || Date.now(),
        config: {
          symbolsInput: String(item.config?.symbolsInput || ''),
          timeframesInput: String(item.config?.timeframesInput || ''),
          strategy: String(item.config?.strategy || 'RANGE_BREAKOUT').toUpperCase() as BacktestOptimizationStrategy,
          rangeDays: Number(item.config?.rangeDays) || DEFAULT_RANGE_DAYS,
          maxCombos: Number(item.config?.maxCombos) || 200
        }
      }));
  } catch {
    return [];
  }
}

function writeBatchPresets(presets: BatchPreset[]) {
  try {
    localStorage.setItem(BATCH_PRESET_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

function readMemoryPresets(): AgentMemoryFilterPreset[] {
  try {
    const raw = localStorage.getItem(MEMORY_PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id && item.name && item.filters)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        createdAtMs: Number(item.createdAtMs) || Date.now(),
        updatedAtMs: Number(item.updatedAtMs) || Number(item.createdAtMs) || Date.now(),
        filters: {
          agentId: String(item.filters?.agentId || ''),
          scope: String(item.filters?.scope || ''),
          category: String(item.filters?.category || ''),
          subcategory: String(item.filters?.subcategory || ''),
          symbol: String(item.filters?.symbol || ''),
          timeframe: String(item.filters?.timeframe || ''),
          kind: String(item.filters?.kind || ''),
          limit: Number(item.filters?.limit) || 12,
          query: String(item.filters?.query || '')
        }
      }));
  } catch {
    return [];
  }
}

function writeMemoryPresets(presets: AgentMemoryFilterPreset[]) {
  try {
    localStorage.setItem(MEMORY_PRESET_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

const BacktesterInterface = forwardRef<BacktesterHandle, BacktesterInterfaceProps>(
  (
    {
      activeSymbol,
      isConnected,
      onOpenSettings,
      onSymbolChange,
      resolveSymbol,
      onSendTrainingMessage,
      onSendToWatchlist,
      onFocusChart,
      onPersistOptimization,
      onRunActionCatalog,
      activePlaybookRun,
      recentPlaybookRuns,
      taskTreeResumeEntries = null,
      onResumeTaskTreeRun,
      taskTreeRuns,
      actionTaskTreeRuns,
      onReplayTaskTree,
      onResumePlaybookRun,
      onCreateWatchProfile,
      onReady
    },
    ref
  ) => {
  const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);
  const initialConfig = readStoredConfig();
  const [symbolInput, setSymbolInput] = useState<string>(initialConfig?.symbol || '');
  const [resolvedSymbol, setResolvedSymbol] = useState<string>(initialConfig?.resolvedSymbol || '');
  const [resolution, setResolution] = useState<string>(initialConfig?.resolution || '15m');
  const [rangeDays, setRangeDays] = useState<number>(clampRangeDays(Number(initialConfig?.rangeDays) || DEFAULT_RANGE_DAYS));
  const [maxBars, setMaxBars] = useState<number>(() => {
    const raw = Number(initialConfig?.maxBars);
    if (!Number.isFinite(raw)) return MAX_BARS;
    return Math.max(0, Math.floor(raw));
  });
  const runActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      if (onRunActionCatalog) {
        void onRunActionCatalog({ actionId, payload });
        return;
      }
      fallback?.();
    },
    [onRunActionCatalog]
  );
  const [rangeCfg, setRangeCfg] = useState<RangeBreakoutConfig>({
    enabled: initialConfig?.rangeCfg?.enabled ?? true,
    lookbackBars: initialConfig?.rangeCfg?.lookbackBars ?? DEFAULT_RANGE_BREAKOUT_CONFIG.lookbackBars,
    atrPeriod: initialConfig?.rangeCfg?.atrPeriod ?? DEFAULT_RANGE_BREAKOUT_CONFIG.atrPeriod,
    atrMult: initialConfig?.rangeCfg?.atrMult ?? DEFAULT_RANGE_BREAKOUT_CONFIG.atrMult,
    rr: initialConfig?.rangeCfg?.rr ?? DEFAULT_RANGE_BREAKOUT_CONFIG.rr,
    cooldownBars: initialConfig?.rangeCfg?.cooldownBars ?? DEFAULT_RANGE_BREAKOUT_CONFIG.cooldownBars,
    breakoutMode: initialConfig?.rangeCfg?.breakoutMode === 'wick' ? 'wick' : 'close',
    bufferAtrMult: initialConfig?.rangeCfg?.bufferAtrMult ?? DEFAULT_RANGE_BREAKOUT_CONFIG.bufferAtrMult
  });
  const [breakCfg, setBreakCfg] = useState<BreakRetestConfig>({
    enabled: initialConfig?.breakCfg?.enabled ?? false,
    lookbackBars: initialConfig?.breakCfg?.lookbackBars ?? DEFAULT_BREAK_RETEST_CONFIG.lookbackBars,
    atrPeriod: initialConfig?.breakCfg?.atrPeriod ?? DEFAULT_BREAK_RETEST_CONFIG.atrPeriod,
    atrMult: initialConfig?.breakCfg?.atrMult ?? DEFAULT_BREAK_RETEST_CONFIG.atrMult,
    rr: initialConfig?.breakCfg?.rr ?? DEFAULT_BREAK_RETEST_CONFIG.rr,
    cooldownBars: initialConfig?.breakCfg?.cooldownBars ?? DEFAULT_BREAK_RETEST_CONFIG.cooldownBars,
    breakoutMode: initialConfig?.breakCfg?.breakoutMode === 'wick' ? 'wick' : 'close',
    bufferAtrMult: initialConfig?.breakCfg?.bufferAtrMult ?? DEFAULT_BREAK_RETEST_CONFIG.bufferAtrMult,
    retestBars: initialConfig?.breakCfg?.retestBars ?? DEFAULT_BREAK_RETEST_CONFIG.retestBars,
    retestBufferAtrMult: initialConfig?.breakCfg?.retestBufferAtrMult ?? DEFAULT_BREAK_RETEST_CONFIG.retestBufferAtrMult,
    retestConfirm: initialConfig?.breakCfg?.retestConfirm === 'close' ? 'close' : 'touch'
  });
  const [fvgCfg, setFvgCfg] = useState<FvgRetraceConfig>({
    enabled: initialConfig?.fvgCfg?.enabled ?? true,
    atrPeriod: initialConfig?.fvgCfg?.atrPeriod ?? DEFAULT_FVG_RETRACE_CONFIG.atrPeriod,
    atrMult: initialConfig?.fvgCfg?.atrMult ?? DEFAULT_FVG_RETRACE_CONFIG.atrMult,
    rr: initialConfig?.fvgCfg?.rr ?? DEFAULT_FVG_RETRACE_CONFIG.rr,
    maxWaitBars: initialConfig?.fvgCfg?.maxWaitBars ?? DEFAULT_FVG_RETRACE_CONFIG.maxWaitBars,
    entryMode: initialConfig?.fvgCfg?.entryMode === 'edge' ? 'edge' : 'mid',
    minGapAtrMult: initialConfig?.fvgCfg?.minGapAtrMult ?? DEFAULT_FVG_RETRACE_CONFIG.minGapAtrMult
  });
  const [trendCfg, setTrendCfg] = useState<TrendPullbackConfig>({
    enabled: initialConfig?.trendCfg?.enabled ?? true,
    fastEma: initialConfig?.trendCfg?.fastEma ?? DEFAULT_TREND_PULLBACK_CONFIG.fastEma,
    slowEma: initialConfig?.trendCfg?.slowEma ?? DEFAULT_TREND_PULLBACK_CONFIG.slowEma,
    pullbackEma: initialConfig?.trendCfg?.pullbackEma === 'slow' ? 'slow' : 'fast',
    confirmMode: initialConfig?.trendCfg?.confirmMode === 'touch' ? 'touch' : 'close',
    minTrendBars: initialConfig?.trendCfg?.minTrendBars ?? DEFAULT_TREND_PULLBACK_CONFIG.minTrendBars,
    atrPeriod: initialConfig?.trendCfg?.atrPeriod ?? DEFAULT_TREND_PULLBACK_CONFIG.atrPeriod,
    atrMult: initialConfig?.trendCfg?.atrMult ?? DEFAULT_TREND_PULLBACK_CONFIG.atrMult,
    rr: initialConfig?.trendCfg?.rr ?? DEFAULT_TREND_PULLBACK_CONFIG.rr,
    cooldownBars: initialConfig?.trendCfg?.cooldownBars ?? DEFAULT_TREND_PULLBACK_CONFIG.cooldownBars
  });
  const [meanCfg, setMeanCfg] = useState<MeanReversionConfig>({
    enabled: initialConfig?.meanCfg?.enabled ?? true,
    smaPeriod: initialConfig?.meanCfg?.smaPeriod ?? DEFAULT_MEAN_REVERSION_CONFIG.smaPeriod,
    atrPeriod: initialConfig?.meanCfg?.atrPeriod ?? DEFAULT_MEAN_REVERSION_CONFIG.atrPeriod,
    bandAtrMult: initialConfig?.meanCfg?.bandAtrMult ?? DEFAULT_MEAN_REVERSION_CONFIG.bandAtrMult,
    stopAtrMult: initialConfig?.meanCfg?.stopAtrMult ?? DEFAULT_MEAN_REVERSION_CONFIG.stopAtrMult,
    rr: initialConfig?.meanCfg?.rr ?? DEFAULT_MEAN_REVERSION_CONFIG.rr,
    cooldownBars: initialConfig?.meanCfg?.cooldownBars ?? DEFAULT_MEAN_REVERSION_CONFIG.cooldownBars,
    useRsiFilter: initialConfig?.meanCfg?.useRsiFilter ?? DEFAULT_MEAN_REVERSION_CONFIG.useRsiFilter,
    rsiPeriod: initialConfig?.meanCfg?.rsiPeriod ?? DEFAULT_MEAN_REVERSION_CONFIG.rsiPeriod,
    rsiOversold: initialConfig?.meanCfg?.rsiOversold ?? DEFAULT_MEAN_REVERSION_CONFIG.rsiOversold,
    rsiOverbought: initialConfig?.meanCfg?.rsiOverbought ?? DEFAULT_MEAN_REVERSION_CONFIG.rsiOverbought
  });
  const [execCfg, setExecCfg] = useState<ExecutionConfig>({
    entryOrderType: initialConfig?.execCfg?.entryOrderType === 'limit'
      ? 'limit'
      : initialConfig?.execCfg?.entryOrderType === 'stop'
        ? 'stop'
        : 'market',
    entryTiming: initialConfig?.execCfg?.entryTiming === 'signal_close' ? 'signal_close' : 'next_open',
    entryDelayBars: initialConfig?.execCfg?.entryDelayBars ?? 0,
    maxEntryWaitBars: initialConfig?.execCfg?.maxEntryWaitBars ?? 0,
    exitMode: initialConfig?.execCfg?.exitMode === 'close' ? 'close' : 'touch',
    allowSameBarExit: initialConfig?.execCfg?.allowSameBarExit !== false,
    spreadModel: initialConfig?.execCfg?.spreadModel || 'none',
    spreadValue: initialConfig?.execCfg?.spreadValue ?? 0,
    spreadAtrMult: initialConfig?.execCfg?.spreadAtrMult ?? 0,
    spreadPct: initialConfig?.execCfg?.spreadPct ?? 0,
    maxSpreadValue: initialConfig?.execCfg?.maxSpreadValue ?? 0,
    slippageModel: initialConfig?.execCfg?.slippageModel || 'none',
    slippageValue: initialConfig?.execCfg?.slippageValue ?? 0,
    slippageAtrMult: initialConfig?.execCfg?.slippageAtrMult ?? 0,
    slippagePct: initialConfig?.execCfg?.slippagePct ?? 0,
    slippageOnExit: initialConfig?.execCfg?.slippageOnExit !== false,
    commissionModel: initialConfig?.execCfg?.commissionModel || 'none',
      commissionValue: initialConfig?.execCfg?.commissionValue ?? 0,
      commissionPct: initialConfig?.execCfg?.commissionPct ?? 0,
      minStopValue: initialConfig?.execCfg?.minStopValue ?? 0,
      minStopAtrMult: initialConfig?.execCfg?.minStopAtrMult ?? 0,
      minStopMode: initialConfig?.execCfg?.minStopMode === 'skip' ? 'skip' : 'adjust',
      sessionFilter: initialConfig?.execCfg?.sessionFilter || 'all',
      sessionTimezone: initialConfig?.execCfg?.sessionTimezone === 'local' ? 'local' : 'utc',
      sessionCostOverrides: {
        asia: normalizeSessionOverride(initialConfig?.execCfg?.sessionCostOverrides?.asia),
        london: normalizeSessionOverride(initialConfig?.execCfg?.sessionCostOverrides?.london),
        ny: normalizeSessionOverride(initialConfig?.execCfg?.sessionCostOverrides?.ny)
      },
      volatilitySlippageEnabled: initialConfig?.execCfg?.volatilitySlippageEnabled ?? false,
      volatilitySlippageLookback: initialConfig?.execCfg?.volatilitySlippageLookback ?? 50,
      volatilitySlippageLowThresh: initialConfig?.execCfg?.volatilitySlippageLowThresh ?? 0.8,
      volatilitySlippageHighThresh: initialConfig?.execCfg?.volatilitySlippageHighThresh ?? 1.2,
      volatilitySlippageLowMult: initialConfig?.execCfg?.volatilitySlippageLowMult ?? 0.8,
      volatilitySlippageMidMult: initialConfig?.execCfg?.volatilitySlippageMidMult ?? 1,
      volatilitySlippageHighMult: initialConfig?.execCfg?.volatilitySlippageHighMult ?? 1.5,
      partialFillMode: initialConfig?.execCfg?.partialFillMode === 'range' ? 'range' : 'none',
      partialFillAtrMult: initialConfig?.execCfg?.partialFillAtrMult ?? 2,
      partialFillMinRatio: initialConfig?.execCfg?.partialFillMinRatio ?? 0.35,
      partialFillOnExit: initialConfig?.execCfg?.partialFillOnExit ?? false,
      newsSpikeAtrMult: initialConfig?.execCfg?.newsSpikeAtrMult ?? 3,
      newsSpikeSlippageMult: initialConfig?.execCfg?.newsSpikeSlippageMult ?? 2,
      newsSpikeSpreadMult: initialConfig?.execCfg?.newsSpikeSpreadMult ?? 1.5
    });
  const [execRealismPreset, setExecRealismPreset] = useState<RealismPresetLevel>('custom');
  const getSessionOverride = (session: 'asia' | 'london' | 'ny') => {
    const override = execCfg.sessionCostOverrides?.[session];
    return normalizeSessionOverride(override);
  };
  const updateSessionOverride = useCallback(
    (session: 'asia' | 'london' | 'ny', patch: Partial<ExecutionConfig['sessionCostOverrides']['asia']>) => {
      setExecCfg((prev) => ({
        ...prev,
        sessionCostOverrides: {
          ...prev.sessionCostOverrides,
          [session]: { ...prev.sessionCostOverrides?.[session], ...patch }
        }
      }));
    },
    []
  );
  const asiaCost = getSessionOverride('asia');
  const londonCost = getSessionOverride('london');
  const nyCost = getSessionOverride('ny');
  const applyExecutionPreset = useCallback((level: Exclude<RealismPresetLevel, 'custom'>) => {
    const preset = EXECUTION_REALISM_PRESETS[level];
    if (!preset) return;
    setExecCfg((prev) => {
      const overrides = preset.config.sessionCostOverrides || {};
      return {
        ...prev,
        ...preset.config,
        sessionCostOverrides: {
          asia: { ...prev.sessionCostOverrides?.asia, ...overrides.asia },
          london: { ...prev.sessionCostOverrides?.london, ...overrides.london },
          ny: { ...prev.sessionCostOverrides?.ny, ...overrides.ny }
        }
      };
    });
  }, []);
  const [confluenceCfg, setConfluenceCfg] = useState<ConfluenceConfig>({
    enabled: initialConfig?.confluenceCfg?.enabled ?? false,
    htfResolution: initialConfig?.confluenceCfg?.htfResolution || '4H',
    biasMode: initialConfig?.confluenceCfg?.biasMode || 'ema',
    emaFast: initialConfig?.confluenceCfg?.emaFast ?? 20,
    emaSlow: initialConfig?.confluenceCfg?.emaSlow ?? 50,
    smaPeriod: initialConfig?.confluenceCfg?.smaPeriod ?? 50,
    rangeLookback: initialConfig?.confluenceCfg?.rangeLookback ?? 20,
    allowNeutral: initialConfig?.confluenceCfg?.allowNeutral ?? false,
    usePrevHtfBar: initialConfig?.confluenceCfg?.usePrevHtfBar ?? true,
    biasReference: initialConfig?.confluenceCfg?.biasReference === 'signal' ? 'signal' : 'entry'
  });
  const [validationCfg, setValidationCfg] = useState<ValidationConfig>({
    enabled: initialConfig?.validationCfg?.enabled ?? false,
    mode: initialConfig?.validationCfg?.mode === 'last_days' ? 'last_days' : 'percent',
    splitPercent: initialConfig?.validationCfg?.splitPercent ?? 70,
    lastDays: initialConfig?.validationCfg?.lastDays ?? 30,
    useReplayWindow: initialConfig?.validationCfg?.useReplayWindow ?? false
  });
  const [walkForwardCfg, setWalkForwardCfg] = useState<WalkForwardConfig>({
    enabled: initialConfig?.walkForwardCfg?.enabled ?? false,
    trainDays: initialConfig?.walkForwardCfg?.trainDays ?? 90,
    testDays: initialConfig?.walkForwardCfg?.testDays ?? 30,
    stepDays: initialConfig?.walkForwardCfg?.stepDays ?? 30,
    minTrades: initialConfig?.walkForwardCfg?.minTrades ?? 10,
    useReplayWindow: initialConfig?.walkForwardCfg?.useReplayWindow ?? false
  });
  const [optimizerCfg, setOptimizerCfg] = useState<OptimizerConfig>({
    sortBy: initialConfig?.optimizerCfg?.sortBy || 'netR',
    maxCombos: initialConfig?.optimizerCfg?.maxCombos ?? 250,
    topN: initialConfig?.optimizerCfg?.topN ?? 12,
    useReplayWindow: initialConfig?.optimizerCfg?.useReplayWindow ?? true,
    useConfluence: initialConfig?.optimizerCfg?.useConfluence ?? false,
    range: {
      enabled: initialConfig?.optimizerCfg?.range?.enabled ?? (initialConfig?.rangeCfg?.enabled ?? true),
      lookbackBars: initialConfig?.optimizerCfg?.range?.lookbackBars ?? String(initialConfig?.rangeCfg?.lookbackBars ?? DEFAULT_RANGE_BREAKOUT_CONFIG.lookbackBars),
      atrMult: initialConfig?.optimizerCfg?.range?.atrMult ?? String(initialConfig?.rangeCfg?.atrMult ?? DEFAULT_RANGE_BREAKOUT_CONFIG.atrMult),
      rr: initialConfig?.optimizerCfg?.range?.rr ?? String(initialConfig?.rangeCfg?.rr ?? DEFAULT_RANGE_BREAKOUT_CONFIG.rr),
      breakoutMode: initialConfig?.optimizerCfg?.range?.breakoutMode ?? String(initialConfig?.rangeCfg?.breakoutMode ?? 'close'),
      bufferAtrMult: initialConfig?.optimizerCfg?.range?.bufferAtrMult ?? String(initialConfig?.rangeCfg?.bufferAtrMult ?? DEFAULT_RANGE_BREAKOUT_CONFIG.bufferAtrMult)
    },
    breakRetest: {
      enabled: initialConfig?.optimizerCfg?.breakRetest?.enabled ?? (initialConfig?.breakCfg?.enabled ?? false),
      lookbackBars: initialConfig?.optimizerCfg?.breakRetest?.lookbackBars ?? String(initialConfig?.breakCfg?.lookbackBars ?? DEFAULT_BREAK_RETEST_CONFIG.lookbackBars),
      atrMult: initialConfig?.optimizerCfg?.breakRetest?.atrMult ?? String(initialConfig?.breakCfg?.atrMult ?? DEFAULT_BREAK_RETEST_CONFIG.atrMult),
      rr: initialConfig?.optimizerCfg?.breakRetest?.rr ?? String(initialConfig?.breakCfg?.rr ?? DEFAULT_BREAK_RETEST_CONFIG.rr),
      breakoutMode: initialConfig?.optimizerCfg?.breakRetest?.breakoutMode ?? String(initialConfig?.breakCfg?.breakoutMode ?? 'close'),
      bufferAtrMult: initialConfig?.optimizerCfg?.breakRetest?.bufferAtrMult ?? String(initialConfig?.breakCfg?.bufferAtrMult ?? DEFAULT_BREAK_RETEST_CONFIG.bufferAtrMult),
      retestBars: initialConfig?.optimizerCfg?.breakRetest?.retestBars ?? String(initialConfig?.breakCfg?.retestBars ?? DEFAULT_BREAK_RETEST_CONFIG.retestBars),
      retestBufferAtrMult: initialConfig?.optimizerCfg?.breakRetest?.retestBufferAtrMult ?? String(initialConfig?.breakCfg?.retestBufferAtrMult ?? DEFAULT_BREAK_RETEST_CONFIG.retestBufferAtrMult),
      retestConfirm: initialConfig?.optimizerCfg?.breakRetest?.retestConfirm ?? String(initialConfig?.breakCfg?.retestConfirm ?? 'touch')
    },
    fvg: {
      enabled: initialConfig?.optimizerCfg?.fvg?.enabled ?? (initialConfig?.fvgCfg?.enabled ?? true),
      atrMult: initialConfig?.optimizerCfg?.fvg?.atrMult ?? String(initialConfig?.fvgCfg?.atrMult ?? DEFAULT_FVG_RETRACE_CONFIG.atrMult),
      rr: initialConfig?.optimizerCfg?.fvg?.rr ?? String(initialConfig?.fvgCfg?.rr ?? DEFAULT_FVG_RETRACE_CONFIG.rr),
      maxWaitBars: initialConfig?.optimizerCfg?.fvg?.maxWaitBars ?? String(initialConfig?.fvgCfg?.maxWaitBars ?? DEFAULT_FVG_RETRACE_CONFIG.maxWaitBars),
      entryMode: initialConfig?.optimizerCfg?.fvg?.entryMode ?? String(initialConfig?.fvgCfg?.entryMode ?? 'mid'),
      minGapAtrMult: initialConfig?.optimizerCfg?.fvg?.minGapAtrMult ?? String(initialConfig?.fvgCfg?.minGapAtrMult ?? DEFAULT_FVG_RETRACE_CONFIG.minGapAtrMult)
    },
    trend: {
      enabled: initialConfig?.optimizerCfg?.trend?.enabled ?? (initialConfig?.trendCfg?.enabled ?? true),
      fastEma: initialConfig?.optimizerCfg?.trend?.fastEma ?? String(initialConfig?.trendCfg?.fastEma ?? DEFAULT_TREND_PULLBACK_CONFIG.fastEma),
      slowEma: initialConfig?.optimizerCfg?.trend?.slowEma ?? String(initialConfig?.trendCfg?.slowEma ?? DEFAULT_TREND_PULLBACK_CONFIG.slowEma),
      atrMult: initialConfig?.optimizerCfg?.trend?.atrMult ?? String(initialConfig?.trendCfg?.atrMult ?? DEFAULT_TREND_PULLBACK_CONFIG.atrMult),
      rr: initialConfig?.optimizerCfg?.trend?.rr ?? String(initialConfig?.trendCfg?.rr ?? DEFAULT_TREND_PULLBACK_CONFIG.rr),
      confirmMode: initialConfig?.optimizerCfg?.trend?.confirmMode ?? String(initialConfig?.trendCfg?.confirmMode ?? 'touch'),
      pullbackEma: initialConfig?.optimizerCfg?.trend?.pullbackEma ?? String(initialConfig?.trendCfg?.pullbackEma ?? 'fast'),
      minTrendBars: initialConfig?.optimizerCfg?.trend?.minTrendBars ?? String(initialConfig?.trendCfg?.minTrendBars ?? DEFAULT_TREND_PULLBACK_CONFIG.minTrendBars)
    },
    mean: {
      enabled: initialConfig?.optimizerCfg?.mean?.enabled ?? (initialConfig?.meanCfg?.enabled ?? true),
      smaPeriod: initialConfig?.optimizerCfg?.mean?.smaPeriod ?? String(initialConfig?.meanCfg?.smaPeriod ?? DEFAULT_MEAN_REVERSION_CONFIG.smaPeriod),
      bandAtrMult: initialConfig?.optimizerCfg?.mean?.bandAtrMult ?? String(initialConfig?.meanCfg?.bandAtrMult ?? DEFAULT_MEAN_REVERSION_CONFIG.bandAtrMult),
      stopAtrMult: initialConfig?.optimizerCfg?.mean?.stopAtrMult ?? String(initialConfig?.meanCfg?.stopAtrMult ?? DEFAULT_MEAN_REVERSION_CONFIG.stopAtrMult),
      rr: initialConfig?.optimizerCfg?.mean?.rr ?? String(initialConfig?.meanCfg?.rr ?? DEFAULT_MEAN_REVERSION_CONFIG.rr),
      useRsiFilter: initialConfig?.optimizerCfg?.mean?.useRsiFilter ?? String(initialConfig?.meanCfg?.useRsiFilter ?? DEFAULT_MEAN_REVERSION_CONFIG.useRsiFilter),
      rsiPeriod: initialConfig?.optimizerCfg?.mean?.rsiPeriod ?? String(initialConfig?.meanCfg?.rsiPeriod ?? DEFAULT_MEAN_REVERSION_CONFIG.rsiPeriod)
    }
  });
  const [tieBreaker, setTieBreaker] = useState<'sl' | 'tp'>(initialConfig?.tieBreaker === 'tp' ? 'tp' : 'sl');
  const [bars, setBars] = useState<Candle[]>([]);
  const [barsUpdatedAtMs, setBarsUpdatedAtMs] = useState<number | null>(null);
  const [barsSource, setBarsSource] = useState<string | null>(null);
  const [barsError, setBarsError] = useState<string | null>(null);
  const [barsLoading, setBarsLoading] = useState(false);
  const [barsRetryAtMs, setBarsRetryAtMs] = useState<number | null>(null);
  const [barsTrimmed, setBarsTrimmed] = useState(false);
  const [barsCached, setBarsCached] = useState(false);
  const [barsHistoryFromMs, setBarsHistoryFromMs] = useState<number | null>(null);
  const [barsHistoryToMs, setBarsHistoryToMs] = useState<number | null>(null);
  const [barsHistoryChunks, setBarsHistoryChunks] = useState<number | null>(null);
  const [manualRunStatus, setManualRunStatus] = useState<string | null>(null);
  const [manualRunAtMs, setManualRunAtMs] = useState<number | null>(null);
  const [htfBars, setHtfBars] = useState<Candle[]>([]);
  const [htfUpdatedAtMs, setHtfUpdatedAtMs] = useState<number | null>(null);
  const [htfError, setHtfError] = useState<string | null>(null);
  const [htfLoading, setHtfLoading] = useState(false);
  const [htfRetryAtMs, setHtfRetryAtMs] = useState<number | null>(null);
  const [htfCached, setHtfCached] = useState(false);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const [replayEnabled, setReplayEnabled] = useState<boolean>(initialConfig?.replayEnabled ?? true);
    const [replayIndex, setReplayIndex] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playSpeed, setPlaySpeed] = useState<number>(initialConfig?.playSpeed ?? 3);
    const [autoSummaryEnabled, setAutoSummaryEnabled] = useState<boolean>(initialConfig?.autoSummaryEnabled ?? false);
    const [autoSummaryIntervalMin, setAutoSummaryIntervalMin] = useState<number>(initialConfig?.autoSummaryIntervalMin ?? 30);
    const [autoSummaryLastSentAt, setAutoSummaryLastSentAt] = useState<number | null>(null);
  const [watchlistStatus, setWatchlistStatus] = useState<string | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistMode, setWatchlistMode] = useState<'suggest' | 'paper' | 'live'>('suggest');
  const [watchlistApplyToChart, setWatchlistApplyToChart] = useState(true);
  const [truthEvents, setTruthEvents] = useState<any[]>([]);
  const [truthEventsError, setTruthEventsError] = useState<string | null>(null);
  const [truthEventsUpdatedAtMs, setTruthEventsUpdatedAtMs] = useState<number | null>(null);
  const [truthEventFilter, setTruthEventFilter] = useState<'all' | 'trade' | 'broker' | 'playbook' | 'task' | 'setup' | 'chart' | 'agent'>(() => {
    try {
      const saved = localStorage.getItem('glass_truth_event_filter');
      if (saved === 'trade' || saved === 'broker' || saved === 'playbook' || saved === 'task' || saved === 'setup' || saved === 'chart' || saved === 'agent') return saved;
    } catch {
      // ignore
    }
    return 'all';
  });
  const [taskTruthRunId, setTaskTruthRunId] = useState<string>('');
  const [taskTruthEvents, setTaskTruthEvents] = useState<any[]>([]);
  const [taskTruthError, setTaskTruthError] = useState<string | null>(null);
  const [taskTruthUpdatedAtMs, setTaskTruthUpdatedAtMs] = useState<number | null>(null);
  const [timelineStepFilters, setTimelineStepFilters] = useState<string[]>([]);
  const [agentMemoryEntries, setAgentMemoryEntries] = useState<any[]>([]);
  const [agentMemoryLoading, setAgentMemoryLoading] = useState(false);
  const [agentMemoryError, setAgentMemoryError] = useState<string | null>(null);
  const [agentMemoryUpdatedAtMs, setAgentMemoryUpdatedAtMs] = useState<number | null>(null);
  const [agentMemorySymbol, setAgentMemorySymbol] = useState<string>(initialConfig?.agentMemorySymbol || '');
  const [agentMemoryTimeframe, setAgentMemoryTimeframe] = useState<string>(initialConfig?.agentMemoryTimeframe || '');
  const [agentMemoryKind, setAgentMemoryKind] = useState<string>(initialConfig?.agentMemoryKind || '');
  const [agentMemoryAgentId, setAgentMemoryAgentId] = useState<string>(initialConfig?.agentMemoryAgentId || '');
  const [agentMemoryScope, setAgentMemoryScope] = useState<string>(initialConfig?.agentMemoryScope || '');
  const [agentMemoryCategory, setAgentMemoryCategory] = useState<string>(initialConfig?.agentMemoryCategory || '');
  const [agentMemorySubcategory, setAgentMemorySubcategory] = useState<string>(initialConfig?.agentMemorySubcategory || '');
  const [agentMemoryLimit, setAgentMemoryLimit] = useState<number>(initialConfig?.agentMemoryLimit ?? 12);
  const [agentMemoryQuery, setAgentMemoryQuery] = useState<string>('');
  const [agentMemoryExpandedId, setAgentMemoryExpandedId] = useState<string | null>(null);
  const [memoryPresets, setMemoryPresets] = useState<AgentMemoryFilterPreset[]>(() => readMemoryPresets());
  const [memoryPresetId, setMemoryPresetId] = useState<string>('');
  const [memoryPresetName, setMemoryPresetName] = useState<string>('');
  const [memoryPresetStatus, setMemoryPresetStatus] = useState<string | null>(null);
  const [memoryPresetError, setMemoryPresetError] = useState<string | null>(null);
  const [experimentNotes, setExperimentNotes] = useState<ExperimentNote[]>([]);
  const [experimentsLoading, setExperimentsLoading] = useState(false);
  const [experimentsError, setExperimentsError] = useState<string | null>(null);
  const [experimentsUpdatedAtMs, setExperimentsUpdatedAtMs] = useState<number | null>(null);
  const [researchSession, setResearchSession] = useState<ResearchSession | null>(null);
  const [researchSteps, setResearchSteps] = useState<any[]>([]);
  const [researchRunning, setResearchRunning] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);
  const [researchUpdatedAtMs, setResearchUpdatedAtMs] = useState<number | null>(null);
  const storedResearchCfg = initialConfig?.researchCfg || {};
  const [researchPresetId, setResearchPresetId] = useState<string>(() => {
    const stored = String(storedResearchCfg.presetId || '').trim();
    if (stored && DEFAULT_LOOP_PRESETS.some((preset) => preset.id === stored)) return stored;
    return DEFAULT_LOOP_PRESETS[0]?.id || 'winrate_dd';
  });
  const [researchMaxExperiments, setResearchMaxExperiments] = useState<number>(() => {
    const raw = Number(storedResearchCfg.maxExperiments);
    return Number.isFinite(raw) ? Math.max(1, Math.min(10, Math.floor(raw))) : 3;
  });
  const [researchRobustness, setResearchRobustness] = useState<'lite' | 'standard' | 'strict'>(() => {
    const raw = String(storedResearchCfg.robustness || '').toLowerCase();
    return raw === 'lite' || raw === 'strict' ? raw : 'standard';
  });
  const [researchRegimeOverrides, setResearchRegimeOverrides] = useState<boolean>(() => {
    return storedResearchCfg.regimeOverrides === true;
  });
  const [researchAllowRegimeBrittle, setResearchAllowRegimeBrittle] = useState<boolean>(() => {
    const stored = storedResearchCfg.allowRegimeBrittle;
    return typeof stored === 'boolean' ? stored : getRegimeDefaults(researchRobustness).allowBrittle;
  });
  const [researchRequiredRegimePassRate, setResearchRequiredRegimePassRate] = useState<number>(() => {
    const stored = Number(storedResearchCfg.requiredRegimePassRate);
    if (Number.isFinite(stored)) return Math.max(0.4, Math.min(0.9, stored));
    return getRegimeDefaults(researchRobustness).passRate;
  });
  const [researchMinRegimesSeen, setResearchMinRegimesSeen] = useState<number>(() => {
    const stored = Number(storedResearchCfg.minRegimesSeen);
    if (Number.isFinite(stored)) return Math.max(1, Math.min(5, Math.floor(stored)));
    return getRegimeDefaults(researchRobustness).minSeen;
  });
  const [researchCriticalRegimes, setResearchCriticalRegimes] = useState<string[]>(() => {
    const stored = Array.isArray(storedResearchCfg.criticalRegimes)
      ? storedResearchCfg.criticalRegimes.map((entry: any) => String(entry))
      : [];
    return stored.length > 0 ? stored : getRegimeDefaults(researchRobustness).critical;
  });
  const [researchCriticalRegimesExtra, setResearchCriticalRegimesExtra] = useState<string>(() => {
    return String(storedResearchCfg.criticalRegimesExtra || '');
  });
  const [researchAdvancedOpen, setResearchAdvancedOpen] = useState<boolean>(() => {
    return storedResearchCfg.advancedOpen === true;
  });
  const researchTimerRef = useRef<(() => void) | null>(null);
  const researchChampion = researchSession?.stats?.champion || null;
  const researchChampionsByRegime = researchSession?.stats?.championsByRegime || null;
  const researchRegimeFrequency = researchSession?.stats?.regimeFrequency || null;
  const researchTargetRegimeKey =
    researchSession?.stats?.targetRegimeKey || (researchSession?.config?.targetRegimeKey as string | null) || null;
  const researchTargetOutcome = researchSession?.stats?.targetRegimeOutcome || null;
  const researchTargetMinSamples = Number.isFinite(Number(researchSession?.config?.minTargetRegimeSamples))
    ? Number(researchSession?.config?.minTargetRegimeSamples)
    : null;
  const canPromoteChampion = Boolean(
    onCreateWatchProfile
      && researchChampion
      && researchChampion.decision === 'adopt'
      && (researchChampion.experimentNoteId || researchChampion.experimentId)
  );
  const researchChampionMetrics = researchChampion?.testMetrics || null;
  const researchChampionWorst = researchChampion?.robustnessWorstCase || null;
  const researchRegimeCoverage = researchChampion?.regimeCoverageSummary || null;
  const researchRegimeRows = useMemo(() => {
    if (!researchRegimeFrequency) return [];
    const entries = Object.entries(researchRegimeFrequency)
      .map(([key, count]) => ({ key, count: Number(count) || 0 }))
      .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));
    return entries.slice(0, 6).map((entry) => ({
      regimeKey: entry.key,
      count: entry.count,
      record: researchChampionsByRegime?.[entry.key] || null
    }));
  }, [researchChampionsByRegime, researchRegimeFrequency]);
  const effectiveRegimeDefaults = useMemo(() => getRegimeDefaults(researchRobustness), [researchRobustness]);
  const effectiveRegimePassRate = researchRegimeOverrides ? researchRequiredRegimePassRate : effectiveRegimeDefaults.passRate;
  const effectiveMinRegimesSeen = researchRegimeOverrides ? researchMinRegimesSeen : effectiveRegimeDefaults.minSeen;
  const effectiveAllowRegimeBrittle = researchRegimeOverrides ? researchAllowRegimeBrittle : effectiveRegimeDefaults.allowBrittle;
  const effectiveCriticalRegimes = useMemo(() => {
    const base = researchRegimeOverrides ? researchCriticalRegimes : effectiveRegimeDefaults.critical;
    const extras = researchRegimeOverrides ? parseRegimeList(researchCriticalRegimesExtra) : [];
    return Array.from(new Set([...base, ...extras].map((entry) => String(entry)).filter(Boolean)));
  }, [
    effectiveRegimeDefaults.critical,
    researchCriticalRegimes,
    researchCriticalRegimesExtra,
    researchRegimeOverrides
  ]);

  useEffect(() => {
    if (researchRegimeOverrides) return;
    setResearchAllowRegimeBrittle(effectiveRegimeDefaults.allowBrittle);
    setResearchRequiredRegimePassRate(effectiveRegimeDefaults.passRate);
    setResearchMinRegimesSeen(effectiveRegimeDefaults.minSeen);
    setResearchCriticalRegimes(effectiveRegimeDefaults.critical);
    setResearchCriticalRegimesExtra('');
  }, [effectiveRegimeDefaults, researchRegimeOverrides]);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [optimizerResults, setOptimizerResults] = useState<OptimizerResult[]>([]);
  const [optimizerRunning, setOptimizerRunning] = useState(false);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);
  const [optimizerSummary, setOptimizerSummary] = useState<{
    attempted: number;
    estimated: number;
    durationMs: number;
    truncated: boolean;
  } | null>(null);
  const [optimizerAppliedId, setOptimizerAppliedId] = useState<string | null>(null);
  const [optimizerPresets, setOptimizerPresets] = useState<OptimizerPreset[]>(() => readOptimizerPresets());
  const [optimizerPresetId, setOptimizerPresetId] = useState<string>('');
  const [optimizerPresetName, setOptimizerPresetName] = useState<string>('');
  const [optimizerPresetError, setOptimizerPresetError] = useState<string | null>(null);
  const [optimizerPresetStatus, setOptimizerPresetStatus] = useState<string | null>(null);
  const [batchStrategy, setBatchStrategy] = useState<BacktestOptimizationStrategy>(() => {
    const raw = String(initialConfig?.batchCfg?.strategy || 'RANGE_BREAKOUT').toUpperCase();
    return raw === 'BREAK_RETEST' || raw === 'FVG_RETRACE' || raw === 'TREND_PULLBACK' || raw === 'MEAN_REVERSION'
      ? (raw as BacktestOptimizationStrategy)
      : 'RANGE_BREAKOUT';
  });
  const [batchSymbolsInput, setBatchSymbolsInput] = useState<string>(() => {
    return String(initialConfig?.batchCfg?.symbolsInput || initialConfig?.resolvedSymbol || initialConfig?.symbol || '').trim();
  });
  const [batchTimeframesInput, setBatchTimeframesInput] = useState<string>(() => {
    return String(initialConfig?.batchCfg?.timeframesInput || initialConfig?.resolution || '15m').trim();
  });
  const [batchRangeDays, setBatchRangeDays] = useState<number>(() => {
    const raw = Number(initialConfig?.batchCfg?.rangeDays);
    return Number.isFinite(raw)
      ? clampRangeDays(raw)
      : clampRangeDays(Number(initialConfig?.rangeDays) || DEFAULT_RANGE_DAYS);
  });
  const [batchMaxCombos, setBatchMaxCombos] = useState<number>(() => {
    const raw = Number(initialConfig?.batchCfg?.maxCombos);
    return Number.isFinite(raw) ? Math.max(1, Math.min(2000, Math.floor(raw))) : Math.max(10, Math.min(2000, optimizerCfg.maxCombos));
  });
  const [batchAutoApplyCount, setBatchAutoApplyCount] = useState<number>(() => {
    const raw = Number(initialConfig?.batchCfg?.autoApplyCount);
    return Number.isFinite(raw) ? Math.max(1, Math.min(50, Math.floor(raw))) : 3;
  });
  const [batchResults, setBatchResults] = useState<BatchOptimizationRow[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchProgressLabel, setBatchProgressLabel] = useState<string>('');
  const [batchProgressPct, setBatchProgressPct] = useState<number | null>(null);
  const [batchSummary, setBatchSummary] = useState<{ totalRuns: number; completedRuns: number; durationMs: number; cancelled: boolean } | null>(null);
  const [batchAutoApplyRunning, setBatchAutoApplyRunning] = useState(false);
  const [batchAutoApplyStatus, setBatchAutoApplyStatus] = useState<string | null>(null);
  const [batchPresets, setBatchPresets] = useState<BatchPreset[]>(() => readBatchPresets());
  const [batchPresetId, setBatchPresetId] = useState<string>('');
  const [batchPresetName, setBatchPresetName] = useState<string>('');
  const [batchPresetStatus, setBatchPresetStatus] = useState<string | null>(null);
  const [batchPresetError, setBatchPresetError] = useState<string | null>(null);
  const [optimizerLoopPresetId, setOptimizerLoopPresetId] = useState<string>(
    () => DEFAULT_LOOP_PRESETS[0]?.id || 'balanced'
  );
  const [optimizerLoopSession, setOptimizerLoopSession] = useState<OptimizerSession | null>(null);
  const [optimizerLoopResults, setOptimizerLoopResults] = useState<OptimizerResults | null>(null);
  const [optimizerLoopError, setOptimizerLoopError] = useState<string | null>(null);
  const [optimizerLoopRunning, setOptimizerLoopRunning] = useState(false);
  const [optimizerLoopAppliedStatus, setOptimizerLoopAppliedStatus] = useState<string | null>(null);
  const [optimizerLoopApplyError, setOptimizerLoopApplyError] = useState<string | null>(null);
  const [optimizerLoopApplyWarnings, setOptimizerLoopApplyWarnings] = useState<string[]>([]);
  const [resumeOverrides, setResumeOverrides] = useState<Record<string, {
    symbol: string;
    timeframe: string;
    strategy: string;
    timeframes: string;
    dataJson: string;
  }>>({});
  const [resumeOverrideErrors, setResumeOverrideErrors] = useState<Record<string, string>>({});
  const [selectedTaskTreeRunId, setSelectedTaskTreeRunId] = useState('');
  const [selectedActionTaskTreeRunId, setSelectedActionTaskTreeRunId] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const equityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const walkForwardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastAutoSummaryHashRef = useRef<string>('');
  const lastAutoSummaryAtRef = useRef<number>(0);
  const lastPersistedMemoryHashRef = useRef<string>('');
  const optimizerImportRef = useRef<HTMLInputElement | null>(null);
  const batchCancelRef = useRef(false);
  const batchAutoApplyQueueRef = useRef<BatchOptimizationRow[]>([]);
  const batchAutoApplyIndexRef = useRef<number>(0);
  const batchAutoApplyTimerRef = useRef<number | null>(null);
  const optimizerLoopTimerRef = useRef<(() => void) | null>(null);
  const buildPresetExportPayloadRef = useRef<(() => string) | null>(null);
  const importOptimizerPresetsFromTextRef = useRef<((rawText: string) => any) | null>(null);
  const runBatchOptimizationRef = useRef<(() => void) | null>(null);

  const didInitSymbolRef = useRef(false);
  const resolveAndSetSymbol = useCallback(async (raw: string) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return;

    setResolvedSymbol(cleaned);
    onSymbolChange?.(cleaned);

    if (!resolveSymbol) return;

    try {
      const resolved = await Promise.race([
        resolveSymbol(cleaned),
        new Promise<string | null>((_, reject) =>
          setTimeout(() => reject(new Error('Resolve timeout')), 3000)
        )
      ]);
      const finalSymbol = String(resolved || cleaned).trim();
      if (finalSymbol && finalSymbol !== cleaned) {
        setResolvedSymbol(finalSymbol);
        onSymbolChange?.(finalSymbol);
      }
    } catch {
      // Keep the cleaned symbol when resolution fails.
    }
  }, [onSymbolChange, resolveSymbol]);
  useEffect(() => {
    if (didInitSymbolRef.current) return;
    const seed = String(symbolInput || activeSymbol || '').trim();
    if (!symbolInput && activeSymbol) setSymbolInput(activeSymbol);
    if (seed) {
      if (!resolveSymbol) {
        setResolvedSymbol(seed);
        onSymbolChange?.(seed);
      } else {
        resolveSymbol(seed)
          .then((resolved) => {
            const finalSymbol = String(resolved || seed).trim();
            setResolvedSymbol(finalSymbol);
            onSymbolChange?.(finalSymbol);
          })
          .catch(() => {
            setResolvedSymbol(seed);
            onSymbolChange?.(seed);
          });
      }
    }
    didInitSymbolRef.current = true;
  }, [activeSymbol, onSymbolChange, resolveSymbol, symbolInput]);

  const debouncedSymbol = useDebouncedValue(resolvedSymbol, 400);
  const debouncedResolution = useDebouncedValue(resolution, 400);
  const debouncedRangeDays = useDebouncedValue(rangeDays, 400);
  const debouncedHtfResolution = useDebouncedValue(confluenceCfg.htfResolution, 400);
  const debouncedConfluenceEnabled = useDebouncedValue(confluenceCfg.enabled, 400);
  const debouncedRangeCfg = useDebouncedValue(rangeCfg, 200);
  const debouncedBreakCfg = useDebouncedValue(breakCfg, 200);
  const debouncedFvgCfg = useDebouncedValue(fvgCfg, 200);
  const debouncedTrendCfg = useDebouncedValue(trendCfg, 200);
  const debouncedMeanCfg = useDebouncedValue(meanCfg, 200);
  const debouncedExecCfg = useDebouncedValue(execCfg, 200);
  const debouncedConfluenceCfg = useDebouncedValue(confluenceCfg, 200);
  const debouncedTieBreaker = useDebouncedValue(tieBreaker, 200);
  const [workerTrades, setWorkerTrades] = useState<BacktestTrade[] | null>(null);
  const [workerComputeRunning, setWorkerComputeRunning] = useState(false);
  const [workerComputeError, setWorkerComputeError] = useState<string | null>(null);
  const [workerAnalysisRunning, setWorkerAnalysisRunning] = useState(false);
  const [workerAnalysisError, setWorkerAnalysisError] = useState<string | null>(null);
  const [workerValidationData, setWorkerValidationData] = useState<any | null>(null);
  const [workerWalkForwardData, setWorkerWalkForwardData] = useState<any | null>(null);
  const workerComputeRequestRef = useRef(0);
  const workerAnalysisRequestRef = useRef(0);
  const workerTradeKeyRef = useRef<string>('');
  const workerAnalysisKeyRef = useRef<string>('');
  const workerTradesCacheRef = useRef<Map<string, CacheEntry<BacktestTrade[]>>>(new Map());
  const workerAnalysisCacheRef = useRef<
    Map<string, CacheEntry<{ validation: any | null; walkForward: any | null }>>
  >(new Map());
  const localTradesCacheRef = useRef<Map<string, CacheEntry<BacktestTrade[]>>>(new Map());
  const localAnalysisCacheRef = useRef<Map<string, CacheEntry<any>>>(new Map());

  useEffect(() => {
    writeStoredConfig({
      symbol: symbolInput,
      resolvedSymbol,
      resolution,
      rangeDays,
      maxBars,
      rangeCfg,
      breakCfg,
      fvgCfg,
      trendCfg,
      meanCfg,
      execCfg,
      confluenceCfg,
      validationCfg,
      walkForwardCfg,
      optimizerCfg,
      tieBreaker,
      replayEnabled,
      playSpeed,
      autoSummaryEnabled,
      autoSummaryIntervalMin,
      agentMemorySymbol,
      agentMemoryTimeframe,
      agentMemoryKind,
      agentMemoryAgentId,
      agentMemoryScope,
      agentMemoryCategory,
      agentMemorySubcategory,
      agentMemoryLimit,
      researchCfg: {
        presetId: researchPresetId,
        maxExperiments: researchMaxExperiments,
        robustness: researchRobustness,
        regimeOverrides: researchRegimeOverrides,
        allowRegimeBrittle: researchAllowRegimeBrittle,
        requiredRegimePassRate: researchRequiredRegimePassRate,
        minRegimesSeen: researchMinRegimesSeen,
        criticalRegimes: researchCriticalRegimes,
        criticalRegimesExtra: researchCriticalRegimesExtra,
        advancedOpen: researchAdvancedOpen
      },
      batchCfg: {
        symbolsInput: batchSymbolsInput,
        timeframesInput: batchTimeframesInput,
        strategy: batchStrategy,
        rangeDays: batchRangeDays,
        maxCombos: batchMaxCombos,
        autoApplyCount: batchAutoApplyCount
      }
    });
  }, [
    symbolInput,
    resolvedSymbol,
    resolution,
    rangeDays,
    maxBars,
    rangeCfg,
    breakCfg,
    fvgCfg,
    meanCfg,
    execCfg,
    confluenceCfg,
    validationCfg,
    walkForwardCfg,
    optimizerCfg,
    replayEnabled,
    playSpeed,
    tieBreaker,
    trendCfg,
    autoSummaryEnabled,
    autoSummaryIntervalMin,
    agentMemorySymbol,
    agentMemoryTimeframe,
    agentMemoryKind,
    agentMemoryAgentId,
    agentMemoryScope,
    agentMemoryCategory,
    agentMemorySubcategory,
    agentMemoryLimit,
    researchPresetId,
    researchMaxExperiments,
    researchRobustness,
    researchRegimeOverrides,
    researchAllowRegimeBrittle,
    researchRequiredRegimePassRate,
    researchMinRegimesSeen,
    researchCriticalRegimes,
    researchCriticalRegimesExtra,
    researchAdvancedOpen,
    batchSymbolsInput,
    batchTimeframesInput,
    batchStrategy,
    batchRangeDays,
    batchMaxCombos,
    batchAutoApplyCount
  ]);

  useEffect(() => {
    writeOptimizerPresets(optimizerPresets);
  }, [optimizerPresets]);

  useEffect(() => {
    writeBatchPresets(batchPresets);
  }, [batchPresets]);

  useEffect(() => {
    writeMemoryPresets(memoryPresets);
  }, [memoryPresets]);

  const selectedOptimizerPreset = useMemo(
    () => optimizerPresets.find((preset) => preset.id === optimizerPresetId) || null,
    [optimizerPresetId, optimizerPresets]
  );
  const optimizerLoopCandidate =
    optimizerLoopResults?.recommended || optimizerLoopResults?.topCandidates?.[0] || null;

  const selectedBatchPreset = useMemo(
    () => batchPresets.find((preset) => preset.id === batchPresetId) || null,
    [batchPresetId, batchPresets]
  );

  const selectedMemoryPreset = useMemo(
    () => memoryPresets.find((preset) => preset.id === memoryPresetId) || null,
    [memoryPresetId, memoryPresets]
  );

  useEffect(() => {
    if (!selectedBatchPreset) return;
    setBatchPresetName(selectedBatchPreset.name || '');
  }, [selectedBatchPreset]);

  useEffect(() => {
    if (!selectedMemoryPreset) return;
    setMemoryPresetName(selectedMemoryPreset.name || '');
  }, [selectedMemoryPreset]);

  useEffect(() => {
    return () => {
      if (batchAutoApplyTimerRef.current) {
        window.clearTimeout(batchAutoApplyTimerRef.current);
        batchAutoApplyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedOptimizerPreset) return;
    setOptimizerPresetName(selectedOptimizerPreset.name || '');
  }, [selectedOptimizerPreset]);

  const buildDefaultPresetName = useCallback(() => {
    const symbol = String(resolvedSymbol || symbolInput || '').trim();
    const tf = String(resolution || '').trim();
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const parts = [symbol || 'Preset', tf, ts].filter(Boolean);
    return parts.join(' ');
  }, [resolution, resolvedSymbol, symbolInput]);

  const parseBatchList = useCallback((raw: string) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return [];
    const parts = cleaned.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(part);
    }
    return out;
  }, []);

  const buildDefaultBatchPresetName = useCallback(() => {
    const symbols = parseBatchList(batchSymbolsInput);
    const tfs = parseBatchList(batchTimeframesInput);
    const symbolLabel = symbols.length > 0 ? symbols.join('/') : 'Batch';
    const tfLabel = tfs.length > 0 ? tfs.join('/') : '';
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const parts = [symbolLabel, tfLabel, batchStrategy, ts].filter(Boolean);
    return parts.join(' ');
  }, [batchStrategy, batchSymbolsInput, batchTimeframesInput, parseBatchList]);

  const buildDefaultMemoryPresetName = useCallback(() => {
    const symbol = String(agentMemorySymbol || resolvedSymbol || symbolInput || '').trim();
    const tf = String(agentMemoryTimeframe || resolution || '').trim();
    const kind = String(agentMemoryKind || '').trim();
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const parts = [symbol || 'Memory', tf, kind, ts].filter(Boolean);
    return parts.join(' ');
  }, [agentMemoryKind, agentMemorySymbol, agentMemoryTimeframe, resolution, resolvedSymbol, symbolInput]);

  useEffect(() => {
    if (agentMemorySymbol) return;
    const fallback = String(resolvedSymbol || symbolInput || '').trim();
    if (fallback) setAgentMemorySymbol(fallback);
  }, [agentMemorySymbol, resolvedSymbol, symbolInput]);

  useEffect(() => {
    if (batchSymbolsInput) return;
    const fallback = String(resolvedSymbol || symbolInput || '').trim();
    if (fallback) setBatchSymbolsInput(fallback);
  }, [batchSymbolsInput, resolvedSymbol, symbolInput]);

  useEffect(() => {
    if (agentMemoryTimeframe) return;
    const fallback = String(resolution || '').trim();
    if (fallback) setAgentMemoryTimeframe(fallback);
  }, [agentMemoryTimeframe, resolution]);

  useEffect(() => {
    if (batchTimeframesInput) return;
    const fallback = String(resolution || '').trim();
    if (fallback) setBatchTimeframesInput(fallback);
  }, [batchTimeframesInput, resolution]);

  const handleUseActive = useCallback(() => {
    const next = String(activeSymbol || '').trim();
    if (!next) return;
    setSymbolInput(next);
    void resolveAndSetSymbol(next);
  }, [activeSymbol, resolveAndSetSymbol]);

  const handleSetSymbol = useCallback(() => {
    const next = String(symbolInput || '').trim();
    if (!next) return;
    void resolveAndSetSymbol(next);
  }, [resolveAndSetSymbol, symbolInput]);

  const loadAgentMemory = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listAgentMemory) {
      setAgentMemoryError('Agent memory unavailable.');
      return;
    }

    setAgentMemoryLoading(true);
    setAgentMemoryError(null);
    try {
      const agentId = String(agentMemoryAgentId || '').trim();
      const scope = String(agentMemoryScope || '').trim();
      const category = String(agentMemoryCategory || '').trim();
      const subcategory = String(agentMemorySubcategory || '').trim();
      const symbol = String(agentMemorySymbol || '').trim();
      const timeframe = String(agentMemoryTimeframe || '').trim();
      const kind = String(agentMemoryKind || '').trim();
      const limitRaw = Number(agentMemoryLimit);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 12;

      const res = await ledger.listAgentMemory({
        limit,
        agentId: agentId || undefined,
        scope: scope || undefined,
        category: category || undefined,
        subcategory: subcategory || undefined,
        symbol: symbol || undefined,
        timeframe: timeframe || undefined,
        kind: kind || undefined
      });

      if (!res?.ok) {
        setAgentMemoryError(res?.error ? String(res.error) : 'Failed to load agent memory.');
        setAgentMemoryEntries([]);
        return;
      }

      const entries = Array.isArray(res.memories) ? res.memories : [];
      setAgentMemoryEntries(entries);
      setAgentMemoryUpdatedAtMs(Date.now());
    } catch (err: any) {
      setAgentMemoryError(err?.message ? String(err.message) : 'Failed to load agent memory.');
      setAgentMemoryEntries([]);
    } finally {
      setAgentMemoryLoading(false);
    }
  }, [
    agentMemoryAgentId,
    agentMemoryCategory,
    agentMemoryKind,
    agentMemoryLimit,
    agentMemoryScope,
    agentMemorySubcategory,
    agentMemorySymbol,
    agentMemoryTimeframe
  ]);

  const loadExperimentNotes = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listExperimentNotes) {
      setExperimentsError('Experiment notes unavailable.');
      return;
    }
    setExperimentsLoading(true);
    setExperimentsError(null);
    try {
      const res = await ledger.listExperimentNotes({ limit: 10 });
      if (!res?.ok) {
        setExperimentsError(res?.error ? String(res.error) : 'Failed to load experiment notes.');
        setExperimentNotes([]);
        return;
      }
      const notes = Array.isArray(res?.notes) ? res.notes : [];
      setExperimentNotes(notes);
      setExperimentsUpdatedAtMs(Date.now());
    } catch (err: any) {
      setExperimentsError(err?.message ? String(err.message) : 'Failed to load experiment notes.');
      setExperimentNotes([]);
    } finally {
      setExperimentsLoading(false);
    }
  }, []);


  const filteredAgentMemory = useMemo(() => {
    const query = agentMemoryQuery.trim().toLowerCase();
    if (!query) return agentMemoryEntries;
    return agentMemoryEntries.filter((entry) => {
      if (!entry) return false;
      const blob = [
        entry.key,
        entry.agentId,
        entry.kind,
        entry.scope,
        entry.category,
        entry.subcategory,
        entry.symbol,
        entry.timeframe,
        entry.summary
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(query);
    });
  }, [agentMemoryEntries, agentMemoryQuery]);

  const handleUseCurrentMemoryFilters = useCallback(() => {
    const symbol = String(resolvedSymbol || symbolInput || '').trim();
    const timeframe = String(resolution || '').trim();
    if (symbol) setAgentMemorySymbol(symbol);
    if (timeframe) setAgentMemoryTimeframe(timeframe);
  }, [resolution, resolvedSymbol, symbolInput]);

  const sortMemoryPresets = useCallback((presets: AgentMemoryFilterPreset[]) => {
    return [...presets].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  }, []);

  const applyMemoryPreset = useCallback((preset: AgentMemoryFilterPreset) => {
    const filters = preset?.filters || {
      agentId: '',
      scope: '',
      category: '',
      subcategory: '',
      symbol: '',
      timeframe: '',
      kind: '',
      limit: 12,
      query: ''
    };
    setAgentMemoryAgentId(String(filters.agentId || ''));
    setAgentMemoryScope(String(filters.scope || ''));
    setAgentMemoryCategory(String(filters.category || ''));
    setAgentMemorySubcategory(String(filters.subcategory || ''));
    setAgentMemorySymbol(String(filters.symbol || ''));
    setAgentMemoryTimeframe(String(filters.timeframe || ''));
    setAgentMemoryKind(String(filters.kind || ''));
    const limit = Number(filters.limit);
    if (Number.isFinite(limit)) {
      setAgentMemoryLimit(Math.max(1, Math.min(100, Math.floor(limit))));
    }
    setAgentMemoryQuery(String(filters.query || ''));
  }, []);

  const handleSaveMemoryPreset = useCallback((mode: 'new' | 'update') => {
    setMemoryPresetError(null);
    setMemoryPresetStatus(null);
    const name = memoryPresetName.trim() || buildDefaultMemoryPresetName();
    if (!name) {
      setMemoryPresetError('Preset name required.');
      return;
    }

    const nowMs = Date.now();
    const filters = {
      agentId: String(agentMemoryAgentId || '').trim(),
      scope: String(agentMemoryScope || '').trim(),
      category: String(agentMemoryCategory || '').trim(),
      subcategory: String(agentMemorySubcategory || '').trim(),
      symbol: String(agentMemorySymbol || '').trim(),
      timeframe: String(agentMemoryTimeframe || '').trim(),
      kind: String(agentMemoryKind || '').trim(),
      limit: Number.isFinite(Number(agentMemoryLimit))
        ? Math.max(1, Math.min(100, Math.floor(Number(agentMemoryLimit))))
        : 12,
      query: String(agentMemoryQuery || '').trim()
    };

    if (mode === 'update') {
      if (!memoryPresetId) {
        setMemoryPresetError('Select a preset to update.');
        return;
      }
      const existing = memoryPresets.find((preset) => preset.id === memoryPresetId);
      if (!existing) {
        setMemoryPresetError('Preset not found.');
        return;
      }
      const updated: AgentMemoryFilterPreset = {
        ...existing,
        name,
        updatedAtMs: nowMs,
        filters
      };
      setMemoryPresets((prev) => sortMemoryPresets([updated, ...prev.filter((p) => p.id !== updated.id)]));
      setMemoryPresetId(updated.id);
      setMemoryPresetName(updated.name);
      setMemoryPresetStatus('Preset updated.');
      return;
    }

    const id = `memory_${nowMs}_${Math.random().toString(16).slice(2, 8)}`;
    const created: AgentMemoryFilterPreset = {
      id,
      name,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      filters
    };
    setMemoryPresets((prev) => sortMemoryPresets([created, ...prev]));
    setMemoryPresetId(id);
    setMemoryPresetName(name);
    setMemoryPresetStatus('Preset saved.');
  }, [
    agentMemoryKind,
    agentMemoryLimit,
    agentMemoryQuery,
    agentMemoryAgentId,
    agentMemoryScope,
    agentMemoryCategory,
    agentMemorySubcategory,
    agentMemorySymbol,
    agentMemoryTimeframe,
    buildDefaultMemoryPresetName,
    memoryPresetId,
    memoryPresetName,
    memoryPresets,
    sortMemoryPresets
  ]);

  const handleLoadMemoryPreset = useCallback(() => {
    setMemoryPresetError(null);
    setMemoryPresetStatus(null);
    if (!memoryPresetId) {
      setMemoryPresetError('Select a preset to load.');
      return;
    }
    const preset = memoryPresets.find((item) => item.id === memoryPresetId);
    if (!preset) {
      setMemoryPresetError('Preset not found.');
      return;
    }
    applyMemoryPreset(preset);
    setMemoryPresetStatus('Preset loaded.');
  }, [applyMemoryPreset, memoryPresetId, memoryPresets]);

  const handleDeleteMemoryPreset = useCallback(() => {
    setMemoryPresetError(null);
    setMemoryPresetStatus(null);
    if (!memoryPresetId) {
      setMemoryPresetError('Select a preset to delete.');
      return;
    }
    const preset = memoryPresets.find((item) => item.id === memoryPresetId);
    if (!preset) {
      setMemoryPresetError('Preset not found.');
      return;
    }
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Delete preset "${preset.name}"?`)
      : true;
    if (!confirmed) return;
    setMemoryPresets((prev) => prev.filter((item) => item.id !== memoryPresetId));
    setMemoryPresetId('');
    setMemoryPresetName('');
    setMemoryPresetStatus('Preset deleted.');
  }, [memoryPresetId, memoryPresets]);

  useEffect(() => {
    void loadAgentMemory();
  }, [loadAgentMemory]);

  useEffect(() => {
    void loadExperimentNotes();
  }, [loadExperimentNotes]);


  const loadHistory = useCallback(async (opts?: { force?: boolean; symbol?: string; resolution?: string; rangeDays?: number }) => {
    const brokerAvailable =
      !!(window as any)?.glass?.broker?.request || !!(window as any)?.glass?.tradelocker?.getHistorySeries;
    if (!brokerAvailable) {
      setBarsError('Broker history unavailable.');
      return;
    }
    const symbol = String(opts?.symbol ?? resolvedSymbol ?? '').trim();
    if (!symbol) {
      setBarsError('Set a symbol to load history.');
      return;
    }
    if (!isConnected && !(window as any)?.glass?.broker?.request) {
      setBarsError('Connect TradeLocker to load history.');
      return;
    }
    if (barsLoading && !opts?.force) return;
    const now = Date.now();
    if (!opts?.force && barsRetryAtMs && now < barsRetryAtMs) {
      setBarsError(`TradeLocker rate limited. Retry in ${formatRetryIn(barsRetryAtMs)}.`);
      return;
    }
    setBarsLoading(true);
    setBarsError(null);
    try {
      const days = clampRangeDays(Number(opts?.rangeDays ?? rangeDays) || DEFAULT_RANGE_DAYS);
      const res = await loadBacktestHistory({
        symbol,
        timeframe: String(opts?.resolution ?? resolution),
        rangeDays: days,
        force: !!opts?.force
      });
      if (res?.rateLimited) {
        const retryAtMs = Number(res?.retryAtMs) || (Date.now() + 15_000);
        setBarsRetryAtMs(retryAtMs);
      }
      if (!res?.ok) {
        setBarsError(res?.error ? String(res.error) : 'Failed to load broker history.');
        setBarsLoading(false);
        return;
      }
      const normalized = normalizeBars(res?.bars || []);
      const limit = maxBars > 0 ? maxBars : Number.MAX_SAFE_INTEGER;
      const trimmed = normalized.length > limit;
      const nextBars = trimmed ? normalized.slice(normalized.length - limit) : normalized;
      setBars(nextBars);
      setBarsTrimmed(trimmed);
      setBarsUpdatedAtMs(res?.fetchedAtMs ? Number(res.fetchedAtMs) : Date.now());
      setBarsSource(res?.source ? String(res.source) : 'broker');
      setBarsCached(Boolean(res?.cached));
      setBarsHistoryFromMs(res?.fromMs ?? null);
      setBarsHistoryToMs(res?.toMs ?? null);
      setBarsHistoryChunks(Number.isFinite(Number(res?.chunks)) ? Number(res?.chunks) : null);
      setBarsError(null);
      if (!res?.rateLimited) {
        setBarsRetryAtMs(null);
      }
    } catch (err: any) {
      setBarsError(err?.message ? String(err.message) : 'Failed to load broker history.');
    } finally {
      setBarsLoading(false);
    }
    }, [barsLoading, barsRetryAtMs, isConnected, maxBars, rangeDays, resolution, resolvedSymbol]);

  const loadHtfHistory = useCallback(async (opts?: { force?: boolean; symbol?: string; rangeDays?: number; htfResolution?: string }) => {
    const brokerAvailable =
      !!(window as any)?.glass?.broker?.request || !!(window as any)?.glass?.tradelocker?.getHistorySeries;
    if (!brokerAvailable) {
      setHtfError('Broker history unavailable.');
      return;
    }
    const symbol = String(opts?.symbol ?? resolvedSymbol ?? '').trim();
    if (!symbol) {
      setHtfError('Set a symbol to load history.');
      return;
    }
    if (!isConnected && !(window as any)?.glass?.broker?.request) {
      setHtfError('Connect TradeLocker to load history.');
      return;
    }
    if (!confluenceCfg.enabled) {
      setHtfBars([]);
      setHtfError(null);
      setHtfUpdatedAtMs(null);
      return;
    }

    const htfResolution = String(opts?.htfResolution ?? confluenceCfg.htfResolution);
    const htfMs = resolutionToMs(htfResolution);
    if (!htfMs) {
      setHtfError('Unsupported HTF resolution.');
      return;
    }

    if (htfLoading && !opts?.force) return;
    const now = Date.now();
    if (!opts?.force && htfRetryAtMs && now < htfRetryAtMs) {
      setHtfError(`TradeLocker rate limited. Retry in ${formatRetryIn(htfRetryAtMs)}.`);
      return;
    }
    setHtfLoading(true);
    setHtfError(null);
    try {
      const days = clampRangeDays(Number(opts?.rangeDays ?? rangeDays) || DEFAULT_RANGE_DAYS);
      const res = await loadBacktestHistory({
        symbol,
        timeframe: htfResolution,
        rangeDays: days,
        force: !!opts?.force
      });
      if (res?.rateLimited) {
        const retryAtMs = Number(res?.retryAtMs) || (Date.now() + 15_000);
        setHtfRetryAtMs(retryAtMs);
      }
      if (!res?.ok) {
        setHtfError(res?.error ? String(res.error) : 'Failed to load HTF history.');
        setHtfLoading(false);
        return;
      }
      const normalized = normalizeBars(res?.bars || []);
      const trimmed = normalized.length > MAX_BARS;
      const nextBars = trimmed ? normalized.slice(normalized.length - MAX_BARS) : normalized;
      setHtfBars(nextBars);
      setHtfUpdatedAtMs(res?.fetchedAtMs ? Number(res.fetchedAtMs) : Date.now());
      setHtfCached(Boolean(res?.cached));
      setHtfError(null);
      if (!res?.rateLimited) {
        setHtfRetryAtMs(null);
      }
    } catch (err: any) {
      setHtfError(err?.message ? String(err.message) : 'Failed to load HTF history.');
    } finally {
      setHtfLoading(false);
    }
  }, [confluenceCfg.enabled, confluenceCfg.htfResolution, htfLoading, htfRetryAtMs, isConnected, rangeDays, resolvedSymbol]);

  useEffect(() => {
    if (!debouncedSymbol) return;
    void loadHistory({ symbol: debouncedSymbol, resolution: debouncedResolution, rangeDays: debouncedRangeDays });
  }, [debouncedRangeDays, debouncedResolution, debouncedSymbol, loadHistory]);

  useEffect(() => {
    if (!debouncedSymbol) return;
    if (!debouncedConfluenceEnabled) {
      setHtfBars([]);
      setHtfError(null);
      setHtfUpdatedAtMs(null);
      setHtfCached(false);
      return;
    }
    void loadHtfHistory({
      symbol: debouncedSymbol,
      rangeDays: debouncedRangeDays,
      htfResolution: debouncedHtfResolution
    });
  }, [debouncedConfluenceEnabled, debouncedHtfResolution, debouncedRangeDays, debouncedSymbol, loadHtfHistory]);

  useEffect(() => {
    if (bars.length === 0) {
      setReplayIndex(0);
      return;
    }
    setReplayIndex((prev) => {
      const max = bars.length - 1;
      if (!replayEnabled) return max;
      return Math.min(prev || max, max);
    });
  }, [bars, replayEnabled]);

  useEffect(() => {
    if (!replayEnabled || !isPlaying) return;
    if (bars.length === 0) return;

    const intervalMs = Math.max(60, Math.floor(1000 / Math.max(1, playSpeed)));
    const timer = window.setInterval(() => {
      setReplayIndex((prev) => {
        const max = bars.length - 1;
        if (prev >= max) {
          setIsPlaying(false);
          return max;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [bars.length, isPlaying, playSpeed, replayEnabled]);

  useEffect(() => {
    const node = canvasWrapRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      setCanvasSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    updateSize();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateSize());
      observer.observe(node);
    }
    window.addEventListener('resize', updateSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const htfBiasByIndex = useMemo(() => {
    if (!debouncedConfluenceCfg.enabled || htfBars.length === 0 || bars.length === 0) return null;
    const htfMs = resolutionToMs(debouncedConfluenceCfg.htfResolution);
    if (!htfMs) return null;
    const biasSeries = computeBiasSeries(htfBars, debouncedConfluenceCfg);
    return mapHtfBiasToLtf(bars, htfBars, htfMs, biasSeries, debouncedConfluenceCfg.usePrevHtfBar);
  }, [bars, debouncedConfluenceCfg, htfBars]);

  const replayCutoffIndex = replayEnabled ? replayIndex : Math.max(0, bars.length - 1);
  const htfBiasKey = useMemo(() => {
    if (!htfBiasByIndex || htfBiasByIndex.length === 0) return 'none';
    const lastIdx = htfBiasByIndex.length - 1;
    return `${htfBiasByIndex.length}:${htfBiasByIndex[0] || 'neutral'}:${htfBiasByIndex[lastIdx] || 'neutral'}`;
  }, [htfBiasByIndex]);
  const barsSignature = useMemo(() => {
    if (bars.length === 0) return 'empty';
    const first = bars[0]?.t ?? 0;
    const last = bars[bars.length - 1]?.t ?? 0;
    return `${bars.length}:${first}:${last}:${barsUpdatedAtMs ?? 0}`;
  }, [bars, barsUpdatedAtMs]);
  const workerTradeKey = useMemo(() => {
    if (bars.length === 0) return '';
    return hashStringSampled(JSON.stringify({
      bars: barsSignature,
      tieBreaker: debouncedTieBreaker,
      execution: debouncedExecCfg,
      confluence: {
        enabled: debouncedConfluenceCfg.enabled,
        biasReference: debouncedConfluenceCfg.biasReference,
        allowNeutral: debouncedConfluenceCfg.allowNeutral,
        entryTiming: debouncedExecCfg.entryTiming,
        htfResolution: debouncedConfluenceCfg.htfResolution,
        htfMode: debouncedConfluenceCfg.biasMode,
        usePrevHtfBar: debouncedConfluenceCfg.usePrevHtfBar,
        htfUpdatedAtMs: htfUpdatedAtMs ?? null,
        htfBiasKey
      },
      setups: {
        range: debouncedRangeCfg,
        breakRetest: debouncedBreakCfg,
        fvg: debouncedFvgCfg,
        trend: debouncedTrendCfg,
        mean: debouncedMeanCfg
      }
    }));
  }, [
    bars.length,
    barsSignature,
    debouncedBreakCfg,
    debouncedConfluenceCfg,
    debouncedExecCfg,
    debouncedFvgCfg,
    debouncedMeanCfg,
    debouncedRangeCfg,
    debouncedTieBreaker,
    debouncedTrendCfg,
    htfBiasKey,
    htfUpdatedAtMs
  ]);
  const analysisEnabled = validationCfg.enabled || walkForwardCfg.enabled;
  const analysisReplayCutoff = useMemo(() => {
    const needsReplay =
      (validationCfg.enabled && validationCfg.useReplayWindow) ||
      (walkForwardCfg.enabled && walkForwardCfg.useReplayWindow);
    return needsReplay ? replayCutoffIndex : Math.max(0, bars.length - 1);
  }, [bars.length, replayCutoffIndex, validationCfg, walkForwardCfg]);
  const validationReplayCutoff = validationCfg.useReplayWindow
    ? replayCutoffIndex
    : Math.max(0, bars.length - 1);
  const walkForwardReplayCutoff = walkForwardCfg.useReplayWindow
    ? replayCutoffIndex
    : Math.max(0, bars.length - 1);
  const workerAnalysisKey = useMemo(() => {
    if (!analysisEnabled || !workerTradeKey) return '';
    return hashStringSampled(JSON.stringify({
      tradeKey: workerTradeKey,
      replayCutoffIndex: analysisReplayCutoff,
      validation: validationCfg,
      walkForward: walkForwardCfg
    }));
  }, [analysisEnabled, analysisReplayCutoff, validationCfg, walkForwardCfg, workerTradeKey]);
  const validationCacheKey = useMemo(() => {
    if (!validationCfg.enabled || !workerTradeKey) return '';
    return hashStringSampled(JSON.stringify({
      tradeKey: workerTradeKey,
      replayCutoffIndex: validationReplayCutoff,
      validation: validationCfg
    }));
  }, [validationCfg, validationReplayCutoff, workerTradeKey]);
  const walkForwardCacheKey = useMemo(() => {
    if (!walkForwardCfg.enabled || !workerTradeKey) return '';
    return hashStringSampled(JSON.stringify({
      tradeKey: workerTradeKey,
      replayCutoffIndex: walkForwardReplayCutoff,
      walkForward: walkForwardCfg
    }));
  }, [walkForwardCfg, walkForwardReplayCutoff, workerTradeKey]);

  const useWorkerCompute = bars.length >= WORKER_TRADE_THRESHOLD;
  const localTrades = useMemo(() => {
    if (useWorkerCompute) return [] as BacktestTrade[];
    if (bars.length === 0) return [] as BacktestTrade[];
    if (workerTradeKey) {
      const cached = getCacheEntry(localTradesCacheRef.current, workerTradeKey, WORKER_CACHE_TTL_MS);
      if (cached) return cached;
    }
    const candidates: BacktestTrade[] = [];
    if (debouncedRangeCfg.enabled) candidates.push(...generateRangeBreakoutTrades(bars, debouncedRangeCfg));
    if (debouncedBreakCfg.enabled) candidates.push(...generateBreakRetestTrades(bars, debouncedBreakCfg));
    if (debouncedFvgCfg.enabled) candidates.push(...generateFvgRetraceTrades(bars, debouncedFvgCfg));
    if (debouncedTrendCfg.enabled) candidates.push(...generateTrendPullbackTrades(bars, debouncedTrendCfg));
    if (debouncedMeanCfg.enabled) candidates.push(...generateMeanReversionTrades(bars, debouncedMeanCfg));
    candidates.sort((a, b) => a.entryIndex - b.entryIndex);
    if (!debouncedConfluenceCfg.enabled || !htfBiasByIndex) {
      const result = simulateTrades(bars, candidates, { tieBreaker: debouncedTieBreaker, execution: debouncedExecCfg });
      if (workerTradeKey) {
        setCacheEntry(localTradesCacheRef.current, workerTradeKey, result, WORKER_CACHE_MAX);
      }
      return result;
    }

    const filtered = candidates
      .map((trade) => {
        const refIndex =
          debouncedConfluenceCfg.biasReference === 'signal'
            ? trade.signalIndex
            : debouncedExecCfg.entryTiming === 'signal_close'
              ? trade.signalIndex
              : trade.entryIndex;
        const bias: BiasLabel = htfBiasByIndex[refIndex] || 'neutral';
        const matches =
          bias === 'neutral'
            ? debouncedConfluenceCfg.allowNeutral
            : (bias === 'bull' && trade.side === 'BUY') || (bias === 'bear' && trade.side === 'SELL');
        if (!matches) return null;
        return {
          ...trade,
          meta: {
            ...(trade.meta || {}),
            htfBias: bias,
            htfResolution: debouncedConfluenceCfg.htfResolution,
            htfMode: debouncedConfluenceCfg.biasMode,
            htfReference: debouncedConfluenceCfg.biasReference
          }
        };
      })
      .filter(Boolean) as BacktestTrade[];

    const result = simulateTrades(bars, filtered, { tieBreaker: debouncedTieBreaker, execution: debouncedExecCfg });
    if (workerTradeKey) {
      setCacheEntry(localTradesCacheRef.current, workerTradeKey, result, WORKER_CACHE_MAX);
    }
    return result;
  }, [bars, debouncedBreakCfg, debouncedConfluenceCfg, debouncedExecCfg, debouncedFvgCfg, debouncedMeanCfg, debouncedRangeCfg, debouncedTieBreaker, debouncedTrendCfg, htfBiasByIndex, useWorkerCompute, workerTradeKey]);

  useEffect(() => {
    if (!useWorkerCompute) {
      setWorkerComputeRunning(false);
      setWorkerComputeError(null);
      setWorkerAnalysisRunning(false);
      setWorkerAnalysisError(null);
      setWorkerValidationData(null);
      setWorkerWalkForwardData(null);
      workerTradeKeyRef.current = '';
      workerAnalysisKeyRef.current = '';
      return;
    }
    if (bars.length === 0) return;
    if (workerTradeKey && workerTradeKey === workerTradeKeyRef.current && workerTrades?.length) return;
    const tradeKeyChanged = workerTradeKey && workerTradeKey !== workerTradeKeyRef.current;
    const cachedTrades = workerTradeKey
      ? getCacheEntry(workerTradesCacheRef.current, workerTradeKey, WORKER_CACHE_TTL_MS)
      : null;
    if (tradeKeyChanged) {
      setWorkerValidationData(null);
      setWorkerWalkForwardData(null);
      workerAnalysisKeyRef.current = '';
    }
    if (cachedTrades) {
      setWorkerTrades(cachedTrades);
      workerTradeKeyRef.current = workerTradeKey || '';
      setWorkerComputeRunning(false);
      setWorkerComputeError(null);
      setWorkerAnalysisError(null);
      return;
    }
    const requestId = ++workerComputeRequestRef.current;
    setWorkerComputeRunning(true);
    setWorkerComputeError(null);
    setWorkerAnalysisError(null);
    runBacktestSimulationWorker({
      bars,
      tieBreaker: debouncedTieBreaker,
      execution: debouncedExecCfg,
      confluence: {
        enabled: debouncedConfluenceCfg.enabled,
        apply: debouncedConfluenceCfg.enabled,
        biasReference: debouncedConfluenceCfg.biasReference,
        allowNeutral: debouncedConfluenceCfg.allowNeutral,
        entryTiming: debouncedExecCfg.entryTiming,
        htfBiasByIndex: htfBiasByIndex || undefined
      },
      setups: {
        range: debouncedRangeCfg,
        breakRetest: debouncedBreakCfg,
        fvg: debouncedFvgCfg,
        trend: debouncedTrendCfg,
        mean: debouncedMeanCfg
      }
    })
      .then((result) => {
        if (requestId !== workerComputeRequestRef.current) return;
        if (!result?.ok) {
          setWorkerComputeError(result?.error ? String(result.error) : 'Worker compute failed.');
          setWorkerComputeRunning(false);
          return;
        }
        const nextTrades = Array.isArray(result.trades) ? result.trades : [];
        setWorkerTrades(nextTrades);
        if (workerTradeKey) {
          setCacheEntry(workerTradesCacheRef.current, workerTradeKey, nextTrades, WORKER_CACHE_MAX);
        }
        workerTradeKeyRef.current = workerTradeKey || '';
        setWorkerComputeRunning(false);
      })
      .catch((err: any) => {
        if (requestId !== workerComputeRequestRef.current) return;
        setWorkerComputeError(err?.message ? String(err.message) : 'Worker compute failed.');
        setWorkerComputeRunning(false);
      });
  }, [
    bars,
    debouncedBreakCfg,
    debouncedConfluenceCfg,
    debouncedExecCfg,
    debouncedFvgCfg,
    debouncedMeanCfg,
    debouncedRangeCfg,
    debouncedTieBreaker,
    debouncedTrendCfg,
    htfBiasByIndex,
    workerTradeKey,
    workerTrades,
    useWorkerCompute
  ]);

  useEffect(() => {
    if (!useWorkerCompute) return;
    if (!analysisEnabled) {
      workerAnalysisRequestRef.current += 1;
      setWorkerAnalysisRunning(false);
      setWorkerAnalysisError(null);
      setWorkerValidationData(null);
      setWorkerWalkForwardData(null);
      workerAnalysisKeyRef.current = '';
      return;
    }
    if (bars.length === 0 || !workerTrades) return;
    if (workerTradeKeyRef.current !== workerTradeKey) return;
    if (workerAnalysisKey && workerAnalysisKey === workerAnalysisKeyRef.current) return;
    const cachedAnalysis = workerAnalysisKey
      ? getCacheEntry(workerAnalysisCacheRef.current, workerAnalysisKey, WORKER_CACHE_TTL_MS)
      : null;
    if (cachedAnalysis) {
      setWorkerValidationData(cachedAnalysis.validation ?? null);
      setWorkerWalkForwardData(cachedAnalysis.walkForward ?? null);
      workerAnalysisKeyRef.current = workerAnalysisKey || '';
      setWorkerAnalysisRunning(false);
      setWorkerAnalysisError(null);
      return;
    }

    const requestId = ++workerAnalysisRequestRef.current;
    setWorkerAnalysisRunning(true);
    setWorkerAnalysisError(null);
    runBacktestAnalysisWorker({
      bars,
      trades: workerTrades,
      analysis: {
        replayCutoffIndex: analysisReplayCutoff,
        validation: { ...validationCfg },
        walkForward: { ...walkForwardCfg }
      }
    })
      .then((result) => {
        if (requestId !== workerAnalysisRequestRef.current) return;
        if (!result?.ok) {
          setWorkerAnalysisError(result?.error ? String(result.error) : 'Worker analysis failed.');
          setWorkerAnalysisRunning(false);
          return;
        }
        setWorkerValidationData(result.analysis?.validation ?? null);
        setWorkerWalkForwardData(result.analysis?.walkForward ?? null);
        if (workerAnalysisKey) {
          setCacheEntry(
            workerAnalysisCacheRef.current,
            workerAnalysisKey,
            {
              validation: result.analysis?.validation ?? null,
              walkForward: result.analysis?.walkForward ?? null
            },
            WORKER_CACHE_MAX
          );
        }
        workerAnalysisKeyRef.current = workerAnalysisKey || '';
        setWorkerAnalysisRunning(false);
      })
      .catch((err: any) => {
        if (requestId !== workerAnalysisRequestRef.current) return;
        setWorkerAnalysisError(err?.message ? String(err.message) : 'Worker analysis failed.');
        setWorkerAnalysisRunning(false);
      });
  }, [
    analysisEnabled,
    analysisReplayCutoff,
    bars,
    useWorkerCompute,
    workerAnalysisKey,
    workerTradeKey,
    workerTrades,
    validationCfg,
    walkForwardCfg
  ]);

  const trades = useWorkerCompute ? (workerTrades ?? []) : localTrades;

  const visibleBars = useMemo(() => {
    if (bars.length === 0) return [] as Candle[];
    const cutoff = Math.min(replayCutoffIndex, bars.length - 1);
    const slice = bars.slice(0, cutoff + 1);
    return slice.slice(-DEFAULT_DISPLAY_BARS);
  }, [bars, replayCutoffIndex]);
  const visibleStartIndex = useMemo(
    () => Math.max(0, replayCutoffIndex - visibleBars.length + 1),
    [replayCutoffIndex, visibleBars.length]
  );

  const replayTrades = useMemo(() => {
    const cutoff = replayCutoffIndex;
    return trades
      .filter((trade) => trade.entryIndex <= cutoff)
      .map((trade) => {
        if (trade.exitIndex != null && trade.exitIndex <= cutoff) return trade;
        return { ...trade, outcome: 'open', exitIndex: undefined, exitReason: 'open', rMultiple: undefined };
      });
  }, [replayCutoffIndex, trades]);

  const selectedTrade = useMemo(() => {
    if (!selectedTradeId) return null;
    return replayTrades.find((trade) => trade.id === selectedTradeId) || null;
  }, [replayTrades, selectedTradeId]);

  const currentHtfBias = useMemo(() => {
    if (!htfBiasByIndex || bars.length === 0) return null;
    const idx = Math.min(replayCutoffIndex, htfBiasByIndex.length - 1);
    if (idx < 0) return null;
    return htfBiasByIndex[idx] || null;
  }, [bars.length, htfBiasByIndex, replayCutoffIndex]);

  const selectTrade = useCallback((trade: BacktestTrade | null) => {
    if (!trade) {
      runActionOr('backtester.trade.select', { clear: true }, () => setSelectedTradeId(null));
      return;
    }
    runActionOr('backtester.trade.select', { tradeId: trade.id }, () => setSelectedTradeId(trade.id));
    const target = trade.exitIndex ?? trade.entryIndex;
    const maxIndex = Math.max(0, bars.length - 1);
    const next = Math.min(maxIndex, Math.max(0, Number(target) || 0));
    runActionOr(
      'backtester.replay.set',
      { enabled: true, replayIndex: next },
      () => {
        if (!replayEnabled) setReplayEnabled(true);
        setReplayIndex(next);
      }
    );
  }, [bars.length, replayEnabled, runActionOr]);

  const jumpToIndex = useCallback((index?: number) => {
    if (index == null || !Number.isFinite(Number(index))) return;
    const maxIndex = Math.max(0, bars.length - 1);
    const next = Math.min(maxIndex, Math.max(0, Math.floor(Number(index))));
    setReplayEnabled(true);
    setReplayIndex(next);
  }, [bars.length]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || visibleBars.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < 0 || x > rect.width) return;
    const barWidth = rect.width / Math.max(1, visibleBars.length);
    const relIndex = Math.max(0, Math.min(visibleBars.length - 1, Math.floor(x / barWidth)));
    const absoluteIndex = visibleStartIndex + relIndex;

    let best: BacktestTrade | null = null;
    let bestDist = Infinity;
    for (const trade of replayTrades) {
      if (trade.entryIndex < visibleStartIndex || trade.entryIndex > replayCutoffIndex) continue;
      const dist = Math.abs(trade.entryIndex - absoluteIndex);
      if (dist < bestDist) {
        best = trade;
        bestDist = dist;
      }
    }

    const maxDistance = 3;
    if (best && bestDist <= maxDistance) {
      selectTrade(best);
    }
  }, [replayCutoffIndex, replayTrades, selectTrade, visibleBars.length, visibleStartIndex]);

  useEffect(() => {
    if (!selectedTradeId) return;
    const exists = replayTrades.some((trade) => trade.id === selectedTradeId);
    if (!exists) setSelectedTradeId(null);
  }, [replayTrades, selectedTradeId]);

  const replayAggregationWorkerEnabled = replayTrades.length >= REPLAY_AGG_WORKER_THRESHOLD;
  const localReplayAggregation = useMemo(() => {
    if (replayAggregationWorkerEnabled) return null;
    return aggregateReplayLocal(replayTrades, resolution);
  }, [replayAggregationWorkerEnabled, replayTrades, resolution]);
  const [workerReplayAggregation, setWorkerReplayAggregation] = useState<ReplayAggregationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!replayAggregationWorkerEnabled) {
      setWorkerReplayAggregation(null);
      return () => {
        cancelled = true;
      };
    }
    aggregateReplayWorker({
      trades: replayTrades,
      resolution,
      timeoutMs: 3500
    }).then((result) => {
      if (cancelled) return;
      setWorkerReplayAggregation(result);
    }).catch(() => {
      if (cancelled) return;
      setWorkerReplayAggregation(aggregateReplayLocal(replayTrades, resolution));
    });
    return () => {
      cancelled = true;
    };
  }, [replayAggregationWorkerEnabled, replayTrades, resolution]);

  const replayAggregation = workerReplayAggregation
    || localReplayAggregation
    || aggregateReplayLocal(replayTrades, resolution);
  const stats = replayAggregation.stats;
  const performance = replayAggregation.performance;

  const avgHoldLabel = useMemo(() => {
    if (performance.avgHoldMs != null) return formatDurationMs(performance.avgHoldMs);
    if (performance.avgHoldBars != null) return `${performance.avgHoldBars.toFixed(1)} bars`;
    return '--';
  }, [performance.avgHoldBars, performance.avgHoldMs]);

  const maxDrawdownLabel = useMemo(() => {
    if (performance.maxDrawdownPct != null) {
      return `${formatR(performance.maxDrawdown)} (${formatPercent(performance.maxDrawdownPct)})`;
    }
    return formatR(performance.maxDrawdown);
  }, [performance.maxDrawdown, performance.maxDrawdownPct]);

  const validationTrades = validationCfg.useReplayWindow ? replayTrades : trades;
  const walkForwardTrades = walkForwardCfg.useReplayWindow ? replayTrades : trades;

  const validationDataLocal = useMemo(() => {
    if (useWorkerCompute) return null;
    if (!validationCfg.enabled || bars.length === 0) {
      return null;
    }
    const cacheKey = validationCacheKey;
    if (cacheKey) {
      const cached = getCacheEntry(localAnalysisCacheRef.current, cacheKey, WORKER_CACHE_TTL_MS);
      if (cached) return cached;
    }
    const useReplay = validationCfg.useReplayWindow;
    const evalBars = useReplay ? bars.slice(0, Math.max(1, validationReplayCutoff + 1)) : bars;
    const evalTrades = validationTrades;
    if (evalBars.length < 10) return null;

    let splitIndex = Math.floor((evalBars.length - 1) * (validationCfg.splitPercent / 100));
    if (validationCfg.mode === 'last_days') {
      const lastBarTime = evalBars[evalBars.length - 1]?.t ?? 0;
      const lookbackMs = Math.max(1, Math.floor(Number(validationCfg.lastDays) || 1)) * 24 * 60 * 60 * 1000;
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

    const result = {
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
    if (cacheKey) {
      setCacheEntry(localAnalysisCacheRef.current, cacheKey, result, WORKER_CACHE_MAX);
    }
    return result;
  }, [
    bars,
    validationReplayCutoff,
    validationTrades,
    useWorkerCompute,
    validationCfg,
    validationCacheKey
  ]);

  const walkForwardDataLocal = useMemo(() => {
    if (useWorkerCompute) return null;
    if (!walkForwardCfg.enabled || bars.length === 0) {
      return null;
    }
    const cacheKey = walkForwardCacheKey;
    if (cacheKey) {
      const cached = getCacheEntry(localAnalysisCacheRef.current, cacheKey, WORKER_CACHE_TTL_MS);
      if (cached) return cached;
    }
    const useReplay = walkForwardCfg.useReplayWindow;
    const evalBars = useReplay ? bars.slice(0, Math.max(1, walkForwardReplayCutoff + 1)) : bars;
    const evalTrades = walkForwardTrades;
    if (evalBars.length < 10) return null;

    const trainMs = Math.max(1, walkForwardCfg.trainDays) * 24 * 60 * 60 * 1000;
    const testMs = Math.max(1, walkForwardCfg.testDays) * 24 * 60 * 60 * 1000;
    const stepMs = Math.max(1, walkForwardCfg.stepDays) * 24 * 60 * 60 * 1000;
    const times = evalBars.map((bar) => bar.t);
    const lastTime = times[times.length - 1];
    const minTrades = Math.max(0, Math.floor(walkForwardCfg.minTrades));

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

    if (folds.length === 0) {
      const emptyResult = { folds, summary: null };
      if (cacheKey) {
        setCacheEntry(localAnalysisCacheRef.current, cacheKey, emptyResult, WORKER_CACHE_MAX);
      }
      return emptyResult;
    }

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

    const result = {
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
    if (cacheKey) {
      setCacheEntry(localAnalysisCacheRef.current, cacheKey, result, WORKER_CACHE_MAX);
    }
    return result;
  }, [
    bars,
    walkForwardReplayCutoff,
    walkForwardTrades,
    useWorkerCompute,
    walkForwardCfg,
    walkForwardCacheKey
  ]);

  const validationData = useWorkerCompute ? workerValidationData : validationDataLocal;
  const walkForwardData = useWorkerCompute ? workerWalkForwardData : walkForwardDataLocal;

  const trainingPackSummary = useMemo(() => {
    const validationSummary = validationCfg.enabled && validationData
      ? {
        enabled: true,
        mode: validationCfg.mode,
        splitPercent: validationCfg.mode === 'percent' ? validationCfg.splitPercent : null,
        lastDays: validationCfg.mode === 'last_days' ? validationCfg.lastDays : null,
        splitTime: validationData.splitTime,
        trainBars: validationData.trainBars,
        testBars: validationData.testBars,
        train: {
          trades: validationData.trainStats.total,
          winRate: validationData.trainStats.winRate,
          expectancy: validationData.trainStats.expectancy,
          profitFactor: validationData.trainStats.profitFactor,
          netR: validationData.trainEquity.netR,
          maxDrawdown: validationData.trainEquity.maxDrawdown
        },
        test: {
          trades: validationData.testStats.total,
          winRate: validationData.testStats.winRate,
          expectancy: validationData.testStats.expectancy,
          profitFactor: validationData.testStats.profitFactor,
          netR: validationData.testEquity.netR,
          maxDrawdown: validationData.testEquity.maxDrawdown
        }
      }
      : { enabled: false };

    const walkForwardSummary = walkForwardCfg.enabled && walkForwardData?.summary
      ? {
        enabled: true,
        trainDays: walkForwardCfg.trainDays,
        testDays: walkForwardCfg.testDays,
        stepDays: walkForwardCfg.stepDays,
        minTrades: walkForwardCfg.minTrades,
        folds: walkForwardData.summary.folds,
        avgNetR: walkForwardData.summary.avgNetR,
        avgExpectancy: walkForwardData.summary.avgExpectancy,
        avgWinRate: walkForwardData.summary.avgWinRate,
        avgProfitFactor: walkForwardData.summary.avgProfitFactor,
        avgMaxDrawdown: walkForwardData.summary.avgMaxDrawdown,
        positiveNetPct: walkForwardData.summary.positiveNetPct,
        stabilityScore: walkForwardData.summary.stabilityScore,
        driftFlags: walkForwardData.summary.driftFlags,
        recentNetR: walkForwardData.summary.recentNetR,
        recentWinRate: walkForwardData.summary.recentWinRate,
        recentProfitFactor: walkForwardData.summary.recentProfitFactor
      }
      : { enabled: false };

    return {
      validation: validationSummary,
      walkForward: walkForwardSummary
    };
  }, [validationCfg, validationData, walkForwardCfg, walkForwardData]);

  const trainingEpisodesAll = useMemo(() => {
    const symbol = String(resolvedSymbol || symbolInput || '').trim();
    if (!symbol || bars.length === 0) return [];
    return replayTrades
      .filter((trade) => trade.outcome === 'win' || trade.outcome === 'loss')
      .map((trade) => ({
        symbol,
        timeframe: resolution,
        setup: trade.setup,
        side: trade.side,
        signalTime: formatTs(bars[trade.signalIndex]?.t),
        entryTime: formatTs(trade.entryTime),
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        rMultiple: trade.rMultiple ?? null,
        outcome: trade.outcome,
        meta: {
          ...(trade.meta || {}),
          packSummary: trainingPackSummary,
          confluence: confluenceCfg,
          execution: {
            entryOrderType: execCfg.entryOrderType,
            entryTiming: execCfg.entryTiming,
            entryDelayBars: execCfg.entryDelayBars,
            maxEntryWaitBars: execCfg.maxEntryWaitBars,
            exitMode: execCfg.exitMode,
            spreadModel: execCfg.spreadModel,
            spreadValue: execCfg.spreadValue,
            spreadAtrMult: execCfg.spreadAtrMult,
            spreadPct: execCfg.spreadPct,
            slippageModel: execCfg.slippageModel,
            slippageValue: execCfg.slippageValue,
            slippageAtrMult: execCfg.slippageAtrMult,
            slippagePct: execCfg.slippagePct,
            slippageOnExit: execCfg.slippageOnExit,
            commissionModel: execCfg.commissionModel,
            commissionValue: execCfg.commissionValue,
            commissionPct: execCfg.commissionPct,
            minStopValue: execCfg.minStopValue,
              minStopAtrMult: execCfg.minStopAtrMult,
              minStopMode: execCfg.minStopMode,
              sessionFilter: execCfg.sessionFilter,
              sessionTimezone: execCfg.sessionTimezone,
              sessionCostOverrides: execCfg.sessionCostOverrides,
              volatilitySlippageEnabled: execCfg.volatilitySlippageEnabled,
              volatilitySlippageLookback: execCfg.volatilitySlippageLookback,
              volatilitySlippageLowThresh: execCfg.volatilitySlippageLowThresh,
              volatilitySlippageHighThresh: execCfg.volatilitySlippageHighThresh,
              volatilitySlippageLowMult: execCfg.volatilitySlippageLowMult,
              volatilitySlippageMidMult: execCfg.volatilitySlippageMidMult,
              volatilitySlippageHighMult: execCfg.volatilitySlippageHighMult,
              partialFillMode: execCfg.partialFillMode,
              partialFillAtrMult: execCfg.partialFillAtrMult,
              partialFillMinRatio: execCfg.partialFillMinRatio,
              partialFillOnExit: execCfg.partialFillOnExit,
              newsSpikeAtrMult: execCfg.newsSpikeAtrMult,
              newsSpikeSlippageMult: execCfg.newsSpikeSlippageMult,
              newsSpikeSpreadMult: execCfg.newsSpikeSpreadMult,
              allowSameBarExit: execCfg.allowSameBarExit,
              tieBreaker
            }
        }
      }));
  }, [bars, confluenceCfg, execCfg, replayTrades, resolvedSymbol, resolution, symbolInput, tieBreaker, trainingPackSummary]);
  const trainingEpisodes = useMemo(() => {
    if (trainingEpisodesAll.length <= MAX_TRAINING_EPISODES) return trainingEpisodesAll;
    return trainingEpisodesAll.slice(trainingEpisodesAll.length - MAX_TRAINING_EPISODES);
  }, [trainingEpisodesAll]);
  const trainingTrimmed = trainingEpisodes.length !== trainingEpisodesAll.length;

  const buildBacktestSummaryText = useCallback((opts?: { includeUpdated?: boolean }) => {
    const includeUpdated = opts?.includeUpdated !== false;
    const symbol = String(resolvedSymbol || symbolInput || '').trim();
    if (!symbol || bars.length === 0) return '';
    if (stats.total === 0) return '';

    const updatedLabel = barsUpdatedAtMs ? formatAge(barsUpdatedAtMs) : '';
    const lines: string[] = [
      'Backtest summary',
      `Symbol: ${symbol}`,
      `Timeframe: ${resolution}`,
      `Range: last ${rangeDays}d`,
      `Bars: ${bars.length}${barsTrimmed ? ' (trimmed)' : ''}`,
      `Trades: ${stats.total} | Win rate: ${formatPercent(stats.winRate)} | Expectancy: ${stats.expectancy?.toFixed(2) ?? '--'}R | PF ${stats.profitFactor?.toFixed(2) ?? '--'}`,
      `Net R: ${formatR(performance.netR)} | Max DD: ${maxDrawdownLabel} | Avg Hold: ${avgHoldLabel}`
    ];

    if (includeUpdated && updatedLabel) lines.push(`Updated: ${updatedLabel} ago`);

    if (validationCfg.enabled && validationData) {
      lines.push(
        `Validation: ${validationCfg.mode === 'last_days' ? `last ${validationCfg.lastDays}d` : `${validationCfg.splitPercent}% split`}`,
        `Train WR ${formatPercent(validationData.trainStats.winRate)} Exp ${validationData.trainStats.expectancy?.toFixed(2) ?? '--'}R PF ${validationData.trainStats.profitFactor?.toFixed(2) ?? '--'} Net ${formatR(validationData.trainEquity.netR)}`,
        `Test WR ${formatPercent(validationData.testStats.winRate)} Exp ${validationData.testStats.expectancy?.toFixed(2) ?? '--'}R PF ${validationData.testStats.profitFactor?.toFixed(2) ?? '--'} Net ${formatR(validationData.testEquity.netR)}`
      );
    }

    if (walkForwardCfg.enabled && walkForwardData?.summary) {
      const driftFlags = walkForwardData.summary.driftFlags || [];
      lines.push(
        `Walk-forward: ${walkForwardCfg.trainDays}d/${walkForwardCfg.testDays}d step ${walkForwardCfg.stepDays}d (folds ${walkForwardData.summary.folds})`,
        `Avg Test Net ${formatR(walkForwardData.summary.avgNetR)} Exp ${formatR(walkForwardData.summary.avgExpectancy)} WR ${formatPercent(walkForwardData.summary.avgWinRate)} PF ${walkForwardData.summary.avgProfitFactor?.toFixed(2) ?? '--'}`,
        `Positive folds: ${formatPercent(walkForwardData.summary.positiveNetPct)} | Stability ${walkForwardData.summary.stabilityScore ?? '--'}`,
        `Drift flags: ${driftFlags.length > 0 ? driftFlags.join(' ') : 'none'}`
      );
    }

    return lines.filter(Boolean).join('\n');
  }, [
    avgHoldLabel,
    bars.length,
    barsTrimmed,
    barsUpdatedAtMs,
    breakCfg,
    maxDrawdownLabel,
    performance.netR,
    rangeDays,
    resolution,
    resolvedSymbol,
    stats.expectancy,
    stats.profitFactor,
    stats.total,
    stats.winRate,
    symbolInput,
    validationCfg.enabled,
    validationCfg.lastDays,
    validationCfg.mode,
    validationCfg.splitPercent,
    validationData,
    walkForwardCfg.enabled,
    walkForwardCfg.stepDays,
    walkForwardCfg.testDays,
    walkForwardCfg.trainDays,
    walkForwardData
  ]);

  const sendBacktestSummary = useCallback(() => {
    if (!onSendTrainingMessage) return;
    const text = buildBacktestSummaryText();
    if (!text) return;
    onSendTrainingMessage(text);
    setAutoSummaryLastSentAt(Date.now());
  }, [buildBacktestSummaryText, onSendTrainingMessage]);

  const handleSendToWatchlist = useCallback(() => {
    setWatchlistError(null);
    setWatchlistStatus(null);
    if (!onSendToWatchlist) {
      setWatchlistError('Watchlist handler unavailable.');
      return;
    }
    const symbol = String(resolvedSymbol || symbolInput || activeSymbol || '').trim();
    const timeframe = String(resolution || '').trim();
    if (!symbol || !timeframe) {
      setWatchlistError('Symbol and timeframe are required.');
      return;
    }

    const payloads: Array<{ strategy: string; params: Record<string, any> }> = [];
    if (rangeCfg.enabled) {
      const { enabled, ...params } = rangeCfg;
      payloads.push({ strategy: 'RANGE_BREAKOUT', params });
    }
    if (breakCfg.enabled) {
      const { enabled, ...params } = breakCfg;
      payloads.push({ strategy: 'BREAK_RETEST', params });
    }
    if (fvgCfg.enabled) {
      const { enabled, ...params } = fvgCfg;
      payloads.push({ strategy: 'FVG_RETRACE', params });
    }
    if (trendCfg.enabled) {
      const { enabled, ...params } = trendCfg;
      payloads.push({ strategy: 'TREND_PULLBACK', params });
    }
    if (meanCfg.enabled) {
      const { enabled, ...params } = meanCfg;
      payloads.push({ strategy: 'MEAN_REVERSION', params });
    }
    if (payloads.length === 0) {
      setWatchlistError('Enable at least one setup to send.');
      return;
    }

    payloads.forEach((payload) => {
      onSendToWatchlist({
        strategy: payload.strategy,
        params: payload.params,
        symbol,
        timeframe,
        mode: watchlistMode
      });
    });
    if (watchlistApplyToChart && onFocusChart) {
      onFocusChart(symbol, timeframe);
    }
    setWatchlistStatus(`Sent ${payloads.length} setup${payloads.length === 1 ? '' : 's'} to watchlist.`);
  }, [activeSymbol, breakCfg, fvgCfg, meanCfg, onFocusChart, onSendToWatchlist, rangeCfg, resolution, resolvedSymbol, symbolInput, trendCfg, watchlistApplyToChart, watchlistMode]);

  useEffect(() => {
    if (!autoSummaryEnabled || !onSendTrainingMessage) return;
    const intervalMin = Math.max(1, Math.min(240, Math.floor(Number(autoSummaryIntervalMin) || 30)));
    const intervalMs = intervalMin * 60_000;

    const tick = () => {
      const text = buildBacktestSummaryText();
      if (!text) return;
      const hash = hashStringSampled(text);
      if (hash && hash === lastAutoSummaryHashRef.current) return;
      lastAutoSummaryHashRef.current = hash;
      lastAutoSummaryAtRef.current = Date.now();
      setAutoSummaryLastSentAt(lastAutoSummaryAtRef.current);
      onSendTrainingMessage(text);
    };

    tick();
    const dispose = runtimeScheduler.registerTask({
      id: 'backtester.auto_summary.poll',
      groupId: 'backtester',
      intervalMs,
      jitterPct: 0.05,
      visibilityMode: 'foreground',
      priority: 'low',
      run: tick
    });
    return () => dispose();
  }, [autoSummaryEnabled, autoSummaryIntervalMin, buildBacktestSummaryText, onSendTrainingMessage, runtimeScheduler]);

  const persistBacktestMemory = useCallback(async () => {
    const symbol = String(resolvedSymbol || symbolInput || '').trim();
    if (!symbol) return;
    if (barsLoading || bars.length === 0 || stats.total === 0) return;

    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.upsertAgentMemory) return;

    const summaryText = buildBacktestSummaryText({ includeUpdated: false });
    if (!summaryText) return;

    const configSnapshot = {
      symbol,
      timeframe: resolution,
      rangeDays,
      rangeCfg,
      fvgCfg,
      trendCfg,
      meanCfg,
      execCfg,
      confluenceCfg,
      validationCfg,
      walkForwardCfg,
      tieBreaker
    };
    const configHash = hashStringSampled(JSON.stringify(configSnapshot));
    const memoryHash = hashStringSampled(JSON.stringify({
      summaryText,
      configHash,
      barsUpdatedAtMs,
      trades: stats.total,
      episodes: trainingEpisodesAll.length,
      validation: trainingPackSummary
    }));
    if (memoryHash && memoryHash === lastPersistedMemoryHashRef.current) return;
    lastPersistedMemoryHashRef.current = memoryHash;

    const payload = {
      config: configSnapshot,
      stats,
      performance: {
        netR: performance.netR,
        maxDrawdown: performance.maxDrawdown,
        maxDrawdownPct: performance.maxDrawdownPct,
        avgR: performance.avgR,
        medianR: performance.medianR,
        avgHoldMs: performance.avgHoldMs,
        maxWinStreak: performance.maxWinStreak,
        maxLossStreak: performance.maxLossStreak
      },
      bars: {
        count: bars.length,
        trimmed: barsTrimmed,
        updatedAtMs: barsUpdatedAtMs,
        source: barsSource || null
      },
      validation: trainingPackSummary?.validation || null,
      walkForward: trainingPackSummary?.walkForward || null,
      setups: {
        range: rangeCfg,
        fvg: fvgCfg,
        trend: trendCfg,
        mean: meanCfg
      },
      execution: execCfg,
      confluence: confluenceCfg,
      replay: {
        enabled: replayEnabled,
        playSpeed,
        tieBreaker
      },
      training: {
        episodes: trainingEpisodesAll.length,
        trimmed: trainingTrimmed,
        maxEpisodes: MAX_TRAINING_EPISODES
      }
    };

    const key = `backtest:${symbol}:${resolution}:${configHash}`;
    const familyKey = `backtest:${symbol}:${resolution}`;
    const tags = [symbol, resolution, 'backtest', 'summary'];

    try {
      await ledger.upsertAgentMemory({
        key,
        familyKey,
        scope: 'shared',
        category: 'backtest',
        subcategory: 'summary',
        kind: 'backtest_summary',
        symbol,
        timeframe: resolution,
        summary: summaryText,
        payload,
        tags,
        source: 'backtester'
      });
      const cutoff = Math.min(replayCutoffIndex, bars.length - 1);
      const runBars = bars.slice(0, cutoff + 1);
      const run = buildBacktestRun({
        symbol,
        timeframe: resolution,
        rangeDays,
        bars: runBars,
        trades: replayTrades,
        stats,
        execution: execCfg,
        timeFilter: null,
        strategyId: null,
        params: {
          range: rangeCfg,
          fvg: fvgCfg,
          trend: trendCfg,
          mean: meanCfg
        },
        notes: {
          source: 'backtester'
        }
      });
      if (run) {
        await persistBacktestRun(run);
      }
      void loadAgentMemory();
    } catch {
      // ignore
    }
  }, [
    bars.length,
    barsLoading,
    barsSource,
    barsTrimmed,
    barsUpdatedAtMs,
    buildBacktestSummaryText,
    confluenceCfg,
    execCfg,
    fvgCfg,
    loadAgentMemory,
    meanCfg,
    performance.avgHoldMs,
    performance.avgR,
    performance.maxDrawdown,
    performance.maxDrawdownPct,
    performance.maxLossStreak,
    performance.maxWinStreak,
    performance.medianR,
    performance.netR,
    rangeCfg,
    rangeDays,
    replayEnabled,
    resolution,
    resolvedSymbol,
    stats,
    symbolInput,
    tieBreaker,
    trainingEpisodesAll.length,
    trainingPackSummary,
    trainingTrimmed,
    trendCfg,
    validationCfg,
    walkForwardCfg,
    replayCutoffIndex,
    replayTrades
  ]);

  useEffect(() => {
    void persistBacktestMemory();
  }, [persistBacktestMemory]);

  const handleManualRun = useCallback(async () => {
    setManualRunStatus(null);
    if (barsLoading) {
      setManualRunStatus('History loading. Try again in a moment.');
      return;
    }
    if (bars.length === 0 || stats.total === 0) {
      setManualRunStatus('No trades to save.');
      return;
    }
    try {
      setManualRunStatus('Saving backtest run...');
      await persistBacktestMemory();
      setManualRunAtMs(Date.now());
      setManualRunStatus('Backtest run saved.');
    } catch {
      setManualRunStatus('Backtest run failed to save.');
    }
  }, [bars.length, barsLoading, persistBacktestMemory, stats.total]);

  const buildBatchParamGrid = useCallback((strategy: BacktestOptimizationStrategy): BacktestParamGrid => {
    if (strategy === 'BREAK_RETEST') {
      return {
        lookbackBars: parseNumberList(optimizerCfg.breakRetest.lookbackBars, breakCfg.lookbackBars, { min: 2 }),
        atrPeriod: [breakCfg.atrPeriod],
        atrMult: parseNumberList(optimizerCfg.breakRetest.atrMult, breakCfg.atrMult, { min: 0.1 }),
        rr: parseNumberList(optimizerCfg.breakRetest.rr, breakCfg.rr, { min: 0.2 }),
        cooldownBars: [breakCfg.cooldownBars],
        breakoutMode: parseEnumList(optimizerCfg.breakRetest.breakoutMode, ['close', 'wick'], breakCfg.breakoutMode),
        bufferAtrMult: parseNumberList(optimizerCfg.breakRetest.bufferAtrMult, breakCfg.bufferAtrMult, { min: 0 }),
        retestBars: parseNumberList(optimizerCfg.breakRetest.retestBars, breakCfg.retestBars, { min: 1 }),
        retestBufferAtrMult: parseNumberList(optimizerCfg.breakRetest.retestBufferAtrMult, breakCfg.retestBufferAtrMult, { min: 0 }),
        retestConfirm: parseEnumList(optimizerCfg.breakRetest.retestConfirm, ['touch', 'close'], breakCfg.retestConfirm)
      };
    }
    if (strategy === 'FVG_RETRACE') {
      return {
        atrPeriod: [fvgCfg.atrPeriod],
        atrMult: parseNumberList(optimizerCfg.fvg.atrMult, fvgCfg.atrMult, { min: 0 }),
        rr: parseNumberList(optimizerCfg.fvg.rr, fvgCfg.rr, { min: 0.2 }),
        maxWaitBars: parseNumberList(optimizerCfg.fvg.maxWaitBars, fvgCfg.maxWaitBars, { min: 0 }),
        entryMode: parseEnumList(optimizerCfg.fvg.entryMode, ['mid', 'edge'], fvgCfg.entryMode),
        minGapAtrMult: parseNumberList(optimizerCfg.fvg.minGapAtrMult, fvgCfg.minGapAtrMult, { min: 0 })
      };
    }
    if (strategy === 'TREND_PULLBACK') {
      return {
        fastEma: parseNumberList(optimizerCfg.trend.fastEma, trendCfg.fastEma, { min: 2 }),
        slowEma: parseNumberList(optimizerCfg.trend.slowEma, trendCfg.slowEma, { min: 5 }),
        pullbackEma: parseEnumList(optimizerCfg.trend.pullbackEma, ['fast', 'slow'], trendCfg.pullbackEma),
        confirmMode: parseEnumList(optimizerCfg.trend.confirmMode, ['touch', 'close'], trendCfg.confirmMode),
        minTrendBars: parseNumberList(optimizerCfg.trend.minTrendBars, trendCfg.minTrendBars, { min: 1 }),
        atrPeriod: [trendCfg.atrPeriod],
        atrMult: parseNumberList(optimizerCfg.trend.atrMult, trendCfg.atrMult, { min: 0.1 }),
        rr: parseNumberList(optimizerCfg.trend.rr, trendCfg.rr, { min: 0.2 }),
        cooldownBars: [trendCfg.cooldownBars]
      };
    }
    if (strategy === 'MEAN_REVERSION') {
      return {
        smaPeriod: parseNumberList(optimizerCfg.mean.smaPeriod, meanCfg.smaPeriod, { min: 5 }),
        atrPeriod: [meanCfg.atrPeriod],
        bandAtrMult: parseNumberList(optimizerCfg.mean.bandAtrMult, meanCfg.bandAtrMult, { min: 0.1 }),
        stopAtrMult: parseNumberList(optimizerCfg.mean.stopAtrMult, meanCfg.stopAtrMult, { min: 0.1 }),
        rr: parseNumberList(optimizerCfg.mean.rr, meanCfg.rr, { min: 0.2 }),
        cooldownBars: [meanCfg.cooldownBars],
        useRsiFilter: parseBoolList(optimizerCfg.mean.useRsiFilter, meanCfg.useRsiFilter),
        rsiPeriod: parseNumberList(optimizerCfg.mean.rsiPeriod, meanCfg.rsiPeriod, { min: 5 }),
        rsiOversold: [meanCfg.rsiOversold],
        rsiOverbought: [meanCfg.rsiOverbought]
      };
    }
    return {
      lookbackBars: parseNumberList(optimizerCfg.range.lookbackBars, rangeCfg.lookbackBars, { min: 2 }),
      atrPeriod: [rangeCfg.atrPeriod],
      atrMult: parseNumberList(optimizerCfg.range.atrMult, rangeCfg.atrMult, { min: 0.1 }),
      rr: parseNumberList(optimizerCfg.range.rr, rangeCfg.rr, { min: 0.2 }),
      cooldownBars: [rangeCfg.cooldownBars],
      breakoutMode: parseEnumList(optimizerCfg.range.breakoutMode, ['close', 'wick'], rangeCfg.breakoutMode),
      bufferAtrMult: parseNumberList(optimizerCfg.range.bufferAtrMult, rangeCfg.bufferAtrMult, { min: 0 })
    };
  }, [breakCfg, fvgCfg, meanCfg, optimizerCfg, rangeCfg, trendCfg]);

  const buildResearchRobustnessPlan = useCallback((level: 'lite' | 'standard' | 'strict') => {
    if (level === 'lite') {
      return { spreadBpsVariants: [0, 5], slippagePctVariants: [0, 0.01], oosShiftDays: [0] };
    }
    if (level === 'strict') {
      return { spreadBpsVariants: [0, 15], slippagePctVariants: [0, 0.03], oosShiftDays: [0, 14] };
    }
    return { spreadBpsVariants: [0, 10], slippagePctVariants: [0, 0.02], oosShiftDays: [0, 7] };
  }, []);

  const clearResearchTimer = useCallback(() => {
    if (researchTimerRef.current) {
      researchTimerRef.current();
      researchTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearResearchTimer();
    };
  }, [clearResearchTimer]);

  const loadResearchResults = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const res = await getResearchResults(sessionId);
      if (res?.steps && Array.isArray(res.steps)) {
        setResearchSteps(res.steps);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshResearchAutopilot = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    const status = await getResearchStatus(sessionId);
    if (status) {
      setResearchSession(status);
      setResearchUpdatedAtMs(Date.now());
      void loadResearchResults(sessionId);
      if (status.status === 'failed') {
        setResearchError(status.stats?.lastError || 'Research session failed.');
      }
    }
    if (!status || status.status !== 'running') {
      setResearchRunning(false);
      clearResearchTimer();
    }
  }, [clearResearchTimer, loadResearchResults]);

  const resumeResearchAutopilot = useCallback(async () => {
    setResearchError(null);
    setResearchStatus(null);
    const symbol = String(resolvedSymbol || symbolInput || activeSymbol || '').trim();
    if (!symbol) {
      setResearchError('Symbol required.');
      return;
    }
    if (!resolution) {
      setResearchError('Timeframe required.');
      return;
    }
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listResearchSessions) {
      setResearchError('Research sessions unavailable.');
      return;
    }
    try {
      const res = await ledger.listResearchSessions({ limit: 1, symbol, timeframe: resolution });
      const latest = res?.ok && Array.isArray(res.sessions) ? res.sessions[0] : null;
      if (!latest?.sessionId) {
        setResearchError('No research sessions found.');
        return;
      }
      const session = await getResearchStatus(String(latest.sessionId)) || latest;
      setResearchSession(session);
      setResearchUpdatedAtMs(Date.now());
      setResearchRunning(session.status === 'running' || session.status === 'paused');
      clearResearchTimer();
      if (session.status === 'running' || session.status === 'paused') {
        researchTimerRef.current = runtimeScheduler.registerTask({
          id: `backtester.research.poll.${session.sessionId}`,
          groupId: 'backtester',
          intervalMs: 2000,
          jitterPct: 0.08,
          visibilityMode: 'foreground',
          priority: 'normal',
          run: async () => {
            await refreshResearchAutopilot(session.sessionId);
          }
        });
      } else {
        void loadResearchResults(session.sessionId);
      }
    } catch (err: any) {
      setResearchError(err?.message ? String(err.message) : 'Failed to resume research session.');
    }
  }, [
    activeSymbol,
    clearResearchTimer,
    loadResearchResults,
    refreshResearchAutopilot,
    resolution,
    resolvedSymbol,
    symbolInput
  ]);

  const runResearchAutopilot = useCallback(async () => {
    setResearchError(null);
    setResearchStatus(null);
    const symbol = String(resolvedSymbol || symbolInput || activeSymbol || '').trim();
    if (!symbol) {
      setResearchError('Symbol required.');
      return;
    }
    if (!resolution) {
      setResearchError('Timeframe required.');
      return;
    }

    const paramGrid = buildBatchParamGrid(batchStrategy);
    if (!paramGrid || Object.keys(paramGrid).length === 0) {
      setResearchError('Parameter grid unavailable.');
      return;
    }

    const rangeDaysValue = clampRangeDays(Number(batchRangeDays) || rangeDays || DEFAULT_RANGE_DAYS);
    const maxCombosValue = Math.max(1, Math.min(2000, Math.floor(Number(batchMaxCombos) || 200)));
    const validation = walkForwardCfg.enabled
      ? {
          mode: 'walk_forward' as const,
          trainDays: walkForwardCfg.trainDays,
          testDays: walkForwardCfg.testDays,
          stepDays: walkForwardCfg.stepDays,
          minTrades: walkForwardCfg.minTrades
        }
      : validationCfg.enabled
        ? {
            mode: validationCfg.mode === 'last_days' ? 'last_days' : 'percent',
            splitPercent: validationCfg.splitPercent,
            lastDays: validationCfg.lastDays
          }
        : { mode: 'percent', splitPercent: 70 };

    setResearchRunning(true);
    clearResearchTimer();

    const session = await startResearchSession({
      symbol,
      timeframe: resolution,
      strategy: batchStrategy,
      rangeDays: rangeDaysValue,
      maxCombos: maxCombosValue,
      maxExperiments: researchMaxExperiments,
      objectivePreset: researchPresetId,
      validation,
      execution: execCfg,
      paramGrid,
      robustness: buildResearchRobustnessPlan(researchRobustness),
      robustnessLevel: researchRobustness,
      allowRegimeBrittle: effectiveAllowRegimeBrittle,
      requiredRegimePassRate: effectiveRegimePassRate,
      criticalRegimes: effectiveCriticalRegimes,
      minRegimesSeen: effectiveMinRegimesSeen
    });

    setResearchSession(session);
    setResearchUpdatedAtMs(Date.now());
    researchTimerRef.current = runtimeScheduler.registerTask({
      id: `backtester.research.poll.${session.sessionId}`,
      groupId: 'backtester',
      intervalMs: 2000,
      jitterPct: 0.08,
      visibilityMode: 'foreground',
      priority: 'normal',
      run: async () => {
        await refreshResearchAutopilot(session.sessionId);
      }
    });
    void refreshResearchAutopilot(session.sessionId);
  }, [
    activeSymbol,
    batchMaxCombos,
    batchRangeDays,
    batchStrategy,
    buildBatchParamGrid,
    buildResearchRobustnessPlan,
    clearResearchTimer,
    effectiveAllowRegimeBrittle,
    effectiveCriticalRegimes,
    effectiveMinRegimesSeen,
    effectiveRegimePassRate,
    execCfg,
    rangeDays,
    researchMaxExperiments,
    researchPresetId,
    researchRobustness,
    resolution,
    resolvedSymbol,
    refreshResearchAutopilot,
    symbolInput,
    validationCfg,
    walkForwardCfg,
    runtimeScheduler
  ]);

  const stopResearchAutopilot = useCallback(async () => {
    if (!researchSession?.sessionId) return;
    await stopResearchSession(researchSession.sessionId);
    setResearchRunning(false);
    clearResearchTimer();
    void refreshResearchAutopilot(researchSession.sessionId);
  }, [clearResearchTimer, refreshResearchAutopilot, researchSession?.sessionId]);

  // Shared clipboard helper (used by export + preset tools).
  const writeClipboardText = useCallback(async (payload: string) => {
    try {
      const fn = (window as any)?.glass?.clipboard?.writeText;
      if (fn) {
        const res = fn(payload);
        if (res && typeof res.then === 'function') await res;
        return true;
      }
    } catch {
      // ignore
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  const exportResearchAutopilot = useCallback(async () => {
    setResearchError(null);
    setResearchStatus(null);
    const sessionId = researchSession?.sessionId;
    if (!sessionId) {
      setResearchError('Research session unavailable.');
      return;
    }
    const payload = await exportResearchSession(sessionId);
    if (!payload) {
      setResearchError('Export failed.');
      return;
    }
    const serialized = JSON.stringify(payload, null, 2);
    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver === 'function') {
      const res = await saver({
        data: serialized,
        mimeType: 'application/json',
        subdir: 'exports',
        prefix: `research_${sessionId}`
      });
      if (res?.ok) {
        setResearchStatus(`Export saved (${res.filename || 'research_session.json'}).`);
      } else {
        setResearchError(res?.error ? String(res.error) : 'Export failed.');
      }
      return;
    }
    const ok = await writeClipboardText(serialized);
    if (ok) {
      setResearchStatus('Export copied to clipboard.');
    } else {
      setResearchError('Save unavailable.');
    }
  }, [exportResearchSession, researchSession?.sessionId, writeClipboardText]);

  const promoteResearchChampion = useCallback(async () => {
    setResearchError(null);
    setResearchStatus(null);
    if (!onCreateWatchProfile) {
      setResearchError('Watch profile handler unavailable.');
      return;
    }
    const champion = researchSession?.stats?.champion;
    const noteId = champion?.experimentNoteId || champion?.experimentId;
    if (!noteId) {
      setResearchError('Champion experiment unavailable.');
      return;
    }
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.getExperimentNote) {
      setResearchError('Experiment notes unavailable.');
      return;
    }
    const res = await ledger.getExperimentNote({ id: String(noteId) });
    const note = res?.ok ? res.note : null;
    if (!note?.recommendedParams) {
      setResearchError('Champion params unavailable.');
      return;
    }
    await onCreateWatchProfile({
      strategy: String(note.strategy || researchSession?.strategy || '').trim() || 'RANGE_BREAKOUT',
      params: note.recommendedParams,
      symbol: note.symbol || researchSession?.symbol,
      timeframe: note.timeframe || researchSession?.timeframe,
      objectivePresetId: note.objectivePreset || researchSession?.objectivePreset || null,
      objectivePresetName: null,
      baselineRunId: note.baselineRunId || null,
      optimizerSessionId: note.round2SessionId || note.round1SessionId || null,
      mode: 'suggest',
      enabled: true
    });
    setResearchStatus('Champion promoted to watch profile.');
  }, [onCreateWatchProfile, researchSession]);


  const clearOptimizerLoopTimer = useCallback(() => {
    if (optimizerLoopTimerRef.current) {
      optimizerLoopTimerRef.current();
      optimizerLoopTimerRef.current = null;
    }
  }, []);

  const refreshOptimizerLoop = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return;
      const status = await getOptimizerStatus(sessionId);
      if (status) {
        setOptimizerLoopSession(status);
        if (status.status === 'failed' && status.error) {
          setOptimizerLoopError(status.error);
        }
      }
      if (!status || status.status === 'running') return;
      const results = await getOptimizerResults(sessionId);
      if (results) {
        setOptimizerLoopResults(results);
      }
      setOptimizerLoopRunning(false);
      clearOptimizerLoopTimer();
    },
    [clearOptimizerLoopTimer]
  );

  const runOptimizerLoop = useCallback(async () => {
    setOptimizerLoopError(null);
    setOptimizerLoopResults(null);
    setOptimizerLoopAppliedStatus(null);
    setOptimizerLoopApplyError(null);
    setOptimizerLoopApplyWarnings([]);
    const symbol = String(resolvedSymbol || symbolInput || activeSymbol || '').trim();
    if (!symbol) {
      setOptimizerLoopError('Symbol required.');
      return;
    }
    if (bars.length === 0 || stats.total === 0) {
      setOptimizerLoopError('Load broker history before optimizing.');
      return;
    }

    const cutoff = Math.min(replayCutoffIndex, bars.length - 1);
    const runBars = bars.slice(0, cutoff + 1);
    const run = buildBacktestRun({
      symbol,
      timeframe: resolution,
      rangeDays,
      bars: runBars,
      trades: replayTrades,
      stats,
      execution: execCfg,
      timeFilter: null,
      strategyId: null,
      params: {
        range: rangeCfg,
        fvg: fvgCfg,
        trend: trendCfg,
        mean: meanCfg
      },
      notes: {
        source: 'backtester'
      }
    });
    if (run) {
      await persistBacktestRun(run);
    }

    const paramGrid = buildBatchParamGrid(batchStrategy);
    if (!paramGrid || Object.keys(paramGrid).length === 0) {
      setOptimizerLoopError('Parameter grid unavailable.');
      return;
    }

    const rangeDaysValue = clampRangeDays(Number(batchRangeDays) || rangeDays || DEFAULT_RANGE_DAYS);
    const maxCombosValue = Math.max(1, Math.min(2000, Math.floor(Number(batchMaxCombos) || 200)));
    const validation = walkForwardCfg.enabled
      ? {
          mode: 'walk_forward' as const,
          trainDays: walkForwardCfg.trainDays,
          testDays: walkForwardCfg.testDays,
          stepDays: walkForwardCfg.stepDays,
          minTrades: walkForwardCfg.minTrades
        }
      : validationCfg.enabled
        ? {
            mode: validationCfg.mode === 'last_days' ? 'last_days' : 'percent',
            splitPercent: validationCfg.splitPercent,
            lastDays: validationCfg.lastDays
          }
        : { mode: 'percent', splitPercent: 70 };

    setOptimizerLoopRunning(true);
    clearOptimizerLoopTimer();

    const session = await startOptimizationSession(
      {
        baselineRunId: run?.runId,
        symbol,
        timeframe: resolution,
        strategy: batchStrategy,
        rangeDays: rangeDaysValue,
        paramGrid,
        execution: execCfg,
        validation,
        objectivePreset: optimizerLoopPresetId,
        maxCombos: maxCombosValue
      },
      {
        onProgress: (progress) => {
          setOptimizerLoopSession((prev) => (prev ? { ...prev, progress } : prev));
        }
      }
    );

    setOptimizerLoopSession(session);
    optimizerLoopTimerRef.current = runtimeScheduler.registerTask({
      id: `backtester.optimizer.poll.${session.sessionId}`,
      groupId: 'backtester',
      intervalMs: 2000,
      jitterPct: 0.08,
      visibilityMode: 'foreground',
      priority: 'normal',
      run: async () => {
        await refreshOptimizerLoop(session.sessionId);
      }
    });
    void refreshOptimizerLoop(session.sessionId);
  }, [
    activeSymbol,
    bars,
    batchMaxCombos,
    batchRangeDays,
    batchStrategy,
    buildBatchParamGrid,
    clearOptimizerLoopTimer,
    execCfg,
    fvgCfg,
    meanCfg,
    optimizerLoopPresetId,
    rangeCfg,
    rangeDays,
    replayCutoffIndex,
    replayTrades,
    resolution,
    resolvedSymbol,
    stats,
    symbolInput,
    trendCfg,
    validationCfg.enabled,
    validationCfg.lastDays,
    validationCfg.mode,
    validationCfg.splitPercent,
    walkForwardCfg.enabled,
    walkForwardCfg.minTrades,
    walkForwardCfg.stepDays,
    walkForwardCfg.testDays,
    walkForwardCfg.trainDays,
    refreshOptimizerLoop,
    runtimeScheduler
  ]);

  

  const clearOptimizerLoop = useCallback(() => {
    clearOptimizerLoopTimer();
    setOptimizerLoopRunning(false);
    setOptimizerLoopSession(null);
    setOptimizerLoopResults(null);
    setOptimizerLoopError(null);
    setOptimizerLoopAppliedStatus(null);
    setOptimizerLoopApplyError(null);
    setOptimizerLoopApplyWarnings([]);
  }, [clearOptimizerLoopTimer]);

  useEffect(() => () => clearOptimizerLoopTimer(), [clearOptimizerLoopTimer]);

  const runOptimizerLocal = useCallback(async (optBars: Candle[]) => {
    const startedAt = Date.now();
    const maxCombos = Math.max(10, Math.min(5000, Math.floor(Number(optimizerCfg.maxCombos) || 250)));
    const results: OptimizerResult[] = [];
    let attempted = 0;
    let estimated = 0;
    let truncated = false;

    const estimateCombos = (inputs: Record<string, any[]>) => {
      let count = 1;
      for (const values of Object.values(inputs)) {
        count *= Math.max(1, values.length || 0);
      }
      return count;
    };

    const applyConfluenceFilter = (trades: BacktestTrade[]) => {
      if (!optimizerCfg.useConfluence || !confluenceCfg.enabled || !htfBiasByIndex) return trades;
      return trades
        .map((trade) => {
          const refIndex =
            confluenceCfg.biasReference === 'signal'
              ? trade.signalIndex
              : execCfg.entryTiming === 'signal_close'
                ? trade.signalIndex
                : trade.entryIndex;
          const bias: BiasLabel = htfBiasByIndex[refIndex] || 'neutral';
          const matches =
            bias === 'neutral'
              ? confluenceCfg.allowNeutral
              : (bias === 'bull' && trade.side === 'BUY') || (bias === 'bear' && trade.side === 'SELL');
          if (!matches) return null;
          return trade;
        })
        .filter(Boolean) as BacktestTrade[];
    };

    const evaluateSetup = <T extends RangeBreakoutConfig | BreakRetestConfig | FvgRetraceConfig | TrendPullbackConfig | MeanReversionConfig>(
      setup: BacktestSetupId,
      baseCfg: T,
      inputs: Partial<Record<keyof T, any[]>>,
      generator: (bars: Candle[], cfg: T) => BacktestTrade[]
    ) => {
      if (attempted >= maxCombos) {
        truncated = true;
        return;
      }
      const comboEstimate = estimateCombos(inputs as Record<string, any[]>);
      estimated += comboEstimate;
      const remaining = Math.max(0, maxCombos - attempted);
      const grids = buildGrid(baseCfg, inputs, remaining);
      if (grids.length < comboEstimate) truncated = true;

      for (const cfg of grids) {
        if (attempted >= maxCombos) {
          truncated = true;
          break;
        }
        const candidates = generator(optBars, cfg as T);
        const filtered = applyConfluenceFilter(candidates);
        const simulated = simulateTrades(optBars, filtered, { tieBreaker, execution: execCfg });
        const statsResult = summarizeTrades(simulated);
        const equity = computeEquityStats(simulated);
        results.push({
          id: `${setup}_${attempted}`,
          setup,
          stats: statsResult,
          netR: equity.netR,
          maxDrawdown: equity.maxDrawdown,
          winRate: statsResult.winRate,
          expectancy: statsResult.expectancy,
          profitFactor: statsResult.profitFactor,
          params: cfg as Record<string, any>
        });
        attempted += 1;
      }
    };

    if (optimizerCfg.range.enabled) {
      const base: RangeBreakoutConfig = { ...rangeCfg, enabled: true };
      const inputs = {
        lookbackBars: parseNumberList(optimizerCfg.range.lookbackBars, base.lookbackBars, { min: 2 }),
        atrMult: parseNumberList(optimizerCfg.range.atrMult, base.atrMult, { min: 0.1 }),
        rr: parseNumberList(optimizerCfg.range.rr, base.rr, { min: 0.2 }),
        breakoutMode: parseEnumList(optimizerCfg.range.breakoutMode, ['close', 'wick'], base.breakoutMode),
        bufferAtrMult: parseNumberList(optimizerCfg.range.bufferAtrMult, base.bufferAtrMult, { min: 0 })
      };
      evaluateSetup('range_breakout', base, inputs, generateRangeBreakoutTrades);
    }

    if (optimizerCfg.breakRetest.enabled) {
      const base: BreakRetestConfig = { ...breakCfg, enabled: true };
      const inputs = {
        lookbackBars: parseNumberList(optimizerCfg.breakRetest.lookbackBars, base.lookbackBars, { min: 2 }),
        atrMult: parseNumberList(optimizerCfg.breakRetest.atrMult, base.atrMult, { min: 0.1 }),
        rr: parseNumberList(optimizerCfg.breakRetest.rr, base.rr, { min: 0.2 }),
        breakoutMode: parseEnumList(optimizerCfg.breakRetest.breakoutMode, ['close', 'wick'], base.breakoutMode),
        bufferAtrMult: parseNumberList(optimizerCfg.breakRetest.bufferAtrMult, base.bufferAtrMult, { min: 0 }),
        retestBars: parseNumberList(optimizerCfg.breakRetest.retestBars, base.retestBars, { min: 1 }),
        retestBufferAtrMult: parseNumberList(optimizerCfg.breakRetest.retestBufferAtrMult, base.retestBufferAtrMult, { min: 0 }),
        retestConfirm: parseEnumList(optimizerCfg.breakRetest.retestConfirm, ['touch', 'close'], base.retestConfirm)
      };
      evaluateSetup('break_retest', base, inputs, generateBreakRetestTrades);
    }

    if (optimizerCfg.fvg.enabled) {
      const base: FvgRetraceConfig = { ...fvgCfg, enabled: true };
      const inputs = {
        atrMult: parseNumberList(optimizerCfg.fvg.atrMult, base.atrMult, { min: 0 }),
        rr: parseNumberList(optimizerCfg.fvg.rr, base.rr, { min: 0.2 }),
        maxWaitBars: parseNumberList(optimizerCfg.fvg.maxWaitBars, base.maxWaitBars, { min: 0 }),
        entryMode: parseEnumList(optimizerCfg.fvg.entryMode, ['mid', 'edge'], base.entryMode),
        minGapAtrMult: parseNumberList(optimizerCfg.fvg.minGapAtrMult, base.minGapAtrMult, { min: 0 })
      };
      evaluateSetup('fvg_retrace', base, inputs, generateFvgRetraceTrades);
    }

    if (optimizerCfg.trend.enabled) {
      const base: TrendPullbackConfig = { ...trendCfg, enabled: true };
      const inputs = {
        fastEma: parseNumberList(optimizerCfg.trend.fastEma, base.fastEma, { min: 2 }),
        slowEma: parseNumberList(optimizerCfg.trend.slowEma, base.slowEma, { min: 5 }),
        atrMult: parseNumberList(optimizerCfg.trend.atrMult, base.atrMult, { min: 0.1 }),
        rr: parseNumberList(optimizerCfg.trend.rr, base.rr, { min: 0.2 }),
        confirmMode: parseEnumList(optimizerCfg.trend.confirmMode, ['touch', 'close'], base.confirmMode),
        pullbackEma: parseEnumList(optimizerCfg.trend.pullbackEma, ['fast', 'slow'], base.pullbackEma),
        minTrendBars: parseNumberList(optimizerCfg.trend.minTrendBars, base.minTrendBars, { min: 1 })
      };
      evaluateSetup('trend_pullback', base, inputs, generateTrendPullbackTrades);
    }

    if (optimizerCfg.mean.enabled) {
      const base: MeanReversionConfig = { ...meanCfg, enabled: true };
      const inputs = {
        smaPeriod: parseNumberList(optimizerCfg.mean.smaPeriod, base.smaPeriod, { min: 5 }),
        bandAtrMult: parseNumberList(optimizerCfg.mean.bandAtrMult, base.bandAtrMult, { min: 0.1 }),
        stopAtrMult: parseNumberList(optimizerCfg.mean.stopAtrMult, base.stopAtrMult, { min: 0.1 }),
        rr: parseNumberList(optimizerCfg.mean.rr, base.rr, { min: 0.2 }),
        useRsiFilter: parseBoolList(optimizerCfg.mean.useRsiFilter, base.useRsiFilter),
        rsiPeriod: parseNumberList(optimizerCfg.mean.rsiPeriod, base.rsiPeriod, { min: 5 })
      };
      evaluateSetup('mean_reversion', base, inputs, generateMeanReversionTrades);
    }

    const sortBy = optimizerCfg.sortBy;
    const scoreFor = (result: OptimizerResult) => {
      if (sortBy === 'expectancy') return result.expectancy ?? -Infinity;
      if (sortBy === 'profitFactor') return result.profitFactor ?? -Infinity;
      if (sortBy === 'winRate') return result.winRate ?? -Infinity;
      if (sortBy === 'maxDrawdown') return -result.maxDrawdown;
      return result.netR;
    };

    results.sort((a, b) => scoreFor(b) - scoreFor(a));
    const topN = Math.max(1, Math.min(200, Math.floor(Number(optimizerCfg.topN) || 12)));
    const trimmed = results.slice(0, topN);

    return {
      results: trimmed,
      summary: {
        attempted,
        estimated,
        durationMs: Date.now() - startedAt,
        truncated
      }
    };
  }, [
    breakCfg,
    confluenceCfg,
    execCfg,
    fvgCfg,
    htfBiasByIndex,
    meanCfg,
    optimizerCfg,
    rangeCfg,
    tieBreaker,
    trendCfg
  ]);

  const runOptimizer = useCallback(async () => {
    if (optimizerRunning) return;
    if (bars.length === 0) {
      setOptimizerError('Load broker history before optimizing.');
      return;
    }

    const optBars = optimizerCfg.useReplayWindow
      ? bars.slice(0, Math.max(1, replayCutoffIndex + 1))
      : bars;
    if (optBars.length < 20) {
      setOptimizerError('Not enough bars for optimization.');
      return;
    }

    if (optimizerCfg.useConfluence && confluenceCfg.enabled && !htfBiasByIndex) {
      setOptimizerError('HTF bias not ready. Load HTF bars or disable confluence for optimization.');
      return;
    }

    setOptimizerRunning(true);
    setOptimizerError(null);
    setOptimizerSummary(null);
    setOptimizerResults([]);

    await new Promise((resolve) => setTimeout(resolve, 30));

    try {
      const maxCombos = Math.max(10, Math.min(5000, Math.floor(Number(optimizerCfg.maxCombos) || 250)));
      const topN = Math.max(1, Math.min(200, Math.floor(Number(optimizerCfg.topN) || 12)));
      const setups: SetupOptimizerPayload['setups'] = [];

      if (optimizerCfg.range.enabled) {
        const base: RangeBreakoutConfig = { ...rangeCfg, enabled: true };
        setups.push({
          id: 'range_breakout',
          base,
          grid: {
            lookbackBars: parseNumberList(optimizerCfg.range.lookbackBars, base.lookbackBars, { min: 2 }),
            atrMult: parseNumberList(optimizerCfg.range.atrMult, base.atrMult, { min: 0.1 }),
            rr: parseNumberList(optimizerCfg.range.rr, base.rr, { min: 0.2 }),
            breakoutMode: parseEnumList(optimizerCfg.range.breakoutMode, ['close', 'wick'], base.breakoutMode),
            bufferAtrMult: parseNumberList(optimizerCfg.range.bufferAtrMult, base.bufferAtrMult, { min: 0 })
          }
        });
      }

      if (optimizerCfg.breakRetest.enabled) {
        const base: BreakRetestConfig = { ...breakCfg, enabled: true };
        setups.push({
          id: 'break_retest',
          base,
          grid: {
            lookbackBars: parseNumberList(optimizerCfg.breakRetest.lookbackBars, base.lookbackBars, { min: 2 }),
            atrMult: parseNumberList(optimizerCfg.breakRetest.atrMult, base.atrMult, { min: 0.1 }),
            rr: parseNumberList(optimizerCfg.breakRetest.rr, base.rr, { min: 0.2 }),
            breakoutMode: parseEnumList(optimizerCfg.breakRetest.breakoutMode, ['close', 'wick'], base.breakoutMode),
            bufferAtrMult: parseNumberList(optimizerCfg.breakRetest.bufferAtrMult, base.bufferAtrMult, { min: 0 }),
            retestBars: parseNumberList(optimizerCfg.breakRetest.retestBars, base.retestBars, { min: 1 }),
            retestBufferAtrMult: parseNumberList(optimizerCfg.breakRetest.retestBufferAtrMult, base.retestBufferAtrMult, { min: 0 }),
            retestConfirm: parseEnumList(optimizerCfg.breakRetest.retestConfirm, ['touch', 'close'], base.retestConfirm)
          }
        });
      }

      if (optimizerCfg.fvg.enabled) {
        const base: FvgRetraceConfig = { ...fvgCfg, enabled: true };
        setups.push({
          id: 'fvg_retrace',
          base,
          grid: {
            atrMult: parseNumberList(optimizerCfg.fvg.atrMult, base.atrMult, { min: 0 }),
            rr: parseNumberList(optimizerCfg.fvg.rr, base.rr, { min: 0.2 }),
            maxWaitBars: parseNumberList(optimizerCfg.fvg.maxWaitBars, base.maxWaitBars, { min: 0 }),
            entryMode: parseEnumList(optimizerCfg.fvg.entryMode, ['mid', 'edge'], base.entryMode),
            minGapAtrMult: parseNumberList(optimizerCfg.fvg.minGapAtrMult, base.minGapAtrMult, { min: 0 })
          }
        });
      }

      if (optimizerCfg.trend.enabled) {
        const base: TrendPullbackConfig = { ...trendCfg, enabled: true };
        setups.push({
          id: 'trend_pullback',
          base,
          grid: {
            fastEma: parseNumberList(optimizerCfg.trend.fastEma, base.fastEma, { min: 2 }),
            slowEma: parseNumberList(optimizerCfg.trend.slowEma, base.slowEma, { min: 5 }),
            atrMult: parseNumberList(optimizerCfg.trend.atrMult, base.atrMult, { min: 0.1 }),
            rr: parseNumberList(optimizerCfg.trend.rr, base.rr, { min: 0.2 }),
            confirmMode: parseEnumList(optimizerCfg.trend.confirmMode, ['touch', 'close'], base.confirmMode),
            pullbackEma: parseEnumList(optimizerCfg.trend.pullbackEma, ['fast', 'slow'], base.pullbackEma),
            minTrendBars: parseNumberList(optimizerCfg.trend.minTrendBars, base.minTrendBars, { min: 1 })
          }
        });
      }

      if (optimizerCfg.mean.enabled) {
        const base: MeanReversionConfig = { ...meanCfg, enabled: true };
        setups.push({
          id: 'mean_reversion',
          base,
          grid: {
            smaPeriod: parseNumberList(optimizerCfg.mean.smaPeriod, base.smaPeriod, { min: 5 }),
            bandAtrMult: parseNumberList(optimizerCfg.mean.bandAtrMult, base.bandAtrMult, { min: 0.1 }),
            stopAtrMult: parseNumberList(optimizerCfg.mean.stopAtrMult, base.stopAtrMult, { min: 0.1 }),
            rr: parseNumberList(optimizerCfg.mean.rr, base.rr, { min: 0.2 }),
            useRsiFilter: parseBoolList(optimizerCfg.mean.useRsiFilter, base.useRsiFilter),
            rsiPeriod: parseNumberList(optimizerCfg.mean.rsiPeriod, base.rsiPeriod, { min: 5 })
          }
        });
      }

      const payload: SetupOptimizerPayload = {
        bars: optBars,
        tieBreaker,
        execution: execCfg,
        confluence: {
          enabled: confluenceCfg.enabled,
          apply: optimizerCfg.useConfluence,
          biasReference: confluenceCfg.biasReference,
          allowNeutral: confluenceCfg.allowNeutral,
          entryTiming: execCfg.entryTiming,
          htfBiasByIndex: optimizerCfg.useConfluence ? htfBiasByIndex : undefined
        },
        maxCombos,
        sortBy: optimizerCfg.sortBy,
        topN,
        setups
      };

      const workerResult = await runSetupOptimizerWorker(payload);
      if (!workerResult?.ok) {
        throw new Error(workerResult?.error || 'Optimizer failed.');
      }
      setOptimizerResults(workerResult.results || []);
      setOptimizerSummary(workerResult.summary || null);
    } catch (err: any) {
      try {
        const fallback = await runOptimizerLocal(optBars);
        setOptimizerResults(fallback.results);
        setOptimizerSummary(fallback.summary);
      } catch (fallbackErr: any) {
        const msg = fallbackErr?.message || err?.message || 'Optimizer failed.';
        setOptimizerError(String(msg));
      }
    } finally {
      setOptimizerRunning(false);
    }
  }, [
    bars,
    breakCfg,
    confluenceCfg,
    execCfg,
    fvgCfg,
    htfBiasByIndex,
    meanCfg,
    optimizerCfg,
    optimizerRunning,
    rangeCfg,
    replayCutoffIndex,
    runOptimizerLocal,
    tieBreaker,
    trendCfg
  ]);

  const applyOptimizerResult = useCallback((result: OptimizerResult) => {
    if (!result) return;
    setOptimizerError(null);
    setOptimizerAppliedId(result.id);
    if (result.setup === 'range_breakout') {
      setRangeCfg((prev) => ({ ...prev, ...result.params, enabled: true }));
    } else if (result.setup === 'break_retest') {
      setBreakCfg((prev) => ({ ...prev, ...result.params, enabled: true }));
    } else if (result.setup === 'fvg_retrace') {
      setFvgCfg((prev) => ({ ...prev, ...result.params, enabled: true }));
    } else if (result.setup === 'trend_pullback') {
      setTrendCfg((prev) => ({ ...prev, ...result.params, enabled: true }));
    } else if (result.setup === 'mean_reversion') {
      setMeanCfg((prev) => ({ ...prev, ...result.params, enabled: true }));
    }
  }, []);

  const applyOptimization = useCallback((payload: BacktesterOptimizationApply) => {
    if (!payload || !payload.params) return;
    const strategy = String(payload.strategy || '').trim().toUpperCase();
    const params = payload.params && typeof payload.params === 'object' ? payload.params : {};

    const nextSymbol = String(payload.symbol || '').trim();
    if (nextSymbol) {
      setSymbolInput(nextSymbol);
      void resolveAndSetSymbol(nextSymbol);
    }

    const nextResolution = normalizeResolution(String(payload.timeframe || '').trim());
    if (nextResolution && RESOLUTIONS.includes(nextResolution)) {
      setResolution(nextResolution);
    }

    const nextRangeDays = toNumber(payload.rangeDays, null);
    if (nextRangeDays && nextRangeDays > 0) {
      setRangeDays(clampRangeDays(nextRangeDays));
    }

    if (strategy === 'RANGE_BREAKOUT') {
      setRangeCfg((prev) => ({
        ...prev,
        enabled: true,
        lookbackBars: Math.max(2, toNumber(params.lookbackBars, prev.lookbackBars) ?? prev.lookbackBars),
        atrPeriod: Math.max(2, toNumber(params.atrPeriod, prev.atrPeriod) ?? prev.atrPeriod),
        atrMult: Math.max(0.1, toNumber(params.atrMult, prev.atrMult) ?? prev.atrMult),
        rr: Math.max(0.1, toNumber(params.rr, prev.rr) ?? prev.rr),
        cooldownBars: Math.max(0, toNumber(params.cooldownBars, prev.cooldownBars) ?? prev.cooldownBars),
        breakoutMode: (() => {
          const mode = String(params.breakoutMode || '').toLowerCase();
          if (mode === 'wick' || mode === 'close') return mode as RangeBreakoutConfig['breakoutMode'];
          return prev.breakoutMode;
        })(),
        bufferAtrMult: Math.max(0, toNumber(params.bufferAtrMult, prev.bufferAtrMult) ?? prev.bufferAtrMult)
      }));
      setBreakCfg((prev) => ({ ...prev, enabled: false }));
      setFvgCfg((prev) => ({ ...prev, enabled: false }));
      setTrendCfg((prev) => ({ ...prev, enabled: false }));
      setMeanCfg((prev) => ({ ...prev, enabled: false }));
      return;
    }

    if (strategy === 'BREAK_RETEST') {
      setBreakCfg((prev) => ({
        ...prev,
        enabled: true,
        lookbackBars: Math.max(2, toNumber(params.lookbackBars, prev.lookbackBars) ?? prev.lookbackBars),
        atrPeriod: Math.max(2, toNumber(params.atrPeriod, prev.atrPeriod) ?? prev.atrPeriod),
        atrMult: Math.max(0.1, toNumber(params.atrMult, prev.atrMult) ?? prev.atrMult),
        rr: Math.max(0.1, toNumber(params.rr, prev.rr) ?? prev.rr),
        cooldownBars: Math.max(0, toNumber(params.cooldownBars, prev.cooldownBars) ?? prev.cooldownBars),
        breakoutMode: (() => {
          const mode = String(params.breakoutMode || '').toLowerCase();
          if (mode === 'wick' || mode === 'close') return mode as BreakRetestConfig['breakoutMode'];
          return prev.breakoutMode;
        })(),
        bufferAtrMult: Math.max(0, toNumber(params.bufferAtrMult, prev.bufferAtrMult) ?? prev.bufferAtrMult),
        retestBars: Math.max(1, toNumber(params.retestBars, prev.retestBars) ?? prev.retestBars),
        retestBufferAtrMult: Math.max(0, toNumber(params.retestBufferAtrMult, prev.retestBufferAtrMult) ?? prev.retestBufferAtrMult),
        retestConfirm: (() => {
          const mode = String(params.retestConfirm || '').toLowerCase();
          if (mode === 'close' || mode === 'touch') return mode as BreakRetestConfig['retestConfirm'];
          return prev.retestConfirm;
        })()
      }));
      setRangeCfg((prev) => ({ ...prev, enabled: false }));
      setFvgCfg((prev) => ({ ...prev, enabled: false }));
      setTrendCfg((prev) => ({ ...prev, enabled: false }));
      setMeanCfg((prev) => ({ ...prev, enabled: false }));
      return;
    }

    if (strategy === 'FVG_RETRACE') {
      setFvgCfg((prev) => ({
        ...prev,
        enabled: true,
        atrPeriod: Math.max(2, toNumber(params.atrPeriod, prev.atrPeriod) ?? prev.atrPeriod),
        atrMult: Math.max(0.1, toNumber(params.atrMult, prev.atrMult) ?? prev.atrMult),
        rr: Math.max(0.1, toNumber(params.rr, prev.rr) ?? prev.rr),
        maxWaitBars: Math.max(1, toNumber(params.maxWaitBars, prev.maxWaitBars) ?? prev.maxWaitBars),
        entryMode: (() => {
          const mode = String(params.entryMode || '').toLowerCase();
          if (mode === 'edge' || mode === 'mid') return mode as FvgRetraceConfig['entryMode'];
          return prev.entryMode;
        })(),
        minGapAtrMult: Math.max(0, toNumber(params.minGapAtrMult, prev.minGapAtrMult) ?? prev.minGapAtrMult)
      }));
      setRangeCfg((prev) => ({ ...prev, enabled: false }));
      setBreakCfg((prev) => ({ ...prev, enabled: false }));
      setTrendCfg((prev) => ({ ...prev, enabled: false }));
      setMeanCfg((prev) => ({ ...prev, enabled: false }));
      return;
    }

    if (strategy === 'TREND_PULLBACK') {
      setTrendCfg((prev) => ({
        ...prev,
        enabled: true,
        fastEma: Math.max(2, toNumber(params.fastEma, prev.fastEma) ?? prev.fastEma),
        slowEma: Math.max(2, toNumber(params.slowEma, prev.slowEma) ?? prev.slowEma),
        pullbackEma: (() => {
          const mode = String(params.pullbackEma || '').toLowerCase();
          if (mode === 'slow' || mode === 'fast') return mode as TrendPullbackConfig['pullbackEma'];
          return prev.pullbackEma;
        })(),
        confirmMode: (() => {
          const mode = String(params.confirmMode || '').toLowerCase();
          if (mode === 'touch' || mode === 'close') return mode as TrendPullbackConfig['confirmMode'];
          return prev.confirmMode;
        })(),
        minTrendBars: Math.max(1, toNumber(params.minTrendBars, prev.minTrendBars) ?? prev.minTrendBars),
        atrPeriod: Math.max(2, toNumber(params.atrPeriod, prev.atrPeriod) ?? prev.atrPeriod),
        atrMult: Math.max(0.1, toNumber(params.atrMult, prev.atrMult) ?? prev.atrMult),
        rr: Math.max(0.1, toNumber(params.rr, prev.rr) ?? prev.rr),
        cooldownBars: Math.max(0, toNumber(params.cooldownBars, prev.cooldownBars) ?? prev.cooldownBars)
      }));
      setRangeCfg((prev) => ({ ...prev, enabled: false }));
      setBreakCfg((prev) => ({ ...prev, enabled: false }));
      setFvgCfg((prev) => ({ ...prev, enabled: false }));
      setMeanCfg((prev) => ({ ...prev, enabled: false }));
      return;
    }

    if (strategy === 'MEAN_REVERSION') {
      setMeanCfg((prev) => ({
        ...prev,
        enabled: true,
        smaPeriod: Math.max(2, toNumber(params.smaPeriod, prev.smaPeriod) ?? prev.smaPeriod),
        atrPeriod: Math.max(2, toNumber(params.atrPeriod, prev.atrPeriod) ?? prev.atrPeriod),
        bandAtrMult: Math.max(0.1, toNumber(params.bandAtrMult, prev.bandAtrMult) ?? prev.bandAtrMult),
        stopAtrMult: Math.max(0.1, toNumber(params.stopAtrMult, prev.stopAtrMult) ?? prev.stopAtrMult),
        rr: Math.max(0.1, toNumber(params.rr, prev.rr) ?? prev.rr),
        cooldownBars: Math.max(0, toNumber(params.cooldownBars, prev.cooldownBars) ?? prev.cooldownBars),
        useRsiFilter: typeof params.useRsiFilter === 'boolean' ? params.useRsiFilter : prev.useRsiFilter,
        rsiPeriod: Math.max(2, toNumber(params.rsiPeriod, prev.rsiPeriod) ?? prev.rsiPeriod),
        rsiOversold: Math.max(1, toNumber(params.rsiOversold, prev.rsiOversold) ?? prev.rsiOversold),
        rsiOverbought: Math.max(1, toNumber(params.rsiOverbought, prev.rsiOverbought) ?? prev.rsiOverbought)
      }));
      setRangeCfg((prev) => ({ ...prev, enabled: false }));
      setBreakCfg((prev) => ({ ...prev, enabled: false }));
      setFvgCfg((prev) => ({ ...prev, enabled: false }));
      setTrendCfg((prev) => ({ ...prev, enabled: false }));
    }
  }, [resolveAndSetSymbol]);

  const applyExperimentNote = useCallback((note: ExperimentNote | null | undefined) => {
    if (!note?.recommendedParams) return;
    applyOptimization({
      strategy: note.strategy || batchStrategy,
      params: note.recommendedParams,
      symbol: note.symbol || resolvedSymbol || symbolInput,
      timeframe: note.timeframe || resolution,
      rangeDays: Number.isFinite(Number(note.rangeDays)) ? Number(note.rangeDays) : rangeDays
    });
  }, [applyOptimization, batchStrategy, rangeDays, resolution, resolvedSymbol, symbolInput]);

  const fetchExperimentNoteById = useCallback(async (noteId: string) => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.getExperimentNote) return null;
    const res = await ledger.getExperimentNote({ id: String(noteId) });
    return res?.ok ? res.note : null;
  }, []);

  const applyRegimeChampion = useCallback(async (record: { experimentNoteId?: string | null } | null) => {
    if (!record?.experimentNoteId) return;
    const note = await fetchExperimentNoteById(record.experimentNoteId);
    if (!note) {
      setResearchError('Regime champion note unavailable.');
      return;
    }
    applyExperimentNote(note);
    setResearchStatus(`Applied regime champion (${record.experimentNoteId}).`);
  }, [applyExperimentNote, fetchExperimentNoteById]);

  const promoteRegimeChampion = useCallback(async (record: { experimentNoteId?: string | null; regimeKey?: string | null } | null) => {
    setResearchError(null);
    setResearchStatus(null);
    if (!onCreateWatchProfile) {
      setResearchError('Watch profile handler unavailable.');
      return;
    }
    if (!record?.experimentNoteId) {
      setResearchError('Regime champion note unavailable.');
      return;
    }
    const note = await fetchExperimentNoteById(record.experimentNoteId);
    if (!note?.recommendedParams) {
      setResearchError('Regime champion params unavailable.');
      return;
    }
    const regimeKey = record.regimeKey ? String(record.regimeKey) : '';
    const regimeConstraint = regimeKey ? { mode: 'require' as const, keys: [regimeKey] } : null;
    await onCreateWatchProfile({
      strategy: String(note.strategy || researchSession?.strategy || '').trim() || 'RANGE_BREAKOUT',
      params: note.recommendedParams,
      symbol: note.symbol || researchSession?.symbol,
      timeframe: note.timeframe || researchSession?.timeframe,
      objectivePresetId: note.objectivePreset || researchSession?.objectivePreset || null,
      objectivePresetName: null,
      baselineRunId: note.baselineRunId || null,
      optimizerSessionId: note.round2SessionId || note.round1SessionId || null,
      regimeConstraint,
      mode: 'suggest',
      enabled: true
    });
    setResearchStatus(`Regime champion promoted (${record.experimentNoteId}).`);
  }, [fetchExperimentNoteById, onCreateWatchProfile, researchSession]);

  const applyOptimizerLoopCandidate = useCallback(async () => {
    setOptimizerLoopAppliedStatus(null);
    setOptimizerLoopApplyError(null);
    setOptimizerLoopApplyWarnings([]);
    if (!optimizerLoopCandidate) return;
    const presetMeta = DEFAULT_LOOP_PRESETS.find((preset) => preset.id === optimizerLoopPresetId);
    const objective = optimizerLoopSession?.objective || presetMeta?.objective || {};
    const testMetrics = optimizerLoopCandidate.test || ({} as any);
    const minTrades = Number.isFinite(Number(objective.minTradeCount))
      ? Math.max(1, Math.floor(Number(objective.minTradeCount)))
      : null;
    const minExpectancy = Number.isFinite(Number(objective.minExpectancy))
      ? Number(objective.minExpectancy)
      : null;
    const minEdgeMargin = Number.isFinite(Number(objective.minEdgeMargin))
      ? Number(objective.minEdgeMargin)
      : null;
    const minProfitFactor = Number.isFinite(Number(objective.minProfitFactor))
      ? Number(objective.minProfitFactor)
      : null;
    const maxDrawdown = Number.isFinite(Number(objective.maxDrawdown))
      ? Number(objective.maxDrawdown)
      : null;

    const errors: string[] = [];
    if (minTrades != null && testMetrics.tradeCount < minTrades) {
      errors.push(`Trades ${testMetrics.tradeCount} < min ${minTrades}`);
    }
    if (minExpectancy != null) {
      if (testMetrics.expectancy == null || testMetrics.expectancy < minExpectancy) {
        errors.push(`Expectancy ${formatR(testMetrics.expectancy)} < min ${minExpectancy.toFixed(2)}R`);
      }
    }
    if (minEdgeMargin != null) {
      if (testMetrics.edgeMargin == null || testMetrics.edgeMargin < minEdgeMargin) {
        errors.push(`Edge margin ${(testMetrics.edgeMargin ?? 0).toFixed(2)} < min ${minEdgeMargin.toFixed(2)}`);
      }
    }
    if (minProfitFactor != null) {
      if (testMetrics.profitFactor == null || testMetrics.profitFactor < minProfitFactor) {
        errors.push(`PF ${testMetrics.profitFactor?.toFixed(2) ?? '--'} < min ${minProfitFactor.toFixed(2)}`);
      }
    }
    if (maxDrawdown != null && testMetrics.maxDrawdown > maxDrawdown) {
      errors.push(`DD ${formatR(testMetrics.maxDrawdown)} > max ${formatR(maxDrawdown)}`);
    }

    if (errors.length > 0) {
      setOptimizerLoopApplyError(`Apply blocked: ${errors.join(' | ')}`);
      return;
    }

    const warnings: string[] = [];
    if (minTrades != null && testMetrics.tradeCount < Math.ceil(minTrades * 1.2)) {
      warnings.push('Trade count near minimum.');
    }
    if (minEdgeMargin != null && testMetrics.edgeMargin != null && testMetrics.edgeMargin < minEdgeMargin + 0.01) {
      warnings.push('Edge margin barely above minimum.');
    }
    if (minProfitFactor != null && testMetrics.profitFactor != null && testMetrics.profitFactor < minProfitFactor + 0.05) {
      warnings.push('Profit factor barely above minimum.');
    }
    const penaltyTotal =
      (Number.isFinite(Number(optimizerLoopCandidate.penalty)) ? Number(optimizerLoopCandidate.penalty) : 0) +
      (Number.isFinite(Number(optimizerLoopCandidate.stabilityPenalty)) ? Number(optimizerLoopCandidate.stabilityPenalty) : 0);
    if (penaltyTotal > 0.35) {
      warnings.push('High train/test degradation penalty.');
    }
    const diagnostics = optimizerLoopResults?.recommendedDiagnostics;
    if (diagnostics && diagnostics.losses >= 5) {
      const topHour = diagnostics.lossByHour[0];
      const topDay = diagnostics.lossByDay[0];
      if (topHour && topHour.count / diagnostics.losses > 0.4) {
        warnings.push(`Losses concentrated in hour ${topHour.hour}.`);
      }
      if (topDay && topDay.count / diagnostics.losses > 0.4) {
        warnings.push(`Losses concentrated on day ${topDay.day}.`);
      }
      if (diagnostics.worstFold && maxDrawdown != null && diagnostics.worstFold.maxDrawdown > maxDrawdown) {
        warnings.push(`Worst fold DD ${formatR(diagnostics.worstFold.maxDrawdown)} exceeded cap.`);
      }
    }
    if (warnings.length > 0) {
      setOptimizerLoopApplyWarnings(warnings);
    }

    const targetSymbol = String(resolvedSymbol || symbolInput || activeSymbol || '').trim();
    applyOptimization({
      strategy: batchStrategy,
      params: optimizerLoopCandidate.params,
      symbol: targetSymbol,
      timeframe: resolution,
      rangeDays: batchRangeDays
    });
    setOptimizerLoopAppliedStatus('Applied recommended config.');

    const ledger = (window as any)?.glass?.tradeLedger;
    if (ledger?.upsertAgentMemory && optimizerLoopSession?.sessionId) {
      let paramsHash = '';
      try {
        paramsHash = hashStringSampled(JSON.stringify(optimizerLoopCandidate.params || {}));
      } catch {
        paramsHash = '';
      }
      try {
        await ledger.upsertAgentMemory({
          key: `optimizer_apply:${optimizerLoopSession.sessionId}`,
          familyKey: `optimizer_apply:${optimizerLoopSession.sessionId}`,
          kind: 'optimizer_apply',
          symbol: targetSymbol || null,
          timeframe: resolution || null,
          summary: `Applied optimizer ${optimizerLoopSession.sessionId} ${batchStrategy}`,
          payload: {
            sessionId: optimizerLoopSession.sessionId,
            baselineRunId: optimizerLoopSession.baselineRunId || null,
            strategy: batchStrategy,
            params: optimizerLoopCandidate.params,
            paramsHash,
            objectivePresetId: optimizerLoopPresetId,
            objective,
            metrics: {
              train: optimizerLoopCandidate.train,
              test: optimizerLoopCandidate.test,
              penalty: optimizerLoopCandidate.penalty ?? null,
              stabilityPenalty: optimizerLoopCandidate.stabilityPenalty ?? null
            },
            warnings,
            appliedAtMs: Date.now()
          },
          tags: [batchStrategy, targetSymbol, resolution, 'optimizer', 'apply'].filter(Boolean)
        });
      } catch {
        // ignore ledger failures
      }
    }

    if (onCreateWatchProfile && targetSymbol && resolution) {
      try {
        await onCreateWatchProfile({
          strategy: batchStrategy,
          params: optimizerLoopCandidate.params,
          symbol: targetSymbol,
          timeframe: resolution,
          objectivePresetId: optimizerLoopPresetId || null,
          objectivePresetName: presetMeta?.name || null,
          baselineRunId: optimizerLoopSession?.baselineRunId || null,
          optimizerSessionId: optimizerLoopSession?.sessionId || null,
          mode: 'suggest',
          enabled: true
        });
      } catch {
        // ignore watch profile failures
      }
    }
  }, [
    activeSymbol,
    applyOptimization,
    batchRangeDays,
    batchStrategy,
    onCreateWatchProfile,
    optimizerLoopCandidate,
    optimizerLoopSession,
    optimizerLoopPresetId,
    optimizerLoopResults,
    resolution,
    resolvedSymbol,
    symbolInput
  ]);

  const cloneOptimizerConfig = useCallback((cfg: OptimizerConfig): OptimizerConfig => {
    try {
      return JSON.parse(JSON.stringify(cfg)) as OptimizerConfig;
    } catch {
      return {
        ...cfg,
        range: { ...cfg.range },
        fvg: { ...cfg.fvg },
        trend: { ...cfg.trend },
        mean: { ...cfg.mean }
      };
    }
  }, []);

  const normalizeOptimizerSort = useCallback((value: any, fallback: OptimizerSort) => {
    const raw = String(value || '').trim();
    const allowed: OptimizerSort[] = ['netR', 'expectancy', 'profitFactor', 'winRate', 'maxDrawdown'];
    return allowed.includes(raw as OptimizerSort) ? (raw as OptimizerSort) : fallback;
  }, []);

  const buildMergedOptimizerConfig = useCallback((incoming: any, base: OptimizerConfig) => {
    if (!incoming || typeof incoming !== 'object') return cloneOptimizerConfig(base);
    const merged = {
      ...base,
      ...incoming,
      sortBy: normalizeOptimizerSort(incoming.sortBy, base.sortBy),
      maxCombos: Number.isFinite(Number(incoming.maxCombos))
        ? Math.max(10, Math.min(5000, Math.floor(Number(incoming.maxCombos))))
        : base.maxCombos,
      topN: Number.isFinite(Number(incoming.topN))
        ? Math.max(1, Math.min(200, Math.floor(Number(incoming.topN))))
        : base.topN,
      useReplayWindow: typeof incoming.useReplayWindow === 'boolean' ? incoming.useReplayWindow : base.useReplayWindow,
      useConfluence: typeof incoming.useConfluence === 'boolean' ? incoming.useConfluence : base.useConfluence,
      range: { ...base.range, ...(incoming.range || {}) },
      fvg: { ...base.fvg, ...(incoming.fvg || {}) },
      trend: { ...base.trend, ...(incoming.trend || {}) },
      mean: { ...base.mean, ...(incoming.mean || {}) }
    };
    return cloneOptimizerConfig(merged);
  }, [cloneOptimizerConfig, normalizeOptimizerSort]);

  const applyOptimizerPresetConfig = useCallback((incoming: OptimizerConfig) => {
    if (!incoming) return;
    setOptimizerCfg((prev) => buildMergedOptimizerConfig(incoming, prev));
  }, [buildMergedOptimizerConfig]);

  const sanitizeOptimizerConfig = useCallback((incoming: any) => {
    return buildMergedOptimizerConfig(incoming, optimizerCfg);
  }, [buildMergedOptimizerConfig, optimizerCfg]);

  useEffect(() => {
    const handleConfig = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.symbol != null) {
        const nextSymbol = String(detail.symbol).trim();
        if (nextSymbol) {
          setSymbolInput(nextSymbol);
          void resolveAndSetSymbol(nextSymbol);
        }
      }
      const nextTf = detail.timeframe ?? detail.resolution;
      if (nextTf != null) {
        const normalized = normalizeResolution(String(nextTf || '').trim());
        if (normalized && RESOLUTIONS.includes(normalized)) {
          setResolution(normalized);
        }
      }
      if (detail.rangeDays != null) {
        const days = Number(detail.rangeDays);
        if (Number.isFinite(days)) {
          setRangeDays(clampRangeDays(days));
        }
      }
      if (detail.maxBars != null) {
        const next = Number(detail.maxBars);
        if (Number.isFinite(next)) {
          setMaxBars(Math.max(0, Math.min(MAX_BARS, Math.floor(next))));
        }
      }
    };

    const handleParams = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const params = detail.params && typeof detail.params === 'object' ? detail.params : null;
      if (!params) return;
      applyOptimization({
        strategy: String(detail.strategy || '').trim().toUpperCase(),
        params,
        symbol: detail.symbol != null ? String(detail.symbol) : undefined,
        timeframe: detail.timeframe != null ? String(detail.timeframe) : undefined,
        rangeDays: detail.rangeDays != null ? Number(detail.rangeDays) : undefined
      });
    };

    const handleOptimizerConfig = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const incoming = detail.config && typeof detail.config === 'object' ? detail.config : detail;
      setOptimizerCfg((prev) => buildMergedOptimizerConfig(incoming, prev));
      if (detail.presetId != null) setOptimizerPresetId(String(detail.presetId));
      if (detail.presetName != null) setOptimizerPresetName(String(detail.presetName));
    };

    const handleBatchConfig = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const incoming = detail.config && typeof detail.config === 'object' ? detail.config : detail;
      if (incoming.symbolsInput != null) setBatchSymbolsInput(String(incoming.symbolsInput));
      if (incoming.timeframesInput != null) setBatchTimeframesInput(String(incoming.timeframesInput));
      if (incoming.rangeDays != null) {
        const days = Number(incoming.rangeDays);
        if (Number.isFinite(days)) setBatchRangeDays(clampRangeDays(days));
      }
      if (incoming.maxCombos != null) {
        const combos = Number(incoming.maxCombos);
        if (Number.isFinite(combos)) setBatchMaxCombos(Math.max(1, Math.min(2000, Math.floor(combos))));
      }
      if (incoming.autoApplyCount != null) {
        const count = Number(incoming.autoApplyCount);
        if (Number.isFinite(count)) setBatchAutoApplyCount(Math.max(1, Math.min(50, Math.floor(count))));
      }
      if (incoming.strategy != null) {
        const stratRaw = String(incoming.strategy).trim().toUpperCase();
        if (stratRaw === 'FVG_RETRACE' || stratRaw === 'TREND_PULLBACK' || stratRaw === 'MEAN_REVERSION') {
          setBatchStrategy(stratRaw as BacktestOptimizationStrategy);
        } else if (stratRaw) {
          setBatchStrategy('RANGE_BREAKOUT');
        }
      }
    };

    const handleExecution = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const incoming = detail.config && typeof detail.config === 'object' ? detail.config : detail;
      setExecCfg((prev) => ({ ...prev, ...incoming }));
    };

    const handleConfluence = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const incoming = detail.config && typeof detail.config === 'object' ? detail.config : detail;
      setConfluenceCfg((prev) => ({ ...prev, ...incoming }));
    };

    const handleValidation = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const incoming = detail.config && typeof detail.config === 'object' ? detail.config : detail;
      setValidationCfg((prev) => ({ ...prev, ...incoming }));
    };

    const handleWalkForward = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const incoming = detail.config && typeof detail.config === 'object' ? detail.config : detail;
      setWalkForwardCfg((prev) => ({ ...prev, ...incoming }));
    };

    const handleReplay = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.enabled != null) setReplayEnabled(!!detail.enabled);
      if (detail.playing != null) setIsPlaying(!!detail.playing);
      if (detail.playSpeed != null && Number.isFinite(Number(detail.playSpeed))) {
        setPlaySpeed(Math.max(1, Math.min(10, Math.floor(Number(detail.playSpeed)))));
      }
      if (detail.replayIndex != null && Number.isFinite(Number(detail.replayIndex))) {
        setReplayEnabled(true);
        setReplayIndex(Math.max(0, Math.floor(Number(detail.replayIndex))));
      }
      if (detail.replayCutoffIndex != null && Number.isFinite(Number(detail.replayCutoffIndex))) {
        setReplayEnabled(true);
        setReplayIndex(Math.max(0, Math.floor(Number(detail.replayCutoffIndex))));
      }
      if (detail.stepDelta != null && Number.isFinite(Number(detail.stepDelta))) {
        const delta = Math.trunc(Number(detail.stepDelta));
        if (delta !== 0) {
          setReplayEnabled(true);
          setReplayIndex((prev) => Math.max(0, prev + delta));
        }
      }
    };

    const handleTieBreaker = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const value = String(detail.tieBreaker || detail.value || '').trim().toLowerCase();
      if (value === 'tp') setTieBreaker('tp');
      if (value === 'sl') setTieBreaker('sl');
    };

    const handleAutoSummary = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.enabled != null) setAutoSummaryEnabled(!!detail.enabled);
      if (detail.intervalMin != null && Number.isFinite(Number(detail.intervalMin))) {
        setAutoSummaryIntervalMin(Math.max(1, Math.min(240, Math.floor(Number(detail.intervalMin)))));
      }
    };

    const handleTradeSelect = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setSelectedTradeId(null);
        return;
      }
      if (detail.tradeId != null) setSelectedTradeId(String(detail.tradeId));
    };

    const handleMemoryFilters = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.agentId != null) setAgentMemoryAgentId(String(detail.agentId));
      if (detail.scope != null) setAgentMemoryScope(String(detail.scope));
      if (detail.category != null) setAgentMemoryCategory(String(detail.category));
      if (detail.subcategory != null) setAgentMemorySubcategory(String(detail.subcategory));
      if (detail.symbol != null) setAgentMemorySymbol(String(detail.symbol));
      if (detail.timeframe != null) setAgentMemoryTimeframe(String(detail.timeframe));
      if (detail.kind != null) setAgentMemoryKind(String(detail.kind));
      if (detail.limit != null && Number.isFinite(Number(detail.limit))) {
        setAgentMemoryLimit(Math.max(1, Math.min(100, Math.floor(Number(detail.limit)))));
      }
      if (detail.query != null) setAgentMemoryQuery(String(detail.query));
    };

    const handleResearchConfig = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.presetId != null) setResearchPresetId(String(detail.presetId));
      if (detail.maxExperiments != null && Number.isFinite(Number(detail.maxExperiments))) {
        setResearchMaxExperiments(Math.max(1, Math.min(50, Math.floor(Number(detail.maxExperiments)))));
      }
      if (detail.robustness != null) {
        const level = String(detail.robustness).trim().toLowerCase();
        if (level === 'lite' || level === 'standard' || level === 'strict') {
          setResearchRobustness(level);
        }
      }
      if (detail.regimeOverrides != null) setResearchRegimeOverrides(!!detail.regimeOverrides);
      if (detail.allowRegimeBrittle != null) setResearchAllowRegimeBrittle(!!detail.allowRegimeBrittle);
      if (detail.requiredRegimePassRate != null && Number.isFinite(Number(detail.requiredRegimePassRate))) {
        setResearchRequiredRegimePassRate(Math.max(0.4, Math.min(0.9, Number(detail.requiredRegimePassRate))));
      }
      if (detail.minRegimesSeen != null && Number.isFinite(Number(detail.minRegimesSeen))) {
        setResearchMinRegimesSeen(Math.max(1, Math.min(5, Math.floor(Number(detail.minRegimesSeen)))));
      }
      if (detail.criticalRegimes != null) {
        const list = Array.isArray(detail.criticalRegimes) ? detail.criticalRegimes : String(detail.criticalRegimes).split(',');
        const cleaned = list.map((entry: any) => String(entry).trim()).filter(Boolean);
        setResearchCriticalRegimes(cleaned);
      }
      if (detail.criticalRegimesExtra != null) setResearchCriticalRegimesExtra(String(detail.criticalRegimesExtra));
      if (detail.advancedOpen != null) setResearchAdvancedOpen(!!detail.advancedOpen);
    };

    window.addEventListener(GLASS_EVENT.BACKTESTER.CONFIG, handleConfig as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.PARAMS, handleParams as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.OPTIMIZER_CONFIG, handleOptimizerConfig as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.BATCH_CONFIG, handleBatchConfig as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.EXECUTION, handleExecution as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.CONFLUENCE, handleConfluence as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.VALIDATION, handleValidation as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.WALKFORWARD, handleWalkForward as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.REPLAY, handleReplay as any);
    const handleWatchlistMode = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const modeRaw = String(detail.mode || '').trim().toLowerCase();
      if (modeRaw === 'suggest' || modeRaw === 'paper' || modeRaw === 'live') {
        setWatchlistMode(modeRaw as 'suggest' | 'paper' | 'live');
      }
    };
    window.addEventListener(GLASS_EVENT.BACKTESTER.WATCHLIST_MODE, handleWatchlistMode as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.TIEBREAKER, handleTieBreaker as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.AUTO_SUMMARY, handleAutoSummary as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.TRADE_SELECT, handleTradeSelect as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.MEMORY_FILTERS, handleMemoryFilters as any);
    window.addEventListener(GLASS_EVENT.BACKTESTER.RESEARCH_CONFIG, handleResearchConfig as any);
    return () => {
      window.removeEventListener(GLASS_EVENT.BACKTESTER.CONFIG, handleConfig as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.PARAMS, handleParams as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.OPTIMIZER_CONFIG, handleOptimizerConfig as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.BATCH_CONFIG, handleBatchConfig as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.EXECUTION, handleExecution as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.CONFLUENCE, handleConfluence as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.VALIDATION, handleValidation as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.WALKFORWARD, handleWalkForward as any);
    window.removeEventListener(GLASS_EVENT.BACKTESTER.REPLAY, handleReplay as any);
    window.removeEventListener(GLASS_EVENT.BACKTESTER.WATCHLIST_MODE, handleWatchlistMode as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.TIEBREAKER, handleTieBreaker as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.AUTO_SUMMARY, handleAutoSummary as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.TRADE_SELECT, handleTradeSelect as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.MEMORY_FILTERS, handleMemoryFilters as any);
      window.removeEventListener(GLASS_EVENT.BACKTESTER.RESEARCH_CONFIG, handleResearchConfig as any);
    };
  }, [applyOptimization, buildMergedOptimizerConfig, resolveAndSetSymbol]);

  const sortPresets = useCallback((presets: OptimizerPreset[]) => {
    return [...presets].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  }, []);

  const handleSaveOptimizerPreset = useCallback((mode: 'new' | 'update') => {
    setOptimizerPresetError(null);
    setOptimizerPresetStatus(null);
    const name = optimizerPresetName.trim() || buildDefaultPresetName();
    if (!name) {
      setOptimizerPresetError('Preset name required.');
      return;
    }

    const nowMs = Date.now();
    const symbol = String(resolvedSymbol || symbolInput || '').trim() || undefined;
    const timeframe = String(resolution || '').trim() || undefined;
    const config = cloneOptimizerConfig(optimizerCfg);

    if (mode === 'update') {
      if (!optimizerPresetId) {
        setOptimizerPresetError('Select a preset to update.');
        return;
      }
      const existing = optimizerPresets.find((preset) => preset.id === optimizerPresetId);
      if (!existing) {
        setOptimizerPresetError('Preset not found.');
        return;
      }
      const updated: OptimizerPreset = {
        ...existing,
        name,
        updatedAtMs: nowMs,
        symbol,
        timeframe,
        config
      };
      setOptimizerPresets((prev) => sortPresets([updated, ...prev.filter((p) => p.id !== updated.id)]));
      setOptimizerPresetId(updated.id);
      setOptimizerPresetName(updated.name);
      setOptimizerPresetStatus('Preset updated.');
      return;
    }

    const id = `preset_${nowMs}_${Math.random().toString(16).slice(2, 8)}`;
    const created: OptimizerPreset = {
      id,
      name,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      symbol,
      timeframe,
      config
    };
    setOptimizerPresets((prev) => sortPresets([created, ...prev]));
    setOptimizerPresetId(id);
    setOptimizerPresetName(name);
    setOptimizerPresetStatus('Preset saved.');
  }, [
    buildDefaultPresetName,
    cloneOptimizerConfig,
    optimizerCfg,
    optimizerPresetId,
    optimizerPresetName,
    optimizerPresets,
    resolution,
    resolvedSymbol,
    sortPresets,
    symbolInput
  ]);

  const handleLoadOptimizerPreset = useCallback(() => {
    setOptimizerPresetError(null);
    setOptimizerPresetStatus(null);
    if (!optimizerPresetId) {
      setOptimizerPresetError('Select a preset to load.');
      return;
    }
    const preset = optimizerPresets.find((item) => item.id === optimizerPresetId);
    if (!preset) {
      setOptimizerPresetError('Preset not found.');
      return;
    }
    applyOptimizerPresetConfig(preset.config);
    setOptimizerPresetStatus('Preset loaded.');
  }, [applyOptimizerPresetConfig, optimizerPresetId, optimizerPresets]);

  const handleDeleteOptimizerPreset = useCallback(() => {
    setOptimizerPresetError(null);
    setOptimizerPresetStatus(null);
    if (!optimizerPresetId) {
      setOptimizerPresetError('Select a preset to delete.');
      return;
    }
    const preset = optimizerPresets.find((item) => item.id === optimizerPresetId);
    if (!preset) {
      setOptimizerPresetError('Preset not found.');
      return;
    }
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Delete preset "${preset.name}"?`)
      : true;
    if (!confirmed) return;
    setOptimizerPresets((prev) => prev.filter((item) => item.id !== optimizerPresetId));
    setOptimizerPresetId('');
    setOptimizerPresetName('');
    setOptimizerPresetStatus('Preset deleted.');
  }, [optimizerPresetId, optimizerPresets]);

  const saveOptimizerPresetExternal = useCallback((opts?: {
    mode?: 'new' | 'update';
    presetId?: string | null;
    name?: string | null;
    config?: OptimizerConfig | null;
    symbol?: string | null;
    timeframe?: string | null;
  }) => {
    const mode = opts?.mode === 'update' ? 'update' : 'new';
    const name = String(opts?.name || optimizerPresetName || '').trim() || buildDefaultPresetName();
    if (!name) return { ok: false, error: 'Preset name required.' };
    const nowMs = Date.now();
    const symbol = String(opts?.symbol || resolvedSymbol || symbolInput || '').trim() || undefined;
    const timeframe = String(opts?.timeframe || resolution || '').trim() || undefined;
    const config = opts?.config ? sanitizeOptimizerConfig(opts.config) : cloneOptimizerConfig(optimizerCfg);

    if (mode === 'update') {
      const presetId = String(opts?.presetId || optimizerPresetId || '').trim();
      if (!presetId) return { ok: false, error: 'Preset id required.' };
      const existing = optimizerPresets.find((preset) => preset.id === presetId);
      if (!existing) return { ok: false, error: 'Preset not found.' };
      const updated: OptimizerPreset = {
        ...existing,
        name,
        updatedAtMs: nowMs,
        symbol,
        timeframe,
        config
      };
      setOptimizerPresets((prev) => sortPresets([updated, ...prev.filter((p) => p.id !== updated.id)]));
      setOptimizerPresetId(updated.id);
      setOptimizerPresetName(updated.name);
      setOptimizerPresetStatus('Preset updated.');
      return { ok: true, preset: updated };
    }

    const id = `preset_${nowMs}_${Math.random().toString(16).slice(2, 8)}`;
    const created: OptimizerPreset = {
      id,
      name,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      symbol,
      timeframe,
      config
    };
    setOptimizerPresets((prev) => sortPresets([created, ...prev]));
    setOptimizerPresetId(id);
    setOptimizerPresetName(name);
    setOptimizerPresetStatus('Preset saved.');
    return { ok: true, preset: created };
  }, [
    buildDefaultPresetName,
    cloneOptimizerConfig,
    optimizerCfg,
    optimizerPresetId,
    optimizerPresetName,
    optimizerPresets,
    resolution,
    resolvedSymbol,
    sanitizeOptimizerConfig,
    sortPresets,
    symbolInput
  ]);

  const loadOptimizerPresetExternal = useCallback((id: string) => {
    const presetId = String(id || '').trim();
    if (!presetId) return { ok: false, error: 'Preset id required.' };
    const preset = optimizerPresets.find((item) => item.id === presetId);
    if (!preset) return { ok: false, error: 'Preset not found.' };
    applyOptimizerPresetConfig(preset.config);
    setOptimizerPresetId(preset.id);
    setOptimizerPresetName(preset.name || '');
    setOptimizerPresetStatus('Preset loaded.');
    return { ok: true, preset };
  }, [applyOptimizerPresetConfig, optimizerPresets]);

  const deleteOptimizerPresetExternal = useCallback((id: string, opts?: { confirmed?: boolean }) => {
    const presetId = String(id || '').trim();
    if (!presetId) return { ok: false, error: 'Preset id required.' };
    const preset = optimizerPresets.find((item) => item.id === presetId);
    if (!preset) return { ok: false, error: 'Preset not found.' };
    const confirmed = opts?.confirmed === true
      ? true
      : typeof window !== 'undefined'
        ? window.confirm(`Delete preset "${preset.name}"?`)
        : true;
    if (!confirmed) return { ok: false, error: 'Delete cancelled.' };
    setOptimizerPresets((prev) => prev.filter((item) => item.id !== presetId));
    if (optimizerPresetId === presetId) {
      setOptimizerPresetId('');
      setOptimizerPresetName('');
    }
    setOptimizerPresetStatus('Preset deleted.');
    return { ok: true, deletedId: presetId };
  }, [optimizerPresetId, optimizerPresets]);

  const exportOptimizerPresetsExternal = useCallback(async (opts?: { mode?: 'clipboard' | 'download' | 'return' }) => {
    const payloadBuilder = buildPresetExportPayloadRef.current;
    if (!payloadBuilder) return { ok: false, error: 'Preset export unavailable.' };
    const payload = payloadBuilder();
    const mode = opts?.mode || 'return';
    if (mode === 'return') return { ok: true, payload };
    if (mode === 'clipboard') {
      const ok = await writeClipboardText(payload);
      return ok ? { ok: true } : { ok: false, error: 'Clipboard unavailable.' };
    }
    const filename = `optimizer_presets_${new Date().toISOString().slice(0, 10)}.json`;
    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver === 'function') {
      const res = await saver({
        data: payload,
        mimeType: 'application/json',
        subdir: 'backtester-presets',
        prefix: 'optimizer_presets'
      });
      return res?.ok ? { ok: true } : { ok: false, error: res?.error ? String(res.error) : 'Save failed.' };
    }
    return { ok: false, error: 'Save unavailable.' };
  }, [writeClipboardText]);

  const importOptimizerPresetsExternal = useCallback((rawText: string) => {
    const importer = importOptimizerPresetsFromTextRef.current;
    if (!importer) return { ok: false, error: 'Preset import unavailable.' };
    return importer(rawText);
  }, []);

  const buildPresetExportPayload = useCallback(() => {
    return JSON.stringify(
      {
        schemaVersion: 1,
        exportedAtMs: Date.now(),
        presets: optimizerPresets
      },
      null,
      2
    );
  }, [optimizerPresets]);
  buildPresetExportPayloadRef.current = buildPresetExportPayload;

  const handleCopyOptimizerPresets = useCallback(async () => {
    setOptimizerPresetError(null);
    setOptimizerPresetStatus(null);
    if (optimizerPresets.length === 0) {
      setOptimizerPresetError('No presets to export.');
      return;
    }
    const payload = buildPresetExportPayload();
    const ok = await writeClipboardText(payload);
    if (!ok) {
      setOptimizerPresetError('Clipboard unavailable.');
      return;
    }
    setOptimizerPresetStatus('Preset JSON copied.');
  }, [buildPresetExportPayload, optimizerPresets.length, writeClipboardText]);

  const handleDownloadOptimizerPresets = useCallback(async () => {
    setOptimizerPresetError(null);
    setOptimizerPresetStatus(null);
    if (optimizerPresets.length === 0) {
      setOptimizerPresetError('No presets to export.');
      return;
    }
    const payload = buildPresetExportPayload();
    const filename = `optimizer_presets_${new Date().toISOString().slice(0, 10)}.json`;
    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver === 'function') {
      const res = await saver({
        data: payload,
        mimeType: 'application/json',
        subdir: 'backtester-presets',
        prefix: 'optimizer_presets'
      });
      if (res?.ok) {
        setOptimizerPresetStatus(`Preset JSON saved (${res.filename || filename}).`);
      } else {
        setOptimizerPresetError(res?.error ? String(res.error) : 'Save failed.');
      }
      return;
    }

    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setOptimizerPresetStatus('Preset JSON downloaded.');
    } catch {
      setOptimizerPresetError('Download failed.');
    }
  }, [buildPresetExportPayload, optimizerPresets.length]);

  const importOptimizerPresetsFromText = useCallback((rawText: string) => {
    if (!rawText || !rawText.trim()) {
      return { ok: false, error: 'Import file is empty.' };
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { ok: false, error: 'Invalid JSON file.' };
    }

    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.presets) ? parsed.presets : null;
    if (!list || list.length === 0) {
      return { ok: false, error: 'No presets found in file.' };
    }

    const existingNames = new Set(optimizerPresets.map((preset) => preset.name.toLowerCase()));
    const existingIds = new Set(optimizerPresets.map((preset) => preset.id));

    const makeUniqueName = (name: string) => {
      let candidate = name.trim() || 'Imported Preset';
      let idx = 2;
      while (existingNames.has(candidate.toLowerCase())) {
        candidate = `${name} (${idx})`;
        idx += 1;
      }
      existingNames.add(candidate.toLowerCase());
      return candidate;
    };

    const makeUniqueId = (fallbackId?: string) => {
      const base = fallbackId ? String(fallbackId) : '';
      if (base && !existingIds.has(base)) {
        existingIds.add(base);
        return base;
      }
      let id = '';
      do {
        id = `preset_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      } while (existingIds.has(id));
      existingIds.add(id);
      return id;
    };

    const nowMs = Date.now();
    const imported: OptimizerPreset[] = [];

    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      if (!entry.config || typeof entry.config !== 'object') continue;
      const baseName = String(entry.name || entry.id || 'Imported Preset').trim() || 'Imported Preset';
      const name = makeUniqueName(baseName);
      const id = makeUniqueId(entry.id);
      const createdAtMs = Number(entry.createdAtMs) || nowMs;
      const updatedAtMs = Number(entry.updatedAtMs) || createdAtMs || nowMs;
      const symbol = entry.symbol ? String(entry.symbol).trim() : undefined;
      const timeframe = entry.timeframe ? String(entry.timeframe).trim() : undefined;
      const config = sanitizeOptimizerConfig(entry.config);

      imported.push({
        id,
        name,
        createdAtMs,
        updatedAtMs,
        symbol,
        timeframe,
        config
      });
    }

    if (imported.length === 0) {
      return { ok: false, error: 'No valid presets found in file.' };
    }

    setOptimizerPresets((prev) => sortPresets([...imported, ...prev]));
    setOptimizerPresetId(imported[0].id);
    setOptimizerPresetName(imported[0].name);
    return { ok: true, imported: imported.length };
  }, [optimizerPresets, sanitizeOptimizerConfig, sortPresets]);
  importOptimizerPresetsFromTextRef.current = importOptimizerPresetsFromText;

  const handleImportOptimizerPresets = useCallback((rawText: string) => {
    setOptimizerPresetError(null);
    setOptimizerPresetStatus(null);
    const result = importOptimizerPresetsFromText(rawText);
    if (!result.ok) {
      setOptimizerPresetError(result.error || 'Import failed.');
      return;
    }
    setOptimizerPresetStatus(`Imported ${result.imported} preset${result.imported === 1 ? '' : 's'}.`);
  }, [importOptimizerPresetsFromText]);

  const handlePresetFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      handleImportOptimizerPresets(text);
    };
    reader.onerror = () => {
      setOptimizerPresetError('Failed to read file.');
    };
    reader.readAsText(file);
  }, [handleImportOptimizerPresets]);

  const sortBatchPresets = useCallback((presets: BatchPreset[]) => {
    return [...presets].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  }, []);

  const applyBatchPresetConfig = useCallback((preset: BatchPreset) => {
    if (!preset?.config) return;
    setBatchSymbolsInput(String(preset.config.symbolsInput || '').trim());
    setBatchTimeframesInput(String(preset.config.timeframesInput || '').trim());
    const strategyRaw = String(preset.config.strategy || 'RANGE_BREAKOUT').toUpperCase();
    const strategy =
      strategyRaw === 'BREAK_RETEST' || strategyRaw === 'FVG_RETRACE' || strategyRaw === 'TREND_PULLBACK' || strategyRaw === 'MEAN_REVERSION'
        ? (strategyRaw as BacktestOptimizationStrategy)
        : 'RANGE_BREAKOUT';
    setBatchStrategy(strategy);
    const rangeDaysValue = Number(preset.config.rangeDays);
    setBatchRangeDays(Number.isFinite(rangeDaysValue) ? clampRangeDays(rangeDaysValue) : DEFAULT_RANGE_DAYS);
    const maxCombosValue = Number(preset.config.maxCombos);
    setBatchMaxCombos(Number.isFinite(maxCombosValue) ? Math.max(1, Math.min(2000, Math.floor(maxCombosValue))) : 200);
  }, []);

  const handleSaveBatchPreset = useCallback((mode: 'new' | 'update') => {
    setBatchPresetError(null);
    setBatchPresetStatus(null);
    const name = batchPresetName.trim() || buildDefaultBatchPresetName();
    if (!name) {
      setBatchPresetError('Preset name required.');
      return;
    }

    const nowMs = Date.now();
    const config = {
      symbolsInput: batchSymbolsInput.trim(),
      timeframesInput: batchTimeframesInput.trim(),
      strategy: batchStrategy,
      rangeDays: clampRangeDays(Number(batchRangeDays) || DEFAULT_RANGE_DAYS),
      maxCombos: Math.max(1, Math.min(2000, Math.floor(Number(batchMaxCombos) || 200)))
    };

    if (mode === 'update') {
      if (!batchPresetId) {
        setBatchPresetError('Select a preset to update.');
        return;
      }
      const existing = batchPresets.find((preset) => preset.id === batchPresetId);
      if (!existing) {
        setBatchPresetError('Preset not found.');
        return;
      }
      const updated: BatchPreset = {
        ...existing,
        name,
        updatedAtMs: nowMs,
        config
      };
      setBatchPresets((prev) => sortBatchPresets([updated, ...prev.filter((p) => p.id !== updated.id)]));
      setBatchPresetId(updated.id);
      setBatchPresetName(updated.name);
      setBatchPresetStatus('Batch preset updated.');
      return;
    }

    const id = `batch_${nowMs}_${Math.random().toString(16).slice(2, 8)}`;
    const created: BatchPreset = {
      id,
      name,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      config
    };
    setBatchPresets((prev) => sortBatchPresets([created, ...prev]));
    setBatchPresetId(id);
    setBatchPresetName(name);
    setBatchPresetStatus('Batch preset saved.');
  }, [batchMaxCombos, batchPresetId, batchPresetName, batchPresets, batchRangeDays, batchStrategy, batchSymbolsInput, batchTimeframesInput, buildDefaultBatchPresetName, sortBatchPresets]);

  const handleLoadBatchPreset = useCallback(() => {
    setBatchPresetError(null);
    setBatchPresetStatus(null);
    if (!batchPresetId) {
      setBatchPresetError('Select a preset to load.');
      return;
    }
    const preset = batchPresets.find((item) => item.id === batchPresetId);
    if (!preset) {
      setBatchPresetError('Preset not found.');
      return;
    }
    applyBatchPresetConfig(preset);
    setBatchPresetStatus('Batch preset loaded.');
  }, [applyBatchPresetConfig, batchPresetId, batchPresets]);

  const handleDeleteBatchPreset = useCallback(() => {
    setBatchPresetError(null);
    setBatchPresetStatus(null);
    if (!batchPresetId) {
      setBatchPresetError('Select a preset to delete.');
      return;
    }
    const preset = batchPresets.find((item) => item.id === batchPresetId);
    if (!preset) {
      setBatchPresetError('Preset not found.');
      return;
    }
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Delete batch preset "${preset.name}"?`)
      : true;
    if (!confirmed) return;
    setBatchPresets((prev) => prev.filter((item) => item.id !== batchPresetId));
    setBatchPresetId('');
    setBatchPresetName('');
    setBatchPresetStatus('Batch preset deleted.');
  }, [batchPresetId, batchPresets]);

  const saveBatchPresetExternal = useCallback((opts?: {
    mode?: 'new' | 'update';
    presetId?: string | null;
    name?: string | null;
    config?: BatchPreset['config'] | null;
  }) => {
    const mode = opts?.mode === 'update' ? 'update' : 'new';
    const name = String(opts?.name || batchPresetName || '').trim() || buildDefaultBatchPresetName();
    if (!name) return { ok: false, error: 'Preset name required.' };

    const nowMs = Date.now();
    const config = opts?.config && typeof opts.config === 'object'
      ? {
          symbolsInput: String(opts.config.symbolsInput || '').trim(),
          timeframesInput: String(opts.config.timeframesInput || '').trim(),
          strategy: opts.config.strategy || batchStrategy,
          rangeDays: Math.max(1, Math.floor(Number(opts.config.rangeDays) || DEFAULT_RANGE_DAYS)),
          maxCombos: Math.max(1, Math.min(2000, Math.floor(Number(opts.config.maxCombos) || 200)))
        }
      : {
          symbolsInput: batchSymbolsInput.trim(),
          timeframesInput: batchTimeframesInput.trim(),
          strategy: batchStrategy,
          rangeDays: clampRangeDays(Number(batchRangeDays) || DEFAULT_RANGE_DAYS),
          maxCombos: Math.max(1, Math.min(2000, Math.floor(Number(batchMaxCombos) || 200)))
        };

    if (mode === 'update') {
      const presetId = String(opts?.presetId || batchPresetId || '').trim();
      if (!presetId) return { ok: false, error: 'Preset id required.' };
      const existing = batchPresets.find((preset) => preset.id === presetId);
      if (!existing) return { ok: false, error: 'Preset not found.' };
      const updated: BatchPreset = {
        ...existing,
        name,
        updatedAtMs: nowMs,
        config
      };
      setBatchPresets((prev) => sortBatchPresets([updated, ...prev.filter((p) => p.id !== updated.id)]));
      setBatchPresetId(updated.id);
      setBatchPresetName(updated.name);
      setBatchPresetStatus('Batch preset updated.');
      return { ok: true, preset: updated };
    }

    const id = `batch_${nowMs}_${Math.random().toString(16).slice(2, 8)}`;
    const created: BatchPreset = {
      id,
      name,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      config
    };
    setBatchPresets((prev) => sortBatchPresets([created, ...prev]));
    setBatchPresetId(id);
    setBatchPresetName(name);
    setBatchPresetStatus('Batch preset saved.');
    return { ok: true, preset: created };
  }, [
    batchMaxCombos,
    batchPresetId,
    batchPresetName,
    batchPresets,
    batchRangeDays,
    batchStrategy,
    batchSymbolsInput,
    batchTimeframesInput,
    buildDefaultBatchPresetName,
    sortBatchPresets
  ]);

  const loadBatchPresetExternal = useCallback((id: string) => {
    const presetId = String(id || '').trim();
    if (!presetId) return { ok: false, error: 'Preset id required.' };
    const preset = batchPresets.find((item) => item.id === presetId);
    if (!preset) return { ok: false, error: 'Preset not found.' };
    applyBatchPresetConfig(preset);
    setBatchPresetId(preset.id);
    setBatchPresetName(preset.name || '');
    setBatchPresetStatus('Batch preset loaded.');
    return { ok: true, preset };
  }, [applyBatchPresetConfig, batchPresets]);

  const deleteBatchPresetExternal = useCallback((id: string, opts?: { confirmed?: boolean }) => {
    const presetId = String(id || '').trim();
    if (!presetId) return { ok: false, error: 'Preset id required.' };
    const preset = batchPresets.find((item) => item.id === presetId);
    if (!preset) return { ok: false, error: 'Preset not found.' };
    const confirmed = opts?.confirmed === true
      ? true
      : typeof window !== 'undefined'
        ? window.confirm(`Delete batch preset "${preset.name}"?`)
        : true;
    if (!confirmed) return { ok: false, error: 'Delete cancelled.' };
    setBatchPresets((prev) => prev.filter((item) => item.id !== presetId));
    if (batchPresetId === presetId) {
      setBatchPresetId('');
      setBatchPresetName('');
    }
    setBatchPresetStatus('Batch preset deleted.');
    return { ok: true, deletedId: presetId };
  }, [batchPresetId, batchPresets]);

  const runBatchOptimizationExternal = useCallback((opts?: { config?: BatchPreset['config'] | null }) => {
    if (opts?.config) {
      const config = opts.config;
      setBatchSymbolsInput(String(config.symbolsInput || '').trim());
      setBatchTimeframesInput(String(config.timeframesInput || '').trim());
      const strategyRaw = String(config.strategy || batchStrategy).toUpperCase();
      const strategy =
        strategyRaw === 'BREAK_RETEST' || strategyRaw === 'FVG_RETRACE' || strategyRaw === 'TREND_PULLBACK' || strategyRaw === 'MEAN_REVERSION'
          ? (strategyRaw as BacktestOptimizationStrategy)
          : 'RANGE_BREAKOUT';
      setBatchStrategy(strategy);
      const rangeDaysValue = Number(config.rangeDays);
      setBatchRangeDays(Number.isFinite(rangeDaysValue) ? clampRangeDays(rangeDaysValue) : DEFAULT_RANGE_DAYS);
      const maxCombosValue = Number(config.maxCombos);
      setBatchMaxCombos(Number.isFinite(maxCombosValue) ? Math.max(1, Math.min(2000, Math.floor(maxCombosValue))) : 200);
    }
    const runBatch = runBatchOptimizationRef.current;
    if (runBatch) void runBatch();
  }, [batchStrategy]);

  const formatBatchParams = useCallback((strategy: BacktestOptimizationStrategy, params: Record<string, any>) => {
    const order =
      strategy === 'BREAK_RETEST'
        ? ['lookbackBars', 'atrPeriod', 'atrMult', 'rr', 'cooldownBars', 'breakoutMode', 'bufferAtrMult', 'retestBars', 'retestBufferAtrMult', 'retestConfirm']
        : strategy === 'FVG_RETRACE'
        ? ['atrPeriod', 'atrMult', 'rr', 'maxWaitBars', 'entryMode', 'minGapAtrMult']
        : strategy === 'TREND_PULLBACK'
          ? ['fastEma', 'slowEma', 'pullbackEma', 'confirmMode', 'minTrendBars', 'atrPeriod', 'atrMult', 'rr', 'cooldownBars']
          : strategy === 'MEAN_REVERSION'
            ? ['smaPeriod', 'atrPeriod', 'bandAtrMult', 'stopAtrMult', 'rr', 'cooldownBars', 'useRsiFilter', 'rsiPeriod', 'rsiOversold', 'rsiOverbought']
            : ['lookbackBars', 'atrPeriod', 'atrMult', 'rr', 'cooldownBars', 'breakoutMode', 'bufferAtrMult'];
    const entries = Object.entries(params || {})
      .filter(([_, value]) => value != null)
      .sort((a, b) => {
        const aIdx = order.indexOf(a[0]);
        const bIdx = order.indexOf(b[0]);
        if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      })
      .map(([key, value]) => `${key}:${String(value)}`);
    return entries.join(' | ');
  }, []);

  const formatLoopParams = useCallback((params: Record<string, any> | null | undefined) => {
    if (!params) return '--';
    const entries = Object.entries(params)
      .filter(([_, value]) => value != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 10)
      .map(([key, value]) => `${key}:${String(value)}`);
    return entries.length ? entries.join(' | ') : '--';
  }, []);

  const formatEdgeMargin = useCallback((value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return '--';
    return `${(value * 100).toFixed(1)}%`;
  }, []);

  const formatLoopDiagnostics = useCallback((diag: TradeDiagnostics | null | undefined) => {
    if (!diag) return '--';
    const winStreak = diag.winStreaks[0]
      ? `${diag.winStreaks[0].length}x(${diag.winStreaks[0].count})`
      : '--';
    const lossStreak = diag.lossStreaks[0]
      ? `${diag.lossStreaks[0].length}x(${diag.lossStreaks[0].count})`
      : '--';
    const lossHour = diag.lossByHour[0] ? `H${diag.lossByHour[0].hour}(${diag.lossByHour[0].count})` : '--';
    const lossDay = diag.lossByDay[0] ? `D${diag.lossByDay[0].day}(${diag.lossByDay[0].count})` : '--';
    const payoff = diag.payoffRatio != null && Number.isFinite(diag.payoffRatio) ? diag.payoffRatio.toFixed(2) : '--';
    const worstFold = diag.worstFold
      ? ` | Worst fold ${diag.worstFold.index} DD ${formatR(diag.worstFold.maxDrawdown)}`
      : '';
    return `Streaks W ${winStreak} / L ${lossStreak} | Loss hour ${lossHour} | Loss day ${lossDay} | Payoff ${payoff}${worstFold}`;
  }, []);

  const buildBatchCsvPayload = useCallback(() => {
    if (batchResults.length === 0) {
      return { ok: false, error: 'No batch results to export.' };
    }
    const header = [
      'symbol',
      'timeframe',
      'strategy',
      'rangeDays',
      'bars',
      'combosTested',
      'netR',
      'winRate',
      'profitFactor',
      'trades',
      'params',
      'error'
    ];
    const escapeCsv = (value: any) => {
      const raw = value == null ? '' : String(value);
      if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
        return `"${raw.replace(/\"/g, '""')}"`;
      }
      return raw;
    };

    const rows = batchResults.map((row) => {
      const result = row.result;
      if (!result.ok) {
        return [
          row.symbol,
          row.timeframe,
          result.strategy,
          result.rangeDays,
          result.bars,
          result.combosTested,
          '',
          '',
          '',
          '',
          '',
          result.error || 'Failed'
        ];
      }
      const top = result.bestConfig;
      return [
        result.symbol,
        result.timeframe,
        result.strategy,
        result.rangeDays,
        result.bars,
        result.combosTested,
        top?.performance?.netR ?? '',
        top?.stats?.winRate ?? '',
        top?.stats?.profitFactor ?? '',
        top?.stats?.total ?? top?.stats?.closed ?? '',
        top ? formatBatchParams(result.strategy, top.params) : '',
        ''
      ];
    });

    const lines = [header.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))];
    return { ok: true, payload: lines.join('\n') };
  }, [batchResults, formatBatchParams]);

  const buildBatchJsonPayload = useCallback(() => {
    if (batchResults.length === 0) {
      return { ok: false, error: 'No batch results to export.' };
    }
    const payload = JSON.stringify(
      {
        schemaVersion: 1,
        exportedAtMs: Date.now(),
        batchConfig: {
          symbolsInput: batchSymbolsInput,
          timeframesInput: batchTimeframesInput,
          strategy: batchStrategy,
          rangeDays: batchRangeDays,
          maxCombos: batchMaxCombos
        },
        summary: batchSummary,
        results: batchResults.map((row) => ({
          symbol: row.symbol,
          timeframe: row.timeframe,
          result: row.result
        }))
      },
      null,
      2
    );
    return { ok: true, payload };
  }, [batchMaxCombos, batchRangeDays, batchResults, batchStrategy, batchSummary, batchSymbolsInput, batchTimeframesInput]);

  const handleExportBatchCsv = useCallback(async () => {
    const built = buildBatchCsvPayload();
    if (!built.ok || !built.payload) {
      setBatchError(built.error || 'No batch results to export.');
      return;
    }
    const payload = built.payload;
    const filename = `batch_results_${new Date().toISOString().slice(0, 10)}.csv`;

    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver === 'function') {
      const res = await saver({
        data: payload,
        mimeType: 'text/csv',
        subdir: 'backtester-batch',
        prefix: 'batch_results'
      });
      if (res?.ok) {
        setBatchPresetStatus(`CSV saved (${res.filename || filename}).`);
      } else {
        setBatchError(res?.error ? String(res.error) : 'CSV save failed.');
      }
      return;
    }

    try {
      const blob = new Blob([payload], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBatchPresetStatus('CSV downloaded.');
    } catch {
      setBatchError('CSV export failed.');
    }
  }, [buildBatchCsvPayload]);

  const handleExportBatchJson = useCallback(async () => {
    const built = buildBatchJsonPayload();
    if (!built.ok || !built.payload) {
      setBatchError(built.error || 'No batch results to export.');
      return;
    }
    const payload = built.payload;
    const filename = `batch_results_${new Date().toISOString().slice(0, 10)}.json`;
    const saver = (window as any)?.glass?.saveUserFile;
    if (typeof saver === 'function') {
      const res = await saver({
        data: payload,
        mimeType: 'application/json',
        subdir: 'backtester-batch',
        prefix: 'batch_results'
      });
      if (res?.ok) {
        setBatchPresetStatus(`JSON saved (${res.filename || filename}).`);
      } else {
        setBatchError(res?.error ? String(res.error) : 'JSON save failed.');
      }
      return;
    }
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBatchPresetStatus('JSON downloaded.');
    } catch {
      setBatchError('JSON export failed.');
    }
  }, [buildBatchJsonPayload]);

  const exportBatchResultsExternal = useCallback(
    async (opts?: { format?: 'csv' | 'json'; mode?: 'clipboard' | 'download' | 'return' }) => {
      const format = opts?.format === 'json' ? 'json' : 'csv';
      const mode = opts?.mode || 'return';
      const built = format === 'json' ? buildBatchJsonPayload() : buildBatchCsvPayload();
      if (!built.ok || !built.payload) return { ok: false, error: built.error || 'No batch results to export.' };
      const payload = built.payload;
      if (mode === 'return') return { ok: true, payload };
      if (mode === 'clipboard') {
        const ok = await writeClipboardText(payload);
        return ok ? { ok: true } : { ok: false, error: 'Clipboard unavailable.' };
      }
      const filenameBase = `batch_results_${new Date().toISOString().slice(0, 10)}`;
      const filename = format === 'json' ? `${filenameBase}.json` : `${filenameBase}.csv`;
      const saver = (window as any)?.glass?.saveUserFile;
      if (typeof saver !== 'function') return { ok: false, error: 'Save unavailable.' };
      const res = await saver({
        data: payload,
        mimeType: format === 'json' ? 'application/json' : 'text/csv',
        subdir: 'backtester-batch',
        prefix: 'batch_results'
      });
      if (res?.ok) return { ok: true };
      return { ok: false, error: res?.error ? String(res.error) : `Save failed (${filename}).` };
    },
    [buildBatchCsvPayload, buildBatchJsonPayload, writeClipboardText]
  );

  const stopBatchAutoApply = useCallback(() => {
    if (batchAutoApplyTimerRef.current) {
      window.clearTimeout(batchAutoApplyTimerRef.current);
      batchAutoApplyTimerRef.current = null;
    }
    batchAutoApplyQueueRef.current = [];
    batchAutoApplyIndexRef.current = 0;
    setBatchAutoApplyRunning(false);
    setBatchAutoApplyStatus('Auto-apply stopped.');
  }, []);

  const runNextBatchAutoApply = useCallback(() => {
    const queue = batchAutoApplyQueueRef.current;
    const idx = batchAutoApplyIndexRef.current;
    if (!queue.length || idx >= queue.length) {
      setBatchAutoApplyRunning(false);
      setBatchAutoApplyStatus('Auto-apply complete.');
      return;
    }
    const row = queue[idx];
    const result = row.result;
    const top = result.ok ? result.bestConfig : null;
    if (top) {
      applyOptimization({
        strategy: result.strategy,
        params: top.params,
        symbol: result.symbol,
        timeframe: result.timeframe,
        rangeDays: result.rangeDays
      });
    }
    const nextIndex = idx + 1;
    batchAutoApplyIndexRef.current = nextIndex;
    setBatchAutoApplyStatus(`Auto-apply ${Math.min(nextIndex, queue.length)}/${queue.length}: ${result.symbol} ${result.timeframe}`);
    batchAutoApplyTimerRef.current = window.setTimeout(() => {
      runNextBatchAutoApply();
    }, 1200);
  }, [applyOptimization]);

  const startBatchAutoApply = useCallback(() => {
    setBatchPresetError(null);
    setBatchPresetStatus(null);
    setBatchError(null);
    if (batchResults.length === 0) {
      setBatchError('No batch results to apply.');
      return;
    }
    const okRows = batchResults.filter((row) => row.result.ok && row.result.bestConfig);
    if (okRows.length === 0) {
      setBatchError('No successful batch results to apply.');
      return;
    }
    const sorted = [...okRows].sort((a, b) => {
      const aNet = a.result.bestConfig?.performance?.netR ?? -Infinity;
      const bNet = b.result.bestConfig?.performance?.netR ?? -Infinity;
      return bNet - aNet;
    });
    const count = Math.max(1, Math.min(okRows.length, Math.floor(Number(batchAutoApplyCount) || 1)));
    batchAutoApplyQueueRef.current = sorted.slice(0, count);
    batchAutoApplyIndexRef.current = 0;
    setBatchAutoApplyRunning(true);
    setBatchAutoApplyStatus(`Auto-applying top ${count}...`);
    runNextBatchAutoApply();
  }, [batchAutoApplyCount, batchResults, runNextBatchAutoApply]);

  const runBatchOptimization = useCallback(async () => {
    if (batchRunning) return;
    if (batchAutoApplyRunning) {
      stopBatchAutoApply();
    }
    setBatchError(null);
    setBatchSummary(null);
    setBatchProgressLabel('');
    setBatchProgressPct(null);

    const symbols = parseBatchList(batchSymbolsInput);
    if (symbols.length === 0) {
      setBatchError('Enter at least one symbol.');
      return;
    }
    const timeframesRaw = parseBatchList(batchTimeframesInput);
    const timeframes = timeframesRaw.length > 0
      ? timeframesRaw.map((tf) => normalizeResolution(tf)).filter(Boolean)
      : [resolution];
    if (timeframes.length === 0) {
      setBatchError('Enter at least one timeframe.');
      return;
    }

    const rangeDaysValue = clampRangeDays(Number(batchRangeDays) || DEFAULT_RANGE_DAYS);
    const maxCombosValue = Math.max(1, Math.min(2000, Math.floor(Number(batchMaxCombos) || 200)));
    const paramGrid = buildBatchParamGrid(batchStrategy);

    setBatchRunning(true);
    setBatchResults([]);
    batchCancelRef.current = false;
    const startedAt = Date.now();
    const totalRuns = symbols.length * timeframes.length;
    let completedRuns = 0;

    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        if (batchCancelRef.current) break;
        completedRuns += 1;
        const runLabel = `Run ${completedRuns}/${totalRuns}: ${symbol} ${timeframe}`;
        setBatchProgressLabel(runLabel);

        let result: BacktestOptimizationResult;
        const history = await loadBacktestOptimizationHistory({
          symbol,
          strategy: batchStrategy,
          timeframe,
          rangeDays: rangeDaysValue,
          maxCombos: maxCombosValue,
          paramGrid
        });

        if (!history.ok) {
          result = {
            ok: false,
            schemaVersion: 1,
            runId: history.runId,
            symbol,
            strategy: batchStrategy,
            timeframe,
            rangeDays: rangeDaysValue,
            bars: 0,
            combosTested: 0,
            combosRequested: 0,
            truncated: false,
            ranAtMs: history.startedAtMs,
            elapsedMs: Date.now() - history.startedAtMs,
            error: history.error || 'Backtest optimization failed.'
          };
        } else {
          try {
            result = await runBacktestOptimizationWorker(
              {
                request: history.request || {
                  symbol,
                  strategy: batchStrategy,
                  timeframe,
                  rangeDays: rangeDaysValue,
                  maxCombos: maxCombosValue,
                  paramGrid
                },
                bars: history.bars,
                history: history.history,
                runId: history.runId,
                startedAtMs: history.startedAtMs
              },
              {
                shouldCancel: () => batchCancelRef.current,
                onProgress: (progress) => {
                  if (progress.total <= 0) return;
                  const pct = Math.min(1, Math.max(0, progress.done / progress.total));
                  const overall = totalRuns > 0 ? (completedRuns - 1 + pct) / totalRuns : pct;
                  setBatchProgressPct(Math.round(overall * 100));
                  setBatchProgressLabel(`${runLabel} | ${progress.done}/${progress.total} combos`);
                }
              }
            );
          } catch {
            result = await runBacktestOptimization(
              {
                symbol,
                strategy: batchStrategy,
                timeframe,
                rangeDays: rangeDaysValue,
                maxCombos: maxCombosValue,
                paramGrid
              },
              {
                shouldCancel: () => batchCancelRef.current,
                onProgress: (progress) => {
                  if (progress.total <= 0) return;
                  const pct = Math.min(1, Math.max(0, progress.done / progress.total));
                  const overall = totalRuns > 0 ? (completedRuns - 1 + pct) / totalRuns : pct;
                  setBatchProgressPct(Math.round(overall * 100));
                  setBatchProgressLabel(`${runLabel} | ${progress.done}/${progress.total} combos`);
                }
              }
            );
          }
        }

        setBatchResults((prev) => [
          ...prev,
          {
            key: `${symbol}_${timeframe}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            symbol,
            timeframe,
            result
          }
        ]);
        if (result?.ok && result.bestConfig) {
          void Promise.resolve(onPersistOptimization?.(result, { source: 'backtester' })).catch(() => {});
        }

        if (batchCancelRef.current) break;
      }
      if (batchCancelRef.current) break;
    }

    setBatchRunning(false);
    setBatchProgressPct(null);
    setBatchProgressLabel(batchCancelRef.current ? 'Batch cancelled.' : 'Batch complete.');
    setBatchSummary({
      totalRuns,
      completedRuns,
      durationMs: Date.now() - startedAt,
      cancelled: batchCancelRef.current
    });
  }, [batchAutoApplyRunning, batchMaxCombos, batchRangeDays, batchRunning, batchStrategy, batchSymbolsInput, batchTimeframesInput, buildBatchParamGrid, onPersistOptimization, parseBatchList, resolution, stopBatchAutoApply]);
  runBatchOptimizationRef.current = runBatchOptimization;

  const cancelBatchOptimization = useCallback(() => {
    if (!batchRunning) return;
    batchCancelRef.current = true;
    setBatchProgressLabel('Cancelling batch...');
  }, [batchRunning]);

  const clearBatchResults = useCallback(() => {
    if (batchRunning) return;
    if (batchAutoApplyRunning) {
      stopBatchAutoApply();
    }
    setBatchResults([]);
    setBatchError(null);
    setBatchSummary(null);
    setBatchProgressLabel('');
    setBatchProgressPct(null);
    setBatchAutoApplyStatus(null);
  }, [batchAutoApplyRunning, batchRunning, stopBatchAutoApply]);
  const seedOptimizerFromCurrent = useCallback(() => {
    setOptimizerCfg((prev) => ({
      ...prev,
      range: {
        ...prev.range,
        enabled: rangeCfg.enabled,
        lookbackBars: String(rangeCfg.lookbackBars),
        atrMult: String(rangeCfg.atrMult),
        rr: String(rangeCfg.rr),
        breakoutMode: String(rangeCfg.breakoutMode),
        bufferAtrMult: String(rangeCfg.bufferAtrMult)
      },
      breakRetest: {
        ...prev.breakRetest,
        enabled: breakCfg.enabled,
        lookbackBars: String(breakCfg.lookbackBars),
        atrMult: String(breakCfg.atrMult),
        rr: String(breakCfg.rr),
        breakoutMode: String(breakCfg.breakoutMode),
        bufferAtrMult: String(breakCfg.bufferAtrMult),
        retestBars: String(breakCfg.retestBars),
        retestBufferAtrMult: String(breakCfg.retestBufferAtrMult),
        retestConfirm: String(breakCfg.retestConfirm)
      },
      fvg: {
        ...prev.fvg,
        enabled: fvgCfg.enabled,
        atrMult: String(fvgCfg.atrMult),
        rr: String(fvgCfg.rr),
        maxWaitBars: String(fvgCfg.maxWaitBars),
        entryMode: String(fvgCfg.entryMode),
        minGapAtrMult: String(fvgCfg.minGapAtrMult)
      },
      trend: {
        ...prev.trend,
        enabled: trendCfg.enabled,
        fastEma: String(trendCfg.fastEma),
        slowEma: String(trendCfg.slowEma),
        atrMult: String(trendCfg.atrMult),
        rr: String(trendCfg.rr),
        confirmMode: String(trendCfg.confirmMode),
        pullbackEma: String(trendCfg.pullbackEma),
        minTrendBars: String(trendCfg.minTrendBars)
      },
      mean: {
        ...prev.mean,
        enabled: meanCfg.enabled,
        smaPeriod: String(meanCfg.smaPeriod),
        bandAtrMult: String(meanCfg.bandAtrMult),
        stopAtrMult: String(meanCfg.stopAtrMult),
        rr: String(meanCfg.rr),
        useRsiFilter: String(meanCfg.useRsiFilter),
        rsiPeriod: String(meanCfg.rsiPeriod)
      }
    }));
  }, [breakCfg, fvgCfg, meanCfg, rangeCfg, trendCfg]);

  const autoApplyTopOptimizer = useCallback(() => {
    if (optimizerResults.length === 0) {
      setOptimizerError('Run the optimizer to generate results first.');
      return;
    }
    const top = optimizerResults[0];
    const label = `${top.setup} | Net ${formatR(top.netR)} | WR ${formatPercent(top.winRate)}`;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Apply top optimizer result?\n${label}`)
      : true;
    if (!confirmed) return;
    applyOptimizerResult(top);
  }, [applyOptimizerResult, optimizerResults]);

  useImperativeHandle(
    ref,
    () => ({
      getSummary: () => {
        const symbol = String(resolvedSymbol || symbolInput || '').trim();
        if (!symbol) return null;
        const executionSnapshot: ExecutionConfig = {
          ...execCfg,
          sessionCostOverrides: {
            asia: { ...execCfg.sessionCostOverrides?.asia },
            london: { ...execCfg.sessionCostOverrides?.london },
            ny: { ...execCfg.sessionCostOverrides?.ny }
          }
        };
        return {
          symbol,
          timeframe: resolution,
          rangeDays,
          bars: bars.length,
          stats,
          performance: {
            netR: performance.netR,
            maxDrawdown: performance.maxDrawdown,
            maxDrawdownPct: performance.maxDrawdownPct,
            avgR: performance.avgR,
            medianR: performance.medianR,
            avgHoldMs: performance.avgHoldMs,
            maxWinStreak: performance.maxWinStreak,
            maxLossStreak: performance.maxLossStreak
          },
          updatedAtMs: barsUpdatedAtMs,
          source: barsSource || null,
          validation: trainingPackSummary?.validation ? { ...trainingPackSummary.validation } : undefined,
          walkForward: trainingPackSummary?.walkForward ? { ...trainingPackSummary.walkForward } : undefined,
          execution: executionSnapshot,
          validationConfig: { ...validationCfg },
          walkForwardConfig: { ...walkForwardCfg }
        };
      },
      getTrainingPack: (opts?: { maxEpisodes?: number; offset?: number; limit?: number }) => {
        const symbol = String(resolvedSymbol || symbolInput || '').trim();
        if (!symbol) return null;
        const totalEpisodes = trainingEpisodesAll.length;
        const limitRaw = Number(opts?.limit ?? opts?.maxEpisodes);
        const limit =
          Number.isFinite(limitRaw)
            ? Math.max(0, Math.min(MAX_TRAINING_EPISODES, Math.floor(limitRaw)))
            : totalEpisodes;
        const offsetRaw = Number(opts?.offset);
        const defaultOffset = Math.max(0, totalEpisodes - Math.max(1, limit || 1));
        const offset =
          Number.isFinite(offsetRaw)
            ? Math.max(0, Math.min(Math.max(0, totalEpisodes - 1), Math.floor(offsetRaw)))
            : defaultOffset;
        const end = limit === 0 ? offset : Math.min(totalEpisodes, offset + limit);
        const episodes = limit === 0 ? [] : trainingEpisodesAll.slice(offset, end);
        const nextOffset = end < totalEpisodes ? end : null;
        const trimmed = episodes.length !== totalEpisodes;
        return {
          meta: {
            symbol,
            timeframe: resolution,
            rangeDays,
            bars: bars.length,
            trades: stats.total,
            winRate: stats.winRate,
            expectancy: stats.expectancy,
            profitFactor: stats.profitFactor,
            netR: performance.netR,
            updatedAtMs: barsUpdatedAtMs,
            source: barsSource || null,
            totalEpisodes,
            trimmed,
            offset,
            limit,
            nextOffset
          },
          summary: { ...trainingPackSummary },
          episodes
        };
      },
      applyOptimization,
      listOptimizerPresets: () => optimizerPresets,
      saveOptimizerPreset: saveOptimizerPresetExternal,
      loadOptimizerPreset: loadOptimizerPresetExternal,
      deleteOptimizerPreset: deleteOptimizerPresetExternal,
      exportOptimizerPresets: exportOptimizerPresetsExternal,
      importOptimizerPresets: importOptimizerPresetsExternal,
      listBatchPresets: () => batchPresets,
      saveBatchPreset: saveBatchPresetExternal,
      loadBatchPreset: loadBatchPresetExternal,
      deleteBatchPreset: deleteBatchPresetExternal,
      runBatchOptimization: runBatchOptimizationExternal,
      cancelBatchOptimization,
      clearBatchResults,
      exportBatchResults: exportBatchResultsExternal
    }),
    [
      applyOptimization,
      bars.length,
      barsSource,
      barsUpdatedAtMs,
      batchPresets,
      cancelBatchOptimization,
      clearBatchResults,
      deleteBatchPresetExternal,
      deleteOptimizerPresetExternal,
      exportBatchResultsExternal,
      exportOptimizerPresetsExternal,
      importOptimizerPresetsExternal,
      loadBatchPresetExternal,
      loadOptimizerPresetExternal,
      optimizerPresets,
      performance,
      rangeDays,
      resolution,
      resolvedSymbol,
      runBatchOptimizationExternal,
      saveBatchPresetExternal,
      saveOptimizerPresetExternal,
      stats,
      symbolInput,
      trainingEpisodesAll,
      trainingPackSummary
    ]
  );

  const copyTrainingJson = useCallback(async () => {
    const payload = JSON.stringify(trainingEpisodes, null, 2);
    try {
      const fn = (window as any)?.glass?.clipboard?.writeText;
      if (fn) {
        const res = fn(payload);
        if (res && typeof res.then === 'function') await res;
        return;
      }
    } catch {
      // ignore
    }
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(payload);
    } catch {
      // ignore
    }
  }, [trainingEpisodes]);

  const downloadTrainingJson = useCallback(() => {
    const payload = JSON.stringify(trainingEpisodes, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backtest_${resolvedSymbol || symbolInput || 'symbol'}_${resolution}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [resolution, resolvedSymbol, symbolInput, trainingEpisodes]);

  const sendTrainingSummary = useCallback(() => {
    if (!onSendTrainingMessage) return;
    const symbol = String(resolvedSymbol || symbolInput || '').trim() || 'Symbol';
    const setupParts = [
      rangeCfg.enabled
        ? `Range Breakout (LB ${rangeCfg.lookbackBars}, ATR ${rangeCfg.atrPeriod}, x${rangeCfg.atrMult}, RR ${rangeCfg.rr}, ${rangeCfg.breakoutMode}, buf ${rangeCfg.bufferAtrMult})`
        : 'Range Breakout off',
      breakCfg.enabled
        ? `Break + Retest (LB ${breakCfg.lookbackBars}, ATR ${breakCfg.atrPeriod}, x${breakCfg.atrMult}, RR ${breakCfg.rr}, retest ${breakCfg.retestBars}, ${breakCfg.retestConfirm})`
        : 'Break + Retest off',
      fvgCfg.enabled
        ? `FVG Retrace (ATR ${fvgCfg.atrPeriod}, x${fvgCfg.atrMult}, RR ${fvgCfg.rr}, gap>=${fvgCfg.minGapAtrMult})`
        : 'FVG Retrace off',
      trendCfg.enabled
        ? `Trend Pullback (EMA ${trendCfg.fastEma}/${trendCfg.slowEma}, pull ${trendCfg.pullbackEma}, ATR ${trendCfg.atrPeriod}, x${trendCfg.atrMult}, RR ${trendCfg.rr})`
        : 'Trend Pullback off',
      meanCfg.enabled
        ? `Mean Reversion (SMA ${meanCfg.smaPeriod}, band x${meanCfg.bandAtrMult}, stop x${meanCfg.stopAtrMult}, RR ${meanCfg.rr})`
        : 'Mean Reversion off'
    ];
    const executionParts = [
      `Entry ${execCfg.entryTiming === 'signal_close' ? 'signal close' : 'next open'}`,
      `Order ${execCfg.entryOrderType}`,
      `Delay ${execCfg.entryDelayBars || 0} bars`,
      execCfg.entryOrderType !== 'market' ? `Wait ${execCfg.maxEntryWaitBars || 0} bars` : 'Wait n/a',
      `Exit ${execCfg.exitMode}`,
      execCfg.spreadModel !== 'none'
        ? `Spread ${execCfg.spreadModel}${execCfg.spreadModel === 'fixed' ? ` ${execCfg.spreadValue}` : execCfg.spreadModel === 'atr' ? ` x${execCfg.spreadAtrMult}` : ` ${execCfg.spreadPct}%`}`
        : 'Spread off',
      execCfg.slippageModel !== 'none'
        ? `Slip ${execCfg.slippageModel}${execCfg.slippageModel === 'fixed' ? ` ${execCfg.slippageValue}` : execCfg.slippageModel === 'atr' ? ` x${execCfg.slippageAtrMult}` : ` ${execCfg.slippagePct}%`}`
        : 'Slip off',
      execCfg.commissionModel !== 'none'
        ? `Comm ${execCfg.commissionModel}${execCfg.commissionModel === 'fixed' ? ` ${execCfg.commissionValue}` : ` ${execCfg.commissionPct}%`}`
        : 'Comm off',
        execCfg.minStopValue > 0 || execCfg.minStopAtrMult > 0
          ? `MinStop ${execCfg.minStopValue || 0} / x${execCfg.minStopAtrMult} (${execCfg.minStopMode})`
          : 'MinStop off',
        execCfg.sessionFilter !== 'all' ? `Session ${execCfg.sessionFilter} (${execCfg.sessionTimezone})` : 'Session all',
        execCfg.volatilitySlippageEnabled
          ? `VolSlip L${execCfg.volatilitySlippageLowMult}/M${execCfg.volatilitySlippageMidMult}/H${execCfg.volatilitySlippageHighMult}`
          : 'VolSlip off',
        execCfg.partialFillMode !== 'none' ? `PartialFill ${execCfg.partialFillMode}` : 'PartialFill off',
        execCfg.newsSpikeAtrMult > 0 ? `NewsSpike x${execCfg.newsSpikeAtrMult}` : 'NewsSpike off',
        confluenceCfg.enabled
          ? `HTF ${confluenceCfg.htfResolution} ${confluenceCfg.biasMode} ${confluenceCfg.biasReference} ${confluenceCfg.allowNeutral ? 'neutral ok' : 'strict'}`
          : 'HTF off'
    ];
    const validationLine = validationCfg.enabled && validationData
      ? [
        `Validation ${validationCfg.mode === 'percent' ? `${validationCfg.splitPercent}% split` : `last ${validationCfg.lastDays}d`}`,
        `Train WR ${formatPercent(validationData.trainStats.winRate)} Exp ${validationData.trainStats.expectancy?.toFixed(2) ?? '--'}R PF ${validationData.trainStats.profitFactor?.toFixed(2) ?? '--'} Net ${formatR(validationData.trainEquity.netR)}`,
        `Test WR ${formatPercent(validationData.testStats.winRate)} Exp ${validationData.testStats.expectancy?.toFixed(2) ?? '--'}R PF ${validationData.testStats.profitFactor?.toFixed(2) ?? '--'} Net ${formatR(validationData.testEquity.netR)}`
      ].join(' | ')
      : 'Validation off';
    const walkForwardLine = walkForwardCfg.enabled && walkForwardData?.summary
      ? [
        `Walk-forward ${walkForwardCfg.trainDays}d/${walkForwardCfg.testDays}d step ${walkForwardCfg.stepDays}d`,
        `Folds ${walkForwardData.summary.folds}`,
        `Avg Test Net ${formatR(walkForwardData.summary.avgNetR)} Exp ${formatR(walkForwardData.summary.avgExpectancy)} WR ${formatPercent(walkForwardData.summary.avgWinRate)} PF ${walkForwardData.summary.avgProfitFactor?.toFixed(2) ?? '--'}`,
        `Positive ${formatPercent(walkForwardData.summary.positiveNetPct)} | Stability ${walkForwardData.summary.stabilityScore ?? '--'}`,
        `Drift ${Array.isArray(walkForwardData.summary.driftFlags) && walkForwardData.summary.driftFlags.length > 0 ? walkForwardData.summary.driftFlags.join(' ') : 'none'}`
      ].join(' | ')
      : 'Walk-forward off';
    const episodesLabel = trainingTrimmed ? `${trainingEpisodes.length} (trimmed)` : `${trainingEpisodes.length}`;
    const parts = [
      `Backtest training pack`,
      `Symbol: ${symbol}`,
      `Timeframe: ${resolution}`,
      `Range: last ${rangeDays}d`,
      `Trades: ${stats.total} | Win rate: ${formatPercent(stats.winRate)} | Expectancy: ${stats.expectancy?.toFixed(2) ?? '--'}R`,
      `Setups: ${setupParts.join(' | ')}`,
      `Execution: ${executionParts.join(' | ')}`,
      `Tie-breaker: ${tieBreaker.toUpperCase()}`,
      validationLine,
      walkForwardLine,
      `Episodes: ${episodesLabel}`
    ];
    onSendTrainingMessage(parts.join('\n'));
  }, [confluenceCfg, fvgCfg, meanCfg, onSendTrainingMessage, rangeCfg, rangeDays, resolution, resolvedSymbol, stats, symbolInput, tieBreaker, trainingEpisodes.length, trainingTrimmed, trendCfg, validationCfg, validationData, walkForwardCfg, walkForwardData]);

  const batchOkCount = useMemo(
    () => batchResults.filter((row) => row.result && row.result.ok).length,
    [batchResults]
  );
  const batchFailCount = useMemo(
    () => batchResults.filter((row) => row.result && !row.result.ok).length,
    [batchResults]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSize;
    if (!width || !height) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    ctx.fillStyle = CHART_COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    if (visibleBars.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(barsLoading ? 'Loading broker history...' : 'No bars loaded.', 12, 24);
      return;
    }

    const highs = visibleBars.map((b) => b.h);
    const lows = visibleBars.map((b) => b.l);
    let max = Math.max(...highs);
    let min = Math.min(...lows);
    if (!Number.isFinite(max) || !Number.isFinite(min) || max === min) {
      max = max || 1;
      min = min || 0;
    }
    const pad = (max - min) * 0.08 || 1;
    max += pad;
    min -= pad;

    const priceToY = (price: number) => height - ((price - min) / (max - min)) * height;

    const barCount = visibleBars.length;
    const barWidth = Math.max(2, width / barCount);
    const halfBar = barWidth * 0.5;

    const gridLines = 4;
    ctx.strokeStyle = CHART_COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i <= gridLines; i += 1) {
      const y = Math.round((height / (gridLines + 1)) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (walkForwardCfg.enabled && walkForwardData?.folds?.length) {
      const barTimes = bars.map((bar) => bar.t);
      const lastVisibleIndex = visibleStartIndex + visibleBars.length - 1;
      for (const fold of walkForwardData.folds) {
        const testStartIndex = findIndexAtOrAfter(barTimes, fold.testStart);
        const testEndIndex = Math.max(testStartIndex, findIndexAtOrAfter(barTimes, fold.testEnd) - 1);
        if (testEndIndex < visibleStartIndex || testStartIndex > lastVisibleIndex) continue;

        const startRel = Math.max(0, testStartIndex - visibleStartIndex);
        const endRel = Math.min(visibleBars.length - 1, testEndIndex - visibleStartIndex);
        const x = startRel * barWidth;
        const w = (endRel - startRel + 1) * barWidth;

        ctx.fillStyle = CHART_COLORS.wfTest;
        ctx.fillRect(x, 0, w, height);

        ctx.strokeStyle = CHART_COLORS.wfMarker;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();

        const endX = (endRel + 1) * barWidth;
        ctx.beginPath();
        ctx.moveTo(endX + 0.5, 0);
        ctx.lineTo(endX + 0.5, height);
        ctx.stroke();
      }
    }

    visibleBars.forEach((bar, idx) => {
      const x = idx * barWidth + halfBar;
      const yHigh = priceToY(bar.h);
      const yLow = priceToY(bar.l);
      const yOpen = priceToY(bar.o);
      const yClose = priceToY(bar.c);
      const up = bar.c >= bar.o;
      ctx.strokeStyle = CHART_COLORS.wick;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      ctx.fillStyle = up ? CHART_COLORS.up : CHART_COLORS.down;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
      ctx.fillRect(x - halfBar * 0.6, bodyTop, Math.max(1, halfBar * 1.2), bodyHeight);
    });

    const plotTrades = replayTrades.filter((t) => t.entryIndex >= visibleStartIndex && t.entryIndex <= replayCutoffIndex);

    if (selectedTrade) {
      const startIndex = selectedTrade.signalIndex;
      const endIndex = selectedTrade.exitIndex ?? selectedTrade.entryIndex;
      if (endIndex >= visibleStartIndex && startIndex <= replayCutoffIndex) {
        const startRel = Math.max(0, Math.min(visibleBars.length - 1, startIndex - visibleStartIndex));
        const endRel = Math.max(0, Math.min(visibleBars.length - 1, endIndex - visibleStartIndex));
        const startX = startRel * barWidth;
        const endX = (endRel + 1) * barWidth;
        const fill =
          selectedTrade.outcome === 'win'
            ? CHART_COLORS.highlightWin
            : selectedTrade.outcome === 'loss'
              ? CHART_COLORS.highlightLoss
              : CHART_COLORS.highlightOpen;
        ctx.fillStyle = fill;
        ctx.fillRect(Math.min(startX, endX), 0, Math.abs(endX - startX), height);
      }
    }

    for (const trade of plotTrades) {
      const relIndex = trade.entryIndex - visibleStartIndex;
      if (relIndex < 0 || relIndex >= visibleBars.length) continue;
      const x = relIndex * barWidth + halfBar;
      const entryY = priceToY(trade.entryPrice);
      ctx.fillStyle = trade.side === 'BUY' ? CHART_COLORS.entry : CHART_COLORS.down;
      ctx.beginPath();
      if (trade.side === 'BUY') {
        ctx.moveTo(x, entryY - 6);
        ctx.lineTo(x - 5, entryY + 4);
        ctx.lineTo(x + 5, entryY + 4);
      } else {
        ctx.moveTo(x, entryY + 6);
        ctx.lineTo(x - 5, entryY - 4);
        ctx.lineTo(x + 5, entryY - 4);
      }
      ctx.closePath();
      ctx.fill();

      const stopY = priceToY(trade.stopLoss);
      const tpY = priceToY(trade.takeProfit);
      const exitIndex = trade.exitIndex != null ? Math.min(trade.exitIndex, replayCutoffIndex) : replayCutoffIndex;
      const exitRel = exitIndex - visibleStartIndex;
      const exitX = Math.min(width, Math.max(0, exitRel * barWidth + halfBar));

      ctx.strokeStyle = CHART_COLORS.entry;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, entryY);
      ctx.lineTo(exitX, entryY);
      ctx.stroke();

      ctx.strokeStyle = CHART_COLORS.stop;
      ctx.beginPath();
      ctx.moveTo(x, stopY);
      ctx.lineTo(Math.min(width, x + halfBar * 1.5), stopY);
      ctx.stroke();

      ctx.strokeStyle = CHART_COLORS.tp;
      ctx.beginPath();
      ctx.moveTo(x, tpY);
      ctx.lineTo(Math.min(width, x + halfBar * 1.5), tpY);
      ctx.stroke();
    }

    if (selectedTrade) {
      const entryRel = selectedTrade.entryIndex - visibleStartIndex;
      if (entryRel >= 0 && entryRel < visibleBars.length) {
        const entryX = entryRel * barWidth + halfBar;
        const entryY = priceToY(selectedTrade.entryPrice);
        const stopY = priceToY(selectedTrade.stopLoss);
        const tpY = priceToY(selectedTrade.takeProfit);
        const endIndex = selectedTrade.exitIndex ?? selectedTrade.entryIndex;
        const endRel = Math.max(0, Math.min(visibleBars.length - 1, endIndex - visibleStartIndex));
        const endX = endRel * barWidth + halfBar;

        ctx.strokeStyle = CHART_COLORS.entryLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(entryX, entryY);
        ctx.lineTo(endX, entryY);
        ctx.stroke();

        ctx.strokeStyle = CHART_COLORS.stop;
        ctx.beginPath();
        ctx.moveTo(entryX, stopY);
        ctx.lineTo(endX, stopY);
        ctx.stroke();

        ctx.strokeStyle = CHART_COLORS.tp;
        ctx.beginPath();
        ctx.moveTo(entryX, tpY);
        ctx.lineTo(endX, tpY);
        ctx.stroke();

        if (selectedTrade.exitPrice != null) {
          const exitY = priceToY(selectedTrade.exitPrice);
          ctx.fillStyle = selectedTrade.outcome === 'win' ? CHART_COLORS.tp : CHART_COLORS.stop;
          ctx.beginPath();
          ctx.arc(endX, exitY, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const replayRel = replayCutoffIndex - visibleStartIndex;
    if (replayRel >= 0 && replayRel < visibleBars.length) {
      const x = replayRel * barWidth + halfBar;
      ctx.strokeStyle = CHART_COLORS.replay;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [bars, barsLoading, canvasSize, replayCutoffIndex, replayTrades, selectedTrade, visibleBars, visibleStartIndex, walkForwardCfg.enabled, walkForwardData]);

  useEffect(() => {
    const canvas = equityCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (!width || !height) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, width, height);

    if (performance.curve.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.fillText('No closed trades yet.', 8, 16);
      return;
    }

    const padding = 8;
    const values = performance.curve.map((p) => p.equity);
    let minVal = Math.min(...values, 0);
    let maxVal = Math.max(...values, 0);
    const range = maxVal - minVal || 1;
    const pad = range * 0.12;
    minVal -= pad;
    maxVal += pad;

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i += 1) {
      const y = padding + ((height - padding * 2) * i) / 3;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    ctx.beginPath();
    performance.curve.forEach((point, idx) => {
      const x = padding + ((width - padding * 2) * idx) / Math.max(1, performance.curve.length - 1);
      const y = padding + (1 - (point.equity - minVal) / (maxVal - minVal)) * (height - padding * 2);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = performance.netR >= 0 ? CHART_COLORS.up : CHART_COLORS.down;
    ctx.lineWidth = 2;
    ctx.stroke();

    const lastPoint = performance.curve[performance.curve.length - 1];
    if (lastPoint) {
      const x = padding + (width - padding * 2);
      const y = padding + (1 - (lastPoint.equity - minVal) / (maxVal - minVal)) * (height - padding * 2);
      ctx.fillStyle = performance.netR >= 0 ? CHART_COLORS.up : CHART_COLORS.down;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText(`Net ${formatR(performance.netR)}`, padding, 14);
  }, [performance]);

  useEffect(() => {
    const canvas = walkForwardCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (!width || !height) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, width, height);

    if (!walkForwardCfg.enabled || !walkForwardData || walkForwardData.folds.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.fillText('No folds to plot.', 8, 16);
      return;
    }

    const values = walkForwardData.folds.map((fold) => fold.testEquity.netR);
    const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));
    const padding = 8;
    const midY = Math.round(height / 2);
    const scale = (height / 2 - padding) / maxAbs;
    const count = Math.max(1, values.length);
    const barWidth = width / count;
    const barFill = Math.max(2, barWidth * 0.7);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY + 0.5);
    ctx.lineTo(width, midY + 0.5);
    ctx.stroke();

    values.forEach((value, idx) => {
      const x = idx * barWidth + (barWidth - barFill) / 2;
      const h = Math.abs(value) * scale;
      const y = value >= 0 ? midY - h : midY;
      ctx.fillStyle = value >= 0 ? CHART_COLORS.up : CHART_COLORS.down;
      ctx.fillRect(x, y, barFill, Math.max(1, h));
    });

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText(`Folds ${walkForwardData.folds.length}`, padding, 14);
  }, [walkForwardCfg.enabled, walkForwardData]);

  const replayBar = bars[replayCutoffIndex];
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const historyRangeLabel = barsHistoryFromMs && barsHistoryToMs
    ? ` | ${new Date(barsHistoryFromMs).toLocaleDateString()}→${new Date(barsHistoryToMs).toLocaleDateString()}`
    : '';
  const historyChunkLabel = Number.isFinite(Number(barsHistoryChunks)) ? ` | ${barsHistoryChunks} chunks` : '';
  const historySourceLabel = barsCached ? 'cache' : (barsSource || 'broker');
  const manualRunLabel = manualRunAtMs ? ` | Run ${formatAge(manualRunAtMs)} ago` : '';
  const manualRunTone = manualRunStatus
    ? (manualRunStatus.toLowerCase().includes('fail') ? 'text-red-400' : manualRunStatus.toLowerCase().includes('no trades') ? 'text-amber-300' : 'text-emerald-300')
    : '';
  const computeError = workerComputeError || workerAnalysisError;
  const computeRunning = workerComputeRunning || workerAnalysisRunning;
  const computeStatus = useWorkerCompute
    ? (computeRunning ? 'Compute: worker (running)' : computeError ? `Compute: ${computeError}` : 'Compute: worker')
    : 'Compute: local';
  const computeTone = computeError ? 'text-red-400' : 'text-gray-500';
  const dataStatus = barsLoading
    ? 'Loading history...'
    : barsError
      ? barsError
      : bars.length > 0
        ? `Bars ${bars.length}${barsTrimmed ? ' (trimmed)' : ''} | ${historySourceLabel} | Updated ${formatAge(barsUpdatedAtMs)}${historyRangeLabel}${historyChunkLabel}${manualRunLabel}`
        : 'No data loaded.';
  const timelineRun = activePlaybookRun || (Array.isArray(recentPlaybookRuns) ? recentPlaybookRuns[0] : null);
  const timelineSteps = Array.isArray(timelineRun?.steps) ? timelineRun?.steps || [] : [];
  const blockedStep = timelineSteps.slice().reverse().find((step) => step.status === 'blocked') || null;
  const blockedNote = blockedStep?.note ? String(blockedStep.note) : '';
  const blockedNoteLower = blockedNote.toLowerCase();
  const blockedIsConfirm = blockedNoteLower === 'confirmation_required';
  const blockedIsMissing = blockedNoteLower.includes('missing');
  const blockedHeader = blockedIsConfirm
    ? 'Awaiting confirmation'
    : blockedIsMissing
      ? 'Awaiting input'
      : 'Awaiting coordination';
  const blockedPrimaryAction: 'resume' | 'approve' = blockedIsConfirm ? 'approve' : 'resume';
  const blockedPrimaryLabel = blockedIsConfirm ? 'Approve' : 'Resume';
  const blockedRequirement = blockedIsMissing
    ? (blockedNoteLower.includes('missing_symbol')
        ? 'symbol'
        : blockedNoteLower.includes('missing_timeframe')
          ? 'timeframe'
          : (blockedNoteLower.includes('missing_params') || blockedNoteLower.includes('missing_levels'))
            ? 'params'
            : null)
    : null;
  const sortTaskTreeRuns = (runs: TaskTreeRunEntry[]) => {
    return [...runs].sort((a, b) => (Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)));
  };
  const taskTreeRunList = Array.isArray(taskTreeRuns) ? sortTaskTreeRuns(taskTreeRuns).slice(0, 3) : [];
  const actionTaskTreeRunList = Array.isArray(actionTaskTreeRuns) ? sortTaskTreeRuns(actionTaskTreeRuns).slice(0, 3) : [];
  const taskTreeResumeList = Array.isArray(taskTreeResumeEntries) ? taskTreeResumeEntries : [];
  const selectedTaskTreeRun =
    taskTreeRunList.find((run) => run.runId === selectedTaskTreeRunId) || taskTreeRunList[0] || null;
  const selectedActionTaskTreeRun =
    actionTaskTreeRunList.find((run) => run.runId === selectedActionTaskTreeRunId) || actionTaskTreeRunList[0] || null;
  const getResumeDraft = (runId: string) => {
    return resumeOverrides[runId] || { symbol: '', timeframe: '', strategy: '', timeframes: '', dataJson: '' };
  };
  const updateResumeDraft = (runId: string, patch: Partial<{ symbol: string; timeframe: string; strategy: string; timeframes: string; dataJson: string }>) => {
    setResumeOverrides((prev) => ({
      ...prev,
      [runId]: { ...getResumeDraft(runId), ...patch }
    }));
    setResumeOverrideErrors((prev) => {
      if (!prev[runId]) return prev;
      const next = { ...prev };
      delete next[runId];
      return next;
    });
  };
  const buildResumeOverrides = (runId: string) => {
    const draft = getResumeDraft(runId);
    const symbol = String(draft.symbol || '').trim();
    const timeframe = String(draft.timeframe || '').trim();
    const strategy = String(draft.strategy || '').trim();
    const timeframes = String(draft.timeframes || '').trim();
    let parsedTimeframes: string[] | undefined;
    if (timeframes) {
      parsedTimeframes = timeframes
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (parsedTimeframes.length === 0) parsedTimeframes = undefined;
    }
    let data: Record<string, any> | undefined;
    const rawJson = String(draft.dataJson || '').trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object') data = parsed as Record<string, any>;
      } catch {
        return { overrides: null, error: 'Invalid JSON overrides.' };
      }
    }
    const overrides = {
      symbol: symbol || undefined,
      timeframe: timeframe || undefined,
      strategy: strategy || undefined,
      timeframes: parsedTimeframes,
      data
    };
    return { overrides };
  };
  const resolveRunDefaults = (run: typeof timelineRun) => {
    if (!run) return { symbol: '', timeframe: '', strategy: '', timeframes: '' };
    const context = run.context && typeof run.context === 'object' ? run.context : null;
    const ctxData = context && typeof (context as any).data === 'object' ? (context as any).data : null;
    const ctxSource = context && typeof (context as any).source === 'object' ? (context as any).source : null;
    const ctxTimeframes = Array.isArray(ctxData?.timeframes) ? ctxData?.timeframes : Array.isArray(ctxSource?.timeframes) ? ctxSource?.timeframes : null;
    const timeframes = ctxTimeframes && ctxTimeframes.length > 0
      ? ctxTimeframes.map((entry: any) => String(entry)).join(',')
      : '';
    return {
      symbol: String(run.symbol || ''),
      timeframe: String(run.timeframe || ''),
      strategy: String(run.strategy || ''),
      timeframes
    };
  };
  const runResume = useCallback((runId: string) => {
    if (!timelineRun || !blockedStep || !onResumePlaybookRun) return;
    const opts: any = { action: blockedPrimaryAction, stepId: blockedStep.id, actionId: blockedStep.actionId };
    if (blockedIsMissing) {
      const built = buildResumeOverrides(runId);
      if ((built as any)?.error) {
        setResumeOverrideErrors((prev) => ({ ...prev, [runId]: String((built as any).error || 'Invalid overrides.') }));
        return;
      }
      const overrides = (built as any)?.overrides;
      if (blockedRequirement === 'symbol' && !overrides?.symbol) {
        setResumeOverrideErrors((prev) => ({ ...prev, [runId]: 'Symbol is required.' }));
        return;
      }
      if (blockedRequirement === 'timeframe' && !(overrides?.timeframe || (overrides?.timeframes || []).length > 0)) {
        setResumeOverrideErrors((prev) => ({ ...prev, [runId]: 'Timeframe is required.' }));
        return;
      }
      if (blockedRequirement === 'params' && (!overrides?.data || Object.keys(overrides.data).length === 0)) {
        setResumeOverrideErrors((prev) => ({ ...prev, [runId]: 'Overrides JSON is required.' }));
        return;
      }
      if (overrides) opts.overrides = overrides;
    }
    onResumePlaybookRun(runId, opts);
  }, [
    timelineRun,
    blockedStep,
    onResumePlaybookRun,
    blockedPrimaryAction,
    blockedIsMissing,
    blockedRequirement,
    buildResumeOverrides
  ]);
  const timelineFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    timelineSteps.forEach((step) => {
      const value = String(step.actionId || step.id || step.label || '').trim();
      if (!value) return;
      if (!seen.has(value)) {
        seen.set(value, String(step.label || step.actionId || value));
      }
    });
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [timelineSteps]);
  const filteredTimelineSteps = useMemo(() => {
    if (timelineStepFilters.length === 0) return timelineSteps;
    return timelineSteps.filter((step) => {
      const key = String(step.actionId || step.id || step.label || '').trim();
      return timelineStepFilters.includes(key);
    });
  }, [timelineSteps, timelineStepFilters]);
  const htfBiasLabel = useCallback((trade: BacktestTrade | null | undefined) => {
    if (!trade) return '--';
    if (trade.setup === 'range_breakout') return 'Range';
    if (trade.setup === 'break_retest') return 'Break';
    if (trade.setup === 'fvg_retrace') return 'FVG';
    if (trade.setup === 'trend_pullback') return 'Trend';
    return 'MeanRev';
  }, []);
  const formatRunTime = (value?: number | null) => {
    if (!value || value <= 0) return '--';
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--';
    }
  };
  const statusBadge = (status?: string | null) => {
    const raw = String(status || '').toLowerCase();
    if (raw === 'completed') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
    if (raw === 'failed') return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (raw === 'blocked') return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    if (raw === 'running') return 'bg-sky-500/20 text-sky-200 border-sky-500/30';
    if (raw === 'skipped') return 'bg-white/10 text-gray-300 border-white/10';
    return 'bg-white/5 text-gray-400 border-white/10';
  };
  const truthLevelBadge = (level?: string | null) => {
    const raw = String(level || '').toLowerCase();
    if (raw === 'error') return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (raw === 'warn' || raw === 'warning') return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    return 'bg-white/10 text-gray-300 border-white/10';
  };
  const loadTruthEvents = useCallback(async (run: typeof timelineRun | null) => {
    const ledger = window.glass?.tradeLedger;
    if (!ledger?.listEvents) {
      setTruthEvents([]);
      return;
    }
    if (!run) {
      setTruthEvents([]);
      return;
    }
    const args: any = { limit: 40, kind: 'truth_event' };
    if (run.runId) args.runId = String(run.runId);
    else if (run.symbol) args.symbol = String(run.symbol);
    try {
      const res = await ledger.listEvents(args);
      if (!res?.ok || !Array.isArray(res.entries)) {
        setTruthEventsError(res?.error ? String(res.error) : 'Unable to load truth events.');
        return;
      }
      setTruthEvents(res.entries);
      setTruthEventsUpdatedAtMs(Date.now());
      setTruthEventsError(null);
    } catch (err: any) {
      setTruthEventsError(err?.message ? String(err.message) : 'Unable to load truth events.');
    }
  }, []);

  useEffect(() => {
    void loadTruthEvents(timelineRun);
  }, [timelineRun?.runId, timelineRun?.status, timelineRun?.symbol, loadTruthEvents]);

  const loadTaskTruthEvents = useCallback(async (run: TaskTreeRunEntry | null) => {
    const ledger = window.glass?.tradeLedger;
    if (!ledger?.listEvents) {
      setTaskTruthEvents([]);
      return;
    }
    if (!run?.runId) {
      setTaskTruthEvents([]);
      setTaskTruthRunId('');
      return;
    }
    try {
      const res = await ledger.listEvents({ limit: 60, kind: 'truth_event', runId: String(run.runId) });
      if (!res?.ok || !Array.isArray(res.entries)) {
        setTaskTruthError(res?.error ? String(res.error) : 'Unable to load truth events.');
        return;
      }
      setTaskTruthRunId(String(run.runId));
      setTaskTruthEvents(res.entries);
      setTaskTruthUpdatedAtMs(Date.now());
      setTaskTruthError(null);
    } catch (err: any) {
      setTaskTruthError(err?.message ? String(err.message) : 'Unable to load truth events.');
    }
  }, []);

  const truthFilterPrefix =
    truthEventFilter === 'trade'
      ? 'trade_'
      : truthEventFilter === 'broker'
        ? 'broker_'
        : truthEventFilter === 'playbook'
          ? 'playbook_'
          : truthEventFilter === 'task'
            ? 'task_tree_'
            : truthEventFilter === 'setup'
              ? 'setup_'
              : truthEventFilter === 'chart'
                ? 'chart_'
                : truthEventFilter === 'agent'
                  ? 'agent_'
                  : '';
  const filteredTruthEvents = truthFilterPrefix
    ? truthEvents.filter((event) => String(event?.eventType || '').startsWith(truthFilterPrefix))
    : truthEvents;
  const filteredTaskTruthEvents = truthFilterPrefix
    ? taskTruthEvents.filter((event) => String(event?.eventType || '').startsWith(truthFilterPrefix))
    : taskTruthEvents;
  const buildReplaySummary = (run: TaskTreeRunEntry): TaskTreeRunSummary | null => {
    if (!run || !run.runId) return null;
    const createdAtMs = Number(run.createdAtMs) || Date.now();
    const finishedAtMs = Number(run.finishedAtMs) || createdAtMs;
    const steps = (Array.isArray(run.steps) ? run.steps : []).map((step) => ({
      step: String(step.step || ''),
      status: (step.status ? String(step.status) : 'completed') as TaskTreeRunSummary['status'],
      startedAtMs: Number(step.startedAtMs) || createdAtMs,
      finishedAtMs: Number(step.finishedAtMs) || Number(step.startedAtMs) || createdAtMs,
      attempts: Number.isFinite(Number(step.attempts)) ? Number(step.attempts) : undefined,
      retryCount: Number.isFinite(Number(step.retryCount)) ? Number(step.retryCount) : undefined,
      error: step.error || undefined,
      note: step.note || undefined
    }));
    const context = run.context || {};
    return {
      runId: String(run.runId),
      status: (run.status ? String(run.status) : 'completed') as TaskTreeRunSummary['status'],
      createdAtMs,
      finishedAtMs,
      steps,
      context: {
        source: context.source ? String(context.source) : 'timeline',
        symbol: context.symbol ? String(context.symbol) : undefined,
        timeframe: context.timeframe ? String(context.timeframe) : undefined,
        strategy: context.strategy ? String(context.strategy) : undefined,
        watcherId: context.watcherId ? String(context.watcherId) : undefined,
        mode: context.mode ? String(context.mode) : undefined
      }
    };
  };
  const renderTaskTreeRun = (run: TaskTreeRunEntry, label: string) => {
    const steps = Array.isArray(run.steps) ? run.steps : [];
    const context = run.context || {};
    const metaLine = [
      context.source ? `Source ${context.source}` : '',
      context.symbol ? context.symbol : '',
      context.timeframe ? context.timeframe : '',
      context.strategy ? context.strategy : '',
      context.mode ? `Mode ${context.mode}` : ''
    ].filter(Boolean).join(' | ');
    const replaySummary = onReplayTaskTree ? buildReplaySummary(run) : null;
    const handleReplayTruth = async () => {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listEvents) return;
      const res = await ledger.listEvents({ limit: 60, kind: 'truth_event', runId: run.runId });
      if (!res?.ok || !Array.isArray(res.entries)) return;
      const payload = {
        runId: run.runId,
        symbol: context.symbol || null,
        timeframe: context.timeframe || null,
        strategy: context.strategy || null,
        createdAtMs: run.createdAtMs || null,
        events: res.entries
      };
      const filename = `truth_replay_${run.runId}.json`;
      try {
        const data = JSON.stringify(payload, null, 2);
        const saver = window.glass?.saveUserFile;
        if (typeof saver === 'function') {
          const saved = await saver({ data, mimeType: 'application/json', subdir: 'replays', prefix: filename });
          if (saved?.ok) return;
        }
      } catch {
        // ignore save failures
      }
    };
    const handleLoadTruth = () => {
      void loadTaskTruthEvents(run);
    };
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
          <div className="flex items-center gap-2">
            {onReplayTaskTree && replaySummary && (
              <button
                type="button"
                onClick={() => onReplayTaskTree(replaySummary)}
                className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
              >
                Replay
              </button>
            )}
            <button
              type="button"
              onClick={handleLoadTruth}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Truth
            </button>
            <button
              type="button"
              onClick={handleReplayTruth}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Export
            </button>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusBadge(run.status)}`}>
              {String(run.status || 'unknown').toUpperCase()}
            </span>
          </div>
        </div>
        {metaLine && <div className="text-[10px] text-gray-500">{metaLine}</div>}
        <div className="text-[10px] text-gray-500">
          Started {formatRunTime(run.createdAtMs)}
          {run.finishedAtMs ? ` | Finished ${formatRunTime(run.finishedAtMs)}` : ''}
        </div>
        {steps.length > 0 ? (
          <div className="mt-2 space-y-1">
            {steps.map((step, idx) => (
              <div key={`${run.runId}-${step.step}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${statusBadge(step.status)}`}>
                  {String(step.status || '').toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-gray-200">{step.step}</div>
                  {(step.note || step.error) && (
                    <div className="text-gray-500">{step.note || step.error}</div>
                  )}
                  {(Number(step.attempts || 0) > 1 || Number(step.retryCount || 0) > 0) && (
                    <div className="text-gray-500">
                      Attempts: {Number(step.attempts || 0)} | Retries: {Number(step.retryCount || 0)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[10px] text-gray-500">No steps recorded.</div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (taskTreeRunList.length === 0) {
      if (selectedTaskTreeRunId) setSelectedTaskTreeRunId('');
      return;
    }
    if (!selectedTaskTreeRunId || !taskTreeRunList.some((run) => run.runId === selectedTaskTreeRunId)) {
      setSelectedTaskTreeRunId(taskTreeRunList[0].runId);
    }
  }, [selectedTaskTreeRunId, taskTreeRunList]);

  useEffect(() => {
    if (actionTaskTreeRunList.length === 0) {
      if (selectedActionTaskTreeRunId) setSelectedActionTaskTreeRunId('');
      return;
    }
    if (!selectedActionTaskTreeRunId || !actionTaskTreeRunList.some((run) => run.runId === selectedActionTaskTreeRunId)) {
      setSelectedActionTaskTreeRunId(actionTaskTreeRunList[0].runId);
    }
  }, [selectedActionTaskTreeRunId, actionTaskTreeRunList]);
  const activeStepConfig = timelineRun && typeof timelineRun.context === 'object'
    ? ((timelineRun.context as any).data?.activeStepConfig || (timelineRun.context as any).source?.activeStepConfig || null)
    : null;
  const activeStepMeta = timelineRun?.currentStepId
    ? timelineSteps.find((step) => step.id === timelineRun.currentStepId) || null
    : null;
  const activeStepLabel = activeStepMeta?.label || activeStepMeta?.actionId || timelineRun?.currentStepId || null;
  const retryDelayMs = Number(activeStepConfig?.retryDelayMs);
  const retryDelayLabel = Number.isFinite(retryDelayMs) && retryDelayMs > 0
    ? (retryDelayMs >= 1000
        ? `${(retryDelayMs / 1000).toFixed(retryDelayMs % 1000 === 0 ? 0 : 1)}s`
        : `${Math.round(retryDelayMs)}ms`)
    : '1.2s';
  const maxRetriesRaw = Number(activeStepConfig?.maxRetries);
  const maxRetries = Number.isFinite(maxRetriesRaw) ? Math.max(0, Math.floor(maxRetriesRaw)) : 0;
  const retryPolicyLine = activeStepLabel
    ? `Retry policy: rate_limit/timeout/network | active step ${activeStepLabel}: maxRetries ${maxRetries}, delay ${retryDelayLabel}`
    : 'Retry policy: rate_limit/timeout/network | per-step maxRetries (default 0), delay 1.2s when enabled';

  return (
    <div className="flex flex-col h-full text-gray-100">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-white/5">
        <div>
          <div className="text-sm font-semibold uppercase tracking-widest text-emerald-300">Backtester</div>
          <div className="text-xs text-gray-500">{dataStatus}</div>
          <div className={`text-[10px] ${computeTone}`}>{computeStatus}</div>
          {manualRunStatus && <div className={`text-[10px] ${manualRunTone}`}>{manualRunStatus}</div>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRun}
            disabled={barsLoading || bars.length === 0}
            className="px-2 py-1 rounded-md text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white disabled:opacity-50"
            title="Run backtest snapshot"
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => loadHistory({ force: true })}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
            title="Refresh history"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10"
            title="Settings"
          >
            Settings
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
          <div className="space-y-4 xl:max-h-[calc(100vh-220px)] xl:overflow-y-auto xl:pr-2 xl:custom-scrollbar">
            <div
              className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '440px' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={symbolInput}
                  onChange={(e) => setSymbolInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSetSymbol();
                    }
                  }}
                  placeholder="Symbol (e.g. BTCUSD)"
                  className="flex-1 min-w-[180px] bg-black/40 border border-white/10 rounded-md px-3 py-1.5 text-sm text-gray-100"
                />
                <button
                  type="button"
                  onClick={handleUseActive}
                  className="px-3 py-1.5 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  Use Active
                </button>
                <button
                  type="button"
                  onClick={handleSetSymbol}
                  className="px-3 py-1.5 rounded-md text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white"
                >
                  Set Symbol
                </button>
              </div>
              <div className="text-[11px] text-gray-500">
                Resolved: <span className="text-gray-200">{resolvedSymbol || '--'}</span>{' '}
                {!isConnected && <span className="text-red-400 ml-2">TradeLocker disconnected</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {RESOLUTIONS.map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => runActionOr('backtester.config.set', { resolution: res }, () => setResolution(res))}
                      className={`px-2 py-1 rounded-md text-xs ${
                        resolution === res
                          ? 'bg-cyan-600 text-white'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span>Range</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_RANGE_DAYS}
                      value={rangeDays}
                      onChange={(e) => setRangeDays(clampRangeDays(Number(e.target.value) || DEFAULT_RANGE_DAYS))}
                      className="w-20 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  <span>days</span>
                  <span className="ml-2">Max bars</span>
                  <input
                    type="number"
                    min={0}
                    max={MAX_BARS}
                    value={maxBars}
                    onChange={(e) => {
                      const next = Math.floor(Number(e.target.value) || 0);
                      setMaxBars(Math.max(0, Math.min(MAX_BARS, next)));
                    }}
                    className="w-24 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                  <span className="text-[10px] text-gray-500">0 = unlimited</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-300">
                  <input
                    type="checkbox"
                    checked={rangeCfg.enabled}
                    onChange={(e) => setRangeCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Range Breakout + ATR
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    Lookback
                    <input
                      type="number"
                      min={5}
                      value={rangeCfg.lookbackBars}
                      onChange={(e) => setRangeCfg((prev) => ({ ...prev, lookbackBars: Math.max(5, Number(e.target.value) || 20) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Cooldown
                    <input
                      type="number"
                      min={0}
                      value={rangeCfg.cooldownBars}
                      onChange={(e) => setRangeCfg((prev) => ({ ...prev, cooldownBars: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Period
                    <input
                      type="number"
                      min={5}
                      value={rangeCfg.atrPeriod}
                      onChange={(e) => setRangeCfg((prev) => ({ ...prev, atrPeriod: Math.max(5, Number(e.target.value) || 14) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Mult
                    <input
                      type="number"
                      step="0.1"
                      min={0.2}
                      value={rangeCfg.atrMult}
                      onChange={(e) => setRangeCfg((prev) => ({ ...prev, atrMult: Math.max(0.2, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    RR
                    <input
                      type="number"
                      step="0.1"
                      min={0.5}
                      value={rangeCfg.rr}
                      onChange={(e) => setRangeCfg((prev) => ({ ...prev, rr: Math.max(0.5, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Breakout
                    <select
                      value={rangeCfg.breakoutMode}
                      onChange={(e) => setRangeCfg((prev) => ({ ...prev, breakoutMode: e.target.value === 'wick' ? 'wick' : 'close' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="close">Close</option>
                      <option value="wick">Wick</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Buffer ATR
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={rangeCfg.bufferAtrMult}
                      onChange={(e) => setRangeCfg((prev) => ({ ...prev, bufferAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-300">
                  <input
                    type="checkbox"
                    checked={breakCfg.enabled}
                    onChange={(e) => setBreakCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Break + Retest
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    Lookback
                    <input
                      type="number"
                      min={5}
                      value={breakCfg.lookbackBars}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, lookbackBars: Math.max(5, Number(e.target.value) || 20) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Retest Bars
                    <input
                      type="number"
                      min={1}
                      value={breakCfg.retestBars}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, retestBars: Math.max(1, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Period
                    <input
                      type="number"
                      min={5}
                      value={breakCfg.atrPeriod}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, atrPeriod: Math.max(5, Number(e.target.value) || 14) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Mult
                    <input
                      type="number"
                      step="0.1"
                      min={0.2}
                      value={breakCfg.atrMult}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, atrMult: Math.max(0.2, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    RR
                    <input
                      type="number"
                      step="0.1"
                      min={0.5}
                      value={breakCfg.rr}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, rr: Math.max(0.5, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Breakout
                    <select
                      value={breakCfg.breakoutMode}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, breakoutMode: e.target.value === 'wick' ? 'wick' : 'close' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="close">Close</option>
                      <option value="wick">Wick</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Retest Confirm
                    <select
                      value={breakCfg.retestConfirm}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, retestConfirm: e.target.value === 'close' ? 'close' : 'touch' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="touch">Touch</option>
                      <option value="close">Close</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Retest Buffer
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={breakCfg.retestBufferAtrMult}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, retestBufferAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Cooldown
                    <input
                      type="number"
                      min={0}
                      value={breakCfg.cooldownBars}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, cooldownBars: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Buffer ATR
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={breakCfg.bufferAtrMult}
                      onChange={(e) => setBreakCfg((prev) => ({ ...prev, bufferAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-300">
                  <input
                    type="checkbox"
                    checked={fvgCfg.enabled}
                    onChange={(e) => setFvgCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  FVG Retrace (Gap Fill)
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    ATR Period
                    <input
                      type="number"
                      min={5}
                      value={fvgCfg.atrPeriod}
                      onChange={(e) => setFvgCfg((prev) => ({ ...prev, atrPeriod: Math.max(5, Number(e.target.value) || 14) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Mult
                    <input
                      type="number"
                      step="0.1"
                      min={0.1}
                      value={fvgCfg.atrMult}
                      onChange={(e) => setFvgCfg((prev) => ({ ...prev, atrMult: Math.max(0.1, Number(e.target.value) || 0.5) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    RR
                    <input
                      type="number"
                      step="0.1"
                      min={0.5}
                      value={fvgCfg.rr}
                      onChange={(e) => setFvgCfg((prev) => ({ ...prev, rr: Math.max(0.5, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Max Wait
                    <input
                      type="number"
                      min={10}
                      value={fvgCfg.maxWaitBars}
                      onChange={(e) => setFvgCfg((prev) => ({ ...prev, maxWaitBars: Math.max(10, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Min Gap ATR
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={fvgCfg.minGapAtrMult}
                      onChange={(e) => setFvgCfg((prev) => ({ ...prev, minGapAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Entry
                    <select
                      value={fvgCfg.entryMode}
                      onChange={(e) => setFvgCfg((prev) => ({ ...prev, entryMode: e.target.value === 'edge' ? 'edge' : 'mid' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="mid">Mid</option>
                      <option value="edge">Edge</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-300">
                  <input
                    type="checkbox"
                    checked={trendCfg.enabled}
                    onChange={(e) => setTrendCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Trend Pullback (EMA)
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    Fast EMA
                    <input
                      type="number"
                      min={2}
                      value={trendCfg.fastEma}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, fastEma: Math.max(2, Number(e.target.value) || 20) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Slow EMA
                    <input
                      type="number"
                      min={5}
                      value={trendCfg.slowEma}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, slowEma: Math.max(5, Number(e.target.value) || 50) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Pullback EMA
                    <select
                      value={trendCfg.pullbackEma}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, pullbackEma: e.target.value === 'slow' ? 'slow' : 'fast' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="fast">Fast</option>
                      <option value="slow">Slow</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Confirm
                    <select
                      value={trendCfg.confirmMode}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, confirmMode: e.target.value === 'touch' ? 'touch' : 'close' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="close">Close</option>
                      <option value="touch">Touch</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Min Trend Bars
                    <input
                      type="number"
                      min={1}
                      value={trendCfg.minTrendBars}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, minTrendBars: Math.max(1, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Period
                    <input
                      type="number"
                      min={5}
                      value={trendCfg.atrPeriod}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, atrPeriod: Math.max(5, Number(e.target.value) || 14) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Mult
                    <input
                      type="number"
                      step="0.1"
                      min={0.2}
                      value={trendCfg.atrMult}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, atrMult: Math.max(0.2, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    RR
                    <input
                      type="number"
                      step="0.1"
                      min={0.5}
                      value={trendCfg.rr}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, rr: Math.max(0.5, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Cooldown
                    <input
                      type="number"
                      min={0}
                      value={trendCfg.cooldownBars}
                      onChange={(e) => setTrendCfg((prev) => ({ ...prev, cooldownBars: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-300">
                  <input
                    type="checkbox"
                    checked={meanCfg.enabled}
                    onChange={(e) => setMeanCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Mean Reversion (ATR Band)
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    SMA Period
                    <input
                      type="number"
                      min={5}
                      value={meanCfg.smaPeriod}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, smaPeriod: Math.max(5, Number(e.target.value) || 50) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    ATR Period
                    <input
                      type="number"
                      min={5}
                      value={meanCfg.atrPeriod}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, atrPeriod: Math.max(5, Number(e.target.value) || 14) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Band ATR
                    <input
                      type="number"
                      step="0.1"
                      min={0.5}
                      value={meanCfg.bandAtrMult}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, bandAtrMult: Math.max(0.5, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Stop ATR
                    <input
                      type="number"
                      step="0.1"
                      min={0.2}
                      value={meanCfg.stopAtrMult}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, stopAtrMult: Math.max(0.2, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    RR
                    <input
                      type="number"
                      step="0.1"
                      min={0.5}
                      value={meanCfg.rr}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, rr: Math.max(0.5, Number(e.target.value) || 1) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Cooldown
                    <input
                      type="number"
                      min={0}
                      value={meanCfg.cooldownBars}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, cooldownBars: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-300 col-span-2">
                    <input
                      type="checkbox"
                      checked={meanCfg.useRsiFilter}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, useRsiFilter: e.target.checked }))}
                    />
                    RSI filter
                  </label>
                  <label className="flex flex-col gap-1">
                    RSI Period
                    <input
                      type="number"
                      min={5}
                      value={meanCfg.rsiPeriod}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, rsiPeriod: Math.max(5, Number(e.target.value) || 14) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={!meanCfg.useRsiFilter}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    RSI Oversold
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={meanCfg.rsiOversold}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, rsiOversold: Math.max(5, Math.min(50, Number(e.target.value) || 30)) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={!meanCfg.useRsiFilter}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    RSI Overbought
                    <input
                      type="number"
                      min={50}
                      max={95}
                      value={meanCfg.rsiOverbought}
                      onChange={(e) => setMeanCfg((prev) => ({ ...prev, rsiOverbought: Math.max(50, Math.min(95, Number(e.target.value) || 70)) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={!meanCfg.useRsiFilter}
                    />
                  </label>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2 md:col-span-2">
                <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-300">
                  <input
                    type="checkbox"
                    checked={confluenceCfg.enabled}
                    onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Multi-TF Confluence
                </label>
                <div className="text-[11px] text-gray-500">
                  {confluenceCfg.enabled
                    ? htfLoading
                      ? 'Loading HTF bars...'
                      : htfBars.length > 0
                        ? `HTF bars ${htfBars.length} | ${confluenceCfg.htfResolution} | ${htfCached ? 'cache' : 'broker'} | Updated ${formatAge(htfUpdatedAtMs)}`
                        : htfError || 'HTF data not loaded.'
                    : 'HTF filter disabled.'}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    HTF Resolution
                    <select
                      value={confluenceCfg.htfResolution}
                      onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, htfResolution: e.target.value }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={!confluenceCfg.enabled}
                    >
                      {RESOLUTIONS.map((res) => (
                        <option key={res} value={res}>{res}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Bias Mode
                    <select
                      value={confluenceCfg.biasMode}
                      onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, biasMode: e.target.value as ConfluenceConfig['biasMode'] }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={!confluenceCfg.enabled}
                    >
                      <option value="ema">EMA Trend</option>
                      <option value="sma">SMA Close</option>
                      <option value="range">Range Break</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Bias At
                    <select
                      value={confluenceCfg.biasReference}
                      onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, biasReference: e.target.value === 'signal' ? 'signal' : 'entry' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={!confluenceCfg.enabled}
                    >
                      <option value="entry">Entry</option>
                      <option value="signal">Signal</option>
                    </select>
                  </label>
                  {confluenceCfg.biasMode === 'ema' && (
                    <>
                      <label className="flex flex-col gap-1">
                        EMA Fast
                        <input
                          type="number"
                          min={2}
                          value={confluenceCfg.emaFast}
                          onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, emaFast: Math.max(2, Number(e.target.value) || 20) }))}
                          className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                          disabled={!confluenceCfg.enabled}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        EMA Slow
                        <input
                          type="number"
                          min={5}
                          value={confluenceCfg.emaSlow}
                          onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, emaSlow: Math.max(5, Number(e.target.value) || 50) }))}
                          className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                          disabled={!confluenceCfg.enabled}
                        />
                      </label>
                    </>
                  )}
                  {confluenceCfg.biasMode === 'sma' && (
                    <label className="flex flex-col gap-1">
                      SMA Period
                      <input
                        type="number"
                        min={5}
                        value={confluenceCfg.smaPeriod}
                        onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, smaPeriod: Math.max(5, Number(e.target.value) || 50) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!confluenceCfg.enabled}
                      />
                    </label>
                  )}
                  {confluenceCfg.biasMode === 'range' && (
                    <label className="flex flex-col gap-1">
                      Range Lookback
                      <input
                        type="number"
                        min={5}
                        value={confluenceCfg.rangeLookback}
                        onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, rangeLookback: Math.max(5, Number(e.target.value) || 20) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!confluenceCfg.enabled}
                      />
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                    <input
                      type="checkbox"
                      checked={confluenceCfg.allowNeutral}
                      onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, allowNeutral: e.target.checked }))}
                      disabled={!confluenceCfg.enabled}
                    />
                    Allow neutral
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                    <input
                      type="checkbox"
                      checked={confluenceCfg.usePrevHtfBar}
                      onChange={(e) => setConfluenceCfg((prev) => ({ ...prev, usePrevHtfBar: e.target.checked }))}
                      disabled={!confluenceCfg.enabled}
                    />
                    Use closed HTF bar
                  </label>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3 md:col-span-2">
                <div className="text-xs uppercase tracking-wider text-gray-300">Execution & Realism</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    <label className="flex flex-col gap-1">
                      Realism Preset
                      <select
                        value={execRealismPreset}
                        onChange={(e) => {
                          const next = e.target.value as RealismPresetLevel;
                          setExecRealismPreset(next);
                          if (next !== 'custom') applyExecutionPreset(next as Exclude<RealismPresetLevel, 'custom'>);
                        }}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      >
                        <option value="custom">Custom</option>
                        <option value="lite">{EXECUTION_REALISM_PRESETS.lite.label}</option>
                        <option value="standard">{EXECUTION_REALISM_PRESETS.standard.label}</option>
                        <option value="strict">{EXECUTION_REALISM_PRESETS.strict.label}</option>
                      </select>
                    </label>
                    <div className="col-span-2 md:col-span-2 text-[11px] text-gray-400 mt-5">
                      Applies execution realism (costs, slippage, partial fills, news spikes) without changing strategy rules.
                    </div>
                    <label className="flex flex-col gap-1">
                      Entry Timing
                      <select
                      value={execCfg.entryTiming}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, entryTiming: e.target.value === 'signal_close' ? 'signal_close' : 'next_open' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="next_open">Next Open</option>
                      <option value="signal_close">Signal Close</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Entry Order
                    <select
                      value={execCfg.entryOrderType}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, entryOrderType: e.target.value as ExecutionConfig['entryOrderType'] }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="market">Market</option>
                      <option value="limit">Limit</option>
                      <option value="stop">Stop</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Entry Delay Bars
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={execCfg.entryDelayBars}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, entryDelayBars: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Max Entry Wait
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={execCfg.maxEntryWaitBars}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, maxEntryWaitBars: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.entryOrderType === 'market'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Exit Mode
                    <select
                      value={execCfg.exitMode}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, exitMode: e.target.value === 'close' ? 'close' : 'touch' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="touch">Touch</option>
                      <option value="close">Close</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                    <input
                      type="checkbox"
                      checked={execCfg.allowSameBarExit}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, allowSameBarExit: e.target.checked }))}
                    />
                    Allow same-bar exit
                  </label>
                  <label className="flex flex-col gap-1">
                    Spread Model
                    <select
                      value={execCfg.spreadModel}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, spreadModel: e.target.value as ExecutionConfig['spreadModel'] }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="none">None</option>
                      <option value="fixed">Fixed</option>
                      <option value="atr">ATR</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Spread Value
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.spreadValue}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, spreadValue: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.spreadModel !== 'fixed'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Spread ATR
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={execCfg.spreadAtrMult}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, spreadAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.spreadModel !== 'atr'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Spread %
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.spreadPct}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, spreadPct: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.spreadModel !== 'percent'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Max Spread
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.maxSpreadValue}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, maxSpreadValue: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Slippage Model
                    <select
                      value={execCfg.slippageModel}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, slippageModel: e.target.value as ExecutionConfig['slippageModel'] }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="none">None</option>
                      <option value="fixed">Fixed</option>
                      <option value="atr">ATR</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Slippage Value
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.slippageValue}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, slippageValue: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.slippageModel !== 'fixed'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Slippage ATR
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={execCfg.slippageAtrMult}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, slippageAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.slippageModel !== 'atr'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Slippage %
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.slippagePct}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, slippagePct: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.slippageModel !== 'percent'}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                    <input
                      type="checkbox"
                      checked={execCfg.slippageOnExit}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, slippageOnExit: e.target.checked }))}
                    />
                    Apply slippage on exit
                  </label>
                  <label className="flex flex-col gap-1">
                    Commission Model
                    <select
                      value={execCfg.commissionModel}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, commissionModel: e.target.value as ExecutionConfig['commissionModel'] }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="none">None</option>
                      <option value="fixed">Fixed</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Commission Value
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.commissionValue}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, commissionValue: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.commissionModel !== 'fixed'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Commission %
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.commissionPct}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, commissionPct: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      disabled={execCfg.commissionModel !== 'percent'}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Min Stop Value
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={execCfg.minStopValue}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, minStopValue: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Min Stop ATR
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={execCfg.minStopAtrMult}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, minStopAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    Min Stop Mode
                    <select
                      value={execCfg.minStopMode}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, minStopMode: e.target.value === 'skip' ? 'skip' : 'adjust' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="adjust">Adjust</option>
                      <option value="skip">Skip</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    Session Filter
                    <select
                      value={execCfg.sessionFilter}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, sessionFilter: e.target.value as ExecutionConfig['sessionFilter'] }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="all">All</option>
                      <option value="asia">Asia</option>
                      <option value="london">London</option>
                      <option value="ny">NY</option>
                    </select>
                  </label>
                    <label className="flex flex-col gap-1">
                      Session TZ
                      <select
                        value={execCfg.sessionTimezone}
                      onChange={(e) => setExecCfg((prev) => ({ ...prev, sessionTimezone: e.target.value === 'local' ? 'local' : 'utc' }))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="utc">UTC</option>
                      <option value="local">Local</option>
                      </select>
                    </label>
                    <div className="col-span-2 md:col-span-3 pt-2 text-[11px] uppercase tracking-wider text-gray-300">
                      Session Cost Multipliers
                    </div>
                    <label className="flex flex-col gap-1">
                      Asia Spread x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={asiaCost.spreadMult}
                        onChange={(e) => updateSessionOverride('asia', { spreadMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Asia Slippage x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={asiaCost.slippageMult}
                        onChange={(e) => updateSessionOverride('asia', { slippageMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Asia Commission x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={asiaCost.commissionMult}
                        onChange={(e) => updateSessionOverride('asia', { commissionMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      London Spread x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={londonCost.spreadMult}
                        onChange={(e) => updateSessionOverride('london', { spreadMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      London Slippage x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={londonCost.slippageMult}
                        onChange={(e) => updateSessionOverride('london', { slippageMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      London Commission x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={londonCost.commissionMult}
                        onChange={(e) => updateSessionOverride('london', { commissionMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      NY Spread x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={nyCost.spreadMult}
                        onChange={(e) => updateSessionOverride('ny', { spreadMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      NY Slippage x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={nyCost.slippageMult}
                        onChange={(e) => updateSessionOverride('ny', { slippageMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      NY Commission x
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={nyCost.commissionMult}
                        onChange={(e) => updateSessionOverride('ny', { commissionMult: Math.max(0, Number(e.target.value) || 0) })}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <div className="col-span-2 md:col-span-3 pt-2 text-[11px] uppercase tracking-wider text-gray-300">
                      Volatility Slippage
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                      <input
                        type="checkbox"
                        checked={execCfg.volatilitySlippageEnabled}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, volatilitySlippageEnabled: e.target.checked }))}
                      />
                      Enable volatility multiplier
                    </label>
                    <label className="flex flex-col gap-1">
                      Vol Lookback
                      <input
                        type="number"
                        min={5}
                        step={1}
                        value={execCfg.volatilitySlippageLookback}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, volatilitySlippageLookback: Math.max(5, Math.floor(Number(e.target.value) || 5)) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!execCfg.volatilitySlippageEnabled}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Vol Low Thresh
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={execCfg.volatilitySlippageLowThresh}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, volatilitySlippageLowThresh: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!execCfg.volatilitySlippageEnabled}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Vol High Thresh
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={execCfg.volatilitySlippageHighThresh}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, volatilitySlippageHighThresh: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!execCfg.volatilitySlippageEnabled}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Vol Low Mult
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={execCfg.volatilitySlippageLowMult}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, volatilitySlippageLowMult: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!execCfg.volatilitySlippageEnabled}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Vol Mid Mult
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={execCfg.volatilitySlippageMidMult}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, volatilitySlippageMidMult: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!execCfg.volatilitySlippageEnabled}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Vol High Mult
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={execCfg.volatilitySlippageHighMult}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, volatilitySlippageHighMult: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={!execCfg.volatilitySlippageEnabled}
                      />
                    </label>
                    <div className="col-span-2 md:col-span-3 pt-2 text-[11px] uppercase tracking-wider text-gray-300">
                      Partial Fill + News Spike
                    </div>
                    <label className="flex flex-col gap-1">
                      Partial Fill
                      <select
                        value={execCfg.partialFillMode}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, partialFillMode: e.target.value === 'range' ? 'range' : 'none' }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      >
                        <option value="none">Off</option>
                        <option value="range">Range-based</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      Partial ATR Mult
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        value={execCfg.partialFillAtrMult}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, partialFillAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={execCfg.partialFillMode === 'none'}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Partial Min Ratio
                      <input
                        type="number"
                        step="0.05"
                        min={0}
                        max={1}
                        value={execCfg.partialFillMinRatio}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, partialFillMinRatio: clampNumber(Number(e.target.value), 0, 1) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        disabled={execCfg.partialFillMode === 'none'}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                      <input
                        type="checkbox"
                        checked={execCfg.partialFillOnExit}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, partialFillOnExit: e.target.checked }))}
                        disabled={execCfg.partialFillMode === 'none'}
                      />
                      Apply on exit
                    </label>
                    <label className="flex flex-col gap-1">
                      News Spike ATR
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={execCfg.newsSpikeAtrMult}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, newsSpikeAtrMult: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Spike Slip Mult
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={execCfg.newsSpikeSlippageMult}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, newsSpikeSlippageMult: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Spike Spread Mult
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={execCfg.newsSpikeSpreadMult}
                        onChange={(e) => setExecCfg((prev) => ({ ...prev, newsSpikeSpreadMult: Math.max(0, Number(e.target.value) || 0) }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                  </div>
                </div>
            </div>

            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading replay...</div>}>
              <ReplayChartPanel
                ctx={{
                  replayEnabled,
                  runActionOr,
                  setReplayEnabled,
                  setReplayIndex,
                  isPlaying,
                  setIsPlaying,
                  bars,
                  playSpeed,
                  setPlaySpeed,
                  tieBreaker,
                  setTieBreaker,
                  replayBar,
                  formatTs,
                  replayCutoffIndex,
                  canvasWrapRef,
                  canvasRef,
                  handleCanvasClick,
                  lastBar,
                  formatPrice
                }}
              />
            </React.Suspense>
          <div className="space-y-4 xl:max-h-[calc(100vh-220px)] xl:overflow-y-auto xl:pr-2 xl:custom-scrollbar">
            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading timeline...</div>}>
              <TimelineTruthPanel
                ctx={{
                  timelineRun,
                  onResumePlaybookRun,
                  statusBadge,
                  retryPolicyLine,
                  formatRunTime,
                  blockedStep,
                  blockedHeader,
                  blockedNote,
                  blockedIsMissing,
                  getResumeDraft,
                  updateResumeDraft,
                  runResume,
                  timelineStepFilters,
                  setTimelineStepFilters,
                  timelineFilterOptions,
                  timelineSteps: filteredTimelineSteps,
                  taskTreeResumeQueue: taskTreeResumeList,
                  onResumeTaskTreeRun,
                  taskTreeRunList,
                  actionTaskTreeRunList,
                  selectedTaskTreeRun,
                  selectedTaskTreeRunId,
                  setSelectedTaskTreeRunId,
                  selectedActionTaskTreeRun,
                  selectedActionTaskTreeRunId,
                  setSelectedActionTaskTreeRunId,
                  renderTaskTreeRun,
                  taskTruthRunId,
                  taskTruthUpdatedAtMs,
                  setTaskTruthRunId,
                  taskTruthError,
                  filteredTaskTruthEvents,
                  truthLevelBadge
                }}
              />
            </React.Suspense>

            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading stats...</div>}>
              <StatsPerformancePanel
                ctx={{
                  stats,
                  formatPercent,
                  currentHtfBias,
                  confluenceCfg,
                  htfError,
                  performance,
                  formatR,
                  maxDrawdownLabel,
                  avgHoldLabel,
                  equityCanvasRef
                }}
              />
            </React.Suspense>

            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading validation...</div>}>
              <ValidationPanel
                ctx={{
                  validationCfg,
                  setValidationCfg,
                  validationData,
                  formatTs,
                  formatPercent,
                  formatR,
                  walkForwardCfg,
                  setWalkForwardCfg,
                  walkForwardData,
                  walkForwardCanvasRef,
                  replayTrades,
                  selectedTrade,
                  formatPrice,
                  jumpToIndex,
                  selectTrade,
                  selectedTradeId,
                  htfBiasLabel
                }}
              />
            </React.Suspense>

            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading optimizer settings...</div>}>
              <StrategyConfigPanel
                ctx={{
                  seedOptimizerFromCurrent,
                  autoApplyTopOptimizer,
                  optimizerResults,
                  runOptimizer,
                  optimizerRunning,
                  barsLoading,
                  optimizerCfg,
                  setOptimizerCfg,
                  optimizerPresets,
                  optimizerPresetName,
                  setOptimizerPresetName,
                  setOptimizerPresetError,
                  setOptimizerPresetStatus,
                  optimizerPresetId,
                  setOptimizerPresetId,
                  handleSaveOptimizerPreset,
                  handleLoadOptimizerPreset,
                  handleDeleteOptimizerPreset,
                  handleCopyOptimizerPresets,
                  handleDownloadOptimizerPresets,
                  optimizerImportRef,
                  handlePresetFileChange,
                  selectedOptimizerPreset,
                  formatAge,
                  optimizerPresetError,
                  optimizerPresetStatus,
                  optimizerSummary,
                  optimizerError,
                  formatR,
                  formatPercent,
                  optimizerAppliedId,
                  applyOptimizerResult
                }}
              />
            </React.Suspense>
            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading optimizer loop...</div>}>
              <OptimizerLoopPanel
                ctx={{
                  clearOptimizerLoop,
                  optimizerLoopRunning,
                  optimizerLoopResults,
                  optimizerLoopError,
                  runOptimizerLoop,
                  barsLoading,
                  optimizerLoopPresetId,
                  setOptimizerLoopPresetId,
                  loopPresets: DEFAULT_LOOP_PRESETS,
                  batchStrategy,
                  setBatchStrategy,
                  batchRangeDays,
                  setBatchRangeDays,
                  maxRangeDays: MAX_RANGE_DAYS,
                  clampRangeDays,
                  batchMaxCombos,
                  setBatchMaxCombos,
                  optimizerLoopSession,
                  optimizerLoopCandidate,
                  formatPercent,
                  formatR,
                  formatEdgeMargin,
                  formatLoopParams,
                  formatLoopDiagnostics,
                  applyOptimizerLoopCandidate,
                  optimizerLoopAppliedStatus,
                  optimizerLoopApplyError,
                  optimizerLoopApplyWarnings
                }}
              />
            </React.Suspense>
            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading batch optimizer...</div>}>
              <BatchOptimizerPanel
                ctx={{
                  clearBatchResults,
                  batchRunning,
                  batchResults,
                  handleExportBatchCsv,
                  handleExportBatchJson,
                  cancelBatchOptimization,
                  runBatchOptimization,
                  batchSymbolsInput,
                  setBatchSymbolsInput,
                  batchTimeframesInput,
                  setBatchTimeframesInput,
                  batchStrategy,
                  setBatchStrategy,
                  batchRangeDays,
                  setBatchRangeDays,
                  maxRangeDays: MAX_RANGE_DAYS,
                  clampRangeDays,
                  defaultRangeDays: DEFAULT_RANGE_DAYS,
                  batchMaxCombos,
                  setBatchMaxCombos,
                  batchPresets,
                  batchPresetName,
                  setBatchPresetName,
                  setBatchPresetError,
                  setBatchPresetStatus,
                  batchPresetId,
                  setBatchPresetId,
                  handleSaveBatchPreset,
                  handleLoadBatchPreset,
                  handleDeleteBatchPreset,
                  selectedBatchPreset,
                  formatAge,
                  batchPresetError,
                  batchPresetStatus,
                  batchAutoApplyRunning,
                  batchAutoApplyCount,
                  setBatchAutoApplyCount,
                  stopBatchAutoApply,
                  startBatchAutoApply,
                  batchAutoApplyStatus,
                  batchProgressLabel,
                  batchProgressPct,
                  batchSummary,
                  formatDurationMs,
                  batchOkCount,
                  batchFailCount,
                  batchError,
                  formatR,
                  formatPercent,
                  formatBatchParams,
                  applyOptimization
                }}
              />
            </React.Suspense>
            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading training pack...</div>}>
              <TrainingPackPanel
                ctx={{
                  trainingEpisodes,
                  trainingTrimmed,
                  replayEnabled,
                  replayBar,
                  formatTs,
                  copyTrainingJson,
                  downloadTrainingJson,
                  sendTrainingSummary,
                  handleSendToWatchlist,
                  watchlistMode,
                  setWatchlistMode,
                  watchlistApplyToChart,
                  setWatchlistApplyToChart,
                  watchlistStatus,
                  watchlistError,
                  sendBacktestSummary,
                  onSendTrainingMessage,
                  autoSummaryEnabled,
                  setAutoSummaryEnabled,
                  autoSummaryIntervalMin,
                  setAutoSummaryIntervalMin,
                  autoSummaryLastSentAt,
                  formatAge,
                  barsError
                }}
              />
            </React.Suspense>

            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading research autopilot...</div>}>
              <ResearchAutopilotPanel
                ctx={{
                  loadExperimentNotes,
                  experimentsUpdatedAtMs,
                  formatAge,
                  experimentsLoading,
                  experimentNotes,
                  formatR,
                  applyExperimentNote,
                  experimentsError,
                  runResearchAutopilot,
                  researchRunning,
                  resumeResearchAutopilot,
                  stopResearchAutopilot,
                  researchSession,
                  refreshResearchAutopilot,
                  exportResearchAutopilot,
                  promoteResearchChampion,
                  canPromoteChampion,
                  researchUpdatedAtMs,
                  researchPresetId,
                  setResearchPresetId,
                  loopPresets: DEFAULT_LOOP_PRESETS,
                  researchMaxExperiments,
                  setResearchMaxExperiments,
                  batchMaxCombos,
                  setBatchMaxCombos,
                  researchRobustness,
                  setResearchRobustness,
                  researchAdvancedOpen,
                  setResearchAdvancedOpen,
                  researchRegimeOverrides,
                  setResearchRegimeOverrides,
                  effectiveRegimePassRate,
                  setResearchRequiredRegimePassRate,
                  effectiveMinRegimesSeen,
                  setResearchMinRegimesSeen,
                  effectiveAllowRegimeBrittle,
                  setResearchAllowRegimeBrittle,
                  effectiveCriticalRegimes,
                  knownRegimeKeys: KNOWN_REGIME_KEYS,
                  setResearchCriticalRegimes,
                  researchCriticalRegimesExtra,
                  setResearchCriticalRegimesExtra,
                  researchChampion,
                  researchChampionMetrics,
                  formatEdgeMargin,
                  researchChampionWorst,
                  researchTargetRegimeKey,
                  researchTargetOutcome,
                  researchTargetMinSamples,
                  researchRegimeCoverage,
                  researchRegimeRows,
                  applyRegimeChampion,
                  promoteRegimeChampion,
                  onCreateWatchProfile,
                  researchSteps,
                  researchError,
                  researchStatus,
                  formatPercent
                }}
              />
            </React.Suspense>

            <React.Suspense fallback={<div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-gray-500">Loading agent memory...</div>}>
              <AgentMemoryPanel
                ctx={{
                  agentMemorySymbol,
                  setAgentMemorySymbol,
                  agentMemoryTimeframe,
                  setAgentMemoryTimeframe,
                  agentMemoryKind,
                  setAgentMemoryKind,
                  agentMemoryAgentId,
                  setAgentMemoryAgentId,
                  agentMemoryScope,
                  setAgentMemoryScope,
                  agentMemoryCategory,
                  setAgentMemoryCategory,
                  agentMemorySubcategory,
                  setAgentMemorySubcategory,
                  agentMemoryLimit,
                  setAgentMemoryLimit,
                  memoryPresets,
                  memoryPresetName,
                  setMemoryPresetName,
                  setMemoryPresetError,
                  setMemoryPresetStatus,
                  memoryPresetId,
                  setMemoryPresetId,
                  handleSaveMemoryPreset,
                  handleLoadMemoryPreset,
                  handleDeleteMemoryPreset,
                  memoryPresetError,
                  memoryPresetStatus,
                  handleUseCurrentMemoryFilters,
                  loadAgentMemory,
                  agentMemoryUpdatedAtMs,
                  formatAge,
                  agentMemoryQuery,
                  setAgentMemoryQuery,
                  agentMemoryLoading,
                  filteredAgentMemory,
                  agentMemoryExpandedId,
                  setAgentMemoryExpandedId,
                  agentMemoryError
                }}
              />
            </React.Suspense>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
});

const MemoBacktesterInterface = React.memo(BacktesterInterface);

export default MemoBacktesterInterface;


