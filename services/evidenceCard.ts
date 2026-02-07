import type { EvidenceCard, SetupLibraryEntry, SetupStrategy, TradeProposal } from '../types';

type EvidenceSignalInput = {
  strategy?: string | null;
  signalType?: string | null;
  side?: 'BUY' | 'SELL' | null;
  details?: Record<string, any> | null;
  reasonCodes?: string[];
  strength?: number | null;
  regime?: string | null;
  createdAtMs?: number | null;
};

const toNumber = (value: any): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatStrategyLabel = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/_/g, ' ').toUpperCase();
};

const formatValue = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (Math.abs(num - Math.round(num)) < 1e-6) return String(Math.round(num));
  return String(Number(num.toFixed(3))).replace(/\.?0+$/, '');
};

const strategyBias = (strategy: SetupStrategy | string | null | undefined) => {
  const key = String(strategy || '').toUpperCase();
  if (key === 'MEAN_REVERSION') return 'Range bias';
  if (key === 'BREAK_RETEST') return 'Breakout bias';
  if (key === 'RANGE_BREAKOUT') return 'Breakout bias';
  if (key === 'TREND_PULLBACK') return 'Trend bias';
  if (key === 'FVG_RETRACE') return 'Trend bias';
  return '';
};

const buildParamSummary = (strategy: SetupStrategy | string | null | undefined, params: Record<string, any>) => {
  const key = String(strategy || '').toUpperCase();
  const parts: string[] = [];
  const pick = (label: string, value: any) => {
    const formatted = formatValue(value);
    if (!formatted) return;
    parts.push(`${label} ${formatted}`);
  };

  if (key === 'MEAN_REVERSION') {
    pick('sma', params.smaPeriod);
    pick('band', params.bandAtrMult);
    pick('stop', params.stopAtrMult);
    pick('rr', params.rr);
    pick('cd', params.cooldownBars);
    if (params.useRsiFilter) {
      const low = formatValue(params.rsiOversold);
      const high = formatValue(params.rsiOverbought);
      if (low && high) parts.push(`rsi ${low}/${high}`);
    }
  } else if (key === 'RANGE_BREAKOUT') {
    pick('lb', params.lookbackBars);
    pick('atr', params.atrMult);
    pick('rr', params.rr);
    pick('cd', params.cooldownBars);
    if (params.breakoutMode) parts.push(String(params.breakoutMode));
    pick('buf', params.bufferAtrMult);
  } else if (key === 'BREAK_RETEST') {
    pick('lb', params.lookbackBars);
    pick('atr', params.atrMult);
    pick('rr', params.rr);
    pick('cd', params.cooldownBars);
    if (params.breakoutMode) parts.push(String(params.breakoutMode));
    pick('retest', params.retestBars);
    pick('retbuf', params.retestBufferAtrMult);
    if (params.retestConfirm) parts.push(`retest ${params.retestConfirm}`);
  } else if (key === 'TREND_PULLBACK') {
    pick('ema', params.fastEma);
    pick('slow', params.slowEma);
    if (params.pullbackEma) parts.push(`pb ${params.pullbackEma}`);
    if (params.confirmMode) parts.push(`confirm ${params.confirmMode}`);
    pick('atr', params.atrMult);
    pick('rr', params.rr);
    pick('cd', params.cooldownBars);
  } else if (key === 'FVG_RETRACE') {
    pick('atr', params.atrMult);
    pick('rr', params.rr);
    pick('wait', params.maxWaitBars);
    if (params.entryMode) parts.push(`entry ${params.entryMode}`);
    pick('gap', params.minGapAtrMult);
  }

  return parts.slice(0, 6).join(' ');
};

export const buildEvidenceCardFromSignal = (input: EvidenceSignalInput): EvidenceCard | null => {
  if (!input) return null;
  const details = input.details && typeof input.details === 'object' ? input.details : {};
  const entry = toNumber(details.entryPrice);
  const stopLoss = toNumber(details.stopLoss);
  const takeProfit = toNumber(details.takeProfit);
  const side = input.side || null;
  const strategyLabel = formatStrategyLabel(input.strategy);
  const signalType = String(input.signalType || '').trim().replace(/_/g, ' ');
  const rr =
    entry != null && stopLoss != null && takeProfit != null
      ? (() => {
          const risk = side === 'SELL' ? stopLoss - entry : entry - stopLoss;
          const reward = side === 'SELL' ? entry - takeProfit : takeProfit - entry;
          if (risk > 0 && reward > 0) return reward / risk;
          return null;
        })()
      : null;

  const riskDist =
    entry != null && stopLoss != null
      ? Math.abs(entry - stopLoss)
      : null;
  const rewardDist =
    entry != null && takeProfit != null
      ? Math.abs(takeProfit - entry)
      : null;

  const biasParts = [
    input.regime ? `Regime ${input.regime}` : '',
    side ? `${side} bias` : ''
  ].filter(Boolean);

  const invalidation =
    details.reason
      ? `Invalidated: ${String(details.reason)}`
      : stopLoss != null
        ? `Stop loss ${stopLoss}`
        : null;

  const reasons = Array.isArray(input.reasonCodes)
    ? input.reasonCodes.map((code) => String(code)).filter(Boolean)
    : [];

  return {
    bias: biasParts.length > 0 ? biasParts.join(' | ') : null,
    setup: [strategyLabel, signalType].filter(Boolean).join(' ').trim() || null,
    levels: {
      entry,
      stopLoss,
      takeProfit,
      rr: rr != null ? Math.round(rr * 100) / 100 : null
    },
    risk: {
      riskReward: rr != null ? Math.round(rr * 100) / 100 : null,
      stopDistance: riskDist,
      rewardDistance: rewardDist,
      note: null
    },
    invalidation,
    confidence: {
      score: Number.isFinite(Number(input.strength)) ? Math.max(0, Math.min(1, Number(input.strength))) : null,
      reasons: reasons.length > 0 ? reasons : null
    },
    createdAtMs: input.createdAtMs ?? Date.now(),
    source: 'setup_watcher'
  };
};

export const buildEvidenceCardFromProposal = (proposal: TradeProposal): EvidenceCard | null => {
  if (!proposal) return null;
  const entry = toNumber(proposal.entryPrice);
  const stopLoss = toNumber(proposal.stopLoss);
  const takeProfit = toNumber(proposal.takeProfit);
  const rr =
    Number.isFinite(Number(proposal.riskRewardRatio))
      ? Number(proposal.riskRewardRatio)
      : (() => {
          if (entry == null || stopLoss == null || takeProfit == null) return null;
          const risk = proposal.action === 'SELL' ? stopLoss - entry : entry - stopLoss;
          const reward = proposal.action === 'SELL' ? entry - takeProfit : takeProfit - entry;
          if (risk > 0 && reward > 0) return reward / risk;
          return null;
        })();

  const riskDist = entry != null && stopLoss != null ? Math.abs(entry - stopLoss) : null;
  const rewardDist = entry != null && takeProfit != null ? Math.abs(takeProfit - entry) : null;

  const setupLabel = proposal.setup?.strategy ? formatStrategyLabel(proposal.setup.strategy) : '';
  const bias = proposal.reason ? String(proposal.reason) : `${proposal.action} bias`;

  return {
    bias,
    setup: setupLabel || 'Trade proposal',
    levels: {
      entry,
      stopLoss,
      takeProfit,
      rr: rr != null ? Math.round(rr * 100) / 100 : null
    },
    risk: {
      riskReward: rr != null ? Math.round(rr * 100) / 100 : null,
      stopDistance: riskDist,
      rewardDistance: rewardDist,
      note: null
    },
    invalidation: stopLoss != null ? `Stop loss ${stopLoss}` : null,
    confidence: {
      score: null,
      reasons: null
    },
    createdAtMs: Date.now(),
    source: 'trade_proposal'
  };
};

export const buildEvidenceCardFromLibraryEntry = (entry: SetupLibraryEntry | null | undefined): EvidenceCard | null => {
  if (!entry) return null;
  const params = entry.params && typeof entry.params === 'object' ? entry.params : {};
  const setupLabel = formatStrategyLabel(entry.strategy);
  const summary = buildParamSummary(entry.strategy, params);
  const session = entry.timeFilter
    ? `Session ${formatValue(entry.timeFilter.startHour)}-${formatValue(entry.timeFilter.endHour)} ${entry.timeFilter.timezone || 'utc'}`
    : '';
  const bias = session || strategyBias(entry.strategy) || null;
  const invalidation = params.stopAtrMult != null ? `Stop ATR x${formatValue(params.stopAtrMult)}` : null;
  const winRateRaw = entry.stats?.winRate;
  const winRate = Number.isFinite(Number(winRateRaw))
    ? Number(winRateRaw) > 1
      ? Number(winRateRaw) / 100
      : Number(winRateRaw)
    : null;
  const confidenceScore = winRate != null ? Math.max(0, Math.min(1, winRate)) : null;
  const reasons: string[] = [];
  if (Number.isFinite(Number(entry.stats?.total))) reasons.push(`Trades ${entry.stats?.total}`);
  if (Number.isFinite(Number(entry.stats?.profitFactor))) reasons.push(`PF ${formatValue(entry.stats?.profitFactor)}`);
  if (Number.isFinite(Number(entry.performance?.netR))) reasons.push(`Net ${formatValue(entry.performance?.netR)}R`);

  return {
    bias,
    setup: [setupLabel, summary].filter(Boolean).join(' | ') || setupLabel || null,
    levels: null,
    risk: {
      riskReward: params.rr != null ? Number(formatValue(params.rr)) : null,
      stopDistance: null,
      rewardDistance: null,
      note: null
    },
    invalidation,
    confidence: {
      score: confidenceScore,
      reasons: reasons.length > 0 ? reasons : null
    },
    createdAtMs: entry.updatedAtMs || entry.createdAtMs || Date.now(),
    source: 'setup_library'
  };
};
