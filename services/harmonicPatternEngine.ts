import { Candle, computeAtrSeries } from './backtestEngine';
import { normalizeSymbolKey, normalizeTimeframe } from './symbols';

export type HarmonicPatternType =
  | 'gartley'
  | 'bat'
  | 'butterfly'
  | 'crab'
  | 'deep_crab'
  | 'cypher'
  | 'shark';

export type HarmonicDirection = 'bullish' | 'bearish';

export type HarmonicDetectorId =
  | 'harmonic_gartley'
  | 'harmonic_bat'
  | 'harmonic_butterfly'
  | 'harmonic_crab'
  | 'harmonic_deep_crab'
  | 'harmonic_cypher'
  | 'harmonic_shark';

type PivotType = 'high' | 'low';

type HarmonicPivot = {
  type: PivotType;
  index: number;
  ts: number;
  price: number;
};

type HarmonicRatios = {
  abXa: number | null;
  bcAb: number | null;
  cdBc: number | null;
  cdAb: number | null;
  dXa: number | null;
  cXa: number | null;
  dXc: number | null;
  bXaProj: number | null;
  cAbProj: number | null;
  dOx: number | null;
};

type HarmonicCandidate = {
  detectorId: HarmonicDetectorId;
  harmonicType: HarmonicPatternType;
  direction: HarmonicDirection;
  anchors: {
    o?: HarmonicPivot;
    x: HarmonicPivot;
    a: HarmonicPivot;
    b: HarmonicPivot;
    c: HarmonicPivot;
    d: HarmonicPivot;
  };
  ratios: HarmonicRatios;
  prz: {
    low: number;
    high: number;
    mid: number;
    widthBps: number;
  };
  confidence: number;
  score: number;
  matureBarsSinceD: number;
  patternKey: string;
};

type HarmonicTarget = {
  value: number;
  weight: number;
};

type HarmonicDetectionConfig = {
  enabledDetectors: Set<HarmonicDetectorId>;
  symbol: string;
  timeframe: string;
  barIndex: number;
  tolerance: number;
  strictTolerance: number;
};

const HARMONIC_LOOKBACK = 3;
const HARMONIC_MAX_PIVOTS = 18;
const MIN_PIVOT_SPACING_BARS = 2;
const RATIO_TOLERANCE_DEFAULT = 0.02;
const RATIO_TOLERANCE_STRICT = 0.015;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const safeDiv = (num: number, den: number) => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return Math.abs(num / den);
};

const toNum = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const inRange = (value: number | null, min: number, max: number) => {
  if (value == null) return false;
  return value >= min && value <= max;
};

const ratioCloseness = (value: number | null, target: number, tolerance = RATIO_TOLERANCE_DEFAULT) => {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(target) || target === 0) return 0;
  const delta = Math.abs(value - target) / Math.abs(target);
  return clamp01(1 - delta / Math.max(1e-9, tolerance));
};

const rangeCloseness = (value: number | null, min: number, max: number) => {
  if (value == null || !Number.isFinite(value)) return 0;
  if (value >= min && value <= max) {
    const center = (min + max) / 2;
    const half = Math.max(1e-9, (max - min) / 2);
    return clamp01(1 - Math.abs(value - center) / half);
  }
  const dist = value < min ? min - value : value - max;
  const spread = Math.max(1e-9, max - min);
  return clamp01(1 - dist / spread);
};

const ensureAlternating = (sequence: HarmonicPivot[]) => {
  for (let i = 1; i < sequence.length; i += 1) {
    if (sequence[i].type === sequence[i - 1].type) return false;
  }
  return true;
};

const buildPrz = (targets: HarmonicTarget[], dPrice: number) => {
  const values = targets
    .map((t) => toNum(t.value))
    .filter((v): v is number => v != null && Number.isFinite(v));
  const fallback = Number.isFinite(dPrice) ? dPrice : 0;
  if (values.length === 0) {
    return {
      low: fallback,
      high: fallback,
      mid: fallback,
      widthBps: 0
    };
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const mid = (low + high) / 2;
  const ref = Math.abs(mid) > 1e-9 ? Math.abs(mid) : 1;
  return {
    low,
    high,
    mid,
    widthBps: Math.abs((high - low) / ref) * 10_000
  };
};

const classifyDirectionFromCD = (c: HarmonicPivot, d: HarmonicPivot): HarmonicDirection => {
  return d.price < c.price ? 'bullish' : 'bearish';
};

const computeCompositeScore = (parts: number[]) => {
  if (!Array.isArray(parts) || parts.length === 0) return 0;
  const clean = parts.map((v) => (Number.isFinite(v) ? clamp01(v) : 0));
  const sum = clean.reduce((acc, v) => acc + v, 0);
  return clamp01(sum / clean.length);
};

const toConfidence = (score: number, matureBarsSinceD: number) => {
  const maturity = clamp01(Math.max(0, matureBarsSinceD) / 6);
  return clamp01(score * 0.8 + maturity * 0.2);
};

const targetFromXaRatio = (x: HarmonicPivot, a: HarmonicPivot, ratio: number) => {
  const xaVector = a.price - x.price;
  return x.price + xaVector * ratio;
};

const targetFromXcRatio = (x: HarmonicPivot, c: HarmonicPivot, ratio: number) => {
  const xcVector = c.price - x.price;
  return x.price + xcVector * ratio;
};

const targetFromOxRatio = (o: HarmonicPivot, x: HarmonicPivot, ratio: number) => {
  const oxVector = x.price - o.price;
  return o.price + oxVector * ratio;
};

const targetFromAbProjection = (a: HarmonicPivot, b: HarmonicPivot, c: HarmonicPivot, ratio: number) => {
  const abAbs = Math.abs(b.price - a.price);
  const abDir = Math.sign(b.price - a.price) || 1;
  return c.price + abDir * abAbs * ratio;
};

const targetFromBcExtension = (b: HarmonicPivot, c: HarmonicPivot, ratio: number) => {
  const bcVector = c.price - b.price;
  return c.price - bcVector * ratio;
};

const toRatios5 = (x: HarmonicPivot, a: HarmonicPivot, b: HarmonicPivot, c: HarmonicPivot, d: HarmonicPivot): HarmonicRatios => {
  const xa = Math.abs(a.price - x.price);
  const ab = Math.abs(b.price - a.price);
  const bc = Math.abs(c.price - b.price);
  const cd = Math.abs(d.price - c.price);
  const xc = Math.abs(c.price - x.price);
  return {
    abXa: safeDiv(ab, xa),
    bcAb: safeDiv(bc, ab),
    cdBc: safeDiv(cd, bc),
    cdAb: safeDiv(cd, ab),
    dXa: safeDiv(Math.abs(d.price - x.price), xa),
    cXa: safeDiv(Math.abs(c.price - x.price), xa),
    dXc: safeDiv(Math.abs(d.price - x.price), xc),
    bXaProj: null,
    cAbProj: null,
    dOx: null
  };
};

const toRatios6 = (
  o: HarmonicPivot,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicRatios => {
  const xa = Math.abs(a.price - x.price);
  const ab = Math.abs(b.price - a.price);
  const ox = Math.abs(x.price - o.price);
  const base = toRatios5(x, a, b, c, d);
  return {
    ...base,
    bXaProj: safeDiv(Math.abs(b.price - x.price), xa),
    cAbProj: safeDiv(Math.abs(c.price - a.price), ab),
    dOx: safeDiv(Math.abs(d.price - o.price), ox)
  };
};

const buildPatternKey = (
  symbol: string,
  timeframe: string,
  harmonicType: HarmonicPatternType,
  direction: HarmonicDirection,
  anchors: { x: HarmonicPivot; c: HarmonicPivot; d: HarmonicPivot }
) => {
  return [
    normalizeSymbolKey(symbol),
    normalizeTimeframe(timeframe),
    `harmonic_${harmonicType}`,
    direction,
    Math.floor(anchors.d.ts),
    Math.floor(anchors.x.ts),
    Math.floor(anchors.c.ts)
  ].join('|');
};

const isCompleteCandidate = (d: HarmonicPivot, barIndex: number) => d.index <= barIndex;

const evaluateGartley = (
  cfg: HarmonicDetectionConfig,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicCandidate | null => {
  const ratios = toRatios5(x, a, b, c, d);
  const condB = ratioCloseness(ratios.abXa, 0.618, cfg.strictTolerance);
  const condC = rangeCloseness(ratios.bcAb, 0.382, 0.886);
  const condD = ratioCloseness(ratios.dXa, 0.786, cfg.tolerance);
  if (condB <= 0 || condC <= 0 || condD <= 0) return null;
  const abCdEq = ratioCloseness(ratios.cdAb, 1, 0.2);
  const score = computeCompositeScore([condB, condC, condD, abCdEq]);
  const direction = classifyDirectionFromCD(c, d);
  const prz = buildPrz(
    [
      { value: targetFromXaRatio(x, a, 0.786), weight: 1 },
      { value: targetFromAbProjection(a, b, c, 1), weight: 0.8 }
    ],
    d.price
  );
  return {
    detectorId: 'harmonic_gartley',
    harmonicType: 'gartley',
    direction,
    anchors: { x, a, b, c, d },
    ratios,
    prz,
    confidence: toConfidence(score, cfg.barIndex - d.index),
    score,
    matureBarsSinceD: Math.max(0, cfg.barIndex - d.index),
    patternKey: buildPatternKey(cfg.symbol, cfg.timeframe, 'gartley', direction, { x, c, d })
  };
};

const evaluateBat = (
  cfg: HarmonicDetectionConfig,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicCandidate | null => {
  const ratios = toRatios5(x, a, b, c, d);
  const condB = ratios.abXa != null && ratios.abXa <= 0.618 ? 1 : 0;
  const condC = rangeCloseness(ratios.bcAb, 0.382, 0.886);
  const condD = ratioCloseness(ratios.dXa, 0.886, cfg.tolerance);
  if (condB <= 0 || condC <= 0 || condD <= 0) return null;
  const idealB = rangeCloseness(ratios.abXa, 0.382, 0.5);
  const confluence = inRange(ratios.cdBc, 1.618, 2.618) || inRange(ratios.cdAb, 1.27, 1.618) ? 1 : 0;
  const score = computeCompositeScore([condC, condD, condB, idealB, confluence]);
  const direction = classifyDirectionFromCD(c, d);
  const prz = buildPrz(
    [
      { value: targetFromXaRatio(x, a, 0.886), weight: 1 },
      { value: targetFromBcExtension(b, c, 2.0), weight: 0.6 },
      { value: targetFromAbProjection(a, b, c, 1.27), weight: 0.6 }
    ],
    d.price
  );
  return {
    detectorId: 'harmonic_bat',
    harmonicType: 'bat',
    direction,
    anchors: { x, a, b, c, d },
    ratios,
    prz,
    confidence: toConfidence(score, cfg.barIndex - d.index),
    score,
    matureBarsSinceD: Math.max(0, cfg.barIndex - d.index),
    patternKey: buildPatternKey(cfg.symbol, cfg.timeframe, 'bat', direction, { x, c, d })
  };
};

const evaluateButterfly = (
  cfg: HarmonicDetectionConfig,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicCandidate | null => {
  const ratios = toRatios5(x, a, b, c, d);
  const condB = ratioCloseness(ratios.abXa, 0.786, cfg.strictTolerance);
  const condC = rangeCloseness(ratios.bcAb, 0.382, 0.886);
  const condD = ratioCloseness(ratios.dXa, 1.272, cfg.strictTolerance);
  if (condB <= 0 || condC <= 0 || condD <= 0) return null;
  const score = computeCompositeScore([condB, condC, condD]);
  const direction = classifyDirectionFromCD(c, d);
  const prz = buildPrz([{ value: targetFromXaRatio(x, a, 1.272), weight: 1 }], d.price);
  return {
    detectorId: 'harmonic_butterfly',
    harmonicType: 'butterfly',
    direction,
    anchors: { x, a, b, c, d },
    ratios,
    prz,
    confidence: toConfidence(score, cfg.barIndex - d.index),
    score,
    matureBarsSinceD: Math.max(0, cfg.barIndex - d.index),
    patternKey: buildPatternKey(cfg.symbol, cfg.timeframe, 'butterfly', direction, { x, c, d })
  };
};

const evaluateCrab = (
  cfg: HarmonicDetectionConfig,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicCandidate | null => {
  const ratios = toRatios5(x, a, b, c, d);
  const condB = ratios.abXa != null && ratios.abXa <= 0.618 ? 1 : 0;
  const condC = rangeCloseness(ratios.bcAb, 0.382, 0.886);
  const condD = ratioCloseness(ratios.dXa, 1.618, cfg.strictTolerance);
  const condBC = rangeCloseness(ratios.cdBc, 2.618, 3.618);
  if (condB <= 0 || condC <= 0 || condD <= 0 || condBC <= 0) return null;
  const score = computeCompositeScore([condB, condC, condD, condBC]);
  const direction = classifyDirectionFromCD(c, d);
  const prz = buildPrz(
    [
      { value: targetFromXaRatio(x, a, 1.618), weight: 1 },
      { value: targetFromBcExtension(b, c, 2.618), weight: 0.7 }
    ],
    d.price
  );
  return {
    detectorId: 'harmonic_crab',
    harmonicType: 'crab',
    direction,
    anchors: { x, a, b, c, d },
    ratios,
    prz,
    confidence: toConfidence(score, cfg.barIndex - d.index),
    score,
    matureBarsSinceD: Math.max(0, cfg.barIndex - d.index),
    patternKey: buildPatternKey(cfg.symbol, cfg.timeframe, 'crab', direction, { x, c, d })
  };
};

const evaluateDeepCrab = (
  cfg: HarmonicDetectionConfig,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicCandidate | null => {
  const ratios = toRatios5(x, a, b, c, d);
  const condB = ratios.abXa != null && ratios.abXa <= 0.886 ? 1 : 0;
  const condC = rangeCloseness(ratios.bcAb, 0.382, 0.886);
  const condD = ratioCloseness(ratios.dXa, 1.618, cfg.strictTolerance);
  const condBC = ratios.cdBc != null && ratios.cdBc >= 2.24 ? 1 : 0;
  if (condB <= 0 || condC <= 0 || condD <= 0 || condBC <= 0) return null;
  const score = computeCompositeScore([condB, condC, condD, condBC]);
  const direction = classifyDirectionFromCD(c, d);
  const prz = buildPrz(
    [
      { value: targetFromXaRatio(x, a, 1.618), weight: 1 },
      { value: targetFromBcExtension(b, c, 2.24), weight: 0.6 }
    ],
    d.price
  );
  return {
    detectorId: 'harmonic_deep_crab',
    harmonicType: 'deep_crab',
    direction,
    anchors: { x, a, b, c, d },
    ratios,
    prz,
    confidence: toConfidence(score, cfg.barIndex - d.index),
    score,
    matureBarsSinceD: Math.max(0, cfg.barIndex - d.index),
    patternKey: buildPatternKey(cfg.symbol, cfg.timeframe, 'deep_crab', direction, { x, c, d })
  };
};

const evaluateCypher = (
  cfg: HarmonicDetectionConfig,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicCandidate | null => {
  const ratios = toRatios5(x, a, b, c, d);
  const condB = ratios.abXa != null && ratios.abXa < 0.886 ? 1 : 0;
  const condC = rangeCloseness(ratios.cXa, 1.272, 1.414);
  const condD = ratioCloseness(ratios.dXc, 0.786, cfg.strictTolerance);
  if (condB <= 0 || condC <= 0 || condD <= 0) return null;
  const score = computeCompositeScore([condB, condC, condD]);
  const direction = classifyDirectionFromCD(c, d);
  const prz = buildPrz([{ value: targetFromXcRatio(x, c, 0.786), weight: 1 }], d.price);
  return {
    detectorId: 'harmonic_cypher',
    harmonicType: 'cypher',
    direction,
    anchors: { x, a, b, c, d },
    ratios,
    prz,
    confidence: toConfidence(score, cfg.barIndex - d.index),
    score,
    matureBarsSinceD: Math.max(0, cfg.barIndex - d.index),
    patternKey: buildPatternKey(cfg.symbol, cfg.timeframe, 'cypher', direction, { x, c, d })
  };
};

const evaluateShark = (
  cfg: HarmonicDetectionConfig,
  o: HarmonicPivot,
  x: HarmonicPivot,
  a: HarmonicPivot,
  b: HarmonicPivot,
  c: HarmonicPivot,
  d: HarmonicPivot
): HarmonicCandidate | null => {
  const ratios = toRatios6(o, x, a, b, c, d);
  const condB = rangeCloseness(ratios.bXaProj, 1.13, 1.618);
  const condC = rangeCloseness(ratios.cAbProj, 1.618, 2.24);
  const oxCloseRetrace = ratioCloseness(ratios.dOx, 0.886, cfg.tolerance);
  const oxCloseProj = ratioCloseness(ratios.dOx, 1.13, cfg.tolerance);
  const condD = Math.max(oxCloseRetrace, oxCloseProj);
  if (condB <= 0 || condC <= 0 || condD <= 0) return null;
  const score = computeCompositeScore([condB, condC, condD]);
  const direction = classifyDirectionFromCD(c, d);
  const prz = buildPrz(
    [
      { value: targetFromOxRatio(o, x, 0.886), weight: 1 },
      { value: targetFromOxRatio(o, x, 1.13), weight: 1 }
    ],
    d.price
  );
  return {
    detectorId: 'harmonic_shark',
    harmonicType: 'shark',
    direction,
    anchors: { o, x, a, b, c, d },
    ratios,
    prz,
    confidence: toConfidence(score, cfg.barIndex - d.index),
    score,
    matureBarsSinceD: Math.max(0, cfg.barIndex - d.index),
    patternKey: buildPatternKey(cfg.symbol, cfg.timeframe, 'shark', direction, { x, c, d })
  };
};

const dedupeByPatternKey = (candidates: HarmonicCandidate[]) => {
  const map = new Map<string, HarmonicCandidate>();
  for (const candidate of candidates) {
    const key = String(candidate.patternKey || '').trim();
    if (!key) continue;
    const existing = map.get(key);
    if (!existing || candidate.score > existing.score) {
      map.set(key, candidate);
    }
  }
  return Array.from(map.values());
};

export const extractPivotsBalanced = (
  bars: Candle[],
  opts?: {
    lookback?: number;
    minPivotSpacingBars?: number;
  }
) => {
  const list = Array.isArray(bars) ? bars : [];
  if (list.length < 12) return [];
  const lookback = Number.isFinite(Number(opts?.lookback))
    ? Math.max(2, Math.floor(Number(opts?.lookback)))
    : HARMONIC_LOOKBACK;
  const minSpacing = Number.isFinite(Number(opts?.minPivotSpacingBars))
    ? Math.max(1, Math.floor(Number(opts?.minPivotSpacingBars)))
    : MIN_PIVOT_SPACING_BARS;
  const atrSeries = computeAtrSeries(list, 14);
  const pivotsRaw: HarmonicPivot[] = [];
  for (let i = lookback; i < list.length - lookback; i += 1) {
    const bar = list[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j += 1) {
      if (j === i) continue;
      const other = list[j];
      if (!other) continue;
      if (other.h >= bar.h) isHigh = false;
      if (other.l <= bar.l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh === isLow) continue;
    pivotsRaw.push({
      type: isHigh ? 'high' : 'low',
      index: i,
      ts: bar.t,
      price: isHigh ? bar.h : bar.l
    });
  }
  const filtered: HarmonicPivot[] = [];
  for (const pivot of pivotsRaw) {
    const prev = filtered[filtered.length - 1];
    if (!prev) {
      filtered.push(pivot);
      continue;
    }
    if (pivot.type === prev.type) {
      if ((pivot.type === 'high' && pivot.price > prev.price) || (pivot.type === 'low' && pivot.price < prev.price)) {
        filtered[filtered.length - 1] = pivot;
      }
      continue;
    }
    if (pivot.index - prev.index < minSpacing) continue;
    const atr = toNum(atrSeries[pivot.index]) ?? toNum(atrSeries[prev.index]) ?? 0;
    const refPrice = Math.abs(toNum(list[pivot.index]?.c) ?? pivot.price) || 1;
    const minSwing = Math.max(refPrice * 0.0035, Math.abs(atr) * 0.6);
    if (Math.abs(pivot.price - prev.price) < minSwing) continue;
    filtered.push(pivot);
  }
  return filtered.slice(-HARMONIC_MAX_PIVOTS);
};

export const detectHarmonicPatterns = (input: {
  bars: Candle[];
  symbol: string;
  timeframe: string;
  barIndex: number;
  enabledDetectors: Iterable<string>;
  tolerance?: number;
  strictTolerance?: number;
}) => {
  const bars = Array.isArray(input.bars) ? input.bars : [];
  if (bars.length < 16) return [] as HarmonicCandidate[];
  const enabled = new Set(
    Array.from(input.enabledDetectors || [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean) as HarmonicDetectorId[]
  );
  const hasHarmonicEnabled = Array.from(enabled).some((id) => String(id).startsWith('harmonic_'));
  if (!hasHarmonicEnabled) return [] as HarmonicCandidate[];
  const cfg: HarmonicDetectionConfig = {
    enabledDetectors: enabled,
    symbol: String(input.symbol || '').trim(),
    timeframe: String(input.timeframe || '').trim(),
    barIndex: Math.max(0, Math.floor(Number(input.barIndex) || 0)),
    tolerance: Number.isFinite(Number(input.tolerance)) ? Math.max(0.005, Number(input.tolerance)) : RATIO_TOLERANCE_DEFAULT,
    strictTolerance: Number.isFinite(Number(input.strictTolerance))
      ? Math.max(0.003, Number(input.strictTolerance))
      : RATIO_TOLERANCE_STRICT
  };
  const pivots = extractPivotsBalanced(bars, {
    lookback: HARMONIC_LOOKBACK,
    minPivotSpacingBars: MIN_PIVOT_SPACING_BARS
  });
  if (pivots.length < 5) return [] as HarmonicCandidate[];
  const candidates: HarmonicCandidate[] = [];
  for (let i = Math.max(4, pivots.length - HARMONIC_MAX_PIVOTS); i < pivots.length; i += 1) {
    const seq = pivots.slice(i - 4, i + 1);
    if (seq.length !== 5 || !ensureAlternating(seq)) continue;
    const [x, a, b, c, d] = seq;
    if (!isCompleteCandidate(d, cfg.barIndex)) continue;
    if (cfg.enabledDetectors.has('harmonic_gartley')) {
      const candidate = evaluateGartley(cfg, x, a, b, c, d);
      if (candidate) candidates.push(candidate);
    }
    if (cfg.enabledDetectors.has('harmonic_bat')) {
      const candidate = evaluateBat(cfg, x, a, b, c, d);
      if (candidate) candidates.push(candidate);
    }
    if (cfg.enabledDetectors.has('harmonic_butterfly')) {
      const candidate = evaluateButterfly(cfg, x, a, b, c, d);
      if (candidate) candidates.push(candidate);
    }
    if (cfg.enabledDetectors.has('harmonic_crab')) {
      const candidate = evaluateCrab(cfg, x, a, b, c, d);
      if (candidate) candidates.push(candidate);
    }
    if (cfg.enabledDetectors.has('harmonic_deep_crab')) {
      const candidate = evaluateDeepCrab(cfg, x, a, b, c, d);
      if (candidate) candidates.push(candidate);
    }
    if (cfg.enabledDetectors.has('harmonic_cypher')) {
      const candidate = evaluateCypher(cfg, x, a, b, c, d);
      if (candidate) candidates.push(candidate);
    }
  }
  if (cfg.enabledDetectors.has('harmonic_shark')) {
    for (let i = Math.max(5, pivots.length - HARMONIC_MAX_PIVOTS); i < pivots.length; i += 1) {
      const seq = pivots.slice(i - 5, i + 1);
      if (seq.length !== 6 || !ensureAlternating(seq)) continue;
      const [o, x, a, b, c, d] = seq;
      if (!isCompleteCandidate(d, cfg.barIndex)) continue;
      const candidate = evaluateShark(cfg, o, x, a, b, c, d);
      if (candidate) candidates.push(candidate);
    }
  }
  const bestByDetector = new Map<HarmonicDetectorId, HarmonicCandidate>();
  for (const candidate of candidates) {
    const existing = bestByDetector.get(candidate.detectorId);
    if (!existing || candidate.score > existing.score) {
      bestByDetector.set(candidate.detectorId, candidate);
    }
  }
  return dedupeByPatternKey(Array.from(bestByDetector.values()));
};
