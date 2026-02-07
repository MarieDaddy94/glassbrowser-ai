import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type { ExperimentRegistryEntry, HealthSnapshot, PromotionDecision, SystemStateSnapshot } from '../types';
import { getRuntimeScheduler } from '../services/runtimeScheduler';
import { getLivePolicyService } from '../services/livePolicyService';
import { evaluateAutoDemotionPolicy, evaluatePromotionPolicy } from '../services/promotionPolicyService';

type MonitorInterfaceProps = {
  health?: HealthSnapshot | null;
  onRequestSnapshot?: (input: { detail?: 'summary' | 'full'; maxItems?: number }) => Promise<any> | any;
};

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

const formatNumber = (value?: number | null, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return num.toLocaleString(undefined, { maximumFractionDigits: digits });
};

const formatCurrency = (value?: number | null, currency?: string | null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const code = currency ? String(currency).toUpperCase() : '';
  try {
    if (code.length === 3) {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(num);
    }
  } catch {
    // ignore currency formatting errors
  }
  return formatNumber(num, 2);
};

const formatBool = (value?: boolean | null) => {
  if (value == null) return '--';
  return value ? 'ON' : 'OFF';
};

const formatPercent = (value?: number | null, digits = 1) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const pct = num > 1 ? num : num * 100;
  return `${pct.toFixed(digits)}%`;
};

const toneForStatus = (value?: string | null) => {
  const key = String(value || '').toLowerCase();
  if (!key) return 'text-gray-300';
  if (['connected', 'ok', 'ready', 'enabled', 'on', 'running'].includes(key)) return 'text-emerald-300';
  if (['error', 'failed', 'blocked', 'down', 'disconnected'].includes(key)) return 'text-red-400';
  return 'text-amber-300';
};

const MetricCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-1">
    <div className="text-[10px] text-gray-500 uppercase tracking-wide">{title}</div>
    {children}
  </div>
);

const MetricRow: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="flex items-center justify-between text-[11px] text-gray-300">
    <span className="text-gray-500">{label}</span>
    <span className={tone || ''}>{value}</span>
  </div>
);

const MonitorInterface: React.FC<MonitorInterfaceProps> = ({ health, onRequestSnapshot }) => {
  const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);
  const livePolicyService = useMemo(() => getLivePolicyService(), []);
  const [snapshot, setSnapshot] = useState<SystemStateSnapshot | null>(null);
  const [detail, setDetail] = useState<'summary' | 'full'>('summary');
  const [maxItems, setMaxItems] = useState(6);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [promotionCandidateId, setPromotionCandidateId] = useState('');
  const [promotionTradeCount, setPromotionTradeCount] = useState(60);
  const [promotionStability, setPromotionStability] = useState(0.62);
  const [promotionDrawdown, setPromotionDrawdown] = useState(10);
  const [promotionConsistency, setPromotionConsistency] = useState(0.63);
  const [promotionDecision, setPromotionDecision] = useState<PromotionDecision | null>(null);
  const [livePolicy, setLivePolicy] = useState(livePolicyService.getSnapshot());
  const [livePolicyHistory, setLivePolicyHistory] = useState(livePolicyService.getHistory(6));
  const inFlightRef = useRef(false);

  const refreshSnapshot = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!onRequestSnapshot) {
        setError('System snapshot tool unavailable.');
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsLoading(true);
      if (!opts?.silent) {
        setStatus(null);
        setError(null);
      }
      try {
        const res = await onRequestSnapshot({ detail, maxItems });
        const payload = res?.payload ?? res?.data?.payload ?? res?.data ?? null;
        const nextSnapshot = payload && typeof payload === 'object' && 'capturedAtMs' in payload
          ? (payload as SystemStateSnapshot)
          : null;
        if (res?.ok && nextSnapshot) {
          setSnapshot(nextSnapshot);
          setStatus(`Updated ${formatAge(nextSnapshot.capturedAtMs)} ago.`);
          setError(null);
        } else {
          setError(res?.text || res?.error || 'Snapshot unavailable.');
        }
      } catch (err: any) {
        setError(err?.message ? String(err.message) : 'Snapshot unavailable.');
      } finally {
        setIsLoading(false);
        inFlightRef.current = false;
      }
    },
    [detail, maxItems, onRequestSnapshot]
  );

  useEffect(() => {
    refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!autoRefresh) return;
    const dispose = runtimeScheduler.registerTask({
      id: 'monitor.snapshot.poll',
      groupId: 'monitor',
      intervalMs: 15000,
      jitterPct: 0.1,
      visibilityMode: 'foreground',
      priority: 'low',
      run: async () => {
        await refreshSnapshot({ silent: true });
      }
    });
    return () => dispose();
  }, [autoRefresh, refreshSnapshot, runtimeScheduler]);

  const liveHealth = snapshot?.health ?? health ?? null;
  const broker = snapshot?.tradelocker ?? null;
  const mt5 = snapshot?.mt5 ?? null;
  const sim = snapshot?.sim ?? null;
  const autopilot = snapshot?.autopilot ?? null;
  const shadowStats = snapshot?.shadow?.stats ?? null;
  const shadowCompare = snapshot?.shadow?.compare ?? null;
  const watchers = snapshot?.watchers ?? null;
  const taskTree = snapshot?.taskTree ?? null;
  const truth = snapshot?.truth?.projection ?? null;
  const perf = liveHealth?.perf ?? null;
  const panelConnectivityRows = Array.isArray(liveHealth?.panelConnectivity) ? liveHealth.panelConnectivity : [];
  const panelFreshnessRows = Array.isArray(liveHealth?.panelFreshness) ? liveHealth.panelFreshness : [];
  const outcomeFeedCursor = liveHealth?.outcomeFeed?.cursor || null;
  const outcomeFeedConsistency = liveHealth?.outcomeFeed?.consistency || null;

  const rawJson = useMemo(() => {
    if (!snapshot) return '';
    try {
      return JSON.stringify(snapshot, null, 2);
    } catch {
      return '';
    }
  }, [snapshot]);

  const refreshLivePolicy = useCallback(() => {
    setLivePolicy(livePolicyService.getSnapshot());
    setLivePolicyHistory(livePolicyService.getHistory(6));
  }, [livePolicyService]);

  useEffect(() => {
    refreshLivePolicy();
  }, [refreshLivePolicy]);

  const evaluatePromotion = useCallback(() => {
    const experimentId = String(promotionCandidateId || '').trim();
    if (!experimentId) {
      setPromotionDecision(null);
      setStatus('Enter candidate experiment ID.');
      return;
    }
    const experiment: ExperimentRegistryEntry = {
      experimentId,
      configHash: `manual_${experimentId}`,
      symbol: 'MULTI',
      timeframe: 'multi',
      strategy: 'champion_candidate',
      createdAtMs: Date.now(),
      source: 'monitor_panel'
    };
    const decision = evaluatePromotionPolicy({
      experiment,
      tradeCount: promotionTradeCount,
      walkForwardStability: promotionStability,
      maxDrawdownPct: promotionDrawdown,
      consistency: promotionConsistency
    });
    setPromotionDecision(decision);
    setStatus(decision.pass ? 'Promotion gates passed.' : `Promotion blocked: ${decision.reasons.join(', ')}`);
  }, [promotionCandidateId, promotionConsistency, promotionDrawdown, promotionStability, promotionTradeCount]);

  const applyPromotion = useCallback(() => {
    if (!promotionDecision?.pass) return;
    livePolicyService.promote({
      experimentId: promotionDecision.experimentId,
      decision: promotionDecision
    });
    refreshLivePolicy();
    setStatus(`Promoted champion: ${promotionDecision.experimentId}`);
  }, [livePolicyService, promotionDecision, refreshLivePolicy]);

  const runAutoDemotion = useCallback(() => {
    const activeChampion = String(livePolicy.activeChampionId || '').trim();
    if (!activeChampion) {
      setStatus('No active champion to demote.');
      return;
    }
    const driftSeverity = liveHealth?.agentDrift?.reports?.some((row) => row?.severity === 'poor') ? 'poor' : 'ok';
    const decision = evaluateAutoDemotionPolicy({
      experimentId: activeChampion,
      liveDriftSeverity: driftSeverity
    });
    if (!decision.pass) {
      setStatus('Auto-demotion conditions not met.');
      return;
    }
    livePolicyService.demote({
      reason: decision.reasons.join(',') || 'policy',
      decision
    });
    refreshLivePolicy();
    setStatus(`Champion demoted: ${activeChampion}`);
  }, [liveHealth?.agentDrift?.reports, livePolicy.activeChampionId, livePolicyService, refreshLivePolicy]);

  const copySnapshot = useCallback(() => {
    if (!rawJson) return;
    try {
      const clipboard = (window as any)?.glass?.clipboard?.writeText;
      if (clipboard) {
        clipboard(rawJson);
      } else {
        navigator.clipboard?.writeText(rawJson);
      }
      setStatus('Snapshot copied to clipboard.');
    } catch {
      setStatus('Copy failed.');
    }
  }, [rawJson]);

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#050505]">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-slate-900/30 to-black">
        <div className="flex flex-wrap items-center gap-3 text-slate-200 text-xs uppercase tracking-wider font-bold">
          <span>Remote Monitor</span>
          <span className="text-[10px] text-gray-500">
            Snapshot {snapshot?.capturedAtMs ? formatTime(snapshot.capturedAtMs) : '--'}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] font-normal">
            <label className="flex items-center gap-1 text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-emerald-500"
              />
              Auto
            </label>
            <select
              value={detail}
              onChange={(e) => setDetail(e.target.value === 'full' ? 'full' : 'summary')}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-200"
            >
              <option value="summary">Summary</option>
              <option value="full">Full</option>
            </select>
            <label className="flex items-center gap-1 text-gray-400">
              Max
              <input
                type="number"
                min={1}
                max={50}
                value={maxItems}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) setMaxItems(Math.max(1, Math.min(50, Math.floor(next))));
                }}
                className="w-14 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-200"
              />
            </label>
            <button
              type="button"
              onClick={copySnapshot}
              disabled={!snapshot}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1">
                <Copy size={12} />
                Copy
              </span>
            </button>
            <button
              type="button"
              onClick={() => refreshSnapshot()}
              disabled={isLoading}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1">
                <RefreshCw size={12} />
                {isLoading ? 'Loading' : 'Refresh'}
              </span>
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
          {status && <span>{status}</span>}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {liveHealth ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <MetricCard title="Broker">
                <MetricRow label="Status" value={liveHealth.brokerStatus || 'unknown'} tone={toneForStatus(liveHealth.brokerStatus)} />
                <MetricRow label="Quotes" value={formatAge(liveHealth.brokerQuotesUpdatedAtMs)} />
                {liveHealth.brokerQuotesError && (
                  <div className="text-[11px] text-red-400">Err: {liveHealth.brokerQuotesError}</div>
                )}
              </MetricCard>
              <MetricCard title="Stream">
                <MetricRow label="Status" value={liveHealth.brokerStreamStatus || 'unknown'} tone={toneForStatus(liveHealth.brokerStreamStatus)} />
                <MetricRow label="Updated" value={formatAge(liveHealth.brokerStreamUpdatedAtMs)} />
                {liveHealth.brokerStreamError && (
                  <div className="text-[11px] text-red-400">Err: {liveHealth.brokerStreamError}</div>
                )}
              </MetricCard>
              <MetricCard title="Queues">
                <MetricRow label="Depth" value={liveHealth.tradelockerRequestQueueDepth ?? liveHealth.perf?.brokerQueueDepth ?? 0} />
                <MetricRow label="In Flight" value={liveHealth.tradelockerRequestInFlight ?? liveHealth.perf?.brokerInFlight ?? 0} />
                <MetricRow label="Max Wait" value={formatMs(liveHealth.tradelockerRequestQueueMaxWaitMs ?? liveHealth.perf?.brokerQueueMaxWaitMs)} />
                {liveHealth.brokerRateLimitLastMessage && (
                  <div className="text-[11px] text-amber-300">Rate limit: {liveHealth.brokerRateLimitLastMessage}</div>
                )}
              </MetricCard>
              <MetricCard title="Watchers">
                <MetricRow label="Enabled" value={`${liveHealth.setupWatcherEnabledCount ?? 0}/${liveHealth.setupWatcherCount ?? 0}`} />
                <MetricRow label="Signals" value={liveHealth.setupSignalCount ?? 0} />
                <MetricRow label="Last Eval" value={formatAge(liveHealth.setupWatcherEvalAtMs)} />
                <MetricRow label="Last Signal" value={formatAge(liveHealth.setupSignalAtMs)} />
              </MetricCard>
              <MetricCard title="Autopilot">
                <MetricRow label="State" value={liveHealth.autoPilotState || (liveHealth.autoPilotEnabled ? 'ENABLED' : 'DISABLED')} tone={toneForStatus(liveHealth.autoPilotState)} />
                <MetricRow label="Mode" value={liveHealth.autoPilotMode || 'custom'} />
                <MetricRow label="Kill" value={formatBool(liveHealth.killSwitch)} />
              </MetricCard>
              <MetricCard title="Chart">
                <MetricRow label="Symbol" value={liveHealth.nativeChartSymbol || '--'} />
                <MetricRow label="Frames" value={liveHealth.nativeChartFrames ?? 0} />
                <MetricRow label="Updated" value={formatAge(liveHealth.nativeChartUpdatedAtMs)} />
              </MetricCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <MetricCard title="Broker Activity">
                <MetricRow label="Window" value={perf?.windowMs ? `${Math.max(1, Math.round(perf.windowMs / 1000))}s` : '--'} />
                <MetricRow label="Requests" value={perf?.brokerRequests ?? 0} />
                <MetricRow label="Responses" value={perf?.brokerResponses ?? 0} />
                <MetricRow label="Timeouts" value={perf?.brokerTimeouts ?? 0} />
                <MetricRow label="Rate Limits" value={perf?.brokerRateLimits ?? 0} />
                <MetricRow label="Audit Events" value={perf?.auditEvents ?? 0} />
              </MetricCard>
              <MetricCard title="Quote Flow">
                <MetricRow label="Quote Updates" value={perf?.quoteUpdates ?? 0} />
                <MetricRow label="Quote Ingests" value={perf?.quoteIngests ?? 0} />
                <MetricRow label="Snapshot Age" value={formatAge(liveHealth.brokerSnapshotUpdatedAtMs)} />
                <MetricRow label="Quotes Age" value={formatAge(liveHealth.brokerQuotesUpdatedAtMs)} />
              </MetricCard>
              <MetricCard title="Signal Scans">
                <MetricRow label="Scans" value={perf?.signalScans ?? 0} />
                <MetricRow label="Last Duration" value={formatMs(perf?.signalScanLastDurationMs)} />
                <MetricRow label="Last Signal" value={formatAge(liveHealth.setupSignalAtMs)} />
              </MetricCard>
              <MetricCard title="Warmup">
                <MetricRow label="Warmups" value={perf?.signalSnapshotWarmups ?? 0} />
                <MetricRow label="Timeouts" value={perf?.signalSnapshotWarmupTimeouts ?? 0} />
                <MetricRow label="Last Duration" value={formatMs(perf?.signalSnapshotWarmupLastDurationMs)} />
              </MetricCard>
              <MetricCard title="Chart Refresh">
                <MetricRow label="Requests" value={perf?.chartRefreshRequests ?? 0} />
                <MetricRow label="Runs" value={perf?.chartRefreshRuns ?? 0} />
                <MetricRow label="Coalesced" value={perf?.chartRefreshCoalesced ?? 0} />
                <MetricRow label="Last Duration" value={formatMs(perf?.chartRefreshLastDurationMs)} />
              </MetricCard>
              <MetricCard title="Background Watcher">
                <MetricRow label="Ticks" value={perf?.backgroundWatcherTicks ?? 0} />
                <MetricRow label="Last Duration" value={formatMs(perf?.backgroundWatcherLastDurationMs)} />
                <MetricRow label="Last Tick" value={formatAge(liveHealth.backgroundWatcherTickAtMs)} />
              </MetricCard>
              <MetricCard title="Rate Limits">
                <MetricRow label="Last At" value={formatAge(liveHealth.brokerRateLimitLastAtMs)} />
                <MetricRow label="Suppress Until" value={liveHealth.brokerRateLimitSuppressUntilMs ? formatTime(liveHealth.brokerRateLimitSuppressUntilMs) : '--'} />
                <MetricRow label="Min Interval" value={formatMs(liveHealth.tradelockerMinRequestIntervalMs)} />
                <MetricRow label="Max Queue" value={liveHealth.tradelockerRequestQueueMaxDepth ?? liveHealth.perf?.brokerQueueMaxDepth ?? 0} />
              </MetricCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <MetricCard title="Refresh SLA">
                {(liveHealth.refreshSlaByChannel || []).length === 0 ? (
                  <div className="text-[11px] text-gray-500">No channel SLA data.</div>
                ) : (
                  (liveHealth.refreshSlaByChannel || []).map((row) => (
                    <div key={String(row.channel)} className="space-y-0.5 mb-2">
                      <MetricRow
                        label={String(row.channel || '').toUpperCase()}
                        value={String(row.state || 'idle')}
                        tone={toneForStatus(String(row.state || '').toLowerCase())}
                      />
                      <div className="text-[10px] text-gray-500">
                        Last success {formatAge(row.lastSuccessAt ?? row.lastRunAt ?? null)}
                      </div>
                    </div>
                  ))
                )}
                <MetricRow label="Last Success" value={formatAge(liveHealth.lastSuccessfulScanAtMs)} />
              </MetricCard>
              <MetricCard title="Circuit Sources">
                {(liveHealth.brokerCircuitBySource || []).length === 0 ? (
                  <div className="text-[11px] text-gray-500">No source circuit state.</div>
                ) : (
                  (liveHealth.brokerCircuitBySource || []).slice(0, 6).map((row) => (
                    <div key={String(row.source)} className="space-y-0.5 mb-2">
                      <MetricRow
                        label={String(row.source || '').toUpperCase()}
                        value={String(row.state || 'CLOSED')}
                        tone={toneForStatus(row.state === 'OPEN' ? 'error' : row.state === 'HALF_OPEN' ? 'warn' : 'ok')}
                      />
                      {row.retryAfterMs ? <div className="text-[10px] text-gray-500">retry {formatMs(row.retryAfterMs)}</div> : null}
                    </div>
                  ))
                )}
              </MetricCard>
              <MetricCard title="Bridge Domains">
                {liveHealth.bridgeDomainReadiness && Object.keys(liveHealth.bridgeDomainReadiness).length > 0 ? (
                  Object.entries(liveHealth.bridgeDomainReadiness).map(([domain, state]) => (
                    <MetricRow
                      key={domain}
                      label={domain}
                      value={state?.ready ? 'ready' : 'missing'}
                      tone={state?.ready ? 'text-emerald-300' : 'text-red-400'}
                    />
                  ))
                ) : (
                  <div className="text-[11px] text-gray-500">No domain readiness data.</div>
                )}
              </MetricCard>
              <MetricCard title="Rank & Drift">
                <MetricRow
                  label="Rank Freshness"
                  value={liveHealth.rankFreshness?.degraded ? 'degraded' : liveHealth.rankFreshness?.stale ? 'stale' : 'fresh'}
                  tone={liveHealth.rankFreshness?.degraded || liveHealth.rankFreshness?.stale ? 'text-amber-300' : 'text-emerald-300'}
                />
                <MetricRow label="Freshness Age" value={formatAge(liveHealth.rankFreshness?.updatedAtMs)} />
                <MetricRow label="Drift Reports" value={liveHealth.agentDrift?.reports?.length ?? 0} />
                <MetricRow
                  label="Poor Drift"
                  value={(liveHealth.agentDrift?.reports || []).filter((row) => row?.severity === 'poor').length}
                  tone={(liveHealth.agentDrift?.reports || []).some((row) => row?.severity === 'poor') ? 'text-red-400' : undefined}
                />
                <MetricRow
                  label="Exec Mismatch"
                  value={liveHealth.executionAudit?.mismatches?.length ?? 0}
                  tone={(liveHealth.executionAudit?.mismatches || []).length > 0 ? 'text-red-400' : undefined}
                />
              </MetricCard>
              <MetricCard title="Panel Connectivity">
                {panelConnectivityRows.length === 0 ? (
                  <div className="text-[11px] text-gray-500">No panel connectivity telemetry.</div>
                ) : (
                  panelConnectivityRows.slice(0, 8).map((row) => (
                    <div key={`${row.panel || 'panel'}:${row.source}`} className="space-y-0.5 mb-2">
                      <MetricRow
                        label={`${String(row.panel || 'panel').toUpperCase()}:${String(row.source || 'catalog').toUpperCase()}`}
                        value={row.ready ? 'ready' : 'degraded'}
                        tone={row.ready ? 'text-emerald-300' : 'text-amber-300'}
                      />
                      <div className="text-[10px] text-gray-500">
                        latency {formatMs(row.latencyMs)} • updated {formatAge(row.updatedAt)}
                      </div>
                      {!row.ready && row.error ? (
                        <div className="text-[10px] text-amber-300">{row.error}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </MetricCard>
              <MetricCard title="Outcome Feed">
                <MetricRow label="Total" value={outcomeFeedCursor?.total ?? 0} />
                <MetricRow label="Generated" value={formatAge(outcomeFeedCursor?.generatedAtMs)} />
                <MetricRow label="Last Resolved" value={formatAge(outcomeFeedCursor?.lastResolvedAtMs)} />
                <MetricRow
                  label="Consistency"
                  value={
                    outcomeFeedConsistency?.degraded
                      ? 'degraded'
                      : outcomeFeedConsistency?.stale
                        ? 'stale'
                        : 'fresh'
                  }
                  tone={
                    outcomeFeedConsistency?.degraded || outcomeFeedConsistency?.stale
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }
                />
                {outcomeFeedConsistency?.reason ? (
                  <div className="text-[10px] text-amber-300">{outcomeFeedConsistency.reason}</div>
                ) : null}
                <div className="text-[10px] text-gray-500 mt-1">
                  checksum {String(outcomeFeedCursor?.checksum || '').slice(0, 10) || '--'}
                </div>
              </MetricCard>
              <MetricCard title="Panel Freshness">
                {panelFreshnessRows.length === 0 ? (
                  <div className="text-[11px] text-gray-500">No panel freshness state.</div>
                ) : (
                  panelFreshnessRows.slice(0, 8).map((row) => (
                    <div key={String(row.panel)} className="space-y-0.5 mb-2">
                      <MetricRow
                        label={String(row.panel || '').toUpperCase()}
                        value={String(row.state || 'unknown')}
                        tone={row.state === 'fresh' ? 'text-emerald-300' : row.state === 'unknown' ? 'text-gray-300' : 'text-amber-300'}
                      />
                      <div className="text-[10px] text-gray-500">
                        sync {formatAge(row.lastSyncAt)}
                        {row.reason ? ` • ${row.reason}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </MetricCard>
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500">Health snapshot unavailable.</div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <MetricCard title="TradeLocker">
            <MetricRow label="Status" value={broker?.status || 'unknown'} tone={toneForStatus(broker?.status)} />
            <MetricRow label="Env" value={broker?.env || '--'} />
            <MetricRow label="Account" value={broker?.accNum ?? broker?.accountId ?? '--'} />
            <MetricRow label="Equity" value={formatCurrency(broker?.equity ?? null, broker?.currency ?? null)} />
            <MetricRow label="Balance" value={formatCurrency(broker?.balance ?? null, broker?.currency ?? null)} />
            <MetricRow label="Open Positions" value={broker?.openPositionsCount ?? broker?.positionsCount ?? 0} />
            <MetricRow label="Open Orders" value={broker?.openOrdersCount ?? broker?.ordersCount ?? 0} />
            {broker?.lastError && <div className="text-[11px] text-red-400">Last error: {broker.lastError}</div>}
            {broker?.streamError && <div className="text-[11px] text-red-400">Stream error: {broker.streamError}</div>}
          </MetricCard>
          <MetricCard title="Automation">
            <MetricRow label="Enabled" value={formatBool(autopilot?.enabled)} />
            <MetricRow label="Mode" value={autopilot?.mode || autopilot?.policyMode || '--'} />
            <MetricRow label="Execution" value={autopilot?.executionMode || '--'} />
            <MetricRow label="Kill Switch" value={formatBool(autopilot?.killSwitch)} />
            <MetricRow label="Risk / Trade" value={autopilot?.riskPerTrade != null ? `${formatNumber(autopilot.riskPerTrade, 2)}%` : '--'} />
            <MetricRow label="Max Daily Loss" value={autopilot?.maxDailyLoss != null ? `${formatNumber(autopilot.maxDailyLoss, 2)}%` : '--'} />
          </MetricCard>
          <MetricCard title="Task Tree">
            <MetricRow label="Queue" value={taskTree?.queueDepth ?? '--'} />
            <MetricRow label="Processing" value={formatBool(taskTree?.processing)} />
            <MetricRow label="Updated" value={formatAge(taskTree?.updatedAtMs)} />
            {taskTree?.lastRun?.runId && (
              <div className="text-[11px] text-gray-400">
                Last run {String(taskTree.lastRun.runId).slice(-6)} • {taskTree.lastRun.status || 'unknown'}
              </div>
            )}
            {taskTree?.action?.queueDepth != null && (
              <div className="text-[11px] text-gray-400">Action queue: {taskTree.action.queueDepth}</div>
            )}
          </MetricCard>
          <MetricCard title="Sessions">
            <MetricRow label="Active Tab" value={snapshot?.tabs?.activeTab?.title || snapshot?.tabs?.activeTab?.url || '--'} />
            <MetricRow label="Tabs" value={snapshot?.tabs?.total ?? '--'} />
            <MetricRow label="Watched" value={snapshot?.tabs?.watched ?? '--'} />
            <MetricRow label="Pinned" value={snapshot?.tabs?.pinned ?? '--'} />
            {snapshot?.symbolScope?.symbol && (
              <div className="text-[11px] text-gray-400">
                Scope {snapshot.symbolScope.symbol} ({(snapshot.symbolScope.timeframes || []).join(', ') || '--'})
              </div>
            )}
          </MetricCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <MetricCard title="MT5">
            <MetricRow label="Bridge" value={formatBool(mt5?.bridgeAvailable)} />
            <MetricRow label="Account" value={mt5?.accountKey || '--'} />
            <MetricRow label="Equity" value={formatCurrency(mt5?.equity ?? null, mt5?.currency ?? null)} />
            <MetricRow label="Balance" value={formatCurrency(mt5?.balance ?? null, mt5?.currency ?? null)} />
            <MetricRow label="Netting" value={mt5?.netting == null ? '--' : (mt5.netting ? 'YES' : 'NO')} />
            <MetricRow label="Positions" value={mt5?.positionsCount ?? '--'} />
            <MetricRow label="Orders" value={mt5?.ordersCount ?? '--'} />
            <MetricRow label="Pos Updated" value={formatAge(mt5?.positionsUpdatedAtMs)} />
            <MetricRow label="Ord Updated" value={formatAge(mt5?.ordersUpdatedAtMs)} />
            <MetricRow label="Updated" value={formatAge(mt5?.updatedAtMs)} />
            {mt5?.lastError && <div className="text-[11px] text-red-400">Error: {mt5.lastError}</div>}
          </MetricCard>
          <MetricCard title="Sim Broker">
            <MetricRow label="Available" value={formatBool(sim?.available)} />
            <MetricRow label="Equity" value={formatNumber(sim?.equity ?? null, 2)} />
            <MetricRow label="Balance" value={formatNumber(sim?.balance ?? null, 2)} />
            <MetricRow label="Positions" value={sim?.positionsCount ?? 0} />
            <MetricRow
              label="Floating PnL"
              value={formatNumber(sim?.floatingPnl ?? null, 2)}
              tone={
                sim?.floatingPnl == null
                  ? undefined
                  : sim.floatingPnl >= 0
                    ? 'text-emerald-300'
                    : 'text-red-400'
              }
            />
            <MetricRow label="Updated" value={formatAge(sim?.updatedAtMs)} />
          </MetricCard>
          <MetricCard title="Shadow KPIs">
            <MetricRow label="Open" value={shadowStats?.openCount ?? 0} />
            <MetricRow label="Closed" value={shadowStats?.closedCount ?? 0} />
            <MetricRow label="Win Rate" value={formatPercent(shadowStats?.winRate)} />
            <MetricRow label="Net R" value={formatNumber(shadowStats?.netR ?? null, 2)} />
            <MetricRow label="Avg R" value={formatNumber(shadowStats?.avgR ?? null, 2)} />
            <MetricRow label="Last Closed" value={formatAge(shadowStats?.lastClosedAtMs)} />
          </MetricCard>
          <MetricCard title="Shadow vs Live">
            <MetricRow label="Matched" value={shadowCompare?.matchedCount ?? 0} />
            <MetricRow label="Shadow WR" value={formatPercent(shadowCompare?.shadowWinRate)} />
            <MetricRow label="Live WR" value={formatPercent(shadowCompare?.actualWinRate)} />
            <MetricRow label="Shadow Net R" value={formatNumber(shadowCompare?.shadowNetR ?? null, 2)} />
            <MetricRow label="Live Net R" value={formatNumber(shadowCompare?.actualNetR ?? null, 2)} />
            <MetricRow label="Outcome Match" value={formatPercent(shadowCompare?.outcomeMatchRate)} />
            <MetricRow label="Avg Delta R" value={formatNumber(shadowCompare?.avgDeltaR ?? null, 2)} />
          </MetricCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <MetricCard title="Watchers Summary">
            <MetricRow label="Total" value={watchers?.total ?? '--'} />
            <MetricRow label="Enabled" value={watchers?.enabled ?? '--'} />
            <MetricRow label="Signals" value={watchers?.signals ?? '--'} />
            <MetricRow label="Blocked" value={watchers?.blockedByRegime ?? '--'} />
            <MetricRow label="Last Eval" value={formatAge(watchers?.lastEvalAtMs)} />
            <MetricRow label="Last Signal" value={formatAge(watchers?.lastSignalAtMs)} />
            {Array.isArray(watchers?.items) && watchers.items.length > 0 && (
              <div className="mt-2 text-[11px] text-gray-400">
                Sample: {watchers.items.map((item) => `${item.symbol} ${item.timeframe}`).slice(0, 4).join(' | ')}
              </div>
            )}
          </MetricCard>
          <MetricCard title="Truth Projection">
            <MetricRow label="Last Event" value={truth?.lastEventType || '--'} />
            <MetricRow label="Updated" value={formatAge(truth?.lastEventAtMs)} />
            <MetricRow label="Broker Status" value={truth?.broker?.lastStatus || '--'} />
            <MetricRow label="Chart" value={truth?.chart?.lastSymbol || '--'} />
            {truth?.lastEvent?.payload && (
              <div className="text-[11px] text-gray-400">
                Payload keys: {Object.keys(truth.lastEvent.payload || {}).slice(0, 6).join(', ') || '--'}
              </div>
            )}
          </MetricCard>
        </div>

        {Array.isArray(snapshot?.agents) && snapshot?.agents.length > 0 && (
          <MetricCard title="Agents">
            <div className="flex flex-wrap gap-2">
              {snapshot.agents.map((agent) => (
                <div key={agent.id} className="px-2 py-1 rounded border border-white/10 bg-black/40 text-[11px] text-gray-300">
                  {agent.name} <span className="text-gray-500">({agent.type})</span>
                </div>
              ))}
            </div>
          </MetricCard>
        )}

        <MetricCard title="Promotion Center">
          <MetricRow label="Active Champion" value={livePolicy.activeChampionId || '--'} />
          <MetricRow label="Previous Champion" value={livePolicy.previousChampionId || '--'} />
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2">
            <input
              value={promotionCandidateId}
              onChange={(e) => setPromotionCandidateId(e.target.value)}
              placeholder="Experiment ID"
              className="md:col-span-2 bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
            />
            <input
              type="number"
              value={promotionTradeCount}
              onChange={(e) => setPromotionTradeCount(Number(e.target.value) || 0)}
              placeholder="Trades"
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
            />
            <input
              type="number"
              step="0.01"
              value={promotionStability}
              onChange={(e) => setPromotionStability(Number(e.target.value) || 0)}
              placeholder="Stability"
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
            />
            <input
              type="number"
              step="0.1"
              value={promotionDrawdown}
              onChange={(e) => setPromotionDrawdown(Number(e.target.value) || 0)}
              placeholder="Drawdown"
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 mt-2">
            <input
              type="number"
              step="0.01"
              value={promotionConsistency}
              onChange={(e) => setPromotionConsistency(Number(e.target.value) || 0)}
              placeholder="Consistency"
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
            />
            <button
              type="button"
              onClick={evaluatePromotion}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
            >
              Evaluate
            </button>
            <button
              type="button"
              onClick={applyPromotion}
              disabled={!promotionDecision?.pass}
              className="px-2 py-1 rounded border border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/10 text-[11px] disabled:opacity-40"
            >
              Promote
            </button>
            <button
              type="button"
              onClick={runAutoDemotion}
              className="px-2 py-1 rounded border border-amber-400/50 text-amber-200 hover:bg-amber-500/10 text-[11px]"
            >
              Auto Demote
            </button>
          </div>
          {promotionDecision && (
            <div className={`mt-2 text-[11px] ${promotionDecision.pass ? 'text-emerald-300' : 'text-amber-300'}`}>
              {promotionDecision.pass ? 'Gate pass' : 'Gate fail'}: {promotionDecision.reasons.join(', ') || 'none'}
            </div>
          )}
          {livePolicyHistory.length > 0 && (
            <div className="mt-2 text-[11px] text-gray-400 space-y-1">
              {livePolicyHistory.map((item, idx) => (
                <div key={`${item.atMs}_${idx}`}>
                  {new Date(item.atMs).toLocaleTimeString()} {item.action} {item.fromChampionId || '--'} {'->'} {item.toChampionId || '--'}
                </div>
              ))}
            </div>
          )}
        </MetricCard>

        <button
          type="button"
          onClick={() => setShowRaw((prev) => !prev)}
          className="flex items-center gap-2 text-[11px] text-gray-400 hover:text-gray-200"
        >
          {showRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showRaw ? 'Hide raw snapshot' : 'Show raw snapshot'}
        </button>
        {showRaw && (
          <div className="border border-white/10 rounded-lg bg-black/40 p-3 text-[11px] text-gray-300 font-mono whitespace-pre-wrap">
            {rawJson || 'No snapshot payload yet.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default MonitorInterface;
