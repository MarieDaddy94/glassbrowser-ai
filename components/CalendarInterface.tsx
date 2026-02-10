import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import VirtualItem from './VirtualItem';
import type {
  CalendarPnlAccountOption,
  CalendarPnlDayAccountOverlay,
  CalendarPnlDayCell,
  CalendarPnlSnapshot,
  CalendarPnlTrade,
  CalendarRule
} from '../types';
import { createPanelActionRunner } from '../services/panelConnectivityEngine';

type SymbolSuggestion = {
  symbol: string;
  label?: string | null;
};

type CalendarEventPayload = {
  id?: string;
  type?: string;
  title?: string;
  startAtMs?: number;
  endAtMs?: number | null;
  status?: string | null;
  agentId?: string | null;
  broker?: string | null;
  signalId?: string | null;
  caseId?: string | null;
  lessonId?: string | null;
  outcome?: string | null;
  rMultiple?: number | null;
  durationMs?: number | null;
  notes?: string | null;
  metadata?: Record<string, any> | null;
};

type CalendarEventEntry = {
  key?: string;
  id?: string;
  kind?: string;
  symbol?: string | null;
  timeframe?: string | null;
  tags?: string[];
  payload?: CalendarEventPayload | null;
  createdAtMs?: number;
  updatedAtMs?: number;
};

type NormalizedCalendarEvent = {
  id: string;
  type: string;
  title: string;
  symbol: string | null;
  timeframe: string | null;
  broker: string | null;
  agentId: string | null;
  outcome: string | null;
  rMultiple: number | null;
  signalId: string | null;
  caseId: string | null;
  lessonId: string | null;
  startAtMs: number | null;
  endAtMs: number | null;
  durationMs: number | null;
  status: string | null;
  raw: CalendarEventEntry;
};

const STORAGE_KEY = 'glass_calendar_panel_v1';
const PNL_STORAGE_KEY = 'glass_calendar_pnl_ui_v1';
const DEFAULT_LIMIT = 800;
const DEFAULT_RANGE_HOURS = 168;
const PNL_TIMEZONE_PRESETS = ['UTC', 'America/New_York', 'America/Chicago', 'Europe/London', 'Asia/Tokyo'];

type CalendarTab = 'events' | 'pnl';
type CalendarPnlLoadInput = {
  monthKey: string;
  timezone: string;
  symbol?: string | null;
  agentId?: string | null;
  broker?: string | null;
  accountKey?: string | null;
  accountId?: number | null;
  accNum?: number | null;
};

const PNL_ACCOUNT_COLORS = [
  '#22c55e',
  '#38bdf8',
  '#a78bfa',
  '#fb7185',
  '#f59e0b',
  '#34d399',
  '#f472b6',
  '#60a5fa',
  '#14b8a6',
  '#f97316'
];

const readStoredConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readStoredPnlConfig = () => {
  try {
    const raw = localStorage.getItem(PNL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeStoredPnlConfig = (payload: any) => {
  try {
    localStorage.setItem(PNL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

const getMonthKeyForTimezone = (timezone: string, timestampMs: number = Date.now()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(new Date(timestampMs));
    const year = Number(parts.find((part) => part.type === 'year')?.value || '0');
    const month = Number(parts.find((part) => part.type === 'month')?.value || '0');
    if (year > 0 && month > 0) return `${year}-${String(month).padStart(2, '0')}`;
  } catch {
    // ignore
  }
  return new Date(timestampMs).toISOString().slice(0, 7);
};

const shiftMonthKey = (monthKey: string, delta: number) => {
  const raw = String(monthKey || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return raw;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return raw;
  const date = new Date(Date.UTC(year, month - 1 + Number(delta || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthKey: string, timezone: string) => {
  const raw = String(monthKey || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return raw || '--';
  const year = Number(match[1]);
  const month = Number(match[2]);
  try {
    const dt = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      month: 'long',
      year: 'numeric'
    }).format(dt);
  } catch {
    return `${match[2]}/${match[1]}`;
  }
};

const getWeekdayIndex = (dateKey: string, timezone: string) => {
  const match = String(dateKey || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0;
  try {
    const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const short = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(dt).slice(0, 3);
    const order = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const idx = order.findIndex((item) => item === short);
    if (idx >= 0) return idx;
  } catch {
    // ignore
  }
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

const buildMonthGrid = (monthKey: string, timezone: string): Array<string | null> => {
  const match = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDateKey = `${monthKey}-01`;
  const firstWeekday = getWeekdayIndex(firstDateKey, timezone);
  const result: Array<string | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) result.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    result.push(`${monthKey}-${String(day).padStart(2, '0')}`);
  }
  while (result.length % 7 !== 0) result.push(null);
  return result;
};

const formatMoney = (value?: number | null) => {
  if (!Number.isFinite(Number(value))) return '--';
  const next = Number(value);
  const sign = next >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(next).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const formatPct = (value?: number | null) => {
  if (!Number.isFinite(Number(value))) return '--';
  return `${(Number(value) * 100).toFixed(1)}%`;
};

const formatProfitFactor = (value?: number | null) => {
  if (!Number.isFinite(Number(value))) return '--';
  return Number(value).toFixed(2);
};

const writeStoredConfig = (payload: any) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

const formatAge = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const minutes = Math.max(1, Math.floor(delta / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const formatTimestamp = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return '--';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '--';
  }
};

const normalizeCalendarEvent = (entry: CalendarEventEntry): NormalizedCalendarEvent | null => {
  if (!entry) return null;
  const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
  const type = String(payload.type || '').trim();
  const symbol = entry.symbol ? String(entry.symbol).trim() : null;
  const timeframe = entry.timeframe ? String(entry.timeframe).trim() : null;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const agentTag = tags.find((tag) => String(tag || '').toLowerCase().startsWith('agent:')) || '';
  const agentId = (payload.agentId ? String(payload.agentId) : agentTag.replace(/^agent:/i, '')).trim() || null;
  const broker = payload.broker ? String(payload.broker) : null;
  const titleBase = payload.title ? String(payload.title) : '';
  const title = titleBase || [type, symbol, timeframe].filter(Boolean).join(' ');
  const id = String(payload.id || entry.id || entry.key || title || '').trim();
  const signalId = payload.signalId != null ? String(payload.signalId) : null;
  const caseId = payload.caseId != null ? String(payload.caseId) : null;
  const lessonId = payload.lessonId != null ? String(payload.lessonId) : null;
  const startAtMs = Number.isFinite(Number(payload.startAtMs))
    ? Number(payload.startAtMs)
    : Number.isFinite(Number(entry.createdAtMs))
      ? Number(entry.createdAtMs)
      : Number.isFinite(Number(entry.updatedAtMs))
        ? Number(entry.updatedAtMs)
        : null;
  const endAtMs = Number.isFinite(Number(payload.endAtMs)) ? Number(payload.endAtMs) : null;
  const durationMs = Number.isFinite(Number(payload.durationMs)) ? Number(payload.durationMs) : null;
  const outcome = payload.outcome ? String(payload.outcome).toUpperCase() : null;
  const rMultiple = Number.isFinite(Number(payload.rMultiple)) ? Number(payload.rMultiple) : null;
  const status = payload.status ? String(payload.status) : null;
  return {
    id: id || `calendar:${Math.random().toString(36).slice(2)}`,
    type: type || 'event',
    title,
    symbol,
    timeframe,
    broker,
    agentId,
    outcome,
    rMultiple,
    signalId,
    caseId,
    lessonId,
    startAtMs,
    endAtMs,
    durationMs,
    status,
    raw: entry
  };
};

interface CalendarInterfaceProps {
  rules?: CalendarRule[];
  onRefreshRules?: () => void;
  onUpsertRule?: (rule: CalendarRule) => Promise<any> | any;
  onToggleRule?: (id: string, enabled: boolean) => Promise<any> | any;
  onSearchSymbols?: (query: string) => Promise<SymbolSuggestion[]>;
  onSyncEvents?: () => Promise<any> | any;
  onLoadPnlSnapshot?: (input: CalendarPnlLoadInput) => Promise<CalendarPnlSnapshot> | CalendarPnlSnapshot;
  pnlAccountOptions?: CalendarPnlAccountOption[];
  pnlActiveAccountKey?: string | null;
  pnlEnabled?: boolean;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
}

const CalendarInterface: React.FC<CalendarInterfaceProps> = ({
  rules = [],
  onRefreshRules,
  onUpsertRule,
  onToggleRule,
  onSearchSymbols,
  onSyncEvents,
  onLoadPnlSnapshot,
  pnlAccountOptions = [],
  pnlActiveAccountKey = null,
  pnlEnabled = false,
  onRunActionCatalog
}) => {
  const runPanelAction = useMemo(
    () =>
      createPanelActionRunner({
        panel: 'calendar',
        runActionCatalog: onRunActionCatalog,
        defaultSource: 'catalog',
        defaultFallbackSource: 'ledger'
      }),
    [onRunActionCatalog]
  );
  const stored = readStoredConfig();
  const pnlStored = readStoredPnlConfig();
  const [events, setEvents] = useState<NormalizedCalendarEvent[]>([]);
  const [limit, setLimit] = useState(stored?.limit ?? DEFAULT_LIMIT);
  const [rangeHours, setRangeHours] = useState(stored?.rangeHours ?? DEFAULT_RANGE_HOURS);
  const [filterSymbol, setFilterSymbol] = useState(stored?.filterSymbol ?? '');
  const [filterType, setFilterType] = useState(stored?.filterType ?? 'all');
  const [filterOutcome, setFilterOutcome] = useState(stored?.filterOutcome ?? 'all');
  const [filterAgent, setFilterAgent] = useState(stored?.filterAgent ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<SymbolSuggestion[]>([]);
  const [symbolSuggestionsOpen, setSymbolSuggestionsOpen] = useState(false);
  const [symbolSuggestionsLoading, setSymbolSuggestionsLoading] = useState(false);
  const [symbolSuggestionsError, setSymbolSuggestionsError] = useState<string | null>(null);
  const [symbolInputFocused, setSymbolInputFocused] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const defaultTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const [activeTab, setActiveTab] = useState<CalendarTab>(() =>
    pnlEnabled && pnlStored?.activeTab === 'pnl' ? 'pnl' : 'events'
  );
  const [pnlTimezone, setPnlTimezone] = useState<string>(() => {
    const raw = String(pnlStored?.timezone || '').trim();
    return raw || defaultTimezone;
  });
  const [pnlMonthKey, setPnlMonthKey] = useState<string>(() => {
    const raw = String(pnlStored?.monthKey || '').trim();
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    return getMonthKeyForTimezone(defaultTimezone);
  });
  const [pnlAccountKey, setPnlAccountKey] = useState<string>(() => String(pnlStored?.accountKey || '').trim());
  const [pnlSnapshot, setPnlSnapshot] = useState<CalendarPnlSnapshot | null>(null);
  const [pnlSelectedDateKey, setPnlSelectedDateKey] = useState<string | null>(() => {
    const raw = String(pnlStored?.selectedDateKey || '').trim();
    return raw || null;
  });
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError] = useState<string | null>(null);
  const pnlCacheRef = useRef<Map<string, CalendarPnlSnapshot>>(new Map());

  const [ruleDraft, setRuleDraft] = useState<CalendarRule>(() => ({
    id: '',
    title: 'NY Session Auto Window',
    type: 'auto_window',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTimeLocal: '08:30',
    endTimeLocal: '11:30',
    timezone: defaultTimezone,
    enabled: true,
    appliesTo: null,
    createdAtMs: null,
    updatedAtMs: null
  }));

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await runPanelAction(
        'agent.memory.list',
        { limit, kind: 'calendar_event' },
        {
          fallback: async () => {
            const ledger = (window as any)?.glass?.tradeLedger;
            if (!ledger?.listAgentMemory) {
              return { ok: false, error: 'Calendar storage unavailable.' };
            }
            return await ledger.listAgentMemory({ limit, kind: 'calendar_event' });
          }
        }
      );
      if (!res?.ok) {
        setError(res?.error ? String(res.error) : 'Failed to load calendar events.');
        return;
      }
      const memories = Array.isArray(res?.data?.memories) ? res.data.memories : [];
      const normalized = memories
        .map((entry: CalendarEventEntry) => normalizeCalendarEvent(entry))
        .filter(Boolean) as NormalizedCalendarEvent[];
      setEvents(normalized);
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to load calendar events.');
    } finally {
      setIsLoading(false);
    }
  }, [limit, runPanelAction]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const loadPnlSnapshot = useCallback(async (opts?: { force?: boolean; monthKey?: string; timezone?: string }) => {
    if (!pnlEnabled) return;
    const monthKey = String(opts?.monthKey || pnlMonthKey || '').trim() || getMonthKeyForTimezone(pnlTimezone || defaultTimezone);
    const timezone = String(opts?.timezone || pnlTimezone || defaultTimezone).trim() || defaultTimezone;
    const symbol = String(filterSymbol || '').trim() || null;
    const agentId = String(filterAgent || '').trim() || null;
    const accountKeyRaw = String(pnlAccountKey || '').trim();
    const selectedAccount = accountKeyRaw
      ? (Array.isArray(pnlAccountOptions) ? pnlAccountOptions : []).find(
          (entry) => String(entry?.accountKey || '').trim().toLowerCase() === accountKeyRaw.toLowerCase()
        ) || null
      : null;
    const payload: CalendarPnlLoadInput = {
      monthKey,
      timezone,
      symbol,
      agentId,
      accountKey: accountKeyRaw || null,
      accountId: selectedAccount?.accountId ?? null,
      accNum: selectedAccount?.accNum ?? null
    };
    const cacheKey = [monthKey, timezone, symbol || '', agentId || '', accountKeyRaw || 'all'].join('|').toLowerCase();
    if (opts?.force !== true) {
      const cached = pnlCacheRef.current.get(cacheKey);
      if (cached) {
        setPnlSnapshot(cached);
        setPnlError(null);
        return;
      }
    }
    setPnlLoading(true);
    setPnlError(null);
    try {
      const res = await runPanelAction(
        'calendar.pnl.snapshot',
        payload as Record<string, any>,
        {
          fallback: async () => {
            if (!onLoadPnlSnapshot) {
              return { ok: false, error: 'P&L snapshot unavailable.' };
            }
            const data = await onLoadPnlSnapshot(payload);
            return { ok: true, data };
          },
          fallbackSource: 'ledger',
          timeoutMs: 12_000
        }
      );
      if (!res?.ok) {
        setPnlError(res?.error ? String(res.error) : 'Failed to load P&L snapshot.');
        return;
      }
      const snapshot = (res.data || null) as CalendarPnlSnapshot | null;
      if (!snapshot || typeof snapshot !== 'object') {
        setPnlError('P&L snapshot response is empty.');
        return;
      }
      pnlCacheRef.current.set(cacheKey, snapshot);
      setPnlSnapshot(snapshot);
      setPnlSelectedDateKey((prev) => {
        if (prev && snapshot.tradesByDate && Array.isArray(snapshot.tradesByDate[prev])) return prev;
        const firstKey = Object.keys(snapshot.tradesByDate || {}).sort()[0];
        return firstKey || null;
      });
      setPnlError(null);
    } catch (err: any) {
      setPnlError(err?.message ? String(err.message) : 'Failed to load P&L snapshot.');
    } finally {
      setPnlLoading(false);
    }
  }, [defaultTimezone, filterAgent, filterSymbol, onLoadPnlSnapshot, pnlAccountKey, pnlAccountOptions, pnlEnabled, pnlMonthKey, pnlTimezone, runPanelAction]);

  const handleRefresh = useCallback(async () => {
    if (activeTab === 'pnl' && pnlEnabled) {
      await loadPnlSnapshot({ force: true });
      return;
    }
    if (isSyncing) return;
    setSyncError(null);
    if (onSyncEvents) {
      setIsSyncing(true);
      try {
        const res = await onSyncEvents();
        if (res && res.ok === false) {
          setSyncError(res.error ? String(res.error) : 'Calendar sync failed.');
        }
      } catch (err: any) {
        setSyncError(err?.message ? String(err.message) : 'Calendar sync failed.');
      } finally {
        setIsSyncing(false);
      }
    }
    await loadEvents();
  }, [activeTab, isSyncing, loadEvents, loadPnlSnapshot, onSyncEvents, pnlEnabled]);

  useEffect(() => {
    writeStoredConfig({
      limit,
      rangeHours,
      filterSymbol,
      filterType,
      filterOutcome,
      filterAgent
    });
  }, [filterAgent, filterOutcome, filterSymbol, filterType, limit, rangeHours]);

  useEffect(() => {
    if (!pnlEnabled && activeTab === 'pnl') {
      setActiveTab('events');
    }
  }, [activeTab, pnlEnabled]);

  useEffect(() => {
    writeStoredPnlConfig({
      activeTab,
      timezone: pnlTimezone,
      monthKey: pnlMonthKey,
      accountKey: pnlAccountKey,
      selectedDateKey: pnlSelectedDateKey
    });
  }, [activeTab, pnlAccountKey, pnlMonthKey, pnlSelectedDateKey, pnlTimezone]);

  useEffect(() => {
    if (!pnlEnabled) return;
    if (activeTab !== 'pnl') return;
    void loadPnlSnapshot({ force: false });
  }, [activeTab, filterAgent, filterSymbol, loadPnlSnapshot, pnlAccountKey, pnlEnabled, pnlMonthKey, pnlTimezone]);

  const localSymbolSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: SymbolSuggestion[] = [];
    (events || []).forEach((event) => {
      const symbol = String(event.symbol || '').trim();
      if (!symbol) return;
      const key = symbol.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ symbol, label: 'Recent' });
    });
    return list;
  }, [events]);

  useEffect(() => {
    const query = String(filterSymbol || '').trim();
    const queryUpper = query.toUpperCase();
    if (!query) {
      const fallback = localSymbolSuggestions.slice(0, 12);
      setSymbolSuggestions(fallback);
      setSymbolSuggestionsOpen(symbolInputFocused && fallback.length > 0);
      setSymbolSuggestionsLoading(false);
      setSymbolSuggestionsError(null);
      return;
    }

    let active = true;
    const handle = window.setTimeout(async () => {
      if (!active) return;
      setSymbolSuggestionsLoading(!!onSearchSymbols);
      setSymbolSuggestionsError(null);
      try {
        const primary = onSearchSymbols ? await onSearchSymbols(query) : [];
        if (!active) return;
        const seen = new Set<string>();
        const results: SymbolSuggestion[] = [];
        const push = (entry: SymbolSuggestion, labelOverride?: string | null) => {
          const symbol = String(entry.symbol || '').trim();
          if (!symbol) return;
          const key = symbol.toUpperCase();
          if (seen.has(key)) return;
          seen.add(key);
          results.push({ symbol, label: labelOverride ?? entry.label ?? null });
        };
        (Array.isArray(primary) ? primary : []).forEach((entry) => push(entry));
        localSymbolSuggestions.forEach((entry) => {
          if (queryUpper && !entry.symbol.toUpperCase().includes(queryUpper)) return;
          push(entry, entry.label || 'Recent');
        });
        const merged = results.slice(0, 12);
        setSymbolSuggestions(merged);
        setSymbolSuggestionsOpen(symbolInputFocused && merged.length > 0);
      } catch (err: any) {
        if (!active) return;
        setSymbolSuggestions([]);
        setSymbolSuggestionsOpen(false);
        setSymbolSuggestionsError(err?.message ? String(err.message) : 'Unable to search symbols.');
      } finally {
        if (active) setSymbolSuggestionsLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [filterSymbol, localSymbolSuggestions, onSearchSymbols, symbolInputFocused]);

  const filteredEvents = useMemo(() => {
    const sinceMs = Date.now() - rangeHours * 60 * 60 * 1000;
    const symbolKey = String(filterSymbol || '').trim().toLowerCase();
    const typeKey = String(filterType || '').trim().toLowerCase();
    const outcomeKey = String(filterOutcome || '').trim().toLowerCase();
    const agentKey = String(filterAgent || '').trim().toLowerCase();

    return (events || [])
      .filter((event) => {
        const ts = event.startAtMs || event.raw?.createdAtMs || 0;
        if (ts && ts < sinceMs) return false;
        if (symbolKey && String(event.symbol || '').toLowerCase() !== symbolKey) return false;
        if (typeKey && typeKey !== 'all' && String(event.type || '').toLowerCase() !== typeKey) return false;
        if (outcomeKey && outcomeKey !== 'all') {
          const outcome = String(event.outcome || '').toLowerCase();
          if (!outcome || outcome !== outcomeKey) return false;
        }
        if (agentKey && String(event.agentId || '').toLowerCase() !== agentKey) return false;
        return true;
      })
      .sort((a, b) => (b.startAtMs || 0) - (a.startAtMs || 0));
  }, [events, filterAgent, filterOutcome, filterSymbol, filterType, rangeHours]);

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    events.forEach((event) => {
      if (event.type) seen.add(event.type.toLowerCase());
    });
    return ['all', ...Array.from(seen).sort()].slice(0, 30);
  }, [events]);

  const summary = useMemo(() => {
    const symbols = new Set<string>();
    const outcomes: Record<string, number> = {};
    filteredEvents.forEach((event) => {
      if (event.symbol) symbols.add(event.symbol);
      const outcome = event.outcome ? String(event.outcome).toUpperCase() : 'NONE';
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    });
    return { symbols: symbols.size, outcomes };
  }, [filteredEvents]);

  const performanceSummary = useMemo(() => {
    let wins = 0;
    let losses = 0;
    const byHour: Record<number, number> = {};
    const byDay: Record<number, number> = {};
    filteredEvents.forEach((event) => {
      const outcome = event.outcome ? String(event.outcome).toUpperCase() : '';
      if (!outcome || (outcome !== 'WIN' && outcome !== 'LOSS')) return;
      if (outcome === 'WIN') wins += 1;
      if (outcome === 'LOSS') losses += 1;
      const ts = event.startAtMs;
      if (!ts) return;
      const date = new Date(ts);
      const hour = date.getHours();
      const day = date.getDay();
      byHour[hour] = (byHour[hour] || 0) + 1;
      byDay[day] = (byDay[day] || 0) + 1;
    });
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : null;
    const topHour = Object.entries(byHour).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const topDay = Object.entries(byDay).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    return {
      wins,
      losses,
      winRate,
      topHour: topHour ? Number(topHour[0]) : null,
      topDay: topDay ? Number(topDay[0]) : null
    };
  }, [filteredEvents]);

  const sessionAnalytics = useMemo(() => {
    const sessions = [
      { id: 'asia', label: 'Asia', start: 0, end: 7 },
      { id: 'london', label: 'London', start: 7, end: 13 },
      { id: 'ny', label: 'NY', start: 13, end: 21 },
      { id: 'after', label: 'After', start: 21, end: 24 }
    ];
    const buckets = sessions.map((session) => ({
      ...session,
      trades: 0,
      wins: 0,
      losses: 0,
      be: 0,
      rSum: 0,
      rCount: 0,
      durationSum: 0,
      durationCount: 0
    }));
    const byDay: Record<number, { wins: number; losses: number; be: number; trades: number }> = {};
    const byHour: Record<number, number> = {};
    const bySymbol: Record<string, { wins: number; losses: number; trades: number }> = {};
    const byTimeframe: Record<string, { wins: number; losses: number; trades: number }> = {};
    const byAgent: Record<string, { wins: number; losses: number; trades: number }> = {};
    const outcomes: Array<{ outcome: string; ts: number | null }> = [];
    const signalMap = new Map<string, { proposed?: number; executed?: number; resolved?: number }>();

    filteredEvents.forEach((event) => {
      const outcome = event.outcome ? String(event.outcome).toUpperCase() : '';
      const hasOutcome = outcome === 'WIN' || outcome === 'LOSS' || outcome === 'BE';
      const ts = event.startAtMs || event.endAtMs || null;
      if (hasOutcome && ts) {
        const date = new Date(ts);
        const hour = date.getHours();
        const day = date.getDay();
        byHour[hour] = (byHour[hour] || 0) + 1;
        byDay[day] = byDay[day] || { wins: 0, losses: 0, be: 0, trades: 0 };
        byDay[day].trades += 1;
        if (outcome === 'WIN') byDay[day].wins += 1;
        if (outcome === 'LOSS') byDay[day].losses += 1;
        if (outcome === 'BE') byDay[day].be += 1;

        const session = buckets.find((bucket) => hour >= bucket.start && hour < bucket.end) || buckets[buckets.length - 1];
        session.trades += 1;
        if (outcome === 'WIN') session.wins += 1;
        if (outcome === 'LOSS') session.losses += 1;
        if (outcome === 'BE') session.be += 1;
        if (event.rMultiple != null) {
          session.rSum += event.rMultiple;
          session.rCount += 1;
        }
        if (event.durationMs != null) {
          session.durationSum += event.durationMs;
          session.durationCount += 1;
        }

        const symbol = event.symbol ? String(event.symbol) : '';
        if (symbol) {
          bySymbol[symbol] = bySymbol[symbol] || { wins: 0, losses: 0, trades: 0 };
          bySymbol[symbol].trades += 1;
          if (outcome === 'WIN') bySymbol[symbol].wins += 1;
          if (outcome === 'LOSS') bySymbol[symbol].losses += 1;
        }
        const timeframe = event.timeframe ? String(event.timeframe) : '';
        if (timeframe) {
          byTimeframe[timeframe] = byTimeframe[timeframe] || { wins: 0, losses: 0, trades: 0 };
          byTimeframe[timeframe].trades += 1;
          if (outcome === 'WIN') byTimeframe[timeframe].wins += 1;
          if (outcome === 'LOSS') byTimeframe[timeframe].losses += 1;
        }
        const agentId = event.agentId ? String(event.agentId) : '';
        if (agentId) {
          byAgent[agentId] = byAgent[agentId] || { wins: 0, losses: 0, trades: 0 };
          byAgent[agentId].trades += 1;
          if (outcome === 'WIN') byAgent[agentId].wins += 1;
          if (outcome === 'LOSS') byAgent[agentId].losses += 1;
        }

        outcomes.push({ outcome, ts });
      }

      if (event.signalId) {
        const entry = signalMap.get(event.signalId) || {};
        if (event.type === 'signal_proposed') entry.proposed = entry.proposed ?? ts ?? event.startAtMs ?? event.endAtMs ?? null;
        if (event.type === 'signal_executed') entry.executed = entry.executed ?? ts ?? event.startAtMs ?? event.endAtMs ?? null;
        if (event.type === 'signal_outcome_resolved') entry.resolved = entry.resolved ?? event.endAtMs ?? event.startAtMs ?? null;
        signalMap.set(event.signalId, entry);
      }
    });

    outcomes.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let winStreak = 0;
    let lossStreak = 0;
    outcomes.forEach((entry) => {
      if (entry.outcome === 'WIN') {
        winStreak += 1;
        lossStreak = 0;
      } else if (entry.outcome === 'LOSS') {
        lossStreak += 1;
        winStreak = 0;
      } else {
        winStreak = 0;
        lossStreak = 0;
      }
      maxWinStreak = Math.max(maxWinStreak, winStreak);
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    });

    const signalCycles = Array.from(signalMap.values());
    let toExecuteSum = 0;
    let toResolveSum = 0;
    let toOutcomeSum = 0;
    let toExecuteCount = 0;
    let toResolveCount = 0;
    let toOutcomeCount = 0;
    signalCycles.forEach((cycle) => {
      if (cycle.proposed != null && cycle.executed != null && cycle.executed >= cycle.proposed) {
        toExecuteSum += cycle.executed - cycle.proposed;
        toExecuteCount += 1;
      }
      if (cycle.executed != null && cycle.resolved != null && cycle.resolved >= cycle.executed) {
        toResolveSum += cycle.resolved - cycle.executed;
        toResolveCount += 1;
      }
      if (cycle.proposed != null && cycle.resolved != null && cycle.resolved >= cycle.proposed) {
        toOutcomeSum += cycle.resolved - cycle.proposed;
        toOutcomeCount += 1;
      }
    });

    const top = (record: Record<string, { wins: number; losses: number; trades: number }>) => {
      return Object.entries(record)
        .map(([key, value]) => ({
          key,
          trades: value.trades,
          winRate: value.trades > 0 ? Math.round((value.wins / value.trades) * 100) : 0
        }))
        .sort((a, b) => b.trades - a.trades)
        .slice(0, 5);
    };

    return {
      sessions: buckets.map((bucket) => ({
        ...bucket,
        winRate: bucket.trades > 0 ? Math.round((bucket.wins / bucket.trades) * 100) : null,
        avgR: bucket.rCount > 0 ? bucket.rSum / bucket.rCount : null,
        avgDurationMin: bucket.durationCount > 0 ? Math.round((bucket.durationSum / bucket.durationCount) / 60000) : null
      })),
      byDay,
      byHour,
      topSymbols: top(bySymbol),
      topTimeframes: top(byTimeframe),
      topAgents: top(byAgent),
      maxWinStreak,
      maxLossStreak,
      cycleStats: {
        avgToExecuteMin: toExecuteCount > 0 ? Math.round(toExecuteSum / toExecuteCount / 60000) : null,
        avgToResolveMin: toResolveCount > 0 ? Math.round(toResolveSum / toResolveCount / 60000) : null,
        avgToOutcomeMin: toOutcomeCount > 0 ? Math.round(toOutcomeSum / toOutcomeCount / 60000) : null
      }
    };
  }, [filteredEvents]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pnlMonthGrid = useMemo(() => buildMonthGrid(pnlMonthKey, pnlTimezone), [pnlMonthKey, pnlTimezone]);
  const pnlCellByDate = useMemo(() => {
    const map = new Map<string, CalendarPnlDayCell>();
    const cells = Array.isArray(pnlSnapshot?.cells) ? pnlSnapshot?.cells : [];
    cells.forEach((cell) => {
      if (!cell?.dateKey) return;
      map.set(cell.dateKey, cell);
    });
    return map;
  }, [pnlSnapshot]);
  const pnlSelectedTrades = useMemo(() => {
    if (!pnlSelectedDateKey) return [] as CalendarPnlTrade[];
    const trades = pnlSnapshot?.tradesByDate?.[pnlSelectedDateKey];
    return Array.isArray(trades) ? trades : [];
  }, [pnlSelectedDateKey, pnlSnapshot]);
  const pnlMaxAbsDayPnl = useMemo(() => {
    const cells = Array.isArray(pnlSnapshot?.cells) ? pnlSnapshot?.cells : [];
    let maxAbs = 0;
    cells.forEach((cell) => {
      const abs = Math.abs(Number(cell?.netPnl || 0));
      if (abs > maxAbs) maxAbs = abs;
    });
    return maxAbs;
  }, [pnlSnapshot]);
  const getPnlCellTone = useCallback((netPnl: number, tradeCount: number) => {
    if (!tradeCount) return 'border-white/10 bg-white/[0.02] text-gray-500';
    if (netPnl === 0) return 'border-white/15 bg-slate-500/10 text-slate-100';
    const ratio = pnlMaxAbsDayPnl > 0 ? Math.min(1, Math.abs(netPnl) / pnlMaxAbsDayPnl) : 0;
    if (netPnl > 0) {
      if (ratio > 0.66) return 'border-emerald-300/50 bg-emerald-500/30 text-emerald-50';
      if (ratio > 0.33) return 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100';
      return 'border-emerald-300/30 bg-emerald-500/12 text-emerald-100';
    }
    if (ratio > 0.66) return 'border-rose-300/50 bg-rose-500/30 text-rose-50';
    if (ratio > 0.33) return 'border-rose-300/40 bg-rose-500/20 text-rose-100';
    return 'border-rose-300/30 bg-rose-500/12 text-rose-100';
  }, [pnlMaxAbsDayPnl]);
  const pnlMergedAccountOptions = useMemo(() => {
    const map = new Map<string, CalendarPnlAccountOption>();
    const add = (entry: any) => {
      const key = String(entry?.accountKey || '').trim();
      if (!key) return;
      const normalized = key.toLowerCase();
      if (map.has(normalized)) return;
      const label = String(entry?.label || '').trim() || key;
      map.set(normalized, {
        accountKey: key,
        label,
        broker: entry?.broker ? String(entry.broker) : null,
        accountId: Number.isFinite(Number(entry?.accountId)) ? Number(entry.accountId) : null,
        accNum: Number.isFinite(Number(entry?.accNum)) ? Number(entry.accNum) : null,
        env: entry?.env ? String(entry.env) : null,
        server: entry?.server ? String(entry.server) : null,
        isActive: false
      });
    };
    (Array.isArray(pnlAccountOptions) ? pnlAccountOptions : []).forEach(add);
    (Array.isArray(pnlSnapshot?.availableAccounts) ? pnlSnapshot?.availableAccounts : []).forEach(add);
    const activeKey = String(pnlActiveAccountKey || '').trim().toLowerCase();
    return Array.from(map.values())
      .map((item) => ({ ...item, isActive: !!activeKey && activeKey === item.accountKey.toLowerCase() }))
      .sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return String(a.label).localeCompare(String(b.label));
      });
  }, [pnlAccountOptions, pnlActiveAccountKey, pnlSnapshot?.availableAccounts]);
  const selectedPnlAccount = useMemo(() => {
    const key = String(pnlAccountKey || '').trim().toLowerCase();
    if (!key) return null;
    return pnlMergedAccountOptions.find((entry) => String(entry.accountKey || '').trim().toLowerCase() === key) || null;
  }, [pnlAccountKey, pnlMergedAccountOptions]);
  useEffect(() => {
    const key = String(pnlAccountKey || '').trim().toLowerCase();
    if (!key) return;
    if (pnlLoading) return;
    const hasOptions = pnlMergedAccountOptions.length > 0 || !!pnlSnapshot;
    if (!hasOptions) return;
    const exists = pnlMergedAccountOptions.some(
      (entry) => String(entry.accountKey || '').trim().toLowerCase() === key
    );
    if (!exists) setPnlAccountKey('');
  }, [pnlAccountKey, pnlLoading, pnlMergedAccountOptions, pnlSnapshot]);
  const pnlIsAllAccounts = !String(pnlAccountKey || '').trim();
  const pnlAccountColorByKey = useMemo(() => {
    const map = new Map<string, string>();
    const summaries = Array.isArray(pnlSnapshot?.accountSummaries) ? pnlSnapshot.accountSummaries : [];
    summaries.forEach((summary: any, idx) => {
      const key = String(summary?.accountKey || '').trim();
      if (!key) return;
      map.set(key, PNL_ACCOUNT_COLORS[idx % PNL_ACCOUNT_COLORS.length]);
    });
    return map;
  }, [pnlSnapshot?.accountSummaries]);
  const pnlAccountOverlaysByDate = useMemo(() => {
    const map = new Map<string, CalendarPnlDayAccountOverlay[]>();
    const source = pnlSnapshot?.accountOverlaysByDate && typeof pnlSnapshot.accountOverlaysByDate === 'object'
      ? pnlSnapshot.accountOverlaysByDate
      : {};
    Object.entries(source).forEach(([dateKey, items]) => {
      if (!Array.isArray(items)) return;
      map.set(dateKey, items as CalendarPnlDayAccountOverlay[]);
    });
    return map;
  }, [pnlSnapshot]);
  const pnlSourceSummary = pnlSnapshot?.sourceSummary || null;

  const handleToggleDraftDay = (day: number) => {
    setRuleDraft((prev) => {
      const nextDays = new Set(prev.daysOfWeek || []);
      if (nextDays.has(day)) nextDays.delete(day);
      else nextDays.add(day);
      return { ...prev, daysOfWeek: Array.from(nextDays).sort() };
    });
  };

  const handleSaveRule = async () => {
    if (!onUpsertRule) return;
    const title = String(ruleDraft.title || '').trim() || 'Auto Window';
    const id = ruleDraft.id && ruleDraft.id.trim().length > 0 ? ruleDraft.id.trim() : `rule_${Date.now()}`;
    const payload: CalendarRule = {
      ...ruleDraft,
      id,
      title
    };
    setIsSavingRule(true);
    try {
      await onUpsertRule(payload);
      onRefreshRules?.();
      setRuleDraft((prev) => ({ ...prev, id: '', title: 'NY Session Auto Window' }));
    } finally {
      setIsSavingRule(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#050505]">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-slate-900/30 to-black">
        <div className="flex items-center gap-2 text-slate-200 text-xs uppercase tracking-wider font-bold">
          <Calendar size={14} />
          <span>Calendar</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="ml-auto px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
          >
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={12} />
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </span>
          </button>
        </div>
        <div className="mt-2 text-[11px] text-gray-500">
          {activeTab === 'pnl' && pnlEnabled
            ? `${formatMonthLabel(pnlMonthKey, pnlTimezone)} • ${Number(pnlSnapshot?.monthSummary?.tradeCount || 0)} closed trades${
                selectedPnlAccount ? ` • ${selectedPnlAccount.label}` : ' • all accounts'
              }`
            : (isLoading ? 'Loading calendar events...' : `${filteredEvents.length} events • ${summary.symbols} symbols`)}
        </div>
        {activeTab === 'events' || !pnlEnabled ? (
          <>
            <div className="mt-1 text-[10px] text-gray-500">
              {performanceSummary.winRate != null
                ? `Win rate ${performanceSummary.winRate}% • Top hour ${performanceSummary.topHour != null ? `${performanceSummary.topHour}:00` : '--'} • Top day ${performanceSummary.topDay != null ? dayLabels[performanceSummary.topDay] : '--'}`
                : 'No resolved outcomes yet.'}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              {sessionAnalytics.cycleStats.avgToOutcomeMin != null
                ? `Avg to execute ${sessionAnalytics.cycleStats.avgToExecuteMin ?? '--'}m • Avg to resolve ${sessionAnalytics.cycleStats.avgToResolveMin ?? '--'}m • Avg to outcome ${sessionAnalytics.cycleStats.avgToOutcomeMin ?? '--'}m`
                : 'No signal cycle timing yet.'}
            </div>
          </>
        ) : (
          <div className="mt-1 text-[10px] text-gray-500">
            Win rate {formatPct(pnlSnapshot?.monthSummary?.winRate)} • Profit factor {formatProfitFactor(pnlSnapshot?.monthSummary?.profitFactor)} • Active days {Number(pnlSnapshot?.monthSummary?.activeDays || 0)}
          </div>
        )}
        {syncError && (
          <div className="mt-2 text-[10px] text-amber-300">
            Calendar sync failed: {syncError}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`px-2 py-1 rounded border ${
              activeTab === 'events'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                : 'border-white/10 text-gray-400 hover:bg-white/5'
            }`}
          >
            Events / Rules
          </button>
          {pnlEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab('pnl')}
              className={`px-2 py-1 rounded border ${
                activeTab === 'pnl'
                  ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                  : 'border-white/10 text-gray-400 hover:bg-white/5'
              }`}
            >
              PnL Calendar
            </button>
          )}
        </div>
      </div>

      {pnlEnabled && activeTab === 'pnl' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPnlMonthKey((prev) => shiftMonthKey(prev, -1))}
                className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
              >
                Prev
              </button>
              <div className="text-sm font-semibold text-gray-100 min-w-[170px]">
                {formatMonthLabel(pnlMonthKey, pnlTimezone)}
              </div>
              <button
                type="button"
                onClick={() => setPnlMonthKey((prev) => shiftMonthKey(prev, 1))}
                className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
              >
                Next
              </button>
              <label className="flex items-center gap-2 text-[11px] text-gray-400">
                <span>Account</span>
                <select
                  value={pnlAccountKey}
                  onChange={(event) => setPnlAccountKey(String(event.target.value || '').trim())}
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 min-w-[220px]"
                >
                  <option value="">All accounts</option>
                  {pnlMergedAccountOptions.map((entry) => (
                    <option key={entry.accountKey} value={entry.accountKey}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPnlAccount && (
                <div
                  className={`text-[10px] px-2 py-1 rounded border ${
                    selectedPnlAccount.isActive
                      ? 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10'
                      : 'border-amber-400/40 text-amber-200 bg-amber-500/10'
                  }`}
                  title={selectedPnlAccount.isActive ? 'Selected account is active in TradeLocker' : 'Selected account is not currently active in TradeLocker'}
                >
                  {selectedPnlAccount.isActive ? 'Active account' : 'Not active'}
                </div>
              )}
              <label className="ml-auto flex items-center gap-2 text-[11px] text-gray-400">
                <span>Timezone</span>
                <input
                  list="calendar-pnl-timezones"
                  value={pnlTimezone}
                  onChange={(event) => setPnlTimezone(String(event.target.value || '').trim() || defaultTimezone)}
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 w-[180px]"
                />
                <datalist id="calendar-pnl-timezones">
                  {PNL_TIMEZONE_PRESETS.map((timezone) => (
                    <option key={timezone} value={timezone} />
                  ))}
                </datalist>
              </label>
              <button
                type="button"
                onClick={() => {
                  pnlCacheRef.current.clear();
                  void loadPnlSnapshot({ force: true });
                }}
                className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
              >
                <span className="inline-flex items-center gap-1">
                  <RefreshCw size={12} />
                  {pnlLoading ? 'Refreshing...' : 'Refresh'}
                </span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
                <div className="text-[10px] text-emerald-200/80 uppercase tracking-wider">Net P&amp;L</div>
                <div className="text-lg font-semibold text-emerald-100">{formatMoney(pnlSnapshot?.kpis?.netPnl ?? 0)}</div>
              </div>
              <div className="rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2">
                <div className="text-[10px] text-sky-200/80 uppercase tracking-wider">Account Balance &amp; P&amp;L</div>
                <div className="text-sm text-sky-100">Balance {formatMoney(pnlSnapshot?.kpis?.accountBalance)}</div>
                <div className="text-sm text-sky-100">Equity {formatMoney(pnlSnapshot?.kpis?.accountEquity)}</div>
              </div>
              <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-3 py-2">
                <div className="text-[10px] text-indigo-200/80 uppercase tracking-wider">Profit Factor</div>
                <div className="text-lg font-semibold text-indigo-100">{formatProfitFactor(pnlSnapshot?.kpis?.profitFactor)}</div>
              </div>
              <div className="rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2">
                <div className="text-[10px] text-violet-200/80 uppercase tracking-wider">Trade Win %</div>
                <div className="text-lg font-semibold text-violet-100">{formatPct(pnlSnapshot?.kpis?.winRate)}</div>
              </div>
            </div>
            <div className="text-[11px] text-gray-400 flex flex-wrap items-center gap-4">
              <span>Monthly stats: {formatMoney(pnlSnapshot?.monthSummary?.netPnl ?? 0)}</span>
              <span>Active days: {Number(pnlSnapshot?.monthSummary?.activeDays || 0)}</span>
              <span>Trades: {Number(pnlSnapshot?.monthSummary?.tradeCount || 0)}</span>
              <span>Wins/Losses: {Number(pnlSnapshot?.monthSummary?.wins || 0)}/{Number(pnlSnapshot?.monthSummary?.losses || 0)}</span>
              <span>PF: {formatProfitFactor(pnlSnapshot?.monthSummary?.profitFactor)}</span>
            </div>
            {pnlSourceSummary && (
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                <span className="text-gray-500">Realized PnL source:</span>
                <span className="px-2 py-0.5 rounded border border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
                  Ledger {pnlSourceSummary.ledgerTrades} ({formatMoney(pnlSourceSummary.ledgerNetPnl)})
                </span>
                <span className="px-2 py-0.5 rounded border border-sky-400/30 bg-sky-500/10 text-sky-100">
                  Broker {pnlSourceSummary.brokerTrades} ({formatMoney(pnlSourceSummary.brokerNetPnl)})
                </span>
                {pnlSourceSummary.unknownTrades > 0 && (
                  <span className="px-2 py-0.5 rounded border border-amber-400/30 bg-amber-500/10 text-amber-100">
                    Unknown {pnlSourceSummary.unknownTrades} ({formatMoney(pnlSourceSummary.unknownNetPnl)})
                  </span>
                )}
              </div>
            )}
            {(filterSymbol || filterAgent || selectedPnlAccount) && (
              <div className="text-[10px] text-gray-500">
                Filters applied to PnL:
                {filterSymbol ? ` symbol=${filterSymbol}` : ''}
                {filterAgent ? ` agent=${filterAgent}` : ''}
                {selectedPnlAccount ? ` account=${selectedPnlAccount.label}` : ''}
              </div>
            )}
            {Array.isArray(pnlSnapshot?.accountSummaries) && pnlSnapshot.accountSummaries.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Per-account month overlay</div>
                <div className="flex flex-wrap gap-2">
                  {pnlSnapshot.accountSummaries.slice(0, 10).map((summary) => {
                    const key = String(summary.accountKey || '');
                    const color = pnlAccountColorByKey.get(key) || '#64748b';
                    const isSelected = !!pnlAccountKey && pnlAccountKey.toLowerCase() === key.toLowerCase();
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPnlAccountKey((prev) => (prev.toLowerCase() === key.toLowerCase() ? '' : key))}
                        className={`px-2 py-1 rounded border text-[10px] text-left ${
                          isSelected
                            ? 'border-sky-300/50 bg-sky-500/15 text-sky-100'
                            : 'border-white/10 bg-black/30 text-gray-300 hover:bg-white/5'
                        }`}
                        title={`${summary.label} • ${summary.tradeCount} trades • ${formatMoney(summary.netPnl)}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-medium">{summary.label}</span>
                        </div>
                        <div className="opacity-80">
                          {formatMoney(summary.netPnl)} • {summary.tradeCount} trade{summary.tradeCount === 1 ? '' : 's'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {pnlError && (
              <div className="text-xs text-red-300 border border-red-500/30 bg-red-500/10 rounded-md px-3 py-2">
                {pnlError}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-hidden grid grid-cols-1 xl:grid-cols-[1fr_360px]">
            <div className="overflow-y-auto custom-scrollbar p-4">
              <div className="grid grid-cols-7 gap-2 text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                {dayLabels.map((label) => (
                  <div key={`pnl-day-header-${label}`} className="px-1">{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {pnlMonthGrid.map((dateKey, idx) => {
                  if (!dateKey) {
                    return <div key={`pnl-empty-${idx}`} className="min-h-[84px] rounded-md border border-transparent" />;
                  }
                  const cell = pnlCellByDate.get(dateKey) || null;
                  const tradeCount = Number(cell?.tradeCount || 0);
                  const netPnl = Number(cell?.netPnl || 0);
                  const isSelected = pnlSelectedDateKey === dateKey;
                  const dayOverlays = pnlIsAllAccounts
                    ? (pnlAccountOverlaysByDate.get(dateKey) || []).slice(0, 3)
                    : [];
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => setPnlSelectedDateKey(dateKey)}
                      className={`min-h-[84px] rounded-md border px-2 py-1 text-left transition ${getPnlCellTone(netPnl, tradeCount)} ${
                        isSelected ? 'ring-1 ring-sky-300/70' : ''
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{dateKey.slice(-2)}</div>
                      {cell ? (
                        <div className="mt-1 space-y-0.5">
                          <div className="text-[11px]">{formatMoney(cell.netPnl)}</div>
                          <div className="text-[10px] opacity-80">Win {formatPct(cell.winRate)}</div>
                          <div className="text-[10px] opacity-70">{cell.tradeCount} trade{cell.tradeCount === 1 ? '' : 's'}</div>
                          {dayOverlays.length > 0 && (
                            <div className="mt-1 flex items-center gap-1" title={dayOverlays.map((item) => `${item.label}: ${formatMoney(item.netPnl)}`).join(' • ')}>
                              {dayOverlays.map((overlay) => (
                                <span
                                  key={`${dateKey}:${overlay.accountKey}`}
                                  className="inline-block h-1.5 flex-1 rounded-sm"
                                  style={{ backgroundColor: pnlAccountColorByKey.get(overlay.accountKey || '') || '#64748b' }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-[10px] opacity-70">$0</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t xl:border-t-0 xl:border-l border-white/5 p-4 overflow-y-auto custom-scrollbar space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">
                {pnlSelectedDateKey ? `Closed Trades • ${pnlSelectedDateKey}` : 'Closed Trades'}
              </div>
              {!pnlSelectedDateKey && (
                <div className="text-xs text-gray-500">Select a day to view closed trades.</div>
              )}
              {pnlSelectedDateKey && pnlSelectedTrades.length === 0 && (
                <div className="text-xs text-gray-500">No closed trades for this day.</div>
              )}
              {pnlSelectedTrades.map((trade) => (
                <div key={trade.id} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-100 font-semibold">{trade.symbol || '--'} • {trade.side}</div>
                    <div className={`${trade.realizedPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'} font-semibold`}>
                      {formatMoney(trade.realizedPnl)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span
                      className={`px-1.5 py-0.5 rounded border ${
                        trade.pnlSourceKind === 'broker'
                          ? 'border-sky-400/40 bg-sky-500/10 text-sky-200'
                          : trade.pnlSourceKind === 'ledger'
                            ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                      }`}
                      title={trade.realizedPnlSource || 'No source metadata'}
                    >
                      Src {String(trade.pnlSourceKind || 'unknown').toUpperCase()}
                    </span>
                    {trade.accountLabel && (
                      <span className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-gray-300">
                        {trade.accountLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] text-gray-400">
                    <span>{new Date(trade.closedAtMs).toLocaleTimeString()}</span>
                    <span>Broker {trade.broker || '--'}</span>
                    <span>Agent {trade.agentId || '--'}</span>
                    <span>R {trade.rMultiple != null ? trade.rMultiple.toFixed(2) : '--'}</span>
                    <span>Result {String(trade.winLoss || '').toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-hidden flex flex-col ${activeTab === 'events' || !pnlEnabled ? '' : 'hidden'}`}>
        <div className="p-4 border-b border-white/5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="flex flex-col gap-1">
            Range
            <select
              value={String(rangeHours)}
              onChange={(e) => setRangeHours(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            >
              <option value="6">Last 6h</option>
              <option value="24">Last 24h</option>
              <option value="72">Last 3d</option>
              <option value="168">Last 7d</option>
              <option value="720">Last 30d</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Type
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            >
              {typeOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Outcome
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            >
              <option value="all">all</option>
              <option value="win">win</option>
              <option value="loss">loss</option>
              <option value="be">be</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Filter Symbol
            <div className="relative">
              <input
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
                onFocus={() => {
                  setSymbolInputFocused(true);
                  if (symbolSuggestions.length > 0) setSymbolSuggestionsOpen(true);
                }}
                onBlur={() => {
                  setSymbolInputFocused(false);
                  window.setTimeout(() => setSymbolSuggestionsOpen(false), 120);
                }}
                placeholder="XAUUSD.R"
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 w-full"
                autoComplete="off"
              />
              {symbolSuggestionsOpen && symbolSuggestions.length > 0 && (
                <div className="absolute z-20 mt-2 w-full rounded-md border border-white/10 bg-black/80 shadow-xl max-h-56 overflow-auto">
                  {symbolSuggestions.map((entry) => (
                    <button
                      key={`${entry.symbol}-${entry.label || ''}`}
                      type="button"
                      onClick={() => {
                        setFilterSymbol(entry.symbol);
                        setSymbolSuggestionsOpen(false);
                      }}
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
              {symbolSuggestionsLoading && (
                <div className="mt-1 text-[10px] text-gray-500">Searching symbols...</div>
              )}
              {symbolSuggestionsError && (
                <div className="mt-1 text-[10px] text-amber-300">{symbolSuggestionsError}</div>
              )}
            </div>
          </label>
          <label className="flex flex-col gap-1">
            Agent Id
            <input
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              placeholder="agent id"
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            Limit
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.max(50, Math.min(5000, Number(e.target.value))))}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            />
          </label>
        </div>

        <div className="p-4 border-b border-white/5 space-y-3">
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>Automation Rules</span>
            <button
              type="button"
              onClick={() => onRefreshRules?.()}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
            >
              Refresh Rules
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Title
              <input
                value={ruleDraft.title}
                onChange={(e) => setRuleDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              Type
              <select
                value={ruleDraft.type}
                onChange={(e) => setRuleDraft((prev) => ({ ...prev, type: e.target.value === 'blackout' ? 'blackout' : 'auto_window' }))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              >
                <option value="auto_window">Auto Window</option>
                <option value="blackout">Blackout</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Timezone
              <input
                value={ruleDraft.timezone}
                onChange={(e) => setRuleDraft((prev) => ({ ...prev, timezone: e.target.value }))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              Start
              <input
                value={ruleDraft.startTimeLocal}
                onChange={(e) => setRuleDraft((prev) => ({ ...prev, startTimeLocal: e.target.value }))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="08:30"
              />
            </label>
            <label className="flex flex-col gap-1">
              End
              <input
                value={ruleDraft.endTimeLocal}
                onChange={(e) => setRuleDraft((prev) => ({ ...prev, endTimeLocal: e.target.value }))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="11:30"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span>Days</span>
              <div className="flex flex-wrap gap-1">
                {dayLabels.map((label, idx) => {
                  const active = ruleDraft.daysOfWeek?.includes(idx);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleToggleDraftDay(idx)}
                      className={`px-2 py-1 rounded text-[10px] border ${
                        active ? 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10' : 'border-white/10 text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSaveRule}
                disabled={!onUpsertRule || isSavingRule}
                className="px-3 py-2 rounded-md border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/10 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingRule ? 'Saving...' : 'Add Rule'}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {rules.length === 0 ? (
              <div className="text-[11px] text-gray-500">No rules yet.</div>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11px]">
                  <div>
                    <div className="text-gray-100 font-semibold">{rule.title}</div>
                    <div className="text-gray-500">
                      {rule.type} • {rule.daysOfWeek.map((d) => dayLabels[d] || d).join(', ')} • {rule.startTimeLocal}–{rule.endTimeLocal} ({rule.timezone})
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleRule?.(rule.id, !rule.enabled)}
                    className={`px-2 py-1 rounded border text-[10px] ${
                      rule.enabled ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-gray-400'
                    }`}
                  >
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-b border-white/5 space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400">Session Analytics</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            <div className="bg-black/40 border border-white/10 rounded-lg p-3">
              <div className="text-[11px] text-gray-400 mb-2">Sessions</div>
              <div className="space-y-2">
                {sessionAnalytics.sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between text-[11px]">
                    <div className="text-gray-200">
                      {session.label} <span className="text-gray-500">({session.start}:00–{session.end}:00)</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-400">
                      <span>Trades {session.trades}</span>
                      <span>Win {session.winRate != null ? `${session.winRate}%` : '--'}</span>
                      <span>Avg R {session.avgR != null ? session.avgR.toFixed(2) : '--'}</span>
                      <span>Avg Dur {session.avgDurationMin != null ? `${session.avgDurationMin}m` : '--'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-3">
              <div className="text-[11px] text-gray-400 mb-2">Streaks + Cycles</div>
              <div className="space-y-2 text-[11px] text-gray-300">
                <div>Max win streak: {sessionAnalytics.maxWinStreak}</div>
                <div>Max loss streak: {sessionAnalytics.maxLossStreak}</div>
                <div>Avg to execute: {sessionAnalytics.cycleStats.avgToExecuteMin != null ? `${sessionAnalytics.cycleStats.avgToExecuteMin}m` : '--'}</div>
                <div>Avg to resolve: {sessionAnalytics.cycleStats.avgToResolveMin != null ? `${sessionAnalytics.cycleStats.avgToResolveMin}m` : '--'}</div>
                <div>Avg to outcome: {sessionAnalytics.cycleStats.avgToOutcomeMin != null ? `${sessionAnalytics.cycleStats.avgToOutcomeMin}m` : '--'}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-black/40 border border-white/10 rounded-lg p-3">
              <div className="text-[11px] text-gray-400 mb-2">Top Symbols</div>
              {sessionAnalytics.topSymbols.length === 0 ? (
                <div className="text-[11px] text-gray-500">No symbol outcomes yet.</div>
              ) : (
                <div className="space-y-1">
                  {sessionAnalytics.topSymbols.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-200">{item.key}</span>
                      <span className="text-gray-400">Trades {item.trades} • Win {item.winRate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-3">
              <div className="text-[11px] text-gray-400 mb-2">Top Timeframes</div>
              {sessionAnalytics.topTimeframes.length === 0 ? (
                <div className="text-[11px] text-gray-500">No timeframe outcomes yet.</div>
              ) : (
                <div className="space-y-1">
                  {sessionAnalytics.topTimeframes.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-200">{item.key}</span>
                      <span className="text-gray-400">Trades {item.trades} • Win {item.winRate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-black/40 border border-white/10 rounded-lg p-3">
              <div className="text-[11px] text-gray-400 mb-2">Top Agents</div>
              {sessionAnalytics.topAgents.length === 0 ? (
                <div className="text-[11px] text-gray-500">No agent outcomes yet.</div>
              ) : (
                <div className="space-y-1">
                  {sessionAnalytics.topAgents.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-200">{item.key}</span>
                      <span className="text-gray-400">Trades {item.trades} • Win {item.winRate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {error && (
            <div className="text-xs text-red-300 border border-red-500/30 bg-red-500/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          {!error && filteredEvents.length === 0 && !isLoading && (
            <div className="text-xs text-gray-500">No calendar events yet.</div>
          )}
          {filteredEvents.map((event) => (
            <VirtualItem key={event.id} minHeight={110}>
              <div className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-100">{event.title}</div>
                    <div className="text-[11px] text-gray-500">
                      {event.type} {event.symbol ? `• ${event.symbol}` : ''} {event.timeframe ? `• ${event.timeframe}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-gray-500">
                    <div>{formatTimestamp(event.startAtMs)}</div>
                    <div>{formatAge(event.startAtMs)} ago</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] text-gray-400">
                  {event.agentId && <span>Agent {event.agentId}</span>}
                  {event.broker && <span>Broker {event.broker}</span>}
                  {event.status && <span>Status {event.status}</span>}
                  {event.outcome && (
                    <span className={`px-2 py-0.5 rounded-full ${
                      event.outcome === 'WIN'
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : event.outcome === 'LOSS'
                          ? 'bg-red-500/20 text-red-200'
                          : 'bg-gray-500/20 text-gray-200'
                    }`}>
                      {event.outcome}
                    </span>
                  )}
                  {event.rMultiple != null && <span>R {event.rMultiple.toFixed(2)}</span>}
                  {event.durationMs != null && <span>{Math.max(1, Math.round(event.durationMs / 60000))}m</span>}
                </div>
                {(() => {
                  const meta = event.raw?.payload?.metadata || {};
                  const metaParts: string[] = [];
                  const currency = meta.currency ? String(meta.currency).toUpperCase() : '';
                  const country = meta.country ? String(meta.country) : '';
                  const impact = meta.impact ? String(meta.impact).toUpperCase() : '';
                  if (currency) metaParts.push(`CCY ${currency}`);
                  if (country) metaParts.push(`Country ${country}`);
                  if (impact) metaParts.push(`Impact ${impact}`);
                  if (meta.actual) metaParts.push(`Actual ${meta.actual}`);
                  if (meta.forecast) metaParts.push(`Forecast ${meta.forecast}`);
                  if (meta.previous) metaParts.push(`Previous ${meta.previous}`);
                  if (meta.source) metaParts.push(`Source ${meta.source}`);
                  if (metaParts.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
                      {metaParts.map((part, idx) => (
                        <span key={`${event.id}-meta-${idx}`}>{part}</span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </VirtualItem>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CalendarInterface;
