import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, AlertTriangle, Activity, Power, DollarSign, Percent, Briefcase, Send, MessageSquare, Brain, Terminal, Search, Pencil, Trash2, Plus, X, Save, RefreshCcw, Bookmark, Zap, BookOpen } from 'lucide-react';
import { ActionFlowRecommendation, Agent, AutoPilotConfig, AutoPilotExecutionMode, AutoPilotMode, HealthSnapshot, Memory, ShadowTradeCompareSummary, ShadowTradeStats, SetupStrategy, TaskPlaybookRun, TaskTreeResumeEntry, TaskTreeRunEntry, TradeBlockInfo } from '../types';
import type { TaskTreeRunSummary } from '../services/taskTreeService';
import { resolveAutoPilotPolicy } from '../services/autoPilotPolicy';

interface AutoPilotInterfaceProps {
    config: AutoPilotConfig;
    onUpdateConfig: (config: AutoPilotConfig) => void;
    equity: number;
    memories?: Memory[];
    agents?: Agent[];
    activePlaybookRun?: TaskPlaybookRun | null;
    recentPlaybookRuns?: TaskPlaybookRun[] | null;
    taskTreeResumeEntries?: TaskTreeResumeEntry[] | null;
  onResumeTaskTreeRun?: (input: {
    taskType: 'signal' | 'action';
    runId: string;
    action?: 'resume' | 'abort' | 'approve' | 'skip';
  }) => void;
    taskTreeRuns?: TaskTreeRunEntry[] | null;
    actionTaskTreeRuns?: TaskTreeRunEntry[] | null;
    onReplayTaskTree?: (summary: TaskTreeRunSummary) => void;
    recommendedFlows?: ActionFlowRecommendation[] | null;
    onRunActionFlow?: (flow: ActionFlowRecommendation, opts?: { symbol?: string | null; timeframe?: string | null }) => void;
    onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
    onOpenAcademy?: () => void;
    onResumePlaybookRun?: (
        runId: string,
        opts?: {
            action?: 'resume' | 'approve' | 'skip' | 'abort';
            stepId?: string | null;
            actionId?: string | null;
            overrides?: {
                symbol?: string;
                timeframe?: string;
                strategy?: string;
                timeframes?: string[];
                data?: Record<string, any>;
            };
        }
    ) => void;
    postTradeReviewEnabled?: boolean;
    onTogglePostTradeReview?: (enabled: boolean) => void;
    postTradeReviewAgentId?: string;
    onSetPostTradeReviewAgentId?: (id: string) => void;
    onReviewLastClosedTrade?: () => Promise<any> | any;
    onAddMemory?: (args: { type: Memory['type']; text: string; meta?: Record<string, any> }) => Promise<any> | any;
    onUpdateMemory?: (id: string, patch: { type?: Memory['type']; text?: string; meta?: Record<string, any> }) => Promise<any> | any;
    onDeleteMemory?: (id: string) => Promise<any> | any;
    onClearMemories?: () => Promise<any> | any;
    lossStreak?: number | null;
    lossStreakUpdatedAtMs?: number | null;
    shadowTradeStats?: ShadowTradeStats | null;
    shadowCompare?: ShadowTradeCompareSummary | null;
    lastTradeBlock?: TradeBlockInfo | null;
    healthSnapshot?: HealthSnapshot | null;
    brokerRateLimitSuppressUntilMs?: number | null;
}

const isRuleMemory = (m: Memory) => {
  const meta: any = (m as any)?.meta;
  if (!meta || typeof meta !== 'object') return false;
  return !!(meta.isRule || meta.rule === true || meta.pinned === true || meta.hardRule === true);
};

const MODE_OPTIONS: Array<{ key: AutoPilotMode; label: string }> = [
  { key: 'custom', label: 'Custom' },
  { key: 'scalper', label: 'Scalper' },
  { key: 'day', label: 'Day' },
  { key: 'trend', label: 'Trend' },
  { key: 'swing', label: 'Swing' }
];

const EXECUTION_MODE_OPTIONS: Array<{ key: AutoPilotExecutionMode; label: string; hint: string }> = [
  { key: 'live', label: 'Live', hint: 'Send orders to broker.' },
  { key: 'paper', label: 'Paper', hint: 'Sim trades locally.' },
  { key: 'shadow', label: 'Shadow', hint: 'Log trades only (no execution).' }
];

const DECISION_MODE_OPTIONS: Array<{ key: 'deterministic' | 'agent'; label: string; hint: string }> = [
  { key: 'deterministic', label: 'Deterministic', hint: 'Use signal rules.' },
  { key: 'agent', label: 'Agent', hint: 'LLM decides.' }
];

const REASONING_EFFORT_OPTIONS: Array<{ key: 'none' | 'low' | 'medium' | 'high' | 'xhigh'; label: string }> = [
  { key: 'none', label: 'None' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'xhigh', label: 'XHigh' }
];

const STRATEGY_OPTIONS: Array<{ key: SetupStrategy; label: string }> = [
  { key: 'RANGE_BREAKOUT', label: 'Range Breakout' },
  { key: 'BREAK_RETEST', label: 'Break + Retest' },
  { key: 'FVG_RETRACE', label: 'FVG Retrace' },
  { key: 'TREND_PULLBACK', label: 'Trend Pullback' },
  { key: 'MEAN_REVERSION', label: 'Mean Reversion' }
];

const DRIFT_ACTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'paper', label: 'Downgrade to Paper' },
  { value: 'suggest', label: 'Downgrade to Suggest' },
  { value: 'disable', label: 'Disable Watcher' }
];

const AutoPilotInterface: React.FC<AutoPilotInterfaceProps> = ({
  config,
  onUpdateConfig,
  equity,
  memories = [],
  agents = [],
  activePlaybookRun,
  recentPlaybookRuns,
  taskTreeResumeEntries = null,
  onResumeTaskTreeRun,
  taskTreeRuns,
  actionTaskTreeRuns,
  onReplayTaskTree,
  recommendedFlows,
  onRunActionFlow,
  onRunActionCatalog,
  onResumePlaybookRun,
  onOpenAcademy,
  postTradeReviewEnabled,
  onTogglePostTradeReview,
  postTradeReviewAgentId,
  onSetPostTradeReviewAgentId,
  onReviewLastClosedTrade,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearMemories,
  lossStreak,
  lossStreakUpdatedAtMs,
  shadowTradeStats,
  shadowCompare,
  lastTradeBlock,
  healthSnapshot,
  brokerRateLimitSuppressUntilMs
}) => {
  const [tokenInput, setTokenInput] = useState(config.telegram.botToken);
  const [chatIdInput, setChatIdInput] = useState(config.telegram.chatId);
  const [resumeOverrides, setResumeOverrides] = useState<Record<string, {
      symbol: string;
      timeframe: string;
      strategy: string;
      timeframes: string;
      dataJson: string;
  }>>({});
  const [resumeOverrideErrors, setResumeOverrideErrors] = useState<Record<string, string>>({});
  const [selectedTaskTreeRunId, setSelectedTaskTreeRunId] = useState('');
  const [selectedActionTaskTreeRunId, setSelectedActionTaskTreeRunId] = useState('');
  const [flowSymbolFilter, setFlowSymbolFilter] = useState('');
  const [flowTimeframeFilter, setFlowTimeframeFilter] = useState('');
  const [truthEvents, setTruthEvents] = useState<any[]>([]);
  const [truthEventsError, setTruthEventsError] = useState<string | null>(null);
  const [truthEventsUpdatedAtMs, setTruthEventsUpdatedAtMs] = useState<number | null>(null);
  const [truthEventFilter, setTruthEventFilter] = useState<'all' | 'trade' | 'broker' | 'playbook' | 'task' | 'setup' | 'chart' | 'agent'>(() => {
    try {
      const saved = localStorage.getItem('glass_truth_event_filter');
      if (saved === 'trade' || saved === 'broker' || saved === 'playbook' || saved === 'task' || saved === 'setup' || saved === 'chart' || saved === 'agent') return saved;
    } catch {
      // ignore
    }
    return 'all';
  });
  const [taskTruthRunId, setTaskTruthRunId] = useState<string>('');
  const [taskTruthEvents, setTaskTruthEvents] = useState<any[]>([]);
  const [taskTruthError, setTaskTruthError] = useState<string | null>(null);
  const [taskTruthUpdatedAtMs, setTaskTruthUpdatedAtMs] = useState<number | null>(null);
  const [opsStatus, setOpsStatus] = useState<string | null>(null);
  const [showTradeBlockDetails, setShowTradeBlockDetails] = useState(false);
  const [agentRunnerStatus, setAgentRunnerStatus] = useState<{
    activeSymbols: string[];
    activeSessions?: Array<{
      sessionId: string;
      agentId?: string | null;
      symbol?: string | null;
      startedAtMs?: number | null;
    }>;
    lastRunAtMs: number | null;
  } | null>(null);
  const [agentRunnerError, setAgentRunnerError] = useState<string | null>(null);
  const [agentRunnerUpdatedAtMs, setAgentRunnerUpdatedAtMs] = useState<number | null>(null);

  const [memoryManagerOpen, setMemoryManagerOpen] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'WIN' | 'LOSS' | 'rules'>('all');
  const [memoryDraft, setMemoryDraft] = useState<{ id?: string; type: Memory['type']; text: string; isRule?: boolean } | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewFlash, setReviewFlash] = useState<string | null>(null);

  useEffect(() => {
    const handleMemoryFilters = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setMemoryQuery('');
        setMemoryFilter('all');
        return;
      }
      if (detail.query != null) setMemoryQuery(String(detail.query));
      if (detail.filter != null) {
        const next = String(detail.filter).trim().toLowerCase();
        if (next === 'win' || next === 'loss' || next === 'rules' || next === 'all') {
          setMemoryFilter(next === 'win' ? 'WIN' : next === 'loss' ? 'LOSS' : next === 'rules' ? 'rules' : 'all');
        }
      }
      if (detail.open != null) setMemoryManagerOpen(!!detail.open);
    };

    const handleMemoryDraft = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setMemoryDraft(null);
        setMemoryError(null);
        if (detail.open != null) setMemoryManagerOpen(!!detail.open);
        return;
      }
      if (detail.open != null) setMemoryManagerOpen(!!detail.open);
      const payload = detail.draft && typeof detail.draft === 'object' ? detail.draft : detail;
      if (!payload || typeof payload !== 'object') return;
      const typeRaw = String(payload.type || '').trim().toUpperCase();
      const type = typeRaw === 'LOSS' ? 'LOSS' : 'WIN';
      const next = {
        id: payload.id != null ? String(payload.id) : undefined,
        type,
        text: payload.text != null ? String(payload.text) : '',
        isRule: payload.isRule === true
      };
      setMemoryDraft(next);
    };

    const handleFlowFilters = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setFlowSymbolFilter('');
        setFlowTimeframeFilter('');
        return;
      }
      if (detail.symbol != null) setFlowSymbolFilter(String(detail.symbol));
      if (detail.timeframe != null) setFlowTimeframeFilter(String(detail.timeframe));
    };

    const handleRunSelect = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setSelectedTaskTreeRunId('');
        setSelectedActionTaskTreeRunId('');
        return;
      }
      if (detail.runId != null) setSelectedTaskTreeRunId(String(detail.runId));
      if (detail.actionRunId != null) setSelectedActionTaskTreeRunId(String(detail.actionRunId));
    };

    const handleTruthRun = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setTaskTruthRunId('');
        return;
      }
      const runId = detail.runId ?? detail.id ?? detail.value ?? null;
      if (runId != null) setTaskTruthRunId(String(runId));
    };

    const handleTelegramInputs = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setTokenInput('');
        setChatIdInput('');
        return;
      }
      if (detail.botToken != null) setTokenInput(String(detail.botToken));
      if (detail.chatId != null) setChatIdInput(String(detail.chatId));
    };

    window.addEventListener('glass_autopilot_memory_filters', handleMemoryFilters as any);
    window.addEventListener('glass_autopilot_memory_draft', handleMemoryDraft as any);
    window.addEventListener('glass_autopilot_flow_filters', handleFlowFilters as any);
    window.addEventListener('glass_autopilot_run_select', handleRunSelect as any);
    window.addEventListener('glass_autopilot_truth_run', handleTruthRun as any);
    window.addEventListener('glass_autopilot_telegram_inputs', handleTelegramInputs as any);
    return () => {
      window.removeEventListener('glass_autopilot_memory_filters', handleMemoryFilters as any);
      window.removeEventListener('glass_autopilot_memory_draft', handleMemoryDraft as any);
      window.removeEventListener('glass_autopilot_flow_filters', handleFlowFilters as any);
      window.removeEventListener('glass_autopilot_run_select', handleRunSelect as any);
      window.removeEventListener('glass_autopilot_truth_run', handleTruthRun as any);
      window.removeEventListener('glass_autopilot_telegram_inputs', handleTelegramInputs as any);
    };
  }, []);

  useEffect(() => {
    if (!opsStatus) return;
    const id = window.setTimeout(() => setOpsStatus(null), 2600);
    return () => window.clearTimeout(id);
  }, [opsStatus]);

  const { mode, policy, policies, effective } = useMemo(() => resolveAutoPilotPolicy(config), [config]);
  const activeMode = mode;
  const activePolicy = policy || {};
  const activeRiskValue = Number.isFinite(Number(activePolicy.riskPerTrade))
    ? Number(activePolicy.riskPerTrade)
    : Number(config.riskPerTrade);
  const sizingRiskValue = Number.isFinite(Number(effective?.riskPerTrade))
    ? Number(effective.riskPerTrade)
    : Number(config.riskPerTrade);
  const allowlistCount = useMemo(() => {
    const raw = String(config.symbolAllowlistRaw || '').trim();
    if (!raw) return 0;
    const parts = raw
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    return new Set(parts).size;
  }, [config.symbolAllowlistRaw]);
  const orderRateValue = Number(config.maxOrdersPerMinute ?? 0);
  const decisionMode = (config.decisionMode || 'deterministic') as 'deterministic' | 'agent';
  const decisionAgentId = String(config.decisionAgentId || '').trim();
  const decisionReasoningEffort = (config.decisionReasoningEffort || 'medium') as 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  const decisionAgentOptions = (agents || []).filter((agent) => {
    if (agent?.type !== 'openai') return false;
    const caps = agent?.capabilities;
    if (caps && typeof caps.trade === 'boolean') return caps.trade;
    return String(agent?.profile || '').toLowerCase() !== 'tech';
  });
  const timeframeInput = (activePolicy.allowedTimeframes || []).join(', ');

  const updateModePolicy = (patch: Record<string, any>) => {
    const nextPolicies = { ...(policies || {}) } as Record<AutoPilotMode, Record<string, any>>;
    const current = nextPolicies[activeMode] || {};
    nextPolicies[activeMode] = { ...current, ...patch };
    onUpdateConfig({ ...config, modePolicies: nextPolicies });
  };

  const updateModeRisk = (value: string) => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return;
    if (activeMode === 'custom') {
      const nextPolicies = { ...(policies || {}) } as Record<AutoPilotMode, Record<string, any>>;
      const current = nextPolicies.custom || {};
      nextPolicies.custom = { ...current, riskPerTrade: num };
      onUpdateConfig({ ...config, riskPerTrade: num, modePolicies: nextPolicies });
      return;
    }
    updateModePolicy({ riskPerTrade: num });
  };

  const updateModeTimeframes = (value: string) => {
    const cleaned = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    updateModePolicy({ allowedTimeframes: cleaned });
  };

  const toggleStrategy = (strategy: SetupStrategy) => {
    const current = Array.isArray(activePolicy.allowedStrategies) ? activePolicy.allowedStrategies : [];
    const set = new Set(current);
    if (set.has(strategy)) set.delete(strategy);
    else set.add(strategy);
    updateModePolicy({ allowedStrategies: Array.from(set) });
  };

  const swingRiskWarning =
    activeMode === 'swing' &&
    Number.isFinite(activeRiskValue) &&
    activeRiskValue >= 0.5 &&
    Number(effective?.maxOpenPositions ?? config.maxOpenPositions) > 3;

  const canManageMemories = !!onAddMemory || !!onUpdateMemory || !!onDeleteMemory || !!onClearMemories;

  const handleDiagnosticsExport = useCallback(async (mode: 'download' | 'clipboard') => {
    if (!onRunActionCatalog) {
      setOpsStatus('Diagnostics export unavailable.');
      return;
    }
    setOpsStatus('Exporting diagnostics...');
    try {
      const res = await onRunActionCatalog({
        actionId: 'diagnostics.export',
        payload: {
          mode,
          detail: 'full'
        }
      });
      if (!res?.ok) {
        setOpsStatus(res?.error || 'Diagnostics export failed.');
        return;
      }
      setOpsStatus(mode === 'clipboard' ? 'Diagnostics copied.' : 'Diagnostics saved.');
    } catch (err: any) {
      setOpsStatus(err?.message ? String(err.message) : 'Diagnostics export failed.');
    }
  }, [onRunActionCatalog]);

  const refreshAgentRunnerStatus = useCallback(async () => {
    if (!onRunActionCatalog) {
      setAgentRunnerError('Agent runner status unavailable.');
      return;
    }
    setAgentRunnerError(null);
    try {
      const res = await onRunActionCatalog({ actionId: 'agent_runner.status' });
      if (!res?.ok) {
        setAgentRunnerError(res?.error || 'Agent runner status failed.');
        return;
      }
      const data = res.data && typeof res.data === 'object' ? res.data : {};
      setAgentRunnerStatus({
        activeSymbols: Array.isArray(data.activeSymbols) ? data.activeSymbols : [],
        activeSessions: Array.isArray(data.activeSessions) ? data.activeSessions : [],
        lastRunAtMs: data.lastRunAtMs ?? null
      });
      setAgentRunnerUpdatedAtMs(Date.now());
    } catch (err: any) {
      setAgentRunnerError(err?.message ? String(err.message) : 'Agent runner status failed.');
    }
  }, [onRunActionCatalog]);

  const handleAgentRunnerCancel = useCallback(async (sessionId: string) => {
    if (!onRunActionCatalog) {
      setAgentRunnerError('Agent runner cancel unavailable.');
      return;
    }
    if (!sessionId) return;
    setAgentRunnerError(null);
    try {
      const res = await onRunActionCatalog({ actionId: 'agent_runner.cancel', payload: { sessionId } });
      if (!res?.ok) {
        setAgentRunnerError(res?.error || 'Agent runner cancel failed.');
        return;
      }
      setOpsStatus('Agent runner canceled.');
      refreshAgentRunnerStatus();
    } catch (err: any) {
      setAgentRunnerError(err?.message ? String(err.message) : 'Agent runner cancel failed.');
    }
  }, [onRunActionCatalog, refreshAgentRunnerStatus]);

  const formatAge = (d: Date) => {
    const ms = Date.now() - d.getTime();
    if (!Number.isFinite(ms) || ms < 0) return '';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h`;
    const days = Math.floor(h / 24);
    return `${days}d`;
  };

  const formatCountdown = (ms: number | null) => {
    if (!Number.isFinite(Number(ms)) || ms == null) return '--';
    const value = Math.max(0, Math.floor(ms));
    if (value === 0) return '0s';
    const seconds = Math.ceil(value / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.ceil(hours / 24);
    return `${days}d`;
  };

  const lossStreakValue = Number.isFinite(Number(lossStreak)) ? Number(lossStreak) : null;
  const lossStreakAge = lossStreakUpdatedAtMs ? formatAge(new Date(lossStreakUpdatedAtMs)) : '';
  const lastTradeBlockAge = lastTradeBlock?.atMs ? formatAge(new Date(lastTradeBlock.atMs)) : '';
  const lastTradeBlockMeta = [
    lastTradeBlock?.symbol ? `Symbol ${lastTradeBlock.symbol}` : '',
    lastTradeBlock?.broker ? `Broker ${lastTradeBlock.broker}` : '',
    lastTradeBlock?.code ? `Code ${lastTradeBlock.code}` : '',
    lastTradeBlock?.block ? `Block ${lastTradeBlock.block}` : ''
  ].filter(Boolean).join(' | ');
  const tradeBlockDetails = useMemo(() => {
    if (!lastTradeBlock) return null;
    return {
      at: new Date(lastTradeBlock.atMs).toISOString(),
      symbol: lastTradeBlock.symbol || null,
      broker: lastTradeBlock.broker || null,
      reason: lastTradeBlock.reason || null,
      code: lastTradeBlock.code || null,
      block: lastTradeBlock.block || null,
      source: lastTradeBlock.source || null,
      executionMode: lastTradeBlock.executionMode || null,
      autoPilotState: lastTradeBlock.autoPilotState || null,
      autoPilotReason: lastTradeBlock.autoPilotReason || null,
      agentId: lastTradeBlock.agentId || null,
      messageId: lastTradeBlock.messageId || null,
      decisionId: lastTradeBlock.decisionId || null,
      correlationId: lastTradeBlock.correlationId || null,
      details: lastTradeBlock.details || null
    };
  }, [lastTradeBlock]);
  const tradeBlockDetailText = useMemo(() => {
    if (!tradeBlockDetails) return '';
    try {
      return JSON.stringify(tradeBlockDetails, null, 2);
    } catch {
      return '';
    }
  }, [tradeBlockDetails]);
  const tradeBlockDetailPreview =
    tradeBlockDetailText.length > 2000 ? `${tradeBlockDetailText.slice(0, 1997)}...` : tradeBlockDetailText;
  const shadowStats = shadowTradeStats || null;
  const shadowWinRate = shadowStats?.winRate != null ? `${(shadowStats.winRate * 100).toFixed(1)}%` : '--';
  const shadowAvgR = shadowStats?.avgR != null ? shadowStats.avgR.toFixed(2) : '--';
  const shadowNetR = shadowStats?.netR != null ? shadowStats.netR.toFixed(2) : '--';
  const shadowCompareValue = shadowCompare ?? null;
  const shadowCompareMatchRate =
    shadowCompareValue?.outcomeMatchRate != null ? `${(shadowCompareValue.outcomeMatchRate * 100).toFixed(1)}%` : '--';
  const shadowCompareShadowWR =
    shadowCompareValue?.shadowWinRate != null ? `${(shadowCompareValue.shadowWinRate * 100).toFixed(1)}%` : '--';
  const shadowCompareActualWR =
    shadowCompareValue?.actualWinRate != null ? `${(shadowCompareValue.actualWinRate * 100).toFixed(1)}%` : '--';
  const shadowCompareShadowNetR =
    shadowCompareValue && Number.isFinite(Number(shadowCompareValue.shadowNetR)) ? shadowCompareValue.shadowNetR.toFixed(2) : '--';
  const shadowCompareActualNetR =
    shadowCompareValue && Number.isFinite(Number(shadowCompareValue.actualNetR)) ? shadowCompareValue.actualNetR.toFixed(2) : '--';
  const shadowCompareDeltaR =
    shadowCompareValue?.avgDeltaR != null ? shadowCompareValue.avgDeltaR.toFixed(2) : '--';
  const health = healthSnapshot || null;
  const brokerStatus = health?.brokerStatus || '--';
  const brokerSnapshotAge = health?.brokerSnapshotUpdatedAtMs ? formatAge(new Date(health.brokerSnapshotUpdatedAtMs)) : '--';
  const quotesAge = health?.brokerQuotesUpdatedAtMs ? formatAge(new Date(health.brokerQuotesUpdatedAtMs)) : '--';
  const streamStatus = health?.brokerStreamStatus || '--';
  const streamAge = health?.brokerStreamUpdatedAtMs ? formatAge(new Date(health.brokerStreamUpdatedAtMs)) : '--';
  const streamError = health?.brokerStreamError ? String(health.brokerStreamError) : '';
  const autoState = health?.autoPilotState || (config.enabled ? 'RUNNING' : 'DISABLED');
  const autoReason = health?.autoPilotReasonMessage || health?.autoPilotReason || '';
  const watcherCount = Number.isFinite(Number(health?.setupWatcherCount)) ? Number(health?.setupWatcherCount) : null;
  const watcherEnabledCount = Number.isFinite(Number(health?.setupWatcherEnabledCount))
    ? Number(health?.setupWatcherEnabledCount)
    : null;
  const signalCount = Number.isFinite(Number(health?.setupSignalCount)) ? Number(health?.setupSignalCount) : null;
  const rateLimitRemainingMs =
    brokerRateLimitSuppressUntilMs && brokerRateLimitSuppressUntilMs > Date.now()
      ? brokerRateLimitSuppressUntilMs - Date.now()
      : 0;
  const rateLimitRemaining = rateLimitRemainingMs > 0 ? formatCountdown(rateLimitRemainingMs) : 'off';
  const agentRunnerSymbols = Array.isArray(agentRunnerStatus?.activeSymbols)
    ? agentRunnerStatus.activeSymbols.filter(Boolean)
    : [];
  const agentRunnerSessions = Array.isArray(agentRunnerStatus?.activeSessions)
    ? agentRunnerStatus.activeSessions
    : [];
  const agentRunnerActiveCount = agentRunnerSessions.length || agentRunnerSymbols.length;
  const agentRunnerLastRunAge = agentRunnerStatus?.lastRunAtMs ? formatAge(new Date(agentRunnerStatus.lastRunAtMs)) : '--';
  const agentRunnerUpdatedAge = agentRunnerUpdatedAtMs ? formatAge(new Date(agentRunnerUpdatedAtMs)) : '';
  const agentRunnerSymbolPreview = agentRunnerSymbols.slice(0, 3).join(', ');
  const agentRunnerSymbolOverflow = agentRunnerSymbols.length > 3;

  useEffect(() => {
    setShowTradeBlockDetails(false);
  }, [lastTradeBlock?.atMs]);

  const handleCopyTradeBlockDetails = useCallback(async () => {
    if (!tradeBlockDetailText) {
      setOpsStatus('No trade block details.');
      return;
    }
    try {
      const fn = window.glass?.clipboard?.writeText;
      if (fn) {
        const res = fn(tradeBlockDetailText);
        if (res && typeof (res as any).then === 'function') await res;
        setOpsStatus('Trade block copied.');
        return;
      }
    } catch {
      // ignore clipboard errors
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(tradeBlockDetailText);
        setOpsStatus('Trade block copied.');
        return;
      }
    } catch {
      // ignore
    }
    setOpsStatus('Copy failed.');
  }, [tradeBlockDetailText]);
  const shadowRegimeRows = useMemo(() => {
    if (!shadowStats?.byRegime) return [];
    return Object.entries(shadowStats.byRegime)
      .map(([key, value]) => ({
        key,
        trades: Number(value?.trades) || 0,
        winRate: value?.winRate != null ? value.winRate : null,
        netR: value?.netR != null ? value.netR : null
      }))
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 3);
  }, [shadowStats]);

  const filteredMemories = useMemo(() => {
    const q = memoryQuery.trim().toLowerCase();
    const list = Array.isArray(memories) ? memories : [];
    return list.filter((m) => {
      if (!m) return false;
      if (memoryFilter === 'rules') {
        if (!isRuleMemory(m)) return false;
      } else if (memoryFilter !== 'all' && m.type !== memoryFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${m.text} ${(m.meta?.symbol || '')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [memories, memoryFilter, memoryQuery]);

  const previewMemories = useMemo(() => {
    const list = Array.isArray(memories) ? memories : [];
    const rules = list.filter(isRuleMemory);
    const rest = list.filter((m) => !isRuleMemory(m));
    return [...rules, ...rest].slice(0, 6);
  }, [memories]);

  const toggleEnabled = () => {
    onUpdateConfig({ ...config, enabled: !config.enabled });
  };

  const toggleConfirmation = () => {
    onUpdateConfig({ ...config, requireConfirmation: !config.requireConfirmation });
  };

  const toggleKillSwitch = () => {
    onUpdateConfig({ ...config, killSwitch: !config.killSwitch });
  };

  const handleNumberChange = (key: keyof AutoPilotConfig, value: string) => {
      const num = parseFloat(value);
      if (!isNaN(num)) {
          onUpdateConfig({ ...config, [key]: num });
      }
  };

  const handleTextChange = (key: keyof AutoPilotConfig, value: string) => {
    onUpdateConfig({ ...config, [key]: value });
  };

  const handleConnectTelegram = () => {
      // Simulate validation and connection
      if (tokenInput.length > 5 && chatIdInput.length > 5) {
          onUpdateConfig({
              ...config,
              telegram: {
                  botToken: tokenInput,
                  chatId: chatIdInput,
                  connected: !config.telegram.connected
              }
          });
      }
  };

  const runActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      if (onRunActionCatalog) {
        void onRunActionCatalog({ actionId, payload });
        return;
      }
      fallback?.();
    },
    [onRunActionCatalog]
  );

  const openMemoryManager = () => {
    runActionOr(
      'autopilot.memory.draft.set',
      { clear: true, open: true },
      () => {
        setMemoryError(null);
        setMemoryDraft(null);
        setMemoryManagerOpen(true);
      }
    );
  };

  const openAddMemory = () => {
    runActionOr(
      'autopilot.memory.draft.set',
      { type: 'WIN', text: '', isRule: false, open: true },
      () => {
        setMemoryError(null);
        setMemoryDraft({ type: 'WIN', text: '', isRule: false });
        setMemoryManagerOpen(true);
      }
    );
  };

  const openEditMemory = (m: Memory) => {
    runActionOr(
      'autopilot.memory.draft.set',
      { id: m.id, type: m.type, text: m.text, isRule: isRuleMemory(m), open: true },
      () => {
        setMemoryError(null);
        setMemoryDraft({ id: m.id, type: m.type, text: m.text, isRule: isRuleMemory(m) });
        setMemoryManagerOpen(true);
      }
    );
  };

  const toggleRuleFlag = async (m: Memory) => {
    if (memoryBusy) return;
    if (!onUpdateMemory) {
      setMemoryError('Rule editing not available in this build.');
      return;
    }

    const current = isRuleMemory(m);
    const baseMeta = m?.meta && typeof m.meta === 'object' ? { ...(m.meta as any) } : {};
    if (current) {
      delete (baseMeta as any).isRule;
      delete (baseMeta as any).rule;
      delete (baseMeta as any).pinned;
      delete (baseMeta as any).hardRule;
    } else {
      (baseMeta as any).isRule = true;
    }

    setMemoryBusy(true);
    setMemoryError(null);
    try {
      await onUpdateMemory(m.id, { meta: baseMeta });
      if (memoryDraft?.id === m.id) {
        setMemoryDraft((d) => (d ? { ...d, isRule: !current } : d));
      }
    } catch (e: any) {
      setMemoryError(e?.message ? String(e.message) : 'Failed to update rule.');
    } finally {
      setMemoryBusy(false);
    }
  };

  const saveMemoryDraft = async () => {
    if (!memoryDraft) return;
    if (memoryBusy) return;
    const text = String(memoryDraft.text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      setMemoryError('Memory text is required.');
      return;
    }

    setMemoryBusy(true);
    setMemoryError(null);
    try {
      if (memoryDraft.id) {
        if (!onUpdateMemory) throw new Error('Memory editing not available in this build.');
        const existing = (Array.isArray(memories) ? memories : []).find((m) => m.id === memoryDraft.id);
        const baseMeta = existing?.meta && typeof existing.meta === 'object' ? { ...(existing.meta as any) } : {};
        if (memoryDraft.isRule) (baseMeta as any).isRule = true;
        else delete (baseMeta as any).isRule;
        await onUpdateMemory(memoryDraft.id, { type: memoryDraft.type, text, meta: baseMeta });
      } else {
        if (!onAddMemory) throw new Error('Memory adding not available in this build.');
        const meta = memoryDraft.isRule ? { isRule: true } : undefined;
        await onAddMemory({ type: memoryDraft.type, text, meta });
      }
      setMemoryDraft(null);
    } catch (e: any) {
      setMemoryError(e?.message ? String(e.message) : 'Failed to save memory.');
    } finally {
      setMemoryBusy(false);
    }
  };

  const deleteMemoryById = async (id: string) => {
    const key = String(id || '').trim();
    if (!key) return;
    if (memoryBusy) return;
    if (!onDeleteMemory) {
      setMemoryError('Memory deletion not available in this build.');
      return;
    }
    const ok = window.confirm('Delete this memory? Agents will no longer learn from it.');
    if (!ok) return;

    setMemoryBusy(true);
    setMemoryError(null);
    try {
      await onDeleteMemory(key);
      if (memoryDraft?.id === key) setMemoryDraft(null);
    } catch (e: any) {
      setMemoryError(e?.message ? String(e.message) : 'Failed to delete memory.');
    } finally {
      setMemoryBusy(false);
    }
  };

  const clearAllMemories = async () => {
    if (memoryBusy) return;
    if (!onClearMemories) {
      setMemoryError('Clear memories not available in this build.');
      return;
    }
    const ok = window.confirm('Clear ALL memories? This cannot be undone.');
    if (!ok) return;

    setMemoryBusy(true);
    setMemoryError(null);
    try {
      await onClearMemories();
      setMemoryDraft(null);
    } catch (e: any) {
      setMemoryError(e?.message ? String(e.message) : 'Failed to clear memories.');
    } finally {
      setMemoryBusy(false);
    }
  };

  const runReviewLastTrade = async () => {
    if (!onReviewLastClosedTrade) return;
    if (reviewBusy) return;
    setReviewBusy(true);
    setReviewFlash(null);
    setMemoryError(null);
    try {
      const res = await onReviewLastClosedTrade();
      if (res?.ok && res?.replayed) {
        setReviewFlash('Replayed last post-trade review to chat.');
      } else if (res?.ok && res?.queued) {
        setReviewFlash('Queued a new post-trade review.');
      } else if (res?.ok) {
        setReviewFlash('Review requested.');
      } else {
        setReviewFlash(res?.error ? String(res.error) : 'Failed to review last trade.');
      }
    } catch (e: any) {
      setReviewFlash(e?.message ? String(e.message) : 'Failed to review last trade.');
    } finally {
      setReviewBusy(false);
      window.setTimeout(() => setReviewFlash(null), 6000);
    }
  };

  const timelineRun = activePlaybookRun || (Array.isArray(recentPlaybookRuns) ? recentPlaybookRuns[0] : null);
  const timelineSteps = Array.isArray(timelineRun?.steps) ? timelineRun?.steps || [] : [];
  const sortTaskTreeRuns = (runs: TaskTreeRunEntry[]) => {
    return [...runs].sort((a, b) => (Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)));
  };
  const taskTreeRunList = Array.isArray(taskTreeRuns) ? sortTaskTreeRuns(taskTreeRuns).slice(0, 3) : [];
  const actionTaskTreeRunList = Array.isArray(actionTaskTreeRuns) ? sortTaskTreeRuns(actionTaskTreeRuns).slice(0, 3) : [];
  const taskTreeResumeList = Array.isArray(taskTreeResumeEntries) ? taskTreeResumeEntries : [];
  const normalizeFlowSymbol = (value?: string | null) => String(value || '').trim().toUpperCase();
  const normalizeFlowTimeframe = (value?: string | null) => String(value || '').trim().toLowerCase();
  const normalizedFlowSymbolFilter = normalizeFlowSymbol(flowSymbolFilter);
  const normalizedFlowTimeframeFilter = normalizeFlowTimeframe(flowTimeframeFilter);
  const recommendedFlowList = Array.isArray(recommendedFlows)
    ? recommendedFlows
        .filter((flow) => {
          if (normalizedFlowSymbolFilter) {
            if (!flow.symbol) return false;
            if (normalizeFlowSymbol(flow.symbol) !== normalizedFlowSymbolFilter) return false;
          }
          if (normalizedFlowTimeframeFilter) {
            if (!flow.timeframe) return false;
            if (normalizeFlowTimeframe(flow.timeframe) !== normalizedFlowTimeframeFilter) return false;
          }
          return true;
        })
        .slice(0, 3)
    : [];
  const selectedTaskTreeRun =
    taskTreeRunList.find((run) => run.runId === selectedTaskTreeRunId) || taskTreeRunList[0] || null;
  const selectedActionTaskTreeRun =
    actionTaskTreeRunList.find((run) => run.runId === selectedActionTaskTreeRunId) || actionTaskTreeRunList[0] || null;
  const blockedStep = timelineSteps.slice().reverse().find((step) => step.status === 'blocked') || null;
  const blockedNote = blockedStep?.note ? String(blockedStep.note) : '';
  const blockedNoteLower = blockedNote.toLowerCase();
  const blockedIsConfirm = blockedNoteLower === 'confirmation_required';
  const blockedIsMissing = blockedNoteLower.includes('missing');
  const blockedHeader = blockedIsConfirm
    ? 'Awaiting confirmation'
    : blockedIsMissing
      ? 'Awaiting input'
      : 'Awaiting coordination';
  const blockedPrimaryAction: 'resume' | 'approve' = blockedIsConfirm ? 'approve' : 'resume';
  const blockedPrimaryLabel = blockedIsConfirm ? 'Approve' : 'Resume';
  const blockedRequirement = blockedIsMissing
      ? (blockedNoteLower.includes('missing_symbol')
          ? 'symbol'
          : blockedNoteLower.includes('missing_timeframe')
              ? 'timeframe'
              : (blockedNoteLower.includes('missing_params') || blockedNoteLower.includes('missing_levels'))
                  ? 'params'
                  : null)
      : null;
  const getResumeDraft = (runId: string) => {
      return resumeOverrides[runId] || { symbol: '', timeframe: '', strategy: '', timeframes: '', dataJson: '' };
  };
  const updateResumeDraft = (runId: string, patch: Partial<{ symbol: string; timeframe: string; strategy: string; timeframes: string; dataJson: string }>) => {
      setResumeOverrides((prev) => ({
          ...prev,
          [runId]: { ...getResumeDraft(runId), ...patch }
      }));
      setResumeOverrideErrors((prev) => {
          if (!prev[runId]) return prev;
          const next = { ...prev };
          delete next[runId];
          return next;
      });
  };
  const buildResumeOverrides = (runId: string) => {
      const draft = getResumeDraft(runId);
      const symbol = String(draft.symbol || '').trim();
      const timeframe = String(draft.timeframe || '').trim();
      const strategy = String(draft.strategy || '').trim();
      const timeframes = String(draft.timeframes || '').trim();
      let parsedTimeframes: string[] | undefined;
      if (timeframes) {
          parsedTimeframes = timeframes
              .split(/[,\s]+/)
              .map((entry) => entry.trim())
              .filter(Boolean);
          if (parsedTimeframes.length === 0) parsedTimeframes = undefined;
      }
      let data: Record<string, any> | undefined;
      const rawJson = String(draft.dataJson || '').trim();
      if (rawJson) {
          try {
              const parsed = JSON.parse(rawJson);
              if (parsed && typeof parsed === 'object') data = parsed as Record<string, any>;
          } catch {
              return { overrides: null, error: 'Invalid JSON overrides.' };
          }
      }
      const overrides = {
          symbol: symbol || undefined,
          timeframe: timeframe || undefined,
          strategy: strategy || undefined,
          timeframes: parsedTimeframes,
          data
      };
      return { overrides };
  };
  const resolveRunDefaults = (run: typeof timelineRun) => {
      if (!run) return { symbol: '', timeframe: '', strategy: '', timeframes: '' };
      const context = run.context && typeof run.context === 'object' ? run.context : null;
      const ctxData = context && typeof (context as any).data === 'object' ? (context as any).data : null;
      const ctxSource = context && typeof (context as any).source === 'object' ? (context as any).source : null;
      const ctxTimeframes = Array.isArray(ctxData?.timeframes) ? ctxData?.timeframes : Array.isArray(ctxSource?.timeframes) ? ctxSource?.timeframes : null;
      const timeframes = ctxTimeframes && ctxTimeframes.length > 0
          ? ctxTimeframes.map((entry: any) => String(entry)).join(',')
          : '';
      return {
          symbol: String(run.symbol || ''),
          timeframe: String(run.timeframe || ''),
          strategy: String(run.strategy || ''),
          timeframes
      };
  };
  const formatRunTime = (value?: number | null) => {
    if (!value || value <= 0) return '--';
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--';
    }
  };
  const statusBadge = (status?: string | null) => {
    const raw = String(status || '').toLowerCase();
    if (raw === 'completed') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
    if (raw === 'failed') return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (raw === 'blocked') return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    if (raw === 'running') return 'bg-sky-500/20 text-sky-200 border-sky-500/30';
    if (raw === 'skipped') return 'bg-white/10 text-gray-300 border-white/10';
    return 'bg-white/5 text-gray-400 border-white/10';
  };
  const truthLevelBadge = (level?: string | null) => {
    const raw = String(level || '').toLowerCase();
    if (raw === 'error') return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (raw === 'warn' || raw === 'warning') return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    return 'bg-white/10 text-gray-300 border-white/10';
  };
  const loadTruthEvents = useCallback(async (run: typeof timelineRun | null) => {
    const ledger = window.glass?.tradeLedger;
    if (!ledger?.listEvents) {
      setTruthEvents([]);
      return;
    }
    if (!run) {
      setTruthEvents([]);
      return;
    }
    const args: any = { limit: 40, kind: 'truth_event' };
    if (run.runId) args.runId = String(run.runId);
    else if (run.symbol) args.symbol = String(run.symbol);
    try {
      const res = await ledger.listEvents(args);
      if (!res?.ok || !Array.isArray(res.entries)) {
        setTruthEventsError(res?.error ? String(res.error) : 'Unable to load truth events.');
        return;
      }
      setTruthEvents(res.entries);
      setTruthEventsUpdatedAtMs(Date.now());
      setTruthEventsError(null);
    } catch (err: any) {
      setTruthEventsError(err?.message ? String(err.message) : 'Unable to load truth events.');
    }
  }, []);

  useEffect(() => {
    void loadTruthEvents(timelineRun);
  }, [timelineRun?.runId, timelineRun?.status, timelineRun?.symbol, loadTruthEvents]);

  const loadTaskTruthEvents = useCallback(async (run: TaskTreeRunEntry | null) => {
    const ledger = window.glass?.tradeLedger;
    if (!ledger?.listEvents) {
      setTaskTruthEvents([]);
      return;
    }
    if (!run?.runId) {
      setTaskTruthEvents([]);
      setTaskTruthRunId('');
      return;
    }
    try {
      const res = await ledger.listEvents({ limit: 60, kind: 'truth_event', runId: String(run.runId) });
      if (!res?.ok || !Array.isArray(res.entries)) {
        setTaskTruthError(res?.error ? String(res.error) : 'Unable to load truth events.');
        return;
      }
      setTaskTruthRunId(String(run.runId));
      setTaskTruthEvents(res.entries);
      setTaskTruthUpdatedAtMs(Date.now());
      setTaskTruthError(null);
    } catch (err: any) {
      setTaskTruthError(err?.message ? String(err.message) : 'Unable to load truth events.');
    }
  }, []);

  const truthFilterPrefix =
      truthEventFilter === 'trade'
          ? 'trade_'
          : truthEventFilter === 'broker'
              ? 'broker_'
              : truthEventFilter === 'playbook'
                  ? 'playbook_'
                  : truthEventFilter === 'task'
                      ? 'task_tree_'
                      : truthEventFilter === 'setup'
                          ? 'setup_'
                          : truthEventFilter === 'chart'
                              ? 'chart_'
                              : truthEventFilter === 'agent'
                                  ? 'agent_'
                                  : '';
  const filteredTruthEvents = truthFilterPrefix
      ? truthEvents.filter((event) => String(event?.eventType || '').startsWith(truthFilterPrefix))
      : truthEvents;
  const filteredTaskTruthEvents = truthFilterPrefix
      ? taskTruthEvents.filter((event) => String(event?.eventType || '').startsWith(truthFilterPrefix))
      : taskTruthEvents;
  const buildReplaySummary = (run: TaskTreeRunEntry): TaskTreeRunSummary | null => {
    if (!run || !run.runId) return null;
    const createdAtMs = Number(run.createdAtMs) || Date.now();
    const finishedAtMs = Number(run.finishedAtMs) || createdAtMs;
    const steps = (Array.isArray(run.steps) ? run.steps : []).map((step) => ({
      step: String(step.step || ''),
      status: (step.status ? String(step.status) : 'completed') as TaskTreeRunSummary['status'],
      startedAtMs: Number(step.startedAtMs) || createdAtMs,
      finishedAtMs: Number(step.finishedAtMs) || Number(step.startedAtMs) || createdAtMs,
      attempts: Number.isFinite(Number(step.attempts)) ? Number(step.attempts) : undefined,
      retryCount: Number.isFinite(Number(step.retryCount)) ? Number(step.retryCount) : undefined,
      error: step.error || undefined,
      note: step.note || undefined
    }));
    const context = run.context || {};
    return {
      runId: String(run.runId),
      status: (run.status ? String(run.status) : 'completed') as TaskTreeRunSummary['status'],
      createdAtMs,
      finishedAtMs,
      steps,
      context: {
        source: context.source ? String(context.source) : 'timeline',
        symbol: context.symbol ? String(context.symbol) : undefined,
        timeframe: context.timeframe ? String(context.timeframe) : undefined,
        strategy: context.strategy ? String(context.strategy) : undefined,
        watcherId: context.watcherId ? String(context.watcherId) : undefined,
        mode: context.mode ? String(context.mode) : undefined
      }
    };
  };
  const renderTaskTreeRun = (run: TaskTreeRunEntry, label: string) => {
    const steps = Array.isArray(run.steps) ? run.steps : [];
    const context = run.context || {};
    const metaLine = [
      context.source ? `Source ${context.source}` : '',
      context.symbol ? context.symbol : '',
      context.timeframe ? context.timeframe : '',
      context.strategy ? context.strategy : '',
      context.mode ? `Mode ${context.mode}` : ''
    ].filter(Boolean).join(' | ');
    const replaySummary = onReplayTaskTree ? buildReplaySummary(run) : null;
    const handleReplayTruth = async () => {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listEvents) return;
      const res = await ledger.listEvents({ limit: 60, kind: 'truth_event', runId: run.runId });
      if (!res?.ok || !Array.isArray(res.entries)) return;
      const payload = {
        runId: run.runId,
        symbol: context.symbol || null,
        timeframe: context.timeframe || null,
        strategy: context.strategy || null,
        createdAtMs: run.createdAtMs || null,
        events: res.entries
      };
      const filename = `truth_replay_${run.runId}.json`;
      try {
        const data = JSON.stringify(payload, null, 2);
        const saver = window.glass?.saveUserFile;
        if (typeof saver === 'function') {
          const saved = await saver({ data, mimeType: 'application/json', subdir: 'replays', prefix: filename });
          if (saved?.ok) return;
        }
      } catch {
        // ignore save failures
      }
    };
    const handleLoadTruth = () => {
      void loadTaskTruthEvents(run);
    };
    return (
      <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
          <div className="flex items-center gap-2">
            {onReplayTaskTree && replaySummary && (
              <button
                type="button"
                onClick={() => onReplayTaskTree(replaySummary)}
                className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
              >
                Replay
              </button>
            )}
            <button
              type="button"
              onClick={handleLoadTruth}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Truth
            </button>
            <button
              type="button"
              onClick={handleReplayTruth}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Export
            </button>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusBadge(run.status)}`}>
              {String(run.status || 'unknown').toUpperCase()}
            </span>
          </div>
        </div>
        {metaLine && <div className="text-[10px] text-gray-500">{metaLine}</div>}
        <div className="text-[10px] text-gray-500">
          Started {formatRunTime(run.createdAtMs)}
          {run.finishedAtMs ? ` | Finished ${formatRunTime(run.finishedAtMs)}` : ''}
        </div>
        {steps.length > 0 ? (
          <div className="mt-2 space-y-1">
            {steps.map((step, idx) => (
              <div key={`${run.runId}-${step.step}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${statusBadge(step.status)}`}>
                  {String(step.status || '').toUpperCase()}
                </div>
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
  const renderRecommendedFlow = (flow: ActionFlowRecommendation) => {
    const label = flow.intentLabel || flow.intentKey || 'intent';
    const sequence = Array.isArray(flow.sequence) ? flow.sequence.join(' > ') : '';
    const success = Number.isFinite(Number(flow.successRate)) ? `${Math.round(flow.successRate * 100)}%` : '--';
    const metaLine = [flow.symbol, flow.timeframe].filter(Boolean).join(' | ');
    const runSymbol = flowSymbolFilter.trim() || flow.symbol || '';
    const runTimeframe = flowTimeframeFilter.trim() || flow.timeframe || '';
    return (
      <div key={`${flow.intentKey}-${sequence}`} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
          {onRunActionFlow && (
            <button
              type="button"
              onClick={() => onRunActionFlow(flow, {
                symbol: runSymbol ? runSymbol : null,
                timeframe: runTimeframe ? runTimeframe : null
              })}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Run
            </button>
          )}
        </div>
        {metaLine && <div className="text-[10px] text-gray-500">{metaLine}</div>}
        <div className="text-[11px] text-gray-200">{sequence || 'No sequence recorded.'}</div>
        <div className="text-[10px] text-gray-500">Count {flow.count} | Success {success}</div>
      </div>
    );
  };

  useEffect(() => {
    if (taskTreeRunList.length === 0) {
      if (selectedTaskTreeRunId) setSelectedTaskTreeRunId('');
      return;
    }
    if (!selectedTaskTreeRunId || !taskTreeRunList.some((run) => run.runId === selectedTaskTreeRunId)) {
      setSelectedTaskTreeRunId(taskTreeRunList[0].runId);
    }
  }, [selectedTaskTreeRunId, taskTreeRunList]);

  useEffect(() => {
    if (actionTaskTreeRunList.length === 0) {
      if (selectedActionTaskTreeRunId) setSelectedActionTaskTreeRunId('');
      return;
    }
    if (!selectedActionTaskTreeRunId || !actionTaskTreeRunList.some((run) => run.runId === selectedActionTaskTreeRunId)) {
      setSelectedActionTaskTreeRunId(actionTaskTreeRunList[0].runId);
    }
  }, [selectedActionTaskTreeRunId, actionTaskTreeRunList]);
  const activeStepConfig = timelineRun && typeof timelineRun.context === 'object'
    ? ((timelineRun.context as any).data?.activeStepConfig || (timelineRun.context as any).source?.activeStepConfig || null)
    : null;
  const activeStepMeta = timelineRun?.currentStepId
    ? timelineSteps.find((step) => step.id === timelineRun.currentStepId) || null
    : null;
  const activeStepLabel = activeStepMeta?.label || activeStepMeta?.actionId || timelineRun?.currentStepId || null;
  const retryDelayMs = Number(activeStepConfig?.retryDelayMs);
  const retryDelayLabel = Number.isFinite(retryDelayMs) && retryDelayMs > 0
    ? (retryDelayMs >= 1000
        ? `${(retryDelayMs / 1000).toFixed(retryDelayMs % 1000 === 0 ? 0 : 1)}s`
        : `${Math.round(retryDelayMs)}ms`)
    : '1.2s';
  const maxRetriesRaw = Number(activeStepConfig?.maxRetries);
  const maxRetries = Number.isFinite(maxRetriesRaw) ? Math.max(0, Math.floor(maxRetriesRaw)) : 0;
  const retryPolicyLine = activeStepLabel
    ? `Retry policy: rate_limit/timeout/network | active step ${activeStepLabel}: maxRetries ${maxRetries}, delay ${retryDelayLabel}`
    : 'Retry policy: rate_limit/timeout/network | per-step maxRetries (default 0), delay 1.2s when enabled';

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#0a0a0a]">

        {memoryManagerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="w-full max-w-2xl bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/30">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-purple-300">
                            <Brain size={14} />
                            <span>Trade Memory</span>
                            <span className="text-[10px] text-gray-500 font-mono">({memories.length})</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => runActionOr('autopilot.memory.draft.set', { clear: true, open: false }, () => {
                              setMemoryManagerOpen(false);
                              setMemoryDraft(null);
                              setMemoryError(null);
                            })}
                            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                                <input
                                    type="text"
                                    value={memoryQuery}
                                    onChange={(e) => runActionOr('autopilot.memory.filters.set', { query: e.target.value }, () => setMemoryQuery(e.target.value))}
                                    className="w-full bg-[#151515] border border-white/10 rounded-lg py-2 pl-9 pr-3 text-xs font-mono text-white focus:outline-none focus:border-purple-500/40 transition-colors"
                                    placeholder="Search memories (text or symbol)…"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => runActionOr('autopilot.memory.filters.set', { clear: true }, () => {
                                  setMemoryQuery('');
                                  setMemoryFilter('all');
                                })}
                                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-200 transition-colors"
                                title="Reset filters"
                            >
                                <RefreshCcw size={14} />
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => runActionOr('autopilot.memory.filters.set', { filter: 'all' }, () => setMemoryFilter('all'))}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${
                                    memoryFilter === 'all' ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => runActionOr('autopilot.memory.filters.set', { filter: 'win' }, () => setMemoryFilter('WIN'))}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${
                                    memoryFilter === 'WIN' ? 'bg-green-500/10 border-green-500/30 text-green-200' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                Wins
                            </button>
                            <button
                                type="button"
                                onClick={() => runActionOr('autopilot.memory.filters.set', { filter: 'loss' }, () => setMemoryFilter('LOSS'))}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${
                                    memoryFilter === 'LOSS' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                Losses
                            </button>
                            <button
                                type="button"
                                onClick={() => runActionOr('autopilot.memory.filters.set', { filter: 'rules' }, () => setMemoryFilter('rules'))}
                                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors flex items-center gap-1.5 ${
                                    memoryFilter === 'rules' ? 'bg-purple-500/10 border-purple-500/30 text-purple-200' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                                title="Non‑negotiable rules injected into agent prompts"
                            >
                                <Bookmark size={12} />
                                Rules
                            </button>

                            <div className="flex-1" />

                            <button
                                type="button"
                                onClick={() => runActionOr('autopilot.memory.draft.set', { type: 'WIN', text: '', isRule: false, open: true }, () => {
                                  setMemoryDraft({ type: 'WIN', text: '', isRule: false });
                                })}
                                disabled={!onAddMemory || memoryBusy}
                                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold text-white transition-colors flex items-center gap-1.5"
                            >
                                <Plus size={14} />
                                Add
                            </button>
                            <button
                                type="button"
                                onClick={clearAllMemories}
                                disabled={!onClearMemories || memoryBusy}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-300 border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold text-gray-200 transition-colors flex items-center gap-1.5"
                                title="Clear all memories"
                            >
                                <Trash2 size={14} />
                                Clear
                            </button>
                        </div>

                        {(typeof postTradeReviewEnabled === 'boolean' || onTogglePostTradeReview || onReviewLastClosedTrade) && (
                            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                                        Post-Trade Review
                                    </div>
                                    {typeof postTradeReviewEnabled === 'boolean' && onTogglePostTradeReview && (
                                        <button
                                            type="button"
                                            onClick={() => onTogglePostTradeReview(!postTradeReviewEnabled)}
                                            className={`px-2 py-1 rounded border text-[10px] font-semibold transition-colors ${
                                                postTradeReviewEnabled
                                                    ? 'bg-green-500/10 border-green-500/30 text-green-200 hover:bg-green-500/15'
                                                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                            }`}
                                            title={postTradeReviewEnabled ? 'Auto post-trade reviews ON' : 'Auto post-trade reviews OFF'}
                                        >
                                            {postTradeReviewEnabled ? 'AUTO ON' : 'AUTO OFF'}
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {agents.length > 0 && onSetPostTradeReviewAgentId && (
                                        <select
                                            value={postTradeReviewAgentId || ''}
                                            onChange={(e) => onSetPostTradeReviewAgentId(e.target.value)}
                                            className="flex-1 min-w-[180px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/40 transition-colors font-mono"
                                            title="Reviewer agent"
                                        >
                                            <option value="">Auto</option>
                                            {agents.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {onReviewLastClosedTrade && (
                                        <button
                                            type="button"
                                            onClick={runReviewLastTrade}
                                            disabled={reviewBusy}
                                            className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold text-white transition-colors"
                                        >
                                            {reviewBusy ? 'Reviewing…' : 'Review last trade'}
                                        </button>
                                    )}
                                </div>

                                <div className="text-[10px] text-gray-600">
                                    Auto mode generates a concise review and a lesson memory after every TradeLocker trade closes.
                                </div>
                                {reviewFlash && (
                                    <div className="text-[11px] text-blue-200 bg-blue-900/20 border border-blue-500/20 rounded-lg px-3 py-2">
                                        {reviewFlash}
                                    </div>
                                )}
                            </div>
                        )}

                        {memoryError && (
                            <div className="text-[11px] text-yellow-200 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2">
                                {memoryError}
                            </div>
                        )}

                        {memoryDraft && (
                            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={memoryDraft.type}
                                            onChange={(e) => setMemoryDraft((d) => d ? ({ ...d, type: e.target.value === 'LOSS' ? 'LOSS' : 'WIN' }) : d)}
                                            className="bg-black/30 border border-white/10 rounded px-2 py-1 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/40 font-mono"
                                            disabled={memoryBusy}
                                        >
                                            <option value="WIN">WIN</option>
                                            <option value="LOSS">LOSS</option>
                                        </select>
                                        <div className="text-[10px] text-gray-500 font-mono">
                                            {memoryDraft.id ? 'Edit memory' : 'Add memory'}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setMemoryDraft((d) => d ? ({ ...d, isRule: !d.isRule }) : d)}
                                            disabled={memoryBusy}
                                            className={`px-2 py-1 rounded border text-[10px] font-semibold transition-colors flex items-center gap-1 ${
                                                memoryDraft.isRule
                                                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-200 hover:bg-purple-500/15'
                                                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                            }`}
                                            title="Rules are injected into agent prompts as non‑negotiable constraints."
                                        >
                                            <Bookmark size={12} />
                                            Rule
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {memoryDraft.id && (
                                            <button
                                                type="button"
                                                onClick={() => deleteMemoryById(memoryDraft.id!)}
                                                disabled={!onDeleteMemory || memoryBusy}
                                                className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-200 hover:text-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                title="Delete memory"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => runActionOr('autopilot.memory.draft.set', { clear: true }, () => setMemoryDraft(null))}
                                            disabled={memoryBusy}
                                            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveMemoryDraft}
                                            disabled={memoryBusy}
                                            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-[11px] font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                                        >
                                            <Save size={14} />
                                            Save
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    value={memoryDraft.text}
                                    onChange={(e) => setMemoryDraft((d) => d ? ({ ...d, text: e.target.value }) : d)}
                                    className="w-full min-h-[90px] bg-[#0a0a0a] border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/40 font-mono"
                                    placeholder="Write a short lesson or pattern the agents should learn…"
                                    disabled={memoryBusy}
                                />
                                <div className="text-[10px] text-gray-500">
                                    Tip: keep it actionable (pattern → trigger → invalidation). These get injected into the agents’ prompt.
                                </div>
                            </div>
                        )}

                        <div className="max-h-[320px] overflow-y-auto custom-scrollbar divide-y divide-white/5 border border-white/10 rounded-lg bg-black/20">
                            {filteredMemories.length === 0 ? (
                                <div className="p-6 text-center text-gray-600 text-xs">
                                    No memories found.
                                </div>
                            ) : (
                                filteredMemories.map((m) => (
                                    <div key={m.id} className="p-3 hover:bg-white/[0.03] transition-colors">
                                        <div className="flex items-start justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openEditMemory(m)}
                                                className="text-left flex-1 min-w-0"
                                                disabled={!onUpdateMemory || memoryBusy}
                                                title={onUpdateMemory ? 'Edit memory' : 'Editing not available'}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                        m.type === 'WIN'
                                                            ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                                            : 'bg-red-500/10 text-red-300 border-red-500/20'
                                                    }`}>
                                                        {m.type}
                                                    </span>
                                                    {isRuleMemory(m) && (
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-purple-500/10 text-purple-200 border-purple-500/20 flex items-center gap-1">
                                                            <Bookmark size={10} />
                                                            RULE
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-gray-500 font-mono">{formatAge(m.timestamp)}</span>
                                                    {m.meta?.symbol && (
                                                        <span className="text-[10px] text-gray-500 font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10">
                                                            {String(m.meta.symbol).toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-gray-200 font-mono break-words line-clamp-3">
                                                    {m.text}
                                                </div>
                                            </button>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {onUpdateMemory && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditMemory(m)}
                                                        disabled={memoryBusy}
                                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title="Edit"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                                {onUpdateMemory && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleRuleFlag(m)}
                                                        disabled={memoryBusy}
                                                        className={`p-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                                            isRuleMemory(m)
                                                                ? 'bg-purple-500/10 border-purple-500/30 text-purple-200 hover:bg-purple-500/15'
                                                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-200'
                                                        }`}
                                                        title={isRuleMemory(m) ? 'Unpin rule' : 'Pin as non‑negotiable rule'}
                                                    >
                                                        <Bookmark size={14} />
                                                    </button>
                                                )}
                                                {onDeleteMemory && (
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteMemoryById(m.id)}
                                                        disabled={memoryBusy}
                                                        className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-200 hover:text-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {!canManageMemories && (
                            <div className="text-[10px] text-gray-600">
                                Memory management requires the Trade Ledger (Electron build).
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
        
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-red-900/20 to-black">
            <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 text-red-400 text-xs uppercase tracking-wider font-bold">
                    <Shield size={14} />
                    <span>AutoPilot Guardrails</span>
                </div>
                {onOpenAcademy && (
                    <button
                        type="button"
                        onClick={onOpenAcademy}
                        className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-[10px] inline-flex items-center gap-1"
                    >
                        <BookOpen size={12} />
                        Academy
                    </button>
                )}
            </div>
            <p className="text-[10px] text-gray-500">Configure autonomous trading limits.</p>
        </div>

        {/* Master Switch */}
        <div className="p-6 flex flex-col items-center justify-center border-b border-white/5 bg-white/[0.02]">
            <button 
                onClick={toggleEnabled}
                className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all shadow-2xl border-4 ${
                    config.enabled 
                    ? 'bg-red-600 border-red-400 shadow-[0_0_30px_rgba(220,38,38,0.4)]' 
                    : 'bg-[#1a1a1a] border-gray-700 opacity-50'
                }`}
            >
                <Power size={32} className="text-white mb-1" />
                <span className="text-[9px] font-bold text-white uppercase">{config.enabled ? 'ONLINE' : 'OFFLINE'}</span>
            </button>
            <div className="mt-4 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></span>
                <span className="text-xs text-gray-400 uppercase tracking-widest font-mono">
                    {config.enabled ? 'System Active' : 'System Standby'}
                </span>
            </div>
        </div>

        {/* Risk Configuration */}
        <div className="flex-1 p-4 space-y-6 overflow-y-auto custom-scrollbar">

            <div className="flex flex-wrap gap-2 text-[10px] text-gray-300">
                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                    Orders/min: {Number.isFinite(orderRateValue) && orderRateValue > 0 ? orderRateValue : 'OFF'}
                </span>
                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                    Execution: {String(config.executionMode || 'live').toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                    Allowlist: {allowlistCount > 0 ? `${allowlistCount} symbols` : 'OFF'}
                </span>
            </div>

            {lastTradeBlock && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-amber-200/80">Last trade denied</span>
                        {lastTradeBlockAge && (
                            <span className="text-[10px] text-amber-200/60">{lastTradeBlockAge} ago</span>
                        )}
                    </div>
                    <div className="mt-1 text-[11px] text-amber-100">
                        {lastTradeBlock.reason || 'Trade blocked by guardrails.'}
                    </div>
                    <div className="mt-1 text-[10px] text-amber-200/70">
                        {lastTradeBlockMeta || 'Details unavailable.'}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-amber-200/80">
                        <button
                            type="button"
                            onClick={() => setShowTradeBlockDetails((prev) => !prev)}
                            className="rounded-full border border-amber-300/30 px-2 py-0.5 transition hover:bg-amber-500/10"
                        >
                            {showTradeBlockDetails ? 'Hide details' : 'Show details'}
                        </button>
                        <button
                            type="button"
                            onClick={handleCopyTradeBlockDetails}
                            disabled={!tradeBlockDetailText}
                            className="rounded-full border border-amber-300/30 px-2 py-0.5 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Copy details
                        </button>
                    </div>
                    {showTradeBlockDetails && tradeBlockDetailPreview && (
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-[10px] text-amber-100/90">
                            {tradeBlockDetailPreview}
                        </pre>
                    )}
                </div>
            )}

            <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wider text-gray-400">Ops Snapshot</div>
                    <div className="text-[10px] text-gray-500">
                        {health?.updatedAtMs ? `Updated ${formatAge(new Date(health.updatedAtMs))} ago` : 'No snapshot'}
                        {agentRunnerUpdatedAge ? ` | Agent runner ${agentRunnerUpdatedAge} ago` : ''}
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-2 text-[11px] text-gray-300">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Broker</span>
                        <span>{brokerStatus} · {brokerSnapshotAge}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Stream</span>
                        <span>{streamStatus} · {streamAge}</span>
                    </div>
                    {streamError && (
                        <div className="text-[10px] text-amber-200">Stream error: {streamError}</div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Quotes</span>
                        <span>{quotesAge}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">AutoPilot</span>
                        <span>{String(autoState).toUpperCase()}{autoReason ? ` · ${autoReason}` : ''}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Watchers</span>
                        <span>
                            {watcherEnabledCount != null && watcherCount != null
                                ? `${watcherEnabledCount}/${watcherCount} enabled`
                                : '--'} · Signals {signalCount ?? '--'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Rate limit</span>
                        <span>{rateLimitRemaining}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Agent runner</span>
                        <span>
                            {agentRunnerActiveCount > 0 ? `${agentRunnerActiveCount} active` : 'idle'}
                            {agentRunnerLastRunAge ? ` ú Last run ${agentRunnerLastRunAge}` : ''}
                        </span>
                    </div>
                    {agentRunnerSymbolPreview && (
                        <div className="text-[10px] text-gray-500">
                            Symbols: {agentRunnerSymbolPreview}{agentRunnerSymbolOverflow ? ' ...' : ''}
                        </div>
                    )}
                    {agentRunnerSessions.length > 0 && (
                        <div className="space-y-1 text-[10px] text-gray-300">
                            {agentRunnerSessions.map((session, index) => {
                                const id = session?.sessionId ? String(session.sessionId) : '';
                                const label = session?.symbol || (id ? `${id.slice(0, 8)}...` : `session_${index + 1}`);
                                const age = session?.startedAtMs ? formatAge(new Date(session.startedAtMs)) : '';
                                return (
                                    <div key={id || `${label}_${index}`} className="flex items-center justify-between gap-2">
                                        <span className="truncate">{label}{age ? ` (${age})` : ''}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleAgentRunnerCancel(id)}
                                            disabled={!id || !onRunActionCatalog}
                                            className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-gray-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {agentRunnerError && (
                        <div className="text-[10px] text-amber-200">Agent runner error: {agentRunnerError}</div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-300">
                    <button
                        type="button"
                        disabled={!onRunActionCatalog}
                        onClick={refreshAgentRunnerStatus}
                        className="px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40"
                    >
                        <span className="inline-flex items-center gap-1">
                            <RefreshCcw size={12} />
                            Refresh agent status
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled={!onRunActionCatalog}
                        onClick={() => handleDiagnosticsExport('download')}
                        className="px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40"
                    >
                        Download diagnostics
                    </button>
                    <button
                        type="button"
                        disabled={!onRunActionCatalog}
                        onClick={() => handleDiagnosticsExport('clipboard')}
                        className="px-2 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40"
                    >
                        Copy diagnostics
                    </button>
                    {opsStatus && <span className="text-[10px] text-emerald-200">{opsStatus}</span>}
                </div>
            </div>

            {timelineRun && (
                <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs uppercase tracking-wider text-gray-400">Playbook Timeline</div>
                        <div className="flex items-center gap-2">
                            {onResumePlaybookRun && (timelineRun.status === 'blocked' || timelineRun.status === 'failed') && (
                                <button
                                    type="button"
                                    onClick={() => onResumePlaybookRun(timelineRun.runId)}
                                    className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                                >
                                    Resume
                                </button>
                            )}
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusBadge(timelineRun.status)}`}>
                                {String(timelineRun.status || 'unknown').toUpperCase()}
                            </span>
                        </div>
                    </div>
                    <div className="text-[10px] text-gray-500">{retryPolicyLine}</div>
                    <div className="text-[11px] text-gray-300">
                        <span className="font-semibold text-gray-100">{timelineRun.playbookName || timelineRun.playbookId}</span>
                        {timelineRun.symbol ? ` | ${timelineRun.symbol}` : ''}
                        {timelineRun.timeframe ? ` ${timelineRun.timeframe}` : ''}
                        {timelineRun.strategy ? ` | ${timelineRun.strategy}` : ''}
                        {timelineRun.mode ? ` | ${timelineRun.mode}` : ''}
                    </div>
                    <div className="text-[10px] text-gray-500">
                        Started {formatRunTime(timelineRun.startedAtMs)}{timelineRun.finishedAtMs ? `  | Finished ${formatRunTime(timelineRun.finishedAtMs)}` : ''}
                    </div>
                    {timelineRun.error && (
                        <div className="text-[10px] text-red-300">Error: {timelineRun.error}</div>
                    )}
                    {blockedStep && onResumePlaybookRun && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-100">
                            <div className="font-semibold text-amber-200">
                                {blockedHeader}: {blockedStep.label || blockedStep.actionId}
                            </div>
                            {blockedNote && (
                                <div className="text-[10px] text-amber-200/80">Reason: {blockedStep.note}</div>
                            )}
                            {blockedIsMissing && timelineRun && (
                                <div className="mt-2 grid gap-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            value={getResumeDraft(timelineRun.runId).symbol}
                                            onChange={(e) => updateResumeDraft(timelineRun.runId, { symbol: e.target.value })}
                                            placeholder={timelineRun.symbol || 'Symbol'}
                                            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                                        />
                                        <input
                                            type="text"
                                            value={getResumeDraft(timelineRun.runId).timeframe}
                                            onChange={(e) => updateResumeDraft(timelineRun.runId, { timeframe: e.target.value })}
                                            placeholder={timelineRun.timeframe || 'Timeframe'}
                                            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                                        />
                                        <input
                                            type="text"
                                            value={getResumeDraft(timelineRun.runId).strategy}
                                            onChange={(e) => updateResumeDraft(timelineRun.runId, { strategy: e.target.value })}
                                            placeholder={timelineRun.strategy || 'Strategy'}
                                            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                                        />
                                        <input
                                            type="text"
                                            value={getResumeDraft(timelineRun.runId).timeframes}
                                            onChange={(e) => updateResumeDraft(timelineRun.runId, { timeframes: e.target.value })}
                                            placeholder="MTF list (4h,1h,15m,5m)"
                                            className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                                        />
                                    </div>
                                    <details className="text-[10px] text-gray-300">
                                        <summary className="cursor-pointer text-gray-200">Advanced overrides (JSON)</summary>
                                        <textarea
                                            value={getResumeDraft(timelineRun.runId).dataJson}
                                            onChange={(e) => updateResumeDraft(timelineRun.runId, { dataJson: e.target.value })}
                                            placeholder='{"rangeDays":90,"maxCombos":200}'
                                            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                                            rows={3}
                                        />
                                    </details>
                                    {resumeOverrideErrors[timelineRun.runId] && (
                                        <div className="text-[10px] text-red-300">{resumeOverrideErrors[timelineRun.runId]}</div>
                                    )}
                                </div>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                {blockedIsMissing && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const defaults = resolveRunDefaults(timelineRun);
                                            updateResumeDraft(timelineRun.runId, defaults);
                                        }}
                                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                                    >
                                        Use defaults
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const opts: any = { action: blockedPrimaryAction, stepId: blockedStep.id, actionId: blockedStep.actionId };
                                        if (blockedIsMissing) {
                                            const built = buildResumeOverrides(timelineRun.runId);
                                            if (built.error) {
                                                setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: built.error || 'Invalid overrides.' }));
                                                return;
                                            }
                                            if (blockedRequirement === 'symbol' && !built.overrides?.symbol) {
                                                setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: 'Symbol is required.' }));
                                                return;
                                            }
                                            if (blockedRequirement === 'timeframe' && !(built.overrides?.timeframe || (built.overrides?.timeframes || []).length > 0)) {
                                                setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: 'Timeframe is required.' }));
                                                return;
                                            }
                                            if (blockedRequirement === 'params' && (!built.overrides?.data || Object.keys(built.overrides.data).length === 0)) {
                                                setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: 'Overrides JSON is required.' }));
                                                return;
                                            }
                                            if (built.overrides) opts.overrides = built.overrides;
                                        }
                                        onResumePlaybookRun(timelineRun.runId, opts);
                                    }}
                                    className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                                >
                                    {blockedPrimaryLabel}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onResumePlaybookRun(timelineRun.runId, { action: 'skip', stepId: blockedStep.id, actionId: blockedStep.actionId })}
                                    className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                                >
                                    Skip
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onResumePlaybookRun(timelineRun.runId, { action: 'abort', stepId: blockedStep.id, actionId: blockedStep.actionId })}
                                    className="px-2 py-1 rounded-md text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-200"
                                >
                                    Abort
                                </button>
                            </div>
                        </div>
                    )}
                    {timelineSteps.length > 0 ? (
                        <div className="mt-2 space-y-1">
                            {timelineSteps.map((step, idx) => (
                                <div key={step.id || `${step.actionId}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                                    <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${statusBadge(step.status)}`}>
                                        {String(step.status || '').toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-gray-200">
                                            {step.label || step.actionId}
                                            {Number.isFinite(Number(step.startedAtMs)) && (
                                                <span className="ml-2 text-gray-500">{formatRunTime(step.startedAtMs)}</span>
                                            )}
                                        </div>
                                        {(step.note || step.error) && (
                                            <div className="text-gray-500">
                                                {step.note || step.error}
                                            </div>
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
                        <div className="mt-2 text-[10px] text-gray-500">No steps recorded yet.</div>
                    )}
                    <div className="mt-3 border-t border-white/10 pt-2">
                        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-gray-400">
                            <span>Truth Replay</span>
                            <div className="flex items-center gap-2">
                                <select
                                    value={truthEventFilter}
                                    onChange={(e) => {
                                        const next = e.target.value as typeof truthEventFilter;
                                        setTruthEventFilter(next);
                                        try { localStorage.setItem('glass_truth_event_filter', next); } catch {}
                                    }}
                                    className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-200"
                                >
                                    <option value="all">All</option>
                                    <option value="trade">Trades</option>
                                    <option value="broker">Broker</option>
                                    <option value="setup">Setup</option>
                                    <option value="chart">Chart</option>
                                    <option value="agent">Agent</option>
                                    <option value="playbook">Playbook</option>
                                    <option value="task">Task Tree</option>
                                  </select>
                                {truthEventsUpdatedAtMs && (
                                    <span className="text-[10px] text-gray-500">Updated {formatRunTime(truthEventsUpdatedAtMs)}</span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => loadTruthEvents(timelineRun)}
                                    className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                                >
                                    Refresh
                                </button>
                            </div>
                        </div>
                        {truthEventsError && (
                            <div className="mt-1 text-[10px] text-red-300">Truth replay: {truthEventsError}</div>
                        )}
                        {filteredTruthEvents.length > 0 ? (
                            <div className="mt-2 space-y-2">
                                {filteredTruthEvents.map((event, idx) => {
                                    const eventType = String(event?.eventType || event?.kind || 'event');
                                    const label = eventType.replace(/_/g, ' ');
                                    const detail =
                                        event?.payload?.error ||
                                        event?.payload?.reason ||
                                        event?.payload?.note ||
                                        event?.payload?.status ||
                                        null;
                                    const ts = Number(event?.createdAtMs || event?.updatedAtMs || 0);
                                    return (
                                        <div key={event?.id || `${eventType}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                                            <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${truthLevelBadge(event?.level)}`}>
                                                {String(event?.level || 'info').toUpperCase()}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-gray-200">
                                                    {label}
                                                    {Number.isFinite(ts) && ts > 0 && (
                                                        <span className="ml-2 text-gray-500">{formatRunTime(ts)}</span>
                                                    )}
                                                </div>
                                                {detail && (
                                                    <div className="text-gray-500">{String(detail)}</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-2 text-[10px] text-gray-500">No truth events for this filter.</div>
                        )}
                    </div>
                </div>
            )}

            {taskTreeResumeList.length > 0 && (
                <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-gray-400">
                        <span>Task Tree Resume</span>
                        <span className="text-[10px] text-gray-500">{taskTreeResumeList.length} pending</span>
                    </div>
                    <div className="space-y-2">
                        {taskTreeResumeList.map((entry) => {
                            const label = entry.taskType === 'action' ? 'Action' : 'Signal';
                            const context = entry.context || {};
                            const symbol = context.symbol ? String(context.symbol) : '';
                            const timeframe = context.timeframe ? String(context.timeframe) : '';
                            const strategy = context.strategy ? String(context.strategy) : '';
                            const requiresConfirmation =
                                entry.requiresConfirmation ||
                                entry.blockedReason === 'confirmation_required' ||
                                entry.lastStep?.note === 'confirmation_required';
                            const canSkip = !!entry.blocked && !requiresConfirmation;
                            const status = entry.status ? String(entry.status).toUpperCase() : 'PENDING';
                            return (
                                <div key={`${entry.taskType}-${entry.runId}`} className="rounded-lg border border-white/10 bg-black/40 p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-[11px] text-gray-200">
                                            {label} run {entry.runId.slice(-6)}
                                            {symbol ? ` | ${symbol}` : ''}
                                            {timeframe ? ` ${timeframe}` : ''}
                                            {strategy ? ` | ${strategy}` : ''}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {onResumeTaskTreeRun && (
                                                <>
                                                    {requiresConfirmation ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'approve' })}
                                                            className="px-2 py-1 rounded-md text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-100"
                                                        >
                                                            Approve
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'resume' })}
                                                            className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                                                        >
                                                            Resume
                                                        </button>
                                                    )}
                                                    {canSkip && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'skip' })}
                                                            className="px-2 py-1 rounded-md text-[10px] bg-slate-500/20 hover:bg-slate-500/30 text-slate-200"
                                                        >
                                                            Skip
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'abort' })}
                                                        className="px-2 py-1 rounded-md text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-200"
                                                    >
                                                        Abort
                                                    </button>
                                                </>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusBadge(status.toLowerCase())}`}>
                                                {status}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-1 text-[10px] text-gray-500">
                                        Updated {formatRunTime(entry.updatedAtMs)}
                                        {Number.isFinite(Number(entry.queueDepth)) ? ` • Queue ${entry.queueDepth}` : ''}
                                    </div>
                                    {entry.lastStep && (
                                        <div className="mt-1 text-[10px] text-gray-400">
                                            Last step: {entry.lastStep.step} ({entry.lastStep.status})
                                            {entry.lastStep.note ? ` • ${entry.lastStep.note}` : ''}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {(taskTreeRunList.length > 0 || actionTaskTreeRunList.length > 0) && (
                <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="text-xs uppercase tracking-wider text-gray-400">Task Tree Activity</div>
                    {taskTreeRunList.length > 0 && (
                        <div className="space-y-2">
                            {taskTreeRunList.length > 1 && (
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <span>Signal run</span>
                                    <select
                                        value={selectedTaskTreeRun?.runId || ''}
                                        onChange={(e) => runActionOr('autopilot.run.select', { runId: String(e.target.value) }, () => setSelectedTaskTreeRunId(String(e.target.value)))}
                                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                                    >
                                        {taskTreeRunList.map((run) => (
                                            <option key={run.runId} value={run.runId}>
                                                {run.runId.slice(-6)} {String(run.status || '').toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {selectedTaskTreeRun && renderTaskTreeRun(selectedTaskTreeRun, 'Signal Task Tree')}
                        </div>
                    )}
                    {actionTaskTreeRunList.length > 0 && (
                        <div className="space-y-2">
                            {actionTaskTreeRunList.length > 1 && (
                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                    <span>Action run</span>
                                    <select
                                        value={selectedActionTaskTreeRun?.runId || ''}
                                        onChange={(e) => runActionOr('autopilot.run.select', { actionRunId: String(e.target.value) }, () => setSelectedActionTaskTreeRunId(String(e.target.value)))}
                                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                                    >
                                        {actionTaskTreeRunList.map((run) => (
                                            <option key={run.runId} value={run.runId}>
                                                {run.runId.slice(-6)} {String(run.status || '').toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {selectedActionTaskTreeRun && renderTaskTreeRun(selectedActionTaskTreeRun, 'Action Task Tree')}
                        </div>
                    )}
                    {taskTruthRunId && (
                        <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-gray-400">
                                <span>Truth Replay (Run {taskTruthRunId.slice(-6)})</span>
                                <div className="flex items-center gap-2">
                                    {taskTruthUpdatedAtMs && (
                                        <span className="text-[10px] text-gray-500">Updated {formatRunTime(taskTruthUpdatedAtMs)}</span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => runActionOr('autopilot.truth.run.set', { clear: true }, () => setTaskTruthRunId(''))}
                                        className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                            {taskTruthError && (
                                <div className="text-[10px] text-red-300">{taskTruthError}</div>
                            )}
                            {filteredTaskTruthEvents.length > 0 ? (
                                <div className="space-y-2">
                                    {filteredTaskTruthEvents.map((event, idx) => {
                                        const eventType = String(event?.eventType || event?.kind || 'event');
                                        const label = eventType.replace(/_/g, ' ');
                                        const detail =
                                            event?.payload?.error ||
                                            event?.payload?.reason ||
                                            event?.payload?.note ||
                                            event?.payload?.status ||
                                            null;
                                        const ts = Number(event?.createdAtMs || event?.updatedAtMs || 0);
                                        return (
                                            <div key={event?.id || `${eventType}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                                                <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${truthLevelBadge(event?.level)}`}>
                                                    {String(event?.level || 'info').toUpperCase()}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-gray-200">
                                                        {label}
                                                        {Number.isFinite(ts) && ts > 0 && (
                                                            <span className="ml-2 text-gray-500">{formatRunTime(ts)}</span>
                                                        )}
                                                    </div>
                                                    {detail && (
                                                        <div className="text-gray-500">{String(detail)}</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-[10px] text-gray-500">No truth events for this run.</div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {Array.isArray(recommendedFlows) && recommendedFlows.length > 0 && (
                <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-4 space-y-2">
                    <div className="text-xs uppercase tracking-wider text-gray-400">Recommended Flows</div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={flowSymbolFilter}
                            onChange={(e) => setFlowSymbolFilter(e.target.value)}
                            placeholder="Symbol"
                            className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                        />
                        <input
                            type="text"
                            value={flowTimeframeFilter}
                            onChange={(e) => setFlowTimeframeFilter(e.target.value)}
                            placeholder="TF"
                            className="w-20 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                        />
                        {(flowSymbolFilter || flowTimeframeFilter) && (
                            <button
                                type="button"
                                onClick={() => { setFlowSymbolFilter(''); setFlowTimeframeFilter(''); }}
                                className="px-2 py-1 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    {recommendedFlowList.length > 0 ? (
                        <div className="space-y-2">
                            {recommendedFlowList.map(renderRecommendedFlow)}
                        </div>
                    ) : (
                        <div className="text-[10px] text-gray-500">No flows match the current filter.</div>
                    )}
                </div>
            )}
            
            {/* Input Group: Daily Loss */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <DollarSign size={12} className="text-blue-400"/>
                    Max Daily Loss
                </label>
                <div className="relative group">
                    <input 
                        type="number" 
                        value={config.maxDailyLoss}
                        onChange={(e) => handleNumberChange('maxDailyLoss', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-red-500/50 transition-colors"
                    />
                    <div className="absolute right-3 top-3 text-[10px] text-gray-600">USD</div>
                </div>
                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Activity size={10} />
                    Auto-shutdown if loss exceeds limit.
                </div>
            </div>

            {/* Input Group: Loss Streak Guard */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <AlertTriangle size={12} className="text-orange-400"/>
                    Max Loss Streak
                </label>
                <div className="relative">
                    <input
                        type="number"
                        min={0}
                        value={config.maxConsecutiveLosses ?? 0}
                        onChange={(e) => handleNumberChange('maxConsecutiveLosses', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                    <div className="absolute right-3 top-3 text-[10px] text-gray-600">0 = OFF</div>
                </div>
                <div className="text-[10px] text-gray-500">
                    Current streak: {lossStreakValue != null ? lossStreakValue : '--'}{lossStreakAge ? ` (${lossStreakAge} ago)` : ''}
                </div>
            </div>

            {/* Mode Policy */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Shield size={12} className="text-purple-400"/>
                    Mode Policy
                </label>
                <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Mode</div>
                            <select
                                value={activeMode}
                                onChange={(e) => onUpdateConfig({ ...config, mode: e.target.value as AutoPilotMode })}
                                className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                            >
                                {MODE_OPTIONS.map((opt) => (
                                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Allowed Timeframes</div>
                            <input
                                type="text"
                                value={timeframeInput}
                                onChange={(e) => updateModeTimeframes(e.target.value)}
                                placeholder="1m, 5m, 15m, 1H"
                                className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                            />
                            <div className="text-[10px] text-gray-600">Leave blank to allow all timeframes.</div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Allowed Strategies</div>
                        <div className="flex flex-wrap gap-2">
                            {STRATEGY_OPTIONS.map((opt) => {
                                const active = Array.isArray(activePolicy.allowedStrategies)
                                    ? activePolicy.allowedStrategies.includes(opt.key)
                                    : false;
                                return (
                                    <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => toggleStrategy(opt.key)}
                                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                                            active
                                                ? 'bg-purple-500/15 border-purple-400/40 text-purple-200'
                                                : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="text-[10px] text-gray-600">Leave all off to allow every strategy.</div>
                    </div>
                </div>
            </div>

            {/* Execution Mode */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Terminal size={12} className="text-emerald-400"/>
                    Execution Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {EXECUTION_MODE_OPTIONS.map((opt) => {
                        const active = (config.executionMode || 'live') === opt.key;
                        return (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => onUpdateConfig({ ...config, executionMode: opt.key })}
                                className={`px-2 py-2 rounded-lg border text-[10px] font-semibold transition-colors ${
                                    active
                                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                <div className="text-xs font-bold uppercase">{opt.label}</div>
                                <div className="text-[9px] text-gray-500">{opt.hint}</div>
                            </button>
                        );
                    })}
                </div>
                <div className="text-[10px] text-gray-500">
                    Shadow mode logs trades without sending orders. Paper mode simulates positions locally.
                </div>
            </div>

            {/* Decision Mode */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Brain size={12} className="text-sky-400"/>
                    Decision Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {DECISION_MODE_OPTIONS.map((opt) => {
                        const active = decisionMode === opt.key;
                        return (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => onUpdateConfig({ ...config, decisionMode: opt.key })}
                                className={`px-2 py-2 rounded-lg border text-[10px] font-semibold transition-colors ${
                                    active
                                        ? 'bg-sky-500/20 border-sky-400/50 text-sky-100'
                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                }`}
                            >
                                <div className="text-xs font-bold uppercase">{opt.label}</div>
                                <div className="text-[9px] text-gray-500">{opt.hint}</div>
                            </button>
                        );
                    })}
                </div>
                {decisionMode === 'agent' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px] text-gray-400">
                        <label className="flex flex-col gap-1">
                            Agent
                            <select
                                value={decisionAgentId}
                                onChange={(e) => onUpdateConfig({ ...config, decisionAgentId: e.target.value })}
                                className="bg-[#151515] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-gray-200"
                            >
                                <option value="">(default)</option>
                                {decisionAgentOptions.map((agent) => (
                                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            Reasoning Effort
                            <select
                                value={decisionReasoningEffort}
                                onChange={(e) => onUpdateConfig({ ...config, decisionReasoningEffort: e.target.value as any })}
                                className="bg-[#151515] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-gray-200"
                            >
                                {REASONING_EFFORT_OPTIONS.map((opt) => (
                                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            Max cmds / min
                            <input
                                type="number"
                                min={0}
                                value={config.maxAgentCommandsPerMinute ?? 0}
                                onChange={(e) => onUpdateConfig({ ...config, maxAgentCommandsPerMinute: Number(e.target.value) })}
                                className="bg-[#151515] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-gray-200"
                            />
                        </label>
                    </div>
                )}
                <div className="text-[10px] text-gray-500">
                    Deterministic uses setup signal rules; Agent mode prompts a trading agent to decide.
                </div>
            </div>

              {shadowStats && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-emerald-200">
                        <span>Shadow Mode Stats</span>
                        {shadowStats.updatedAtMs && (
                            <span className="text-[10px] text-emerald-200/60">Updated {formatRunTime(shadowStats.updatedAtMs)}</span>
                        )}
                    </div>
                    <div className="text-[11px] text-emerald-100">
                        Open {shadowStats.openCount} | Closed {shadowStats.closedCount} | WR {shadowWinRate} | NetR {shadowNetR} | AvgR {shadowAvgR}
                    </div>
                    {shadowStats.lastClosedAtMs && (
                        <div className="text-[10px] text-emerald-200/80">Last closed {formatRunTime(shadowStats.lastClosedAtMs)}</div>
                    )}
                    {shadowRegimeRows.length > 0 && (
                        <div className="grid grid-cols-1 gap-1 text-[10px] text-emerald-200/80">
                            {shadowRegimeRows.map((row) => (
                                <div key={row.key} className="flex items-center justify-between gap-2">
                                    <span>{row.key}</span>
                                    <span>{row.trades} | WR {row.winRate != null ? `${(row.winRate * 100).toFixed(0)}%` : '--'} | NetR {row.netR != null ? row.netR.toFixed(2) : '--'}</span>
                                </div>
                            ))}
                  </div>
              )}
              {shadowCompareValue ? (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-sky-200">
                          <span>Shadow vs Live</span>
                          <div className="flex items-center gap-2">
                              {shadowCompareValue.updatedAtMs && (
                                  <span className="text-[10px] text-sky-200/60">Updated {formatRunTime(shadowCompareValue.updatedAtMs)}</span>
                              )}
                              <button
                                  type="button"
                                  onClick={() => onRunActionCatalog?.({ actionId: 'shadow.compare', payload: { includePairs: false } })}
                                  className="rounded-full border border-sky-400/40 px-2 py-0.5 text-[9px] uppercase tracking-wider text-sky-200/80 transition hover:text-sky-100"
                              >
                                  Refresh
                              </button>
                          </div>
                      </div>
                      <div className="text-[11px] text-sky-100">
                          Matched {shadowCompareValue.matchedCount} | Shadow WR {shadowCompareShadowWR} | Live WR {shadowCompareActualWR}
                      </div>
                      <div className="text-[10px] text-sky-200/80">
                          NetR {shadowCompareShadowNetR} vs {shadowCompareActualNetR} | ΔR {shadowCompareDeltaR} | Match {shadowCompareMatchRate}
                      </div>
                      {(shadowCompareValue.shadowOnlyCount > 0 || shadowCompareValue.actualOnlyCount > 0) && (
                          <div className="text-[10px] text-sky-200/70">
                              Shadow only {shadowCompareValue.shadowOnlyCount} | Live only {shadowCompareValue.actualOnlyCount}
                          </div>
                      )}
                  </div>
              ) : (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] text-sky-100/80">
                      <div className="flex items-center justify-between gap-2">
                          <span className="uppercase tracking-wider text-sky-200/80">Shadow vs Live</span>
                          <button
                              type="button"
                              onClick={() => onRunActionCatalog?.({ actionId: 'shadow.compare', payload: { includePairs: false } })}
                              className="rounded-full border border-sky-400/40 px-2 py-0.5 text-[9px] uppercase tracking-wider text-sky-200/80 transition hover:text-sky-100"
                          >
                              Refresh
                          </button>
                      </div>
                      <div className="mt-1 text-[10px] text-sky-200/70">No compare data yet.</div>
                  </div>
              )}
                </div>
            )}

            {/* Input Group: Risk Per Trade */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Percent size={12} className="text-yellow-400"/>
                    Risk Per Trade (Mode)
                </label>
                <div className="relative">
                    <input 
                        type="number" 
                        value={activeRiskValue}
                        onChange={(e) => updateModeRisk(e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                    />
                    <div className="absolute right-3 top-3 text-[10px] text-gray-600">% EQUITY</div>
                </div>
                <div className="text-[10px] text-gray-500">
                    Max Lot Size: ~{((equity * (sizingRiskValue/100)) / 100).toFixed(2)} lots
                </div>
                {swingRiskWarning && (
                    <div className="text-[10px] text-orange-300">
                        Swing 0.50% is intended for low max positions and wider stops.
                    </div>
                )}
            </div>

            {/* Input Group: Spread Limit */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Activity size={12} className="text-cyan-400"/>
                    Spread Limit
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <select
                        value={config.spreadLimitModel || 'none'}
                        onChange={(e) => handleTextChange('spreadLimitModel', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-3 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                    >
                        <option value="none">OFF</option>
                        <option value="percent">Percent</option>
                        <option value="atr">ATR</option>
                    </select>
                    {config.spreadLimitModel === 'atr' ? (
                        <div className="relative">
                            <input
                                type="number"
                                value={config.spreadLimitAtrMult ?? 0}
                                onChange={(e) => handleNumberChange('spreadLimitAtrMult', e.target.value)}
                                className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                            />
                            <div className="absolute right-3 top-3 text-[10px] text-gray-600">x ATR</div>
                        </div>
                    ) : (
                        <div className="relative">
                            <input
                                type="number"
                                value={config.spreadLimitPct ?? 0}
                                onChange={(e) => handleNumberChange('spreadLimitPct', e.target.value)}
                                className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                                disabled={(config.spreadLimitModel || 'none') !== 'percent'}
                            />
                            <div className="absolute right-3 top-3 text-[10px] text-gray-600">% PRICE</div>
                        </div>
                    )}
                </div>
                <div className="text-[10px] text-gray-500">
                    Block trades if spread exceeds the selected threshold.
                </div>
            </div>

            {/* Input Group: Lot Size */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Briefcase size={12} className="text-green-400"/>
                    Default Lot Size
                </label>
                <div className="relative group">
                    <input 
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={config.lotSize}
                        onChange={(e) => handleNumberChange('lotSize', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-green-500/50 transition-colors"
                    />
                    <div className="absolute right-3 top-3 text-[10px] text-gray-600">LOTS</div>
                </div>
                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Activity size={10} />
                    Used when executing agent/AutoPilot trades.
                </div>
            </div>

            {/* Input Group: Max Open Positions */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Briefcase size={12} className="text-purple-400"/>
                    Max Open Positions
                </label>
                <div className="relative">
                    <input 
                        type="number" 
                        value={config.maxOpenPositions}
                        onChange={(e) => handleNumberChange('maxOpenPositions', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                    />
                </div>
            </div>

            {/* Input Group: Max Orders Per Minute */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Zap size={12} className="text-orange-400"/>
                    Max Orders / Minute
                </label>
                <div className="relative">
                    <input
                        type="number"
                        min={0}
                        value={config.maxOrdersPerMinute ?? 0}
                        onChange={(e) => handleNumberChange('maxOrdersPerMinute', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                    <div className="absolute right-3 top-3 text-[10px] text-gray-600">0 = OFF</div>
                </div>
                <div className="text-[10px] text-gray-500">
                    Hard cap on order submissions per minute (AutoPilot only).
                </div>
            </div>

            {/* Input Group: Per-Symbol Max Positions */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Briefcase size={12} className="text-pink-400"/>
                    Per-Symbol Max Positions
                </label>
                <div className="relative">
                    <input
                        type="number"
                        min={0}
                        value={config.perSymbolMaxPositions ?? 0}
                        onChange={(e) => handleNumberChange('perSymbolMaxPositions', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-pink-500/50 transition-colors"
                    />
                    <div className="absolute right-3 top-3 text-[10px] text-gray-600">0 = OFF</div>
                </div>
                <div className="text-[10px] text-gray-500">
                    Cap concurrent positions per symbol before AutoPilot submits more.
                </div>
            </div>

            {/* Input Group: Per-Symbol Max Lot */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Briefcase size={12} className="text-emerald-400"/>
                    Per-Symbol Max Lot
                </label>
                <div className="relative group">
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={config.perSymbolMaxLot ?? 0}
                        onChange={(e) => handleNumberChange('perSymbolMaxLot', e.target.value)}
                        className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-sm font-mono text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                    <div className="absolute right-3 top-3 text-[10px] text-gray-600">0 = OFF</div>
                </div>
                <div className="text-[10px] text-gray-500">
                    Hard cap on lot size for any single symbol.
                </div>
            </div>

            {/* Symbol Overrides */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Pencil size={12} className="text-yellow-400"/>
                    Per-Symbol Overrides
                </label>
                <textarea
                    rows={4}
                    value={config.symbolCapsRaw || ''}
                    onChange={(e) => handleTextChange('symbolCapsRaw', e.target.value)}
                    placeholder="XAUUSD.R,0.02,1&#10;BTCUSD,0.01,1"
                    className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-xs font-mono text-white focus:outline-none focus:border-yellow-500/50 transition-colors"
                />
                <div className="text-[10px] text-gray-500">
                    One per line: SYMBOL,MAX_LOT,MAX_POSITIONS. Use 0 to disable a field.
                </div>
            </div>

            {/* Symbol Allowlist */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Shield size={12} className="text-red-400"/>
                    Symbol Allowlist
                </label>
                <textarea
                    rows={3}
                    value={config.symbolAllowlistRaw || ''}
                    onChange={(e) => handleTextChange('symbolAllowlistRaw', e.target.value)}
                    placeholder="XAUUSD.R, BTCUSD, EURUSD"
                    className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-xs font-mono text-white focus:outline-none focus:border-red-500/50 transition-colors"
                />
                <div className="text-[10px] text-gray-500">
                    If set, AutoPilot only trades listed symbols (comma or newline separated).
                </div>
            </div>

            {/* Symbol Group Map */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Bookmark size={12} className="text-cyan-400"/>
                    Symbol Groups
                </label>
                <textarea
                    rows={4}
                    value={config.symbolGroupMapRaw || ''}
                    onChange={(e) => handleTextChange('symbolGroupMapRaw', e.target.value)}
                    placeholder="US_INDICES: NAS100, US30&#10;NAS100, US_INDICES"
                    className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-xs font-mono text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                />
                <div className="text-[10px] text-gray-500">
                    Map symbols to a group (GROUP: symbols or SYMBOL, GROUP).
                </div>
            </div>

            {/* Group Caps */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Bookmark size={12} className="text-emerald-400"/>
                    Group Caps
                </label>
                <textarea
                    rows={4}
                    value={config.groupCapsRaw || ''}
                    onChange={(e) => handleTextChange('groupCapsRaw', e.target.value)}
                    placeholder="US_INDICES,2.0,3&#10;FX_MAJORS,1.0,2"
                    className="w-full bg-[#151515] border border-white/10 rounded-lg py-3 px-4 text-xs font-mono text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
                <div className="text-[10px] text-gray-500">
                    One per line: GROUP,MAX_LOT,MAX_POSITIONS. Use 0 to disable a field.
                </div>
            </div>

            {/* Drift Controls */}
            <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    <Activity size={12} className="text-blue-400"/>
                    Drift Controls
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                        Warn Action
                        <select
                            value={config.driftActionWarn || 'none'}
                            onChange={(e) => handleTextChange('driftActionWarn', e.target.value)}
                            className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        >
                            {DRIFT_ACTION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                        Poor Action
                        <select
                            value={config.driftActionPoor || 'none'}
                            onChange={(e) => handleTextChange('driftActionPoor', e.target.value)}
                            className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        >
                            {DRIFT_ACTION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                        Action Cooldown (hrs)
                        <input
                            type="number"
                            min={0}
                            value={config.driftActionCooldownHours ?? 0}
                            onChange={(e) => handleNumberChange('driftActionCooldownHours', e.target.value)}
                            className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                        />
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                        <input
                            type="checkbox"
                            checked={!!config.driftAutoRetest}
                            onChange={() => onUpdateConfig({ ...config, driftAutoRetest: !config.driftAutoRetest })}
                        />
                        Auto re-test on drift
                    </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                        Retest Range (days)
                        <input
                            type="number"
                            min={7}
                            value={config.driftRetestRangeDays ?? 0}
                            onChange={(e) => handleNumberChange('driftRetestRangeDays', e.target.value)}
                            className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                            disabled={!config.driftAutoRetest}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                        Retest Cooldown (hrs)
                        <input
                            type="number"
                            min={0}
                            value={config.driftRetestCooldownHours ?? 0}
                            onChange={(e) => handleNumberChange('driftRetestCooldownHours', e.target.value)}
                            className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                            disabled={!config.driftAutoRetest}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                        Max Combos
                        <input
                            type="number"
                            min={1}
                            value={config.driftRetestMaxCombos ?? 0}
                            onChange={(e) => handleNumberChange('driftRetestMaxCombos', e.target.value)}
                            className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                            disabled={!config.driftAutoRetest}
                        />
                    </label>
                </div>
                <div className="text-[10px] text-gray-500">
                    Auto downgrades drifted setups and can re-test them on fresh broker history.
                </div>
            </div>

            {/* Toggle: Kill Switch */}
            <div
                onClick={toggleKillSwitch}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    config.killSwitch
                    ? 'bg-red-900/20 border-red-500/40'
                    : 'bg-white/5 border-white/10'
                }`}
            >
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-200">AutoPilot Kill Switch</span>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${config.killSwitch ? 'bg-red-500' : 'bg-gray-600'}`}>
                         <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${config.killSwitch ? 'left-4.5' : 'left-0.5'}`}></div>
                    </div>
                </div>
                <p className="text-[10px] text-gray-500">
                    {config.killSwitch
                      ? "Emergency stop is ON. AutoPilot will not execute new trades."
                      : "Emergency stop is OFF. AutoPilot can submit trades if enabled."}
                </p>
            </div>

            {/* Telegram Integration Section */}
            <div className="pt-4 border-t border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 text-xs uppercase tracking-wider font-bold">
                    <Send size={14} />
                    <span>Remote Command Link</span>
                </div>
                <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                         <span className="text-xs font-medium text-gray-300">Telegram Bot</span>
                         <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${config.telegram.connected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                             <div className={`w-1.5 h-1.5 rounded-full ${config.telegram.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                             {config.telegram.connected ? 'CONNECTED' : 'OFFLINE'}
                         </div>
                    </div>
                    
                    {!config.telegram.connected ? (
                        <>
                            <input 
                                type="password" 
                                value={tokenInput}
                                onChange={(e) => setTokenInput(e.target.value)}
                                placeholder="Bot Token (e.g. 123456:ABC-DEF...)"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none"
                            />
                            <input 
                                type="text" 
                                value={chatIdInput}
                                onChange={(e) => setChatIdInput(e.target.value)}
                                placeholder="Chat ID (e.g. -100123456789)"
                                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-3 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none"
                            />
                            <button 
                                onClick={handleConnectTelegram}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs font-semibold text-white transition-colors"
                            >
                                Establish Connection
                            </button>
                        </>
                    ) : (
                        <div className="flex gap-2">
                             <button 
                                onClick={handleConnectTelegram}
                                className="flex-1 py-2 bg-white/5 hover:bg-red-500/20 hover:text-red-400 border border-white/10 rounded text-xs transition-colors"
                             >
                                Disconnect
                            </button>
                            <button className="px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-gray-400 hover:text-white transition-colors">
                                <MessageSquare size={14} />
                            </button>
                        </div>
                    )}
                    <p className="text-[9px] text-gray-500 leading-tight">
                        Enables remote status updates and trade notifications via encrypted Telegram bot relay.
                    </p>
                </div>
            </div>

            {/* Neural Memory Log */}
            <div className="pt-4 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-purple-400 text-xs uppercase tracking-wider font-bold">
                        <Brain size={14} />
                        <span>Learned Memory</span>
                        <span className="text-[10px] text-gray-500 font-mono">({memories.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={openAddMemory}
                            disabled={!onAddMemory}
                            className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-semibold text-white transition-colors flex items-center gap-1"
                        >
                            <Plus size={12} />
                            Add
                        </button>
                        <button
                            type="button"
                            onClick={openMemoryManager}
                            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-semibold text-gray-200 transition-colors"
                        >
                            Manage
                        </button>
                    </div>
                </div>
                <div className="w-full bg-[#050505] border border-white/10 rounded-lg p-2 custom-scrollbar font-mono text-[10px] space-y-1">
                    {memories.length === 0 ? (
                        <div className="h-24 flex flex-col items-center justify-center text-gray-600">
                             <Terminal size={16} className="mb-1 opacity-50"/>
                             <span>No trading patterns learned yet.</span>
                        </div>
                    ) : (
                        previewMemories.map(m => (
                            <div key={m.id} className={`flex gap-2 border-b border-white/5 pb-1 last:border-0 ${m.type === 'WIN' ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                <span className="font-bold flex-shrink-0">[{m.type}]</span>
                                {isRuleMemory(m) && (
                                    <span className="flex-shrink-0 text-purple-300" title="Rule (non‑negotiable)">
                                        <Bookmark size={12} />
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => openEditMemory(m)}
                                    className="text-left text-gray-400 hover:text-gray-200 transition-colors line-clamp-2"
                                    disabled={!onUpdateMemory}
                                    title={onUpdateMemory ? 'Edit memory' : 'Editing not available'}
                                >
                                    {m.text}
                                </button>
                            </div>
                        ))
                    )}
                    {memories.length > 6 && (
                        <div className="pt-1 text-[10px] text-gray-600">
                            Showing 6 (rules first). Open Manage to view all.
                        </div>
                    )}
                </div>
            </div>

            {/* Toggle: Require Confirmation */}
            <div 
                onClick={toggleConfirmation}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    config.requireConfirmation 
                    ? 'bg-blue-900/10 border-blue-500/30' 
                    : 'bg-red-900/10 border-red-500/30'
                }`}
            >
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-200">Human Confirmation</span>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${config.requireConfirmation ? 'bg-blue-500' : 'bg-gray-600'}`}>
                         <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${config.requireConfirmation ? 'left-4.5' : 'left-0.5'}`}></div>
                    </div>
                </div>
                <p className="text-[10px] text-gray-500">
                    {config.requireConfirmation 
                     ? "Agents will ask permission before placing trades." 
                     : "WARNING: Agents will execute trades autonomously."}
                </p>
            </div>
            
            {/* Disclaimer */}
            <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg flex gap-2">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <p className="text-[10px] text-red-200 leading-relaxed">
                    By enabling AutoPilot without confirmation, you authorize the agents to execute trades on your behalf based on their analysis. Use at your own risk.
                </p>
            </div>

        </div>
    </div>
  );
};

export default AutoPilotInterface;
