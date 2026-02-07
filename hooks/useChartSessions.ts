import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartSession, ChartTimeframe, Tab } from '../types';
import { getTradingViewParams, isTradingViewUrl } from '../services/tradingView';

const STORAGE_KEY = 'glass_chart_sessions_v1';

const DEFAULT_VIEWS: Record<ChartTimeframe, null> = {
  '1w': null,
  '1d': null,
  '4h': null,
  '1h': null,
  '30m': null,
  '15m': null,
  '5m': null,
  '1m': null
};

function nowMs() {
  return Date.now();
}

function safeJsonParse(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function coerceTimeframe(value: any): ChartTimeframe | null {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '1m') return '1m';
  if (raw === '5m' || raw === '5') return '5m';
  if (raw === '15m' || raw === '15') return '15m';
  if (raw === '30m' || raw === '30') return '30m';
  if (raw === '1h' || raw === '60' || raw === '1') return '1h';
  if (raw === '4h' || raw === '240' || raw === '4') return '4h';
  if (raw === '1d' || raw === 'd' || raw === '1440') return '1d';
  if (raw === '1w' || raw === 'w' || raw === '10080') return '1w';
  return null;
}

function normalizeSession(raw: any): ChartSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id != null ? String(raw.id).trim() : '';
  const symbol = raw.symbol != null ? String(raw.symbol).trim() : '';
  if (!id || !symbol) return null;

  const createdAtMs = Number.isFinite(Number(raw.createdAtMs)) ? Number(raw.createdAtMs) : nowMs();
  const updatedAtMs = Number.isFinite(Number(raw.updatedAtMs)) ? Number(raw.updatedAtMs) : createdAtMs;
  const watchEnabled = raw.watchEnabled === false ? false : true;

  const viewsRaw = raw.views && typeof raw.views === 'object' ? raw.views : {};
  const views: Record<ChartTimeframe, string | null> = { ...DEFAULT_VIEWS };
  for (const [k, v] of Object.entries(viewsRaw)) {
    const tf = coerceTimeframe(k);
    if (!tf) continue;
    const tabId = v == null ? null : String(v).trim();
    views[tf] = tabId || null;
  }

  const roiProfileId = raw.roiProfileId != null ? String(raw.roiProfileId).trim() : null;
  const notes = raw.notes != null ? String(raw.notes) : null;

  return {
    id,
    symbol,
    createdAtMs,
    updatedAtMs,
    watchEnabled,
    views,
    roiProfileId: roiProfileId || null,
    notes: notes || null
  };
}

function loadSessionsFromStorage(): ChartSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = safeJsonParse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = parsed.map(normalizeSession).filter(Boolean) as ChartSession[];
    const deduped = Array.from(new Map(out.map((s) => [s.id, s])).values());
    return deduped.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  } catch {
    return [];
  }
}

function persistSessionsToStorage(sessions: ChartSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

function guessSymbolFromTab(tab: Pick<Tab, 'url' | 'title'>): string {
  const url = String(tab.url || '').trim();
  if (isTradingViewUrl(url)) {
    const { symbol } = getTradingViewParams(url);
    if (symbol) return symbol;
  }

  const title = String(tab.title || '').trim();
  if (title) {
    const upper = title.toUpperCase();
    const match = upper.match(/\b[A-Z0-9]{4,12}\b/);
    if (match) return match[0];
  }

  return 'UNKNOWN';
}

export function useChartSessions() {
  const [sessions, setSessions] = useState<ChartSession[]>(() => loadSessionsFromStorage());
  const sessionsRef = useRef<ChartSession[]>(sessions);

  useEffect(() => {
    sessionsRef.current = sessions;
    persistSessionsToStorage(sessions);
  }, [sessions]);

  const byId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const createSession = useCallback((symbol: string) => {
    const sym = String(symbol || '').trim();
    if (!sym) return null;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `cs_${crypto.randomUUID()}`
        : `cs_${nowMs()}_${Math.random().toString(16).slice(2)}`;

    const t = nowMs();
    const next: ChartSession = {
      id,
      symbol: sym,
      createdAtMs: t,
      updatedAtMs: t,
      watchEnabled: true,
      views: { ...DEFAULT_VIEWS },
      roiProfileId: null,
      notes: null
    };

    setSessions((prev) => [next, ...prev]);
    return id;
  }, []);

  const createSessionFromTab = useCallback((tab: Pick<Tab, 'url' | 'title'>) => {
    const symbol = guessSymbolFromTab(tab);
    return createSession(symbol);
  }, [createSession]);

  const updateSession = useCallback((id: string, patch: Partial<ChartSession>) => {
    const key = String(id || '').trim();
    if (!key) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== key) return s;
        const next: ChartSession = {
          ...s,
          ...patch,
          views: patch.views ? { ...s.views, ...patch.views } : s.views,
          updatedAtMs: nowMs()
        };
        return next;
      })
    );
  }, []);

  const removeSession = useCallback((id: string) => {
    const key = String(id || '').trim();
    if (!key) return;
    setSessions((prev) => prev.filter((s) => s.id !== key));
  }, []);

  const setSessionWatchEnabled = useCallback((id: string, enabled: boolean) => {
    updateSession(id, { watchEnabled: !!enabled });
  }, [updateSession]);

  const assignTabToTimeframe = useCallback((id: string, timeframe: ChartTimeframe, tabId: string) => {
    const tf = coerceTimeframe(timeframe);
    const tId = String(tabId || '').trim();
    if (!tf || !tId) return;
    updateSession(id, { views: { [tf]: tId } as any });
  }, [updateSession]);

  const clearTimeframe = useCallback((id: string, timeframe: ChartTimeframe) => {
    const tf = coerceTimeframe(timeframe);
    if (!tf) return;
    updateSession(id, { views: { [tf]: null } as any });
  }, [updateSession]);

  return {
    sessions,
    byId,
    createSession,
    createSessionFromTab,
    updateSession,
    removeSession,
    setSessionWatchEnabled,
    assignTabToTimeframe,
    clearTimeframe
  };
}
