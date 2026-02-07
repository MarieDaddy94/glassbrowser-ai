import {
  buildStrategyConfig,
  computeAtrSeries,
  computeEmaSeries,
  generateBreakRetestTrades,
  generateFvgRetraceTrades,
  generateMeanReversionTrades,
  generateRangeBreakoutTrades,
  generateTrendPullbackTrades,
  type BacktestSide,
  type Candle,
  type BreakRetestConfig,
  type FvgRetraceConfig,
  type MeanReversionConfig,
  type RangeBreakoutConfig,
  type TrendPullbackConfig
} from './backtestEngine';
import { RegimeLabel, RegimeSnapshot, SetupSignal, SetupWatcher } from '../types';
import { buildSetupSignalBucketId, toSignalEpochMs } from './setupSignalLifecycle';
import { buildEvidenceCardFromSignal } from './evidenceCard';
import { normalizeSymbolKey, normalizeTimeframe } from './symbols';

type SetupWatcherState = {
  lastBarTs?: number;
  pending?: {
    signalIndex: number;
    entryIndex: number;
    side: BacktestSide;
    signalBarTime: number;
  };
};

const DEFAULT_REGIME_CONFIG = {
  emaFast: 20,
  emaSlow: 50,
  atrPeriod: 14,
  trendThreshold: 0.8,
  volHighPct: 0.8
};

const computeRegimeSnapshot = (bars: Candle[]): RegimeSnapshot | null => {
  if (!bars || bars.length < DEFAULT_REGIME_CONFIG.emaSlow + 2) return null;
  const atrSeries = computeAtrSeries(bars, DEFAULT_REGIME_CONFIG.atrPeriod);
  const emaFastSeries = computeEmaSeries(bars, DEFAULT_REGIME_CONFIG.emaFast);
  const emaSlowSeries = computeEmaSeries(bars, DEFAULT_REGIME_CONFIG.emaSlow);
  const idx = bars.length - 1;
  const atr = atrSeries[idx] ?? atrSeries[idx - 1] ?? null;
  const emaFast = emaFastSeries[idx] ?? emaFastSeries[idx - 1] ?? null;
  const emaSlow = emaSlowSeries[idx] ?? emaSlowSeries[idx - 1] ?? null;
  const close = bars[idx]?.c ?? bars[idx - 1]?.c ?? null;
  if (!Number.isFinite(Number(atr)) || !Number.isFinite(Number(emaFast)) || !Number.isFinite(Number(emaSlow)) || !Number.isFinite(Number(close))) {
    return null;
  }
  const trendStrength = atr ? Math.abs(Number(emaFast) - Number(emaSlow)) / Number(atr) : null;
  const volatilityPct = close ? (Number(atr) / Number(close)) * 100 : null;
  const trendLabel = trendStrength != null && trendStrength >= DEFAULT_REGIME_CONFIG.trendThreshold ? 'trend' : 'range';
  const volHigh = volatilityPct != null && volatilityPct >= DEFAULT_REGIME_CONFIG.volHighPct;
  const label: RegimeLabel = trendLabel === 'trend' ? 'trend' : (volHigh ? 'breakout' : 'range');
  return {
    label,
    trendStrength,
    volatilityPct,
    emaFast: Number(emaFast),
    emaSlow: Number(emaSlow),
    atr: Number(atr),
    close: Number(close)
  };
};

const buildSignal = (
  watcher: SetupWatcher,
  signalType: SetupSignal['payload']['signalType'],
  side: BacktestSide | undefined,
  barTime: number,
  details?: Record<string, any>
): SetupSignal => {
  const ts = toSignalEpochMs(barTime, Date.now());
  const strength =
    signalType === 'entry_confirmed' ? 0.8 : signalType === 'setup_ready' ? 0.6 : 0.2;
  const reasonCodes = [signalType];
  if (details?.reason) reasonCodes.push(String(details.reason));
  const status =
    signalType === 'entry_confirmed'
      ? 'entry_confirmed'
      : signalType === 'setup_ready'
        ? 'setup_ready'
        : 'invalidated';
  const invalidReasonCodes =
    signalType === 'invalidated' && details?.reason ? [String(details.reason)] : undefined;
  const confirmation =
    signalType === 'entry_confirmed'
      ? { type: signalType, ts, details: details || null }
      : undefined;
  const profileKey = watcher.profileId || watcher.id || [watcher.symbol, watcher.timeframe, watcher.strategy].filter(Boolean).join(':') || 'na';
  const detailPayload = details && typeof details === 'object' ? { ...details } : {};
  detailPayload.signalBucketId = buildSetupSignalBucketId(profileKey, watcher.timeframe, ts);
  if (watcher.profileId) detailPayload.profileId = watcher.profileId;
  if (watcher.profileParamsHash) detailPayload.profileParamsHash = watcher.profileParamsHash;

  const evidence = buildEvidenceCardFromSignal({
    strategy: watcher.strategy,
    signalType,
    side: side || null,
    details,
    reasonCodes,
    strength,
    regime: details?.regime ? String(details.regime) : null,
    createdAtMs: ts
  });

  return {
    id: `sig_${watcher.id}_${signalType}_${ts}_${Math.random().toString(16).slice(2, 6)}`,
    type: 'setup_signal',
    profileId: watcher.profileId || null,
    symbol: watcher.symbol,
    timeframe: watcher.timeframe,
    ts,
    strength,
    reasonCodes,
    payload: {
      signalType,
      status,
      strategy: watcher.strategy,
      side,
      barTime: ts,
      watcherId: watcher.id,
      details: Object.keys(detailPayload).length > 0 ? detailPayload : null,
      evidence: evidence || null,
      invalidReasonCodes,
      confirmation
    }
  };
};

const buildLibraryDetails = (watcher: SetupWatcher) => {
  const hasTier = watcher.libraryTier || watcher.libraryScore != null || watcher.libraryWinRateTier;
  const hasKey = watcher.libraryKey || watcher.libraryScore != null;
  if (!hasTier && !hasKey) return null;
  return {
    key: watcher.libraryKey || null,
    tier: watcher.libraryTier || null,
    score: watcher.libraryScore ?? null,
    winRateTier: watcher.libraryWinRateTier || null,
    stats: watcher.libraryStats || null
  };
};

const evaluateWatcher = (watcher: SetupWatcher, bars: Candle[], state: SetupWatcherState, regime: RegimeSnapshot | null) => {
  const nextState: SetupWatcherState = { ...state };
  const signals: SetupSignal[] = [];

  if (!watcher.enabled) return { state: nextState, signals };
  if (!bars || bars.length < 3) return { state: nextState, signals };

  const lastIndex = bars.length - 1;
  const lastBar = bars[lastIndex];
  if (nextState.lastBarTs != null && lastBar.t <= nextState.lastBarTs) {
    return { state: nextState, signals };
  }

  const gate = String(watcher.regime || 'any').trim().toLowerCase();
  const regimeLabel = regime?.label;
  if (gate && gate !== 'any' && regimeLabel && gate !== regimeLabel) {
    if (nextState.pending) {
      signals.push(buildSignal(watcher, 'invalidated', nextState.pending.side, lastBar.t, {
        signalIndex: nextState.pending.signalIndex,
        entryIndex: nextState.pending.entryIndex,
        signalBarTime: nextState.pending.signalBarTime,
        reason: 'regime_gate',
        regime: regimeLabel,
        regimeMeta: regime ? { trendStrength: regime.trendStrength, volatilityPct: regime.volatilityPct } : null,
        library: buildLibraryDetails(watcher)
      }));
    }
    nextState.pending = undefined;
    nextState.lastBarTs = lastBar.t;
    return { state: nextState, signals };
  }

  const config = buildStrategyConfig(watcher.strategy, watcher.params || {});
  let trades = [];
  if (watcher.strategy === 'BREAK_RETEST') trades = generateBreakRetestTrades(bars, config as BreakRetestConfig);
  else if (watcher.strategy === 'FVG_RETRACE') trades = generateFvgRetraceTrades(bars, config as FvgRetraceConfig);
  else if (watcher.strategy === 'TREND_PULLBACK') trades = generateTrendPullbackTrades(bars, config as TrendPullbackConfig);
  else if (watcher.strategy === 'MEAN_REVERSION') trades = generateMeanReversionTrades(bars, config as MeanReversionConfig);
  else trades = generateRangeBreakoutTrades(bars, config as RangeBreakoutConfig);

  const signalIndex = lastIndex - 1;
  let tradeForEntry = null;
  let tradeForSignal = null;
  for (let i = trades.length - 1; i >= 0; i -= 1) {
    const trade = trades[i];
    if (!tradeForEntry && trade.entryIndex === lastIndex) tradeForEntry = trade;
    if (!tradeForSignal && trade.signalIndex === signalIndex) tradeForSignal = trade;
    if (tradeForEntry && tradeForSignal) break;
  }

  if (nextState.pending && nextState.pending.entryIndex < lastIndex && !tradeForEntry) {
    signals.push(buildSignal(watcher, 'invalidated', nextState.pending.side, lastBar.t, {
      signalIndex: nextState.pending.signalIndex,
      entryIndex: nextState.pending.entryIndex,
      signalBarTime: nextState.pending.signalBarTime,
      library: buildLibraryDetails(watcher)
    }));
    nextState.pending = undefined;
  }

  if (tradeForSignal) {
    const signalBarTime = bars[signalIndex]?.t ?? lastBar.t;
    const detail = {
      signalIndex: tradeForSignal.signalIndex,
      entryIndex: tradeForSignal.entryIndex,
      entryPrice: tradeForSignal.entryPrice,
      stopLoss: tradeForSignal.stopLoss,
      takeProfit: tradeForSignal.takeProfit,
      signalBarTime,
      entryBarTime: bars[tradeForSignal.entryIndex]?.t ?? null,
      regime: regimeLabel || null,
      regimeMeta: regime ? { trendStrength: regime.trendStrength, volatilityPct: regime.volatilityPct } : null,
      library: buildLibraryDetails(watcher)
    };
    signals.push(buildSignal(watcher, 'setup_ready', tradeForSignal.side, bars[signalIndex]?.t ?? lastBar.t, detail));
    nextState.pending = {
      signalIndex: tradeForSignal.signalIndex,
      entryIndex: tradeForSignal.entryIndex,
      side: tradeForSignal.side,
      signalBarTime
    };
  }

  if (tradeForEntry) {
    const signalBarTime = bars[tradeForEntry.signalIndex]?.t ?? lastBar.t;
    const detail = {
      signalIndex: tradeForEntry.signalIndex,
      entryIndex: tradeForEntry.entryIndex,
      entryPrice: tradeForEntry.entryPrice,
      stopLoss: tradeForEntry.stopLoss,
      takeProfit: tradeForEntry.takeProfit,
      signalBarTime,
      entryBarTime: bars[tradeForEntry.entryIndex]?.t ?? lastBar.t,
      regime: regimeLabel || null,
      regimeMeta: regime ? { trendStrength: regime.trendStrength, volatilityPct: regime.volatilityPct } : null,
      library: buildLibraryDetails(watcher)
    };
    signals.push(buildSignal(watcher, 'entry_confirmed', tradeForEntry.side, lastBar.t, detail));
    nextState.pending = undefined;
  }

  nextState.lastBarTs = lastBar.t;
  return { state: nextState, signals };
};

export const evaluateSetupWatchers = (
  watchers: SetupWatcher[],
  bars: Candle[],
  symbol: string,
  timeframe: string,
  stateMap: Map<string, SetupWatcherState>
) => {
  const signals: SetupSignal[] = [];
  if (!Array.isArray(watchers) || watchers.length === 0) return signals;
  if (!bars || bars.length === 0) return signals;

  const symbolKey = normalizeSymbolKey(symbol);
  const timeframeKey = normalizeTimeframe(timeframe);
  const regime = computeRegimeSnapshot(bars);

  for (const watcher of watchers) {
    if (!watcher || !watcher.enabled) continue;
    const watcherSymbolKey = normalizeSymbolKey(watcher.symbol);
    const watcherTfKey = normalizeTimeframe(watcher.timeframe);
    if (!watcherSymbolKey || watcherSymbolKey !== symbolKey) continue;
    if (watcherTfKey && timeframeKey && watcherTfKey !== timeframeKey) continue;

    const prevState = stateMap.get(watcher.id) || {};
    const result = evaluateWatcher(watcher, bars, prevState, regime);
    stateMap.set(watcher.id, result.state);
    if (result.signals.length > 0) {
      signals.push(...result.signals);
    }
  }

  return signals;
};

export const getRegimeSnapshot = computeRegimeSnapshot;
