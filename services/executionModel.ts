export type SessionCostOverride = {
  spreadMult?: number;
  spreadBps?: number;
  slippageMult?: number;
  slippageBps?: number;
  commissionMult?: number;
  commissionBps?: number;
};

export type SessionCostOverrides = {
  asia?: SessionCostOverride;
  london?: SessionCostOverride;
  ny?: SessionCostOverride;
};

export type ExecutionConfig = {
  entryOrderType: 'market' | 'limit' | 'stop';
  entryTiming: 'next_open' | 'signal_close';
  entryDelayBars: number;
  maxEntryWaitBars: number;
  exitMode: 'touch' | 'close';
  allowSameBarExit: boolean;
  spreadModel: 'none' | 'fixed' | 'atr' | 'percent';
  spreadValue: number;
  spreadAtrMult: number;
  spreadPct: number;
  maxSpreadValue: number;
  slippageModel: 'none' | 'fixed' | 'atr' | 'percent';
  slippageValue: number;
  slippageAtrMult: number;
  slippagePct: number;
  slippageOnExit: boolean;
  commissionModel: 'none' | 'fixed' | 'percent';
  commissionValue: number;
  commissionPct: number;
  minStopValue: number;
  minStopAtrMult: number;
  minStopMode: 'skip' | 'adjust';
  sessionFilter: 'all' | 'asia' | 'london' | 'ny';
  sessionTimezone: 'utc' | 'local';
  sessionCostOverrides: SessionCostOverrides;
  volatilitySlippageEnabled: boolean;
  volatilitySlippageLookback: number;
  volatilitySlippageLowThresh: number;
  volatilitySlippageHighThresh: number;
  volatilitySlippageLowMult: number;
  volatilitySlippageMidMult: number;
  volatilitySlippageHighMult: number;
  partialFillMode: 'none' | 'range';
  partialFillAtrMult: number;
  partialFillMinRatio: number;
  partialFillOnExit: boolean;
  newsSpikeAtrMult: number;
  newsSpikeSlippageMult: number;
  newsSpikeSpreadMult: number;
};

export type SessionLabel = 'asia' | 'london' | 'ny';

export const EXECUTION_MODEL_VERSION = '1.2.0';

const normalizeSessionOverride = (raw?: SessionCostOverride): SessionCostOverride => ({
  spreadMult: Number.isFinite(Number(raw?.spreadMult)) ? Number(raw?.spreadMult) : 1,
  spreadBps: Number.isFinite(Number(raw?.spreadBps)) ? Number(raw?.spreadBps) : 0,
  slippageMult: Number.isFinite(Number(raw?.slippageMult)) ? Number(raw?.slippageMult) : 1,
  slippageBps: Number.isFinite(Number(raw?.slippageBps)) ? Number(raw?.slippageBps) : 0,
  commissionMult: Number.isFinite(Number(raw?.commissionMult)) ? Number(raw?.commissionMult) : 1,
  commissionBps: Number.isFinite(Number(raw?.commissionBps)) ? Number(raw?.commissionBps) : 0
});

export function normalizeExecutionConfig(raw?: Partial<ExecutionConfig>): ExecutionConfig {
  return {
    entryOrderType: raw?.entryOrderType === 'limit' ? 'limit' : raw?.entryOrderType === 'stop' ? 'stop' : 'market',
    entryTiming: raw?.entryTiming === 'signal_close' ? 'signal_close' : 'next_open',
    entryDelayBars: Math.max(0, Math.floor(Number(raw?.entryDelayBars || 0))),
    maxEntryWaitBars: Math.max(0, Math.floor(Number(raw?.maxEntryWaitBars || 0))),
    exitMode: raw?.exitMode === 'close' ? 'close' : 'touch',
    allowSameBarExit: raw?.allowSameBarExit !== false,
    spreadModel: raw?.spreadModel || 'none',
    spreadValue: Number(raw?.spreadValue || 0),
    spreadAtrMult: Number(raw?.spreadAtrMult || 0),
    spreadPct: Number(raw?.spreadPct || 0),
    maxSpreadValue: Number(raw?.maxSpreadValue || 0),
    slippageModel: raw?.slippageModel || 'none',
    slippageValue: Number(raw?.slippageValue || 0),
    slippageAtrMult: Number(raw?.slippageAtrMult || 0),
    slippagePct: Number(raw?.slippagePct || 0),
    slippageOnExit: raw?.slippageOnExit !== false,
    commissionModel: raw?.commissionModel || 'none',
    commissionValue: Number(raw?.commissionValue || 0),
    commissionPct: Number(raw?.commissionPct || 0),
    minStopValue: Number(raw?.minStopValue || 0),
    minStopAtrMult: Number(raw?.minStopAtrMult || 0),
    minStopMode: raw?.minStopMode === 'skip' ? 'skip' : 'adjust',
    sessionFilter: raw?.sessionFilter || 'all',
    sessionTimezone: raw?.sessionTimezone === 'local' ? 'local' : 'utc',
    sessionCostOverrides: {
      asia: normalizeSessionOverride(raw?.sessionCostOverrides?.asia),
      london: normalizeSessionOverride(raw?.sessionCostOverrides?.london),
      ny: normalizeSessionOverride(raw?.sessionCostOverrides?.ny)
    },
    volatilitySlippageEnabled: raw?.volatilitySlippageEnabled === true,
    volatilitySlippageLookback: Math.max(5, Math.floor(Number(raw?.volatilitySlippageLookback || 50))),
    volatilitySlippageLowThresh: Number.isFinite(Number(raw?.volatilitySlippageLowThresh))
      ? Number(raw?.volatilitySlippageLowThresh)
      : 0.8,
    volatilitySlippageHighThresh: Number.isFinite(Number(raw?.volatilitySlippageHighThresh))
      ? Number(raw?.volatilitySlippageHighThresh)
      : 1.2,
    volatilitySlippageLowMult: Number.isFinite(Number(raw?.volatilitySlippageLowMult))
      ? Number(raw?.volatilitySlippageLowMult)
      : 0.8,
    volatilitySlippageMidMult: Number.isFinite(Number(raw?.volatilitySlippageMidMult))
      ? Number(raw?.volatilitySlippageMidMult)
      : 1,
    volatilitySlippageHighMult: Number.isFinite(Number(raw?.volatilitySlippageHighMult))
      ? Number(raw?.volatilitySlippageHighMult)
      : 1.5,
    partialFillMode: raw?.partialFillMode === 'range' ? 'range' : 'none',
    partialFillAtrMult: Number.isFinite(Number(raw?.partialFillAtrMult)) ? Number(raw?.partialFillAtrMult) : 2,
    partialFillMinRatio: Number.isFinite(Number(raw?.partialFillMinRatio)) ? Number(raw?.partialFillMinRatio) : 0.35,
    partialFillOnExit: raw?.partialFillOnExit === true,
    newsSpikeAtrMult: Number.isFinite(Number(raw?.newsSpikeAtrMult)) ? Number(raw?.newsSpikeAtrMult) : 3,
    newsSpikeSlippageMult: Number.isFinite(Number(raw?.newsSpikeSlippageMult)) ? Number(raw?.newsSpikeSlippageMult) : 2,
    newsSpikeSpreadMult: Number.isFinite(Number(raw?.newsSpikeSpreadMult)) ? Number(raw?.newsSpikeSpreadMult) : 1.5
  };
}

export function getSessionLabel(ts: number, timezone: ExecutionConfig['sessionTimezone']): SessionLabel {
  const date = new Date(ts);
  const hour = timezone === 'utc' ? date.getUTCHours() : date.getHours();
  if (hour >= 0 && hour < 7) return 'asia';
  if (hour >= 7 && hour < 13) return 'london';
  return 'ny';
}

export function computeSpread(value: number, atr: number | null, cfg: ExecutionConfig) {
  if (cfg.spreadModel === 'fixed') return Math.max(0, Number(cfg.spreadValue || 0));
  if (cfg.spreadModel === 'atr') {
    return atr != null && Number.isFinite(atr) ? Math.max(0, atr * Number(cfg.spreadAtrMult || 0)) : 0;
  }
  if (cfg.spreadModel === 'percent') {
    return Math.max(0, value * (Number(cfg.spreadPct || 0) / 100));
  }
  return 0;
}

export function computeSlippage(value: number, atr: number | null, cfg: ExecutionConfig) {
  if (cfg.slippageModel === 'fixed') return Math.max(0, Number(cfg.slippageValue || 0));
  if (cfg.slippageModel === 'atr') {
    return atr != null && Number.isFinite(atr) ? Math.max(0, atr * Number(cfg.slippageAtrMult || 0)) : 0;
  }
  if (cfg.slippageModel === 'percent') {
    return Math.max(0, value * (Number(cfg.slippagePct || 0) / 100));
  }
  return 0;
}

export function computeCommission(value: number, cfg: ExecutionConfig) {
  if (cfg.commissionModel === 'fixed') return Math.max(0, Number(cfg.commissionValue || 0));
  if (cfg.commissionModel === 'percent') {
    return Math.max(0, value * (Number(cfg.commissionPct || 0) / 100));
  }
  return 0;
}
