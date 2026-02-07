import { AutoPilotConfig, AutoPilotMode, AutoPilotPolicy, SetupStrategy } from '../types';
import { normalizeTimeframeKey } from './symbols';

const MODE_KEYS: AutoPilotMode[] = ['custom', 'scalper', 'day', 'trend', 'swing'];
const STRATEGY_KEYS: SetupStrategy[] = ['RANGE_BREAKOUT', 'BREAK_RETEST', 'FVG_RETRACE', 'TREND_PULLBACK', 'MEAN_REVERSION'];


export const DEFAULT_MODE_POLICIES: Record<AutoPilotMode, AutoPilotPolicy> = {
  custom: {},
  scalper: {
    riskPerTrade: 0.15,
    allowedTimeframes: ['1m', '5m'],
    allowedStrategies: ['RANGE_BREAKOUT', 'BREAK_RETEST', 'FVG_RETRACE', 'MEAN_REVERSION']
  },
  day: {
    riskPerTrade: 0.25,
    allowedTimeframes: ['5m', '15m', '30m', '1H'],
    allowedStrategies: ['RANGE_BREAKOUT', 'BREAK_RETEST', 'FVG_RETRACE', 'TREND_PULLBACK', 'MEAN_REVERSION']
  },
  trend: {
    riskPerTrade: 0.35,
    allowedTimeframes: ['1H', '4H'],
    allowedStrategies: ['TREND_PULLBACK']
  },
  swing: {
    riskPerTrade: 0.5,
    allowedTimeframes: ['4H', '1D'],
    allowedStrategies: ['TREND_PULLBACK']
  }
};

export const normalizeAutoPilotMode = (value: any, fallback: AutoPilotMode = 'custom'): AutoPilotMode => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw.includes('scalp')) return 'scalper';
  if (raw.includes('day')) return 'day';
  if (raw.includes('trend')) return 'trend';
  if (raw.includes('swing')) return 'swing';
  if (raw.includes('custom') || raw.includes('manual') || raw.includes('off')) return 'custom';
  const normalized = raw.replace(/[^a-z]/g, '');
  if (normalized === 'scalper' || normalized === 'scalp') return 'scalper';
  if (normalized === 'day') return 'day';
  if (normalized === 'trend') return 'trend';
  if (normalized === 'swing') return 'swing';
  if (normalized === 'custom' || normalized === 'manual') return 'custom';
  return fallback;
};

const normalizeStrategyList = (value: any) => {
  const arr = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
  const cleaned = arr
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean)
    .map((item) => {
      if (item === 'RANGEBREAKOUT') return 'RANGE_BREAKOUT';
      if (item === 'BREAKRETEST' || item === 'BREAKANDRETEST' || item === 'BREAK_AND_RETEST') return 'BREAK_RETEST';
      if (item === 'FVGRETRACE') return 'FVG_RETRACE';
      if (item === 'TRENDPULLBACK') return 'TREND_PULLBACK';
      if (item === 'MEANREVERSION') return 'MEAN_REVERSION';
      return item;
    })
    .filter((item) => STRATEGY_KEYS.includes(item as SetupStrategy)) as SetupStrategy[];
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [];
};

const normalizeTimeframeList = (value: any) => {
  const arr = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
  const cleaned = arr
    .map((item) => normalizeTimeframeKey(String(item || '')))
    .filter(Boolean);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [];
};

const normalizePolicy = (raw: any, fallback: AutoPilotPolicy): AutoPilotPolicy => {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const policy: AutoPilotPolicy = { ...fallback };
  const num = (value: any) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  if (raw.riskPerTrade != null) {
    const value = num(raw.riskPerTrade);
    if (value != null) policy.riskPerTrade = value;
  }
  if (raw.maxOpenPositions != null) {
    const value = num(raw.maxOpenPositions);
    if (value != null) policy.maxOpenPositions = value;
  }
  if (raw.spreadLimitModel != null) {
    const model = String(raw.spreadLimitModel || '').toLowerCase();
    if (model === 'none' || model === 'percent' || model === 'atr') policy.spreadLimitModel = model;
  }
  if (raw.spreadLimitPct != null) {
    const value = num(raw.spreadLimitPct);
    if (value != null) policy.spreadLimitPct = value;
  }
  if (raw.spreadLimitAtrMult != null) {
    const value = num(raw.spreadLimitAtrMult);
    if (value != null) policy.spreadLimitAtrMult = value;
  }
  if (raw.stopModel != null) {
    const model = String(raw.stopModel || '').toLowerCase();
    if (model === 'percent' || model === 'atr') policy.stopModel = model;
  }
  if (raw.stopPercent != null) {
    const value = num(raw.stopPercent);
    if (value != null) policy.stopPercent = value;
  }
  if (raw.stopAtrMult != null) {
    const value = num(raw.stopAtrMult);
    if (value != null) policy.stopAtrMult = value;
  }
  if (raw.defaultRR != null) {
    const value = num(raw.defaultRR);
    if (value != null) policy.defaultRR = value;
  }
  if (raw.allowedStrategies != null) {
    policy.allowedStrategies = normalizeStrategyList(raw.allowedStrategies);
  }
  if (raw.allowedTimeframes != null) {
    policy.allowedTimeframes = normalizeTimeframeList(raw.allowedTimeframes);
  }
  return policy;
};

export const normalizeModePolicies = (
  raw: any,
  defaults: Record<AutoPilotMode, AutoPilotPolicy> = DEFAULT_MODE_POLICIES
) => {
  const next: Record<AutoPilotMode, AutoPilotPolicy> = {
    custom: { ...defaults.custom },
    scalper: { ...defaults.scalper },
    day: { ...defaults.day },
    trend: { ...defaults.trend },
    swing: { ...defaults.swing }
  };

  if (!raw || typeof raw !== 'object') return next;
  for (const key of MODE_KEYS) {
    if (raw[key]) {
      next[key] = normalizePolicy(raw[key], defaults[key] || {});
    }
  }
  return next;
};

export const resolveAutoPilotPolicy = (config?: AutoPilotConfig | null) => {
  const cfg = config && typeof config === 'object' ? config : ({} as AutoPilotConfig);
  const mode = normalizeAutoPilotMode(cfg.mode, 'custom');
  const policies = normalizeModePolicies(cfg.modePolicies, DEFAULT_MODE_POLICIES);
  const policy = policies[mode] || {};
  const effective: AutoPilotConfig = {
    ...cfg,
    mode,
    riskPerTrade: policy.riskPerTrade ?? cfg.riskPerTrade,
    maxOpenPositions: policy.maxOpenPositions ?? cfg.maxOpenPositions,
    spreadLimitModel: policy.spreadLimitModel ?? cfg.spreadLimitModel,
    spreadLimitPct: policy.spreadLimitPct ?? cfg.spreadLimitPct,
    spreadLimitAtrMult: policy.spreadLimitAtrMult ?? cfg.spreadLimitAtrMult,
    stopModel: policy.stopModel ?? cfg.stopModel,
    stopPercent: policy.stopPercent ?? cfg.stopPercent,
    stopAtrMult: policy.stopAtrMult ?? cfg.stopAtrMult,
    defaultRR: policy.defaultRR ?? cfg.defaultRR
  };
  return { mode, policy, effective, policies };
};
