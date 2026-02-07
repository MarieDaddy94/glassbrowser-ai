import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, Search } from 'lucide-react';
import type { TaskTreeRunSummary } from '../services/taskTreeService';
import { HealthSnapshot, OutcomeFeedConsistencyState, OutcomeFeedCursor, PanelFreshnessState } from '../types';
import VirtualItem from './VirtualItem';
import { usePersistenceHealth } from '../hooks/usePersistenceHealth';
import { recordLedgerHealth } from '../services/persistenceHealth';

type AuditEntry = {
  id?: string;
  kind?: string;
  schemaVersion?: string;
  eventType?: string;
  level?: string;
  symbol?: string | null;
  runId?: string | null;
  toolId?: string | null;
  decisionId?: string | null;
  executionId?: string | null;
  brokerResponseId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, any> | null;
  source?: string | null;
  createdAtMs?: number;
};

const DEFAULT_LIMIT = 400;

const formatAge = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(1, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
};

const formatTime = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return '--';
  return new Date(ms).toLocaleString();
};

const formatMs = (value?: number | null) => {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '--';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
};

const toSearchString = (entry: AuditEntry) => {
  const parts = [
    entry.eventType,
    entry.level,
    entry.symbol,
    entry.runId,
    entry.toolId,
    entry.decisionId,
    entry.executionId,
    entry.brokerResponseId,
    entry.correlationId,
    entry.source
  ];
  try {
    if (entry.payload) parts.push(JSON.stringify(entry.payload));
  } catch {
    // ignore payload stringify errors
  }
  return parts.filter(Boolean).join(' ').toLowerCase();
};

type AuditTrailInterfaceProps = {
  health?: HealthSnapshot | null;
  outcomeFeedCursor?: OutcomeFeedCursor | null;
  outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;
  panelFreshness?: PanelFreshnessState | null;
  onReplayTaskTree?: (summary: TaskTreeRunSummary) => void;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
};

const AuditTrailInterface: React.FC<AuditTrailInterfaceProps> = ({
  health,
  outcomeFeedCursor,
  outcomeFeedConsistency,
  panelFreshness,
  onReplayTaskTree,
  onRunActionCatalog
}) => {
  const { degraded } = usePersistenceHealth('audit');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterRunId, setFilterRunId] = useState('');
  const [filterDecisionId, setFilterDecisionId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedSignalRunId, setSelectedSignalRunId] = useState('');
  const [selectedActionRunId, setSelectedActionRunId] = useState('');

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
        const res = await onRunActionCatalog({ actionId: 'audit.list', payload: { limit } });
        if (res?.ok && res.data && Array.isArray((res.data as any).entries)) {
          setEntries((res.data as any).entries);
          recordLedgerHealth('audit', true);
          return;
        }
        if (res && res.error) {
          const msg = String(res.error);
          setError(msg);
          recordLedgerHealth('audit', false, msg);
        }
      } catch (err: any) {
        const msg = err?.message ? String(err.message) : 'Failed to load audit entries.';
        setError(msg);
        recordLedgerHealth('audit', false, msg);
      } finally {
        setIsLoading(false);
      }
    }
    if (!ledger?.list) {
      const msg = 'Audit log unavailable (trade ledger not ready).';
      setError(msg);
      recordLedgerHealth('audit', false, msg);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await ledger.list({ limit });
      if (!res?.ok) {
        const msg = res?.error ? String(res.error) : 'Failed to load audit entries.';
        setError(msg);
        recordLedgerHealth('audit', false, msg);
        return;
      }
      const next = Array.isArray(res.entries) ? res.entries : [];
      setEntries(next.filter((entry: any) => entry?.kind === 'audit_event'));
      recordLedgerHealth('audit', true);
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : 'Failed to load audit entries.';
      setError(msg);
      recordLedgerHealth('audit', false, msg);
    } finally {
      setIsLoading(false);
    }
  }, [limit, onRunActionCatalog]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      if (detail.clear) {
        setSearch('');
        setFilterSymbol('');
        setFilterEvent('');
        setFilterLevel('');
        setFilterRunId('');
        setFilterDecisionId('');
      }
      if (detail.search != null) setSearch(String(detail.search));
      if (detail.symbol != null) setFilterSymbol(String(detail.symbol));
      if (detail.eventType != null || detail.event != null) {
        setFilterEvent(String(detail.eventType ?? detail.event));
      }
      if (detail.level != null) setFilterLevel(String(detail.level));
      if (detail.runId != null) setFilterRunId(String(detail.runId));
      if (detail.decisionId != null) setFilterDecisionId(String(detail.decisionId));
      if (detail.limit != null) {
        const next = Number(detail.limit);
        if (Number.isFinite(next) && next > 0) setLimit(Math.max(50, Math.min(4000, Math.floor(next))));
      }
      if (detail.refresh) void loadEntries();
    };
    window.addEventListener('glass_audit_filters', handler as any);
    return () => window.removeEventListener('glass_audit_filters', handler as any);
  }, [loadEntries]);

  const filteredEntries = useMemo(() => {
    const sym = String(filterSymbol || '').trim().toLowerCase();
    const evt = String(filterEvent || '').trim().toLowerCase();
    const lvl = String(filterLevel || '').trim().toLowerCase();
    const run = String(filterRunId || '').trim().toLowerCase();
    const decision = String(filterDecisionId || '').trim().toLowerCase();
    const searchText = String(search || '').trim().toLowerCase();

    return (entries || []).filter((entry) => {
      if (!entry) return false;
      if (sym && String(entry.symbol || '').toLowerCase() !== sym) return false;
      if (evt && String(entry.eventType || '').toLowerCase() !== evt) return false;
      if (lvl && String(entry.level || '').toLowerCase() !== lvl) return false;
      if (run && String(entry.runId || '').toLowerCase() !== run) return false;
      if (decision && String(entry.decisionId || '').toLowerCase() !== decision) return false;
      if (searchText && !toSearchString(entry).includes(searchText)) return false;
      return true;
    });
  }, [entries, filterDecisionId, filterEvent, filterLevel, filterRunId, filterSymbol, search]);

  const taskTreeRuns = useMemo(() => {
    const runs = (entries || [])
      .filter((entry) => entry?.eventType === 'task_tree_persist' && entry?.payload && typeof entry.payload === 'object')
      .map((entry) => {
        const summary = entry.payload as TaskTreeRunSummary & { taskType?: string };
        const taskTypeRaw = summary?.taskType ? String(summary.taskType) : '';
        const taskType = taskTypeRaw === 'action' ? 'action' : 'signal';
        const createdAtMs = Number(summary.createdAtMs) || Number(entry.createdAtMs) || 0;
        return { taskType, summary, createdAtMs };
      })
      .filter((item) => item.summary?.runId)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    return {
      signal: runs.filter((item) => item.taskType === 'signal'),
      action: runs.filter((item) => item.taskType === 'action')
    };
  }, [entries]);

  const selectedSignalRun = taskTreeRuns.signal.find((item) => item.summary.runId === selectedSignalRunId) || taskTreeRuns.signal[0] || null;
  const selectedActionRun = taskTreeRuns.action.find((item) => item.summary.runId === selectedActionRunId) || taskTreeRuns.action[0] || null;

  useEffect(() => {
    if (taskTreeRuns.signal.length === 0) {
      if (selectedSignalRunId) setSelectedSignalRunId('');
      return;
    }
    if (!selectedSignalRunId || !taskTreeRuns.signal.some((item) => item.summary.runId === selectedSignalRunId)) {
      setSelectedSignalRunId(taskTreeRuns.signal[0].summary.runId);
    }
  }, [selectedSignalRunId, taskTreeRuns.signal]);

  useEffect(() => {
    if (taskTreeRuns.action.length === 0) {
      if (selectedActionRunId) setSelectedActionRunId('');
      return;
    }
    if (!selectedActionRunId || !taskTreeRuns.action.some((item) => item.summary.runId === selectedActionRunId)) {
      setSelectedActionRunId(taskTreeRuns.action[0].summary.runId);
    }
  }, [selectedActionRunId, taskTreeRuns.action]);

  const renderTaskTreeSummary = (label: string, entry: { summary: TaskTreeRunSummary }) => {
    const summary = entry.summary;
    const steps = Array.isArray(summary.steps) ? summary.steps : [];
    return (
      <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px] text-gray-300">
          <span className="uppercase tracking-wider text-gray-400">{label}</span>
          <span className="text-[10px] text-gray-500">Run {String(summary.runId).slice(-6)}</span>
        </div>
        <div className="text-[10px] text-gray-500">
          Started {formatTime(summary.createdAtMs)}{summary.finishedAtMs ? ` • Finished ${formatTime(summary.finishedAtMs)}` : ''}
        </div>
        {steps.length > 0 ? (
          <div className="mt-2 space-y-1">
            {steps.map((step, idx) => (
              <div key={`${summary.runId}-${step.step}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                <span className="px-1.5 py-0.5 rounded-md border border-white/10 bg-white/5 text-gray-300">
                  {String(step.status || '').toUpperCase()}
                </span>
                <div className="flex-1">
                  <div className="text-gray-200">{step.step}</div>
                  {(step.note || step.error) && (
                    <div className="text-gray-500">{step.note || step.error}</div>
                  )}
                  {(Number(step.attempts || 0) > 1 || Number(step.retryCount || 0) > 0) && (
                    <div className="text-gray-500">
                      Attempts: {Number(step.attempts || 0)} | Retries: {Number(step.retryCount || 0)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[10px] text-gray-500">No steps recorded.</div>
        )}
      </div>
    );
  };

  const stats = useMemo(() => {
    const total = filteredEntries.length;
    const byLevel: Record<string, number> = {};
    const byEvent: Record<string, number> = {};
    filteredEntries.forEach((entry) => {
      const level = String(entry.level || 'info').toLowerCase();
      const event = String(entry.eventType || 'unknown').toLowerCase();
      byLevel[level] = (byLevel[level] || 0) + 1;
      byEvent[event] = (byEvent[event] || 0) + 1;
    });
    return { total, byLevel, byEvent };
  }, [filteredEntries]);

  const formatHealthAge = (ms?: number | null) => {
    const label = formatAge(ms);
    return label === '--' ? 'never' : label;
  };

  const copyEntry = (entry: AuditEntry) => {
    try {
      const text = JSON.stringify(entry, null, 2);
      const clipboard = (window as any)?.glass?.clipboard?.writeText;
      if (clipboard) {
        clipboard(text);
        return;
      }
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore copy failures
    }
  };

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#050505]">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-slate-900/30 to-black">
        <div className="flex items-center gap-2 text-slate-200 text-xs uppercase tracking-wider font-bold">
          <span>Audit Trail</span>
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
              Audit trail is degraded while ledger sync recovers. Latest cached entries remain visible.
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
          {health && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-[11px] text-gray-300">
              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Broker</div>
                <div>Status: {health.brokerStatus || 'unknown'}</div>
                <div>Quotes: {formatHealthAge(health.brokerQuotesUpdatedAtMs)}</div>
                {health.brokerQuotesError ? <div className="text-red-400">Err: {health.brokerQuotesError}</div> : null}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Stream</div>
                <div>Status: {health.brokerStreamStatus || 'unknown'}</div>
                <div>Updated: {formatHealthAge(health.brokerStreamUpdatedAtMs)}</div>
                {health.brokerStreamError ? <div className="text-red-400">Err: {health.brokerStreamError}</div> : null}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Watchers</div>
                <div>Enabled: {health.setupWatcherEnabledCount ?? 0}/{health.setupWatcherCount ?? 0}</div>
                <div>Eval: {formatHealthAge(health.setupWatcherEvalAtMs)}</div>
                <div>Signal: {formatHealthAge(health.setupSignalAtMs)}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">AutoPilot</div>
                <div>State: {health.autoPilotState || (health.autoPilotEnabled ? 'ENABLED' : 'DISABLED')}</div>
                <div>Mode: {health.autoPilotMode || 'custom'}</div>
                {health.autoPilotReason ? <div className="text-amber-300">Reason: {health.autoPilotReason}</div> : null}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Native Chart</div>
                <div>{health.nativeChartSymbol || '--'} | Frames {health.nativeChartFrames ?? 0}</div>
                <div>Updated: {formatHealthAge(health.nativeChartUpdatedAtMs)}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Perf {health.perf?.windowMs ? `(${Math.max(1, Math.round(health.perf.windowMs / 1000))}s)` : ''}
                </div>
                <div>Broker timeouts: {health.perf?.brokerTimeouts ?? 0}</div>
                <div>Queue: {health.perf?.brokerQueueDepth ?? 0} / max {health.perf?.brokerQueueMaxDepth ?? 0}</div>
                <div>Queue wait: {formatMs(health.perf?.brokerQueueMaxWaitMs)}</div>
                <div>Refresh: {health.perf?.chartRefreshRuns ?? 0} runs • {health.perf?.chartRefreshCoalesced ?? 0} coalesced</div>
                <div>Warmup timeouts: {health.perf?.signalSnapshotWarmupTimeouts ?? 0}</div>
                <div>Warmup last: {formatMs(health.perf?.signalSnapshotWarmupLastDurationMs)}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Symbol
              <input
                value={filterSymbol}
                onChange={(e) => runActionOr('audit.filters.set', { symbol: e.target.value }, () => setFilterSymbol(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="XAUUSD"
              />
            </label>
            <label className="flex flex-col gap-1">
              Event
              <input
                value={filterEvent}
                onChange={(e) => runActionOr('audit.filters.set', { eventType: e.target.value }, () => setFilterEvent(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="trade_request"
              />
            </label>
            <label className="flex flex-col gap-1">
              Level
              <input
                value={filterLevel}
                onChange={(e) => runActionOr('audit.filters.set', { level: e.target.value }, () => setFilterLevel(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="info"
              />
            </label>
            <label className="flex flex-col gap-1">
              Run ID
              <input
                value={filterRunId}
                onChange={(e) => runActionOr('audit.filters.set', { runId: e.target.value }, () => setFilterRunId(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="opt_..."
              />
            </label>
            <label className="flex flex-col gap-1">
              Decision ID
              <input
                value={filterDecisionId}
                onChange={(e) => runActionOr('audit.filters.set', { decisionId: e.target.value }, () => setFilterDecisionId(e.target.value))}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="dec_..."
              />
            </label>
            <label className="flex flex-col gap-1">
              Search
              <div className="relative">
                <Search size={12} className="absolute left-2 top-2.5 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => runActionOr('audit.filters.set', { search: e.target.value }, () => setSearch(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-md pl-7 pr-2 py-1 text-xs text-gray-100"
                  placeholder="any text"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1">
              Limit
              <input
                value={String(limit)}
                onChange={(e) => {
                  const next = Number(e.target.value || DEFAULT_LIMIT);
                  runActionOr(
                    'audit.filters.set',
                    { limit: next },
                    () => setLimit(next)
                  );
                }}
                className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                placeholder="400"
                type="number"
                min={50}
                max={5000}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
            <span>Total: {stats.total}</span>
            {Object.entries(stats.byLevel).map(([level, count]) => (
              <span key={level}>{level}: {count}</span>
            ))}
          </div>


          {(taskTreeRuns.signal.length > 0 || taskTreeRuns.action.length > 0) && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2 text-[11px] text-gray-300">
              <div className="flex items-center justify-between gap-2">
                <span className="uppercase tracking-wider text-gray-400">Task Tree Runs</span>
                <span className="text-[10px] text-gray-500">
                  Signal {taskTreeRuns.signal.length} • Action {taskTreeRuns.action.length}
                </span>
              </div>
              {taskTreeRuns.signal.length > 0 && (
                <div className="space-y-2">
                  {taskTreeRuns.signal.length > 1 && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span>Signal run</span>
                      <select
                        value={selectedSignalRun?.summary.runId || ''}
                        onChange={(e) => setSelectedSignalRunId(String(e.target.value))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                      >
                        {taskTreeRuns.signal.map((item) => (
                          <option key={item.summary.runId} value={item.summary.runId}>
                            {String(item.summary.runId).slice(-6)} {String(item.summary.status || '').toUpperCase()}
                          </option>
                        ))}
                      </select>
                      {onReplayTaskTree && selectedSignalRun && (
                        <button
                          type="button"
                          onClick={() => onReplayTaskTree(selectedSignalRun.summary)}
                          className="ml-auto text-[10px] text-blue-400 hover:text-blue-300"
                        >
                          Replay
                        </button>
                      )}
                    </div>
                  )}
                  {selectedSignalRun && renderTaskTreeSummary('Signal Task Tree', selectedSignalRun)}
                </div>
              )}
              {taskTreeRuns.action.length > 0 && (
                <div className="space-y-2">
                  {taskTreeRuns.action.length > 1 && (
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span>Action run</span>
                      <select
                        value={selectedActionRun?.summary.runId || ''}
                        onChange={(e) => setSelectedActionRunId(String(e.target.value))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                      >
                        {taskTreeRuns.action.map((item) => (
                          <option key={item.summary.runId} value={item.summary.runId}>
                            {String(item.summary.runId).slice(-6)} {String(item.summary.status || '').toUpperCase()}
                          </option>
                        ))}
                      </select>
                      {onReplayTaskTree && selectedActionRun && (
                        <button
                          type="button"
                          onClick={() => onReplayTaskTree(selectedActionRun.summary)}
                          className="ml-auto text-[10px] text-blue-400 hover:text-blue-300"
                        >
                          Replay
                        </button>
                      )}
                    </div>
                  )}
                  {selectedActionRun && renderTaskTreeSummary('Action Task Tree', selectedActionRun)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400">{error}</div>
          )}
          {isLoading && (
            <div className="text-xs text-gray-400">Loading audit events…</div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {filteredEntries.length === 0 && !isLoading ? (
            <div className="text-xs text-gray-500">No audit events matched the current filters.</div>
          ) : (
            filteredEntries.map((entry, idx) => {
              const id = entry.id || `${entry.eventType || 'event'}_${idx}`;
              const expanded = expandedId === id;
              const replayPayload = entry.eventType === 'task_tree_persist' ? (entry.payload as TaskTreeRunSummary | null) : null;
              const canReplay = !!replayPayload && typeof replayPayload?.runId === 'string' && Array.isArray(replayPayload?.steps);
              return (
                <VirtualItem key={id} minHeight={120} className="border border-white/10 rounded-lg bg-black/30 p-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-200">{entry.eventType || 'event'}</span>
                    <span className="text-gray-500">{entry.level || 'info'}</span>
                    {entry.symbol && <span className="text-gray-400">{entry.symbol}</span>}
                    <span className="text-gray-600">{formatAge(entry.createdAtMs)} ago</span>
                    {canReplay && onReplayTaskTree && (
                      <button
                        type="button"
                        onClick={() => onReplayTaskTree(replayPayload as TaskTreeRunSummary)}
                        className="ml-auto text-[11px] text-blue-400 hover:text-blue-300"
                      >
                        Replay
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : id)}
                      className={`${canReplay ? '' : 'ml-auto'} text-[11px] text-gray-400 hover:text-white`}
                    >
                      {expanded ? 'Hide' : 'Details'}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyEntry(entry)}
                      className="text-[11px] text-gray-400 hover:text-white"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Copy size={12} />
                        Copy
                      </span>
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500">
                    {formatTime(entry.createdAtMs)}
                  </div>
                  {expanded && (
                    <div className="mt-3 text-[11px] text-gray-300 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>Run ID: {entry.runId || '--'}</div>
                        <div>Tool ID: {entry.toolId || '--'}</div>
                        <div>Decision ID: {entry.decisionId || '--'}</div>
                        <div>Execution ID: {entry.executionId || '--'}</div>
                        <div>Broker ID: {entry.brokerResponseId || '--'}</div>
                        <div>Correlation ID: {entry.correlationId || '--'}</div>
                        <div>Source: {entry.source || '--'}</div>
                      </div>
                      <div className="bg-black/50 border border-white/10 rounded-md p-2 font-mono text-[11px] overflow-auto max-h-48">
                        {entry.payload ? JSON.stringify(entry.payload, null, 2) : 'No payload.'}
                      </div>
                    </div>
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

export default AuditTrailInterface;
