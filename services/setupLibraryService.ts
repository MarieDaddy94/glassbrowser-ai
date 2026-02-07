import { hashStringSampled } from './stringHash';
import type { SetupLibraryEntry, SetupLibraryTier, SetupStrategy, SetupWinRateTier } from '../types';
import { buildEvidenceCardFromLibraryEntry } from './evidenceCard';

export type SetupLibraryScoreInput = {
  trades?: number | null;
  winRate?: number | null;
  expectancy?: number | null;
  profitFactor?: number | null;
  netR?: number | null;
  maxDrawdown?: number | null;
  stabilityScore?: number | null;
};

export type SetupLibraryScoreResult = {
  score: number;
  tier: SetupLibraryTier;
  winRateTier: SetupWinRateTier;
  eligible: boolean;
  reasons: string[];
};

export type SetupLibraryBuildInput = {
  symbol: string;
  timeframe: string;
  strategy: SetupStrategy;
  params: Record<string, any>;
  stats: {
    total?: number | null;
    winRate?: number | null;
    expectancy?: number | null;
    profitFactor?: number | null;
  };
  performance: {
    netR?: number | null;
    maxDrawdown?: number | null;
  };
  runId?: string | null;
  rangeDays?: number | null;
  timeFilter?: { startHour?: number; endHour?: number; timezone?: 'utc' | 'local' } | null;
  stabilityScore?: number | null;
  source?: string | null;
  minTrades?: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const scoreFromRange = (value: number | null | undefined, min: number, max: number) => {
  if (!Number.isFinite(Number(value))) return 0;
  if (max <= min) return 0;
  return clamp01((Number(value) - min) / (max - min));
};

export const computeSetupLibraryScore = (
  input: SetupLibraryScoreInput,
  minTrades: number
): SetupLibraryScoreResult => {
  const trades = Number.isFinite(Number(input.trades)) ? Number(input.trades) : 0;
  const winRate = Number.isFinite(Number(input.winRate)) ? Number(input.winRate) : null;
  const profitFactor = Number.isFinite(Number(input.profitFactor)) ? Number(input.profitFactor) : null;
  const expectancy = Number.isFinite(Number(input.expectancy)) ? Number(input.expectancy) : null;
  const netR = Number.isFinite(Number(input.netR)) ? Number(input.netR) : null;
  const maxDrawdown = Number.isFinite(Number(input.maxDrawdown)) ? Number(input.maxDrawdown) : null;
  const stabilityScore = Number.isFinite(Number(input.stabilityScore)) ? Number(input.stabilityScore) : null;

  const winRateScore = scoreFromRange(winRate, 0.4, 0.7);
  const pfScore = scoreFromRange(profitFactor, 1.0, 1.8);
  const expectancyScore = scoreFromRange(expectancy, -0.1, 0.4);
  const netRScore = scoreFromRange(netR, 0, 20);
  const tradeScore = scoreFromRange(trades, minTrades, minTrades + 60);
  const drawdownPenalty = scoreFromRange(maxDrawdown, 0, 15);
  const stability = stabilityScore != null ? clamp01(stabilityScore / 100) : 0;

  const rawScore =
    0.25 * winRateScore +
    0.2 * pfScore +
    0.2 * expectancyScore +
    0.15 * netRScore +
    0.1 * tradeScore +
    0.1 * stability -
    0.1 * drawdownPenalty;

  const score = Math.round(clamp01(rawScore) * 100);

  let tier: SetupLibraryTier = 'D';
  if (score >= 85) tier = 'S';
  else if (score >= 75) tier = 'A';
  else if (score >= 65) tier = 'B';
  else if (score >= 55) tier = 'C';

  let winRateTier: SetupWinRateTier = 'WR30';
  if (winRate != null) {
    if (winRate >= 0.7) winRateTier = 'WR70';
    else if (winRate >= 0.6) winRateTier = 'WR60';
    else if (winRate >= 0.5) winRateTier = 'WR50';
    else if (winRate >= 0.4) winRateTier = 'WR40';
    else winRateTier = 'WR30';
  }

  const reasons: string[] = [];
  if (trades < minTrades) reasons.push(`Trades below ${minTrades}.`);
  if (winRate != null && winRate < 0.4) reasons.push('Win rate below 40%.');
  if (profitFactor != null && profitFactor < 1.0) reasons.push('Profit factor below 1.0.');
  if (netR != null && netR <= 0) reasons.push('Net R not positive.');

  const eligible = trades >= minTrades && (winRate == null || winRate >= 0.4);

  return { score, tier, winRateTier, eligible, reasons };
};

export const buildSetupLibraryEntry = (input: SetupLibraryBuildInput) => {
  const minTrades = Number.isFinite(Number(input.minTrades)) ? Math.max(1, Math.floor(Number(input.minTrades))) : 20;
  const scoreResult = computeSetupLibraryScore(
    {
      trades: input.stats?.total ?? null,
      winRate: input.stats?.winRate ?? null,
      expectancy: input.stats?.expectancy ?? null,
      profitFactor: input.stats?.profitFactor ?? null,
      netR: input.performance?.netR ?? null,
      maxDrawdown: input.performance?.maxDrawdown ?? null,
      stabilityScore: input.stabilityScore ?? null
    },
    minTrades
  );

  const symbol = String(input.symbol || '').trim();
  const timeframe = String(input.timeframe || '').trim();
  const strategy = input.strategy;
  const params = input.params && typeof input.params === 'object' ? input.params : {};

  const payloadForHash = {
    symbol,
    timeframe,
    strategy,
    params,
    rangeDays: input.rangeDays ?? null,
    timeFilter: input.timeFilter ?? null
  };
  const configHash = hashStringSampled(JSON.stringify(payloadForHash));

  const createdAtMs = Date.now();
  const configKey = `setup_library:${symbol}:${timeframe}:${strategy}:${configHash}`;
  const entry: SetupLibraryEntry = {
    key: configKey,
    configKey,
    symbol,
    timeframe,
    strategy,
    params,
    evidence: null,
    stats: {
      total: input.stats?.total ?? null,
      winRate: input.stats?.winRate ?? null,
      expectancy: input.stats?.expectancy ?? null,
      profitFactor: input.stats?.profitFactor ?? null
    },
    performance: {
      netR: input.performance?.netR ?? null,
      maxDrawdown: input.performance?.maxDrawdown ?? null
    },
    score: scoreResult.score,
    tier: scoreResult.tier,
    winRateTier: scoreResult.winRateTier,
    runId: input.runId ?? null,
    rangeDays: input.rangeDays ?? null,
    timeFilter: input.timeFilter ?? null,
    createdAtMs,
    updatedAtMs: createdAtMs,
    source: input.source ?? null
  };
  entry.evidence = buildEvidenceCardFromLibraryEntry(entry);

  const summaryParts = [
    `${entry.tier}`,
    `${entry.winRateTier}`,
    `Net ${entry.performance.netR != null ? entry.performance.netR.toFixed(2) : '--'}R`,
    `WR ${entry.stats.winRate != null ? (entry.stats.winRate * 100).toFixed(1) : '--'}%`,
    `PF ${entry.stats.profitFactor != null ? Number(entry.stats.profitFactor).toFixed(2) : '--'}`,
    `Trades ${entry.stats.total ?? '--'}`
  ];

  return {
    entry,
    summary: summaryParts.join(' | '),
    configHash,
    score: scoreResult,
    minTrades
  };
};

export const shouldReplaceLibraryEntry = (current: SetupLibraryEntry | null, next: SetupLibraryEntry) => {
  if (!current) return true;
  if (!Number.isFinite(Number(current.score))) return true;
  if (!Number.isFinite(Number(next.score))) return false;
  if (Number(next.score) > Number(current.score)) return true;
  if (Number(next.score) < Number(current.score)) return false;
  return Number(next.updatedAtMs || 0) > Number(current.updatedAtMs || 0);
};

export const buildSetupLibraryTierKey = (
  symbol: string,
  timeframe: string,
  strategy: SetupStrategy,
  tier: SetupLibraryTier
) => {
  const sym = String(symbol || '').trim();
  const tf = String(timeframe || '').trim();
  const strat = String(strategy || '').trim();
  const t = String(tier || '').trim();
  return `setup_library_tier:${sym}:${tf}:${strat}:${t}`;
};
