import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  ActionDefinition,
  AgentToolAction,
  ExperimentRegistryEntry,
  HealthSnapshot,
  PromotionDecision,
  RuntimeOpsControllerState,
  RuntimeOpsEvent,
  RuntimeOpsMode,
  SystemStateSnapshot
} from '../types';
import { getRuntimeScheduler } from '../services/runtimeScheduler';
import { getLivePolicyService } from '../services/livePolicyService';
import { evaluateAutoDemotionPolicy, evaluatePromotionPolicy } from '../services/promotionPolicyService';
import { listActionDefinitions } from '../services/actionCatalog';

type MonitorInterfaceProps = {
  health?: HealthSnapshot | null;
  onRequestSnapshot?: (input: { detail?: 'summary' | 'full'; maxItems?: number }) => Promise<any> | any;
  onClearSnapshotFrameCache?: (input?: { dropSessionBars?: boolean }) => Promise<any> | any;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  onExecuteAgentTool?: (action: AgentToolAction) => Promise<any> | any;
  liveErrors?: Array<{
    id: string;
    ts: number;
    level: 'error' | 'warn' | 'info';
    source: string;
    message: string;
    stack?: string | null;
    detail?: any;
    count?: number;
  }>;
  onClearLiveErrors?: () => void;
  runtimeOpsEvents?: RuntimeOpsEvent[];
  onClearRuntimeOpsEvents?: () => void;
  runtimeOpsState?: RuntimeOpsControllerState | null;
  runtimeOpsEnabled?: boolean;
  onSetRuntimeOpsEnabled?: (next: boolean) => Promise<any> | any;
  onSetRuntimeOpsMode?: (mode: RuntimeOpsMode) => Promise<any> | any;
  onEmergencyStopRuntimeOps?: () => Promise<any> | any;
  onRunRuntimeOpsAction?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  runtimeOpsFeatureFlags?: {
    runtimeOpsLogsV1?: boolean;
    runtimeOpsControllerV1?: boolean;
    runtimeOpsControlV1?: boolean;
    runtimeOpsLiveExecutionV1?: boolean;
    runtimeOpsBridgeStabilityV1?: boolean;
    runtimeOpsBridgeIntrospectionV1?: boolean;
    runtimeOpsControlSafetyV1?: boolean;
  };
};

type SoakCheckpoint = {
  id: string;
  label: string;
  capturedAtMs: number;
  summary: {
    brokerStatus: string | null;
    tradelockerStatus: string | null;
    mt5BridgeAvailable: boolean | null;
    schedulerTaskCount: number | null;
    signalRuns: number | null;
    signalErrors: number | null;
    shadowRuns: number | null;
    shadowErrors: number | null;
    dedupeHits: number | null;
    cacheHits: number | null;
    workerFallbackUsed: number;
    workerFallbackTotal: number;
    cacheOverBudget: string[];
  };
  snapshot: SystemStateSnapshot | null;
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

const toBase64Utf8 = (value: string) => {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
};

const buildSoakCheckpointSummary = (snapshot: SystemStateSnapshot | null, liveHealth: HealthSnapshot | null) => {
  const workerDomain = liveHealth?.workerFallback?.byDomain
    ? Object.values(liveHealth.workerFallback.byDomain)
    : [];
  let workerFallbackUsed = 0;
  let workerFallbackTotal = 0;
  for (const row of workerDomain) {
    workerFallbackUsed += Number(row?.fallbackUsed || 0);
    workerFallbackTotal += Number(row?.total || 0);
  }
  const cacheOverBudget = (liveHealth?.cacheBudgets || [])
    .filter((row) => Number(row?.entries || 0) > Number(row?.maxEntries || 0))
    .map((row) => String(row?.name || '').trim())
    .filter(Boolean);

  return {
    brokerStatus: liveHealth?.brokerStatus ?? null,
    tradelockerStatus: snapshot?.tradelocker?.status ? String(snapshot.tradelocker.status) : null,
    mt5BridgeAvailable:
      snapshot?.mt5?.bridgeAvailable == null ? null : Boolean(snapshot.mt5.bridgeAvailable),
    schedulerTaskCount:
      liveHealth?.scheduler?.taskCount == null ? null : Number(liveHealth.scheduler.taskCount),
    signalRuns:
      liveHealth?.scheduler?.signalTask?.runCount == null
        ? null
        : Number(liveHealth.scheduler.signalTask.runCount),
    signalErrors:
      liveHealth?.scheduler?.signalTask?.errorCount == null
        ? null
        : Number(liveHealth.scheduler.signalTask.errorCount),
    shadowRuns:
      liveHealth?.scheduler?.shadowTask?.runCount == null
        ? null
        : Number(liveHealth.scheduler.shadowTask.runCount),
    shadowErrors:
      liveHealth?.scheduler?.shadowTask?.errorCount == null
        ? null
        : Number(liveHealth.scheduler.shadowTask.errorCount),
    dedupeHits:
      liveHealth?.perf?.brokerCoordinatorDedupeHits == null
        ? null
        : Number(liveHealth.perf.brokerCoordinatorDedupeHits),
    cacheHits:
      liveHealth?.perf?.brokerCoordinatorCacheHits == null
        ? null
        : Number(liveHealth.perf.brokerCoordinatorCacheHits),
    workerFallbackUsed,
    workerFallbackTotal,
    cacheOverBudget
  };
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

const MonitorInterface: React.FC<MonitorInterfaceProps> = ({
  health,
  onRequestSnapshot,
  onClearSnapshotFrameCache,
  onRunActionCatalog,
  onExecuteAgentTool,
  liveErrors,
  onClearLiveErrors,
  runtimeOpsEvents,
  onClearRuntimeOpsEvents,
  runtimeOpsState,
  runtimeOpsEnabled,
  onSetRuntimeOpsEnabled,
  onSetRuntimeOpsMode,
  onEmergencyStopRuntimeOps,
  onRunRuntimeOpsAction,
  runtimeOpsFeatureFlags
}) => {
  const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);
  const livePolicyService = useMemo(() => getLivePolicyService(), []);
  const [opsTab, setOpsTab] = useState<'overview' | 'logs' | 'control'>('overview');
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
  const [ratePolicyBusy, setRatePolicyBusy] = useState(false);
  const [ratePolicyError, setRatePolicyError] = useState<string | null>(null);
  const [soakRunId, setSoakRunId] = useState('');
  const [soakStartedAtMs, setSoakStartedAtMs] = useState<number | null>(null);
  const [soakLabel, setSoakLabel] = useState('');
  const [soakCheckpoints, setSoakCheckpoints] = useState<SoakCheckpoint[]>([]);
  const [soakBusy, setSoakBusy] = useState(false);
  const [soakError, setSoakError] = useState<string | null>(null);
  const [livePolicy, setLivePolicy] = useState(livePolicyService.getSnapshot());
  const [livePolicyHistory, setLivePolicyHistory] = useState(livePolicyService.getHistory(6));
  const [logSourceFilter, setLogSourceFilter] = useState('all');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [logSearch, setLogSearch] = useState('');
  const [followTail, setFollowTail] = useState(true);
  const [actionInputId, setActionInputId] = useState('system.snapshot');
  const [actionPayloadText, setActionPayloadText] = useState('{\n  \"source\": \"monitor\"\n}');
  const [controlBusy, setControlBusy] = useState(false);
  const [controlStatus, setControlStatus] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const logsTailRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const actionDefinitions = useMemo(() => {
    const defs = listActionDefinitions();
    return defs
      .map((def) => ({
        id: String(def?.id || ''),
        def
      }))
      .filter((row) => !!row.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, []);
  const selectedActionDef = useMemo<ActionDefinition | null>(() => {
    const id = String(actionInputId || '').trim();
    if (!id) return null;
    return actionDefinitions.find((row) => row.id === id)?.def || null;
  }, [actionDefinitions, actionInputId]);

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
  const chartFrameCache = liveHealth?.chartFrameCache ?? null;
  const panelConnectivityRows = Array.isArray(liveHealth?.panelConnectivity) ? liveHealth.panelConnectivity : [];
  const panelFreshnessRows = Array.isArray(liveHealth?.panelFreshness) ? liveHealth.panelFreshness : [];
  const outcomeFeedCursor = liveHealth?.outcomeFeed?.cursor || null;
  const outcomeFeedConsistency = liveHealth?.outcomeFeed?.consistency || null;
  const schedulerHealth = liveHealth?.scheduler || null;
  const cacheBudgetRows = Array.isArray(liveHealth?.cacheBudgets) ? liveHealth.cacheBudgets : [];
  const rateLimitTelemetry = liveHealth?.tradelockerRateLimitTelemetry || null;
  const rateLimitTopRoutes = Array.isArray(rateLimitTelemetry?.topRoutes) ? rateLimitTelemetry.topRoutes : [];
  const rateLimitTopAccounts = Array.isArray((rateLimitTelemetry as any)?.topAccounts) ? ((rateLimitTelemetry as any).topAccounts as any[]) : [];
  const rateLimitPolicy = String((rateLimitTelemetry as any)?.policy || '').trim().toLowerCase();

  const rawJson = useMemo(() => {
    if (!snapshot) return '';
    try {
      return JSON.stringify(snapshot, null, 2);
    } catch {
      return '';
    }
  }, [snapshot]);

  const mergedRuntimeLogs = useMemo(() => {
    const runtimeRows = Array.isArray(runtimeOpsEvents) ? runtimeOpsEvents.slice() : [];
    const rendererRows: RuntimeOpsEvent[] = Array.isArray(liveErrors)
      ? liveErrors.map((row) => ({
          id: String(row.id || `renderer_${row.ts || Date.now()}`),
          ts: Number(row.ts || Date.now()),
          source: 'renderer_error',
          level: row.level === 'warn' || row.level === 'error' ? row.level : 'info',
          message: String(row.message || ''),
          code: String(row.source || ''),
          payload: row.detail && typeof row.detail === 'object' ? row.detail : null
        }))
      : [];
    const merged = [...runtimeRows, ...rendererRows];
    merged.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
    return merged;
  }, [liveErrors, runtimeOpsEvents]);

  const filteredRuntimeLogs = useMemo(() => {
    const sourceNeedle = String(logSourceFilter || '').trim().toLowerCase();
    const levelNeedle = String(logLevelFilter || '').trim().toLowerCase();
    const searchNeedle = String(logSearch || '').trim().toLowerCase();
    return mergedRuntimeLogs.filter((row) => {
      const source = String(row.source || '').toLowerCase();
      const level = String(row.level || '').toLowerCase();
      if (sourceNeedle && sourceNeedle !== 'all' && source !== sourceNeedle) return false;
      if (levelNeedle && levelNeedle !== 'all' && level !== levelNeedle) return false;
      if (!searchNeedle) return true;
      const hay = `${row.message || ''} ${row.code || ''} ${JSON.stringify(row.payload || {})}`.toLowerCase();
      return hay.includes(searchNeedle);
    });
  }, [logLevelFilter, logSearch, logSourceFilter, mergedRuntimeLogs]);

  useEffect(() => {
    if (!followTail || opsTab !== 'logs') return;
    logsTailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [filteredRuntimeLogs.length, followTail, opsTab]);

  const runtimeLogSourceOptions = useMemo(() => {
    const out = new Set<string>(['all']);
    for (const row of mergedRuntimeLogs) {
      const source = String(row?.source || '').trim().toLowerCase();
      if (source) out.add(source);
    }
    return Array.from(out.values());
  }, [mergedRuntimeLogs]);

  const setRuntimeOpsEnabled = useCallback(async (next: boolean) => {
    if (!onSetRuntimeOpsEnabled) return;
    setControlBusy(true);
    setControlError(null);
    try {
      await onSetRuntimeOpsEnabled(next);
      setControlStatus(next ? 'Runtime ops enabled.' : 'Runtime ops disabled.');
    } catch (err: any) {
      setControlError(err?.message ? String(err.message) : 'Failed to update runtime ops enabled state.');
    } finally {
      setControlBusy(false);
    }
  }, [onSetRuntimeOpsEnabled]);

  const setRuntimeOpsMode = useCallback(async (mode: RuntimeOpsMode) => {
    if (!onSetRuntimeOpsMode) return;
    setControlBusy(true);
    setControlError(null);
    try {
      await onSetRuntimeOpsMode(mode);
      setControlStatus(`Runtime ops mode set to ${mode}.`);
    } catch (err: any) {
      setControlError(err?.message ? String(err.message) : 'Failed to set runtime ops mode.');
    } finally {
      setControlBusy(false);
    }
  }, [onSetRuntimeOpsMode]);

  const triggerEmergencyStop = useCallback(async () => {
    if (!onEmergencyStopRuntimeOps) return;
    setControlBusy(true);
    setControlError(null);
    try {
      await onEmergencyStopRuntimeOps();
      setControlStatus('Emergency stop applied.');
    } catch (err: any) {
      setControlError(err?.message ? String(err.message) : 'Failed to apply emergency stop.');
    } finally {
      setControlBusy(false);
    }
  }, [onEmergencyStopRuntimeOps]);

  const runRuntimeAction = useCallback(async () => {
    if (!onRunRuntimeOpsAction) return;
    const actionId = String(actionInputId || '').trim();
    if (!actionId) {
      setControlError('Action ID is required.');
      return;
    }
    let payload: Record<string, any> = {};
    const rawPayload = String(actionPayloadText || '').trim();
    if (rawPayload) {
      try {
        const parsed = JSON.parse(rawPayload);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          payload = parsed as Record<string, any>;
        } else {
          setControlError('Action payload must be a JSON object.');
          return;
        }
      } catch (err: any) {
        setControlError(err?.message ? `Invalid JSON payload: ${String(err.message)}` : 'Invalid JSON payload.');
        return;
      }
    }
    setControlBusy(true);
    setControlError(null);
    try {
      const res = await onRunRuntimeOpsAction({ actionId, payload });
      if (res?.ok === false) {
        setControlError(String(res?.error || res?.text || 'Runtime action failed.'));
        return;
      }
      setControlStatus(`Action executed: ${actionId}`);
    } catch (err: any) {
      setControlError(err?.message ? String(err.message) : 'Runtime action failed.');
    } finally {
      setControlBusy(false);
    }
  }, [actionInputId, actionPayloadText, onRunRuntimeOpsAction]);

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

  const setRateLimitPolicy = useCallback(async (policy: 'safe' | 'balanced' | 'aggressive') => {
    const api = window.glass?.tradelocker;
    if (!api?.setRateLimitPolicy) {
      setRatePolicyError('TradeLocker policy control unavailable in this build.');
      return;
    }
    setRatePolicyBusy(true);
    setRatePolicyError(null);
    try {
      const res = await api.setRateLimitPolicy({ policy });
      if (!res?.ok) {
        setRatePolicyError(res?.error ? String(res.error) : 'Failed to apply rate-limit policy.');
        return;
      }
      setStatus(`TradeLocker rate-limit policy set to ${String(policy).toUpperCase()}.`);
      await refreshSnapshot({ silent: true });
    } catch (err: any) {
      setRatePolicyError(err?.message ? String(err.message) : 'Failed to apply rate-limit policy.');
    } finally {
      setRatePolicyBusy(false);
    }
  }, [refreshSnapshot]);

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

  const clearSnapshotFrameCache = useCallback(async (dropSessionBars: boolean) => {
    if (!onClearSnapshotFrameCache) {
      setError('Snapshot cache clear action unavailable.');
      return;
    }
    try {
      const res = await onClearSnapshotFrameCache({ dropSessionBars });
      if (res?.ok) {
        const cleared = Math.max(0, Number(res?.entriesCleared || 0));
        setStatus(
          dropSessionBars
            ? `Snapshot cache cleared and sessions reset (${cleared} entries).`
            : `Snapshot cache cleared (${cleared} entries).`
        );
        setError(null);
        await refreshSnapshot({ silent: true });
      } else {
        const msg = res?.error ? String(res.error) : 'Snapshot cache clear failed.';
        setError(msg);
      }
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Snapshot cache clear failed.');
    }
  }, [onClearSnapshotFrameCache, refreshSnapshot]);

  const startManualSoakRun = useCallback(() => {
    const now = Date.now();
    const runId = `manual_soak_${now}`;
    setSoakRunId(runId);
    setSoakStartedAtMs(now);
    setSoakLabel('T+0m');
    setSoakCheckpoints([]);
    setSoakError(null);
    setStatus('Manual soak run started. Capture checkpoints from Monitor.');
  }, []);

  const captureSoakCheckpoint = useCallback(async () => {
    setSoakBusy(true);
    setSoakError(null);
    try {
      let nextSnapshot = snapshot;
      if (onRequestSnapshot) {
        const res = await onRequestSnapshot({ detail, maxItems });
        const payload = res?.payload ?? res?.data?.payload ?? res?.data ?? null;
        if (res?.ok && payload && typeof payload === 'object' && 'capturedAtMs' in payload) {
          nextSnapshot = payload as SystemStateSnapshot;
          setSnapshot(nextSnapshot);
        }
      }
      const currentHealth = (nextSnapshot?.health ?? health ?? null) as HealthSnapshot | null;
      if (!nextSnapshot && !currentHealth) {
        setSoakError('No monitor snapshot available. Refresh first, then capture.');
        return;
      }
      const now = Date.now();
      const elapsedMinutes = soakStartedAtMs ? Math.max(0, Math.floor((now - soakStartedAtMs) / 60000)) : 0;
      const label = String(soakLabel || '').trim() || `T+${elapsedMinutes}m`;
      const checkpoint: SoakCheckpoint = {
        id: `${now}_${Math.random().toString(16).slice(2, 8)}`,
        label,
        capturedAtMs: now,
        summary: buildSoakCheckpointSummary(nextSnapshot, currentHealth),
        snapshot: nextSnapshot || null
      };
      setSoakCheckpoints((prev) => [...prev, checkpoint].slice(-32));
      setStatus(`Soak checkpoint captured (${label}).`);
      if (soakStartedAtMs) {
        setSoakLabel(`T+${elapsedMinutes + 5}m`);
      }
    } catch (err: any) {
      setSoakError(err?.message ? String(err.message) : 'Failed to capture soak checkpoint.');
    } finally {
      setSoakBusy(false);
    }
  }, [detail, health, maxItems, onRequestSnapshot, snapshot, soakLabel, soakStartedAtMs]);

  const exportSoakEvidence = useCallback(async () => {
    setSoakError(null);
    if (!Array.isArray(soakCheckpoints) || soakCheckpoints.length === 0) {
      setSoakError('No soak checkpoints captured yet.');
      return;
    }
    const runId = String(soakRunId || (soakStartedAtMs ? `manual_soak_${soakStartedAtMs}` : `manual_soak_${Date.now()}`));
    const payload = {
      runId,
      startedAtMs: soakStartedAtMs,
      exportedAtMs: Date.now(),
      checkpointCount: soakCheckpoints.length,
      checkpoints: soakCheckpoints
    };
    const text = JSON.stringify(payload, null, 2);
    let copied = false;
    try {
      const writeClipboard = (window as any)?.glass?.clipboard?.writeText;
      if (writeClipboard) {
        writeClipboard(text);
        copied = true;
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      // ignore clipboard failure
    }
    try {
      const saver = (window as any)?.glass?.saveUserFile;
      if (typeof saver === 'function') {
        const base64 = toBase64Utf8(text);
        const dataUrl = `data:application/json;base64,${base64}`;
        const res = await saver({
          dataUrl,
          mimeType: 'application/json',
          subdir: 'manual-soak',
          prefix: runId
        });
        if (res?.ok) {
          setStatus(`Soak evidence exported: ${res.filename || res.path || 'manual-soak'}.${copied ? ' Copied to clipboard.' : ''}`);
          return;
        }
      }
      setStatus(copied ? 'Soak evidence copied to clipboard.' : 'Soak export unavailable in this build.');
    } catch (err: any) {
      setSoakError(err?.message ? String(err.message) : 'Failed to export soak evidence.');
    }
  }, [soakCheckpoints, soakRunId, soakStartedAtMs]);

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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setOpsTab('overview')}
            className={`px-2 py-1 rounded border ${
              opsTab === 'overview'
                ? 'border-cyan-300/50 text-cyan-200 bg-cyan-500/10'
                : 'border-white/10 text-gray-300 hover:bg-white/5'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setOpsTab('logs')}
            className={`px-2 py-1 rounded border ${
              opsTab === 'logs'
                ? 'border-cyan-300/50 text-cyan-200 bg-cyan-500/10'
                : 'border-white/10 text-gray-300 hover:bg-white/5'
            }`}
          >
            Live Logs
          </button>
          <button
            type="button"
            onClick={() => setOpsTab('control')}
            className={`px-2 py-1 rounded border ${
              opsTab === 'control'
                ? 'border-cyan-300/50 text-cyan-200 bg-cyan-500/10'
                : 'border-white/10 text-gray-300 hover:bg-white/5'
            }`}
          >
            Codex Control
          </button>
          {runtimeOpsState ? (
            <span className="ml-auto text-[10px] text-gray-500">
              Mode {runtimeOpsState.mode} • Stream {runtimeOpsState.streamStatus}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {opsTab === 'overview' ? (
          <>
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
              <MetricCard title="Snapshot Frame Cache">
                <MetricRow label="Enabled" value={formatBool(chartFrameCache?.enabled ?? null)} />
                <MetricRow label="Entries" value={chartFrameCache?.entries ?? 0} />
                <MetricRow label="Partitions" value={chartFrameCache?.partitions?.length ?? 0} />
                <MetricRow label="Hydrate Hit Rate" value={formatPercent(chartFrameCache?.hydrate?.hitRate ?? null)} />
                <MetricRow
                  label="Fetch Mix"
                  value={`F ${chartFrameCache?.fetchMix?.full ?? 0} / I ${chartFrameCache?.fetchMix?.incremental ?? 0}`}
                />
                <MetricRow
                  label="Flush Failures"
                  value={chartFrameCache?.persist?.flushFailures ?? 0}
                  tone={(chartFrameCache?.persist?.flushFailures || 0) > 0 ? 'text-amber-300' : undefined}
                />
                <MetricRow label="Last Flush" value={formatAge(chartFrameCache?.persist?.lastFlushAtMs)} />
                {chartFrameCache?.persist?.lastFlushError ? (
                  <div className="text-[10px] text-amber-300">Err: {chartFrameCache.persist.lastFlushError}</div>
                ) : null}
                {Array.isArray(chartFrameCache?.partitions) && chartFrameCache.partitions.length > 0 ? (
                  <div className="text-[10px] text-gray-500 break-all">
                    {chartFrameCache.partitions.slice(0, 3).join(' | ')}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void clearSnapshotFrameCache(false); }}
                    className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[10px]"
                  >
                    Clear Cache
                  </button>
                  <button
                    type="button"
                    onClick={() => { void clearSnapshotFrameCache(true); }}
                    className="px-2 py-1 rounded border border-amber-400/40 text-amber-200 hover:bg-amber-500/10 text-[10px]"
                  >
                    Clear + Reset
                  </button>
                </div>
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
                <MetricRow label="Coord Cache Hits" value={perf?.brokerCoordinatorCacheHits ?? 0} />
                <MetricRow label="Coord Dedupe Hits" value={perf?.brokerCoordinatorDedupeHits ?? 0} />
                <MetricRow label="Coord Cache Rate" value={formatPercent(perf?.brokerCoordinatorCacheHitRate ?? null)} />
                <MetricRow label="Coord Dedupe Rate" value={formatPercent(perf?.brokerCoordinatorDedupeRate ?? null)} />
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
                <MetricRow label="Pattern Sync Coalesced" value={perf?.patternWatchSyncCoalesced ?? 0} />
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
                <MetricRow
                  label="Governor"
                  value={rateLimitTelemetry?.mode ? String(rateLimitTelemetry.mode).toUpperCase() : '--'}
                  tone={
                    rateLimitTelemetry?.mode === 'cooldown'
                      ? 'text-red-300'
                      : rateLimitTelemetry?.mode === 'guarded'
                        ? 'text-amber-300'
                      : 'text-emerald-300'
                  }
                />
                <MetricRow label="Policy" value={rateLimitPolicy ? rateLimitPolicy.toUpperCase() : '--'} />
                <MetricRow label="Pressure" value={formatNumber((rateLimitTelemetry as any)?.pressure ?? null, 2)} />
                <MetricRow label="Window 429" value={rateLimitTelemetry?.window429 ?? '--'} />
                <MetricRow label="Window Blocked" value={rateLimitTelemetry?.windowBlocked ?? '--'} />
                <MetricRow label="Adaptive Interval" value={formatMs(rateLimitTelemetry?.adaptiveMinIntervalMs ?? null)} />
                <MetricRow label="Adaptive Concurrency" value={rateLimitTelemetry?.adaptiveRequestConcurrency ?? '--'} />
                <MetricRow label="Last 429" value={formatAge(rateLimitTelemetry?.last429AtMs ?? null)} />
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {(['safe', 'balanced', 'aggressive'] as const).map((policy) => (
                    <button
                      key={policy}
                      type="button"
                      disabled={ratePolicyBusy}
                      onClick={() => { void setRateLimitPolicy(policy); }}
                      className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wide ${
                        rateLimitPolicy === policy
                          ? 'border-cyan-300/60 text-cyan-200 bg-cyan-500/10'
                          : 'border-white/10 text-gray-300 hover:bg-white/5'
                      } ${ratePolicyBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {policy}
                    </button>
                  ))}
                </div>
                {ratePolicyError ? (
                  <div className="text-[10px] text-amber-300">{ratePolicyError}</div>
                ) : null}
                {rateLimitTopRoutes.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10 space-y-1 text-[10px] text-gray-400">
                    <div className="uppercase tracking-widest text-gray-500">Route hot spots</div>
                    {rateLimitTopRoutes.slice(0, 4).map((row) => (
                      <div key={row.routeKey} className="flex items-center justify-between gap-2">
                        <span className="truncate">{row.routeKey}</span>
                        <span className="text-gray-500 whitespace-nowrap">
                          429:{row.window429 ?? 0} blk:{row.windowBlocked ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {rateLimitTopAccounts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10 space-y-1 text-[10px] text-gray-400">
                    <div className="uppercase tracking-widest text-gray-500">Account hot spots</div>
                    {rateLimitTopAccounts.slice(0, 3).map((row) => (
                      <div key={String(row.accountKey || row.label || 'acct')} className="flex items-center justify-between gap-2">
                        <span className="truncate">{String(row.label || row.accountKey || '--')}</span>
                        <span className="text-gray-500 whitespace-nowrap">
                          429:{Number(row.window429 || 0)} blk:{Number(row.windowBlocked || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </MetricCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <MetricCard title="Scheduler">
                <MetricRow label="Visible" value={formatBool(schedulerHealth?.visible ?? null)} />
                <MetricRow label="Tasks" value={schedulerHealth?.taskCount ?? '--'} />
                <MetricRow label="Signal Task" value={schedulerHealth?.signalTask?.id || schedulerHealth?.signalTaskId || '--'} />
                <MetricRow label="Signal Runs" value={schedulerHealth?.signalTask?.runCount ?? '--'} />
                <MetricRow label="Signal Errors" value={schedulerHealth?.signalTask?.errorCount ?? '--'} />
                <MetricRow label="Signal Last Run" value={formatAge(schedulerHealth?.signalTask?.lastRunAtMs)} />
                <MetricRow label="Signal Last Duration" value={formatMs(schedulerHealth?.signalTask?.lastDurationMs)} />
                <MetricRow
                  label="Signal Paused"
                  value={formatBool(schedulerHealth?.signalTask?.paused ?? null)}
                  tone={schedulerHealth?.signalTask?.paused ? 'text-amber-300' : undefined}
                />
                <MetricRow label="Shadow Task" value={schedulerHealth?.shadowTask?.id || schedulerHealth?.shadowTaskId || '--'} />
                <MetricRow label="Shadow Runs" value={schedulerHealth?.shadowTask?.runCount ?? '--'} />
                <MetricRow label="Shadow Errors" value={schedulerHealth?.shadowTask?.errorCount ?? '--'} />
                <MetricRow label="Shadow Last Run" value={formatAge(schedulerHealth?.shadowTask?.lastRunAtMs)} />
                <MetricRow label="Shadow Last Duration" value={formatMs(schedulerHealth?.shadowTask?.lastDurationMs)} />
                <MetricRow
                  label="Shadow Paused"
                  value={formatBool(schedulerHealth?.shadowTask?.paused ?? null)}
                  tone={schedulerHealth?.shadowTask?.paused ? 'text-amber-300' : undefined}
                />
              </MetricCard>
              <MetricCard title="Startup">
                <MetricRow
                  label="Phase"
                  value={liveHealth.startupPhase || '--'}
                  tone={toneForStatus(liveHealth.startupPhase || null)}
                />
                <MetricRow
                  label="Bridge"
                  value={liveHealth.startupBridgeState || '--'}
                  tone={toneForStatus(liveHealth.startupBridgeState || null)}
                />
                <MetricRow
                  label="OpenAI"
                  value={liveHealth.startupOpenaiState || '--'}
                  tone={toneForStatus(liveHealth.startupOpenaiState || null)}
                />
                <MetricRow
                  label="TradeLocker"
                  value={liveHealth.startupTradeLockerState || '--'}
                  tone={toneForStatus(liveHealth.startupTradeLockerState || null)}
                />
                <MetricRow
                  label="Auto Restore"
                  value={
                    liveHealth.startupTradeLockerAutoRestoreAttempted == null
                      ? '--'
                      : (liveHealth.startupTradeLockerAutoRestoreSuccess ? 'success' : 'failed')
                  }
                  tone={
                    liveHealth.startupTradeLockerAutoRestoreAttempted == null
                      ? undefined
                      : (liveHealth.startupTradeLockerAutoRestoreSuccess ? 'text-emerald-300' : 'text-amber-300')
                  }
                />
                <MetricRow label="Checked" value={formatAge(liveHealth.startupCheckedAtMs)} />
                <MetricRow label="Scopes Active" value={liveHealth.startupActiveScopes?.length ?? 0} />
                <MetricRow label="Scopes Blocked" value={liveHealth.startupBlockedScopes?.length ?? 0} />
                {liveHealth.startupBridgeError ? (
                  <div className="text-[10px] text-red-400">Bridge: {liveHealth.startupBridgeError}</div>
                ) : null}
                {liveHealth.startupDiagnosticWarning ? (
                  <div className="text-[10px] text-amber-300">{liveHealth.startupDiagnosticWarning}</div>
                ) : null}
              </MetricCard>
              <MetricCard title="Cache Budgets">
                {cacheBudgetRows.length === 0 ? (
                  <div className="text-[11px] text-gray-500">No cache budget telemetry.</div>
                ) : (
                  cacheBudgetRows.slice(0, 6).map((row) => (
                    <div key={String(row.name)} className="space-y-0.5 mb-2">
                      <MetricRow label={String(row.name || '').toUpperCase()} value={`${row.entries ?? 0}/${row.maxEntries ?? 0}`} />
                      <div className="text-[10px] text-gray-500">
                        size {formatNumber(row.size ?? 0, 1)} • hit {formatPercent(row.hitRate ?? null)} • evict {row.evictions ?? 0}
                      </div>
                    </div>
                  ))
                )}
              </MetricCard>
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
                      {!row.ready && (row.retryAfterMs || row.blockedUntilMs) ? (
                        <div className="text-[10px] text-gray-500">
                          retry {formatMs(row.retryAfterMs ?? ((row.blockedUntilMs || 0) - Date.now()))}
                        </div>
                      ) : null}
                      {!row.ready && row.blockedReason ? (
                        <div className="text-[10px] text-amber-300">{row.blockedReason}</div>
                      ) : null}
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

        <MetricCard title="Manual Soak">
          <MetricRow label="Run ID" value={soakRunId || '--'} />
          <MetricRow label="Started" value={formatTime(soakStartedAtMs)} />
          <MetricRow label="Checkpoints" value={soakCheckpoints.length} />
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 mt-2">
            <input
              value={soakLabel}
              onChange={(e) => setSoakLabel(e.target.value)}
              placeholder="Checkpoint label (e.g. T+5m)"
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
            />
            <button
              type="button"
              onClick={startManualSoakRun}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
            >
              Start Run
            </button>
            <button
              type="button"
              onClick={() => { void captureSoakCheckpoint(); }}
              disabled={soakBusy}
              className="px-2 py-1 rounded border border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/10 text-[11px] disabled:opacity-40"
            >
              {soakBusy ? 'Capturing...' : 'Capture Checkpoint'}
            </button>
            <button
              type="button"
              onClick={() => { void exportSoakEvidence(); }}
              className="px-2 py-1 rounded border border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/10 text-[11px]"
            >
              Export Evidence
            </button>
          </div>
          {soakError ? <div className="mt-2 text-[11px] text-amber-300">{soakError}</div> : null}
          {soakCheckpoints.length > 0 ? (
            <div className="mt-2 text-[11px] text-gray-400 space-y-1 max-h-28 overflow-y-auto custom-scrollbar">
              {soakCheckpoints.slice(-6).reverse().map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{row.label}</span>
                  <span className="text-gray-500 whitespace-nowrap">
                    dedupe {row.summary.dedupeHits ?? '--'} • {formatAge(row.capturedAtMs)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
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
          </>
        ) : null}

        {opsTab === 'logs' ? (
          <MetricCard title="Live Runtime Logs">
            {!runtimeOpsFeatureFlags?.runtimeOpsLogsV1 ? (
              <div className="text-[11px] text-gray-500">Runtime log stream is disabled by feature flag.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2">
                  <select
                    value={logSourceFilter}
                    onChange={(e) => setLogSourceFilter(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-200"
                  >
                    {runtimeLogSourceOptions.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                  <select
                    value={logLevelFilter}
                    onChange={(e) => setLogLevelFilter((e.target.value as 'all' | 'info' | 'warn' | 'error') || 'all')}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-gray-200"
                  >
                    <option value="all">all levels</option>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                  </select>
                  <input
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs..."
                    className="md:col-span-2 bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-gray-400 text-[11px]">
                      <input
                        type="checkbox"
                        checked={followTail}
                        onChange={(e) => setFollowTail(e.target.checked)}
                        className="accent-cyan-500"
                      />
                      Follow
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        onClearRuntimeOpsEvents?.();
                        onClearLiveErrors?.();
                      }}
                      className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-gray-500 mb-2">
                  Stream {runtimeOpsState?.streamStatus || 'disconnected'} • Events {filteredRuntimeLogs.length}
                </div>
                <div className="max-h-[62vh] overflow-y-auto custom-scrollbar border border-white/10 rounded-md bg-black/30 p-2 space-y-1">
                  {filteredRuntimeLogs.length === 0 ? (
                    <div className="text-[11px] text-gray-500">No runtime logs captured yet.</div>
                  ) : (
                    filteredRuntimeLogs.map((row) => (
                      <div key={row.id} className="text-[11px] border-b border-white/5 pb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">{formatTime(row.ts)}</span>
                          <span className={row.level === 'error' ? 'text-red-400' : row.level === 'warn' ? 'text-amber-300' : 'text-cyan-300'}>
                            {String(row.level || 'info').toUpperCase()}
                          </span>
                          <span className="text-gray-400">{row.source}</span>
                          {row.code ? <span className="text-gray-500">{row.code}</span> : null}
                        </div>
                        <div className="text-gray-200 break-words">{row.message}</div>
                      </div>
                    ))
                  )}
                  <div ref={logsTailRef} />
                </div>
              </>
            )}
          </MetricCard>
        ) : null}

        {opsTab === 'control' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <MetricCard title="Controller State">
              {!runtimeOpsFeatureFlags?.runtimeOpsControllerV1 ? (
                <div className="text-[11px] text-gray-500">Runtime controller is disabled by feature flag.</div>
              ) : (
                <>
                  <MetricRow label="Mode" value={runtimeOpsState?.mode || '--'} tone={toneForStatus(runtimeOpsState?.mode || null)} />
                  <MetricRow label="Armed" value={formatBool(runtimeOpsState?.armed ?? null)} />
                  <MetricRow label="Stream" value={runtimeOpsState?.streamStatus || '--'} tone={toneForStatus(runtimeOpsState?.streamStatus || null)} />
                  <MetricRow label="Queue Depth" value={runtimeOpsState?.queueDepth ?? 0} />
                  <MetricRow label="Failures" value={runtimeOpsState?.failureStreak ?? 0} />
                  <MetricRow label="Guardrail Trips" value={runtimeOpsState?.guardrailTrips ?? 0} />
                  <MetricRow label="Action Failures" value={runtimeOpsState?.actionFailures ?? 0} />
                  <MetricRow label="Dropped Events" value={runtimeOpsState?.droppedCount ?? 0} />
                  <MetricRow label="Reconnects" value={runtimeOpsState?.reconnectCount ?? 0} />
                  <MetricRow label="Cooldown Until" value={formatTime(runtimeOpsState?.cooldownUntilMs)} />
                  <MetricRow
                    label="Cmd Subscriber"
                    value={formatBool(runtimeOpsState?.commandSubscriberHealthy ?? null)}
                    tone={runtimeOpsState?.commandSubscriberHealthy === false ? 'text-red-400' : 'text-emerald-300'}
                  />
                  <MetricRow
                    label="External Relay"
                    value={formatBool(runtimeOpsState?.externalRelayHealthy ?? null)}
                    tone={runtimeOpsState?.externalRelayHealthy === false ? 'text-red-400' : 'text-emerald-300'}
                  />
                  <MetricRow label="Last External Command" value={formatTime(runtimeOpsState?.lastExternalCommandAtMs)} />
                  <MetricRow
                    label="Last External Error"
                    value={runtimeOpsState?.lastExternalCommandError || '--'}
                    tone={runtimeOpsState?.lastExternalCommandError ? 'text-amber-300' : 'text-gray-300'}
                  />
                  <MetricRow label="Cmd Subscribes" value={health?.runtimeOpsExternalCommandSubscribeCount ?? 0} />
                  <MetricRow label="Cmd Unsubscribes" value={health?.runtimeOpsExternalCommandUnsubscribeCount ?? 0} />
                  <MetricRow label="Cmd Timeouts" value={health?.runtimeOpsExternalCommandTimeouts ?? 0} />
                  <MetricRow label="Cmd Reply Failures" value={health?.runtimeOpsExternalCommandReplyFailures ?? 0} />
                  <MetricRow label="Renderer Errors Fwd" value={health?.runtimeOpsRendererErrorForwarded ?? 0} />
                </>
              )}
            </MetricCard>
            <MetricCard title="Controller Actions">
              {!runtimeOpsFeatureFlags?.runtimeOpsControlV1 ? (
                <div className="text-[11px] text-gray-500">Runtime control actions are disabled by feature flag.</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <label className="flex items-center gap-1 text-[11px] text-gray-400">
                      <input
                        type="checkbox"
                        checked={runtimeOpsEnabled !== false}
                        onChange={(e) => { void setRuntimeOpsEnabled(e.target.checked); }}
                        disabled={controlBusy}
                        className="accent-cyan-500"
                      />
                      Enabled
                    </label>
                    <button type="button" onClick={() => { void setRuntimeOpsMode('observe_only'); }} disabled={controlBusy} className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]">
                      Observe
                    </button>
                    <button type="button" onClick={() => { void setRuntimeOpsMode('autonomous'); }} disabled={controlBusy} className="px-2 py-1 rounded border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/10 text-[11px]">
                      Autonomous
                    </button>
                    <button type="button" onClick={() => { void setRuntimeOpsMode('disarmed'); }} disabled={controlBusy} className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/5 text-[11px]">
                      Disarm
                    </button>
                    <button type="button" onClick={() => { void triggerEmergencyStop(); }} disabled={controlBusy} className="px-2 py-1 rounded border border-red-400/50 text-red-200 hover:bg-red-500/10 text-[11px]">
                      Emergency Stop
                    </button>
                  </div>
                  <div className="space-y-2">
                    <select
                      value={actionInputId}
                      onChange={(e) => setActionInputId(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
                    >
                      {actionDefinitions.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.id}
                        </option>
                      ))}
                    </select>
                    {selectedActionDef ? (
                      <div className="rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300">
                        <div className="text-gray-200">{selectedActionDef.summary || selectedActionDef.id}</div>
                        <div className="text-gray-500">
                          domain {selectedActionDef.domain} • broker {selectedActionDef.requiresBroker ? 'yes' : 'no'} • vision {selectedActionDef.requiresVision ? 'yes' : 'no'}
                        </div>
                        <div className="text-gray-500">
                          gates {(Array.isArray(selectedActionDef.safety?.gates) && selectedActionDef.safety.gates.length > 0)
                            ? selectedActionDef.safety.gates.join(', ')
                            : 'none'}
                          {selectedActionDef.safety?.requiresConfirmation ? ' • confirmation required' : ''}
                        </div>
                      </div>
                    ) : null}
                    <input
                      value={actionInputId}
                      onChange={(e) => setActionInputId(e.target.value)}
                      placeholder="Action ID"
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200"
                    />
                    <textarea
                      value={actionPayloadText}
                      onChange={(e) => setActionPayloadText(e.target.value)}
                      rows={6}
                      className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-200 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => { void runRuntimeAction(); }}
                      disabled={controlBusy}
                      className="px-2 py-1 rounded border border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/10 text-[11px] disabled:opacity-40"
                    >
                      {controlBusy ? 'Running...' : 'Run Action'}
                    </button>
                  </div>
                  {controlStatus ? <div className="mt-2 text-[11px] text-emerald-300">{controlStatus}</div> : null}
                  {controlError ? <div className="mt-2 text-[11px] text-red-400">{controlError}</div> : null}
                </>
              )}
            </MetricCard>
            <MetricCard title="Recent Decisions">
              {Array.isArray(runtimeOpsState?.recentDecisions) && runtimeOpsState.recentDecisions.length > 0 ? (
                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                  {runtimeOpsState.recentDecisions.slice(-20).reverse().map((row) => (
                    <div key={row.id} className="text-[11px] border-b border-white/5 pb-1">
                      <div className="text-gray-400">{formatTime(row.atMs)} • {row.mode} • {row.actionId || 'none'}</div>
                      <div className={row.blocked ? 'text-amber-300' : 'text-gray-200'}>{row.reason}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">No recent decisions.</div>
              )}
            </MetricCard>
            <MetricCard title="Recent Actions">
              {Array.isArray(runtimeOpsState?.recentActions) && runtimeOpsState.recentActions.length > 0 ? (
                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                  {runtimeOpsState.recentActions.slice(-20).reverse().map((row) => (
                    <div key={row.id} className="text-[11px] border-b border-white/5 pb-1">
                      <div className="text-gray-400">
                        {formatTime(row.atMs)} • {row.actionId} • {row.domain || 'system'} • {row.liveExecution ? 'LIVE' : 'safe'}
                      </div>
                      <div className={row.ok ? 'text-emerald-300' : 'text-red-400'}>
                        {row.ok ? `ok (${formatMs(row.latencyMs)})` : row.error || row.resultCode || 'failed'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">No recent actions.</div>
              )}
            </MetricCard>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MonitorInterface;
