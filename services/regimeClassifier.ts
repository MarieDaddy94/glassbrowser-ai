import type { RegimeState } from '../types';

export type RegimeLabel = {
  volBucket: 'low' | 'med' | 'high';
  trendBucket: 'trend' | 'range';
  sessionBucket: 'asia' | 'london' | 'ny' | 'overnight';
  regimeKey: string;
};

export type RegimeCoverageSummary = {
  regimesSeenCount: number;
  regimesPassCount: number;
  passRate: number;
  brittleRegimes: string[];
  worstRegimeKey?: string | null;
  worstRegimeMetric?: number | null;
};

const getBarTimeMs = (value: number) => {
  if (!Number.isFinite(value)) return null;
  return value > 1e12 ? Math.floor(value) : Math.floor(value * 1000);
};

const getSessionBucket = (bars: Array<{ t: number }>) => {
  const counts: Record<RegimeLabel['sessionBucket'], number> = {
    asia: 0,
    london: 0,
    ny: 0,
    overnight: 0
  };
  for (const bar of bars) {
    const ts = getBarTimeMs(bar.t);
    if (!ts) continue;
    const hour = new Date(ts).getUTCHours();
    if (hour >= 0 && hour < 6) counts.asia += 1;
    else if (hour >= 6 && hour < 12) counts.london += 1;
    else if (hour >= 12 && hour < 21) counts.ny += 1;
    else counts.overnight += 1;
  }
  let best: RegimeLabel['sessionBucket'] = 'overnight';
  let bestCount = -1;
  for (const bucket of Object.keys(counts) as Array<RegimeLabel['sessionBucket']>) {
    if (counts[bucket] > bestCount) {
      bestCount = counts[bucket];
      best = bucket;
    }
  }
  return best;
};

const computeAtrSeries = (bars: Array<{ h?: number | null; l?: number | null; c?: number | null }>, period = 14) => {
  const trValues: number[] = [];
  let prevClose: number | null = null;
  for (const bar of bars) {
    const high = Number(bar.h);
    const low = Number(bar.l);
    const close = Number(bar.c);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    let tr = high - low;
    if (prevClose != null && Number.isFinite(prevClose)) {
      tr = Math.max(tr, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }
    trValues.push(tr);
    prevClose = close;
  }
  if (trValues.length === 0) return [];
  const atr: number[] = [];
  let ema = trValues[0];
  const alpha = 2 / (period + 1);
  atr.push(ema);
  for (let i = 1; i < trValues.length; i += 1) {
    ema = alpha * trValues[i] + (1 - alpha) * ema;
    atr.push(ema);
  }
  return atr;
};

const computeEma = (values: number[], period: number) => {
  if (values.length === 0) return [];
  const alpha = 2 / (period + 1);
  let ema = values[0];
  const out = [ema];
  for (let i = 1; i < values.length; i += 1) {
    ema = alpha * values[i] + (1 - alpha) * ema;
    out.push(ema);
  }
  return out;
};

const quantile = (values: number[], q: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
};

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const resolveReferenceLength = (timeframe?: string) => {
  const tf = String(timeframe || '').trim().toLowerCase();
  if (tf === '15m' || tf === '15min') return 1200;
  if (tf === '1h' || tf === '60m') return 900;
  if (tf === '4h' || tf === '240m') return 600;
  return 800;
};

const resolveTrendThreshold = (timeframe?: string) => {
  const tf = String(timeframe || '').trim().toLowerCase();
  if (tf === '15m' || tf === '15min') return 0.85;
  if (tf === '1h' || tf === '60m') return 0.75;
  if (tf === '4h' || tf === '240m') return 0.65;
  return 0.75;
};

const trendStateCache = new Map<string, RegimeLabel['trendBucket']>();
const liveRegimeCache = new Map<string, { atMs: number; state: RegimeState }>();

export const classifyRegime = (args: {
  bars: Array<{ t: number; h?: number | null; l?: number | null; c?: number | null }>;
  timeframe?: string;
  symbol?: string;
  referenceBars?: Array<{ t: number; h?: number | null; l?: number | null; c?: number | null }>;
}) => {
  const bars = Array.isArray(args.bars) ? args.bars : [];
  if (bars.length < 5) {
    const sessionBucket: RegimeLabel['sessionBucket'] = 'overnight';
    return {
      volBucket: 'med',
      trendBucket: 'range',
      sessionBucket,
      regimeKey: `med_range_${sessionBucket}`
    } as RegimeLabel;
  }

  const closes = bars
    .map((bar) => Number(bar.c))
    .filter((value) => Number.isFinite(value));
  const referenceBars = Array.isArray(args.referenceBars) && args.referenceBars.length > 0
    ? args.referenceBars
    : bars;
  const referenceLength = resolveReferenceLength(args.timeframe);
  const referenceSlice = referenceBars.slice(-referenceLength);
  const referenceAtrSeries = computeAtrSeries(referenceSlice);
  const q33 = quantile(referenceAtrSeries, 0.33);
  const q66 = quantile(referenceAtrSeries, 0.66);
  const evalAtrSeries = computeAtrSeries(bars);
  const evalAtr = median(evalAtrSeries) ?? (evalAtrSeries.length ? evalAtrSeries[evalAtrSeries.length - 1] : null);
  let volBucket: RegimeLabel['volBucket'] = 'med';
  if (evalAtr != null && q33 != null && q66 != null) {
    if (evalAtr <= q33) volBucket = 'low';
    else if (evalAtr >= q66) volBucket = 'high';
  }

  const emaFast = computeEma(closes, 10);
  const emaSlow = computeEma(closes, 30);
  const lastFast = emaFast.length ? emaFast[emaFast.length - 1] : null;
  const lastSlow = emaSlow.length ? emaSlow[emaSlow.length - 1] : null;
  const atrDenom = evalAtr != null && evalAtr > 0 ? evalAtr : null;
  const trendStrength = lastFast != null && lastSlow != null && atrDenom ? Math.abs(lastFast - lastSlow) / atrDenom : 0;
  const threshold = resolveTrendThreshold(args.timeframe);
  const cacheKey = `${String(args.symbol || 'unknown')}|${String(args.timeframe || 'tf')}`;
  const prev = trendStateCache.get(cacheKey);
  let trendBucket: RegimeLabel['trendBucket'] = trendStrength > threshold ? 'trend' : 'range';
  if (prev === 'trend') {
    trendBucket = trendStrength < threshold * 0.85 ? 'range' : 'trend';
  } else if (prev === 'range') {
    trendBucket = trendStrength > threshold * 1.1 ? 'trend' : 'range';
  }
  trendStateCache.set(cacheKey, trendBucket);

  const sessionBucket = getSessionBucket(bars);
  return {
    volBucket,
    trendBucket,
    sessionBucket,
    regimeKey: `${volBucket}_${trendBucket}_${sessionBucket}`
  } as RegimeLabel;
};

export const summarizeRegimeCoverage = (
  evals: Array<{ regimeLabel?: RegimeLabel | null; pass?: boolean; metrics?: any }>
) => {
  const map = new Map<string, { passes: number; fails: number; worstMetric: number | null }>();
  for (const entry of evals) {
    const label = entry.regimeLabel;
    if (!label?.regimeKey) continue;
    const key = label.regimeKey;
    const record = map.get(key) || { passes: 0, fails: 0, worstMetric: null };
    if (entry.pass) record.passes += 1;
    else record.fails += 1;
    const dd = entry.metrics && Number.isFinite(Number(entry.metrics.maxDrawdown))
      ? Number(entry.metrics.maxDrawdown)
      : null;
    if (dd != null && (record.worstMetric == null || dd > record.worstMetric)) {
      record.worstMetric = dd;
    }
    map.set(key, record);
  }

  const regimesSeenCount = map.size;
  let regimesPassCount = 0;
  const brittleRegimes: string[] = [];
  let worstRegimeKey: string | null = null;
  let worstRegimeMetric: number | null = null;

  for (const [key, record] of map.entries()) {
    if (record.fails > 0) brittleRegimes.push(key);
    else regimesPassCount += 1;
    if (record.worstMetric != null && (worstRegimeMetric == null || record.worstMetric > worstRegimeMetric)) {
      worstRegimeMetric = record.worstMetric;
      worstRegimeKey = key;
    }
  }

  const passRate = regimesSeenCount ? regimesPassCount / regimesSeenCount : 0;
  return {
    regimesSeenCount,
    regimesPassCount,
    passRate,
    brittleRegimes,
    worstRegimeKey,
    worstRegimeMetric
  } as RegimeCoverageSummary;
};

export const getCachedRegimeState = (args: {
  symbol: string;
  timeframe: string;
  bars: Array<{ t: number; h?: number | null; l?: number | null; c?: number | null }>;
  referenceBars?: Array<{ t: number; h?: number | null; l?: number | null; c?: number | null }>;
  newsRiskScore?: number | null;
  ttlMs?: number;
}) => {
  const symbol = String(args.symbol || '').trim().toUpperCase();
  const timeframe = String(args.timeframe || '').trim().toLowerCase();
  const key = `${symbol}|${timeframe}`;
  const now = Date.now();
  const ttlMs = Number.isFinite(Number(args.ttlMs)) ? Math.max(500, Math.floor(Number(args.ttlMs))) : 30_000;
  const cached = liveRegimeCache.get(key);
  if (cached && now - cached.atMs <= ttlMs) {
    return cached.state;
  }
  const label = classifyRegime({
    bars: Array.isArray(args.bars) ? args.bars : [],
    referenceBars: Array.isArray(args.referenceBars) ? args.referenceBars : undefined,
    symbol,
    timeframe
  });
  const newsRiskScore = Number(args.newsRiskScore);
  const newsRisk = Number.isFinite(newsRiskScore) ? newsRiskScore >= 0.65 : false;
  const confidence = label.volBucket === 'high' || label.trendBucket === 'trend' ? 0.7 : 0.55;
  const state: RegimeState = {
    symbol,
    timeframe,
    label: label.regimeKey,
    trend: label.trendBucket === 'trend',
    range: label.trendBucket === 'range',
    highVol: label.volBucket === 'high',
    newsRisk,
    confidence,
    updatedAtMs: now
  };
  liveRegimeCache.set(key, { atMs: now, state });
  if (liveRegimeCache.size > 300) {
    const oldest = Array.from(liveRegimeCache.entries()).sort((a, b) => a[1].atMs - b[1].atMs).slice(0, 80);
    for (const [oldKey] of oldest) liveRegimeCache.delete(oldKey);
  }
  return state;
};
