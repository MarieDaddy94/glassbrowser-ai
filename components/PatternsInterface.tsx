import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Plus, RefreshCw, X } from 'lucide-react';
import type { PatternEvent } from '../services/chartEngine';

type PatternSymbolMode = 'auto' | 'scope' | 'active' | 'custom';
type PatternRefreshMode = 'interval' | 'bar' | 'both';

type SymbolSuggestion = {
  symbol: string;
  label?: string | null;
};

type PatternsInterfaceProps = {
  symbols: string[];
  symbolMode: PatternSymbolMode;
  onSymbolModeChange: (next: PatternSymbolMode) => void;
  onAddSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  onSearchSymbols: (query: string) => Promise<SymbolSuggestion[]>;
  timeframes: string[];
  onTimeframesChange: (next: string[]) => void;
  detectors: string[];
  onDetectorsChange: (next: string[]) => void;
  autoRefreshEnabled: boolean;
  onAutoRefreshChange: (next: boolean) => void;
  refreshIntervalMs: number;
  onRefreshIntervalChange: (next: number) => void;
  refreshMode: PatternRefreshMode;
  onRefreshModeChange: (next: PatternRefreshMode) => void;
  events: PatternEvent[];
  effectiveSymbols: string[];
  watchCount: number;
  watchLimit: number;
  watchTruncated: number;
  onRefreshNow: () => void;
  onFocusChart: (symbol: string, timeframe?: string | null) => void;
};

const TIMEFRAME_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' }
];

const DETECTOR_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'structure_break', label: 'Structure Break' },
  { id: 'range_breakout', label: 'Range Breakout' },
  { id: 'support_resistance', label: 'Support/Resistance' },
  { id: 'trend_pullback', label: 'Trend Pullback' },
  { id: 'engulfing', label: 'Engulfing' },
  { id: 'inside_bar', label: 'Inside Bar' },
  { id: 'pin_bar', label: 'Pin Bar' },
  { id: 'fvg', label: 'FVG / Imbalance' },
  { id: 'harmonic_gartley', label: 'Harmonic Gartley' },
  { id: 'harmonic_bat', label: 'Harmonic Bat' },
  { id: 'harmonic_butterfly', label: 'Harmonic Butterfly' },
  { id: 'harmonic_crab', label: 'Harmonic Crab' },
  { id: 'harmonic_deep_crab', label: 'Harmonic Deep Crab' },
  { id: 'harmonic_cypher', label: 'Harmonic Cypher' },
  { id: 'harmonic_shark', label: 'Harmonic Shark' },
  { id: 'swing_high', label: 'Swing High' },
  { id: 'swing_low', label: 'Swing Low' },
  { id: 'ema_cross', label: 'EMA Cross' },
  { id: 'rsi_extreme', label: 'RSI Extreme' },
  { id: 'atr_spike', label: 'ATR Spike' }
];

const formatAge = (ts: number) => {
  if (!ts) return '--';
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
};

const formatTypeLabel = (value: string) => {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
};

const typeToneClass = (value: string) => {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('bull')) return 'text-emerald-200 border-emerald-400/40 bg-emerald-500/10';
  if (raw.includes('bear')) return 'text-red-200 border-red-400/40 bg-red-500/10';
  return 'text-slate-200 border-white/10 bg-white/5';
};

const formatHarmonicDetail = (evt: PatternEvent) => {
  const payload = evt?.payload && typeof evt.payload === 'object' ? evt.payload : null;
  if (!payload || String(payload.family || '').trim().toLowerCase() !== 'harmonic') return '';
  const harmonicType = String(payload.harmonicType || '').trim().toLowerCase().replace(/_/g, ' ');
  const direction = String(payload.direction || '').trim().toLowerCase();
  const confidenceRaw = Number(payload.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? `${Math.round(Math.max(0, Math.min(1, confidenceRaw)) * 100)}%`
    : '--';
  const dPriceRaw = Number(payload?.anchors?.d?.price);
  const dPrice = Number.isFinite(dPriceRaw) ? dPriceRaw.toFixed(2).replace(/\.?0+$/, '') : '--';
  const przLowRaw = Number(payload?.prz?.low);
  const przHighRaw = Number(payload?.prz?.high);
  const przLow = Number.isFinite(przLowRaw) ? przLowRaw.toFixed(2).replace(/\.?0+$/, '') : '--';
  const przHigh = Number.isFinite(przHighRaw) ? przHighRaw.toFixed(2).replace(/\.?0+$/, '') : '--';
  const abXaRaw = Number(payload?.ratios?.abXa);
  const bcAbRaw = Number(payload?.ratios?.bcAb);
  const coreRatioRaw =
    Number(payload?.coreRatio) ||
    (Number.isFinite(abXaRaw) ? abXaRaw : Number.isFinite(bcAbRaw) ? bcAbRaw : NaN);
  const coreRatio = Number.isFinite(coreRatioRaw) ? coreRatioRaw.toFixed(3) : '--';
  return `${harmonicType || 'harmonic'} ${direction || '--'} | PRZ ${przLow}-${przHigh} | D ${dPrice} | AB/XA ${coreRatio} | Conf ${confidence}`;
};

const toggleList = <T extends string>(list: T[], value: T) => {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
};

const PatternsInterface: React.FC<PatternsInterfaceProps> = ({
  symbols,
  symbolMode,
  onSymbolModeChange,
  onAddSymbol,
  onRemoveSymbol,
  onSearchSymbols,
  timeframes,
  onTimeframesChange,
  detectors,
  onDetectorsChange,
  autoRefreshEnabled,
  onAutoRefreshChange,
  refreshIntervalMs,
  onRefreshIntervalChange,
  refreshMode,
  onRefreshModeChange,
  events,
  effectiveSymbols,
  watchCount,
  watchLimit,
  watchTruncated,
  onRefreshNow,
  onFocusChart
}) => {
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    const next = String(query || '').trim();
    if (!next) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let active = true;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await onSearchSymbols(next);
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

  const handleAddSymbol = useCallback((value?: string) => {
    const next = String(value ?? query).trim().toUpperCase();
    if (!next) return;
    onAddSymbol(next);
    setQuery('');
    setShowSuggestions(false);
  }, [onAddSymbol, query]);

  const filteredEvents = useMemo(() => {
    const q = String(filterText || '').trim().toLowerCase();
    const list = Array.isArray(events) ? events.slice() : [];
    const allowedSymbols = new Set(effectiveSymbols.map((sym) => String(sym || '').trim().toUpperCase()).filter(Boolean));
    const scoped = allowedSymbols.size > 0
      ? list.filter((evt) => allowedSymbols.has(String(evt.symbol || '').trim().toUpperCase()))
      : list;
    const sorted = scoped.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!q) return sorted.slice(0, 200);
    return sorted.filter((evt) => {
      const hay = `${evt.symbol || ''} ${evt.timeframe || ''} ${evt.type || ''}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 200);
  }, [effectiveSymbols, events, filterText]);

  const modeLabel = symbolMode === 'auto'
    ? 'Auto (scope + active + custom)'
    : symbolMode === 'scope'
      ? 'Scope symbol only'
      : symbolMode === 'active'
        ? 'Active broker symbol only'
        : 'Custom list only';

  const refreshIntervalSec = Math.max(10, Math.floor(Number(refreshIntervalMs) / 1000));

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#060606]">
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Patterns</div>
            <div className="text-xs text-gray-400">Visual pattern detection from broker data</div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={onRefreshNow}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-1"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
            >
              {settingsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="px-4 py-3 border-b border-white/10 space-y-4 text-xs">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400">Symbol Mode</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {([
                  { id: 'auto', label: 'Auto' },
                  { id: 'scope', label: 'Scope' },
                  { id: 'active', label: 'Active' },
                  { id: 'custom', label: 'Custom' }
                ] as Array<{ id: PatternSymbolMode; label: string }>).map((option) => {
                  const active = symbolMode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSymbolModeChange(option.id)}
                      className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">{modeLabel}</div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400">Add Symbol</label>
              <div className="relative mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSymbol();
                      }
                    }}
                    placeholder="Search broker symbols..."
                    className="w-full px-3 py-2 rounded border border-white/10 bg-black/40 text-sm text-white focus:outline-none focus:border-cyan-400/60"
                  />
                  {searching && (
                    <div className="absolute right-2 top-2 text-gray-500">
                      <Activity size={14} />
                    </div>
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded border border-white/10 bg-[#0b0b0b] shadow-lg max-h-48 overflow-auto">
                      {suggestions.map((entry) => (
                        <button
                          type="button"
                          key={`${entry.symbol}-${entry.label || ''}`}
                          onClick={() => handleAddSymbol(entry.symbol)}
                          className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between gap-3"
                        >
                          <span className="text-sm text-white">{entry.symbol}</span>
                          {entry.label && <span className="text-[11px] text-gray-400">{entry.label}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleAddSymbol()}
                  className="px-2.5 py-2 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
                >
                  <Plus size={14} />
                </button>
              </div>
              {symbols.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {symbols.map((sym) => (
                    <span key={sym} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 text-[11px] text-gray-300 bg-white/5">
                      {sym}
                      <button type="button" onClick={() => onRemoveSymbol(sym)} className="text-gray-500 hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400">Timeframes</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {TIMEFRAME_OPTIONS.map((tf) => {
                  const active = timeframes.includes(tf.value);
                  return (
                    <button
                      key={tf.value}
                      type="button"
                      onClick={() => onTimeframesChange(toggleList(timeframes, tf.value))}
                      className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                    >
                      {tf.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400">Detectors</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DETECTOR_OPTIONS.map((det) => {
                  const active = detectors.includes(det.id);
                  return (
                    <button
                      key={det.id}
                      type="button"
                      onClick={() => onDetectorsChange(toggleList(detectors, det.id))}
                      className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-sky-400/60 text-sky-100 bg-sky-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                    >
                      {det.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Auto Refresh</label>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => onAutoRefreshChange(!autoRefreshEnabled)}
                    className={`px-2.5 py-1 rounded border text-[11px] ${autoRefreshEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                  >
                    {autoRefreshEnabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Refresh Mode</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {([
                    { id: 'interval', label: 'Interval' },
                    { id: 'bar', label: 'On Bar' },
                    { id: 'both', label: 'Both' }
                  ] as Array<{ id: PatternRefreshMode; label: string }>).map((option) => {
                    const active = refreshMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onRefreshModeChange(option.id)}
                        className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-amber-400/60 text-amber-100 bg-amber-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Interval (sec)</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={refreshIntervalSec}
                    onChange={(e) => onRefreshIntervalChange(Math.max(10, Math.min(600, Number(e.target.value || 0))) * 1000)}
                    className="w-24 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Watches</label>
                <div className="mt-2 text-[11px] text-gray-500">
                  {watchCount} active{watchTruncated > 0 ? ` (trimmed ${watchTruncated})` : ''} / limit {watchLimit}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-gray-500">
              Watching {effectiveSymbols.length} symbol{effectiveSymbols.length === 1 ? '' : 's'} x {timeframes.length || 0} timeframe{timeframes.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between gap-2">
        <div className="text-xs text-gray-400">Pattern Feed</div>
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter by symbol/type..."
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-xs text-gray-200 w-48"
        />
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3 text-xs">
        {filteredEvents.length === 0 ? (
          <div className="text-gray-500">No pattern events yet.</div>
        ) : (
          filteredEvents.map((evt) => (
            <div key={`${evt.id}-${evt.ts}`} className="border border-white/10 rounded-lg p-3 bg-white/5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] ${typeToneClass(evt.type)}`}>
                    {formatTypeLabel(evt.type)}
                  </span>
                  {Number.isFinite(Number(evt.strength)) && (
                    <span className="text-[10px] text-gray-400">Str {Number(evt.strength).toFixed(2)}</span>
                  )}
                </div>
                <span className="text-[10px] text-gray-500">{formatAge(evt.ts)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-gray-300">
                  {evt.symbol} x {evt.timeframe}
                </div>
                <button
                  type="button"
                  onClick={() => onFocusChart(evt.symbol, evt.timeframe)}
                  className="px-2 py-1 rounded border border-white/10 text-[10px] text-gray-300 hover:text-white hover:bg-white/10"
                >
                  Open Chart
                </button>
              </div>
              {formatHarmonicDetail(evt) && (
                <div className="mt-2 text-[10px] text-amber-200/90">
                  {formatHarmonicDetail(evt)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PatternsInterface;
