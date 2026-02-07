
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart2, BookOpen, Camera, Maximize2, Minimize2, RefreshCw, Settings } from 'lucide-react';
import { CrossPanelContext, Position, RegimeBlockState, ReviewAnnotation, TradeLockerOrder, TradeLockerQuote, SetupSignal, SetupWatcher } from '../types';
import type { PatternEvent } from '../services/chartEngine';
import { buildEvidenceCardFromSignal } from '../services/evidenceCard';
import { normalizeSymbolKey, normalizeSymbolLoose, normalizeTimeframeKey } from '../services/symbols';
import { requestBrokerCoordinated } from '../services/brokerRequestBridge';
import { getRuntimeScheduler } from '../services/runtimeScheduler';
import { requireBridge } from '../services/bridgeGuard';
import { createPanelActionRunner } from '../services/panelConnectivityEngine';

export interface NativeChartFrameMeta {
  resolution: string;
  label: string;
  bars: number;
  updatedAtMs: number | null;
}

export interface NativeChartMeta {
  symbol: string;
  updatedAtMs: number | null;
  frames: NativeChartFrameMeta[];
}

export interface NativeChartHandle {
  captureSnapshot: () => string | null;
  getMeta: () => NativeChartMeta;
  focusSymbol?: (symbol: string, timeframe?: string, opts?: { revealSetups?: boolean }) => void;
  ensureFrameActive?: (timeframe: string) => boolean;
  setShowIndicators?: (enabled: boolean) => void;
  setShowLiveQuote?: (enabled: boolean) => void;
  setShowRanges?: (enabled: boolean) => void;
  setShowSetups?: (enabled: boolean) => void;
  setShowReviews?: (enabled: boolean) => void;
  setShowPatterns?: (enabled: boolean) => void;
  setShowSessions?: (enabled: boolean) => void;
  setShowConstraints?: (enabled: boolean) => void;
  setShowPositions?: (enabled: boolean) => void;
  setShowOrders?: (enabled: boolean) => void;
  toggleFrame?: (frameId: string) => void;
  setActiveFrames?: (frameIds: string[]) => void;
  refresh?: () => void;
  captureAll?: () => void;
}

interface NativeChartInterfaceProps {
  activeSymbol?: string;
  brokerLabel?: string;
  supportsConstraints?: boolean;
  priceSelectMode?: 'off' | 'entry' | 'sl' | 'tp';
  isConnected: boolean;
  hasDeveloperApiKey?: boolean;
  positions: Position[];
  orders: TradeLockerOrder[];
  quotesBySymbol: Record<string, TradeLockerQuote>;
  setupSignals?: SetupSignal[];
  setupWatchers?: SetupWatcher[];
  regimeBlocks?: Record<string, RegimeBlockState>;
  reviewAnnotations?: ReviewAnnotation[];
  patternEvents?: PatternEvent[];
  tvSymbol?: string;
  tvPrice?: number | null;
  tvPriceUpdatedAtMs?: number | null;
  onOpenSettings?: () => void;
  onOpenAcademy?: () => void;
  onSymbolChange?: (symbol: string) => void;
  resolveSymbol?: (raw: string) => Promise<string>;
  onFullscreenChange?: (active: boolean) => void;
  onBarClose?: (event: { symbol: string; resolution: string; bar: Candle; bars: Candle[]; updatedAtMs: number | null }) => void;
  onUpdateWatcher?: (id: string, patch: Partial<SetupWatcher>) => void;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  requestBroker?: (method: string, args?: any, meta?: { symbol?: string | null }) => Promise<any>;
  crossPanelContext?: CrossPanelContext | null;
  onPriceSelect?: (event: { price: number; frameId: string; resolution: string; source: 'frame' | 'fullscreen'; mode: 'entry' | 'sl' | 'tp' }) => void;
  onLevelUpdate?: (event: {
    levelId: string;
    price: number;
    frameId: string;
    resolution: string;
    source: 'frame' | 'fullscreen';
    meta?: Record<string, any>;
  }) => void;
}

type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number | null;
};

type FrameConfig = {
  id: string;
  label: string;
  resolution: string;
  lookbackBars: number;
  displayBars: number;
  maxAgeMs: number;
};

type FrameState = {
  bars: Candle[];
  updatedAtMs: number | null;
  source?: string | null;
  error?: string | null;
  coverage?: HistoryCoverage | null;
  loading: boolean;
};

type HistoryCoverage = {
  expectedBars?: number;
  missingBars?: number;
  gapCount?: number;
  maxGapMs?: number | null;
  coveragePct?: number | null;
  firstTs?: number | null;
  lastTs?: number | null;
};

type OverlayLevel = {
  id?: string;
  kind?: 'quote' | 'constraint' | 'position' | 'order' | 'setup' | 'review' | 'pattern' | 'range' | 'session' | 'drag';
  price: number;
  label: string;
  color: string;
  style?: 'solid' | 'dashed';
  priority?: number;
  draggable?: boolean;
  meta?: Record<string, any>;
};

type PlotMeta = {
  frameId: string;
  resolution: string;
  plot: { x: number; y: number; w: number; h: number };
  paddedMin: number;
  paddedMax: number;
  priceRange: number;
};

type DragState = {
  level: OverlayLevel;
  frameId: string;
  resolution: string;
  source: 'frame' | 'fullscreen';
  container: HTMLDivElement;
  meta: PlotMeta;
  lastPrice: number;
  didMove: boolean;
};

type InstrumentStatus = {
  minStopDistance: number | null;
  priceStep: number | null;
  sessionId: number | null;
  sessionStatusId: number | null;
  sessionOpen: boolean | null;
  sessionLabel: string | null;
  fetchedAtMs: number | null;
  loading: boolean;
  error?: string | null;
};

type SessionStyle = {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  fill: string;
  line: string;
};

const MAX_ACTIVE_FRAMES = 5;
const DEFAULT_FRAME_IDS = ['5m', '15m', '1H', '4H'];
const FRAME_PRESETS: FrameConfig[] = [
  { id: '1m', label: '1m', resolution: '1m', lookbackBars: 800, displayBars: 300, maxAgeMs: 12_000 },
  { id: '5m', label: '5m', resolution: '5m', lookbackBars: 600, displayBars: 260, maxAgeMs: 18_000 },
  { id: '15m', label: '15m', resolution: '15m', lookbackBars: 500, displayBars: 240, maxAgeMs: 30_000 },
  { id: '30m', label: '30m', resolution: '30m', lookbackBars: 420, displayBars: 220, maxAgeMs: 35_000 },
  { id: '1H', label: '1H', resolution: '1H', lookbackBars: 360, displayBars: 200, maxAgeMs: 45_000 },
  { id: '4H', label: '4H', resolution: '4H', lookbackBars: 240, displayBars: 160, maxAgeMs: 60_000 },
  { id: '1D', label: '1D', resolution: '1D', lookbackBars: 180, displayBars: 120, maxAgeMs: 90_000 },
  { id: '1W', label: '1W', resolution: '1W', lookbackBars: 120, displayBars: 80, maxAgeMs: 120_000 }
];
const FRAME_PRESET_MAP: Record<string, FrameConfig> = FRAME_PRESETS.reduce((acc, frame) => {
  acc[frame.id] = frame;
  return acc;
}, {} as Record<string, FrameConfig>);

const RESOLUTION_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1H': 60 * 60_000,
  '4H': 4 * 60 * 60_000,
  '1D': 24 * 60 * 60_000,
  '1W': 7 * 24 * 60 * 60_000
};

const COLORS = {
  bg: '#050505',
  panel: '#0b0b0b',
  grid: 'rgba(255,255,255,0.05)',
  gridStrong: 'rgba(255,255,255,0.12)',
  text: '#d1d5db',
  textDim: '#6b7280',
  up: '#22c55e',
  down: '#f87171',
  wick: 'rgba(148,163,184,0.7)',
  smaFast: '#38bdf8',
  smaSlow: '#fbbf24',
  range: 'rgba(148,163,184,0.55)',
  last: '#22d3ee',
  order: '#f97316',
  position: '#a3e635',
  constraint: '#f472b6',
  setupEntry: '#38bdf8',
  setupStop: '#f97316',
  setupTp: '#22c55e'
};

const SESSION_STYLES: SessionStyle[] = [
  { id: 'asia', label: 'Asia', startHour: 0, endHour: 7, fill: 'rgba(56,189,248,0.08)', line: 'rgba(56,189,248,0.65)' },
  { id: 'london', label: 'London', startHour: 7, endHour: 13, fill: 'rgba(74,222,128,0.08)', line: 'rgba(74,222,128,0.65)' },
  { id: 'ny', label: 'NY', startHour: 13, endHour: 21, fill: 'rgba(251,191,36,0.08)', line: 'rgba(251,191,36,0.65)' }
];

const normalizeKey = (value: any) => normalizeSymbolKey(value);

const toNumber = (value: any) => {
  const raw = typeof value === 'number' ? value : Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(raw) ? raw : null;
};

const normalizeBar = (bar: any): Candle | null => {
  if (!bar || typeof bar !== 'object') return null;
  const tRaw = toNumber((bar as any).t ?? (bar as any).time ?? (bar as any).timestamp);
  if (tRaw == null) return null;
  const t = tRaw > 1e11 ? Math.floor(tRaw) : Math.floor(tRaw * 1000);
  const o = toNumber((bar as any).o ?? (bar as any).open ?? (bar as any).c ?? (bar as any).close);
  const h = toNumber((bar as any).h ?? (bar as any).high ?? o ?? (bar as any).l ?? (bar as any).low);
  const l = toNumber((bar as any).l ?? (bar as any).low ?? o ?? (bar as any).h ?? (bar as any).high);
  const c = toNumber((bar as any).c ?? (bar as any).close ?? o);
  if (o == null || h == null || l == null || c == null) return null;
  const v = toNumber((bar as any).v ?? (bar as any).volume);
  return { t, o, h, l, c, v };
};

const normalizeBars = (bars: any[]): Candle[] => {
  const out: Candle[] = [];
  for (const bar of Array.isArray(bars) ? bars : []) {
    const normalized = normalizeBar(bar);
    if (!normalized) continue;
    out.push(normalized);
  }
  return out.sort((a, b) => a.t - b.t);
};

const formatPrice = (value: number | null | undefined) => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '--';
  const abs = Math.abs(num);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return num.toFixed(decimals).replace(/\.?0+$/, '');
};

const formatPatternLabel = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Pattern';
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
};

const resolvePatternColor = (type: string) => {
  const key = String(type || '').toLowerCase();
  if (key.includes('bear') || key.includes('resistance') || key.includes('swing_high')) return COLORS.down;
  if (key.includes('bull') || key.includes('support') || key.includes('swing_low')) return COLORS.up;
  return COLORS.range;
};

const buildPatternLevels = (event: PatternEvent): OverlayLevel[] => {
  if (!event || !event.type) return [];
  const type = String(event.type || '').trim();
  const payload = event.payload || {};
  const color = resolvePatternColor(type);
  const levels: OverlayLevel[] = [];
  const push = (price: any, label: string, style: OverlayLevel['style'] = 'solid') => {
    const value = typeof price === 'number' ? price : Number(price);
    if (!Number.isFinite(value)) return;
    levels.push({
      price: value,
      label,
      color,
      style,
      priority: 4,
      kind: 'pattern'
    });
  };

  switch (type) {
    case 'swing_high':
      push(payload.price, 'Swing High', 'dashed');
      break;
    case 'swing_low':
      push(payload.price, 'Swing Low', 'dashed');
      break;
    case 'structure_break_bull':
    case 'structure_break_bear':
      push(payload.level, 'Structure Break');
      break;
    case 'range_breakout_bull':
      push(payload.high, 'Range Break');
      push(payload.low, 'Range Low', 'dashed');
      break;
    case 'range_breakout_bear':
      push(payload.low, 'Range Break');
      push(payload.high, 'Range High', 'dashed');
      break;
    case 'support_hold':
      push(payload.level, 'Support', 'dashed');
      break;
    case 'resistance_hold':
      push(payload.level, 'Resistance', 'dashed');
      break;
    case 'fvg_bull':
    case 'fvg_bear':
      push(payload.gapHigh, 'FVG High', 'dashed');
      push(payload.gapLow, 'FVG Low', 'dashed');
      break;
    case 'trend_pullback_bull':
    case 'trend_pullback_bear':
      push(payload.emaFast, 'Pullback EMA', 'dashed');
      break;
    default:
      if (payload?.level != null) push(payload.level, formatPatternLabel(type), 'dashed');
      if (payload?.price != null) push(payload.price, formatPatternLabel(type), 'dashed');
      break;
  }

  return levels;
};

const formatAge = (ms: number | null | undefined) => {
  if (!ms || ms <= 0) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(1, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
};

const resolveSignalStatus = (signal?: SetupSignal | null) => {
  const raw = String(signal?.payload?.status || signal?.payload?.signalType || '').trim();
  return raw || 'setup_ready';
};

const formatSignalStatus = (status: string) => {
  switch (status) {
    case 'setup_detected':
      return 'DETECTED';
    case 'setup_ready':
      return 'READY';
    case 'entry_confirmed':
      return 'CONFIRMED';
    case 'triggered':
      return 'TRIGGERED';
    case 'invalidated':
      return 'INVALID';
    default:
      return status.toUpperCase();
  }
};

const getSignalStatusClass = (status: string) => {
  switch (status) {
    case 'entry_confirmed':
      return 'bg-emerald-500/20 text-emerald-200';
    case 'setup_ready':
      return 'bg-cyan-500/20 text-cyan-200';
    case 'setup_detected':
      return 'bg-slate-500/20 text-slate-200';
    case 'triggered':
      return 'bg-amber-500/20 text-amber-200';
    case 'invalidated':
      return 'bg-red-500/20 text-red-200';
    default:
      return 'bg-white/10 text-gray-200';
  }
};

const formatTimeLabel = (ts: number, resolution: string) => {
  const date = new Date(ts);
  if (resolution === '4H' || resolution === '1D') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const computeSma = (bars: Candle[], period: number) => {
  const points: Array<{ index: number; value: number }> = [];
  if (bars.length < period) return points;
  let sum = 0;
  for (let i = 0; i < bars.length; i += 1) {
    sum += bars[i].c;
    if (i >= period) sum -= bars[i - period].c;
    if (i >= period - 1) {
      points.push({ index: i, value: sum / period });
    }
  }
  return points;
};

const computeAtr = (bars: Candle[], period: number) => {
  if (bars.length < period + 1) return null;
  let total = 0;
  for (let i = bars.length - period; i < bars.length; i += 1) {
    const current = bars[i];
    const prev = bars[i - 1];
    const highLow = current.h - current.l;
    const highClose = Math.abs(current.h - prev.c);
    const lowClose = Math.abs(current.l - prev.c);
    total += Math.max(highLow, highClose, lowClose);
  }
  return total / period;
};

const computeRsi = (bars: Candle[], period: number) => {
  if (bars.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = bars.length - period; i < bars.length; i += 1) {
    const prev = bars[i - 1];
    const current = bars[i];
    const delta = current.c - prev.c;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const parseSessionOpen = (status: any) => {
  if (!status || typeof status !== 'object') return null;
  const boolFrom = (value: any) => {
    if (typeof value === 'boolean') return value;
    const s = String(value || '').trim().toLowerCase();
    if (!s) return null;
    if (['true', '1', 'yes', 'open', 'trading', 'active'].includes(s)) return true;
    if (['false', '0', 'no', 'closed', 'halted', 'inactive', 'suspended'].includes(s)) return false;
    return null;
  };

  for (const key of ['isOpen', 'isTrading', 'isMarketOpen', 'open', 'active']) {
    const v = boolFrom(status?.[key]);
    if (v != null) return v;
  }

  const label = String(status?.status || status?.state || status?.sessionStatus || status?.marketStatus || '').trim().toUpperCase();
  if (label.includes('OPEN') || label.includes('TRADING') || label.includes('ACTIVE')) return true;
  if (label.includes('CLOSED') || label.includes('HALT') || label.includes('SUSPEND')) return false;
  return null;
};

const resolveSessionLabel = (status: any) => {
  const label = String(status?.status || status?.state || status?.sessionStatus || status?.marketStatus || '').trim();
  return label ? label.toUpperCase() : null;
};

const getSessionStyleForTs = (ts: number) => {
  const date = new Date(ts);
  const hour = date.getHours();
  for (const style of SESSION_STYLES) {
    if (style.startHour <= style.endHour) {
      if (hour >= style.startHour && hour < style.endHour) return style;
    } else {
      if (hour >= style.startHour || hour < style.endHour) return style;
    }
  }
  return null;
};

const buildSessionBlocks = (bars: Candle[]) => {
  const blocks: Array<{ style: SessionStyle; startIndex: number; endIndex: number }> = [];
  let current: { style: SessionStyle; startIndex: number; endIndex: number } | null = null;
  for (let i = 0; i < bars.length; i += 1) {
    const style = getSessionStyleForTs(bars[i].t);
    if (!style) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }
    if (!current || current.style.id !== style.id) {
      if (current) blocks.push(current);
      current = { style, startIndex: i, endIndex: i };
      continue;
    }
    current.endIndex = i;
  }
  if (current) blocks.push(current);
  return blocks;
};

const createInitialFrameState = (): Record<string, FrameState> => {
  const initial: Record<string, FrameState> = {};
  for (const frame of FRAME_PRESETS) {
    initial[frame.id] = { bars: [], updatedAtMs: null, source: null, error: null, coverage: null, loading: false };
  }
  return initial;
};

const createEmptyInstrumentStatus = (): InstrumentStatus => ({
  minStopDistance: null,
  priceStep: null,
  sessionId: null,
  sessionStatusId: null,
  sessionOpen: null,
  sessionLabel: null,
  fetchedAtMs: null,
  loading: false,
  error: null
});

const formatConstraintError = (message: string, brokerLabel: string) => {
  const raw = String(message || '').trim();
  if (!raw) return 'Constraints unavailable.';
  const broker = brokerLabel || 'broker';
  const lower = raw.toLowerCase();
  if (lower.includes('accnum') || lower.includes('accountid') || lower.includes('account id')) {
    return `Select a ${broker} account to load constraints.`;
  }
  if (lower.includes('developer') || lower.includes('api key')) {
    return `Add a ${broker} developer API key to load constraints.`;
  }
  if (lower.includes('400') || lower.includes('bad request')) {
    return 'Constraints unavailable for this symbol.';
  }
  return raw;
};

const NativeChartInterface = forwardRef<NativeChartHandle, NativeChartInterfaceProps>(
  (
    {
      activeSymbol,
      brokerLabel,
      supportsConstraints,
      priceSelectMode,
      isConnected,
      hasDeveloperApiKey,
      positions,
      orders,
      quotesBySymbol,
      setupSignals,
      setupWatchers,
      regimeBlocks,
      reviewAnnotations,
      patternEvents,
      tvSymbol,
      tvPrice,
      tvPriceUpdatedAtMs,
      onOpenSettings,
      onOpenAcademy,
      onSymbolChange,
      resolveSymbol,
      onFullscreenChange,
      onBarClose,
      onUpdateWatcher,
      onRunActionCatalog,
      requestBroker,
      crossPanelContext,
      onPriceSelect,
      onLevelUpdate
    },
    ref
  ) => {
    const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);
    const api = window.glass?.tradelocker;

    const [symbolInput, setSymbolInput] = useState('');
    const [resolvedSymbol, setResolvedSymbol] = useState('');
    const [resolveNote, setResolveNote] = useState<string | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [frameState, setFrameState] = useState<Record<string, FrameState>>(createInitialFrameState);
    const [activeFrameIds, setActiveFrameIds] = useState<string[]>(DEFAULT_FRAME_IDS);
    const [showIndicators, setShowIndicators] = useState(true);
    const [showLiveQuote, setShowLiveQuote] = useState(true);
    const [showPositions, setShowPositions] = useState(true);
    const [showOrders, setShowOrders] = useState(true);
    const [showSessions, setShowSessions] = useState(true);
    const [showRanges, setShowRanges] = useState(true);
    const [showSetups, setShowSetups] = useState(true);
    const [showReviews, setShowReviews] = useState(true);
    const [showPatterns, setShowPatterns] = useState(true);
    const [showConstraints, setShowConstraints] = useState(true);
    const [lastCaptureAtMs, setLastCaptureAtMs] = useState<number | null>(null);
    const [captureNote, setCaptureNote] = useState<string | null>(null);
    const [lastRefreshAtMs, setLastRefreshAtMs] = useState<number | null>(null);
    const [instrumentStatus, setInstrumentStatus] = useState<InstrumentStatus>(createEmptyInstrumentStatus);
    const [fullscreenFrameId, setFullscreenFrameId] = useState<string | null>(null);
    const [dragPreview, setDragPreview] = useState<OverlayLevel | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const resolvedAtRef = useRef<number | null>(null);
    const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
    const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const containerRefCallbacks = useRef<Record<string, (el: HTMLDivElement | null) => void>>({});
    const canvasRefCallbacks = useRef<Record<string, (el: HTMLCanvasElement | null) => void>>({});
    const resizeObserversRef = useRef<Record<string, ResizeObserver>>({});
    const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
    const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
    const fullscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const fullscreenResizeObserverRef = useRef<ResizeObserver | null>(null);
    const [fullscreenSize, setFullscreenSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const refreshTokenRef = useRef(0);
    const refreshInFlightRef = useRef(false);
    const lastSnapshotRef = useRef<string | null>(null);
    const lastQuoteRef = useRef<{ price: number; ts: number } | null>(null);
    const plotMetaRef = useRef<Record<string, PlotMeta>>({});
    const fullscreenPlotMetaRef = useRef<PlotMeta | null>(null);
    const dragStateRef = useRef<DragState | null>(null);
    const skipClickRef = useRef(false);

    const brokerLabelSafe = brokerLabel || 'TradeLocker';
    const constraintsEnabled = supportsConstraints !== false;
    const activePriceMode = priceSelectMode && priceSelectMode !== 'off' ? priceSelectMode : 'off';
    const runPanelAction = useMemo(
      () =>
        createPanelActionRunner({
          panel: 'nativechart',
          runActionCatalog: onRunActionCatalog,
          defaultSource: 'catalog',
          defaultFallbackSource: 'local'
        }),
      [onRunActionCatalog]
    );

    const runActionOr = useCallback(
      (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
        void runPanelAction(actionId, payload, {
          fallback: async () => {
            fallback?.();
            return { ok: true, data: null };
          }
        });
      },
      [runPanelAction]
    );

    const brokerRequest = useCallback(
      async (method: string, args?: any) => {
        if (requestBroker) {
          return requestBroker(method, args, { symbol: resolvedSymbol || symbolInput || null });
        }
        const coordinated = await requestBrokerCoordinated(method, args, {
          symbol: resolvedSymbol || symbolInput || null,
          source: 'chart'
        });
        if (coordinated?.ok || !String(coordinated?.error || '').includes('bridge unavailable')) {
          return coordinated;
        }
        const fn = (api as any)?.[method];
        if (typeof fn === 'function') {
          return fn(args);
        }
        return { ok: false, error: `${method} unavailable.` };
      },
      [api, requestBroker, resolvedSymbol, symbolInput]
    );
    const brokerHistoryAvailable = useMemo(() => {
      return !!requestBroker || !!(window as any)?.glass?.broker?.request || !!api?.getHistorySeries;
    }, [api, requestBroker]);

    const activeFrames = useMemo(
      () => activeFrameIds.map((id) => FRAME_PRESET_MAP[id]).filter(Boolean),
      [activeFrameIds]
    );

    const bottomFrame = activeFrames.length > 0 ? activeFrames[activeFrames.length - 1] : null;
    const bottomFrameReady = bottomFrame ? (frameState[bottomFrame.id]?.bars?.length || 0) > 0 : false;

    const fullscreenFrame = useMemo(() => {
      if (!fullscreenFrameId) return null;
      return activeFrames.find((frame) => frame.id === fullscreenFrameId) || FRAME_PRESET_MAP[fullscreenFrameId] || null;
    }, [activeFrames, fullscreenFrameId]);

    const updateSize = useCallback((id: string, width: number, height: number) => {
      setSizes((prev) => {
        const current = prev[id];
        if (current && current.width === width && current.height === height) return prev;
        return {
          ...prev,
          [id]: { width, height }
        };
      });
    }, []);

    const toggleFrame = useCallback((id: string) => {
      setActiveFrameIds((prev) => {
        const exists = prev.includes(id);
        if (exists) {
          if (prev.length <= 1) return prev;
          return prev.filter((frameId) => frameId !== id);
        }
        if (prev.length >= MAX_ACTIVE_FRAMES) return prev;
        const next = [...prev, id];
        const order = FRAME_PRESETS.map((frame) => frame.id);
        return next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      });
    }, []);

    const resolveFrameId = useCallback((input: string) => {
      const key = normalizeTimeframeKey(input);
      if (!key) return '';
      if (FRAME_PRESET_MAP[key]) return FRAME_PRESET_MAP[key].id;
      const match = FRAME_PRESETS.find(
        (frame) =>
          normalizeTimeframeKey(frame.id) === key ||
          normalizeTimeframeKey(frame.resolution) === key ||
          normalizeTimeframeKey(frame.label) === key
      );
      return match?.id || '';
    }, []);

    const ensureFrameActive = useCallback((input: string) => {
      const frameId = resolveFrameId(input);
      if (!frameId) return false;
      setActiveFrameIds((prev) => {
        if (prev.includes(frameId)) return prev;
        let next = [...prev];
        if (next.length >= MAX_ACTIVE_FRAMES) {
          next = next.slice(1);
        }
        next.push(frameId);
        const order = FRAME_PRESETS.map((frame) => frame.id);
        return next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      });
      return true;
    }, [resolveFrameId]);

    useEffect(() => {
      const next = String(activeSymbol || '').trim();
      if (!next) return;
      setSymbolInput((prev) => (prev ? prev : next));
      setResolvedSymbol((prev) => (prev ? prev : next));
    }, [activeSymbol]);

    useEffect(() => {
      if (symbolInput) return;
      const scoped = String(crossPanelContext?.symbol || '').trim();
      if (!scoped) return;
      setSymbolInput(scoped);
      setResolvedSymbol((prev) => (prev ? prev : scoped));
    }, [crossPanelContext?.symbol, symbolInput]);

    const handleResolve = useCallback(
      async (input: string) => {
        const raw = String(input || '').trim();
        if (!raw) {
          setResolveNote('Enter a symbol to continue.');
          return;
        }

        setIsResolving(true);
        setResolveNote(null);
        let resolved = raw;
        if (resolveSymbol) {
          try {
            const result = await resolveSymbol(raw);
            const cleaned = String(result || '').trim();
            if (cleaned) resolved = cleaned;
          } catch {
            // ignore resolve failure
          }
        }
        setResolvedSymbol(resolved);
        resolvedAtRef.current = Date.now();
        onSymbolChange?.(resolved);
        if (resolved !== raw) {
          setResolveNote(`Resolved ${raw} -> ${resolved}`);
        }
        setIsResolving(false);
      },
      [onSymbolChange, resolveSymbol]
    );

    const focusSymbol = useCallback(
      (symbol: string, timeframe?: string, opts?: { revealSetups?: boolean }) => {
        const next = String(symbol || '').trim();
        if (!next) return;
        void handleResolve(next);
        if (timeframe) ensureFrameActive(timeframe);
        if (opts?.revealSetups) setShowSetups(true);
      },
      [ensureFrameActive, handleResolve]
    );

    useEffect(() => {
      if (!resolvedSymbol || !brokerHistoryAvailable || !constraintsEnabled) {
        setInstrumentStatus(createEmptyInstrumentStatus());
        return;
      }
      let cancelled = false;
      const loadInstrument = async () => {
        setInstrumentStatus((prev) => ({ ...prev, loading: true, error: null }));
        try {
          const res = await brokerRequest('getInstrumentConstraints', { symbol: resolvedSymbol });
          if (cancelled) return;
          if (!res?.ok) {
            const err = res?.error ? formatConstraintError(String(res.error), brokerLabelSafe) : 'Constraints unavailable.';
            setInstrumentStatus((prev) => ({
              ...prev,
              loading: false,
              error: err,
              fetchedAtMs: Date.now()
            }));
            return;
          }

          const constraints = res?.constraints || {};
          const sessionStatus = constraints.sessionStatus || null;
          const sessionOpen =
            typeof constraints.sessionOpen === 'boolean' ? constraints.sessionOpen : parseSessionOpen(sessionStatus);
          const sessionLabel = resolveSessionLabel(sessionStatus);

          setInstrumentStatus({
            minStopDistance: constraints.minStopDistance ?? null,
            priceStep: constraints.priceStep ?? null,
            sessionId: null,
            sessionStatusId: null,
            sessionOpen,
            sessionLabel,
            fetchedAtMs: res.fetchedAtMs || Date.now(),
            loading: false,
            error: null
          });
        } catch (err: any) {
          if (cancelled) return;
          const errText = err?.message ? formatConstraintError(String(err.message), brokerLabelSafe) : 'Constraints unavailable.';
          setInstrumentStatus((prev) => ({
            ...prev,
            loading: false,
            error: errText,
            fetchedAtMs: Date.now()
          }));
        }
      };
      void loadInstrument();
      return () => {
        cancelled = true;
      };
    }, [brokerHistoryAvailable, brokerLabelSafe, brokerRequest, constraintsEnabled, resolvedSymbol]);

    useEffect(() => {
      if (!constraintsEnabled) {
        setShowConstraints(false);
      }
    }, [constraintsEnabled]);

    const symbolKey = normalizeKey(resolvedSymbol || symbolInput);
    const quote = useMemo(() => {
      if (!symbolKey) return null;
      const direct = quotesBySymbol[symbolKey] || null;
      if (direct) return direct;
      const loose = normalizeSymbolLoose(resolvedSymbol || symbolInput);
      if (!loose) return null;
      for (const item of Object.values(quotesBySymbol)) {
        if (normalizeSymbolLoose(item?.symbol || '') === loose) return item;
      }
      return null;
    }, [quotesBySymbol, resolvedSymbol, symbolInput, symbolKey]);

    const filteredPositions = useMemo(() => {
      if (!symbolKey) return positions;
      return positions.filter((p) => normalizeKey(p.symbol) === symbolKey);
    }, [positions, symbolKey]);

    const filteredOrders = useMemo(() => {
      if (!symbolKey) return orders;
      return orders.filter((o) => normalizeKey(o.symbol) === symbolKey);
    }, [orders, symbolKey]);

    const quoteBid = useMemo(() => toNumber(quote?.bid), [quote]);
    const quoteAsk = useMemo(() => toNumber(quote?.ask), [quote]);
    const quoteMid = useMemo(() => toNumber(quote?.mid), [quote]);
    const quoteLast = useMemo(() => toNumber(quote?.last), [quote]);

    const quotePrice = useMemo(() => {
      if (quoteMid != null) return quoteMid;
      if (quoteLast != null) return quoteLast;
      if (quoteBid != null && quoteAsk != null) return (quoteBid + quoteAsk) / 2;
      return quoteBid ?? quoteAsk ?? null;
    }, [quoteAsk, quoteBid, quoteLast, quoteMid]);

    const quoteTs = useMemo(() => {
      const ts = toNumber(quote?.timestampMs);
      const fetched = toNumber(quote?.fetchedAtMs);
      const raw = Math.max(ts ?? 0, fetched ?? 0);
      if (!raw || raw <= 0) return null;
      return raw > 1e11 ? Math.floor(raw) : Math.floor(raw * 1000);
    }, [quote]);

    const quoteTickLabel = useMemo(() => {
      if (quotePrice == null || quoteTs == null) return null;
      return `Tick ${formatAge(quoteTs)}`;
    }, [quotePrice, quoteTs]);
    const quoteFresh = quoteTs != null && Date.now() - quoteTs <= 5000;
    const quoteSpread = useMemo(() => {
      if (quoteBid != null && quoteAsk != null) return quoteAsk - quoteBid;
      return toNumber(quote?.spread);
    }, [quote, quoteAsk, quoteBid]);
    const tvPriceValue = useMemo(() => toNumber(tvPrice), [tvPrice]);
    const tvSymbolKey = useMemo(() => normalizeSymbolLoose(tvSymbol), [tvSymbol]);
    const chartSymbolKey = useMemo(() => normalizeSymbolLoose(resolvedSymbol || symbolInput), [resolvedSymbol, symbolInput]);
    const activeProfileWatchers = useMemo(() => {
      const watchers = Array.isArray(setupWatchers) ? setupWatchers : [];
      let filtered = watchers.filter((watcher) => watcher && watcher.profileId);
      if (chartSymbolKey) {
        filtered = filtered.filter((watcher) => normalizeSymbolLoose(watcher.symbol) === chartSymbolKey);
      }
      return filtered
        .slice()
        .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))
        .slice(0, 6);
    }, [chartSymbolKey, setupWatchers]);
    const recentSetupSignals = useMemo(() => {
      const signals = Array.isArray(setupSignals) ? setupSignals : [];
      let filtered = signals;
      if (chartSymbolKey) {
        filtered = signals.filter((signal) => normalizeSymbolLoose(signal.symbol) === chartSymbolKey);
      }
      return filtered
        .slice()
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 5);
    }, [chartSymbolKey, setupSignals]);
    const tvMatchesSymbol = tvSymbolKey && chartSymbolKey && tvSymbolKey === chartSymbolKey;
    const tvAgeLabel = tvPriceUpdatedAtMs ? formatAge(tvPriceUpdatedAtMs) : '';
    const tvPriceFresh = tvPriceUpdatedAtMs != null && Date.now() - tvPriceUpdatedAtMs <= 30_000;
    const tvDelta =
      tvMatchesSymbol && tvPriceFresh && tvPriceValue != null && quotePrice != null
        ? quotePrice - tvPriceValue
        : null;
    const tvDeltaLabel =
      tvDelta != null && Number.isFinite(tvDelta) ? `${tvDelta >= 0 ? '+' : ''}${formatPrice(tvDelta)}` : '';
    const tvLine = useMemo(() => {
      if (!tvSymbol) return null;
      if (!tvMatchesSymbol) return `TV ${tvSymbol} (mismatch)`;
      if (tvPriceFresh && tvPriceValue != null) {
        const priceLabel = formatPrice(tvPriceValue);
        const diffLabel = tvDeltaLabel ? ` | diff ${tvDeltaLabel}` : '';
        const ageLabel = tvAgeLabel ? ` | ${tvAgeLabel}` : '';
        return `TV ${priceLabel}${diffLabel}${ageLabel}`;
      }
      return `TV ${tvSymbol} (${tvAgeLabel ? `${tvAgeLabel} old` : 'stale'})`;
    }, [tvAgeLabel, tvDeltaLabel, tvMatchesSymbol, tvPriceFresh, tvPriceValue, tvSymbol]);

    const baseLevels = useMemo(() => {
      const levels: OverlayLevel[] = [];
      const mid = quoteMid;
      const last = quoteLast;
      const bid = quoteBid;
      const ask = quoteAsk;
      const main = mid ?? last ?? (bid != null && ask != null ? (bid + ask) / 2 : bid ?? ask);
      if (main != null && Number.isFinite(main)) {
        levels.push({ id: 'quote_last', kind: 'quote', price: main, label: 'Last', color: COLORS.last, priority: 12 });
      }
      if (showConstraints && main != null && Number.isFinite(main)) {
        const minStop = instrumentStatus.minStopDistance;
        if (minStop != null && Number.isFinite(minStop) && minStop > 0) {
          levels.push({
            price: main + minStop,
            label: 'MinStop+',
            color: COLORS.constraint,
            style: 'dashed',
            priority: 4,
            kind: 'constraint'
          });
          levels.push({
            price: main - minStop,
            label: 'MinStop-',
            color: COLORS.constraint,
            style: 'dashed',
            priority: 4,
            kind: 'constraint'
          });
        }
      }

      if (showPositions) {
        for (const pos of filteredPositions) {
          const posId = pos.id ? String(pos.id) : '';
          const entry = toNumber(pos.entryPrice);
          if (entry != null && entry > 0) {
            levels.push({
              price: entry,
              label: `${pos.type} Entry`,
              color: COLORS.position,
              priority: 9,
              kind: 'position',
              id: posId ? `pos_${posId}_entry` : undefined,
              meta: posId
                ? { entity: 'position', id: posId, field: 'entry', side: pos.type, symbol: pos.symbol }
                : undefined,
              draggable: false
            });
          }
          const sl = toNumber(pos.stopLoss);
          if (sl != null && sl > 0) {
            levels.push({
              price: sl,
              label: `${pos.type} SL`,
              color: COLORS.down,
              style: 'dashed',
              priority: 8,
              kind: 'position',
              id: posId ? `pos_${posId}_sl` : undefined,
              meta: posId ? { entity: 'position', id: posId, field: 'sl', side: pos.type, symbol: pos.symbol } : undefined,
              draggable: true
            });
          }
          const tp = toNumber(pos.takeProfit);
          if (tp != null && tp > 0) {
            levels.push({
              price: tp,
              label: `${pos.type} TP`,
              color: COLORS.up,
              style: 'dashed',
              priority: 8,
              kind: 'position',
              id: posId ? `pos_${posId}_tp` : undefined,
              meta: posId ? { entity: 'position', id: posId, field: 'tp', side: pos.type, symbol: pos.symbol } : undefined,
              draggable: true
            });
          }
        }
      }

      if (showOrders) {
        for (const ord of filteredOrders) {
          const ordId = ord.id ? String(ord.id) : '';
          const price = toNumber(ord.price);
          if (price != null && price > 0) {
            levels.push({
              price,
              label: `${ord.type.toUpperCase()} ${ord.side}`,
              color: COLORS.order,
              priority: 6,
              kind: 'order',
              id: ordId ? `ord_${ordId}_price` : undefined,
              meta: ordId ? { entity: 'order', id: ordId, field: 'price', side: ord.side, symbol: ord.symbol } : undefined,
              draggable: true
            });
          }
          const sl = toNumber(ord.stopLoss);
          if (sl != null && sl > 0) {
            levels.push({
              price: sl,
              label: 'Order SL',
              color: COLORS.down,
              style: 'dashed',
              priority: 5,
              kind: 'order',
              id: ordId ? `ord_${ordId}_sl` : undefined,
              meta: ordId ? { entity: 'order', id: ordId, field: 'sl', side: ord.side, symbol: ord.symbol } : undefined,
              draggable: true
            });
          }
          const tp = toNumber(ord.takeProfit);
          if (tp != null && tp > 0) {
            levels.push({
              price: tp,
              label: 'Order TP',
              color: COLORS.up,
              style: 'dashed',
              priority: 5,
              kind: 'order',
              id: ordId ? `ord_${ordId}_tp` : undefined,
              meta: ordId ? { entity: 'order', id: ordId, field: 'tp', side: ord.side, symbol: ord.symbol } : undefined,
              draggable: true
            });
          }
        }
      }

      return levels;
    }, [
      filteredOrders,
      filteredPositions,
      instrumentStatus.minStopDistance,
      quoteAsk,
      quoteBid,
      quoteLast,
      quoteMid,
      showConstraints,
      showOrders,
      showPositions
    ]);

    const draggableLevels = useMemo(
      () => baseLevels.filter((level) => level.draggable && Number.isFinite(level.price)),
      [baseLevels]
    );

    const getPlotMeta = useCallback((frameId: string, source: 'frame' | 'fullscreen') => {
      if (source === 'fullscreen') return fullscreenPlotMetaRef.current;
      return plotMetaRef.current[frameId] || null;
    }, []);

    const getContainerForFrame = useCallback((frameId: string, source: 'frame' | 'fullscreen') => {
      if (source === 'fullscreen') return fullscreenContainerRef.current;
      return containerRefs.current[frameId] || null;
    }, []);

    const clientYToPrice = useCallback((clientY: number, meta: PlotMeta, container: HTMLDivElement) => {
      const rect = container.getBoundingClientRect();
      const rawY = clientY - rect.top;
      const yMin = meta.plot.y;
      const yMax = meta.plot.y + meta.plot.h;
      const clampedY = clamp(rawY, yMin, yMax);
      const price =
        meta.priceRange > 0 && meta.plot.h > 0
          ? meta.paddedMax - ((clampedY - meta.plot.y) / meta.plot.h) * meta.priceRange
          : meta.paddedMax;
      return { price, rawY, clampedY };
    }, []);

    const findDraggableLevel = useCallback(
      (meta: PlotMeta, rawY: number) => {
        if (draggableLevels.length === 0) return null;
        if (meta.plot.h <= 0) return null;
        const tolerance = 6;
        const priceRange = meta.priceRange || 1;
        let best: { level: OverlayLevel; dist: number } | null = null;
        for (const level of draggableLevels) {
          if (!Number.isFinite(level.price)) continue;
          const y = meta.plot.y + ((meta.paddedMax - level.price) / priceRange) * meta.plot.h;
          const dist = Math.abs(y - rawY);
          if (dist <= tolerance && (!best || dist < best.dist)) {
            best = { level, dist };
          }
        }
        return best?.level || null;
      },
      [draggableLevels]
    );

    const beginDrag = useCallback(
      (event: React.MouseEvent<HTMLDivElement>, frameId: string, source: 'frame' | 'fullscreen') => {
        if (event.button !== 0) return;
        const meta = getPlotMeta(frameId, source);
        const container = getContainerForFrame(frameId, source);
        if (!meta || !container) return;
        const { rawY } = clientYToPrice(event.clientY, meta, container);
        const level = findDraggableLevel(meta, rawY);
        if (!level) return;
        event.preventDefault();
        dragStateRef.current = {
          level,
          frameId,
          resolution: meta.resolution,
          source,
          container,
          meta,
          lastPrice: level.price,
          didMove: false
        };
        setDragPreview({
          ...level,
          kind: 'drag',
          style: 'dashed',
          priority: 30
        });
        setDragActive(true);
      },
      [clientYToPrice, findDraggableLevel, getContainerForFrame, getPlotMeta]
    );

    const handleChartClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>, frameId: string, source: 'frame' | 'fullscreen') => {
        if (skipClickRef.current) {
          skipClickRef.current = false;
          return;
        }
        if (!onPriceSelect || activePriceMode === 'off') return;
        const meta = getPlotMeta(frameId, source);
        const container = getContainerForFrame(frameId, source);
        if (!meta || !container) return;
        const { price } = clientYToPrice(event.clientY, meta, container);
        if (!Number.isFinite(price)) return;
        onPriceSelect({ price, frameId, resolution: meta.resolution, source, mode: activePriceMode });
      },
      [activePriceMode, clientYToPrice, getContainerForFrame, getPlotMeta, onPriceSelect]
    );

    useEffect(() => {
      if (!dragActive || !dragStateRef.current) return;
      const handleMove = (event: MouseEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState) return;
        const { meta, container } = dragState;
        const { price, rawY } = clientYToPrice(event.clientY, meta, container);
        const priceRange = meta.priceRange || 1;
        const lastY = meta.plot.y + ((meta.paddedMax - dragState.lastPrice) / priceRange) * meta.plot.h;
        if (Math.abs(rawY - lastY) > 2) {
          dragState.didMove = true;
        }
        dragState.lastPrice = price;
        setDragPreview({
          ...dragState.level,
          price,
          kind: 'drag',
          style: 'dashed',
          priority: 30
        });
      };
      const handleUp = (event: MouseEvent) => {
        const dragState = dragStateRef.current;
        dragStateRef.current = null;
        setDragPreview(null);
        setDragActive(false);
        if (!dragState) return;
        const { meta, container } = dragState;
        const { price } = clientYToPrice(event.clientY, meta, container);
        skipClickRef.current = dragState.didMove;
        if (dragState.didMove && onLevelUpdate && Number.isFinite(price)) {
          onLevelUpdate({
            levelId: dragState.level.id || '',
            price,
            frameId: dragState.frameId,
            resolution: dragState.resolution,
            source: dragState.source,
            meta: dragState.level.meta || undefined
          });
        }
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
    }, [clientYToPrice, dragActive, onLevelUpdate]);

    const updateFrameState = useCallback((id: string, patch: Partial<FrameState>) => {
      setFrameState((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || { bars: [], updatedAtMs: null, source: null, error: null, coverage: null, loading: false }),
          ...patch
        }
      }));
    }, []);

    const applyQuoteToFrames = useCallback(
      (price: number, ts: number) => {
        if (!Number.isFinite(price) || price <= 0) return;
        if (!Number.isFinite(ts) || ts <= 0) return;
        const barEvents: Array<{ symbol: string; resolution: string; bar: Candle; bars: Candle[]; updatedAtMs: number | null }> = [];
        setFrameState((prev) => {
          let changed = false;
          const next: Record<string, FrameState> = { ...prev };
          for (const frame of activeFrames) {
            const state = prev[frame.id];
            const bars = state?.bars;
            if (!bars || bars.length === 0) continue;
            const resMs = RESOLUTION_MS[frame.resolution] || 0;
            if (!resMs) continue;
            const bucket = Math.floor(ts / resMs) * resMs;
            const last = bars[bars.length - 1];
            if (!last || bucket < last.t) continue;
            let nextBars = bars;
            if (bucket === last.t) {
              const nextHigh = Math.max(last.h, price);
              const nextLow = Math.min(last.l, price);
              if (last.c === price && last.h === nextHigh && last.l === nextLow) continue;
              nextBars = [...bars.slice(0, -1), { ...last, c: price, h: nextHigh, l: nextLow }];
            } else {
              const open = last.c;
              const newBar = {
                t: bucket,
                o: open,
                h: Math.max(open, price),
                l: Math.min(open, price),
                c: price,
                v: null
              };
              nextBars = [...bars, newBar];
              const maxBars = Math.max(frame.lookbackBars, frame.displayBars);
              if (nextBars.length > maxBars) {
                nextBars = nextBars.slice(nextBars.length - maxBars);
              }
              if (onBarClose) {
                barEvents.push({
                  symbol: resolvedSymbol || symbolInput,
                  resolution: frame.resolution,
                  bar: last,
                  bars: nextBars,
                  updatedAtMs: ts
                });
              }
            }

            if (nextBars !== bars) {
              next[frame.id] = {
                ...state,
                bars: nextBars,
                updatedAtMs: Math.max(state?.updatedAtMs || 0, ts)
              };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        if (barEvents.length > 0 && onBarClose) {
          for (const evt of barEvents) {
            if (!evt.symbol) continue;
            onBarClose(evt);
          }
        }
      },
      [activeFrames, onBarClose, resolvedSymbol, symbolInput]
    );

    const refreshFrames = useCallback(
      async (force = false) => {
        if (!resolvedSymbol) return;
        if (!brokerHistoryAvailable) {
          for (const frame of activeFrames) {
            updateFrameState(frame.id, {
              loading: false,
              error: 'Broker history unavailable.'
            });
          }
          return;
        }
        if (!isConnected && !requestBroker && !(window as any)?.glass?.broker?.request) {
          for (const frame of activeFrames) {
            updateFrameState(frame.id, {
              loading: false,
              error: `Connect ${brokerLabelSafe} to load history.`
            });
          }
          return;
        }
        if (refreshInFlightRef.current) return;
        refreshInFlightRef.current = true;
        const token = refreshTokenRef.current + 1;
        refreshTokenRef.current = token;
        const now = Date.now();
        setLastRefreshAtMs(now);
        try {
          await Promise.all(
            activeFrames.map(async (frame) => {
              updateFrameState(frame.id, { loading: true, error: null });
              const resolutionMs = RESOLUTION_MS[frame.resolution] || 0;
              const lookbackMs = resolutionMs > 0 ? resolutionMs * frame.lookbackBars : 0;
              const from = lookbackMs > 0 ? now - lookbackMs : now - 7 * 24 * 60 * 60_000;
              const res = await brokerRequest('getHistorySeries', {
                symbol: resolvedSymbol,
                resolution: frame.resolution,
                from,
                to: now,
                aggregate: true,
                maxAgeMs: force ? 0 : frame.maxAgeMs
              });
              if (refreshTokenRef.current !== token) return;
              if (res?.ok && Array.isArray(res.bars)) {
                const bars = normalizeBars(res.bars).slice(-Math.max(frame.lookbackBars, frame.displayBars));
                updateFrameState(frame.id, {
                  bars,
                  updatedAtMs: res.fetchedAtMs || Date.now(),
                  source: res.source || null,
                  coverage: res.coverage ?? null,
                  error: null,
                  loading: false
                });
              } else {
                updateFrameState(frame.id, {
                  error: res?.error ? String(res.error) : 'Failed to load history.',
                  loading: false
                });
              }
            })
          );
          if (refreshTokenRef.current === token) {
            const live = lastQuoteRef.current;
            if (live && Number.isFinite(live.price) && Number.isFinite(live.ts)) {
              applyQuoteToFrames(live.price, live.ts);
            } else if (quotePrice != null) {
              const ts = quoteTs ?? Date.now();
              applyQuoteToFrames(quotePrice, ts);
            }
          }
        } finally {
          refreshInFlightRef.current = false;
        }
      },
      [
        activeFrames,
        applyQuoteToFrames,
        brokerLabelSafe,
        brokerHistoryAvailable,
        brokerRequest,
        isConnected,
        quotePrice,
        quoteTs,
        requestBroker,
        resolvedSymbol,
        updateFrameState
      ]
    );

    useEffect(() => {
      if (!resolvedSymbol) return;
      if (quotePrice == null) return;
      const ts = quoteTs ?? Date.now();
      const prev = lastQuoteRef.current;
      if (prev) {
        if (prev.price === quotePrice && Math.abs(ts - prev.ts) < 1000) return;
        if (ts - prev.ts < 200) return;
      }
      lastQuoteRef.current = { price: quotePrice, ts };
      applyQuoteToFrames(quotePrice, ts);
    }, [applyQuoteToFrames, quotePrice, quoteTs, resolvedSymbol]);

    useEffect(() => {
      if (!resolvedSymbol) return;
      const bridge = requireBridge('native_chart.refresh');
      if (!bridge.ok) return;
      void refreshFrames(true);
      const dispose = runtimeScheduler.registerTask({
        id: `native_chart.refresh.${String(resolvedSymbol).toLowerCase()}`,
        groupId: 'native_chart',
        intervalMs: 15000,
        jitterPct: 0.08,
        visibilityMode: 'foreground',
        priority: 'low',
        run: async () => {
          const guard = requireBridge('native_chart.refresh');
          if (!guard.ok) return;
          await refreshFrames(false);
        }
      });
      return () => dispose();
    }, [refreshFrames, resolvedSymbol, runtimeScheduler]);

    useEffect(() => {
      setFrameState(createInitialFrameState());
      lastQuoteRef.current = null;
    }, [resolvedSymbol]);

    const getContainerRef = useCallback(
      (id: string) => {
        if (!containerRefCallbacks.current[id]) {
          containerRefCallbacks.current[id] = (el: HTMLDivElement | null) => {
            containerRefs.current[id] = el;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const width = Math.max(1, Math.floor(rect.width));
            const height = Math.max(1, Math.floor(rect.height));
            updateSize(id, width, height);
          };
        }
        return containerRefCallbacks.current[id];
      },
      [updateSize]
    );

    const getCanvasRef = useCallback((id: string) => {
      if (!canvasRefCallbacks.current[id]) {
        canvasRefCallbacks.current[id] = (el: HTMLCanvasElement | null) => {
          canvasRefs.current[id] = el;
        };
      }
      return canvasRefCallbacks.current[id];
    }, []);

    useEffect(() => {
      if (typeof ResizeObserver === 'undefined') return;
      for (const observer of Object.values(resizeObserversRef.current)) {
        observer.disconnect();
      }
      resizeObserversRef.current = {};
      for (const frame of activeFrames) {
        const el = containerRefs.current[frame.id];
        if (!el || resizeObserversRef.current[frame.id]) continue;
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const rect = entry.contentRect;
            const width = Math.max(1, Math.floor(rect.width));
            const height = Math.max(1, Math.floor(rect.height));
            updateSize(frame.id, width, height);
          }
        });
        observer.observe(el);
        resizeObserversRef.current[frame.id] = observer;
      }
      return () => {
        for (const observer of Object.values(resizeObserversRef.current)) {
          observer.disconnect();
        }
        resizeObserversRef.current = {};
      };
    }, [activeFrames, updateSize]);

    const renderFrameToCanvas = useCallback(
      (frame: FrameConfig, canvas: HTMLCanvasElement, widthPx: number, heightPx: number, opts?: { isFullscreen?: boolean }) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const isFullscreen = opts?.isFullscreen === true;

        const width = Math.max(1, Math.floor(widthPx));
        const height = Math.max(1, Math.floor(heightPx));
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const targetW = Math.floor(width * dpr);
        const targetH = Math.floor(height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, width, height);

        const state = frameState[frame.id];
        const bars = state?.bars || [];
        if (bars.length < 2) {
          ctx.fillStyle = COLORS.textDim;
          ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
          const msg = state?.loading ? 'Loading broker history...' : 'No history yet.';
          ctx.fillText(msg, 14, 22);
          if (!isConnected) {
            ctx.fillText(`Connect ${brokerLabelSafe} to load history.`, 14, 40);
          }
          if (state?.error) {
            ctx.fillStyle = '#fca5a5';
            ctx.fillText(state.error, 14, 58);
          }
          return;
        }

        const visibleBars = bars.slice(-frame.displayBars);
        if (visibleBars.length === 0) return;
        const sessionBlocks = showSessions ? buildSessionBlocks(visibleBars) : [];
        const setupLevels: OverlayLevel[] = [];
        const reviewLevels: OverlayLevel[] = [];
        const patternLevels: OverlayLevel[] = [];
        if (showSetups && Array.isArray(setupSignals) && setupSignals.length > 0) {
          const symbolKey = normalizeSymbolLoose(resolvedSymbol || symbolInput);
          const tfKey = normalizeTimeframeKey(frame.resolution);
          const latestByWatcher = new Map<string, SetupSignal>();
          for (const signal of setupSignals) {
            if (!signal) continue;
            if (symbolKey && normalizeSymbolLoose(signal.symbol) !== symbolKey) continue;
            if (tfKey && normalizeTimeframeKey(signal.timeframe) !== tfKey) continue;
            const watcherId = String(signal.payload?.watcherId || '').trim();
            if (!watcherId) continue;
            const prev = latestByWatcher.get(watcherId);
            if (!prev || (signal.ts || 0) > (prev.ts || 0)) {
              latestByWatcher.set(watcherId, signal);
            }
          }
          const recentSignals = Array.from(latestByWatcher.values())
            .sort((a, b) => (b.ts || 0) - (a.ts || 0))
            .slice(0, 2);
          for (const signal of recentSignals) {
            const status = resolveSignalStatus(signal);
            const labelBase = `Setup ${String(signal.payload?.strategy || '').replace(/_/g, ' ')} ${formatSignalStatus(status)}`.trim();
            const details = signal.payload?.details || null;
            const entry = Number(details?.entryPrice);
            const stop = Number(details?.stopLoss);
            const tp = Number(details?.takeProfit);
            if (Number.isFinite(entry)) {
              setupLevels.push({ price: entry, label: `${labelBase} entry`, color: COLORS.setupEntry, priority: 20, kind: 'setup' });
            }
            if (Number.isFinite(stop)) {
              setupLevels.push({ price: stop, label: `${labelBase} sl`, color: COLORS.setupStop, style: 'dashed', priority: 18, kind: 'setup' });
            }
            if (Number.isFinite(tp)) {
              setupLevels.push({ price: tp, label: `${labelBase} tp`, color: COLORS.setupTp, style: 'dashed', priority: 18, kind: 'setup' });
            }
          }
        }
        if (showReviews && Array.isArray(reviewAnnotations) && reviewAnnotations.length > 0) {
          const symbolKey = normalizeSymbolLoose(resolvedSymbol || symbolInput);
          const tfKey = normalizeTimeframeKey(frame.resolution);
          for (const annotation of reviewAnnotations) {
            if (!annotation || !Array.isArray(annotation.levels)) continue;
            if (symbolKey && normalizeSymbolLoose(annotation.symbol) !== symbolKey) continue;
            if (annotation.timeframe && tfKey && normalizeTimeframeKey(annotation.timeframe) !== tfKey) continue;
            for (const level of annotation.levels) {
              const price = Number(level?.price);
              if (!Number.isFinite(price)) continue;
              reviewLevels.push({
                price,
                label: level.label || 'Review',
                color: level.color || COLORS.setupEntry,
                style: level.style,
                priority: level.priority ?? 22,
                kind: 'review'
              });
            }
          }
        }
        if (showPatterns && Array.isArray(patternEvents) && patternEvents.length > 0) {
          const symbolKey = normalizeSymbolLoose(resolvedSymbol || symbolInput);
          const tfKey = normalizeTimeframeKey(frame.resolution);
          const minTs = visibleBars[0]?.t ?? null;
          const maxTs = visibleBars[visibleBars.length - 1]?.t ?? null;
          const latestByType = new Map<string, PatternEvent>();
          const sorted = patternEvents
            .filter((evt) => {
              if (!evt || !evt.type) return false;
              if (symbolKey && normalizeSymbolLoose(evt.symbol) !== symbolKey) return false;
              if (tfKey && normalizeTimeframeKey(evt.timeframe) !== tfKey) return false;
              if (minTs != null && (evt.ts || 0) < minTs) return false;
              if (maxTs != null && (evt.ts || 0) > maxTs) return false;
              return true;
            })
            .sort((a, b) => (b.ts || 0) - (a.ts || 0))
            .slice(0, 24);
          for (const evt of sorted) {
            if (!evt?.type) continue;
            if (latestByType.has(evt.type)) continue;
            latestByType.set(evt.type, evt);
            if (latestByType.size >= 8) break;
          }
          for (const evt of latestByType.values()) {
            const levels = buildPatternLevels(evt);
            if (levels.length > 0) patternLevels.push(...levels);
          }
        }

        const padding = {
          top: 18,
          right: 64,
          bottom: 22,
          left: 44
        };
        const plot = {
          x: padding.left,
          y: padding.top,
          w: Math.max(1, width - padding.left - padding.right),
          h: Math.max(1, height - padding.top - padding.bottom)
        };
        const barW = plot.w / visibleBars.length;
        const bodyW = Math.max(1, barW * 0.65);

        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const bar of visibleBars) {
          if (Number.isFinite(bar.l)) min = Math.min(min, bar.l);
          if (Number.isFinite(bar.h)) max = Math.max(max, bar.h);
        }
        for (const level of baseLevels) {
          if (Number.isFinite(level.price)) {
            min = Math.min(min, level.price);
            max = Math.max(max, level.price);
          }
        }
        for (const level of setupLevels) {
          if (Number.isFinite(level.price)) {
            min = Math.min(min, level.price);
            max = Math.max(max, level.price);
          }
        }
        for (const level of reviewLevels) {
          if (Number.isFinite(level.price)) {
            min = Math.min(min, level.price);
            max = Math.max(max, level.price);
          }
        }
        for (const level of patternLevels) {
          if (Number.isFinite(level.price)) {
            min = Math.min(min, level.price);
            max = Math.max(max, level.price);
          }
        }

        const range = max - min;
        const pad = range > 0 ? range * 0.08 : Math.max(1, Math.abs(max) * 0.01);
        const paddedMin = min - pad;
        const paddedMax = max + pad;
        const priceRange = paddedMax - paddedMin || 1;
        const priceToY = (price: number) => plot.y + (paddedMax - price) / priceRange * plot.h;

        const plotMeta: PlotMeta = {
          frameId: frame.id,
          resolution: frame.resolution,
          plot,
          paddedMin,
          paddedMax,
          priceRange
        };
        if (isFullscreen) {
          fullscreenPlotMetaRef.current = plotMeta;
        } else {
          plotMetaRef.current[frame.id] = plotMeta;
        }

        if (showSessions && instrumentStatus.sessionOpen === false) {
          ctx.save();
          ctx.fillStyle = 'rgba(248,113,113,0.08)';
          ctx.fillRect(plot.x, plot.y, plot.w, plot.h);
          ctx.fillStyle = 'rgba(248,113,113,0.8)';
          ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
          ctx.fillText('SESSION CLOSED', plot.x + 8, plot.y + 14);
          ctx.restore();
        }

        if (showSessions && sessionBlocks.length > 0) {
          ctx.save();
          ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
          for (const block of sessionBlocks) {
            const x = plot.x + block.startIndex * barW;
            const w = Math.max(1, (block.endIndex - block.startIndex + 1) * barW);
            ctx.fillStyle = block.style.fill;
            ctx.fillRect(x, plot.y, w, plot.h);
            if (w > 30) {
              ctx.fillStyle = COLORS.textDim;
              ctx.fillText(block.style.label, x + 4, plot.y + 12);
            }
          }
          ctx.restore();
        }

        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i += 1) {
          const y = plot.y + (plot.h / 4) * i;
          ctx.beginPath();
          ctx.moveTo(plot.x, y);
          ctx.lineTo(plot.x + plot.w, y);
          ctx.stroke();
        }
        for (let i = 0; i <= 6; i += 1) {
          const x = plot.x + (plot.w / 6) * i;
          ctx.beginPath();
          ctx.moveTo(x, plot.y);
          ctx.lineTo(x, plot.y + plot.h);
          ctx.stroke();
        }

        if (showSessions) {
          let lastDay = '';
          ctx.save();
          ctx.strokeStyle = COLORS.gridStrong;
          ctx.setLineDash([4, 4]);
          visibleBars.forEach((bar, idx) => {
            const dayKey = new Date(bar.t).toISOString().slice(0, 10);
            if (!lastDay) lastDay = dayKey;
            if (dayKey !== lastDay) {
              const x = plot.x + idx * barW;
              ctx.beginPath();
              ctx.moveTo(x, plot.y);
              ctx.lineTo(x, plot.y + plot.h);
              ctx.stroke();
              lastDay = dayKey;
            }
          });
          ctx.restore();
        }

        if (showLiveQuote && quoteBid != null && quoteAsk != null && quoteAsk >= quoteBid) {
          const yBid = priceToY(quoteBid);
          const yAsk = priceToY(quoteAsk);
          const top = Math.min(yBid, yAsk);
          const bandH = Math.max(1, Math.abs(yAsk - yBid));
          ctx.fillStyle = 'rgba(34,211,238,0.08)';
          ctx.fillRect(plot.x, top, plot.w, bandH);
        }

        if (showIndicators) {
          const atr = computeAtr(visibleBars, 14);
          const lastClose = visibleBars[visibleBars.length - 1]?.c;
          if (atr != null && Number.isFinite(lastClose)) {
            const yTop = priceToY(lastClose + atr);
            const yBot = priceToY(lastClose - atr);
            ctx.fillStyle = 'rgba(34,211,238,0.08)';
            ctx.fillRect(plot.x, Math.min(yTop, yBot), plot.w, Math.abs(yBot - yTop));
          }
        }

        for (let i = 0; i < visibleBars.length; i += 1) {
          const bar = visibleBars[i];
          const x = plot.x + i * barW + barW / 2;
          const yOpen = priceToY(bar.o);
          const yClose = priceToY(bar.c);
          const yHigh = priceToY(bar.h);
          const yLow = priceToY(bar.l);
          const isUp = bar.c >= bar.o;
          ctx.strokeStyle = COLORS.wick;
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.lineTo(x, yLow);
          ctx.stroke();

          const top = Math.min(yOpen, yClose);
          const heightBody = Math.max(1, Math.abs(yClose - yOpen));
          ctx.fillStyle = isUp ? COLORS.up : COLORS.down;
          ctx.fillRect(x - bodyW / 2, top, bodyW, heightBody);
        }

        if (showLiveQuote && quotePrice != null && Number.isFinite(quotePrice)) {
          const lastIndex = visibleBars.length - 1;
          const x = plot.x + lastIndex * barW + barW / 2;
          const y = priceToY(quotePrice);
          const ageMs = quoteTs != null ? Math.max(0, Date.now() - quoteTs) : null;
          const fresh = ageMs != null && ageMs <= 5000;
          ctx.fillStyle = fresh ? COLORS.last : COLORS.textDim;
          ctx.beginPath();
          ctx.arc(x, y, fresh ? 3.5 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (showIndicators) {
          const smaFast = computeSma(bars, 20);
          const smaSlow = computeSma(bars, 50);
          const startIndex = Math.max(0, bars.length - visibleBars.length);

          const drawLine = (points: Array<{ index: number; value: number }>, color: string) => {
            const filtered = points.filter((p) => p.index >= startIndex);
            if (filtered.length < 2) return;
            ctx.beginPath();
            filtered.forEach((point, idx) => {
              const localIndex = point.index - startIndex;
              const x = plot.x + localIndex * barW + barW / 2;
              const y = priceToY(point.value);
              if (idx === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([]);
            ctx.stroke();
          };

          drawLine(smaFast, COLORS.smaFast);
          drawLine(smaSlow, COLORS.smaSlow);

          const smaFastValue = smaFast.length ? smaFast[smaFast.length - 1].value : null;
          const smaSlowValue = smaSlow.length ? smaSlow[smaSlow.length - 1].value : null;
          const atr = computeAtr(visibleBars, 14);
          const rsi = computeRsi(visibleBars, 14);
          const lastClose = visibleBars[visibleBars.length - 1]?.c;
          const atrPct =
            atr != null && lastClose != null && Number.isFinite(lastClose) && lastClose !== 0
              ? (atr / lastClose) * 100
              : null;

          const indicatorParts: string[] = [];
          if (smaFastValue != null) indicatorParts.push(`SMA20 ${formatPrice(smaFastValue)}`);
          if (smaSlowValue != null) indicatorParts.push(`SMA50 ${formatPrice(smaSlowValue)}`);
          if (atr != null) indicatorParts.push(`ATR14 ${formatPrice(atr)}`);
          if (atrPct != null && Number.isFinite(atrPct)) indicatorParts.push(`Vol ${atrPct.toFixed(2)}%`);
          if (rsi != null) indicatorParts.push(`RSI14 ${rsi.toFixed(1)}`);

          if (indicatorParts.length > 0) {
            const label = indicatorParts.join(' | ');
            const infoY = Math.max(10, plot.y - 6);
            ctx.fillStyle = COLORS.textDim;
            ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
            ctx.fillText(label, plot.x, infoY);
          }
        }

        const levels: OverlayLevel[] = [...baseLevels, ...setupLevels, ...reviewLevels, ...patternLevels];
        if (dragPreview && Number.isFinite(dragPreview.price)) {
          levels.push(dragPreview);
        }
        if (showRanges && visibleBars.length > 5) {
          const lookback = Math.min(50, visibleBars.length);
          const subset = visibleBars.slice(-lookback);
          const rangeHigh = Math.max(...subset.map((b) => b.h));
          const rangeLow = Math.min(...subset.map((b) => b.l));
          if (Number.isFinite(rangeHigh)) {
            levels.push({
              price: rangeHigh,
              label: 'Range H',
              color: COLORS.range,
              style: 'dashed',
              priority: 3,
              kind: 'range'
            });
          }
          if (Number.isFinite(rangeLow)) {
            levels.push({
              price: rangeLow,
              label: 'Range L',
              color: COLORS.range,
              style: 'dashed',
              priority: 3,
              kind: 'range'
            });
          }
        }

        if (showSessions && sessionBlocks.length > 0) {
          const lastBlock = sessionBlocks[sessionBlocks.length - 1];
          const subset = visibleBars.slice(lastBlock.startIndex, lastBlock.endIndex + 1);
          if (subset.length >= 3) {
            const sessionHigh = Math.max(...subset.map((b) => b.h));
            const sessionLow = Math.min(...subset.map((b) => b.l));
            if (Number.isFinite(sessionHigh)) {
              levels.push({
                price: sessionHigh,
                label: `${lastBlock.style.label} H`,
                color: lastBlock.style.line,
                style: 'dashed',
                priority: 2,
                kind: 'session'
              });
            }
            if (Number.isFinite(sessionLow)) {
              levels.push({
                price: sessionLow,
                label: `${lastBlock.style.label} L`,
                color: lastBlock.style.line,
                style: 'dashed',
                priority: 2,
                kind: 'session'
              });
            }
          }
        }

        if (!levels.some((level) => level.label === 'Last')) {
          const lastClose = visibleBars[visibleBars.length - 1]?.c;
          if (lastClose != null && Number.isFinite(lastClose)) {
            levels.push({ price: lastClose, label: 'Close', color: COLORS.last, priority: 7 });
          }
        }

        const forcedLevels = levels.filter((level) => level.kind === 'position' || level.kind === 'order' || level.kind === 'drag');
        const selectableLevels = levels.filter((level) => !forcedLevels.includes(level));

        const sorted = selectableLevels
          .filter((level) => Number.isFinite(level.price))
          .sort((a, b) => (b.priority || 0) - (a.priority || 0));

        const selected: OverlayLevel[] = [];
        const tolerance = priceRange * 0.003;
        for (const level of sorted) {
          if (selected.length >= 6) break;
          if (selected.some((s) => Math.abs(s.price - level.price) < tolerance)) continue;
          selected.push(level);
        }

        ctx.save();
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        const deduped: OverlayLevel[] = [];
        const seen = new Set<string>();
        for (const level of [...forcedLevels, ...selected]) {
          const key = level.id || `${level.label}:${level.price}:${level.kind || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(level);
        }

        for (const level of deduped) {
          const y = priceToY(level.price);
          ctx.setLineDash(level.style === 'dashed' ? [4, 4] : []);
          ctx.strokeStyle = level.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(plot.x, y);
          ctx.lineTo(plot.x + plot.w, y);
          ctx.stroke();

          const label = `${level.label} ${formatPrice(level.price)}`;
          const textW = ctx.measureText(label).width;
          const textX = plot.x + plot.w + 6;
          const clampedY = clamp(y, plot.y + 10, plot.y + plot.h - 6);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(textX - 2, clampedY - 8, textW + 4, 12);
          ctx.fillStyle = level.color;
          ctx.fillText(label, textX, clampedY + 2);
        }
        ctx.restore();

        ctx.fillStyle = COLORS.textDim;
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        for (let i = 0; i <= 4; i += 1) {
          const price = paddedMax - (priceRange / 4) * i;
          const y = plot.y + (plot.h / 4) * i;
          ctx.fillText(formatPrice(price), plot.x + plot.w + 6, y + 3);
        }

        for (let i = 0; i <= 4; i += 1) {
          const idx = Math.floor((i / 4) * (visibleBars.length - 1));
          const bar = visibleBars[idx];
          if (!bar) continue;
          const label = formatTimeLabel(bar.t, frame.resolution);
          const x = plot.x + idx * barW + barW / 2;
          const textW = ctx.measureText(label).width;
          ctx.fillText(label, x - textW / 2, plot.y + plot.h + 14);
        }
      },
        [
          baseLevels,
          brokerLabelSafe,
          dragPreview,
          frameState,
          instrumentStatus.sessionOpen,
          isConnected,
          quoteAsk,
          quoteBid,
          quotePrice,
          quoteTs,
          resolvedSymbol,
          setupSignals,
          showIndicators,
          showLiveQuote,
          showPatterns,
          showRanges,
          showSessions,
          showSetups,
          showReviews,
          reviewAnnotations,
          patternEvents,
          symbolInput
        ]
      );

    const drawFrame = useCallback(
      (frame: FrameConfig) => {
        const canvas = canvasRefs.current[frame.id];
        const size = sizes[frame.id];
        if (!canvas || !size) return;
        renderFrameToCanvas(frame, canvas, size.width, size.height);
      },
      [renderFrameToCanvas, sizes]
    );

    useEffect(() => {
      for (const frame of activeFrames) {
        drawFrame(frame);
      }
    }, [activeFrames, drawFrame, frameState, sizes, showIndicators, showLiveQuote, showOrders, showPositions, showRanges, showSessions, showReviews, showSetups]);

    useEffect(() => {
      if (!fullscreenFrameId) return;
      const frame = fullscreenFrame;
      const canvas = fullscreenCanvasRef.current;
      if (!frame || !canvas) return;
      const width = fullscreenSize.width;
      const height = fullscreenSize.height;
      if (!width || !height) return;
      renderFrameToCanvas(frame, canvas, width, height, { isFullscreen: true });
    }, [fullscreenFrame, fullscreenFrameId, fullscreenSize, renderFrameToCanvas]);

    useEffect(() => {
      if (!fullscreenFrameId) return;
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setFullscreenFrameId(null);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [fullscreenFrameId]);

    useEffect(() => {
      if (!fullscreenFrameId) return;
      if (!fullscreenFrame) return;
      const el = fullscreenContainerRef.current;
      if (!el) return;
      const update = () => {
        const rect = el.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        setFullscreenSize({ width, height });
      };
      update();
      if (typeof ResizeObserver === 'undefined') return;
      if (fullscreenResizeObserverRef.current) fullscreenResizeObserverRef.current.disconnect();
      fullscreenResizeObserverRef.current = new ResizeObserver(() => update());
      fullscreenResizeObserverRef.current.observe(el);
      return () => {
        if (fullscreenResizeObserverRef.current) fullscreenResizeObserverRef.current.disconnect();
        fullscreenResizeObserverRef.current = null;
      };
    }, [fullscreenFrame, fullscreenFrameId]);

    useEffect(() => {
      if (!fullscreenFrameId) return;
      if (activeFrameIds.includes(fullscreenFrameId)) return;
      setFullscreenFrameId(null);
    }, [activeFrameIds, fullscreenFrameId]);

    useEffect(() => {
      if (!fullscreenFrameId) return;
      if (typeof document === 'undefined') return;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }, [fullscreenFrameId]);

    useEffect(() => {
      onFullscreenChange?.(!!fullscreenFrameId);
    }, [fullscreenFrameId, onFullscreenChange]);

    useEffect(() => {
      return () => {
        onFullscreenChange?.(false);
      };
    }, [onFullscreenChange]);

    const fullscreenOverlay = fullscreenFrame ? (
      <div className="fixed inset-0 z-[9999] bg-black/95 text-gray-100">
        <div className="flex flex-col h-full w-full">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/70">
            <div className="flex items-center gap-2 text-[11px] font-mono text-gray-300">
              <span className="text-cyan-200 font-semibold">{fullscreenFrame.label}</span>
              <span className="text-gray-500">{fullscreenFrame.resolution}</span>
              {resolvedSymbol && <span className="text-gray-400">{resolvedSymbol}</span>}
              <span className="text-gray-600">Esc to exit</span>
            </div>
            <button
              type="button"
              onClick={() => {
                runActionOr('chart.fullscreen.toggle', { enabled: false });
                setFullscreenFrameId(null);
              }}
              className="px-3 py-1.5 rounded border border-white/10 text-gray-200 hover:bg-white/10 text-[11px] font-mono"
              title="Exit full screen"
            >
              <span className="inline-flex items-center gap-1">
                <Minimize2 size={12} />
                Exit Full Screen
              </span>
            </button>
          </div>
          <div
            ref={fullscreenContainerRef}
            onMouseDown={(event) => beginDrag(event, fullscreenFrame.id, 'fullscreen')}
            onClick={(event) => handleChartClick(event, fullscreenFrame.id, 'fullscreen')}
            className={`relative flex-1 bg-black ${
              activePriceMode !== 'off' ? 'cursor-crosshair' : 'cursor-default'
            }`}
          >
            <canvas ref={fullscreenCanvasRef} className="absolute inset-0 w-full h-full" />
          </div>
        </div>
      </div>
    ) : null;

    const captureSnapshot = useCallback(() => {
      const entries = activeFrames.map((frame) => {
        const canvas = canvasRefs.current[frame.id];
        const size = sizes[frame.id];
        const state = frameState[frame.id];
        if (!canvas || !size) return null;
        if (!state?.bars || state.bars.length === 0) return null;
        return {
          frame,
          canvas,
          width: size.width,
          height: size.height,
          bars: state.bars.length,
          updatedAtMs: state.updatedAtMs
        };
      }).filter(Boolean) as Array<{
        frame: FrameConfig;
        canvas: HTMLCanvasElement;
        width: number;
        height: number;
        bars: number;
        updatedAtMs: number | null;
      }>;

      if (entries.length === 0) return null;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const headerH = 28;
      const labelH = 18;
      const gap = 12;
      const sidePad = 10;
      const width = Math.max(...entries.map((e) => e.width)) + sidePad * 2;
      const totalHeight =
        headerH +
        entries.reduce((sum, entry) => sum + labelH + entry.height, 0) +
        gap * (entries.length - 1) +
        6;

      const out = document.createElement('canvas');
      out.width = Math.floor(width * dpr);
      out.height = Math.floor(totalHeight * dpr);
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, width, totalHeight);

      const title = `Native Chart ${resolvedSymbol || symbolInput}`;
      ctx.fillStyle = COLORS.text;
      ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.fillText(title.trim(), 12, 18);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.fillText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), width - 120, 18);

      let y = headerH;
      for (const entry of entries) {
        const label = `${entry.frame.label} | ${entry.bars} bars | updated ${formatAge(entry.updatedAtMs)}`;
        ctx.fillStyle = COLORS.textDim;
        ctx.fillText(label, 12, y + 12);
        y += labelH;
        const x = Math.round((width - entry.width) / 2);
        ctx.drawImage(entry.canvas, x, y, entry.width, entry.height);
        y += entry.height + gap;
      }

      const dataUrl = out.toDataURL('image/jpeg', 0.82);
      lastSnapshotRef.current = dataUrl;
      return dataUrl;
    }, [activeFrames, frameState, resolvedSymbol, sizes, symbolInput]);

    const captureFrameSnapshot = useCallback((frameId: string) => {
      const canvas = canvasRefs.current[frameId];
      const state = frameState[frameId];
      if (!canvas || !state?.bars || state.bars.length === 0) return null;
      try {
        return canvas.toDataURL('image/jpeg', 0.9);
      } catch {
        return null;
      }
    }, [frameState]);

    const meta: NativeChartMeta = useMemo(() => {
      const frames: NativeChartFrameMeta[] = activeFrames.map((frame) => {
        const state = frameState[frame.id];
        return {
          resolution: frame.resolution,
          label: frame.label,
          bars: state?.bars?.length || 0,
          updatedAtMs: state?.updatedAtMs || null
        };
      });
      const latest = frames.reduce((acc, frame) => Math.max(acc, frame.updatedAtMs || 0), 0);
      return {
        symbol: resolvedSymbol || symbolInput,
        updatedAtMs: latest > 0 ? latest : null,
        frames
      };
    }, [activeFrames, frameState, resolvedSymbol, symbolInput]);

    const handleCaptureAll = useCallback(() => {
      const snapshot = captureSnapshot();
      if (!snapshot) {
        setCaptureNote('No chart data to capture yet.');
        return;
      }
      lastSnapshotRef.current = snapshot;
      setLastCaptureAtMs(Date.now());
      setCaptureNote('Snapshot captured for AI context.');
    }, [captureSnapshot]);

    const handleSendBottomChartToChat = useCallback(() => {
      const bottomFrame = activeFrames.length > 0 ? activeFrames[activeFrames.length - 1] : null;
      if (!bottomFrame) {
        setCaptureNote('No chart frame available to capture.');
        return;
      }
      const dataUrl = captureFrameSnapshot(bottomFrame.id);
      if (!dataUrl) {
        setCaptureNote('Bottom chart not ready yet.');
        return;
      }
      const symbol = String(resolvedSymbol || symbolInput || '').trim();
      const timeframes = activeFrames.map((frame) => frame.id).filter(Boolean);
      const label = `${symbol || 'Chart'} ${bottomFrame.label}`;
      const tfLabel = timeframes.length > 0 ? ` (${timeframes.join('/')})` : '';
      const text = `Analyze this chart snapshot${tfLabel}. Use the latest chart engine bars.`;
      runActionOr(
        'chat.send',
        { channel: 'chart', text, image: dataUrl, symbol, timeframes },
        () => {
          const detail = { channel: 'chart', dataUrl, label };
          try {
            window.dispatchEvent(new CustomEvent('glass_chat_attachment', { detail }));
          } catch {
            // ignore dispatch failures
          }
        }
      );
      setLastCaptureAtMs(Date.now());
      setCaptureNote(`Sent ${bottomFrame.label} chart to Chart Chat with bars.`);
    }, [activeFrames, captureFrameSnapshot, resolvedSymbol, runActionOr, symbolInput]);

    const handleManualRefresh = useCallback(() => {
      refreshFrames(true);
    }, [refreshFrames]);

    useImperativeHandle(
      ref,
      () => ({
        captureSnapshot,
        getMeta: () => meta,
        focusSymbol,
        ensureFrameActive,
        setShowIndicators: (enabled: boolean) => setShowIndicators(Boolean(enabled)),
        setShowLiveQuote: (enabled: boolean) => setShowLiveQuote(Boolean(enabled)),
        setShowRanges: (enabled: boolean) => setShowRanges(Boolean(enabled)),
        setShowSetups: (enabled: boolean) => setShowSetups(Boolean(enabled)),
        setShowReviews: (enabled: boolean) => setShowReviews(Boolean(enabled)),
        setShowPatterns: (enabled: boolean) => setShowPatterns(Boolean(enabled)),
        setShowSessions: (enabled: boolean) => setShowSessions(Boolean(enabled)),
        setShowConstraints: (enabled: boolean) => setShowConstraints(Boolean(enabled)),
        setShowPositions: (enabled: boolean) => setShowPositions(Boolean(enabled)),
        setShowOrders: (enabled: boolean) => setShowOrders(Boolean(enabled)),
        toggleFrame,
        setActiveFrames: (frameIds: string[]) => {
          const normalized = Array.isArray(frameIds)
            ? frameIds.map((id) => resolveFrameId(id)).filter(Boolean)
            : [];
          const unique = Array.from(new Set(normalized));
          if (unique.length === 0) return;
          const ordered = FRAME_PRESETS.map((frame) => frame.id).filter((id) => unique.includes(id));
          const next = ordered.slice(0, MAX_ACTIVE_FRAMES);
          setActiveFrameIds((prev) => (prev.join('|') === next.join('|') ? prev : next));
        },
        refresh: handleManualRefresh,
        captureAll: handleCaptureAll
      }),
      [
        captureSnapshot,
        focusSymbol,
        ensureFrameActive,
        handleCaptureAll,
        handleManualRefresh,
        meta,
        resolveFrameId,
        toggleFrame
      ]
    );

    useEffect(() => {
      if (!captureNote) return;
      const t = window.setTimeout(() => setCaptureNote(null), 2800);
      return () => window.clearTimeout(t);
    }, [captureNote]);

    const quoteAge = formatAge(quoteTs ?? null);
    const spread = quoteSpread != null && Number.isFinite(quoteSpread) ? formatPrice(quoteSpread) : '--';
    const mid = quoteMid != null ? formatPrice(quoteMid) : '--';
    const bid = quoteBid != null ? formatPrice(quoteBid) : '--';
    const ask = quoteAsk != null ? formatPrice(quoteAsk) : '--';
    const sessionLabel =
      instrumentStatus.sessionLabel ||
      (instrumentStatus.sessionOpen == null ? 'UNKNOWN' : instrumentStatus.sessionOpen ? 'OPEN' : 'CLOSED');
    const sessionClass =
      instrumentStatus.sessionOpen == null
        ? 'text-gray-400'
        : instrumentStatus.sessionOpen
          ? 'text-green-300'
          : 'text-red-300';
    const minStopText = instrumentStatus.minStopDistance != null ? formatPrice(instrumentStatus.minStopDistance) : '--';
    const priceStepText = instrumentStatus.priceStep != null ? formatPrice(instrumentStatus.priceStep) : '--';
    const constraintAge = instrumentStatus.fetchedAtMs ? formatAge(instrumentStatus.fetchedAtMs) : '--';
    const constraintsMissing =
      instrumentStatus.minStopDistance == null &&
      instrumentStatus.priceStep == null &&
      instrumentStatus.sessionOpen == null &&
      !instrumentStatus.sessionLabel;
    const constraintHint =
      !constraintsEnabled
        ? `${brokerLabelSafe} constraints are not available in this view.`
        : hasDeveloperApiKey === false
          ? `Add a ${brokerLabelSafe} developer API key to unlock constraints.`
          : 'Constraints unavailable for this symbol.';

    return (
      <div className="flex flex-col h-full w-full text-gray-200 bg-[#050505]">
        <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-cyan-900/20 to-black">
          <div className="flex items-center gap-2 text-cyan-300 text-xs uppercase tracking-wider font-bold">
            <BarChart2 size={14} />
            <span>Native Chart</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-gray-200">
              Beta
            </span>
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                isConnected ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'
              }`}
            >
              {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {onOpenAcademy && (
                <button
                  type="button"
                  onClick={onOpenAcademy}
                  className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Open Academy"
                >
                  <BookOpen size={14} />
                </button>
              )}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Open Settings"
                >
                  <Settings size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleResolve(symbolInput);
                }
              }}
              placeholder="Symbol (e.g. EURUSD)"
              className="flex-1 min-w-[200px] bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-cyan-500/50 transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => handleResolve(activeSymbol || '')}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-gray-200 text-[11px] font-semibold transition-colors"
            >
              Use Active
            </button>
            <button
              type="button"
              disabled={isResolving}
              onClick={() => handleResolve(symbolInput)}
              className="px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-100 text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResolving ? 'Resolving...' : 'Set Symbol'}
            </button>
          </div>

          <div className="mt-2 text-[10px] text-gray-500 font-mono">
            {resolvedSymbol ? `Symbol: ${resolvedSymbol}` : 'No symbol selected'}
            {resolvedSymbol && resolvedAtRef.current ? ` | Updated ${formatAge(resolvedAtRef.current)} ago` : ''}
            {lastRefreshAtMs ? ` | Refresh ${formatAge(lastRefreshAtMs)} ago` : ''}
          </div>
          {resolveNote && (
            <div className="mt-2 text-[10px] text-yellow-300/90 font-mono">{resolveNote}</div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono text-gray-300">
            <button
              type="button"
              onClick={() => runActionOr('chart.show.indicators.set', { enabled: !showIndicators }, () => setShowIndicators((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showIndicators ? 'border-cyan-400/40 text-cyan-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Indicators
            </button>
            <button
              type="button"
              onClick={() => runActionOr('chart.show.live_quote.set', { enabled: !showLiveQuote }, () => setShowLiveQuote((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showLiveQuote ? 'border-cyan-400/40 text-cyan-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Live Tick
            </button>
            {showLiveQuote && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-300" />
                <span>Last</span>
                <span className="inline-block w-3 h-2 rounded-sm bg-cyan-400/20 border border-cyan-400/30" />
                <span>Spread</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => runActionOr('chart.show.ranges.set', { enabled: !showRanges }, () => setShowRanges((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showRanges ? 'border-cyan-400/40 text-cyan-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Ranges
            </button>
            <button
              type="button"
              onClick={() => runActionOr('chart.overlay.setups.toggle', { enabled: !showSetups }, () => setShowSetups((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showSetups ? 'border-teal-400/40 text-teal-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Setups
            </button>
            <button
              type="button"
              onClick={() => runActionOr('chart.overlay.patterns.toggle', { enabled: !showPatterns }, () => setShowPatterns((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showPatterns ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Patterns
            </button>
            <button
              type="button"
              onClick={() => runActionOr('chart.overlay.reviews.toggle', { enabled: !showReviews }, () => setShowReviews((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showReviews ? 'border-yellow-300/40 text-yellow-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Reviews
            </button>
            <button
              type="button"
              onClick={() => runActionOr('chart.show.sessions.set', { enabled: !showSessions }, () => setShowSessions((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showSessions ? 'border-cyan-400/40 text-cyan-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Sessions
            </button>
            <button
              type="button"
              disabled={!constraintsEnabled}
              onClick={() => runActionOr('chart.show.constraints.set', { enabled: !showConstraints }, () => setShowConstraints((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                !constraintsEnabled
                  ? 'border-white/5 text-gray-600 cursor-not-allowed'
                  : showConstraints
                    ? 'border-pink-400/40 text-pink-200'
                    : 'border-white/10 text-gray-400'
              }`}
            >
              Constraints
            </button>
            <button
              type="button"
              onClick={() => runActionOr('chart.show.positions.set', { enabled: !showPositions }, () => setShowPositions((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showPositions ? 'border-green-400/40 text-green-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Positions
            </button>
            <button
              type="button"
              onClick={() => runActionOr('chart.show.orders.set', { enabled: !showOrders }, () => setShowOrders((prev) => !prev))}
              className={`px-2 py-1 rounded border ${
                showOrders ? 'border-orange-400/40 text-orange-200' : 'border-white/10 text-gray-400'
              }`}
            >
              Orders
            </button>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5"
              title="Refresh broker history"
            >
              <span className="inline-flex items-center gap-1">
                <RefreshCw size={12} />
                Refresh
              </span>
            </button>
            <button
              type="button"
              onClick={handleCaptureAll}
              className="px-2 py-1 rounded border border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10"
              title="Capture multi-timeframe snapshot"
            >
              <span className="inline-flex items-center gap-1">
                <Camera size={12} />
                Capture All
              </span>
            </button>
            {lastCaptureAtMs && (
              <span className="text-gray-400">Captured {formatAge(lastCaptureAtMs)} ago</span>
            )}
          </div>
          {captureNote && (
            <div className="mt-2 text-[10px] text-green-300/90 font-mono">{captureNote}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono text-gray-400">
            <span className="text-[9px] uppercase tracking-widest text-gray-500">Timeframes</span>
            {FRAME_PRESETS.map((frame) => {
              const active = activeFrameIds.includes(frame.id);
              const disabled = !active && activeFrameIds.length >= MAX_ACTIVE_FRAMES;
              return (
                <button
                  key={frame.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleFrame(frame.id)}
                  className={`px-2 py-1 rounded border transition-colors ${
                    active
                      ? 'border-cyan-400/40 text-cyan-200'
                      : disabled
                        ? 'border-white/5 text-gray-600'
                        : 'border-white/10 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {frame.label}
                </button>
              );
            })}
            <span className="text-gray-600">
              {activeFrameIds.length}/{MAX_ACTIVE_FRAMES}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Broker Quote</div>
              <div className="grid grid-cols-2 gap-y-1 text-xs font-mono">
                <span className="text-gray-400">Bid</span>
                <span className="text-gray-200">{bid}</span>
                <span className="text-gray-400">Ask</span>
                <span className="text-gray-200">{ask}</span>
                <span className="text-gray-400">Mid</span>
                <span className="text-gray-200">{mid}</span>
                <span className="text-gray-400">Spread</span>
                <span className="text-gray-200">{spread}</span>
              </div>
              <div className="mt-2 text-[10px] text-gray-500 font-mono">
                {quote ? `Updated ${quoteAge} ago` : 'No quote yet'}
              </div>
              {tvLine && (
                <div className="mt-1 text-[10px] text-gray-500 font-mono">{tvLine}</div>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Exposure</div>
              <div className="grid grid-cols-2 gap-y-1 text-xs font-mono">
                <span className="text-gray-400">Positions</span>
                <span className="text-gray-200">{filteredPositions.length}</span>
                <span className="text-gray-400">Orders</span>
                <span className="text-gray-200">{filteredOrders.length}</span>
              </div>
              <div className="mt-2 text-[10px] text-gray-500 font-mono">
                {symbolKey ? `Filtered by ${symbolKey.toUpperCase()}` : 'Showing all symbols'}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Constraints</div>
              <div className="grid grid-cols-2 gap-y-1 text-xs font-mono">
                <span className="text-gray-400">Session</span>
                <span className={sessionClass}>{sessionLabel}</span>
                <span className="text-gray-400">Min Stop</span>
                <span className="text-gray-200">{minStopText}</span>
                <span className="text-gray-400">Price Step</span>
                <span className="text-gray-200">{priceStepText}</span>
              </div>
              <div className="mt-2 text-[10px] text-gray-500 font-mono">
                {instrumentStatus.loading ? 'Loading instrument...' : `Updated ${constraintAge} ago`}
              </div>
              {instrumentStatus.error && (
                <div className="mt-2 text-[10px] text-red-300 font-mono">{instrumentStatus.error}</div>
              )}
              {!instrumentStatus.error && !instrumentStatus.loading && constraintsMissing && (
                <div className="mt-2 text-[10px] text-gray-500 font-mono">{constraintHint}</div>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Active Setup Profiles</div>
              {activeProfileWatchers.length === 0 ? (
                <div className="text-[10px] text-gray-500 font-mono">No active profiles.</div>
              ) : (
                <div className="space-y-1 text-[10px] font-mono text-gray-300">
                  {activeProfileWatchers.map((watcher) => {
                    const label = watcher.profileLabel || watcher.profileObjectivePreset || 'Optimizer';
                    const regimeBlock = regimeBlocks?.[watcher.id];
                    const regimeBlocked = regimeBlock?.blocked;
                    const toggleDisabled = !onUpdateWatcher;
                    return (
                      <div key={watcher.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-gray-200 truncate">
                            {watcher.symbol} {watcher.timeframe}
                          </div>
                          <div className="text-gray-500 truncate">
                            {String(watcher.strategy || '').replace(/_/g, ' ')}
                            {label ? ` | ${label}` : ''}
                          </div>
                          {regimeBlocked && (
                            <div className="mt-1 text-[10px] text-amber-200">
                              Blocked (Regime: {regimeBlock?.currentRegimeKey || 'n/a'})
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={toggleDisabled}
                          onClick={() => onUpdateWatcher?.(watcher.id, { enabled: !watcher.enabled })}
                          className={`px-2 py-0.5 rounded border text-[10px] ${
                            watcher.enabled
                              ? 'border-emerald-400/40 text-emerald-200'
                              : 'border-white/10 text-gray-400'
                          } ${toggleDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'}`}
                        >
                          {watcher.enabled ? 'On' : 'Off'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 text-[10px] text-gray-500 uppercase tracking-widest mb-2">Recent Setup Signals</div>
              {recentSetupSignals.length === 0 ? (
                <div className="text-[10px] text-gray-500 font-mono">No recent signals.</div>
              ) : (
                <div className="space-y-1 text-[10px] font-mono text-gray-300">
                  {recentSetupSignals.map((signal) => {
                    const status = resolveSignalStatus(signal);
                    const strengthPct = Number.isFinite(Number(signal.strength)) ? Math.round(Number(signal.strength) * 100) : null;
                    const evidence =
                      signal.payload?.evidence ||
                      buildEvidenceCardFromSignal({
                        strategy: signal.payload?.strategy,
                        signalType: signal.payload?.signalType,
                        side: signal.payload?.side || null,
                        details: signal.payload?.details || null,
                        reasonCodes: signal.reasonCodes || [],
                        strength: signal.strength,
                        regime: signal.payload?.details?.regime ? String(signal.payload.details.regime) : null,
                        createdAtMs: signal.ts || Date.now()
                      });
                    const evidenceBits = evidence
                      ? [
                          evidence.bias ? `Bias ${evidence.bias}` : '',
                          evidence.invalidation ? `Inv ${evidence.invalidation}` : '',
                          evidence.confidence?.score != null
                            ? `Conf ${Math.round(Number(evidence.confidence.score) * 100)}%`
                            : ''
                        ].filter(Boolean)
                      : [];
                    return (
                      <div key={signal.id} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2 truncate">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] ${getSignalStatusClass(status)}`}>
                              {formatSignalStatus(status)}
                            </span>
                            <span className="truncate">
                              {signal.timeframe} {String(signal.payload?.strategy || '').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <span>{strengthPct != null ? `${strengthPct}%` : '--'}</span>
                            <span>{formatAge(signal.ts)}</span>
                          </div>
                        </div>
                        {evidenceBits.length > 0 && (
                          <div className="text-[9px] text-gray-500 truncate">
                            {evidenceBits.join(' | ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {activeFrames.map((frame) => {
            const state = frameState[frame.id];
            const barCount = state?.bars?.length || 0;
            const updatedAt = state?.updatedAtMs ? formatAge(state.updatedAtMs) : '--';
            const isInitialLoad = barCount === 0 && state?.loading;
            const statusLabel = state?.error ? 'Error' : isInitialLoad ? 'Loading...' : 'Ready';
            const statusColor = state?.error ? 'text-red-300' : isInitialLoad ? 'text-yellow-300' : 'text-green-300';
            const coveragePct =
              typeof state?.coverage?.coveragePct === 'number' ? Math.round(state.coverage.coveragePct * 100) : null;
            const showCoverage = coveragePct != null && coveragePct < 99;
            const gapCount = Number.isFinite(Number(state?.coverage?.gapCount)) ? Number(state?.coverage?.gapCount) : 0;
            const missingBars =
              Number.isFinite(Number(state?.coverage?.missingBars)) ? Number(state?.coverage?.missingBars) : 0;
            const coverageLabel = showCoverage ? `Cov ${coveragePct}%` : '';
            const gapLabel = gapCount > 0 ? `Gaps ${gapCount}` : '';
            const missingLabel = !gapLabel && missingBars > 0 ? `Missing ${missingBars}` : '';
            const isFullscreen = fullscreenFrameId === frame.id;
            return (
              <div key={frame.id} className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10 flex flex-wrap items-center gap-3 text-[11px] font-mono">
                  <span className="text-cyan-200 font-semibold">{frame.label}</span>
                  <span className="text-gray-500">{frame.resolution}</span>
                  <span className="text-gray-400">Bars: {barCount}</span>
                  <span className="text-gray-400">Updated: {updatedAt}</span>
                  {state?.source && <span className="text-gray-500">Source: {state.source}</span>}
                  {coverageLabel && <span className="text-gray-500">{coverageLabel}</span>}
                  {gapLabel && <span className="text-yellow-300">{gapLabel}</span>}
                  {missingLabel && <span className="text-yellow-300">{missingLabel}</span>}
                  {showLiveQuote && quoteTickLabel && (
                    <span className={quoteFresh ? 'text-cyan-300' : 'text-gray-500'}>{quoteTickLabel}</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        runActionOr('chart.fullscreen.toggle', { enabled: !isFullscreen, frameId: frame.id });
                        setFullscreenFrameId(isFullscreen ? null : frame.id);
                      }}
                      className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5"
                      title={isFullscreen ? 'Exit full screen' : 'Full screen chart'}
                    >
                      <span className="inline-flex items-center gap-1">
                        {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                        {isFullscreen ? 'Exit' : 'Full'}
                      </span>
                    </button>
                    <span className={statusColor}>{statusLabel}</span>
                  </div>
                </div>
                <div
                  ref={getContainerRef(frame.id)}
                  onMouseDown={(event) => beginDrag(event, frame.id, 'frame')}
                  onClick={(event) => handleChartClick(event, frame.id, 'frame')}
                  className={`relative w-full h-[220px] md:h-[240px] bg-black ${
                    activePriceMode !== 'off' ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                >
                  <canvas ref={getCanvasRef(frame.id)} className="absolute inset-0 w-full h-full" />
                </div>
                {state?.error && (
                  <div className="px-3 py-2 text-[10px] text-red-300 font-mono border-t border-white/10">
                    {state.error}
                  </div>
                )}
              </div>
            );
          })}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-[11px] font-mono">
            {bottomFrame && (
              <span className="text-gray-500">Bottom frame: {bottomFrame.label}</span>
            )}
            <button
              type="button"
              onClick={handleSendBottomChartToChat}
              disabled={!bottomFrameReady}
              className={`px-3 py-1.5 rounded border ${
                bottomFrameReady
                  ? 'border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10'
                  : 'border-white/10 text-gray-500 cursor-not-allowed'
              }`}
              title="Capture the bottom chart and send it to Chart Chat"
            >
              <span className="inline-flex items-center gap-1">
                <Camera size={12} />
                Snap + Send
              </span>
            </button>
          </div>
        </div>
        <div className="px-4 pb-4">
        </div>
        {fullscreenOverlay && typeof document !== 'undefined'
          ? createPortal(fullscreenOverlay, document.body)
          : null}
      </div>
    );
  }
);

NativeChartInterface.displayName = 'NativeChartInterface';

export default NativeChartInterface;
