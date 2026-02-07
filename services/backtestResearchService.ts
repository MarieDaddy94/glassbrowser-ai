import {
  DEFAULT_BREAK_RETEST_CONFIG as DEFAULT_BREAK_CFG,
  DEFAULT_FVG_RETRACE_CONFIG as DEFAULT_FVG_CFG,
  DEFAULT_MEAN_REVERSION_CONFIG as DEFAULT_MEAN_CFG,
  DEFAULT_RANGE_BREAKOUT_CONFIG as DEFAULT_RANGE_CFG,
  DEFAULT_TREND_PULLBACK_CONFIG as DEFAULT_TREND_CFG,
  generateBreakRetestTrades,
  generateFvgRetraceTrades,
  generateMeanReversionTrades,
  generateRangeBreakoutTrades,
  generateTrendPullbackTrades,
  simulateTrades,
  summarizeTrades,
  type BacktestStats,
  type BreakRetestConfig,
  type Candle,
  type ExecutionConfig,
  type FvgRetraceConfig,
  type MeanReversionConfig,
  type RangeBreakoutConfig,
  type TrendPullbackConfig
} from './backtestEngine';
import { normalizeExecutionConfig } from './executionModel';
import { normalizeTimeframeKey } from './symbols';
import { getCacheBudgetManager } from './cacheBudgetManager';
import { requestBrokerCoordinated } from './brokerRequestBridge';

export type BacktestOptimizationStrategy =
  | 'RANGE_BREAKOUT'
  | 'BREAK_RETEST'
  | 'FVG_RETRACE'
  | 'TREND_PULLBACK'
  | 'MEAN_REVERSION';

export type TimeFilter = {
  startHour?: number;
  endHour?: number;
  timezone?: 'utc' | 'local';
};

export type BacktestParamGrid = {
  lookbackBars?: number[];
  atrPeriod?: number[];
  atrMult?: number[];
  rr?: number[];
  cooldownBars?: number[];
  breakoutMode?: Array<'close' | 'wick'>;
  bufferAtrMult?: number[];
  retestBars?: number[];
  retestBufferAtrMult?: number[];
  retestConfirm?: Array<'touch' | 'close'>;
  maxWaitBars?: number[];
  entryMode?: Array<'mid' | 'edge'>;
  minGapAtrMult?: number[];
  fastEma?: number[];
  slowEma?: number[];
  pullbackEma?: Array<'fast' | 'slow'>;
  confirmMode?: Array<'touch' | 'close'>;
  minTrendBars?: number[];
  smaPeriod?: number[];
  bandAtrMult?: number[];
  stopAtrMult?: number[];
  useRsiFilter?: boolean[];
  rsiPeriod?: number[];
  rsiOversold?: number[];
  rsiOverbought?: number[];
};

export type BacktestOptimizationRequest = {
  symbol: string;
  strategy: BacktestOptimizationStrategy;
  timeframe?: string;
  rangeDays?: number;
  timeFilter?: TimeFilter;
  paramGrid: BacktestParamGrid;
  maxCombos?: number;
  execution?: Partial<ExecutionConfig>;
};

export type BacktestOptimizationResult = {
  ok: boolean;
  schemaVersion: number;
  runId: string;
  symbol: string;
  strategy: BacktestOptimizationStrategy;
  timeframe: string;
  rangeDays: number;
  bars: number;
  combosTested: number;
  combosRequested: number;
  truncated: boolean;
  cancelled?: boolean;
  bestConfig?: BacktestOptimizationEntry | null;
  topConfigs?: BacktestOptimizationEntry[];
  allConfigs?: BacktestOptimizationEntry[];
  summary?: string;
  error?: string;
  ranAtMs: number;
  elapsedMs: number;
  history?: {
    fromMs: number;
    toMs: number;
    chunks: number;
    cached: boolean;
  };
};

export type BacktestOptimizationHistory = {
  fromMs: number;
  toMs: number;
  chunks: number;
  cached: boolean;
};

export type BacktestOptimizationHistoryResult = {
  ok: boolean;
  runId: string;
  startedAtMs: number;
  symbol: string;
  timeframe: string;
  rangeDays: number;
  maxCombos: number;
  bars: Candle[];
  history?: BacktestOptimizationHistory;
  request?: BacktestOptimizationRequest;
  error?: string;
  rateLimited?: boolean;
  retryAtMs?: number;
};

export type BacktestOptimizationEntry = {
  params: Record<string, any>;
  stats: BacktestStats;
  performance: {
    netR: number;
    maxDrawdown: number;
  };
};

export type BacktestOptimizationProgress = {
  done: number;
  total: number;
  label?: string;
};

export type BacktestOptimizationOptions = {
  onProgress?: (progress: BacktestOptimizationProgress) => void;
  shouldCancel?: () => boolean;
  progressInterval?: number;
  includeResults?: boolean;
};

const DEFAULT_RANGE_DAYS = 90;
const DEFAULT_TIMEFRAME = '15m';
const DEFAULT_MAX_COMBOS = 200;
const MAX_RANGE_DAYS = 10000;
const BACKTEST_OPT_SCHEMA_VERSION = 1;
const HISTORY_CHUNK_MAX_BARS = 20000;
const HISTORY_CACHE_TTL_MS = 120_000;
const HISTORY_CACHE_MAX = 6;
const HISTORY_INFLIGHT_MAX = 24;
const HISTORY_REQUEST_MIN_INTERVAL_MS = 1100;
const HISTORY_REQUEST_MAX_AGE_MS = 120_000;
const HISTORY_RATE_LIMIT_DEFAULT_MS = 15_000;

const HISTORY_TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1H': 60 * 60_000,
  '4H': 4 * 60 * 60_000,
  '1D': 24 * 60 * 60_000
};

const historyCache = new Map<string, { bars: Candle[]; fetchedAtMs: number; fromMs: number; toMs: number; chunks: number }>();
const historyInFlight = new Map<string, Promise<any>>();
const historyInFlightBudget = new Map<string, { createdAtMs: number }>();
let historyRateLimitedUntilMs = 0;
let historyLastRequestAtMs = 0;
let historyRequestChain: Promise<void> = Promise.resolve();
const cacheBudgetManager = getCacheBudgetManager();
cacheBudgetManager.register({
  name: 'backtestResearch.historyCache',
  maxEntries: HISTORY_CACHE_MAX,
  maxAgeMs: HISTORY_CACHE_TTL_MS
});
cacheBudgetManager.register({
  name: 'backtestResearch.inFlight',
  maxEntries: HISTORY_INFLIGHT_MAX,
  maxAgeMs: 120_000
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const queueHistoryRequest = async <T>(fn: () => Promise<T>) => {
  const run = async () => fn();
  const result = historyRequestChain.then(run, run);
  historyRequestChain = result.then(() => undefined, () => undefined);
  return result;
};

const noteHistoryRateLimit = (retryAtMs?: number | null) => {
  const now = Date.now();
  const next = Number.isFinite(Number(retryAtMs)) ? Number(retryAtMs) : now + HISTORY_RATE_LIMIT_DEFAULT_MS;
  historyRateLimitedUntilMs = Math.max(historyRateLimitedUntilMs || 0, next);
  return historyRateLimitedUntilMs;
};

const buildRateLimitError = (retryAtMs: number) => {
  const retryIn = Math.max(0, retryAtMs - Date.now());
  const seconds = Math.max(1, Math.ceil(retryIn / 1000));
  return `TradeLocker rate limited. Retry in ${seconds}s.`;
};

const checkHistoryRateLimit = () => {
  const now = Date.now();
  if (historyRateLimitedUntilMs && now < historyRateLimitedUntilMs) {
    const retryAtMs = historyRateLimitedUntilMs;
    return {
      ok: false as const,
      error: buildRateLimitError(retryAtMs),
      rateLimited: true,
      retryAtMs
    };
  }
  return null;
};

const throttleHistoryRequest = async () => {
  const since = Date.now() - historyLastRequestAtMs;
  if (since < HISTORY_REQUEST_MIN_INTERVAL_MS) {
    await sleep(HISTORY_REQUEST_MIN_INTERVAL_MS - since);
  }
  historyLastRequestAtMs = Date.now();
};

const resolveTimeframeMs = (value: string): number | null => {
  const normalized = normalizeTimeframeKey(value);
  if (HISTORY_TIMEFRAME_MS[normalized]) return HISTORY_TIMEFRAME_MS[normalized];
  const match = /^(\d+)\s*([a-zA-Z]+)$/.exec(normalized);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = String(match[2] || '').toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === 'm') return amount * 60_000;
  if (unit === 'h') return amount * 60 * 60_000;
  if (unit === 'd') return amount * 24 * 60 * 60_000;
  return null;
};

const trimHistoryCache = () => {
  cacheBudgetManager.apply('backtestResearch.historyCache', historyCache, (entry) => Number(entry?.fetchedAtMs || 0) || null);
  cacheBudgetManager.setSize('backtestResearch.historyCache', historyCache.size);
};

const fetchHistoryChunked = async (
  api: any,
  symbol: string,
  timeframe: string,
  from: number,
  to: number
) => {
  const msPerBar = resolveTimeframeMs(timeframe);
  const rateLimit = checkHistoryRateLimit();
  if (rateLimit) {
    return {
      ok: false as const,
      error: rateLimit.error,
      bars: [] as Candle[],
      chunks: 0,
      rateLimited: true,
      retryAtMs: rateLimit.retryAtMs
    };
  }
  if (!msPerBar) {
    await throttleHistoryRequest();
    const res = await api.getHistorySeries({
      symbol,
      resolution: timeframe,
      from,
      to,
      aggregate: true,
      maxAgeMs: HISTORY_REQUEST_MAX_AGE_MS
    });
    if (res?.rateLimited) {
      const retryAtMs = noteHistoryRateLimit(res?.retryAtMs);
      return {
        ok: false as const,
        error: res?.error ? String(res.error) : buildRateLimitError(retryAtMs),
        bars: [] as Candle[],
        chunks: 0,
        rateLimited: true,
        retryAtMs
      };
    }
    if (!res?.ok) {
      return { ok: false as const, error: res?.error ? String(res.error) : 'Failed to load broker history.', bars: [] as Candle[], chunks: 0 };
    }
    return { ok: true as const, bars: normalizeBars(res?.bars || []), chunks: 1 };
  }

  const barsMap = new Map<number, Candle>();
  let chunks = 0;
  let cursorEnd = to;
  let guard = 0;
  const minStep = msPerBar;

  while (cursorEnd > from && guard < 500) {
    const chunkFrom = Math.max(from, cursorEnd - HISTORY_CHUNK_MAX_BARS * msPerBar);
    const rateLimitChunk = checkHistoryRateLimit();
    if (rateLimitChunk) {
      return {
        ok: false as const,
        error: rateLimitChunk.error,
        bars: [] as Candle[],
        chunks,
        rateLimited: true,
        retryAtMs: rateLimitChunk.retryAtMs
      };
    }
    await throttleHistoryRequest();
    const res = await api.getHistorySeries({
      symbol,
      resolution: timeframe,
      from: chunkFrom,
      to: cursorEnd,
      aggregate: true,
      maxAgeMs: HISTORY_REQUEST_MAX_AGE_MS
    });
    if (res?.rateLimited) {
      const retryAtMs = noteHistoryRateLimit(res?.retryAtMs);
      return {
        ok: false as const,
        error: res?.error ? String(res.error) : buildRateLimitError(retryAtMs),
        bars: [] as Candle[],
        chunks,
        rateLimited: true,
        retryAtMs
      };
    }
    if (!res?.ok) {
      return { ok: false as const, error: res?.error ? String(res.error) : 'Failed to load broker history.', bars: [] as Candle[], chunks };
    }
    const chunkBars = normalizeBars(res?.bars || []);
    for (const bar of chunkBars) {
      barsMap.set(bar.t, bar);
    }
    chunks += 1;
    guard += 1;

    if (chunkBars.length === 0) {
      cursorEnd = chunkFrom - minStep;
      continue;
    }

    const earliest = chunkBars[0]?.t;
    if (!Number.isFinite(earliest)) break;
    cursorEnd = earliest - minStep;
  }

  const bars = Array.from(barsMap.values()).sort((a, b) => a.t - b.t);
  return { ok: true as const, bars, chunks };
};

const getHistoryCached = async (
  api: any,
  symbol: string,
  timeframe: string,
  rangeDays: number,
  opts?: { force?: boolean }
) => {
  const now = Date.now();
  const key = `${symbol.toLowerCase()}|${timeframe}|${rangeDays}`;
  const rateLimit = checkHistoryRateLimit();
  if (rateLimit) {
    return {
      ok: false as const,
      error: rateLimit.error,
      rateLimited: true,
      retryAtMs: rateLimit.retryAtMs
    };
  }
  const cached = historyCache.get(key);
  cacheBudgetManager.noteGet('backtestResearch.historyCache', key, !!cached);
  if (!opts?.force && cached && now - cached.fetchedAtMs < HISTORY_CACHE_TTL_MS) {
    return {
      ok: true as const,
      bars: cached.bars,
      fromMs: cached.fromMs,
      toMs: cached.toMs,
      chunks: cached.chunks,
      cached: true,
      fetchedAtMs: cached.fetchedAtMs
    };
  }

  const inflight = historyInFlight.get(key);
  if (inflight) {
    cacheBudgetManager.noteGet('backtestResearch.inFlight', key, true);
    return inflight;
  }
  cacheBudgetManager.noteGet('backtestResearch.inFlight', key, false);

  const to = now;
  const from = to - rangeDays * 24 * 60 * 60 * 1000;
  const fetchPromise = (async () => {
    const fetched = await fetchHistoryChunked(api, symbol, timeframe, from, to);
    if (!fetched.ok) {
      return {
        ok: false as const,
        error: fetched.error || 'Failed to load broker history.',
        rateLimited: fetched?.rateLimited,
        retryAtMs: fetched?.retryAtMs
      };
    }
    historyCache.set(key, { bars: fetched.bars, fetchedAtMs: now, fromMs: from, toMs: to, chunks: fetched.chunks });
    cacheBudgetManager.noteSet('backtestResearch.historyCache', key);
    trimHistoryCache();
      return {
        ok: true as const,
        bars: fetched.bars,
        fromMs: from,
        toMs: to,
        chunks: fetched.chunks,
        cached: false,
        fetchedAtMs: now
      };
    })();
  historyInFlight.set(key, fetchPromise);
  historyInFlightBudget.set(key, { createdAtMs: now });
  cacheBudgetManager.noteSet('backtestResearch.inFlight', key);
  cacheBudgetManager.apply('backtestResearch.inFlight', historyInFlightBudget, (entry) => Number(entry?.createdAtMs || 0) || null);
  for (const staleKey of Array.from(historyInFlight.keys())) {
    if (historyInFlightBudget.has(staleKey)) continue;
    historyInFlight.delete(staleKey);
  }
  cacheBudgetManager.setSize('backtestResearch.inFlight', historyInFlight.size);
  try {
    return await fetchPromise;
  } finally {
    historyInFlight.delete(key);
    historyInFlightBudget.delete(key);
    cacheBudgetManager.setSize('backtestResearch.inFlight', historyInFlight.size);
  }
};

const toNumber = (value: any): number | null => {
  if (value == null) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};


const wrapBrokerResult = (method: string, res: any, brokerId: string) => {
  if (res && typeof res === 'object' && !Array.isArray(res)) {
    const ok = typeof res.ok === 'boolean' ? res.ok : true;
    return { ...res, ok, brokerId, sourceBroker: brokerId, brokerMethod: method };
  }
  return { ok: true, brokerId, sourceBroker: brokerId, brokerMethod: method, result: res };
};

const requestBrokerHistory = async (args: any) => {
  const rateLimit = checkHistoryRateLimit();
  if (rateLimit) {
    return {
      ok: false,
      error: rateLimit.error,
      rateLimited: true,
      retryAtMs: rateLimit.retryAtMs
    };
  }
  return queueHistoryRequest(async () => {
    const queuedRateLimit = checkHistoryRateLimit();
    if (queuedRateLimit) {
      return {
        ok: false,
        error: queuedRateLimit.error,
        rateLimited: true,
        retryAtMs: queuedRateLimit.retryAtMs
      };
    }
    await throttleHistoryRequest();
    try {
      const res = await requestBrokerCoordinated('getHistorySeries', args, { source: 'backtest_research' });
      if (res?.rateLimited) {
        noteHistoryRateLimit(res?.retryAtMs);
      }
      if (res?.ok || String(res?.error || '').trim() !== 'Broker request bridge unavailable.') {
        return res;
      }
    } catch {
      // fall through to direct TradeLocker fallback
    }

    const tl = (window as any)?.glass?.tradelocker;
    if (tl?.getHistorySeries) {
      const fallback = await tl.getHistorySeries(args);
      if (fallback?.rateLimited) {
        noteHistoryRateLimit(fallback?.retryAtMs);
      }
      return wrapBrokerResult('getHistorySeries', fallback, 'tradelocker');
    }
    return { ok: false, error: 'Broker history API unavailable.' };
  });
};

export type BacktestHistoryResult = {
  ok: boolean;
  symbol: string;
  timeframe: string;
  rangeDays: number;
  bars: Candle[];
  fromMs?: number;
  toMs?: number;
  chunks?: number;
  cached?: boolean;
  fetchedAtMs?: number;
  error?: string;
  rateLimited?: boolean;
  retryAtMs?: number;
  source?: string;
};

export async function loadBacktestHistory(input: {
  symbol: string;
  timeframe?: string;
  rangeDays?: number;
  force?: boolean;
}): Promise<BacktestHistoryResult> {
  const symbol = String(input.symbol || '').trim();
  const timeframe = normalizeTimeframeKey(input.timeframe || DEFAULT_TIMEFRAME) || DEFAULT_TIMEFRAME;
  const rangeDaysRaw = toNumber(input.rangeDays);
  const rangeDays = rangeDaysRaw != null
    ? Math.max(1, Math.min(MAX_RANGE_DAYS, Math.floor(rangeDaysRaw)))
    : DEFAULT_RANGE_DAYS;
  if (!symbol) {
    return {
      ok: false,
      symbol,
      timeframe,
      rangeDays,
      bars: [],
      error: 'Symbol is required.'
    };
  }

  const api = {
    getHistorySeries: (args: any) => requestBrokerHistory(args)
  };

  const res = await getHistoryCached(api, symbol, timeframe, rangeDays, { force: input.force });
  if (!res?.ok) {
    return {
      ok: false,
      symbol,
      timeframe,
      rangeDays,
      bars: [],
      error: res?.error ? String(res.error) : 'Failed to load broker history.',
      rateLimited: res?.rateLimited,
      retryAtMs: res?.retryAtMs
    };
  }

  return {
    ok: true,
    symbol,
    timeframe,
    rangeDays,
    bars: res.bars || [],
    fromMs: res.fromMs,
    toMs: res.toMs,
    chunks: res.chunks,
    cached: res.cached,
    fetchedAtMs: res.fetchedAtMs,
    source: res.cached ? 'cache' : 'broker'
  };
}

const normalizeOptimizationInputs = (request: BacktestOptimizationRequest) => {
  const timeframe = normalizeTimeframeKey(request.timeframe || DEFAULT_TIMEFRAME) || DEFAULT_TIMEFRAME;
  const rangeDaysRaw = toNumber(request.rangeDays);
  const rangeDays = rangeDaysRaw != null
    ? Math.max(1, Math.min(MAX_RANGE_DAYS, Math.floor(rangeDaysRaw)))
    : DEFAULT_RANGE_DAYS;
  const maxCombosRaw = toNumber(request.maxCombos);
  const maxCombos = maxCombosRaw != null
    ? Math.max(1, Math.min(2000, Math.floor(maxCombosRaw)))
    : DEFAULT_MAX_COMBOS;
  return { timeframe, rangeDays, maxCombos };
};

const toNumberArray = (value: any): number[] | undefined => {
  if (!value) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const cleaned = arr
    .map((item) => toNumber(item))
    .filter((item): item is number => item != null);
  return cleaned.length > 0 ? cleaned : undefined;
};

const toStringArray = (value: any): string[] | undefined => {
  if (!value) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const cleaned = arr.map((item) => String(item ?? '').trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
};

const toBooleanArray = (value: any): boolean[] | undefined => {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const cleaned = arr
    .map((item) => {
      if (typeof item === 'boolean') return item;
      const raw = String(item ?? '').trim().toLowerCase();
      if (!raw) return null;
      if (['true', '1', 'yes', 'y'].includes(raw)) return true;
      if (['false', '0', 'no', 'n'].includes(raw)) return false;
      return null;
    })
    .filter((item): item is boolean => item != null);
  return cleaned.length > 0 ? cleaned : undefined;
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

const normalizeBars = (raw: any[]): Candle[] => {
  const next: Candle[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const t = toNumber(item?.t ?? item?.time ?? item?.timestamp);
    const o = toNumber(item?.o ?? item?.open);
    const h = toNumber(item?.h ?? item?.high);
    const l = toNumber(item?.l ?? item?.low);
    const c = toNumber(item?.c ?? item?.close);
    if (t == null || o == null || h == null || l == null || c == null) continue;
    const ms = t > 1e12 ? Math.floor(t) : Math.floor(t * 1000);
    next.push({ t: ms, o, h, l, c, v: toNumber(item?.v ?? item?.volume) ?? null });
  }
  return next.sort((a, b) => a.t - b.t);
};

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

const isHourInWindow = (hour: number, startHour: number, endHour: number) => {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
};

const filterByTimeWindow = (
  trades: Array<{ entryTime?: number }>,
  filter?: TimeFilter
) => {
  if (!filter) return trades;
  const startHourRaw = toNumber(filter.startHour);
  const endHourRaw = toNumber(filter.endHour);
  if (startHourRaw == null || endHourRaw == null) return trades;
  const startHour = Math.max(0, Math.min(23, Math.floor(startHourRaw)));
  const endHour = Math.max(0, Math.min(23, Math.floor(endHourRaw)));
  const timezone = filter.timezone === 'local' ? 'local' : 'utc';

  return trades.filter((trade) => {
    const ts = trade.entryTime;
    if (!Number.isFinite(Number(ts))) return false;
    const date = new Date(Number(ts));
    const hour = timezone === 'local' ? date.getHours() : date.getUTCHours();
    return isHourInWindow(hour, startHour, endHour);
  });
};

const buildRangeCombos = (grid: BacktestParamGrid, maxCombos: number) => {
  return buildGrid(
    DEFAULT_RANGE_CFG,
    {
      lookbackBars: toNumberArray(grid.lookbackBars),
      atrPeriod: toNumberArray(grid.atrPeriod),
      atrMult: toNumberArray(grid.atrMult),
      rr: toNumberArray(grid.rr),
      cooldownBars: toNumberArray(grid.cooldownBars),
      breakoutMode: toStringArray(grid.breakoutMode),
      bufferAtrMult: toNumberArray(grid.bufferAtrMult)
    },
    maxCombos
  );
};

const buildBreakRetestCombos = (grid: BacktestParamGrid, maxCombos: number) => {
  return buildGrid(
    DEFAULT_BREAK_CFG,
    {
      lookbackBars: toNumberArray(grid.lookbackBars),
      atrPeriod: toNumberArray(grid.atrPeriod),
      atrMult: toNumberArray(grid.atrMult),
      rr: toNumberArray(grid.rr),
      cooldownBars: toNumberArray(grid.cooldownBars),
      breakoutMode: toStringArray(grid.breakoutMode),
      bufferAtrMult: toNumberArray(grid.bufferAtrMult),
      retestBars: toNumberArray(grid.retestBars),
      retestBufferAtrMult: toNumberArray(grid.retestBufferAtrMult),
      retestConfirm: toStringArray(grid.retestConfirm)
    },
    maxCombos
  );
};

const buildFvgCombos = (grid: BacktestParamGrid, maxCombos: number) => {
  return buildGrid(
    DEFAULT_FVG_CFG,
    {
      atrPeriod: toNumberArray(grid.atrPeriod),
      atrMult: toNumberArray(grid.atrMult),
      rr: toNumberArray(grid.rr),
      maxWaitBars: toNumberArray(grid.maxWaitBars),
      entryMode: toStringArray(grid.entryMode),
      minGapAtrMult: toNumberArray(grid.minGapAtrMult)
    },
    maxCombos
  );
};

const buildTrendCombos = (grid: BacktestParamGrid, maxCombos: number) => {
  return buildGrid(
    DEFAULT_TREND_CFG,
    {
      fastEma: toNumberArray(grid.fastEma),
      slowEma: toNumberArray(grid.slowEma),
      pullbackEma: toStringArray(grid.pullbackEma),
      confirmMode: toStringArray(grid.confirmMode),
      minTrendBars: toNumberArray(grid.minTrendBars),
      atrPeriod: toNumberArray(grid.atrPeriod),
      atrMult: toNumberArray(grid.atrMult),
      rr: toNumberArray(grid.rr),
      cooldownBars: toNumberArray(grid.cooldownBars)
    },
    maxCombos
  );
};

const buildMeanCombos = (grid: BacktestParamGrid, maxCombos: number) => {
  return buildGrid(
    DEFAULT_MEAN_CFG,
    {
      smaPeriod: toNumberArray(grid.smaPeriod),
      atrPeriod: toNumberArray(grid.atrPeriod),
      bandAtrMult: toNumberArray(grid.bandAtrMult),
      stopAtrMult: toNumberArray(grid.stopAtrMult),
      rr: toNumberArray(grid.rr),
      cooldownBars: toNumberArray(grid.cooldownBars),
      useRsiFilter: toBooleanArray(grid.useRsiFilter),
      rsiPeriod: toNumberArray(grid.rsiPeriod),
      rsiOversold: toNumberArray(grid.rsiOversold),
      rsiOverbought: toNumberArray(grid.rsiOverbought)
    },
    maxCombos
  );
};

export async function loadBacktestOptimizationHistory(
  request: BacktestOptimizationRequest
): Promise<BacktestOptimizationHistoryResult> {
  const startedAtMs = Date.now();
  const runId = `opt_${startedAtMs}_${Math.random().toString(16).slice(2, 8)}`;
  const symbol = String(request.symbol || '').trim();
  if (!symbol) {
    return {
      ok: false,
      runId,
      startedAtMs,
      symbol: '',
      timeframe: DEFAULT_TIMEFRAME,
      rangeDays: DEFAULT_RANGE_DAYS,
      maxCombos: DEFAULT_MAX_COMBOS,
      bars: [],
      error: 'Symbol is required.'
    };
  }

  const api = {
    getHistorySeries: (args: any) => requestBrokerHistory(args)
  };

  const { timeframe, rangeDays, maxCombos } = normalizeOptimizationInputs(request);

  try {
    const res = await getHistoryCached(api, symbol, timeframe, rangeDays);
    if (!res?.ok) {
      return {
        ok: false,
        runId,
        startedAtMs,
        symbol,
        timeframe,
        rangeDays,
        maxCombos,
        bars: [],
        error: res?.error ? String(res.error) : 'Failed to load broker history.',
        rateLimited: res?.rateLimited,
        retryAtMs: res?.retryAtMs
      };
    }

    const bars = res.bars || [];
    if (bars.length === 0) {
      return {
        ok: false,
        runId,
        startedAtMs,
        symbol,
        timeframe,
        rangeDays,
        maxCombos,
        bars,
        error: 'No bars returned for the selected symbol/timeframe.'
      };
    }

    return {
      ok: true,
      runId,
      startedAtMs,
      symbol,
      timeframe,
      rangeDays,
      maxCombos,
      bars,
      history: {
        fromMs: res.fromMs,
        toMs: res.toMs,
        chunks: res.chunks,
        cached: res.cached
      },
      request: {
        ...request,
        symbol,
        timeframe,
        rangeDays,
        maxCombos
      }
    };
  } catch (err: any) {
    return {
      ok: false,
      runId,
      startedAtMs,
      symbol,
      timeframe,
      rangeDays,
      maxCombos,
      bars: [],
      error: err?.message ? String(err.message) : 'Failed to load broker history.'
    };
  }
}

export async function runBacktestOptimizationOnBars(
  request: BacktestOptimizationRequest,
  bars: Candle[],
  meta: { runId?: string; startedAtMs?: number; history?: BacktestOptimizationHistory } = {},
  options: BacktestOptimizationOptions = {}
): Promise<BacktestOptimizationResult> {
  const startedAt = Number.isFinite(Number(meta.startedAtMs))
    ? Number(meta.startedAtMs)
    : Date.now();
  const runId = meta.runId || `opt_${startedAt}_${Math.random().toString(16).slice(2, 8)}`;
  const symbol = String(request.symbol || '').trim();
  const { timeframe, rangeDays, maxCombos } = normalizeOptimizationInputs(request);
  const historyMeta = meta.history;

  if (!symbol) {
    return {
      ok: false,
      schemaVersion: BACKTEST_OPT_SCHEMA_VERSION,
      runId,
      symbol: '',
      strategy: request.strategy,
      timeframe: DEFAULT_TIMEFRAME,
      rangeDays: DEFAULT_RANGE_DAYS,
      bars: 0,
      combosTested: 0,
      combosRequested: 0,
      truncated: false,
      ranAtMs: startedAt,
      elapsedMs: 0,
      error: 'Symbol is required.'
    };
  }

  if (!Array.isArray(bars) || bars.length === 0) {
    return {
      ok: false,
      schemaVersion: BACKTEST_OPT_SCHEMA_VERSION,
      runId,
      symbol,
      strategy: request.strategy,
      timeframe,
      rangeDays,
      bars: 0,
      combosTested: 0,
      combosRequested: 0,
      truncated: false,
      ranAtMs: startedAt,
      elapsedMs: Date.now() - startedAt,
      error: 'No bars returned for the selected symbol/timeframe.',
      history: historyMeta
    };
  }

  const grid = request.paramGrid || {};
  let combos: Array<RangeBreakoutConfig | BreakRetestConfig | FvgRetraceConfig | TrendPullbackConfig | MeanReversionConfig> = [];

  switch (request.strategy) {
    case 'BREAK_RETEST':
      combos = buildBreakRetestCombos(grid, maxCombos);
      break;
    case 'FVG_RETRACE':
      combos = buildFvgCombos(grid, maxCombos);
      break;
    case 'TREND_PULLBACK':
      combos = buildTrendCombos(grid, maxCombos);
      break;
    case 'MEAN_REVERSION':
      combos = buildMeanCombos(grid, maxCombos);
      break;
    case 'RANGE_BREAKOUT':
    default:
      combos = buildRangeCombos(grid, maxCombos);
      break;
  }

  const combosRequested = combos.length;
  const progressEvery = Number.isFinite(Number(options.progressInterval))
    ? Math.max(1, Math.floor(Number(options.progressInterval)))
    : Math.max(1, Math.floor(combosRequested / 20));
  const truncatedByLimit = combosRequested >= maxCombos;
  const execution = normalizeExecutionConfig(request.execution);
  const results: BacktestOptimizationEntry[] = [];
  let cancelled = false;

  for (let i = 0; i < combos.length; i += 1) {
    if (options.shouldCancel && options.shouldCancel()) {
      cancelled = true;
      break;
    }

    const params = combos[i];
    let trades;
    if (request.strategy === 'BREAK_RETEST') {
      trades = generateBreakRetestTrades(bars, params as BreakRetestConfig);
    } else if (request.strategy === 'FVG_RETRACE') {
      trades = generateFvgRetraceTrades(bars, params as FvgRetraceConfig);
    } else if (request.strategy === 'TREND_PULLBACK') {
      trades = generateTrendPullbackTrades(bars, params as TrendPullbackConfig);
    } else if (request.strategy === 'MEAN_REVERSION') {
      trades = generateMeanReversionTrades(bars, params as MeanReversionConfig);
    } else {
      trades = generateRangeBreakoutTrades(bars, params as RangeBreakoutConfig);
    }

    const simulated = simulateTrades(bars, trades, { execution });
    const filtered = filterByTimeWindow(simulated, request.timeFilter);
    const stats = summarizeTrades(filtered);
    const performance = computeEquityStats(filtered);

    results.push({
      params,
      stats,
      performance
    });

    if (options.onProgress && ((i + 1) % progressEvery === 0 || i + 1 === combos.length)) {
      options.onProgress({
        done: i + 1,
        total: combos.length
      });
    }
  }

  results.sort((a, b) => b.performance.netR - a.performance.netR);
  const topConfigs = results.slice(0, 3);
  const bestConfig = topConfigs[0] || null;
  const elapsedMs = Date.now() - startedAt;
  const summary = bestConfig
    ? `Tested ${results.length} combinations${cancelled ? ' (cancelled)' : ''}. Best net R ${bestConfig.performance.netR.toFixed(2)}R.`
    : `Tested ${results.length} combinations${cancelled ? ' (cancelled)' : ''}.`;
  const truncated = truncatedByLimit || cancelled;

  if (results.length === 0) {
    return {
      ok: false,
      schemaVersion: BACKTEST_OPT_SCHEMA_VERSION,
      runId,
      symbol,
      strategy: request.strategy,
      timeframe,
      rangeDays,
      bars: bars.length,
      combosTested: 0,
      combosRequested,
      truncated,
      cancelled,
      bestConfig: null,
      topConfigs: [],
      summary,
      ranAtMs: startedAt,
      elapsedMs,
      error: cancelled ? 'Optimization cancelled.' : 'No results returned.',
      history: historyMeta
    };
  }

  return {
    ok: true,
    schemaVersion: BACKTEST_OPT_SCHEMA_VERSION,
    runId,
    symbol,
    strategy: request.strategy,
    timeframe,
    rangeDays,
    bars: bars.length,
    combosTested: results.length,
    combosRequested,
    truncated,
    cancelled,
    bestConfig,
    topConfigs,
    allConfigs: options.includeResults ? results : undefined,
    summary,
    ranAtMs: startedAt,
    elapsedMs,
    history: historyMeta
  };
}

export async function runBacktestOptimization(
  request: BacktestOptimizationRequest,
  options: BacktestOptimizationOptions = {}
): Promise<BacktestOptimizationResult> {
  const history = await loadBacktestOptimizationHistory(request);
  if (!history.ok) {
    const elapsedMs = Date.now() - history.startedAtMs;
    return {
      ok: false,
      schemaVersion: BACKTEST_OPT_SCHEMA_VERSION,
      runId: history.runId,
      symbol: history.symbol || '',
      strategy: request.strategy,
      timeframe: history.timeframe || DEFAULT_TIMEFRAME,
      rangeDays: history.rangeDays || DEFAULT_RANGE_DAYS,
      bars: 0,
      combosTested: 0,
      combosRequested: 0,
      truncated: false,
      ranAtMs: history.startedAtMs,
      elapsedMs,
      error: history.error || 'Failed to load broker history.'
    };
  }

  return runBacktestOptimizationOnBars(
    history.request || request,
    history.bars,
    {
      runId: history.runId,
      startedAtMs: history.startedAtMs,
      history: history.history
    },
    options
  );
}
