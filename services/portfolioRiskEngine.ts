import type { CorrelationExposureSnapshot, PortfolioRiskBudget } from '../types';

export type PortfolioRiskPosition = {
  symbol: string;
  riskPct: number;
  status?: string | null;
};

export type PortfolioRiskInput = {
  candidateSymbol: string;
  candidateRiskPct: number;
  openPositions: PortfolioRiskPosition[];
  maxCorrelatedExposurePct?: number;
  maxSymbolFamilyOverlap?: number;
  maxConcurrentRiskPct?: number;
};

export type PortfolioRiskDecision = {
  allowed: boolean;
  reasons: string[];
  budget: PortfolioRiskBudget;
  exposures: CorrelationExposureSnapshot[];
};

const normalizeFamily = (symbol: string) => {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return 'UNKNOWN';
  const letters = raw.replace(/[^A-Z]/g, '');
  if (!letters) return raw;
  if (letters.length <= 3) return letters;
  return letters.slice(0, 3);
};

const normalizeRisk = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
};

export const evaluatePortfolioRisk = (input: PortfolioRiskInput): PortfolioRiskDecision => {
  const openPositions = Array.isArray(input.openPositions) ? input.openPositions : [];
  const candidateRisk = normalizeRisk(input.candidateRiskPct);
  const maxCorrelatedExposurePct = Number.isFinite(Number(input.maxCorrelatedExposurePct))
    ? Math.max(0.1, Number(input.maxCorrelatedExposurePct))
    : 3.5;
  const maxSymbolFamilyOverlap = Number.isFinite(Number(input.maxSymbolFamilyOverlap))
    ? Math.max(1, Math.floor(Number(input.maxSymbolFamilyOverlap)))
    : 2;
  const maxConcurrentRiskPct = Number.isFinite(Number(input.maxConcurrentRiskPct))
    ? Math.max(0.1, Number(input.maxConcurrentRiskPct))
    : 6;
  const reasons: string[] = [];
  const familyMap = new Map<string, { symbols: Set<string>; risk: number }>();

  let currentConcurrentRiskPct = 0;
  for (const position of openPositions) {
    const risk = normalizeRisk(position.riskPct);
    if (risk <= 0) continue;
    currentConcurrentRiskPct += risk;
    const symbol = String(position.symbol || '').trim().toUpperCase();
    const family = normalizeFamily(symbol);
    const bucket = familyMap.get(family) || { symbols: new Set<string>(), risk: 0 };
    bucket.symbols.add(symbol || family);
    bucket.risk += risk;
    familyMap.set(family, bucket);
  }

  const candidateFamily = normalizeFamily(input.candidateSymbol);
  const candidateBucket = familyMap.get(candidateFamily) || { symbols: new Set<string>(), risk: 0 };
  const projectedFamilyRisk = candidateBucket.risk + candidateRisk;
  const projectedConcurrentRisk = currentConcurrentRiskPct + candidateRisk;
  const projectedFamilyOverlap = candidateBucket.symbols.size + (candidateBucket.symbols.has(String(input.candidateSymbol || '').toUpperCase()) ? 0 : 1);

  if (projectedFamilyRisk > maxCorrelatedExposurePct) {
    reasons.push('correlated_exposure_cap');
  }
  if (projectedConcurrentRisk > maxConcurrentRiskPct) {
    reasons.push('concurrent_risk_cap');
  }
  if (projectedFamilyOverlap > maxSymbolFamilyOverlap) {
    reasons.push('symbol_family_overlap_cap');
  }

  const exposures: CorrelationExposureSnapshot[] = Array.from(familyMap.entries())
    .map(([family, bucket]) => ({
      symbolGroup: family,
      symbols: Array.from(bucket.symbols),
      openRiskPct: Number(bucket.risk.toFixed(4))
    }))
    .sort((a, b) => b.openRiskPct - a.openRiskPct);

  const budget: PortfolioRiskBudget = {
    maxCorrelatedExposurePct,
    maxSymbolFamilyOverlap,
    maxConcurrentRiskPct,
    currentCorrelatedExposurePct: Number(projectedFamilyRisk.toFixed(4)),
    currentConcurrentRiskPct: Number(projectedConcurrentRisk.toFixed(4))
  };

  return {
    allowed: reasons.length === 0,
    reasons,
    budget,
    exposures
  };
};
