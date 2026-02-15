import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Zap } from 'lucide-react';
import { requireBridge } from '../services/bridgeGuard';
import type { UnifiedSnapshotStatus } from '../types';
import { classifyUnifiedSnapshotStatus, formatUnifiedSnapshotStatusLabel } from '../services/unifiedSnapshotStatus';

type SymbolSuggestion = {
  symbol: string;
  label?: string | null;
};

export type SnapshotPanelStatus = UnifiedSnapshotStatus;

type SnapshotInterfaceProps = {
  symbol: string;
  candidateSymbols: string[];
  onSelectSymbol: (symbol: string) => void;
  onSearchSymbols: (query: string) => Promise<SymbolSuggestion[]>;
  timeframes: string[];
  status?: SnapshotPanelStatus | null;
  onWarmup: () => void;
  onRefresh: () => void;
  applyToSignals?: boolean;
  onApplyToSignalsChange?: (next: boolean) => void;
  brokerConnected?: boolean;
  upstreamBlockedUntilMs?: number | null;
};

const formatAge = (ts: number | null | undefined) => {
  if (!ts) return '--';
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
};

const formatTimeframe = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.endsWith('h') || lower.endsWith('d') || lower.endsWith('w')) return lower.toUpperCase();
  return lower;
};

const getFreshnessTargetMs = (timeframe: string) => {
  const key = String(timeframe || '').trim().toLowerCase();
  if (key === '1m') return 90_000;
  if (key === '5m') return 4 * 60_000;
  if (key === '15m') return 12 * 60_000;
  if (key === '30m') return 25 * 60_000;
  if (key === '1h') return 70 * 60_000;
  if (key === '4h') return 4 * 60 * 60_000;
  if (key === '1d') return 36 * 60 * 60_000;
  if (key === '1w') return 10 * 24 * 60 * 60_000;
  return 10 * 60_000;
};

const SnapshotInterface: React.FC<SnapshotInterfaceProps> = ({
  symbol,
  candidateSymbols,
  onSelectSymbol,
  onSearchSymbols,
  timeframes,
  status,
  onWarmup,
  onRefresh,
  applyToSignals = false,
  onApplyToSignalsChange,
  brokerConnected,
  upstreamBlockedUntilMs
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    const nextQuery = String(query || '').trim();
    if (!nextQuery) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let active = true;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await onSearchSymbols(nextQuery);
        if (active) {
          setSuggestions(Array.isArray(res) ? res : []);
          setShowSuggestions(true);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [onSearchSymbols, query]);

  const handleSubmit = useCallback((value?: string) => {
    const raw = String(value ?? query ?? '').trim();
    if (!raw) return;
    onSelectSymbol(raw);
    setQuery('');
    setShowSuggestions(false);
  }, [onSelectSymbol, query]);

  const handleWarmup = useCallback(() => {
    const gate = requireBridge('snapshot');
    if (!gate.ok) {
      setBridgeError(gate.error);
      return;
    }
    setBridgeError(null);
    onWarmup();
  }, [onWarmup]);

  const handleRefresh = useCallback(() => {
    const gate = requireBridge('snapshot');
    if (!gate.ok) {
      setBridgeError(gate.error);
      return;
    }
    setBridgeError(null);
    onRefresh();
  }, [onRefresh]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const selectedKey = useMemo(() => String(symbol || '').trim().toUpperCase(), [symbol]);
  const framesLine = useMemo(() => {
    const frames = status?.frames || [];
    if (frames.length === 0) return '';
    return frames.map((frame) => `${formatTimeframe(frame.tf)} ${frame.barsCount}`).join(' | ');
  }, [status]);

  const incompleteLine = useMemo(() => {
    const missing = Array.isArray(status?.missingFrames) ? status?.missingFrames ?? [] : [];
    const short = Array.isArray(status?.shortFrames) ? status?.shortFrames ?? [] : [];
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`Missing: ${missing.map(formatTimeframe).filter(Boolean).join(', ')}`);
    }
    if (short.length > 0) {
      parts.push(`Short: ${short.map((entry) => `${formatTimeframe(entry.tf)} ${entry.barsCount}/${entry.minBars}`).join(', ')}`);
    }
    return parts.join(' | ');
  }, [status]);

  const freshnessBadges = useMemo(() => {
    const frames = Array.isArray(status?.frames) ? status?.frames : [];
    const missing = new Set((status?.missingFrames || []).map((tf) => String(tf || '').trim().toLowerCase()));
    const shortByTf = new Map<string, { barsCount: number; minBars: number }>();
    for (const entry of status?.shortFrames || []) {
      const tf = String(entry?.tf || '').trim().toLowerCase();
      if (!tf) continue;
      shortByTf.set(tf, {
        barsCount: Number(entry?.barsCount || 0),
        minBars: Number(entry?.minBars || 0)
      });
    }
    const frameByTf = new Map<string, { barsCount: number; lastUpdatedAtMs: number | null }>();
    for (const frame of frames) {
      const tf = String(frame?.tf || '').trim().toLowerCase();
      if (!tf) continue;
      frameByTf.set(tf, {
        barsCount: Number(frame?.barsCount || 0),
        lastUpdatedAtMs: frame?.lastUpdatedAtMs ?? null
      });
    }
    return (timeframes || []).map((value) => {
      const tf = String(value || '').trim().toLowerCase();
      const label = formatTimeframe(value);
      const short = shortByTf.get(tf);
      const frame = frameByTf.get(tf);
      if (missing.has(tf) || !frame) {
        return { tf, label, state: 'missing', detail: 'missing' };
      }
      if (short) {
        return {
          tf,
          label,
          state: 'short',
          detail: `${Math.max(0, short.barsCount)}/${Math.max(0, short.minBars)} bars`
        };
      }
      const updatedAtMs = Number(frame.lastUpdatedAtMs || 0);
      if (!updatedAtMs) {
        return { tf, label, state: 'unknown', detail: 'age --' };
      }
      const ageMs = Math.max(0, Date.now() - updatedAtMs);
      const targetMs = getFreshnessTargetMs(tf);
      if (ageMs <= targetMs) {
        return { tf, label, state: 'fresh', detail: `${formatAge(updatedAtMs)}` };
      }
      if (ageMs <= targetMs * 2) {
        return { tf, label, state: 'aging', detail: `${formatAge(updatedAtMs)}` };
      }
      return { tf, label, state: 'stale', detail: `${formatAge(updatedAtMs)}` };
    });
  }, [status, timeframes]);

  const statusLabel = useMemo(() => {
    return formatUnifiedSnapshotStatusLabel(status, {
      readyLabel: 'NATIVE SNAPSHOT READY',
      missingLabel: 'No snapshot yet.',
      warmingLabel: 'Warming up...',
      failureLabel: status?.reasonCode ? `Snapshot issue (${status.reasonCode})` : 'Snapshot issue'
    });
  }, [status]);

  const normalizedStatus = useMemo(() => classifyUnifiedSnapshotStatus(status), [status]);

  const latestFrameUpdatedAt = useMemo(() => {
    const frames = status?.frames || [];
    if (frames.length === 0) return null;
    return frames.reduce((acc, frame) => {
      const ts = frame.lastUpdatedAtMs ?? null;
      if (!ts) return acc;
      return acc == null || ts > acc ? ts : acc;
    }, null as number | null);
  }, [status]);

  const upstreamBlocked = Number.isFinite(Number(upstreamBlockedUntilMs)) && (upstreamBlockedUntilMs ?? 0) > Date.now();
  const upstreamEta = upstreamBlocked ? Math.max(1, Math.ceil(((upstreamBlockedUntilMs ?? 0) - Date.now()) / 1000)) : null;
  const brokerLabel = brokerConnected === false
    ? 'TradeLocker disconnected'
    : upstreamBlocked
      ? `TradeLocker upstream backoff (${upstreamEta}s)`
      : brokerConnected
        ? 'TradeLocker connected'
        : 'TradeLocker status unknown';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400">Snapshot Panel</div>
            <div className="text-xs text-gray-500">Pick the snapshot symbol and warm up frames for the whole app.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleWarmup}
              disabled={!symbol}
              className={`px-3 py-2 rounded border text-xs flex items-center gap-2 ${symbol ? 'border-amber-400/60 text-amber-100 hover:bg-amber-500/10' : 'border-white/10 text-gray-500 cursor-not-allowed'}`}
            >
              <Zap size={14} />
              Warm Up
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!symbol}
              className={`px-3 py-2 rounded border text-xs flex items-center gap-2 ${symbol ? 'border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/10' : 'border-white/10 text-gray-500 cursor-not-allowed'}`}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-400">Snapshot Symbol</label>
          <div className="mt-2 relative">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={symbol ? `Current: ${symbol}` : 'Search broker symbols...'}
                  className="w-full px-3 py-2 rounded border border-white/10 bg-black/40 text-gray-200 placeholder:text-gray-600"
                />
                <Search size={14} className="absolute right-3 top-2.5 text-gray-500" />
              </div>
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={!query.trim()}
                className={`px-3 py-2 rounded border text-xs ${query.trim() ? 'border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/10' : 'border-white/10 text-gray-500 cursor-not-allowed'}`}
              >
                Set
              </button>
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 mt-2 w-full rounded-md border border-white/10 bg-black/80 shadow-xl max-h-56 overflow-auto">
                {suggestions.map((entry) => (
                  <button
                    key={`${entry.symbol}-${entry.label || ''}`}
                    type="button"
                    onClick={() => handleSubmit(entry.symbol)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{entry.symbol}</span>
                      {entry.label && <span className="text-gray-500">{entry.label}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <div className="mt-1 text-[11px] text-gray-500">Searching...</div>
            )}
          </div>
          {candidateSymbols.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {candidateSymbols.map((entry) => {
                const key = String(entry || '').trim().toUpperCase();
                const active = key && key === selectedKey;
                return (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => handleSubmit(entry)}
                    className={`px-2 py-1 rounded-full border text-[11px] ${active ? 'border-emerald-400/70 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                  >
                    {entry}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onApplyToSignalsChange?.(!applyToSignals)}
            className={`px-2.5 py-1 rounded border text-[11px] ${applyToSignals ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
          >
            {applyToSignals ? 'Sync Signal List: On' : 'Sync Signal List: Off'}
          </button>
          <span className="text-[11px] text-gray-500">Apply the snapshot symbol to the Signal panel list.</span>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-400">Snapshot Status</div>
              <div className={`text-sm ${normalizedStatus?.ok ? 'text-emerald-200' : 'text-amber-300'}`}>
                {symbol ? `${symbol}: ` : ''}
                {statusLabel}
              </div>
            </div>
            <div className="text-[11px] text-gray-500 text-right space-y-1">
              <div>{brokerLabel}</div>
              <div>Updated: {latestFrameUpdatedAt ? formatAge(latestFrameUpdatedAt) : '--'}</div>
            </div>
          </div>
          <div className="text-[11px] text-gray-500">Timeframes: {timeframes.map(formatTimeframe).join(' / ') || 'none'}</div>
          {framesLine && (
            <div className="text-[11px] text-gray-500">
              Frames: {framesLine}
            </div>
          )}
          {freshnessBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {freshnessBadges.map((badge) => {
                const tone =
                  badge.state === 'fresh'
                    ? 'border-emerald-400/60 text-emerald-200 bg-emerald-500/10'
                    : badge.state === 'aging'
                      ? 'border-yellow-400/60 text-yellow-200 bg-yellow-500/10'
                      : badge.state === 'stale'
                        ? 'border-rose-400/60 text-rose-200 bg-rose-500/10'
                        : badge.state === 'short'
                          ? 'border-orange-400/60 text-orange-200 bg-orange-500/10'
                          : 'border-slate-400/50 text-slate-200 bg-slate-500/10';
                const stateLabel = String(badge.state || '').toUpperCase();
                return (
                  <span
                    key={`${badge.tf}:${badge.state}`}
                    className={`px-2 py-1 rounded border text-[10px] tracking-wide ${tone}`}
                    title={`${badge.label} ${stateLabel} ${badge.detail}`}
                  >
                    {badge.label} {stateLabel}
                  </span>
                );
              })}
            </div>
          )}
          {incompleteLine && (
            <div className="text-[11px] text-amber-300">
              Incomplete: {incompleteLine}
            </div>
          )}
          {status?.capturedAtMs && (
            <div className="text-[11px] text-gray-500">
              Captured: {formatAge(status.capturedAtMs)}
            </div>
          )}
          {bridgeError ? (
            <div className="text-[11px] text-red-300">{bridgeError}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default SnapshotInterface;
