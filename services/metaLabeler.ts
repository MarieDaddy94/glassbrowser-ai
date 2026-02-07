import type { MetaLabelDecision } from '../types';

export type MetaLabelInput = {
  signalId?: string | null;
  spreadBps?: number | null;
  slippageEstimateBps?: number | null;
  volatilityPct?: number | null;
  driftSeverity?: 'ok' | 'warn' | 'poor' | null;
  ensembleScore?: number | null;
  regimeLabel?: string | null;
  quoteAgeMs?: number | null;
};

const toNum = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const clamp01 = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
};

export const evaluateMetaLabel = (input: MetaLabelInput): MetaLabelDecision => {
  const spreadBps = toNum(input.spreadBps);
  const slippageBps = toNum(input.slippageEstimateBps);
  const volatilityPct = toNum(input.volatilityPct);
  const quoteAgeMs = toNum(input.quoteAgeMs);
  const ensembleScore = clamp01(input.ensembleScore);
  const regimeLabel = String(input.regimeLabel || '').trim().toLowerCase();
  const driftSeverity = (input.driftSeverity || 'ok') as 'ok' | 'warn' | 'poor';
  const reasons: string[] = [];
  let riskScore = 0;

  if (spreadBps != null) {
    if (spreadBps >= 40) {
      riskScore += 0.45;
      reasons.push('spread_very_wide');
    } else if (spreadBps >= 20) {
      riskScore += 0.25;
      reasons.push('spread_wide');
    }
  }
  if (slippageBps != null) {
    if (slippageBps >= 35) {
      riskScore += 0.45;
      reasons.push('slippage_high');
    } else if (slippageBps >= 18) {
      riskScore += 0.25;
      reasons.push('slippage_elevated');
    }
  }
  if (quoteAgeMs != null && quoteAgeMs >= 25_000) {
    riskScore += 0.25;
    reasons.push('quote_age_high');
  }
  if (volatilityPct != null && volatilityPct >= 2.5) {
    riskScore += 0.2;
    reasons.push('high_volatility');
  }
  if (regimeLabel.includes('news') || regimeLabel.includes('risk')) {
    riskScore += 0.2;
    reasons.push('news_risk_regime');
  }
  if (driftSeverity === 'poor') {
    riskScore += 0.35;
    reasons.push('agent_drift_poor');
  } else if (driftSeverity === 'warn') {
    riskScore += 0.2;
    reasons.push('agent_drift_warn');
  }

  if (ensembleScore > 0.75) {
    riskScore -= 0.15;
    reasons.push('ensemble_support_high');
  } else if (ensembleScore < 0.45) {
    riskScore += 0.2;
    reasons.push('ensemble_support_low');
  }
  riskScore = Math.max(0, Math.min(1, riskScore));

  if (riskScore >= 0.65) {
    return {
      signalId: input.signalId || null,
      decision: 'skip',
      confidence: Number(Math.max(0.55, riskScore).toFixed(3)),
      sizeMultiplier: 0,
      reasons
    };
  }
  if (riskScore >= 0.35) {
    return {
      signalId: input.signalId || null,
      decision: 'size_down',
      confidence: Number(Math.max(0.45, riskScore).toFixed(3)),
      sizeMultiplier: 0.5,
      reasons
    };
  }
  reasons.push('risk_within_limits');
  return {
    signalId: input.signalId || null,
    decision: 'take',
    confidence: Number((1 - riskScore).toFixed(3)),
    sizeMultiplier: 1,
    reasons
  };
};
