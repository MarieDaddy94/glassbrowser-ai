import type { ResolvedOutcomeEnvelope, SignalAttributionRecord } from '../types';

type LifecycleInput = {
  signalId: string;
  status?: string | null;
  outcome?: string | null;
  createdAtMs?: number | null;
  executedAtMs?: number | null;
  resolvedAtMs?: number | null;
  executionBroker?: string | null;
  executionMode?: string | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  exitPrice?: number | null;
  score?: number | null;
  source?: ResolvedOutcomeEnvelope['source'] | null;
};

const toTs = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
};

const toNum = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toUpper = (value: any) => String(value || '').trim().toUpperCase();

const resolveSource = (input: LifecycleInput): ResolvedOutcomeEnvelope['source'] => {
  if (input.source) return input.source;
  const broker = String(input.executionBroker || '').trim().toLowerCase();
  const mode = String(input.executionMode || '').trim().toLowerCase();
  if (broker === 'shadow' || mode === 'shadow') return 'shadow';
  if (broker === 'sim' || mode === 'paper' || mode === 'suggest') return 'simulated';
  if (broker === 'mt5' || broker === 'tradelocker' || mode === 'live') return 'live';
  return 'unknown';
};

const resolveLifecycleState = (input: LifecycleInput): ResolvedOutcomeEnvelope['lifecycleState'] => {
  const status = toUpper(input.status);
  const outcome = toUpper(input.outcome);
  if (status === 'PROPOSED') return 'proposed';
  if (status === 'SUBMITTING') return 'submitted';
  if (status === 'PENDING') return 'submitted';
  if (status === 'EXECUTED') return 'filled';
  if (status === 'EXPIRED' || outcome === 'EXPIRED') return 'expired';
  if (status === 'REJECTED' || outcome === 'REJECTED') return 'rejected';
  if (status === 'FAILED' || outcome === 'FAILED') return 'failed';
  if (status === 'WIN' || outcome === 'WIN') return 'tp_exit';
  if (status === 'LOSS' || outcome === 'LOSS') return 'sl_exit';
  if (toTs(input.executedAtMs)) return 'filled';
  if (toTs(input.resolvedAtMs)) return 'expired';
  return 'proposed';
};

const resolveDecisionOutcome = (input: LifecycleInput): ResolvedOutcomeEnvelope['decisionOutcome'] => {
  const status = toUpper(input.status);
  const outcome = toUpper(input.outcome);
  if (outcome === 'WIN' || status === 'WIN') return 'WIN';
  if (outcome === 'LOSS' || status === 'LOSS') return 'LOSS';
  if (outcome === 'EXPIRED' || status === 'EXPIRED') return 'EXPIRED';
  if (outcome === 'REJECTED' || status === 'REJECTED') return 'REJECTED';
  if (outcome === 'FAILED' || status === 'FAILED') return 'FAILED';
  return 'UNKNOWN';
};

const resolveExecutionOutcome = (input: LifecycleInput): ResolvedOutcomeEnvelope['executionOutcome'] => {
  const status = toUpper(input.status);
  const outcome = toUpper(input.outcome);
  if (status === 'EXECUTED' || status === 'WIN' || status === 'LOSS') return 'FILLED';
  if (status === 'REJECTED' || outcome === 'REJECTED') return 'REJECTED';
  if (status === 'EXPIRED' || outcome === 'EXPIRED') return 'EXPIRED';
  if (status === 'FAILED' || outcome === 'FAILED') return 'MISSED';
  if (status === 'PENDING' || status === 'SUBMITTING') return 'UNKNOWN';
  return 'UNKNOWN';
};

export const buildResolvedOutcomeEnvelope = (input: LifecycleInput): ResolvedOutcomeEnvelope | null => {
  const signalId = String(input.signalId || '').trim();
  if (!signalId) return null;
  const proposedAtMs = toTs(input.createdAtMs);
  const submittedAtMs = toTs(input.executedAtMs) || (toUpper(input.status) === 'SUBMITTING' ? Date.now() : null);
  const resolvedAtMs = toTs(input.resolvedAtMs);
  return {
    signalId,
    lifecycleState: resolveLifecycleState(input),
    timestamps: {
      proposedAtMs,
      submittedAtMs,
      executedAtMs: toTs(input.executedAtMs),
      resolvedAtMs
    },
    decisionOutcome: resolveDecisionOutcome(input),
    executionOutcome: resolveExecutionOutcome(input),
    source: resolveSource(input)
  };
};

export const buildSignalAttributionRecord = (input: LifecycleInput): SignalAttributionRecord | null => {
  const envelope = buildResolvedOutcomeEnvelope(input);
  if (!envelope) return null;
  const entryPrice = toNum(input.entryPrice);
  const stopLoss = toNum(input.stopLoss);
  const takeProfit = toNum(input.takeProfit);
  const exitPrice = toNum(input.exitPrice);
  const score = toNum(input.score);
  let alphaBps: number | null = null;
  let executionDragBps: number | null = null;

  if (entryPrice != null && entryPrice > 0 && stopLoss != null && takeProfit != null) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);
    if (risk > 0 && Number.isFinite(reward)) {
      const expectedR = reward / risk;
      const realizedR = score != null ? score : null;
      if (realizedR != null) {
        alphaBps = (realizedR * risk / entryPrice) * 10_000;
        executionDragBps = ((expectedR - realizedR) * risk / entryPrice) * 10_000;
      } else if (exitPrice != null) {
        const side = takeProfit >= entryPrice ? 1 : -1;
        const realized = ((exitPrice - entryPrice) * side) / risk;
        alphaBps = (realized * risk / entryPrice) * 10_000;
        executionDragBps = ((expectedR - realized) * risk / entryPrice) * 10_000;
      }
    }
  }

  return {
    signalId: envelope.signalId,
    decisionOutcome: envelope.decisionOutcome,
    executionOutcome: envelope.executionOutcome,
    alphaBps,
    executionDragBps,
    resolvedAt: envelope.timestamps.resolvedAtMs ?? envelope.timestamps.executedAtMs ?? null
  };
};
