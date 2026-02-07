import type { EnsembleDecision } from '../types';

export type EnsembleCandidateInput = {
  signalId?: string | null;
  agentId?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  recencyWinRate?: number | null;
  specializationFit?: number | null;
  regimeFit?: number | null;
  driftPenalty?: number | null;
};

export type EnsembleInput = {
  candidates: EnsembleCandidateInput[];
  minimumScore?: number;
};

const clamp01 = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
};

const avg = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((acc, item) => acc + item, 0) / values.length;
};

export const scoreEnsemble = (input: EnsembleInput): EnsembleDecision => {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const threshold = Number.isFinite(Number(input.minimumScore)) ? Math.max(0.2, Math.min(0.9, Number(input.minimumScore))) : 0.55;
  if (candidates.length === 0) {
    return {
      signalId: null,
      score: 0,
      action: 'skip',
      priority: 'low',
      reasons: ['no_candidates']
    };
  }

  const scored = candidates.map((candidate) => {
    const recency = clamp01(candidate.recencyWinRate);
    const specialization = clamp01(candidate.specializationFit);
    const regime = clamp01(candidate.regimeFit);
    const driftPenalty = clamp01(candidate.driftPenalty);
    const active = [recency, specialization, regime].filter((v) => v > 0).length;
    const weights =
      active >= 3
        ? { recency: 0.45, specialization: 0.3, regime: 0.25 }
        : active === 2
          ? { recency: 0.5, specialization: 0.35, regime: 0.15 }
          : { recency: 0.65, specialization: 0.25, regime: 0.1 };
    const raw = (
      recency * weights.recency +
      specialization * weights.specialization +
      regime * weights.regime
    );
    const adjusted = Math.max(0, Math.min(1, raw - driftPenalty * 0.35));
    return { candidate, adjusted, raw, driftPenalty, recency, specialization, regime };
  });

  scored.sort((a, b) => b.adjusted - a.adjusted);
  const top = scored[0];
  const score = Number(avg(scored.map((item) => item.adjusted)).toFixed(4));
  const priority: EnsembleDecision['priority'] = score >= 0.75 ? 'high' : score >= 0.6 ? 'normal' : 'low';
  const reasons: string[] = [
    `top_agent_score=${top.adjusted.toFixed(3)}`,
    `avg_score=${score.toFixed(3)}`
  ];
  if (top.driftPenalty > 0.4) reasons.push('drift_penalty_applied');
  if (top.regime < 0.45) reasons.push('weak_regime_fit');
  if (top.specialization < 0.45) reasons.push('weak_specialization_fit');
  if (top.recency < 0.45) reasons.push('weak_recent_edge');

  return {
    signalId: top.candidate.signalId || null,
    score,
    action: score >= threshold ? 'take' : 'skip',
    priority,
    reasons
  };
};
