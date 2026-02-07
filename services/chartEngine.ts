import { Candle, computeAtrSeries, computeEmaSeries, computeRsiSeries, computeSmaSeries, resolutionToMs } from './backtestEngine';
import { normalizeSymbolKey, normalizeSymbolLoose, normalizeTimeframe } from './symbols';

export type ChartQuote = {
  symbol: string;
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  last?: number | null;
  spread?: number | null;
  timestampMs?: number | null;
  fetchedAtMs?: number | null;
};

export type ChartIndicators = {
  smaFast?: number | null;
  smaSlow?: number | null;
  emaFast?: number | null;
  emaSlow?: number | null;
  atr?: number | null;
  rsi?: number | null;
};

export type ChartSessionHealth = {
  status: 'idle' | 'loading' | 'ready' | 'stale' | 'error';
  lastUpdateAtMs?: number | null;
  lastHistoryFetchAtMs?: number | null;
  lastQuoteAtMs?: number | null;
  source?: string | null;
  error?: string | null;
};

export type PatternEvent = {
  id: string;
  watchId?: string | null;
  symbol: string;
  timeframe: string;
  ts: number;
  type: string;
  strength?: number | null;
  payload?: Record<string, any> | null;
};

export type ChartWatchConfig = {
  watchId: string;
  symbol: string;
  timeframe: string;
  detectorsEnabled?: string[];
  enabled?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  source?: string | null;
};

export type ChartSessionSnapshot = {
  sessionId: string;
  symbol: string;
  timeframe: string;
  barsTail: Candle[];
  barCount: number;
  lastQuote: ChartQuote | null;
  indicators: ChartIndicators;
  patternsTail: PatternEvent[];
  health: ChartSessionHealth;
  updatedAtMs: number | null;
  revision: number;
};

export type ChartEngineUpdate = {
  sessionId: string;
  revision: number;
  updatedAtMs: number | null;
  event?: PatternEvent | null;
};

export type ChartPersistence = {
  loadWatches?: () => Promise<ChartWatchConfig[]>;
  saveWatch?: (watch: ChartWatchConfig) => Promise<void>;
  deleteWatch?: (watchId: string) => Promise<void>;
  listEvents?: (opts?: { limit?: number }) => Promise<PatternEvent[]>;
  appendEvent?: (event: PatternEvent) => Promise<void>;
};

export type ChartEngineOptions = {
  getHistorySeries: (args: {
    symbol: string;
    resolution: string;
    from: number;
    to: number;
    aggregate?: boolean;
    maxAgeMs?: number;
  }) => Promise<any>;
  persistence?: ChartPersistence;
  nowMs?: () => number;
  maxBars?: number;
  onUpdate?: (update: ChartEngineUpdate) => void;
  historyFetchConcurrency?: number;
  historyFetchTimeoutMs?: number;
};

type ChartSessionInternal = {
  id: string;
  symbol: string;
  symbolKey: string;
  timeframe: string;
  resolutionMs: number;
  bars: Candle[];
  lastQuote: ChartQuote | null;
  indicators: ChartIndicators;
  patterns: PatternEvent[];
  updatedAtMs: number | null;
  lastBarCloseAtMs: number | null;
  lastHistoryFetchAtMs: number | null;
  lastQuoteAtMs: number | null;
  historyMaxAgeMs: number;
  barsBackfill: number;
  revision: number;
  active: boolean;
  watched: boolean;
  lastEventKeyByType: Map<string, string>;
  source: string;
  error?: string | null;
};

const DEFAULT_DETECTORS = [
  'swing_high',
  'swing_low',
  'ema_cross',
  'rsi_extreme',
  'atr_spike',
  'structure_break',
  'range_breakout',
  'support_resistance',
  'trend_pullback',
  'engulfing',
  'inside_bar',
  'pin_bar',
  'fvg'
];
const DEFAULT_BARS_BACKFILL = 320;
const DEFAULT_MAX_BARS = 600;
const DEFAULT_ATR_PERIOD = 14;
const DEFAULT_RSI_PERIOD = 14;
const DEFAULT_SMA_FAST = 20;
const DEFAULT_SMA_SLOW = 50;
const DEFAULT_EMA_FAST = 12;
const DEFAULT_EMA_SLOW = 26;
const MAX_EVENT_KEY_CACHE = 5000;

const nowFallback = () => Date.now();

const toNumber = (value: any) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const resolveQuotePrice = (quote: ChartQuote) => {
  const mid = toNumber(quote.mid);
  if (mid != null) return mid;
  const bid = toNumber(quote.bid);
  const ask = toNumber(quote.ask);
  if (bid != null && ask != null) return (bid + ask) / 2;
  const last = toNumber(quote.last);
  if (last != null) return last;
  if (bid != null) return bid;
  if (ask != null) return ask;
  return null;
};

const parseBar = (bar: any): Candle | null => {
  if (!bar || typeof bar !== 'object') return null;
  const tRaw = toNumber(bar.t ?? bar.time ?? bar.timestamp);
  if (tRaw == null) return null;
  const t = tRaw > 1e11 ? Math.floor(tRaw) : Math.floor(tRaw * 1000);
  const o = toNumber(bar.o ?? bar.open ?? bar.c ?? bar.close);
  const h = toNumber(bar.h ?? bar.high ?? o ?? bar.l ?? bar.low);
  const l = toNumber(bar.l ?? bar.low ?? o ?? bar.h ?? bar.high);
  const c = toNumber(bar.c ?? bar.close ?? o);
  if (o == null || h == null || l == null || c == null) return null;
  const v = toNumber(bar.v ?? bar.volume);
  return { t, o, h, l, c, v };
};

const normalizeBars = (bars: any[]): Candle[] => {
  const out: Candle[] = [];
  for (const raw of Array.isArray(bars) ? bars : []) {
    const bar = parseBar(raw);
    if (bar) out.push(bar);
  }
  return out.sort((a, b) => a.t - b.t);
};

const pickRecentValues = (series: Array<number | null>, count: number) => {
  const out: number[] = [];
  for (let i = series.length - 1; i >= 0 && out.length < count; i -= 1) {
    const v = series[i];
    if (v == null) continue;
    out.unshift(v);
  }
  return out;
};

const pickLastValue = (series: Array<number | null>) => {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i];
    if (v != null) return v;
  }
  return null;
};

const formatAgeShort = (timestampMs: number | null) => {
  if (!timestampMs) return '';
  const diff = Math.max(0, Date.now() - timestampMs);
  const sec = Math.max(1, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h`;
};

const computeHistoryMaxAge = (timeframe: string) => {
  const tf = normalizeTimeframe(timeframe);
  if (tf === '1m') return 45_000;
  if (tf === '5m') return 60_000;
  if (tf === '15m') return 90_000;
  if (tf === '30m') return 120_000;
  if (tf === '1H') return 180_000;
  if (tf === '4H') return 300_000;
  if (tf === '1D') return 600_000;
  if (tf === '1W') return 900_000;
  return 120_000;
};

const resolveMinimumBarsBackfill = (timeframe: string, allowShort = false) => {
  if (!allowShort) return 120;
  const tf = normalizeTimeframe(timeframe).toLowerCase();
  if (tf === '1d') return 60;
  if (tf === '1w') return 8;
  return 120;
};

const resolveBarsBackfill = (timeframe: string, barsBackfill?: number, allowShort = false) => {
  const raw = Number.isFinite(Number(barsBackfill)) ? Math.floor(Number(barsBackfill)) : DEFAULT_BARS_BACKFILL;
  const safe = Math.max(1, raw);
  const min = resolveMinimumBarsBackfill(timeframe, allowShort || barsBackfill != null);
  return Math.max(min, safe);
};

const resolveBackfillOverride = (timeframe: string, overrides?: Record<string, number> | null) => {
  if (!overrides) return null;
  const key = normalizeTimeframe(timeframe).toLowerCase();
  const raw = overrides[key];
  return Number.isFinite(Number(raw)) ? Number(raw) : null;
};

const buildSessionId = () => `chart_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

const buildSessionKey = (symbolKey: string, timeframe: string) => `${symbolKey}::${normalizeTimeframe(timeframe)}`;

const summarizeTrend = (price: number | null, emaFast: number | null, emaSlow: number | null) => {
  if (price == null || emaFast == null || emaSlow == null) return 'unknown';
  if (emaFast > emaSlow && price >= emaFast) return 'uptrend';
  if (emaFast < emaSlow && price <= emaFast) return 'downtrend';
  return 'range';
};

const clampNumber = (value: number | null, digits = 4) => {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
};

export class ChartEngine {
  private readonly getHistorySeries: ChartEngineOptions['getHistorySeries'];
  private readonly nowMs: () => number;
  private readonly maxBars: number;
  private readonly onUpdate?: (update: ChartEngineUpdate) => void;
  private readonly historyFetchTimeoutMs: number;
  private persistence?: ChartPersistence;

  private sessions = new Map<string, ChartSessionInternal>();
  private watchConfigs: ChartWatchConfig[] = [];
  private recentEvents: PatternEvent[] = [];
  private eventKeyCache = new Set<string>();
  private eventKeyOrder: string[] = [];
  private historyInFlightCount = 0;
  private historyConcurrency = 1;
  private historyWaiters: Array<() => void> = [];

  constructor(options: ChartEngineOptions) {
    this.getHistorySeries = options.getHistorySeries;
    this.persistence = options.persistence;
    this.nowMs = options.nowMs || nowFallback;
    this.maxBars = Number.isFinite(Number(options.maxBars)) ? Math.max(120, Math.floor(Number(options.maxBars))) : DEFAULT_MAX_BARS;
    this.onUpdate = options.onUpdate;
    this.historyConcurrency = Number.isFinite(Number(options.historyFetchConcurrency))
      ? Math.max(1, Math.floor(Number(options.historyFetchConcurrency)))
      : 1;
    this.historyFetchTimeoutMs = Number.isFinite(Number(options.historyFetchTimeoutMs))
      ? Math.max(5_000, Math.floor(Number(options.historyFetchTimeoutMs)))
      : 20_000;
  }

  setPersistence(persistence?: ChartPersistence) {
    this.persistence = persistence;
  }

  listSessions() {
    return Array.from(this.sessions.values());
  }

  listWatches() {
    return [...this.watchConfigs];
  }

  listRecentEvents(limit = 50) {
    const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : 50;
    return this.recentEvents.slice(-lim);
  }

  async loadWatches() {
    if (!this.persistence?.loadWatches) return [] as ChartWatchConfig[];
    try {
      const watches = await this.persistence.loadWatches();
      if (Array.isArray(watches)) {
        this.watchConfigs = watches.map((watch) => this.normalizeWatch(watch)).filter(Boolean) as ChartWatchConfig[];
        this.updateWatchSessions();
        return this.watchConfigs;
      }
    } catch {
      // ignore
    }
    return [] as ChartWatchConfig[];
  }

  async loadEvents(limit = 200) {
    if (!this.persistence?.listEvents) return [] as PatternEvent[];
    try {
      const events = await this.persistence.listEvents({ limit });
      if (Array.isArray(events)) {
        this.recentEvents = events.slice(-limit);
        for (const evt of this.recentEvents) {
          if (evt?.id) this.eventKeyCache.add(evt.id);
        }
        return this.recentEvents;
      }
    } catch {
      // ignore
    }
    return [] as PatternEvent[];
  }

  async addWatch(input: Partial<ChartWatchConfig>) {
    const watch = this.normalizeWatch({
      watchId: input.watchId || `watch_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      symbol: String(input.symbol || '').trim(),
      timeframe: String(input.timeframe || '').trim(),
      detectorsEnabled: Array.isArray(input.detectorsEnabled) ? input.detectorsEnabled : DEFAULT_DETECTORS,
      enabled: input.enabled !== false,
      createdAtMs: input.createdAtMs ?? this.nowMs(),
      updatedAtMs: this.nowMs(),
      source: input.source ?? null
    });
    if (!watch) return null;
    const idx = this.watchConfigs.findIndex((w) => w.watchId === watch.watchId);
    if (idx >= 0) this.watchConfigs[idx] = watch;
    else this.watchConfigs.unshift(watch);
    await this.persistence?.saveWatch?.(watch);
    this.updateWatchSessions();
    return watch;
  }

  async updateWatch(watchId: string, patch: Partial<ChartWatchConfig>) {
    const key = String(watchId || '').trim();
    if (!key) return null;
    const idx = this.watchConfigs.findIndex((w) => w.watchId === key);
    if (idx < 0) return null;
    const existing = this.watchConfigs[idx];
    const next = this.normalizeWatch({
      ...existing,
      ...patch,
      watchId: existing.watchId,
      updatedAtMs: this.nowMs()
    });
    if (!next) return null;
    this.watchConfigs[idx] = next;
    await this.persistence?.saveWatch?.(next);
    this.updateWatchSessions();
    return next;
  }

  async removeWatch(watchId: string) {
    const key = String(watchId || '').trim();
    if (!key) return false;
    const before = this.watchConfigs.length;
    this.watchConfigs = this.watchConfigs.filter((w) => w.watchId !== key);
    await this.persistence?.deleteWatch?.(key);
    if (this.watchConfigs.length !== before) {
      this.updateWatchSessions();
      return true;
    }
    return false;
  }

  startSession({ symbol, timeframe, barsBackfill }: { symbol: string; timeframe: string; barsBackfill?: number }) {
    const sym = String(symbol || '').trim();
    const tf = normalizeTimeframe(String(timeframe || '').trim());
    if (!sym || !tf) return null;
    const symbolKey = normalizeSymbolLoose(sym) || normalizeSymbolKey(sym);
    const key = buildSessionKey(symbolKey, tf);
    const existing = this.sessions.get(key);
    if (existing) {
      existing.active = true;
      existing.symbol = sym;
      existing.timeframe = tf;
      existing.resolutionMs = resolutionToMs(tf) || existing.resolutionMs;
      if (barsBackfill != null) {
        existing.barsBackfill = resolveBarsBackfill(tf, barsBackfill, true);
      }
      return existing.id;
    }
    const resMs = resolutionToMs(tf) || 0;
    const id = buildSessionId();
    const resolvedBackfill = resolveBarsBackfill(tf, barsBackfill, true);
    const session: ChartSessionInternal = {
      id,
      symbol: sym,
      symbolKey,
      timeframe: tf,
      resolutionMs: resMs,
      bars: [],
      lastQuote: null,
      indicators: {},
      patterns: [],
      updatedAtMs: null,
      lastBarCloseAtMs: null,
      lastHistoryFetchAtMs: null,
      lastQuoteAtMs: null,
      historyMaxAgeMs: computeHistoryMaxAge(tf),
      barsBackfill: resolvedBackfill,
      revision: 0,
      active: true,
      watched: false,
      lastEventKeyByType: new Map(),
      source: 'tradelocker',
      error: null
    };
    this.sessions.set(key, session);
    this.refreshSessionHistory(session, { force: true });
    return id;
  }

  stopSession(sessionId: string) {
    const key = String(sessionId || '').trim();
    if (!key) return;
    for (const [sessionKey, session] of this.sessions.entries()) {
      if (session.id !== key) continue;
      if (session.watched) {
        session.active = false;
        return;
      }
      this.sessions.delete(sessionKey);
      return;
    }
  }

  setActiveSessions(
    symbol: string | null,
    timeframes: string[],
    opts?: { barsBackfillByTimeframe?: Record<string, number> | null }
  ) {
    const sym = String(symbol || '').trim();
    const tfs = Array.isArray(timeframes) ? timeframes.map((tf) => normalizeTimeframe(tf)).filter(Boolean) : [];
    const activeKeys = new Set<string>();
    if (sym && tfs.length > 0) {
      for (const tf of tfs) {
        const symbolKey = normalizeSymbolLoose(sym) || normalizeSymbolKey(sym);
        const key = buildSessionKey(symbolKey, tf);
        activeKeys.add(key);
        const session = this.sessions.get(key);
        const backfillOverride = resolveBackfillOverride(tf, opts?.barsBackfillByTimeframe ?? null);
        if (session) {
          session.active = true;
          session.symbol = sym;
          if (backfillOverride != null) {
            session.barsBackfill = resolveBarsBackfill(tf, backfillOverride, true);
          }
        } else {
          this.startSession({ symbol: sym, timeframe: tf, barsBackfill: backfillOverride ?? undefined });
        }
      }
    }

    for (const [key, session] of this.sessions.entries()) {
      const stillActive = activeKeys.has(key);
      if (!stillActive) session.active = false;
    }
  }

  ingestQuote(symbol: string, quote: ChartQuote) {
    const sym = String(symbol || quote?.symbol || '').trim();
    if (!sym) return;
    const symbolKey = normalizeSymbolLoose(sym) || normalizeSymbolKey(sym);
    if (!symbolKey) return;
    const now = this.nowMs();
    const ts = toNumber(quote.timestampMs) ?? toNumber(quote.fetchedAtMs) ?? now;
    const price = resolveQuotePrice(quote);
    if (price == null || !Number.isFinite(price)) return;

    const matching = Array.from(this.sessions.values()).filter((session) => session.symbolKey === symbolKey);
    if (matching.length === 0) return;

    for (const session of matching) {
      this.updateSessionFromQuote(session, price, ts, quote);
    }
  }

  ingestBar(symbol: string, timeframe: string, bar: Candle, bars?: Candle[]) {
    const sym = String(symbol || '').trim();
    const tf = normalizeTimeframe(String(timeframe || '').trim());
    if (!sym || !tf) return;
    const symbolKey = normalizeSymbolLoose(sym) || normalizeSymbolKey(sym);
    const key = buildSessionKey(symbolKey, tf);
    const session = this.sessions.get(key) || null;
    if (!session) {
      this.startSession({ symbol: sym, timeframe: tf });
    }
    const current = this.sessions.get(key);
    if (!current) return;
    if (Array.isArray(bars) && bars.length > 0) {
      const normalized = normalizeBars(bars).slice(-this.maxBars);
      if (normalized.length > 0) {
        current.bars = normalized;
        current.updatedAtMs = this.nowMs();
        current.error = null;
        this.refreshIndicators(current);
        this.detectPatterns(current, normalized.length - 1);
        this.bumpRevision(current);
        return;
      }
    }
    const parsed = parseBar(bar);
    if (!parsed) return;
    const last = current.bars[current.bars.length - 1];
    if (!last || parsed.t > last.t) {
      current.bars = [...current.bars, parsed].slice(-this.maxBars);
      current.updatedAtMs = this.nowMs();
      current.lastBarCloseAtMs = parsed.t;
      current.error = null;
      this.refreshIndicators(current);
      this.detectPatterns(current, current.bars.length - 1);
      this.bumpRevision(current);
      return;
    }
    if (parsed.t === last.t) {
      current.bars = [...current.bars.slice(0, -1), parsed];
      current.updatedAtMs = this.nowMs();
      current.error = null;
      this.refreshIndicators(current);
      this.detectPatterns(current, current.bars.length - 1);
      this.bumpRevision(current);
    }
  }

  async refreshStaleSessions(maxFetches = 1) {
    const now = this.nowMs();
    const candidates = Array.from(this.sessions.values())
      .filter((session) => session.active || session.watched)
      .filter((session) => this.shouldRefreshSession(session, now))
      .sort((a, b) => (a.lastHistoryFetchAtMs || 0) - (b.lastHistoryFetchAtMs || 0));

    if (candidates.length === 0) return;
    const fetches = Math.max(1, Math.min(Math.floor(maxFetches), candidates.length));
    const targets = candidates.slice(0, fetches);
    await Promise.all(targets.map((session) => this.refreshSessionHistory(session, { force: true })));
  }

  async refreshSessionsForSymbol(
    symbol: string,
    timeframes: string[],
    opts?: { force?: boolean; barsBackfillByTimeframe?: Record<string, number> | null }
  ) {
    const sym = String(symbol || '').trim();
    if (!sym) return 0;
    const tfs = Array.isArray(timeframes) ? timeframes.map((tf) => normalizeTimeframe(tf)).filter(Boolean) : [];
    const sessions: ChartSessionInternal[] = [];
    for (const tf of tfs) {
      const symbolKey = normalizeSymbolLoose(sym) || normalizeSymbolKey(sym);
      const key = buildSessionKey(symbolKey, tf);
      const backfillOverride = resolveBackfillOverride(tf, opts?.barsBackfillByTimeframe ?? null);
      let session = this.sessions.get(key);
      if (session) {
        session.active = true;
        session.symbol = sym;
        if (backfillOverride != null) {
          session.barsBackfill = resolveBarsBackfill(tf, backfillOverride, true);
        }
      } else {
        this.startSession({ symbol: sym, timeframe: tf, barsBackfill: backfillOverride ?? undefined });
        session = this.sessions.get(key) || null;
      }
      if (session) sessions.push(session);
    }
    if (sessions.length === 0) return 0;
    await Promise.all(sessions.map((session) => this.refreshSessionHistory(session, { force: opts?.force })));
    return sessions.length;
  }

  getSnapshot(sessionId: string, opts?: { barsLimit?: number; eventsLimit?: number }): ChartSessionSnapshot | null {
    const key = String(sessionId || '').trim();
    if (!key) return null;
    const session = Array.from(this.sessions.values()).find((s) => s.id === key);
    if (!session) return null;
    return this.buildSnapshot(session, opts);
  }

  getSnapshots(opts?: { barsLimit?: number; eventsLimit?: number; includeInactive?: boolean }) {
    const includeInactive = opts?.includeInactive === true;
    return Array.from(this.sessions.values())
      .filter((session) => includeInactive || session.active || session.watched)
      .map((session) => this.buildSnapshot(session, opts));
  }

  buildContextPack(opts?: { barsLimit?: number; eventsLimit?: number }) {
    const barsLimit = Number.isFinite(Number(opts?.barsLimit)) ? Math.max(5, Math.floor(Number(opts?.barsLimit))) : 50;
    const eventsLimit = Number.isFinite(Number(opts?.eventsLimit)) ? Math.max(0, Math.floor(Number(opts?.eventsLimit))) : 20;
    const sessions = this.getSnapshots({ barsLimit, eventsLimit, includeInactive: false });

    if (sessions.length === 0 && this.watchConfigs.length === 0) return '';

    const watchList = this.watchConfigs.filter((w) => w.enabled !== false);
    const headerLines: string[] = [];
    headerLines.push(`CHART ENGINE: ${sessions.length} session${sessions.length === 1 ? '' : 's'} | ${watchList.length} watch${watchList.length === 1 ? '' : 'es'}`);
    if (watchList.length > 0) {
      headerLines.push(`WATCHES: ${watchList.map((w) => `${w.symbol} ${normalizeTimeframe(w.timeframe)}`).join(' | ')}`);
    }

    const bodyLines: string[] = [];
    for (const session of sessions) {
      const updated = session.updatedAtMs ? formatAgeShort(session.updatedAtMs) : '';
      const quote = session.lastQuote;
      const price = resolveQuotePrice(quote || { symbol: '' });
      const trend = summarizeTrend(price, session.indicators.emaFast ?? null, session.indicators.emaSlow ?? null);
      const rsi = clampNumber(session.indicators.rsi ?? null, 2);
      const atr = clampNumber(session.indicators.atr ?? null, 4);
      const smaFast = clampNumber(session.indicators.smaFast ?? null, 4);
      const smaSlow = clampNumber(session.indicators.smaSlow ?? null, 4);
      const emaFast = clampNumber(session.indicators.emaFast ?? null, 4);
      const emaSlow = clampNumber(session.indicators.emaSlow ?? null, 4);
      const health = session.health.status;

      bodyLines.push(`CHART ${session.symbol} ${session.timeframe}`);
      bodyLines.push(`- Status ${health}${updated ? ` | updated ${updated}` : ''}${session.barCount ? ` | bars ${session.barCount}` : ''}`);
      if (price != null) {
        const bid = quote?.bid != null ? clampNumber(toNumber(quote.bid), 4) : null;
        const ask = quote?.ask != null ? clampNumber(toNumber(quote.ask), 4) : null;
        const spread = quote?.spread != null ? clampNumber(toNumber(quote.spread), 4) : null;
        bodyLines.push(`- Price ${clampNumber(price, 4)}${bid != null && ask != null ? ` (bid ${bid} ask ${ask})` : ''}${spread != null ? ` | sp ${spread}` : ''}`);
      }
      bodyLines.push(`- Trend ${trend}${emaFast != null && emaSlow != null ? ` | EMA ${emaFast}/${emaSlow}` : ''}${smaFast != null && smaSlow != null ? ` | SMA ${smaFast}/${smaSlow}` : ''}`);
      bodyLines.push(`- RSI ${rsi ?? '--'} | ATR ${atr ?? '--'}`);

      const persisted = this.recentEvents.filter(
        (evt) => evt.symbol === session.symbol && normalizeTimeframe(evt.timeframe) === session.timeframe
      );
      const mergedMap = new Map<string, PatternEvent>();
      for (const evt of [...persisted, ...session.patternsTail]) {
        if (!evt?.id) continue;
        mergedMap.set(evt.id, evt);
      }
    const merged = eventsLimit > 0 ? Array.from(mergedMap.values()).slice(-eventsLimit) : [];
    const patterns = merged.map((evt) => `${evt.type}@${new Date(evt.ts).toISOString().slice(11, 19)}`);
      if (patterns.length > 0) bodyLines.push(`- Patterns ${patterns.join(', ')}`);

      const barsTail = session.barsTail.map((bar) => [bar.t, bar.o, bar.h, bar.l, bar.c]);
      if (barsTail.length > 0) bodyLines.push(`- BarsTail ${JSON.stringify(barsTail)}`);

      bodyLines.push('');
    }

    return [headerLines.join('\n'), bodyLines.join('\n')].filter(Boolean).join('\n');
  }

  private normalizeWatch(watch: ChartWatchConfig | null): ChartWatchConfig | null {
    if (!watch) return null;
    const symbol = String(watch.symbol || '').trim();
    const timeframe = normalizeTimeframe(String(watch.timeframe || '').trim());
    if (!symbol || !timeframe) return null;
    const detectors = Array.isArray(watch.detectorsEnabled) && watch.detectorsEnabled.length > 0
      ? watch.detectorsEnabled.map((d) => String(d || '').trim()).filter(Boolean)
      : DEFAULT_DETECTORS;
    return {
      watchId: String(watch.watchId || '').trim() || `watch_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      symbol,
      timeframe,
      detectorsEnabled: detectors,
      enabled: watch.enabled !== false,
      createdAtMs: watch.createdAtMs ?? this.nowMs(),
      updatedAtMs: watch.updatedAtMs ?? this.nowMs(),
      source: watch.source ?? null
    };
  }

  private updateWatchSessions() {
    const enabled = this.watchConfigs.filter((w) => w.enabled !== false);
    const watchedKeys = new Set<string>();
    for (const watch of enabled) {
      const key = buildSessionKey(normalizeSymbolLoose(watch.symbol) || normalizeSymbolKey(watch.symbol), watch.timeframe);
      watchedKeys.add(key);
      const session = this.sessions.get(key);
      if (session) {
        session.watched = true;
        session.symbol = watch.symbol;
      } else {
        this.startSession({ symbol: watch.symbol, timeframe: watch.timeframe });
      }
    }

    for (const [key, session] of this.sessions.entries()) {
      if (!watchedKeys.has(key)) session.watched = false;
    }
  }

  private buildSnapshot(session: ChartSessionInternal, opts?: { barsLimit?: number; eventsLimit?: number }) {
    const barsLimit = Number.isFinite(Number(opts?.barsLimit)) ? Math.max(5, Math.floor(Number(opts?.barsLimit))) : 50;
    const eventsLimit = Number.isFinite(Number(opts?.eventsLimit)) ? Math.max(0, Math.floor(Number(opts?.eventsLimit))) : 20;
    const health = this.buildHealth(session);
    const barsTail = session.bars.slice(-barsLimit);
    const patternsTail = eventsLimit > 0 ? session.patterns.slice(-eventsLimit) : [];
    return {
      sessionId: session.id,
      symbol: session.symbol,
      timeframe: session.timeframe,
      barsTail,
      barCount: session.bars.length,
      lastQuote: session.lastQuote,
      indicators: session.indicators,
      patternsTail,
      health,
      updatedAtMs: session.updatedAtMs,
      revision: session.revision
    } as ChartSessionSnapshot;
  }

  private buildHealth(session: ChartSessionInternal): ChartSessionHealth {
    const now = this.nowMs();
    const lastUpdate = session.updatedAtMs || null;
    const lastQuote = session.lastQuoteAtMs || null;
    const lastHistory = session.lastHistoryFetchAtMs || null;
    const error = session.error || null;
    let status: ChartSessionHealth['status'] = 'idle';
    if (session.error) status = 'error';
    else if (session.bars.length > 0) status = 'ready';
    if (status === 'ready' && lastUpdate) {
      const age = now - lastUpdate;
      const staleMs = Math.max(30_000, Math.min(300_000, session.resolutionMs || 60_000));
      if (age > staleMs) status = 'stale';
    }
    return {
      status,
      lastUpdateAtMs: lastUpdate,
      lastHistoryFetchAtMs: lastHistory,
      lastQuoteAtMs: lastQuote,
      source: session.source || null,
      error
    };
  }

  private async refreshSessionHistory(session: ChartSessionInternal, opts?: { force?: boolean }) {
    if (!opts?.force && !this.shouldRefreshSession(session, this.nowMs())) return;
    await this.acquireHistorySlot();
    const now = this.nowMs();
    const resMs = session.resolutionMs || resolutionToMs(session.timeframe) || 60_000;
    const lookback = Math.max(1, session.barsBackfill);
    const to = now;
    const from = to - resMs * lookback;

    session.error = null;
    session.source = 'tradelocker';

    try {
      const timeoutMs = this.historyFetchTimeoutMs;
      const runFetch = async () => {
        const historyPromise = this.getHistorySeries({
          symbol: session.symbol,
          resolution: session.timeframe,
          from,
          to,
          aggregate: false,
          maxAgeMs: 0
        }).catch((err: any) => ({
          ok: false,
          error: err?.message ? String(err.message) : 'Failed to load history.'
        }));
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<any>((resolve) => {
          timeoutId = setTimeout(() => {
            resolve({ ok: false, error: `History fetch timeout (${timeoutMs}ms).` });
          }, timeoutMs);
        });
        const res = await Promise.race([historyPromise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId);
        return res;
      };
      const shouldRetry = (message: string) => {
        const msg = String(message || '').toLowerCase();
        return msg.includes('timeout') || msg.includes('not connected') || msg.includes('upstream');
      };
      let res = await runFetch();
      if (!res?.ok) {
        const errMsg = res?.error ? String(res.error) : '';
        if (shouldRetry(errMsg)) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          res = await runFetch();
        }
      }

      if (res && res.ok && Array.isArray(res.bars)) {
        const normalized = normalizeBars(res.bars).slice(-this.maxBars);
        session.bars = normalized;
        session.updatedAtMs = res.fetchedAtMs || now;
        session.lastHistoryFetchAtMs = res.fetchedAtMs || now;
        session.error = null;
        this.refreshIndicators(session);
        this.bumpRevision(session);
      } else {
        const err = res?.error ? String(res.error) : 'Failed to load history.';
        session.error = err;
        session.lastHistoryFetchAtMs = now;
        this.bumpRevision(session);
      }
    } catch (err: any) {
      session.error = err?.message ? String(err.message) : 'Failed to load history.';
      session.lastHistoryFetchAtMs = now;
      this.bumpRevision(session);
    } finally {
      this.releaseHistorySlot();
    }
  }

  private async acquireHistorySlot() {
    if (this.historyInFlightCount < this.historyConcurrency) {
      this.historyInFlightCount += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.historyWaiters.push(resolve);
    });
    this.historyInFlightCount += 1;
  }

  private releaseHistorySlot() {
    this.historyInFlightCount = Math.max(0, this.historyInFlightCount - 1);
    const next = this.historyWaiters.shift();
    if (next) next();
  }

  private shouldRefreshSession(session: ChartSessionInternal, now: number) {
    if (session.lastHistoryFetchAtMs == null) return true;
    const age = now - session.lastHistoryFetchAtMs;
    return age >= session.historyMaxAgeMs;
  }

  private updateSessionFromQuote(session: ChartSessionInternal, price: number, ts: number, quote: ChartQuote) {
    const resMs = session.resolutionMs || resolutionToMs(session.timeframe) || 60_000;
    if (!resMs) return;

    const bucket = Math.floor(ts / resMs) * resMs;
    const bars = session.bars;
    const last = bars[bars.length - 1];

    session.lastQuote = { ...quote, symbol: session.symbol };
    session.lastQuoteAtMs = ts;
    session.error = null;

    if (!last) {
      session.bars = [{ t: bucket, o: price, h: price, l: price, c: price, v: null }];
      session.updatedAtMs = this.nowMs();
      this.refreshIndicators(session);
      this.bumpRevision(session);
      return;
    }

    if (bucket === last.t) {
      const next = {
        ...last,
        h: Math.max(last.h, price),
        l: Math.min(last.l, price),
        c: price
      };
      session.bars = [...bars.slice(0, -1), next];
      session.updatedAtMs = this.nowMs();
      this.refreshIndicators(session);
      this.bumpRevision(session);
      return;
    }

    if (bucket > last.t) {
      const nextBar: Candle = { t: bucket, o: last.c, h: Math.max(last.c, price), l: Math.min(last.c, price), c: price, v: null };
      session.bars = [...bars, nextBar].slice(-this.maxBars);
      session.updatedAtMs = this.nowMs();
      session.lastBarCloseAtMs = last.t;
      this.refreshIndicators(session);
      this.detectPatterns(session, session.bars.length - 2);
      this.bumpRevision(session);
    }
  }

  private refreshIndicators(session: ChartSessionInternal) {
    const bars = session.bars;
    if (bars.length === 0) return;
    const smaFastSeries = computeSmaSeries(bars, DEFAULT_SMA_FAST);
    const smaSlowSeries = computeSmaSeries(bars, DEFAULT_SMA_SLOW);
    const emaFastSeries = computeEmaSeries(bars, DEFAULT_EMA_FAST);
    const emaSlowSeries = computeEmaSeries(bars, DEFAULT_EMA_SLOW);
    const atrSeries = computeAtrSeries(bars, DEFAULT_ATR_PERIOD);
    const rsiSeries = computeRsiSeries(bars, DEFAULT_RSI_PERIOD);

    session.indicators = {
      smaFast: pickLastValue(smaFastSeries),
      smaSlow: pickLastValue(smaSlowSeries),
      emaFast: pickLastValue(emaFastSeries),
      emaSlow: pickLastValue(emaSlowSeries),
      atr: pickLastValue(atrSeries),
      rsi: pickLastValue(rsiSeries)
    };
  }

  private detectPatterns(session: ChartSessionInternal, barIndex: number) {
    const bars = session.bars;
    if (bars.length === 0 || barIndex <= 0) return;

    const watchKeys = this.watchConfigs.filter((w) => w.enabled !== false).filter((w) => {
      const key = buildSessionKey(normalizeSymbolLoose(w.symbol) || normalizeSymbolKey(w.symbol), w.timeframe);
      return key === buildSessionKey(session.symbolKey, session.timeframe);
    });

    const detectors = new Set<string>();
    for (const watch of watchKeys) {
      for (const det of watch.detectorsEnabled || []) detectors.add(det);
    }
    if (detectors.size === 0) {
      for (const det of DEFAULT_DETECTORS) detectors.add(det);
    }

    const emaFastSeries = computeEmaSeries(bars, DEFAULT_EMA_FAST);
    const emaSlowSeries = computeEmaSeries(bars, DEFAULT_EMA_SLOW);
    const rsiSeries = computeRsiSeries(bars, DEFAULT_RSI_PERIOD);
    const atrSeries = computeAtrSeries(bars, DEFAULT_ATR_PERIOD);

    const events: PatternEvent[] = [];
    const bar = bars[barIndex];
    const prev = bars[barIndex - 1];
    const prev2 = barIndex >= 2 ? bars[barIndex - 2] : null;
    const atrNow = atrSeries[barIndex] ?? null;
    const fallbackTol = Math.abs(bar.c || 0) * 0.001;
    const touchTol = atrNow != null ? Math.max(atrNow * 0.15, fallbackTol) : fallbackTol;
    const bodySize = (c: Candle) => Math.abs(c.c - c.o);
    const upperWick = (c: Candle) => c.h - Math.max(c.o, c.c);
    const lowerWick = (c: Candle) => Math.min(c.o, c.c) - c.l;
    const isBull = (c: Candle) => c.c > c.o;
    const isBear = (c: Candle) => c.c < c.o;

    if (detectors.has('swing_high') || detectors.has('swing_low')) {
      const lookback = 5;
      const start = Math.max(0, barIndex - (lookback - 1));
      const slice = bars.slice(start, barIndex + 1);
      const high = Math.max(...slice.map((b) => b.h));
      const low = Math.min(...slice.map((b) => b.l));
      if (detectors.has('swing_high') && bar.h >= high) {
        events.push({
          id: `swing_high:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'swing_high',
          strength: clampNumber(bar.h - low, 4),
          payload: { price: bar.h }
        });
      }
      if (detectors.has('swing_low') && bar.l <= low) {
        events.push({
          id: `swing_low:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'swing_low',
          strength: clampNumber(high - bar.l, 4),
          payload: { price: bar.l }
        });
      }
    }

    if (detectors.has('ema_cross') && barIndex > 0) {
      const fastNow = emaFastSeries[barIndex];
      const slowNow = emaSlowSeries[barIndex];
      const fastPrev = emaFastSeries[barIndex - 1];
      const slowPrev = emaSlowSeries[barIndex - 1];
      if (fastNow != null && slowNow != null && fastPrev != null && slowPrev != null) {
        if (fastPrev <= slowPrev && fastNow > slowNow) {
          events.push({
            id: `ema_cross_bull:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'ema_cross_bull',
            strength: clampNumber(fastNow - slowNow, 4),
            payload: { fast: fastNow, slow: slowNow }
          });
        } else if (fastPrev >= slowPrev && fastNow < slowNow) {
          events.push({
            id: `ema_cross_bear:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'ema_cross_bear',
            strength: clampNumber(slowNow - fastNow, 4),
            payload: { fast: fastNow, slow: slowNow }
          });
        }
      }
    }

    if (detectors.has('rsi_extreme') && barIndex > 0) {
      const rsiNow = rsiSeries[barIndex];
      const rsiPrev = rsiSeries[barIndex - 1];
      if (rsiNow != null && rsiPrev != null) {
        if (rsiPrev <= 70 && rsiNow > 70) {
          events.push({
            id: `rsi_overbought:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'rsi_overbought',
            strength: clampNumber(rsiNow, 2),
            payload: { rsi: rsiNow }
          });
        } else if (rsiPrev >= 30 && rsiNow < 30) {
          events.push({
            id: `rsi_oversold:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'rsi_oversold',
            strength: clampNumber(100 - rsiNow, 2),
            payload: { rsi: rsiNow }
          });
        }
      }
    }

    if (detectors.has('atr_spike')) {
      const atrNow = atrSeries[barIndex];
      const recentAtr = pickRecentValues(atrSeries.slice(0, barIndex), 20);
      if (atrNow != null && recentAtr.length > 5) {
        const avg = recentAtr.reduce((sum, v) => sum + v, 0) / recentAtr.length;
        if (avg > 0 && atrNow > avg * 1.5) {
          events.push({
            id: `atr_spike:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'atr_spike',
            strength: clampNumber(atrNow / avg, 2),
            payload: { atr: atrNow, avgAtr: avg }
          });
        }
      }
    }

    if (detectors.has('structure_break') && barIndex > 2) {
      const lookback = 18;
      const start = Math.max(0, barIndex - lookback);
      const slice = bars.slice(start, barIndex);
      if (slice.length > 2) {
        const priorHigh = Math.max(...slice.map((b) => b.h));
        const priorLow = Math.min(...slice.map((b) => b.l));
        const prevClose = prev?.c ?? bar.c;
        if (prevClose <= priorHigh && bar.c > priorHigh) {
          events.push({
            id: `structure_break_bull:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'structure_break_bull',
            strength: clampNumber(bar.c - priorHigh, 4),
            payload: { level: priorHigh, close: bar.c }
          });
        } else if (prevClose >= priorLow && bar.c < priorLow) {
          events.push({
            id: `structure_break_bear:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'structure_break_bear',
            strength: clampNumber(priorLow - bar.c, 4),
            payload: { level: priorLow, close: bar.c }
          });
        }
      }
    }

    if (detectors.has('range_breakout') && barIndex > 2) {
      const lookback = 20;
      const start = Math.max(0, barIndex - lookback);
      const slice = bars.slice(start, barIndex);
      if (slice.length > 2) {
        const rangeHigh = Math.max(...slice.map((b) => b.h));
        const rangeLow = Math.min(...slice.map((b) => b.l));
        const prevClose = prev?.c ?? bar.c;
        if (prevClose <= rangeHigh && bar.c > rangeHigh) {
          events.push({
            id: `range_breakout_bull:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'range_breakout_bull',
            strength: clampNumber(bar.c - rangeHigh, 4),
            payload: { high: rangeHigh, low: rangeLow, close: bar.c }
          });
        } else if (prevClose >= rangeLow && bar.c < rangeLow) {
          events.push({
            id: `range_breakout_bear:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'range_breakout_bear',
            strength: clampNumber(rangeLow - bar.c, 4),
            payload: { high: rangeHigh, low: rangeLow, close: bar.c }
          });
        }
      }
    }

    if (detectors.has('support_resistance') && barIndex > 2) {
      const lookback = 24;
      const start = Math.max(0, barIndex - lookback);
      const slice = bars.slice(start, barIndex);
      if (slice.length > 4) {
        const levelHigh = Math.max(...slice.map((b) => b.h));
        const levelLow = Math.min(...slice.map((b) => b.l));
        if (bar.l <= levelLow + touchTol && bar.c >= levelLow) {
          events.push({
            id: `support_hold:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'support_hold',
            strength: clampNumber(levelLow - bar.l, 4),
            payload: { level: levelLow, close: bar.c, tolerance: touchTol }
          });
        }
        if (bar.h >= levelHigh - touchTol && bar.c <= levelHigh) {
          events.push({
            id: `resistance_hold:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'resistance_hold',
            strength: clampNumber(bar.h - levelHigh, 4),
            payload: { level: levelHigh, close: bar.c, tolerance: touchTol }
          });
        }
      }
    }

    if (detectors.has('trend_pullback') && barIndex > 1) {
      const fastNow = emaFastSeries[barIndex];
      const slowNow = emaSlowSeries[barIndex];
      if (fastNow != null && slowNow != null) {
        if (fastNow > slowNow && bar.l <= fastNow && bar.c >= fastNow) {
          events.push({
            id: `trend_pullback_bull:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'trend_pullback_bull',
            strength: clampNumber(bar.c - fastNow, 4),
            payload: { emaFast: fastNow, emaSlow: slowNow }
          });
        } else if (fastNow < slowNow && bar.h >= fastNow && bar.c <= fastNow) {
          events.push({
            id: `trend_pullback_bear:${session.symbol}:${session.timeframe}:${bar.t}`,
            symbol: session.symbol,
            timeframe: session.timeframe,
            ts: bar.t,
            type: 'trend_pullback_bear',
            strength: clampNumber(fastNow - bar.c, 4),
            payload: { emaFast: fastNow, emaSlow: slowNow }
          });
        }
      }
    }

    if (detectors.has('engulfing') && barIndex > 0) {
      const prevBody = bodySize(prev);
      const currBody = bodySize(bar);
      if (isBull(bar) && isBear(prev) && currBody >= prevBody && bar.c >= prev.o && bar.o <= prev.c) {
        events.push({
          id: `bullish_engulfing:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'bullish_engulfing',
          strength: clampNumber(currBody / Math.max(prevBody, 0.0001), 2),
          payload: { prevOpen: prev.o, prevClose: prev.c }
        });
      } else if (isBear(bar) && isBull(prev) && currBody >= prevBody && bar.c <= prev.o && bar.o >= prev.c) {
        events.push({
          id: `bearish_engulfing:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'bearish_engulfing',
          strength: clampNumber(currBody / Math.max(prevBody, 0.0001), 2),
          payload: { prevOpen: prev.o, prevClose: prev.c }
        });
      }
    }

    if (detectors.has('inside_bar') && barIndex > 0) {
      if (bar.h <= prev.h && bar.l >= prev.l) {
        events.push({
          id: `inside_bar:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'inside_bar',
          strength: clampNumber(prev.h - prev.l, 4),
          payload: { prevHigh: prev.h, prevLow: prev.l }
        });
      }
    }

    if (detectors.has('pin_bar') && barIndex > 0) {
      const body = Math.max(bodySize(bar), 0.0001);
      const upper = upperWick(bar);
      const lower = lowerWick(bar);
      if (lower >= body * 2 && lower > upper * 1.4) {
        events.push({
          id: `pin_bar_bull:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'pin_bar_bull',
          strength: clampNumber(lower / body, 2),
          payload: { lowerWick: lower, upperWick: upper }
        });
      } else if (upper >= body * 2 && upper > lower * 1.4) {
        events.push({
          id: `pin_bar_bear:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'pin_bar_bear',
          strength: clampNumber(upper / body, 2),
          payload: { lowerWick: lower, upperWick: upper }
        });
      }
    }

    if (detectors.has('fvg') && prev2) {
      const gapMin = atrNow != null ? Math.max(atrNow * 0.1, fallbackTol) : fallbackTol;
      if (prev2.h < bar.l && bar.l - prev2.h >= gapMin) {
        events.push({
          id: `fvg_bull:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'fvg_bull',
          strength: clampNumber(bar.l - prev2.h, 4),
          payload: { gapHigh: bar.l, gapLow: prev2.h, gapSize: bar.l - prev2.h }
        });
      } else if (prev2.l > bar.h && prev2.l - bar.h >= gapMin) {
        events.push({
          id: `fvg_bear:${session.symbol}:${session.timeframe}:${bar.t}`,
          symbol: session.symbol,
          timeframe: session.timeframe,
          ts: bar.t,
          type: 'fvg_bear',
          strength: clampNumber(prev2.l - bar.h, 4),
          payload: { gapHigh: prev2.l, gapLow: bar.h, gapSize: prev2.l - bar.h }
        });
      }
    }

    if (events.length === 0) return;
    for (const event of events) {
      const typeKey = `${event.type}:${event.ts}`;
      if (session.lastEventKeyByType.get(event.type) === typeKey) continue;
      session.lastEventKeyByType.set(event.type, typeKey);
      session.patterns.push(event);
      session.patterns = session.patterns.slice(-50);
      this.recentEvents.push(event);
      if (this.recentEvents.length > 200) this.recentEvents = this.recentEvents.slice(-200);
      this.onUpdate?.({ sessionId: session.id, revision: session.revision, updatedAtMs: session.updatedAtMs, event });

      if (watchKeys.length > 0) {
        for (const watch of watchKeys) {
          const eventId = `chart_event:${watch.watchId}:${event.type}:${event.ts}`;
          if (this.eventKeyCache.has(eventId)) continue;
          this.eventKeyCache.add(eventId);
          this.eventKeyOrder.push(eventId);
          if (this.eventKeyOrder.length > MAX_EVENT_KEY_CACHE) {
            const expired = this.eventKeyOrder.shift();
            if (expired) this.eventKeyCache.delete(expired);
          }
          const payloadEvent: PatternEvent = {
            ...event,
            id: eventId,
            watchId: watch.watchId
          };
          this.persistence?.appendEvent?.(payloadEvent);
        }
      }
    }
  }

  private bumpRevision(session: ChartSessionInternal) {
    session.revision += 1;
    this.onUpdate?.({ sessionId: session.id, revision: session.revision, updatedAtMs: session.updatedAtMs });
  }
}
