import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import VirtualItem from './VirtualItem';
import type { CalendarRule } from '../types';
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
const DEFAULT_LIMIT = 800;
const DEFAULT_RANGE_HOURS = 168;

const readStoredConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
}

const CalendarInterface: React.FC<CalendarInterfaceProps> = ({
  rules = [],
  onRefreshRules,
  onUpsertRule,
  onToggleRule,
  onSearchSymbols,
  onSyncEvents,
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

  const handleRefresh = useCallback(async () => {
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
  }, [isSyncing, loadEvents, onSyncEvents]);

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
          {isLoading ? 'Loading calendar events...' : `${filteredEvents.length} events • ${summary.symbols} symbols`}
        </div>
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
        {syncError && (
          <div className="mt-2 text-[10px] text-amber-300">
            Calendar sync failed: {syncError}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
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
