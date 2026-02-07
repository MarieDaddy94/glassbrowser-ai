import { hashStringSampled } from './stringHash';
import type { ExperimentRegistryEntry, PromotionDecision } from '../types';

export type PromotionGateInput = {
  experiment: ExperimentRegistryEntry;
  tradeCount?: number | null;
  walkForwardStability?: number | null;
  maxDrawdownPct?: number | null;
  consistency?: number | null;
  score?: number | null;
  thresholds?: {
    minTradeCount?: number;
    minWalkForwardStability?: number;
    maxDrawdownPct?: number;
    minConsistency?: number;
  };
};

export type DemotionGateInput = {
  experimentId: string;
  liveDriftSeverity?: 'ok' | 'warn' | 'poor' | null;
  liveDrawdownPct?: number | null;
  thresholds?: {
    maxDrawdownPct?: number;
    driftSeverity?: 'warn' | 'poor';
  };
};

const toNum = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const withDefaults = (input?: PromotionGateInput['thresholds']) => ({
  minTradeCount: Number.isFinite(Number(input?.minTradeCount)) ? Math.max(5, Math.floor(Number(input?.minTradeCount))) : 50,
  minWalkForwardStability: Number.isFinite(Number(input?.minWalkForwardStability)) ? Math.max(0, Math.min(1, Number(input?.minWalkForwardStability))) : 0.55,
  maxDrawdownPct: Number.isFinite(Number(input?.maxDrawdownPct)) ? Math.max(0.5, Number(input?.maxDrawdownPct)) : 15,
  minConsistency: Number.isFinite(Number(input?.minConsistency)) ? Math.max(0, Math.min(1, Number(input?.minConsistency))) : 0.55
});

export const buildExperimentRegistryEntry = (input: {
  symbol: string;
  timeframe: string;
  strategy: string;
  config: Record<string, any>;
  source: 'optimizer' | 'research_autopilot' | string;
  experimentId?: string | null;
}): ExperimentRegistryEntry => {
  const canonical = JSON.stringify(input.config || {});
  const configHash = hashStringSampled(canonical, 8192);
  const experimentId = input.experimentId
    ? String(input.experimentId)
    : `${String(input.source || 'exp')}_${Date.now()}_${configHash.slice(0, 8)}`;
  return {
    experimentId,
    configHash,
    symbol: String(input.symbol || '').trim(),
    timeframe: String(input.timeframe || '').trim(),
    strategy: String(input.strategy || '').trim(),
    createdAtMs: Date.now(),
    source: String(input.source || 'optimizer')
  };
};

export const evaluatePromotionPolicy = (input: PromotionGateInput): PromotionDecision => {
  const reasons: string[] = [];
  const thresholds = withDefaults(input.thresholds);
  const tradeCount = toNum(input.tradeCount);
  const walkForwardStability = toNum(input.walkForwardStability);
  const maxDrawdownPct = toNum(input.maxDrawdownPct);
  const consistency = toNum(input.consistency);

  if (tradeCount == null || tradeCount < thresholds.minTradeCount) reasons.push('min_trade_count');
  if (walkForwardStability == null || walkForwardStability < thresholds.minWalkForwardStability) reasons.push('walk_forward_stability');
  if (maxDrawdownPct == null || maxDrawdownPct > thresholds.maxDrawdownPct) reasons.push('max_drawdown');
  if (consistency == null || consistency < thresholds.minConsistency) reasons.push('consistency');

  return {
    experimentId: input.experiment.experimentId,
    pass: reasons.length === 0,
    reasons,
    score: toNum(input.score),
    decidedAtMs: Date.now()
  };
};

export const evaluateAutoDemotionPolicy = (input: DemotionGateInput): PromotionDecision => {
  const reasons: string[] = [];
  const maxDrawdownPct = Number.isFinite(Number(input.thresholds?.maxDrawdownPct))
    ? Math.max(0.5, Number(input.thresholds?.maxDrawdownPct))
    : 18;
  const driftThreshold = input.thresholds?.driftSeverity || 'poor';
  const severity = String(input.liveDriftSeverity || 'ok').toLowerCase();
  const drawdown = toNum(input.liveDrawdownPct);

  if (drawdown != null && drawdown > maxDrawdownPct) reasons.push('drawdown_breach');
  if ((driftThreshold === 'warn' && (severity === 'warn' || severity === 'poor')) || (driftThreshold === 'poor' && severity === 'poor')) {
    reasons.push('drift_breach');
  }

  return {
    experimentId: String(input.experimentId || '').trim(),
    pass: reasons.length > 0,
    reasons,
    score: null,
    decidedAtMs: Date.now()
  };
};
