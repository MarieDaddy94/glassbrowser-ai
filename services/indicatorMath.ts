export type IndicatorBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number | null;
};

type SwingLike = {
  type?: string | null;
  ts?: number | null;
  payload?: Record<string, any> | null;
};

const toNum = (value: any): number | null => {
  const raw = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(raw) ? raw : null;
};

const round = (value: number | null | undefined, digits = 6): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
};

const normalizeBars = (bars: IndicatorBar[]): IndicatorBar[] => {
  const list = Array.isArray(bars) ? bars : [];
  return list
    .map((bar) => ({
      t: Number(bar?.t || 0) || 0,
      o: Number(bar?.o || 0) || 0,
      h: Number(bar?.h || 0) || 0,
      l: Number(bar?.l || 0) || 0,
      c: Number(bar?.c || 0) || 0,
      v: bar?.v != null ? Number(bar.v || 0) || 0 : null
    }))
    .filter((bar) => bar.t > 0 && Number.isFinite(bar.c) && Number.isFinite(bar.h) && Number.isFinite(bar.l))
    .sort((a, b) => a.t - b.t);
};

const toUtcDayKey = (ts: number): string => {
  const d = new Date(Math.floor(Number(ts) || 0));
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const computeSessionVwap = (
  barsInput: IndicatorBar[],
  sessionKey?: string | null
): { sessionKey: string; value: number | null; barsUsed: number } => {
  const bars = normalizeBars(barsInput);
  if (bars.length === 0) {
    return { sessionKey: String(sessionKey || '').trim() || '', value: null, barsUsed: 0 };
  }
  const resolvedSessionKey = String(sessionKey || '').trim() || toUtcDayKey(bars[bars.length - 1].t);
  let sumPv = 0;
  let sumV = 0;
  let barsUsed = 0;
  for (const bar of bars) {
    if (toUtcDayKey(bar.t) !== resolvedSessionKey) continue;
    const typical = (bar.h + bar.l + bar.c) / 3;
    const volume = Number.isFinite(Number(bar.v)) && Number(bar.v) > 0 ? Number(bar.v) : 1;
    sumPv += typical * volume;
    sumV += volume;
    barsUsed += 1;
  }
  if (barsUsed === 0 || sumV <= 0) {
    return { sessionKey: resolvedSessionKey, value: null, barsUsed: 0 };
  }
  return { sessionKey: resolvedSessionKey, value: round(sumPv / sumV, 6), barsUsed };
};

export const computeBollinger20x2 = (
  closesInput: number[]
): {
  basis: number | null;
  upper: number | null;
  lower: number | null;
  widthPct: number | null;
  zScore: number | null;
  position: 'above_upper' | 'below_lower' | 'inside_upper_half' | 'inside_lower_half' | 'inside_mid' | 'unknown';
} => {
  const closes = Array.isArray(closesInput)
    ? closesInput.map((entry) => toNum(entry)).filter((entry): entry is number => entry != null)
    : [];
  if (closes.length < 20) {
    return {
      basis: null,
      upper: null,
      lower: null,
      widthPct: null,
      zScore: null,
      position: 'unknown'
    };
  }
  const slice = closes.slice(-20);
  const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const variance = slice.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / slice.length;
  const std = Math.sqrt(Math.max(0, variance));
  const upper = mean + std * 2;
  const lower = mean - std * 2;
  const last = slice[slice.length - 1];
  const widthPct = mean !== 0 ? ((upper - lower) / Math.abs(mean)) * 100 : null;
  const zScore = std > 0 ? (last - mean) / std : 0;
  let position: 'above_upper' | 'below_lower' | 'inside_upper_half' | 'inside_lower_half' | 'inside_mid' | 'unknown' = 'inside_mid';
  if (last > upper) position = 'above_upper';
  else if (last < lower) position = 'below_lower';
  else {
    const midUpper = mean + std * 0.4;
    const midLower = mean - std * 0.4;
    if (last > midUpper) position = 'inside_upper_half';
    else if (last < midLower) position = 'inside_lower_half';
  }
  return {
    basis: round(mean, 6),
    upper: round(upper, 6),
    lower: round(lower, 6),
    widthPct: round(widthPct, 4),
    zScore: round(zScore, 4),
    position
  };
};

const highestHigh = (bars: IndicatorBar[], period: number): number | null => {
  if (bars.length < period) return null;
  let high = Number.NEGATIVE_INFINITY;
  const start = bars.length - period;
  for (let i = start; i < bars.length; i += 1) {
    high = Math.max(high, bars[i].h);
  }
  return Number.isFinite(high) ? high : null;
};

const lowestLow = (bars: IndicatorBar[], period: number): number | null => {
  if (bars.length < period) return null;
  let low = Number.POSITIVE_INFINITY;
  const start = bars.length - period;
  for (let i = start; i < bars.length; i += 1) {
    low = Math.min(low, bars[i].l);
  }
  return Number.isFinite(low) ? low : null;
};

export const computeIchimoku9526 = (
  barsInput: IndicatorBar[]
): {
  tenkan: number | null;
  kijun: number | null;
  senkouA: number | null;
  senkouB: number | null;
  chikou: number | null;
  bias: 'bullish' | 'bearish' | 'in_cloud' | 'neutral' | 'unknown';
} => {
  const bars = normalizeBars(barsInput);
  if (bars.length === 0) {
    return {
      tenkan: null,
      kijun: null,
      senkouA: null,
      senkouB: null,
      chikou: null,
      bias: 'unknown'
    };
  }
  const high9 = highestHigh(bars, 9);
  const low9 = lowestLow(bars, 9);
  const high26 = highestHigh(bars, 26);
  const low26 = lowestLow(bars, 26);
  const high52 = highestHigh(bars, 52);
  const low52 = lowestLow(bars, 52);

  const tenkan = high9 != null && low9 != null ? (high9 + low9) / 2 : null;
  const kijun = high26 != null && low26 != null ? (high26 + low26) / 2 : null;
  const senkouA = tenkan != null && kijun != null ? (tenkan + kijun) / 2 : null;
  const senkouB = high52 != null && low52 != null ? (high52 + low52) / 2 : null;
  const chikou = bars.length > 26 ? bars[bars.length - 27].c : null;
  const close = bars[bars.length - 1].c;

  let bias: 'bullish' | 'bearish' | 'in_cloud' | 'neutral' | 'unknown' = 'unknown';
  if (senkouA != null && senkouB != null) {
    const cloudHigh = Math.max(senkouA, senkouB);
    const cloudLow = Math.min(senkouA, senkouB);
    if (close > cloudHigh) bias = 'bullish';
    else if (close < cloudLow) bias = 'bearish';
    else bias = 'in_cloud';
  } else if (tenkan != null && kijun != null) {
    if (tenkan > kijun) bias = 'bullish';
    else if (tenkan < kijun) bias = 'bearish';
    else bias = 'neutral';
  }

  return {
    tenkan: round(tenkan, 6),
    kijun: round(kijun, 6),
    senkouA: round(senkouA, 6),
    senkouB: round(senkouB, 6),
    chikou: round(chikou, 6),
    bias
  };
};

const resolveSwingPrice = (entry: SwingLike | null | undefined): number | null => {
  if (!entry) return null;
  const payload = entry.payload || {};
  const candidates = [
    payload.price,
    payload.level,
    payload.high,
    payload.low,
    payload.close
  ];
  for (const candidate of candidates) {
    const value = toNum(candidate);
    if (value != null) return value;
  }
  return null;
};

const pickLatestSwingPair = (swings: SwingLike[]) => {
  const highs = swings
    .filter((entry) => String(entry?.type || '').toLowerCase().includes('swing_high'))
    .map((entry) => ({
      ts: Number(entry?.ts || 0),
      price: resolveSwingPrice(entry)
    }))
    .filter((entry) => entry.ts > 0 && entry.price != null) as Array<{ ts: number; price: number }>;
  const lows = swings
    .filter((entry) => String(entry?.type || '').toLowerCase().includes('swing_low'))
    .map((entry) => ({
      ts: Number(entry?.ts || 0),
      price: resolveSwingPrice(entry)
    }))
    .filter((entry) => entry.ts > 0 && entry.price != null) as Array<{ ts: number; price: number }>;
  if (highs.length === 0 || lows.length === 0) return null;
  const lastHigh = highs.reduce((acc, next) => (next.ts > acc.ts ? next : acc), highs[0]);
  const lastLow = lows.reduce((acc, next) => (next.ts > acc.ts ? next : acc), lows[0]);
  return { lastHigh, lastLow };
};

const fallbackSwingPairFromBars = (bars: IndicatorBar[]) => {
  const slice = bars.slice(-120);
  if (slice.length < 8) return null;
  let high = { price: Number.NEGATIVE_INFINITY, ts: 0 };
  let low = { price: Number.POSITIVE_INFINITY, ts: 0 };
  for (const bar of slice) {
    if (bar.h > high.price) high = { price: bar.h, ts: bar.t };
    if (bar.l < low.price) low = { price: bar.l, ts: bar.t };
  }
  if (!Number.isFinite(high.price) || !Number.isFinite(low.price) || high.price <= low.price) return null;
  return { lastHigh: high, lastLow: low };
};

export const computeFibRetracementFromSwings = (
  swingsInput: SwingLike[],
  barsInput: IndicatorBar[]
): {
  anchorHigh: number | null;
  anchorLow: number | null;
  direction: 'up' | 'down' | null;
  nearestLevel: string | null;
  nearestDistanceBps: number | null;
  levels: Record<string, number> | null;
} => {
  const bars = normalizeBars(barsInput);
  const swings = Array.isArray(swingsInput) ? swingsInput : [];
  const pair = pickLatestSwingPair(swings) || fallbackSwingPairFromBars(bars);
  if (!pair) {
    return {
      anchorHigh: null,
      anchorLow: null,
      direction: null,
      nearestLevel: null,
      nearestDistanceBps: null,
      levels: null
    };
  }
  const anchorHigh = Number(pair.lastHigh.price);
  const anchorLow = Number(pair.lastLow.price);
  if (!Number.isFinite(anchorHigh) || !Number.isFinite(anchorLow) || anchorHigh <= anchorLow) {
    return {
      anchorHigh: null,
      anchorLow: null,
      direction: null,
      nearestLevel: null,
      nearestDistanceBps: null,
      levels: null
    };
  }
  const direction: 'up' | 'down' = pair.lastLow.ts <= pair.lastHigh.ts ? 'up' : 'down';
  const range = anchorHigh - anchorLow;
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels: Record<string, number> = {};
  for (const ratio of ratios) {
    const key = ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    const levelPrice = direction === 'up'
      ? anchorHigh - range * ratio
      : anchorLow + range * ratio;
    levels[key] = round(levelPrice, 6) ?? levelPrice;
  }
  const close = bars.length > 0 ? bars[bars.length - 1].c : null;
  let nearestLevel: string | null = null;
  let nearestDistanceBps: number | null = null;
  if (close != null && Number.isFinite(close) && close !== 0) {
    for (const [key, price] of Object.entries(levels)) {
      const distanceBps = Math.abs(close - price) / Math.abs(close) * 10000;
      if (nearestDistanceBps == null || distanceBps < nearestDistanceBps) {
        nearestDistanceBps = distanceBps;
        nearestLevel = key;
      }
    }
  }
  return {
    anchorHigh: round(anchorHigh, 6),
    anchorLow: round(anchorLow, 6),
    direction,
    nearestLevel,
    nearestDistanceBps: round(nearestDistanceBps, 3),
    levels
  };
};
