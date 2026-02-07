import {
  computeCommission,
  computeSlippage,
  computeSpread,
  getSessionLabel,
  normalizeExecutionConfig,
  type SessionCostOverride,
  type ExecutionConfig
} from './executionModel';

export type { ExecutionConfig } from './executionModel';

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number | null;
};

export type BacktestSetupId = 'range_breakout' | 'break_retest' | 'fvg_retrace' | 'trend_pullback' | 'mean_reversion';
export type BacktestSide = 'BUY' | 'SELL';

export type RangeBreakoutConfig = {
  enabled: boolean;
  lookbackBars: number;
  atrPeriod: number;
  atrMult: number;
  rr: number;
  cooldownBars: number;
  breakoutMode: 'close' | 'wick';
  bufferAtrMult: number;
};

export type BreakRetestConfig = {
  enabled: boolean;
  lookbackBars: number;
  atrPeriod: number;
  atrMult: number;
  rr: number;
  cooldownBars: number;
  breakoutMode: 'close' | 'wick';
  bufferAtrMult: number;
  retestBars: number;
  retestBufferAtrMult: number;
  retestConfirm: 'touch' | 'close';
};

export type FvgRetraceConfig = {
  enabled: boolean;
  atrPeriod: number;
  atrMult: number;
  rr: number;
  maxWaitBars: number;
  entryMode: 'mid' | 'edge';
  minGapAtrMult: number;
};

export type TrendPullbackConfig = {
  enabled: boolean;
  fastEma: number;
  slowEma: number;
  pullbackEma: 'fast' | 'slow';
  confirmMode: 'touch' | 'close';
  minTrendBars: number;
  atrPeriod: number;
  atrMult: number;
  rr: number;
  cooldownBars: number;
};

export type MeanReversionConfig = {
  enabled: boolean;
  smaPeriod: number;
  atrPeriod: number;
  bandAtrMult: number;
  stopAtrMult: number;
  rr: number;
  cooldownBars: number;
  useRsiFilter: boolean;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
};

export const DEFAULT_RANGE_BREAKOUT_CONFIG: RangeBreakoutConfig = {
  enabled: true,
  lookbackBars: 20,
  atrPeriod: 14,
  atrMult: 1.5,
  rr: 2.0,
  cooldownBars: 6,
  breakoutMode: 'close',
  bufferAtrMult: 0
};

export const DEFAULT_BREAK_RETEST_CONFIG: BreakRetestConfig = {
  enabled: true,
  lookbackBars: 20,
  atrPeriod: 14,
  atrMult: 1.4,
  rr: 2.0,
  cooldownBars: 6,
  breakoutMode: 'close',
  bufferAtrMult: 0,
  retestBars: 24,
  retestBufferAtrMult: 0.15,
  retestConfirm: 'touch'
};

export const DEFAULT_FVG_RETRACE_CONFIG: FvgRetraceConfig = {
  enabled: true,
  atrPeriod: 14,
  atrMult: 0.8,
  rr: 2.2,
  maxWaitBars: 140,
  entryMode: 'mid',
  minGapAtrMult: 0
};

export const DEFAULT_TREND_PULLBACK_CONFIG: TrendPullbackConfig = {
  enabled: true,
  fastEma: 20,
  slowEma: 50,
  pullbackEma: 'fast',
  confirmMode: 'close',
  minTrendBars: 6,
  atrPeriod: 14,
  atrMult: 1.3,
  rr: 2.0,
  cooldownBars: 8
};

export const DEFAULT_MEAN_REVERSION_CONFIG: MeanReversionConfig = {
  enabled: true,
  smaPeriod: 50,
  atrPeriod: 14,
  bandAtrMult: 1.6,
  stopAtrMult: 1.1,
  rr: 1.8,
  cooldownBars: 6,
  useRsiFilter: true,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70
};

const normalizeStrategyKey = (value: string) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const normalized = raw.replace(/[^A-Z0-9]+/g, '_');
  if (normalized === 'BREAK_RETEST' || normalized === 'BREAKRETEST') return 'BREAK_RETEST';
  if (normalized === 'BREAK_AND_RETEST' || normalized === 'BREAKANDRETEST') return 'BREAK_RETEST';
  if (normalized.includes('BREAK') && normalized.includes('RETEST')) return 'BREAK_RETEST';
  if (normalized === 'RANGE_BREAKOUT' || normalized === 'RANGEBREAKOUT') return 'RANGE_BREAKOUT';
  if (normalized === 'FVG_RETRACE' || normalized === 'FVGRETRACE') return 'FVG_RETRACE';
  if (normalized === 'TREND_PULLBACK' || normalized === 'TRENDPULLBACK') return 'TREND_PULLBACK';
  if (normalized === 'MEAN_REVERSION' || normalized === 'MEANREVERSION') return 'MEAN_REVERSION';
  if (normalized === 'RANGE_BREAKOUT' || normalized === 'FVG_RETRACE') return normalized;
  if (normalized === 'TREND_PULLBACK' || normalized === 'MEAN_REVERSION') return normalized;
  return raw.includes('RANGE') ? 'RANGE_BREAKOUT' : normalized;
};

export function buildStrategyConfig(strategy: string, params: Record<string, any> = {}) {
  const key = normalizeStrategyKey(strategy);
  if (key === 'BREAK_RETEST') return { ...DEFAULT_BREAK_RETEST_CONFIG, ...params, enabled: true };
  if (key === 'FVG_RETRACE') return { ...DEFAULT_FVG_RETRACE_CONFIG, ...params, enabled: true };
  if (key === 'TREND_PULLBACK') return { ...DEFAULT_TREND_PULLBACK_CONFIG, ...params, enabled: true };
  if (key === 'MEAN_REVERSION') return { ...DEFAULT_MEAN_REVERSION_CONFIG, ...params, enabled: true };
  return { ...DEFAULT_RANGE_BREAKOUT_CONFIG, ...params, enabled: true };
}


export type BiasLabel = 'bull' | 'bear' | 'neutral';

export type ConfluenceConfig = {
  enabled: boolean;
  htfResolution: string;
  biasMode: 'ema' | 'sma' | 'range';
  emaFast: number;
  emaSlow: number;
  smaPeriod: number;
  rangeLookback: number;
  allowNeutral: boolean;
  usePrevHtfBar: boolean;
  biasReference: 'signal' | 'entry';
};

export type BacktestTrade = {
  id: string;
  setup: BacktestSetupId;
  side: BacktestSide;
  signalIndex: number;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  risk: number;
  atr?: number | null;
  meta?: Record<string, any>;
  exitIndex?: number;
  exitTime?: number;
  exitPrice?: number;
  outcome?: 'win' | 'loss' | 'open';
  rMultiple?: number;
  exitReason?: 'tp' | 'sl' | 'open';
};

export type BacktestStats = {
  total: number;
  closed: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
};

function toNumber(value: any): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function computeMedian(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getOverrideMult(override: SessionCostOverride | undefined, kind: 'spread' | 'slippage' | 'commission') {
  if (!override) return 1;
  if (kind === 'spread') return Number.isFinite(Number(override.spreadMult)) ? Number(override.spreadMult) : 1;
  if (kind === 'slippage') return Number.isFinite(Number(override.slippageMult)) ? Number(override.slippageMult) : 1;
  return Number.isFinite(Number(override.commissionMult)) ? Number(override.commissionMult) : 1;
}

function getOverrideBps(override: SessionCostOverride | undefined, kind: 'spread' | 'slippage' | 'commission') {
  if (!override) return 0;
  if (kind === 'spread') return Number.isFinite(Number(override.spreadBps)) ? Number(override.spreadBps) : 0;
  if (kind === 'slippage') return Number.isFinite(Number(override.slippageBps)) ? Number(override.slippageBps) : 0;
  return Number.isFinite(Number(override.commissionBps)) ? Number(override.commissionBps) : 0;
}

function applyCostOverride(
  base: number,
  price: number,
  override: SessionCostOverride | undefined,
  kind: 'spread' | 'slippage' | 'commission'
) {
  if (!Number.isFinite(base)) return base;
  const mult = getOverrideMult(override, kind);
  const bps = getOverrideBps(override, kind);
  const adjusted = base * mult + price * (bps / 10000);
  return Math.max(0, adjusted);
}

function computeFillRatio(range: number | null, atr: number | null, exec: ExecutionConfig) {
  if (exec.partialFillMode !== 'range') return 1;
  if (range == null || !Number.isFinite(range) || range <= 0) return 1;
  if (atr == null || !Number.isFinite(atr) || atr <= 0) return 1;
  const threshold = Math.max(0, Number(exec.partialFillAtrMult) || 0);
  if (!threshold) return 1;
  if (range <= atr * threshold) return 1;
  const ratio = (atr * threshold) / range;
  return clamp(ratio, exec.partialFillMinRatio, 1);
}

function computeVolatilityMult(atr: number | null, reference: number | null, exec: ExecutionConfig) {
  if (!exec.volatilitySlippageEnabled) return 1;
  if (atr == null || reference == null || reference <= 0) return 1;
  const ratio = atr / reference;
  if (ratio >= exec.volatilitySlippageHighThresh) return exec.volatilitySlippageHighMult;
  if (ratio <= exec.volatilitySlippageLowThresh) return exec.volatilitySlippageLowMult;
  return exec.volatilitySlippageMidMult;
}

export function resolutionToMs(resolution: string) {
  const key = String(resolution || '').trim().toLowerCase();
  switch (key) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return 24 * 60 * 60_000;
    case '1w':
      return 7 * 24 * 60 * 60_000;
    default:
      return null;
  }
}


export function computeAtrSeries(bars: Candle[], period: number) {
  const p = Math.max(1, Math.floor(Number(period) || 0));
  const atr: Array<number | null> = Array(bars.length).fill(null);
  if (bars.length < p + 1) return atr;

  let sum = 0;
  for (let i = 1; i < bars.length; i += 1) {
    const high = toNumber(bars[i]?.h);
    const low = toNumber(bars[i]?.l);
    const prevClose = toNumber(bars[i - 1]?.c);
    if (high == null || low == null || prevClose == null) {
      sum = 0;
      continue;
    }

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
    if (i > p) {
      const prevHigh = toNumber(bars[i - p]?.h);
      const prevLow = toNumber(bars[i - p]?.l);
      const prevPrevClose = toNumber(bars[i - p - 1]?.c);
      if (prevHigh != null && prevLow != null && prevPrevClose != null) {
        const prevTr = Math.max(prevHigh - prevLow, Math.abs(prevHigh - prevPrevClose), Math.abs(prevLow - prevPrevClose));
        sum -= prevTr;
      }
    }
    if (i >= p) {
      atr[i] = sum / p;
    }
  }

  return atr;
}

export function computeSmaSeries(bars: Candle[], period: number) {
  const p = Math.max(1, Math.floor(Number(period) || 0));
  const sma: Array<number | null> = Array(bars.length).fill(null);
  if (bars.length < p) return sma;

  let sum = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const close = toNumber(bars[i]?.c);
    if (close == null) {
      sum = 0;
      continue;
    }
    sum += close;
    if (i >= p) {
      const prev = toNumber(bars[i - p]?.c);
      if (prev != null) sum -= prev;
    }
    if (i >= p - 1) {
      sma[i] = sum / p;
    }
  }

  return sma;
}

export function computeEmaSeries(bars: Candle[], period: number) {
  const p = Math.max(1, Math.floor(Number(period) || 0));
  const ema: Array<number | null> = Array(bars.length).fill(null);
  if (bars.length < p) return ema;

  let sum = 0;
  for (let i = 0; i < p; i += 1) {
    const close = toNumber(bars[i]?.c);
    if (close == null) return ema;
    sum += close;
  }
  let prev = sum / p;
  ema[p - 1] = prev;
  const k = 2 / (p + 1);

  for (let i = p; i < bars.length; i += 1) {
    const close = toNumber(bars[i]?.c);
    if (close == null) continue;
    prev = (close - prev) * k + prev;
    ema[i] = prev;
  }

  return ema;
}

export function computeRsiSeries(bars: Candle[], period: number) {
  const p = Math.max(1, Math.floor(Number(period) || 0));
  const rsi: Array<number | null> = Array(bars.length).fill(null);
  if (bars.length < p + 1) return rsi;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= p; i += 1) {
    const close = toNumber(bars[i]?.c);
    const prev = toNumber(bars[i - 1]?.c);
    if (close == null || prev == null) return rsi;
    const change = close - prev;
    if (change >= 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let avgGain = gainSum / p;
  let avgLoss = lossSum / p;
  const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi[p] = 100 - 100 / (1 + firstRs);

  for (let i = p + 1; i < bars.length; i += 1) {
    const close = toNumber(bars[i]?.c);
    const prev = toNumber(bars[i - 1]?.c);
    if (close == null || prev == null) continue;
    const change = close - prev;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (p - 1) + gain) / p;
    avgLoss = (avgLoss * (p - 1) + loss) / p;
    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }

  return rsi;
}

export function computeBiasSeries(bars: Candle[], cfg: ConfluenceConfig): BiasLabel[] {
  const mode = cfg.biasMode || 'ema';
  const result: BiasLabel[] = Array(bars.length).fill('neutral');
  if (bars.length === 0) return result;

  if (mode === 'ema') {
    const fast = computeEmaSeries(bars, cfg.emaFast);
    const slow = computeEmaSeries(bars, cfg.emaSlow);
    for (let i = 0; i < bars.length; i += 1) {
      const f = fast[i];
      const s = slow[i];
      if (f == null || s == null) {
        result[i] = 'neutral';
      } else if (f > s) {
        result[i] = 'bull';
      } else if (f < s) {
        result[i] = 'bear';
      } else {
        result[i] = 'neutral';
      }
    }
    return result;
  }

  if (mode === 'sma') {
    const sma = computeSmaSeries(bars, cfg.smaPeriod);
    for (let i = 0; i < bars.length; i += 1) {
      const close = toNumber(bars[i]?.c);
      const avg = sma[i];
      if (close == null || avg == null) {
        result[i] = 'neutral';
      } else if (close > avg) {
        result[i] = 'bull';
      } else if (close < avg) {
        result[i] = 'bear';
      } else {
        result[i] = 'neutral';
      }
    }
    return result;
  }

  const lookback = Math.max(2, Math.floor(Number(cfg.rangeLookback) || 0));
  for (let i = 0; i < bars.length; i += 1) {
    if (i < lookback) {
      result[i] = 'neutral';
      continue;
    }
    let rangeHigh: number | null = null;
    let rangeLow: number | null = null;
    for (let j = i - lookback; j < i; j += 1) {
      const h = toNumber(bars[j]?.h);
      const l = toNumber(bars[j]?.l);
      if (h != null) rangeHigh = rangeHigh == null ? h : Math.max(rangeHigh, h);
      if (l != null) rangeLow = rangeLow == null ? l : Math.min(rangeLow, l);
    }
    const close = toNumber(bars[i]?.c);
    if (rangeHigh == null || rangeLow == null || close == null) {
      result[i] = 'neutral';
    } else if (close > rangeHigh) {
      result[i] = 'bull';
    } else if (close < rangeLow) {
      result[i] = 'bear';
    } else {
      result[i] = 'neutral';
    }
  }
  return result;
}

export function mapHtfBiasToLtf(
  ltfBars: Candle[],
  htfBars: Candle[],
  htfResolutionMs: number,
  biasSeries: BiasLabel[],
  usePrevHtfBar: boolean
) {
  const result: BiasLabel[] = Array(ltfBars.length).fill('neutral');
  if (ltfBars.length === 0 || htfBars.length === 0 || htfResolutionMs <= 0) return result;

  let htfIndex = -1;
  for (let i = 0; i < ltfBars.length; i += 1) {
    const t = toNumber(ltfBars[i]?.t);
    if (t == null) continue;

    if (usePrevHtfBar) {
      while (htfIndex + 1 < htfBars.length) {
        const next = htfBars[htfIndex + 1];
        const nextStart = toNumber(next?.t);
        if (nextStart == null) break;
        if (nextStart + htfResolutionMs <= t) {
          htfIndex += 1;
        } else {
          break;
        }
      }
    } else {
      while (htfIndex + 1 < htfBars.length) {
        const next = htfBars[htfIndex + 1];
        const nextStart = toNumber(next?.t);
        if (nextStart == null) break;
        if (nextStart <= t) htfIndex += 1;
        else break;
      }
    }

    if (htfIndex >= 0 && htfIndex < biasSeries.length) {
      result[i] = biasSeries[htfIndex] || 'neutral';
    } else {
      result[i] = 'neutral';
    }
  }

  return result;
}

export function generateRangeBreakoutTrades(bars: Candle[], cfg: RangeBreakoutConfig): BacktestTrade[] {
  if (!cfg?.enabled) return [];
  const lookback = Math.max(2, Math.floor(Number(cfg.lookbackBars) || 0));
  if (bars.length < lookback + 2) return [];

  const atrSeries = computeAtrSeries(bars, cfg.atrPeriod);
  const cooldownBars = Math.max(0, Math.floor(Number(cfg.cooldownBars) || 0));
  const trades: BacktestTrade[] = [];
  let cooldown = 0;

  for (let i = lookback; i < bars.length - 1; i += 1) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }

    let rangeHigh: number | null = null;
    let rangeLow: number | null = null;
    for (let j = i - lookback; j < i; j += 1) {
      const h = toNumber(bars[j]?.h);
      const l = toNumber(bars[j]?.l);
      if (h != null) rangeHigh = rangeHigh == null ? h : Math.max(rangeHigh, h);
      if (l != null) rangeLow = rangeLow == null ? l : Math.min(rangeLow, l);
    }

    const close = toNumber(bars[i]?.c);
    const high = toNumber(bars[i]?.h);
    const low = toNumber(bars[i]?.l);
    if (rangeHigh == null || rangeLow == null || close == null) continue;

    const atrAtSignal = atrSeries[i];
    const buffer = atrAtSignal != null && Number.isFinite(atrAtSignal)
      ? atrAtSignal * Number(cfg.bufferAtrMult || 0)
      : 0;

    let side: BacktestSide | null = null;
    if (cfg.breakoutMode === 'wick') {
      if (high != null && high > rangeHigh + buffer) side = 'BUY';
      if (low != null && low < rangeLow - buffer) side = 'SELL';
    } else {
      if (close > rangeHigh + buffer) side = 'BUY';
      if (close < rangeLow - buffer) side = 'SELL';
    }
    if (!side) continue;

    const entryIndex = i + 1;
    const entryBar = bars[entryIndex];
    if (!entryBar) break;
    const entryPrice = toNumber(entryBar?.o) ?? close;
    if (entryPrice == null) continue;

    const atr = atrAtSignal ?? atrSeries[entryIndex];
    if (atr == null || !Number.isFinite(atr)) continue;

    const risk = Math.max(1e-8, atr * Number(cfg.atrMult || 1));
    const stopLoss = side === 'BUY' ? entryPrice - risk : entryPrice + risk;
    const takeProfit = side === 'BUY'
      ? entryPrice + risk * Number(cfg.rr || 1)
      : entryPrice - risk * Number(cfg.rr || 1);

    const entryTime = toNumber(entryBar?.t) ?? 0;
    trades.push({
      id: `rb_${i}_${side}_${entryTime}`,
      setup: 'range_breakout',
      side,
      signalIndex: i,
      entryIndex,
      entryTime,
      entryPrice,
      stopLoss,
      takeProfit,
      risk,
      atr,
      meta: {
        rangeHigh,
        rangeLow,
        breakoutClose: close,
        breakoutMode: cfg.breakoutMode,
        bufferAtrMult: cfg.bufferAtrMult,
        lookbackBars: lookback,
        rr: cfg.rr
      }
    });

    if (cooldownBars > 0) cooldown = cooldownBars;
  }

  return trades;
}

export function generateBreakRetestTrades(bars: Candle[], cfg: BreakRetestConfig): BacktestTrade[] {
  if (!cfg?.enabled) return [];
  const lookback = Math.max(2, Math.floor(Number(cfg.lookbackBars) || 0));
  if (bars.length < lookback + 3) return [];

  const atrSeries = computeAtrSeries(bars, cfg.atrPeriod);
  const cooldownBars = Math.max(0, Math.floor(Number(cfg.cooldownBars) || 0));
  const maxRetestBars = Math.max(1, Math.floor(Number(cfg.retestBars) || 0));
  const retestConfirm = cfg.retestConfirm === 'close' ? 'close' : 'touch';
  const trades: BacktestTrade[] = [];
  let cooldown = 0;

  for (let i = lookback; i < bars.length - 2; i += 1) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }

    let rangeHigh: number | null = null;
    let rangeLow: number | null = null;
    for (let j = i - lookback; j < i; j += 1) {
      const h = toNumber(bars[j]?.h);
      const l = toNumber(bars[j]?.l);
      if (h != null) rangeHigh = rangeHigh == null ? h : Math.max(rangeHigh, h);
      if (l != null) rangeLow = rangeLow == null ? l : Math.min(rangeLow, l);
    }

    const close = toNumber(bars[i]?.c);
    const high = toNumber(bars[i]?.h);
    const low = toNumber(bars[i]?.l);
    if (rangeHigh == null || rangeLow == null || close == null) continue;

    const atrAtSignal = atrSeries[i];
    const buffer = atrAtSignal != null && Number.isFinite(atrAtSignal)
      ? atrAtSignal * Number(cfg.bufferAtrMult || 0)
      : 0;

    let side: BacktestSide | null = null;
    if (cfg.breakoutMode === 'wick') {
      if (high != null && high > rangeHigh + buffer) side = 'BUY';
      if (low != null && low < rangeLow - buffer) side = 'SELL';
    } else {
      if (close > rangeHigh + buffer) side = 'BUY';
      if (close < rangeLow - buffer) side = 'SELL';
    }
    if (!side) continue;

    const breakoutLevel = side === 'BUY' ? rangeHigh + buffer : rangeLow - buffer;
    const retestLimit = Math.min(bars.length - 2, i + maxRetestBars);
    let retestIndex: number | null = null;

    for (let j = i + 1; j <= retestLimit; j += 1) {
      const bar = bars[j];
      if (!bar) continue;
      const retestAtr = atrSeries[j] ?? atrAtSignal;
      const tolerance = retestAtr != null && Number.isFinite(retestAtr)
        ? retestAtr * Number(cfg.retestBufferAtrMult || 0)
        : 0;
      const retestClose = toNumber(bar?.c);
      const retestHigh = toNumber(bar?.h);
      const retestLow = toNumber(bar?.l);
      if (retestClose == null || retestHigh == null || retestLow == null) continue;

      let touched = false;
      if (side === 'BUY') {
        touched = retestConfirm === 'close'
          ? retestClose <= breakoutLevel + tolerance
          : retestLow <= breakoutLevel + tolerance;
      } else {
        touched = retestConfirm === 'close'
          ? retestClose >= breakoutLevel - tolerance
          : retestHigh >= breakoutLevel - tolerance;
      }

      if (touched) {
        retestIndex = j;
        break;
      }
    }

    if (retestIndex == null) continue;
    const entryIndex = retestIndex + 1;
    const entryBar = bars[entryIndex];
    if (!entryBar) break;
    const entryPrice = toNumber(entryBar?.o) ?? toNumber(bars[retestIndex]?.c) ?? close;
    if (entryPrice == null) continue;

    const atr = atrSeries[retestIndex] ?? atrSeries[entryIndex];
    if (atr == null || !Number.isFinite(atr)) continue;

    const risk = Math.max(1e-8, atr * Number(cfg.atrMult || 1));
    const stopLoss = side === 'BUY' ? entryPrice - risk : entryPrice + risk;
    const takeProfit = side === 'BUY'
      ? entryPrice + risk * Number(cfg.rr || 1)
      : entryPrice - risk * Number(cfg.rr || 1);

    const entryTime = toNumber(entryBar?.t) ?? 0;
    trades.push({
      id: `br_${i}_${side}_${entryTime}`,
      setup: 'break_retest',
      side,
      signalIndex: retestIndex,
      entryIndex,
      entryTime,
      entryPrice,
      stopLoss,
      takeProfit,
      risk,
      atr,
      meta: {
        rangeHigh,
        rangeLow,
        breakoutIndex: i,
        retestIndex,
        breakoutLevel,
        breakoutMode: cfg.breakoutMode,
        retestConfirm,
        retestBars: maxRetestBars,
        bufferAtrMult: cfg.bufferAtrMult,
        retestBufferAtrMult: cfg.retestBufferAtrMult,
        rr: cfg.rr
      }
    });

    if (cooldownBars > 0) cooldown = cooldownBars;
  }

  return trades;
}

export function generateFvgRetraceTrades(bars: Candle[], cfg: FvgRetraceConfig): BacktestTrade[] {
  if (!cfg?.enabled) return [];
  if (bars.length < 3) return [];
  const atrSeries = computeAtrSeries(bars, cfg.atrPeriod);
  const maxWait = Math.max(0, Math.floor(Number(cfg.maxWaitBars) || 0));
  const minGapMult = Number(cfg.minGapAtrMult || 0);

  type GapZone = {
    side: BacktestSide;
    gapLow: number;
    gapHigh: number;
    startIndex: number;
  };

  const zones: GapZone[] = [];
  for (let i = 2; i < bars.length; i += 1) {
    const b0 = bars[i - 2];
    const b2 = bars[i];
    const high0 = toNumber(b0?.h);
    const low0 = toNumber(b0?.l);
    const high2 = toNumber(b2?.h);
    const low2 = toNumber(b2?.l);
    if (high0 == null || low0 == null || high2 == null || low2 == null) continue;

    if (high0 < low2) {
      zones.push({ side: 'BUY', gapLow: high0, gapHigh: low2, startIndex: i });
    } else if (low0 > high2) {
      zones.push({ side: 'SELL', gapLow: high2, gapHigh: low0, startIndex: i });
    }
  }

  const trades: BacktestTrade[] = [];
  for (const zone of zones) {
    const gapLow = zone.gapLow;
    const gapHigh = zone.gapHigh;
    const gapSize = Math.abs(gapHigh - gapLow);
    if (minGapMult > 0) {
      const atrAtZone = atrSeries[zone.startIndex];
      if (atrAtZone == null || gapSize < atrAtZone * minGapMult) continue;
    }
    const entryPrice = cfg.entryMode === 'edge'
      ? (zone.side === 'BUY' ? gapHigh : gapLow)
      : (gapLow + gapHigh) / 2;

    if (!Number.isFinite(entryPrice)) continue;

    const lastIndex = maxWait > 0 ? clamp(zone.startIndex + maxWait, 0, bars.length - 1) : bars.length - 1;
    for (let j = zone.startIndex + 1; j <= lastIndex; j += 1) {
      const bar = bars[j];
      if (!bar) continue;
      const low = toNumber(bar?.l);
      const high = toNumber(bar?.h);
      if (low == null || high == null) continue;

      const touched = zone.side === 'BUY'
        ? low <= entryPrice
        : high >= entryPrice;
      if (!touched) continue;

      const atr = atrSeries[j];
      if (atr == null || !Number.isFinite(atr)) break;

      const stopBase = zone.side === 'BUY' ? gapLow : gapHigh;
      const risk = Math.max(1e-8, Math.abs(entryPrice - stopBase) + atr * Number(cfg.atrMult || 1));
      const stopLoss = zone.side === 'BUY'
        ? entryPrice - risk
        : entryPrice + risk;
      const takeProfit = zone.side === 'BUY'
        ? entryPrice + risk * Number(cfg.rr || 1)
        : entryPrice - risk * Number(cfg.rr || 1);

      const entryTime = toNumber(bar?.t) ?? 0;
      trades.push({
        id: `fvg_${zone.startIndex}_${zone.side}_${entryTime}`,
        setup: 'fvg_retrace',
        side: zone.side,
        signalIndex: zone.startIndex,
        entryIndex: j,
        entryTime,
        entryPrice,
        stopLoss,
        takeProfit,
        risk,
        atr,
        meta: {
          gapLow,
          gapHigh,
          gapSize,
          entryMode: cfg.entryMode,
          minGapAtrMult: cfg.minGapAtrMult,
          rr: cfg.rr
        }
      });
      break;
    }
  }

  return trades;
}

export function generateTrendPullbackTrades(bars: Candle[], cfg: TrendPullbackConfig): BacktestTrade[] {
  if (!cfg?.enabled) return [];
  if (bars.length < 5) return [];

  const fastEma = computeEmaSeries(bars, cfg.fastEma);
  const slowEma = computeEmaSeries(bars, cfg.slowEma);
  const pullbackEma = cfg.pullbackEma === 'slow' ? slowEma : fastEma;
  const atrSeries = computeAtrSeries(bars, cfg.atrPeriod);
  const trades: BacktestTrade[] = [];

  let upCount = 0;
  let downCount = 0;
  let cooldown = 0;
  const minTrendBars = Math.max(1, Math.floor(Number(cfg.minTrendBars) || 1));
  const startIndex = Math.max(cfg.fastEma || 0, cfg.slowEma || 0, cfg.atrPeriod || 0);

  for (let i = startIndex; i < bars.length - 1; i += 1) {
    const fast = fastEma[i];
    const slow = slowEma[i];
    const pull = pullbackEma[i];
    if (fast == null || slow == null || pull == null) continue;

    if (fast > slow) {
      upCount += 1;
      downCount = 0;
    } else if (fast < slow) {
      downCount += 1;
      upCount = 0;
    } else {
      upCount = 0;
      downCount = 0;
    }

    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }

    const close = toNumber(bars[i]?.c);
    const low = toNumber(bars[i]?.l);
    const high = toNumber(bars[i]?.h);
    if (close == null || low == null || high == null) continue;

    let side: BacktestSide | null = null;
    if (fast > slow && upCount >= minTrendBars) side = 'BUY';
    if (fast < slow && downCount >= minTrendBars) side = 'SELL';
    if (!side) continue;

    const touched = side === 'BUY' ? low <= pull : high >= pull;
    const confirmed = cfg.confirmMode === 'touch'
      ? touched
      : (touched && (side === 'BUY' ? close > pull : close < pull));
    if (!confirmed) continue;

    const entryIndex = i + 1;
    const entryBar = bars[entryIndex];
    if (!entryBar) break;
    const entryPrice = toNumber(entryBar?.o) ?? close;
    if (entryPrice == null) continue;

    const atr = atrSeries[i] ?? atrSeries[entryIndex];
    if (atr == null || !Number.isFinite(atr)) continue;

    const risk = Math.max(1e-8, atr * Number(cfg.atrMult || 1));
    const stopLoss = side === 'BUY' ? entryPrice - risk : entryPrice + risk;
    const takeProfit = side === 'BUY'
      ? entryPrice + risk * Number(cfg.rr || 1)
      : entryPrice - risk * Number(cfg.rr || 1);

    const entryTime = toNumber(entryBar?.t) ?? 0;
    trades.push({
      id: `tp_${i}_${side}_${entryTime}`,
      setup: 'trend_pullback',
      side,
      signalIndex: i,
      entryIndex,
      entryTime,
      entryPrice,
      stopLoss,
      takeProfit,
      risk,
      atr,
      meta: {
        fastEma: cfg.fastEma,
        slowEma: cfg.slowEma,
        pullbackEma: cfg.pullbackEma,
        confirmMode: cfg.confirmMode,
        minTrendBars,
        rr: cfg.rr
      }
    });

    if (cfg.cooldownBars > 0) cooldown = Math.max(0, Math.floor(Number(cfg.cooldownBars) || 0));
  }

  return trades;
}

export function generateMeanReversionTrades(bars: Candle[], cfg: MeanReversionConfig): BacktestTrade[] {
  if (!cfg?.enabled) return [];
  if (bars.length < 5) return [];

  const smaSeries = computeSmaSeries(bars, cfg.smaPeriod);
  const atrSeries = computeAtrSeries(bars, cfg.atrPeriod);
  const rsiSeries = cfg.useRsiFilter ? computeRsiSeries(bars, cfg.rsiPeriod) : [];
  const trades: BacktestTrade[] = [];
  let cooldown = 0;
  const startIndex = Math.max(cfg.smaPeriod || 0, cfg.atrPeriod || 0, cfg.useRsiFilter ? cfg.rsiPeriod || 0 : 0);

  for (let i = startIndex; i < bars.length - 1; i += 1) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }

    const close = toNumber(bars[i]?.c);
    const sma = smaSeries[i];
    const atr = atrSeries[i];
    if (close == null || sma == null || atr == null) continue;

    const band = atr * Number(cfg.bandAtrMult || 0);
    const upper = sma + band;
    const lower = sma - band;

    let side: BacktestSide | null = null;
    if (close < lower) side = 'BUY';
    if (close > upper) side = 'SELL';
    if (!side) continue;

    if (cfg.useRsiFilter) {
      const rsi = rsiSeries[i];
      if (rsi == null) continue;
      if (side === 'BUY' && rsi > Number(cfg.rsiOversold || 30)) continue;
      if (side === 'SELL' && rsi < Number(cfg.rsiOverbought || 70)) continue;
    }

    const entryIndex = i + 1;
    const entryBar = bars[entryIndex];
    if (!entryBar) break;
    const entryPrice = toNumber(entryBar?.o) ?? close;
    if (entryPrice == null) continue;

    const risk = Math.max(1e-8, atr * Number(cfg.stopAtrMult || 1));
    const stopLoss = side === 'BUY' ? entryPrice - risk : entryPrice + risk;
    const takeProfit = side === 'BUY'
      ? entryPrice + risk * Number(cfg.rr || 1)
      : entryPrice - risk * Number(cfg.rr || 1);

    const entryTime = toNumber(entryBar?.t) ?? 0;
    trades.push({
      id: `mr_${i}_${side}_${entryTime}`,
      setup: 'mean_reversion',
      side,
      signalIndex: i,
      entryIndex,
      entryTime,
      entryPrice,
      stopLoss,
      takeProfit,
      risk,
      atr,
      meta: {
        smaPeriod: cfg.smaPeriod,
        bandAtrMult: cfg.bandAtrMult,
        stopAtrMult: cfg.stopAtrMult,
        useRsiFilter: cfg.useRsiFilter,
        rsiPeriod: cfg.rsiPeriod,
        rsiOversold: cfg.rsiOversold,
        rsiOverbought: cfg.rsiOverbought,
        rr: cfg.rr
      }
    });

    if (cfg.cooldownBars > 0) cooldown = Math.max(0, Math.floor(Number(cfg.cooldownBars) || 0));
  }

  return trades;
}

export function simulateTrades(
  bars: Candle[],
  trades: BacktestTrade[],
  opts?: { tieBreaker?: 'sl' | 'tp'; execution?: Partial<ExecutionConfig> }
): BacktestTrade[] {
  const tieBreaker = opts?.tieBreaker === 'tp' ? 'tp' : 'sl';
  const exec = normalizeExecutionConfig(opts?.execution);
  const simulated: BacktestTrade[] = [];
  const needAtrSeries = exec.volatilitySlippageEnabled || exec.partialFillMode !== 'none' || exec.newsSpikeAtrMult > 0;
  const atrSeries = needAtrSeries ? computeAtrSeries(bars, 14) : [];
  const volLookback = Math.max(5, Math.floor(exec.volatilitySlippageLookback || 50));
  const getAtrReference = (index: number) => {
    if (!exec.volatilitySlippageEnabled) return null;
    const start = Math.max(0, index - volLookback + 1);
    const window = atrSeries
      .slice(start, index + 1)
      .filter((value): value is number => value != null && Number.isFinite(value));
    return computeMedian(window);
  };

  for (const trade of trades) {
    const sideMult = trade.side === 'BUY' ? 1 : -1;
    const orderType = exec.entryOrderType || 'market';
    const delayBars = Math.max(0, Math.floor(Number(exec.entryDelayBars) || 0));
    const maxWaitBars = Math.max(0, Math.floor(Number(exec.maxEntryWaitBars) || 0));

    let entryIndex = exec.entryTiming === 'signal_close' ? trade.signalIndex : trade.entryIndex;
    entryIndex += delayBars;
    if (entryIndex < 0 || entryIndex >= bars.length) continue;

    let entryBase = trade.entryPrice;
    let entryTime: number | null = null;

    if (orderType === 'market') {
      const entryBar = bars[entryIndex];
      entryBase = exec.entryTiming === 'signal_close'
        ? toNumber(entryBar?.c) ?? entryBase
        : toNumber(entryBar?.o) ?? entryBase;
      entryTime = toNumber(entryBar?.t) ?? trade.entryTime;
    } else {
      const target = toNumber(trade.entryPrice);
      if (target == null) continue;
      const maxIndex = Math.min(bars.length - 1, entryIndex + maxWaitBars);
      let filledIndex: number | null = null;
      for (let i = entryIndex; i <= maxIndex; i += 1) {
        const bar = bars[i];
        const high = toNumber(bar?.h);
        const low = toNumber(bar?.l);
        if (high == null || low == null) continue;
        const hit = orderType === 'limit'
          ? (trade.side === 'BUY' ? low <= target : high >= target)
          : (trade.side === 'BUY' ? high >= target : low <= target);
        if (hit) {
          filledIndex = i;
          break;
        }
      }
      if (filledIndex == null) continue;
      entryIndex = filledIndex;
      entryBase = target;
      const entryBar = bars[entryIndex];
      entryTime = toNumber(entryBar?.t) ?? trade.entryTime;
    }

    if (!Number.isFinite(Number(entryBase)) || entryBase == null) continue;
    if (entryTime == null) continue;
    if (entryTime == null) continue;

      const session = getSessionLabel(entryTime, exec.sessionTimezone);
      const sessionOverride = exec.sessionCostOverrides?.[session];
      if (exec.sessionFilter !== 'all') {
        if (session !== exec.sessionFilter) continue;
      }

    let rr = trade.meta?.rr;
    if (!Number.isFinite(Number(rr)) || rr == null) {
      const riskGuess = Math.abs((trade.stopLoss ?? trade.entryPrice) - trade.entryPrice);
      rr = riskGuess > 0 ? Math.abs((trade.takeProfit ?? trade.entryPrice) - trade.entryPrice) / riskGuess : 1;
    }
    rr = Number(rr) || 1;

    let riskDistance = Number.isFinite(Number(trade.risk)) && Number(trade.risk) > 0
      ? Number(trade.risk)
      : Math.abs((trade.stopLoss ?? trade.entryPrice) - trade.entryPrice);

    let stopLoss = trade.stopLoss;
    let takeProfit = trade.takeProfit;
    if (entryBase !== trade.entryPrice && riskDistance > 0) {
      stopLoss = trade.side === 'BUY' ? entryBase - riskDistance : entryBase + riskDistance;
      takeProfit = trade.side === 'BUY'
        ? entryBase + riskDistance * rr
        : entryBase - riskDistance * rr;
    }

    const minStop = Math.max(0, exec.minStopValue, (trade.atr != null ? trade.atr * exec.minStopAtrMult : 0));
    if (minStop > 0 && riskDistance < minStop) {
      if (exec.minStopMode === 'skip') continue;
      riskDistance = minStop;
      stopLoss = trade.side === 'BUY' ? entryBase - riskDistance : entryBase + riskDistance;
      takeProfit = trade.side === 'BUY'
        ? entryBase + riskDistance * rr
        : entryBase - riskDistance * rr;
    }

      const entryBar = bars[entryIndex];
      const entryHigh = toNumber(entryBar?.h);
      const entryLow = toNumber(entryBar?.l);
      const entryRange = entryHigh != null && entryLow != null ? entryHigh - entryLow : null;
      const entryAtr = atrSeries[entryIndex] ?? (Number.isFinite(Number(trade.atr)) ? Number(trade.atr) : null);
      const atrReference = getAtrReference(entryIndex);
      const volatilityMult = computeVolatilityMult(entryAtr, atrReference, exec);
      const isNewsSpike = entryAtr != null
        && entryRange != null
        && exec.newsSpikeAtrMult > 0
        && entryRange >= entryAtr * exec.newsSpikeAtrMult;
      const spikeSpreadMult = isNewsSpike ? exec.newsSpikeSpreadMult : 1;
      const spikeSlippageMult = isNewsSpike ? exec.newsSpikeSlippageMult : 1;

      let spread = computeSpread(entryBase, entryAtr ?? null, exec);
      spread = applyCostOverride(spread, entryBase, sessionOverride, 'spread');
      spread = Math.max(0, spread * spikeSpreadMult);
      if (exec.maxSpreadValue > 0 && spread > exec.maxSpreadValue) continue;
      let slippage = computeSlippage(entryBase, entryAtr ?? null, exec);
      slippage = Math.max(0, slippage * volatilityMult);
      slippage = applyCostOverride(slippage, entryBase, sessionOverride, 'slippage');
      slippage = Math.max(0, slippage * spikeSlippageMult);
      const slippageExit = exec.slippageOnExit ? slippage : 0;

    const entryFill = entryBase + sideMult * (spread / 2 + slippage);
      const commissionEntryBase = computeCommission(entryFill, exec);
      const commissionEntry = applyCostOverride(commissionEntryBase, entryFill, sessionOverride, 'commission');
    const stopFill = trade.side === 'BUY'
      ? stopLoss - spread / 2 - slippageExit
      : stopLoss + spread / 2 + slippageExit;
    const tpFill = trade.side === 'BUY'
      ? takeProfit - spread / 2 - slippageExit
      : takeProfit + spread / 2 + slippageExit;

    const next: BacktestTrade = {
      ...trade,
      entryIndex,
      entryTime,
      entryPrice: entryFill,
      stopLoss,
      takeProfit,
      risk: Math.max(1e-8, Math.abs(entryFill - stopFill)),
      meta: {
        ...(trade.meta || {}),
          execution: {
            entryTiming: exec.entryTiming,
            entryOrderType: exec.entryOrderType,
            entryDelayBars: exec.entryDelayBars,
            maxEntryWaitBars: exec.maxEntryWaitBars,
            exitMode: exec.exitMode,
            spread,
            slippage,
            volatilityMult,
            atrReference,
            atrAtEntry: entryAtr,
            entryRange,
            newsSpike: isNewsSpike,
            commissionModel: exec.commissionModel,
            commissionValue: exec.commissionValue,
            commissionPct: exec.commissionPct,
            commissionEntry,
            sessionFilter: exec.sessionFilter,
            sessionLabel: session
          }
        }
      };

    const start = Math.max(0, Math.floor(exec.allowSameBarExit ? entryIndex : entryIndex + 1));
    let outcome: 'win' | 'loss' | 'open' = 'open';
    let exitReason: 'tp' | 'sl' | 'open' = 'open';
    let exitIndex: number | undefined;
      let exitPrice: number | undefined;
      let exitTime: number | undefined;
      let exitRange: number | null = null;
      let exitAtr: number | null = null;

      for (let i = start; i < bars.length; i += 1) {
        const bar = bars[i];
        const high = toNumber(bar?.h);
        const low = toNumber(bar?.l);
      const close = toNumber(bar?.c);
      if (high == null || low == null) continue;

      let hitStop = false;
      let hitTp = false;
      if (exec.exitMode === 'close' && close != null) {
        const bidClose = close - spread / 2;
        const askClose = close + spread / 2;
        if (trade.side === 'BUY') {
          hitStop = bidClose <= stopLoss;
          hitTp = bidClose >= takeProfit;
        } else {
          hitStop = askClose >= stopLoss;
          hitTp = askClose <= takeProfit;
        }
      } else {
        const bidHigh = high - spread / 2;
        const bidLow = low - spread / 2;
        const askHigh = high + spread / 2;
        const askLow = low + spread / 2;
        if (trade.side === 'BUY') {
          hitStop = bidLow <= stopLoss;
          hitTp = bidHigh >= takeProfit;
        } else {
          hitStop = askHigh >= stopLoss;
          hitTp = askLow <= takeProfit;
        }
      }

        if (hitStop && hitTp) {
          if (tieBreaker === 'tp') {
            outcome = 'win';
            exitReason = 'tp';
            exitPrice = tpFill;
        } else {
          outcome = 'loss';
          exitReason = 'sl';
          exitPrice = stopFill;
        }
          exitIndex = i;
          exitTime = toNumber(bar?.t) ?? undefined;
          exitRange = high != null && low != null ? high - low : null;
          exitAtr = atrSeries[i] ?? entryAtr ?? null;
          break;
        }

      if (hitStop) {
        outcome = 'loss';
        exitReason = 'sl';
          exitIndex = i;
          exitPrice = stopFill;
          exitTime = toNumber(bar?.t) ?? undefined;
          exitRange = high != null && low != null ? high - low : null;
          exitAtr = atrSeries[i] ?? entryAtr ?? null;
          break;
        }

      if (hitTp) {
        outcome = 'win';
        exitReason = 'tp';
          exitIndex = i;
          exitPrice = tpFill;
          exitTime = toNumber(bar?.t) ?? undefined;
          exitRange = high != null && low != null ? high - low : null;
          exitAtr = atrSeries[i] ?? entryAtr ?? null;
          break;
        }
      }

    next.outcome = outcome;
    next.exitReason = exitReason;
      next.exitIndex = exitIndex;
      next.exitTime = exitTime;
      let exitNewsSpike = false;
      if (exitRange != null && exitAtr != null && exec.newsSpikeAtrMult > 0) {
        exitNewsSpike = exitRange >= exitAtr * exec.newsSpikeAtrMult;
      }
      if (exitPrice != null && exitNewsSpike && exec.newsSpikeSlippageMult > 1) {
        const extraSlip = Math.max(0, slippage * (exec.newsSpikeSlippageMult - 1));
        exitPrice = exitPrice - sideMult * extraSlip;
      }
      next.exitPrice = exitPrice;
      const commissionExitBase = exitPrice != null ? computeCommission(exitPrice, exec) : 0;
      const commissionExit = applyCostOverride(commissionExitBase, exitPrice ?? entryFill, sessionOverride, 'commission');
      const entryFillRatio = computeFillRatio(entryRange, entryAtr, exec);
      const exitFillRatio = exec.partialFillOnExit ? computeFillRatio(exitRange, exitAtr, exec) : 1;
      const fillRatio = Math.min(entryFillRatio, exitFillRatio);
      const commissionTotal = commissionEntry + commissionExit;
      const commissionTotalAdj = commissionTotal * fillRatio;
      if (next.meta?.execution) {
        next.meta.execution.commissionExit = commissionExit;
        next.meta.execution.commissionTotal = commissionTotal;
        next.meta.execution.commissionTotalAdj = commissionTotalAdj;
        next.meta.execution.entryFillRatio = entryFillRatio;
        next.meta.execution.exitFillRatio = exitFillRatio;
        next.meta.execution.fillRatio = fillRatio;
        next.meta.execution.exitNewsSpike = exitNewsSpike;
      }
      if (exitPrice != null && next.risk > 0) {
        const delta = trade.side === 'BUY' ? exitPrice - next.entryPrice : next.entryPrice - exitPrice;
        const netDelta = delta * fillRatio - commissionTotalAdj;
        next.rMultiple = netDelta / next.risk;
      }

    simulated.push(next);
  }

  return simulated;
}

export function summarizeTrades(trades: BacktestTrade[]) : BacktestStats {
  const total = trades.length;
  const closed = trades.filter((t) => t.outcome && t.outcome !== 'open');
  const open = trades.filter((t) => t.outcome === 'open' || !t.outcome);
  const wins = closed.filter((t) => t.outcome === 'win');
  const losses = closed.filter((t) => t.outcome === 'loss');

  const winRate = closed.length > 0 ? wins.length / closed.length : null;
  const sumWins = wins.reduce((acc, t) => acc + (t.rMultiple ?? 0), 0);
  const sumLosses = losses.reduce((acc, t) => acc + Math.abs(t.rMultiple ?? 0), 0);
  const expectancy = closed.length > 0 ? (wins.concat(losses).reduce((acc, t) => acc + (t.rMultiple ?? 0), 0) / closed.length) : null;
  const profitFactor = sumLosses > 0 ? sumWins / sumLosses : null;
  const avgWinR = wins.length > 0 ? sumWins / wins.length : null;
  const avgLossR = losses.length > 0 ? -sumLosses / losses.length : null;

  return {
    total,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    open: open.length,
    winRate,
    expectancy,
    profitFactor,
    avgWinR,
    avgLossR
  };
}
