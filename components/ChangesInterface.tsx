import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import VirtualItem from './VirtualItem';
import { usePersistenceHealth } from '../hooks/usePersistenceHealth';
import { recordLedgerHealth } from '../services/persistenceHealth';
import type { OutcomeFeedConsistencyState, OutcomeFeedCursor, PanelFreshnessState } from '../types';

type AuditEntry = {
  id?: string;
  kind?: string;
  eventType?: string;
  level?: string;
  symbol?: string | null;
  payload?: Record<string, any> | null;
  createdAtMs?: number;
};

const DEFAULT_LIMIT = 800;
const STORAGE_KEY = 'glass_changes_panel_v1';
const CHANGE_BURST_WINDOW_MS = 90_000;

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
    // ignore storage failures
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

const describePayload = (entry: AuditEntry) => {
  const payload = entry.payload || {};
  const aggregatedCount = Number(payload.aggregatedCount);
  const suppressedCount = Number(payload.suppressedCount);
  const burstCount = Number.isFinite(aggregatedCount)
    ? Math.max(1, Math.floor(aggregatedCount))
    : Number.isFinite(suppressedCount)
      ? Math.max(1, Math.floor(suppressedCount) + 1)
      : 1;
  const burstSuffix = burstCount > 1 ? ` (+${burstCount - 1} similar)` : '';
  const reason = payload.reason || payload.error || payload.note || payload.message;
  if (reason) return `${String(reason)}${burstSuffix}`;
  if (burstSuffix) return `Burst collapsed${burstSuffix}`;
  if (payload.watcherId) return `watcher ${payload.watcherId}`;
  if (payload.libraryKey) return `library ${payload.libraryKey}`;
  if (payload.runId) return `run ${payload.runId}`;
  if (payload.decisionId) return `decision ${payload.decisionId}`;
  return '';
};

const readAggregateCount = (entry: AuditEntry) => {
  const payload = entry.payload || {};
  const direct = Number(payload.aggregatedCount);
  if (Number.isFinite(direct) && direct > 0) return Math.max(1, Math.floor(direct));
  const suppressed = Number(payload.suppressedCount);
  if (Number.isFinite(suppressed) && suppressed > 0) return Math.max(1, Math.floor(suppressed) + 1);
  return 1;
};

const collapseChangeBursts = (entries: AuditEntry[]) => {
  const source = Array.isArray(entries) ? entries.slice() : [];
  source.sort((a, b) => Number(b?.createdAtMs || 0) - Number(a?.createdAtMs || 0));
  const grouped = new Map<
    string,
    {
      sample: AuditEntry;
      firstAtMs: number;
      lastAtMs: number;
      count: number;
    }
  >();
  for (const entry of source) {
    if (!entry) continue;
    const createdAtMs = Number(entry.createdAtMs || 0);
    const bucket = Math.floor((Number.isFinite(createdAtMs) ? createdAtMs : 0) / CHANGE_BURST_WINDOW_MS);
    const payload = entry.payload || {};
    const reasonKey = String(payload.reason || payload.error || payload.note || payload.message || '').trim().toLowerCase();
    const key = [
      bucket,
      String(entry.eventType || '').trim().toLowerCase(),
      String(entry.level || '').trim().toLowerCase(),
      String(entry.symbol || '').trim().toLowerCase(),
      reasonKey
    ].join('|');
    const count = readAggregateCount(entry);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        sample: entry,
        firstAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        lastAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        count
      });
      continue;
    }
    existing.count += count;
    existing.firstAtMs = Math.min(existing.firstAtMs, Number.isFinite(createdAtMs) ? createdAtMs : existing.firstAtMs);
    existing.lastAtMs = Math.max(existing.lastAtMs, Number.isFinite(createdAtMs) ? createdAtMs : existing.lastAtMs);
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.lastAtMs - a.lastAtMs)
    .map((group, index) => {
      const payload = group.sample.payload && typeof group.sample.payload === 'object'
        ? { ...group.sample.payload }
        : {};
      payload.aggregatedCount = group.count;
      payload.suppressedCount = Math.max(0, group.count - 1);
      payload.windowMs = CHANGE_BURST_WINDOW_MS;
      payload.firstAtMs = group.firstAtMs || null;
      payload.lastAtMs = group.lastAtMs || null;
      return {
        ...group.sample,
        id: group.sample.id || `changes_ui_agg_${group.lastAtMs}_${index}`,
        payload,
        createdAtMs: group.lastAtMs || group.sample.createdAtMs || null
      } as AuditEntry;
    });
};

const categorizeEvent = (eventType: string) => {
  const type = String(eventType || '').toLowerCase();
  if (type.startsWith('setup_')) return 'setups';
  if (type.startsWith('trade_')) return 'trades';
  if (type.startsWith('drift_')) return 'drift';
  if (type.startsWith('playbook_')) return 'playbook';
  if (type.startsWith('agent_tool')) return 'agents';
  if (type.startsWith('task_tree')) return 'task tree';
  if (type.startsWith('app_')) return 'app';
  if (type.startsWith('health_')) return 'health';
  return 'other';
};

interface ChangesInterfaceProps {
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  outcomeFeedCursor?: OutcomeFeedCursor | null;
  outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;
  panelFreshness?: PanelFreshnessState | null;
}

const ChangesInterface: React.FC<ChangesInterfaceProps> = ({
  onRunActionCatalog,
  outcomeFeedCursor,
  outcomeFeedConsistency,
  panelFreshness
}) => {
  const { degraded } = usePersistenceHealth('changes');
  const initialConfig = readStoredConfig();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [limit, setLimit] = useState(initialConfig?.limit ?? DEFAULT_LIMIT);
  const [rangeHours, setRangeHours] = useState(initialConfig?.rangeHours ?? 24);
  const [filterSymbol, setFilterSymbol] = useState(initialConfig?.filterSymbol || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      if (!onRunActionCatalog) {
        fallback?.();
        return null;
      }
      const res = onRunActionCatalog({ actionId, payload });
      if (res && typeof (res as any).then === 'function') return res;
      if (!res?.ok) fallback?.();
      return res;
    },
    [onRunActionCatalog]
  );

  const loadEntries = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (onRunActionCatalog) {
      setIsLoading(true);
      setError(null);
      try {
        const res = await onRunActionCatalog({ actionId: 'changes.list', payload: { limit } });
        if (res?.ok && res.data && Array.isArray((res.data as any).entries)) {
          setEntries((res.data as any).entries);
          recordLedgerHealth('changes', true);
          return;
        }
        if (res && res.error) {
          const msg = String(res.error);
          setError(msg);
          recordLedgerHealth('changes', false, msg);
        }
      } catch (err: any) {
        const msg = err?.message ? String(err.message) : 'Failed to load audit events.';
        setError(msg);
        recordLedgerHealth('changes', false, msg);
      } finally {
        setIsLoading(false);
      }
    }
    if (!ledger?.list) {
      const msg = 'Audit log unavailable.';
      setError(msg);
      recordLedgerHealth('changes', false, msg);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await ledger.list({ limit });
      if (!res?.ok) {
        const msg = res?.error ? String(res.error) : 'Failed to load audit events.';
        setError(msg);
        recordLedgerHealth('changes', false, msg);
        return;
      }
      const next = Array.isArray(res.entries) ? res.entries : [];
      setEntries(next.filter((entry: any) => entry?.kind === 'audit_event'));
      recordLedgerHealth('changes', true);
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : 'Failed to load audit events.';
      setError(msg);
      recordLedgerHealth('changes', false, msg);
    } finally {
      setIsLoading(false);
    }
  }, [limit, onRunActionCatalog]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    writeStoredConfig({ limit, rangeHours, filterSymbol });
  }, [filterSymbol, limit, rangeHours]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      if (detail.rangeHours != null) {
        const next = Number(detail.rangeHours);
        if (Number.isFinite(next) && next > 0) setRangeHours(Math.max(1, Math.min(720, Math.floor(next))));
      }
      if (detail.limit != null) {
        const next = Number(detail.limit);
        if (Number.isFinite(next) && next > 0) setLimit(Math.max(50, Math.min(4000, Math.floor(next))));
      }
      if (detail.symbol != null || detail.filterSymbol != null) {
        const next = String(detail.symbol || detail.filterSymbol || '').trim();
        setFilterSymbol(next);
      }
    };
    window.addEventListener('glass_changes_filters', handler as any);
    return () => window.removeEventListener('glass_changes_filters', handler as any);
  }, []);

  const filteredEntries = useMemo(() => {
    const sinceMs = Date.now() - rangeHours * 60 * 60 * 1000;
    const sym = String(filterSymbol || '').trim().toLowerCase();
    return (entries || [])
      .filter((entry) => {
        if (!entry) return false;
        if (entry.createdAtMs && entry.createdAtMs < sinceMs) return false;
        if (sym && String(entry.symbol || '').toLowerCase() !== sym) return false;
        return true;
      })
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }, [entries, filterSymbol, rangeHours]);

  const reducedEntries = useMemo(() => {
    return collapseChangeBursts(filteredEntries);
  }, [filteredEntries]);

  const summary = useMemo(() => {
    const totals: Record<string, number> = {};
    let warns = 0;
    let errors = 0;
    const symbols = new Set<string>();
    reducedEntries.forEach((entry) => {
      const count = readAggregateCount(entry);
      const level = String(entry.level || 'info').toLowerCase();
      if (level === 'warn') warns += count;
      if (level === 'error') errors += count;
      if (entry.symbol) symbols.add(String(entry.symbol));
      const bucket = categorizeEvent(entry.eventType || '');
      totals[bucket] = (totals[bucket] || 0) + count;
    });
    return { totals, warns, errors, symbols: symbols.size };
  }, [reducedEntries]);

  const topCategories = useMemo(() => {
    return Object.entries(summary.totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [summary.totals]);

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#050505]">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-slate-900/30 to-black">
        <div className="flex items-center gap-2 text-slate-200 text-xs uppercase tracking-wider font-bold">
          <span>What Changed</span>
          {outcomeFeedCursor ? (
            <span className="text-[10px] text-gray-500 normal-case tracking-normal">
              Feed {outcomeFeedCursor.total} | {String(outcomeFeedCursor.checksum || '').slice(0, 8)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={loadEntries}
            className="ml-auto px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
          >
            <span className="inline-flex items-center gap-1">
              <RefreshCw size={12} />
              Refresh
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-white/5 space-y-3">
          {degraded ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Changes data is running in degraded mode while ledger sync recovers.
            </div>
          ) : null}
          {outcomeFeedConsistency?.degraded || outcomeFeedConsistency?.stale ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Outcome feed {outcomeFeedConsistency.degraded ? 'degraded' : 'stale'}
              {outcomeFeedConsistency.reason ? ` (${outcomeFeedConsistency.reason})` : ''}.
            </div>
          ) : null}
          {panelFreshness && panelFreshness.state !== 'fresh' ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Panel freshness: {panelFreshness.state}
              {panelFreshness.reason ? ` (${panelFreshness.reason})` : ''}.
            </div>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Range
              <select
                value={String(rangeHours)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  runActionOr('changes.filters.set', { rangeHours: next }, () => setRangeHours(next));
                }}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              >
                <option value="6">Last 6h</option>
                <option value="24">Last 24h</option>
                <option value="72">Last 3d</option>
                <option value="168">Last 7d</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Filter Symbol
              <input
                value={filterSymbol}
                onChange={(e) => runActionOr('changes.filters.set', { symbol: e.target.value }, () => setFilterSymbol(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="XAUUSD"
              />
            </label>
            <label className="flex flex-col gap-1">
              Limit
              <input
                type="number"
                min={200}
                max={4000}
                value={String(limit)}
                onChange={(e) => {
                  const next = Number(e.target.value || DEFAULT_LIMIT);
                  runActionOr('changes.filters.set', { limit: next }, () => setLimit(next));
                }}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              />
            </label>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-gray-400 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-emerald-200 font-semibold">Events {reducedEntries.length}</span>
              <span>Raw {filteredEntries.length}</span>
              <span>Symbols {summary.symbols}</span>
              <span>Warnings {summary.warns}</span>
              <span>Errors {summary.errors}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topCategories.length === 0 ? (
                <span className="text-gray-500">No changes yet.</span>
              ) : (
                topCategories.map(([label, count]) => (
                  <span key={label} className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-300">
                    {label} {count}
                  </span>
                ))
              )}
            </div>
          </div>

          {error && <div className="text-[11px] text-red-300">{error}</div>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {isLoading ? (
            <div className="text-[11px] text-gray-500">Loading changes...</div>
          ) : reducedEntries.length === 0 ? (
            <div className="text-[11px] text-gray-500">No changes for this window.</div>
          ) : (
            reducedEntries.slice(0, 200).map((entry) => {
              const aggregateCount = readAggregateCount(entry);
              const suppressedCount = Math.max(0, aggregateCount - 1);
              return (
                <VirtualItem
                  key={entry.id || `${entry.eventType}-${entry.createdAtMs}`}
                  minHeight={90}
                  className="border border-white/10 rounded-lg p-2 text-[11px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-emerald-200">{entry.eventType || 'event'}</span>
                    {entry.symbol && <span className="text-gray-400">{entry.symbol}</span>}
                    {entry.level && <span className="text-gray-500 uppercase">{entry.level}</span>}
                    {aggregateCount > 1 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200">
                        x{aggregateCount}
                      </span>
                    )}
                    {suppressedCount > 0 && (
                      <span className="text-[10px] text-gray-500">suppressed {suppressedCount}</span>
                    )}
                    <span className="text-gray-500">{formatAge(entry.createdAtMs)} ago</span>
                  </div>
                  {describePayload(entry) && (
                    <div className="mt-1 text-gray-500">{describePayload(entry)}</div>
                  )}
                </VirtualItem>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ChangesInterface;
