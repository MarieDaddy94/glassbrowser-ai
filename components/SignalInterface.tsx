import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, ChevronDown, ChevronUp, Play, Plus, RefreshCw, Shield, X, XCircle } from 'lucide-react';
import TagPills from './TagPills';
import VirtualItem from './VirtualItem';
import type { CrossPanelContext, HealthSnapshot, NewsSnapshot, SignalQuantTelemetry, UnifiedSnapshotStatus } from '../types';
import { requireBridge } from '../services/bridgeGuard';
import { classifyUnifiedSnapshotStatus, formatUnifiedSnapshotStatusLabel } from '../services/unifiedSnapshotStatus';

export type SignalStrategyMode = 'scalp' | 'day' | 'swing';
export type SignalEntryStatus = 'PROPOSED' | 'SUBMITTING' | 'PENDING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED' | 'WIN' | 'LOSS' | 'FAILED';
export type SignalExecutionTarget = 'auto' | 'mt5' | 'tradelocker';

export type SignalSessionWindow = {
  id: 'asia' | 'london' | 'ny' | 'custom';
  label: string;
  startHour: number;
  endHour: number;
  enabled: boolean;
};

export type SignalEntry = {
  id: string;
  signalCanonicalId?: string | null;
  signalIdentityVersion?: 'v2' | string | null;
  legacySignalId?: string | null;
  symbol: string;
  timeframe?: string | null;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  targets?: number[] | null;
  probability: number;
  strategyMode?: SignalStrategyMode | null;
  reason?: string | null;
  status: SignalEntryStatus;
  createdAtMs: number;
  executedAtMs?: number | null;
  resolvedAtMs?: number | null;
  expiresAtMs?: number | null;
  agentId?: string | null;
  agentName?: string | null;
  executionError?: string | null;
  executionSource?: 'manual' | 'autopilot' | null;
  executionBroker?: 'tradelocker' | 'sim' | 'shadow' | 'mt5' | null;
  executionMode?: 'suggest' | 'paper' | 'live' | 'shadow' | string | null;
  executionLedgerId?: string | null;
  executionOrderId?: string | null;
  executionPositionId?: string | null;
  executionOrderStatus?: string | null;
  shadowLedgerId?: string | null;
  tradeProposal?: any;
  runId?: string | null;
  newsSnapshot?: NewsSnapshot | null;
  quantTelemetry?: SignalQuantTelemetry | null;
};

export type SignalSnapshotStatus = UnifiedSnapshotStatus;

type SymbolSuggestion = {
  symbol: string;
  label?: string | null;
};

type SignalSimulatedOutcome = {
  outcome: 'WIN' | 'LOSS' | 'EXPIRED';
  resolvedAtMs: number;
  exitPrice?: number | null;
  timeframe?: string;
  barsToOutcome?: number | null;
  durationMs?: number | null;
};

type SignalInterfaceProps = {
  symbols: string[];
  onAddSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  onSearchSymbols: (query: string) => Promise<SymbolSuggestion[]>;
  timeframes: string[];
  onTimeframesChange: (next: string[]) => void;
  sessions: SignalSessionWindow[];
  onSessionsChange: (next: SignalSessionWindow[]) => void;
  strategyModes: SignalStrategyMode[];
  onStrategyModesChange: (next: SignalStrategyMode[]) => void;
  autoRefreshEnabled: boolean;
  onAutoRefreshChange: (next: boolean) => void;
  refreshIntervalMs: number;
  onRefreshIntervalChange: (next: number) => void;
  probabilityThreshold: number;
  onProbabilityThresholdChange: (next: number) => void;
  probabilityMax: number;
  onProbabilityMaxChange: (next: number) => void;
  expiryMinutes: number;
  onExpiryMinutesChange: (next: number) => void;
  autoExecuteEnabled: boolean;
  onAutoExecuteChange: (next: boolean) => void;
  executionTarget: SignalExecutionTarget;
  onExecutionTargetChange: (next: SignalExecutionTarget) => void;
  memoryMode?: 'inject' | 'tool' | 'both';
  onMemoryModeChange: (next: 'inject' | 'tool' | 'both') => void;
  memoryLimit: number;
  onMemoryLimitChange: (next: number) => void;
  patternContextEnabled: boolean;
  onPatternContextChange: (next: boolean) => void;
  autoPilotEnabled: boolean;
  autoPilotKill?: boolean;
  autoPilotMode?: string | null;
  isRunning: boolean;
  lastRunAtMs: number | null;
  lastAttemptAtMs?: number | null;
  lastError?: string | null;
  lastParseError?: string | null;
  lastParseAtMs?: number | null;
  snapshotStatus?: SignalSnapshotStatus | null;
  snapshotScopeMismatch?: { signalScopeKey?: string | null; panelScopeKey?: string | null } | null;
  healthSnapshot?: HealthSnapshot | null;
  signals: SignalEntry[];
  simulatedOutcomes?: Record<string, SignalSimulatedOutcome>;
  onRunScan: () => void;
  onExecuteSignal: (id: string) => void;
  onRejectSignal: (id: string) => void;
  onCancelSignalOrder: (id: string) => void;
  onOpenAcademyCase?: (id: string) => void;
  onOpenChart?: (symbol: string, timeframe?: string | null) => void;
  onOpenMt5?: (symbol: string, timeframe?: string | null) => void;
  onOpenTradeLocker?: (symbol: string, timeframe?: string | null) => void;
  onPrefillMt5Ticket?: (signal: SignalEntry) => void;
  onPrefillTradeLockerTicket?: (signal: SignalEntry) => void;
  onClearSignals: () => void;
  crossPanelContext?: CrossPanelContext | null;
  onFocusSignal?: (signal: SignalEntry) => void;
};

const FRAME_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' }
];
const PANEL_STORAGE_KEY = 'glass_signal_panel_ui_v1';
const FILTER_STORAGE_KEY = 'glass_signal_filters_v1';
const FILTER_PRESET_KEY = 'glass_signal_filter_presets_v1';

type SignalPanelState = {
  settingsOpen?: boolean;
  signalsExpanded?: boolean;
};

type SignalFilterState = {
  open?: boolean;
  query?: string;
  status?: string;
  agent?: string;
  symbol?: string;
  timeframe?: string;
  strategy?: string;
  executionMode?: string;
  executionBroker?: string;
};

type SignalFilterPreset = {
  id: string;
  name: string;
  filters: Omit<SignalFilterState, 'open'>;
};

const loadPanelState = (): SignalPanelState => {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      settingsOpen: typeof parsed?.settingsOpen === 'boolean' ? parsed.settingsOpen : undefined,
      signalsExpanded: typeof parsed?.signalsExpanded === 'boolean' ? parsed.signalsExpanded : undefined
    };
  } catch {
    return {};
  }
};

const persistPanelState = (state: SignalPanelState) => {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
};

const loadFilterState = (): SignalFilterState => {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      open: typeof parsed?.open === 'boolean' ? parsed.open : false,
      query: typeof parsed?.query === 'string' ? parsed.query : '',
      status: typeof parsed?.status === 'string' ? parsed.status : 'all',
      agent: typeof parsed?.agent === 'string' ? parsed.agent : 'all',
      symbol: typeof parsed?.symbol === 'string' ? parsed.symbol : 'all',
      timeframe: typeof parsed?.timeframe === 'string' ? parsed.timeframe : 'all',
      strategy: typeof parsed?.strategy === 'string' ? parsed.strategy : 'all',
      executionMode: typeof parsed?.executionMode === 'string' ? parsed.executionMode : 'all',
      executionBroker: typeof parsed?.executionBroker === 'string' ? parsed.executionBroker : 'all'
    };
  } catch {
    return {};
  }
};

const persistFilterState = (state: SignalFilterState) => {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

const loadFilterPresets = (): SignalFilterPreset[] => {
  try {
    const raw = localStorage.getItem(FILTER_PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || ''),
        filters: item?.filters && typeof item.filters === 'object' ? item.filters : {}
      }))
      .filter((item) => item.id && item.name);
  } catch {
    return [];
  }
};

const persistFilterPresets = (presets: SignalFilterPreset[]) => {
  try {
    localStorage.setItem(FILTER_PRESET_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
};

const formatAge = (ts: number | null | undefined) => {
  if (!ts) return '--';
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
};

const formatDuration = (ms?: number | null) => {
  if (ms == null || !Number.isFinite(ms)) return '';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.floor(totalMin / 60);
  if (totalHr < 48) return `${totalHr}h`;
  const totalDays = Math.floor(totalHr / 24);
  return `${totalDays}d`;
};

const formatDue = (ts?: number | null) => {
  if (!ts || !Number.isFinite(ts)) return '--';
  const delta = Math.floor((ts - Date.now()) / 1000);
  if (delta <= 0) return 'due';
  if (delta < 60) return `in ${delta}s`;
  const min = Math.floor(delta / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  return `in ${hr}h`;
};

const formatTimeframe = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.endsWith('h') || lower.endsWith('d') || lower.endsWith('w')) return lower.toUpperCase();
  return lower;
};

const getNewsImpactLabel = (snapshot?: NewsSnapshot | null) => {
  if (!snapshot) return null;
  const score = Number(snapshot.impactScore) || 0;
  const level = snapshot.impactLevel || (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');
  return `${level.toUpperCase()} ${score}`;
};

const getNewsImpactClass = (snapshot?: NewsSnapshot | null) => {
  if (!snapshot) return 'text-gray-400 border-white/10';
  const level = snapshot.impactLevel || 'low';
  if (level === 'high') return 'text-red-200 border-red-400/40';
  if (level === 'medium') return 'text-amber-200 border-amber-400/40';
  return 'text-gray-300 border-white/10';
};

const getNewsToneLabel = (snapshot?: NewsSnapshot | null) => {
  if (!snapshot) return null;
  const tone = String(snapshot.tone || '').trim().toLowerCase();
  if (!tone || tone === 'neutral') return null;
  const score = Number(snapshot.toneScore);
  const scoreLabel = Number.isFinite(score) && score !== 0 ? ` ${score > 0 ? '+' : ''}${score}` : '';
  return `${tone.toUpperCase()}${scoreLabel}`;
};

const getNewsToneClass = (snapshot?: NewsSnapshot | null) => {
  if (!snapshot) return 'text-gray-300 border-white/10';
  const tone = snapshot.tone || 'neutral';
  if (tone === 'positive') return 'text-emerald-200 border-emerald-400/40';
  if (tone === 'negative') return 'text-red-200 border-red-400/40';
  if (tone === 'mixed') return 'text-amber-200 border-amber-400/40';
  return 'text-gray-300 border-white/10';
};

const clampNumber = (value: any, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
};

const toggleList = <T extends string>(list: T[], value: T) => {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
};

const SignalInterface: React.FC<SignalInterfaceProps> = ({
  symbols,
  onAddSymbol,
  onRemoveSymbol,
  onSearchSymbols,
  timeframes,
  onTimeframesChange,
  sessions,
  onSessionsChange,
  strategyModes,
  onStrategyModesChange,
  autoRefreshEnabled,
  onAutoRefreshChange,
  refreshIntervalMs,
  onRefreshIntervalChange,
  probabilityThreshold,
  onProbabilityThresholdChange,
  probabilityMax,
  onProbabilityMaxChange,
  expiryMinutes,
  onExpiryMinutesChange,
  autoExecuteEnabled,
  onAutoExecuteChange,
  executionTarget,
  onExecutionTargetChange,
  memoryMode,
  onMemoryModeChange,
  memoryLimit,
  onMemoryLimitChange,
  patternContextEnabled,
  onPatternContextChange,
  autoPilotEnabled,
  autoPilotKill,
  autoPilotMode,
  isRunning,
  lastRunAtMs,
  lastAttemptAtMs,
  lastError,
  lastParseError,
  lastParseAtMs,
  snapshotStatus,
  snapshotScopeMismatch,
  healthSnapshot,
  signals,
  simulatedOutcomes,
  onRunScan,
  onExecuteSignal,
  onRejectSignal,
  onCancelSignalOrder,
  onOpenAcademyCase,
  onOpenChart,
  onOpenMt5,
  onOpenTradeLocker,
  onPrefillMt5Ticket,
  onPrefillTradeLockerTicket,
  onClearSignals,
  crossPanelContext,
  onFocusSignal
}) => {
  const initialPanelState = useMemo(loadPanelState, []);
  const initialFilterState = useMemo(loadFilterState, []);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(initialPanelState.settingsOpen ?? true);
  const [signalsExpanded, setSignalsExpanded] = useState(initialPanelState.signalsExpanded ?? false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(initialFilterState.open ?? false);
  const [filterQuery, setFilterQuery] = useState(initialFilterState.query || '');
  const [filterStatus, setFilterStatus] = useState(initialFilterState.status || 'all');
  const [filterAgent, setFilterAgent] = useState(initialFilterState.agent || 'all');
  const [filterSymbol, setFilterSymbol] = useState(initialFilterState.symbol || 'all');
  const [filterTimeframe, setFilterTimeframe] = useState(initialFilterState.timeframe || 'all');
  const [filterStrategy, setFilterStrategy] = useState(initialFilterState.strategy || 'all');
  const [filterExecutionMode, setFilterExecutionMode] = useState(initialFilterState.executionMode || 'all');
  const [filterExecutionBroker, setFilterExecutionBroker] = useState(initialFilterState.executionBroker || 'all');
  const [filterPresets, setFilterPresets] = useState<SignalFilterPreset[]>(() => loadFilterPresets());
  const [activePresetId, setActivePresetId] = useState<string>('');
  const [presetName, setPresetName] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const resolvedMemoryMode =
    memoryMode === 'inject' || memoryMode === 'tool' || memoryMode === 'both' ? memoryMode : 'both';
  const signalSla = useMemo(() => {
    const list = healthSnapshot?.refreshSlaByChannel || [];
    return Array.isArray(list) ? list.find((row) => String(row?.channel || '').toLowerCase() === 'signal') || null : null;
  }, [healthSnapshot?.refreshSlaByChannel]);
  const openCircuitSources = useMemo(() => {
    const list = healthSnapshot?.brokerCircuitBySource || [];
    if (!Array.isArray(list)) return [];
    return list.filter((row) => String(row?.state || '').toUpperCase() === 'OPEN').map((row) => String(row.source || '')).filter(Boolean);
  }, [healthSnapshot?.brokerCircuitBySource]);
  const signalPanelConnectivity = useMemo(() => {
    const list = healthSnapshot?.panelConnectivity || [];
    if (!Array.isArray(list)) return [];
    return list.filter((row) => String(row?.panel || '').toLowerCase() === 'signal');
  }, [healthSnapshot?.panelConnectivity]);
  const signalConnectivityIssue = useMemo(() => {
    return signalPanelConnectivity.find((row) => !row?.ready) || null;
  }, [signalPanelConnectivity]);
  const lastSuccessfulScanAtMs = Number(healthSnapshot?.lastSuccessfulScanAtMs || 0) || null;

  useEffect(() => {
    persistPanelState({ settingsOpen, signalsExpanded });
  }, [settingsOpen, signalsExpanded]);

  useEffect(() => {
    persistFilterState({
      open: filtersOpen,
      query: filterQuery,
      status: filterStatus,
      agent: filterAgent,
      symbol: filterSymbol,
      timeframe: filterTimeframe,
      strategy: filterStrategy,
      executionMode: filterExecutionMode,
      executionBroker: filterExecutionBroker
    });
  }, [
    filterAgent,
    filterExecutionBroker,
    filterExecutionMode,
    filterQuery,
    filterStatus,
    filterStrategy,
    filterSymbol,
    filterTimeframe,
    filtersOpen
  ]);

  useEffect(() => {
    persistFilterPresets(filterPresets);
  }, [filterPresets]);

  const probabilityMin = Math.max(1, Math.min(100, Number(probabilityThreshold)));
  const probabilityMaxResolved = Math.max(probabilityMin, Math.min(100, Number(probabilityMax)));

  const signalFilterOptions = useMemo(() => {
    const statusSet = new Set<string>();
    const agentSet = new Set<string>();
    const symbolSet = new Set<string>();
    const timeframeSet = new Set<string>();
    const strategySet = new Set<string>();
    const executionModeSet = new Set<string>();
    const executionBrokerSet = new Set<string>();
    let hasAgentEmpty = false;
    let hasSymbolEmpty = false;
    let hasTimeframeEmpty = false;
    let hasStrategyEmpty = false;
    let hasModeEmpty = false;
    let hasBrokerEmpty = false;

    for (const signal of signals) {
      if (!signal) continue;
      const status = String(signal.status || '').trim().toLowerCase();
      if (status) statusSet.add(status);
      const agent = String(signal.agentName || signal.agentId || '').trim();
      if (agent) agentSet.add(agent);
      else hasAgentEmpty = true;
      const symbol = String(signal.symbol || '').trim();
      if (symbol) symbolSet.add(symbol);
      else hasSymbolEmpty = true;
      const tf = String(signal.timeframe || '').trim();
      if (tf) timeframeSet.add(tf);
      else hasTimeframeEmpty = true;
      const strategy = String(signal.strategyMode || '').trim();
      if (strategy) strategySet.add(strategy);
      else hasStrategyEmpty = true;
      const mode = String(signal.executionMode || '').trim();
      if (mode) executionModeSet.add(mode);
      else hasModeEmpty = true;
      const broker = String(signal.executionBroker || '').trim();
      if (broker) executionBrokerSet.add(broker);
      else hasBrokerEmpty = true;
    }

    const toSorted = (set: Set<string>) => Array.from(set.values()).sort((a, b) => a.localeCompare(b));

    return {
      status: toSorted(statusSet),
      agents: toSorted(agentSet),
      symbols: toSorted(symbolSet),
      timeframes: toSorted(timeframeSet),
      strategies: toSorted(strategySet),
      executionModes: toSorted(executionModeSet),
      executionBrokers: toSorted(executionBrokerSet),
      hasAgentEmpty,
      hasSymbolEmpty,
      hasTimeframeEmpty,
      hasStrategyEmpty,
      hasModeEmpty,
      hasBrokerEmpty
    };
  }, [signals]);

  const filteredSignals = useMemo(() => {
    const q = String(filterQuery || '').trim().toLowerCase();
    const statusFilter = String(filterStatus || 'all').trim().toLowerCase();
    const agentFilter = String(filterAgent || 'all').trim().toLowerCase();
    const symbolFilter = String(filterSymbol || 'all').trim().toLowerCase();
    const timeframeFilter = String(filterTimeframe || 'all').trim().toLowerCase();
    const strategyFilter = String(filterStrategy || 'all').trim().toLowerCase();
    const modeFilter = String(filterExecutionMode || 'all').trim().toLowerCase();
    const brokerFilter = String(filterExecutionBroker || 'all').trim().toLowerCase();
    return signals.filter((signal) => {
      const prob = Number(signal.probability);
      if (!Number.isFinite(prob)) return false;
      if (prob < probabilityMin || prob > probabilityMaxResolved) return false;
      const status = String(signal.status || '').trim().toLowerCase();
      if (statusFilter !== 'all') {
        if (statusFilter === 'none') {
          if (status) return false;
        } else if (status !== statusFilter) {
          return false;
        }
      }
      const agentValue = String(signal.agentName || signal.agentId || '').trim().toLowerCase();
      if (agentFilter !== 'all') {
        if (agentFilter === 'none') {
          if (agentValue) return false;
        } else if (agentValue !== agentFilter) {
          return false;
        }
      }
      const symbolValue = String(signal.symbol || '').trim().toLowerCase();
      if (symbolFilter !== 'all') {
        if (symbolFilter === 'none') {
          if (symbolValue) return false;
        } else if (symbolValue !== symbolFilter) {
          return false;
        }
      }
      const tfValue = String(signal.timeframe || '').trim().toLowerCase();
      if (timeframeFilter !== 'all') {
        if (timeframeFilter === 'none') {
          if (tfValue) return false;
        } else if (tfValue !== timeframeFilter) {
          return false;
        }
      }
      const strategyValue = String(signal.strategyMode || '').trim().toLowerCase();
      if (strategyFilter !== 'all') {
        if (strategyFilter === 'none') {
          if (strategyValue) return false;
        } else if (strategyValue !== strategyFilter) {
          return false;
        }
      }
      const modeValue = String(signal.executionMode || '').trim().toLowerCase();
      if (modeFilter !== 'all') {
        if (modeFilter === 'none') {
          if (modeValue) return false;
        } else if (modeValue !== modeFilter) {
          return false;
        }
      }
      const brokerValue = String(signal.executionBroker || '').trim().toLowerCase();
      if (brokerFilter !== 'all') {
        if (brokerFilter === 'none') {
          if (brokerValue) return false;
        } else if (brokerValue !== brokerFilter) {
          return false;
        }
      }
      if (q) {
        const hay = [
          signal.symbol,
          signal.timeframe,
          signal.agentName,
          signal.agentId,
          signal.reason,
          signal.status,
          signal.executionBroker,
          signal.executionMode,
          signal.strategyMode
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    filterAgent,
    filterExecutionBroker,
    filterExecutionMode,
    filterQuery,
    filterStatus,
    filterStrategy,
    filterSymbol,
    filterTimeframe,
    probabilityMaxResolved,
    probabilityMin,
    signals
  ]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => filteredSignals.some((signal) => signal.id === id)));
  }, [filteredSignals]);

  useEffect(() => {
    const nextQuery = String(query || '').trim();
    if (!nextQuery) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let active = true;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await onSearchSymbols(nextQuery);
        if (active) {
          setSuggestions(Array.isArray(res) ? res : []);
          setShowSuggestions(true);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [onSearchSymbols, query]);

  const sortedSignals = useMemo(() => {
    return [...filteredSignals].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }, [filteredSignals]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredSignals.forEach((signal) => {
      const key = String(signal.status || 'PROPOSED').toUpperCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [filteredSignals]);

  const focusSignal = useCallback((signal: SignalEntry | null | undefined) => {
    if (!signal || !onFocusSignal) return;
    onFocusSignal(signal);
  }, [onFocusSignal]);

  const toggleSelected = useCallback((signal: SignalEntry) => {
    focusSignal(signal);
    setSelectedIds((prev) => (
      prev.includes(signal.id)
        ? prev.filter((entry) => entry !== signal.id)
        : [...prev, signal.id]
    ));
  }, [focusSignal]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(sortedSignals.map((signal) => signal.id));
  }, [sortedSignals]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilterQuery('');
    setFilterStatus('all');
    setFilterAgent('all');
    setFilterSymbol('all');
    setFilterTimeframe('all');
    setFilterStrategy('all');
    setFilterExecutionMode('all');
    setFilterExecutionBroker('all');
  }, []);

  const buildFilterSnapshot = useCallback(() => ({
    query: filterQuery,
    status: filterStatus,
    agent: filterAgent,
    symbol: filterSymbol,
    timeframe: filterTimeframe,
    strategy: filterStrategy,
    executionMode: filterExecutionMode,
    executionBroker: filterExecutionBroker
  }), [
    filterAgent,
    filterExecutionBroker,
    filterExecutionMode,
    filterQuery,
    filterStatus,
    filterStrategy,
    filterSymbol,
    filterTimeframe
  ]);

  const applyFilterSnapshot = useCallback((filters: Partial<SignalFilterState> | null) => {
    if (!filters) return;
    if (filters.query != null) setFilterQuery(String(filters.query));
    if (filters.status != null) setFilterStatus(String(filters.status));
    if (filters.agent != null) setFilterAgent(String(filters.agent));
    if (filters.symbol != null) setFilterSymbol(String(filters.symbol));
    if (filters.timeframe != null) setFilterTimeframe(String(filters.timeframe));
    if (filters.strategy != null) setFilterStrategy(String(filters.strategy));
    if (filters.executionMode != null) setFilterExecutionMode(String(filters.executionMode));
    if (filters.executionBroker != null) setFilterExecutionBroker(String(filters.executionBroker));
  }, []);

  const handlePresetSelect = useCallback((id: string) => {
    setActivePresetId(id);
    const preset = filterPresets.find((item) => item.id === id);
    if (!preset) return;
    setPresetName(preset.name);
    applyFilterSnapshot(preset.filters);
  }, [applyFilterSnapshot, filterPresets]);

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim() || `Preset ${filterPresets.length + 1}`;
    const snapshot = buildFilterSnapshot();
    const next: SignalFilterPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      filters: snapshot
    };
    setFilterPresets((prev) => [next, ...prev]);
    setActivePresetId(next.id);
    setPresetName(name);
  }, [buildFilterSnapshot, filterPresets.length, presetName]);

  const handleUpdatePreset = useCallback(() => {
    if (!activePresetId) return;
    const name = presetName.trim();
    const snapshot = buildFilterSnapshot();
    setFilterPresets((prev) => prev.map((item) => {
      if (item.id !== activePresetId) return item;
      return {
        ...item,
        name: name || item.name,
        filters: snapshot
      };
    }));
  }, [activePresetId, buildFilterSnapshot, presetName]);

  const handleDeletePreset = useCallback(() => {
    if (!activePresetId) return;
    setFilterPresets((prev) => prev.filter((item) => item.id !== activePresetId));
    setActivePresetId('');
    setPresetName('');
  }, [activePresetId]);

  const isExecutableStatus = useCallback((status: SignalEntryStatus) => {
    return !['SUBMITTING', 'PENDING', 'EXECUTED', 'REJECTED', 'EXPIRED', 'WIN', 'LOSS', 'FAILED'].includes(status);
  }, []);

  const isRejectableStatus = useCallback((status: SignalEntryStatus) => {
    return !['SUBMITTING', 'PENDING', 'EXECUTED', 'REJECTED', 'EXPIRED', 'WIN', 'LOSS', 'FAILED'].includes(status);
  }, []);

  const bulkTargets = useMemo(() => {
    const byId = new Map(filteredSignals.map((signal) => [signal.id, signal]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as SignalEntry[];
  }, [filteredSignals, selectedIds]);

  const handleBulkExecute = useCallback(() => {
    bulkTargets.forEach((signal) => {
      if (isExecutableStatus(signal.status)) {
        onExecuteSignal(signal.id);
      }
    });
  }, [bulkTargets, isExecutableStatus, onExecuteSignal]);

  const handleBulkReject = useCallback(() => {
    bulkTargets.forEach((signal) => {
      if (isRejectableStatus(signal.status)) {
        onRejectSignal(signal.id);
      }
    });
  }, [bulkTargets, isRejectableStatus, onRejectSignal]);

  const snapshotStatusList = useMemo(() => {
    if (snapshotStatus) {
      return [
        {
          symbol: snapshotStatus.symbol || symbols[0] || null,
          status: snapshotStatus
        }
      ];
    }
    return [];
  }, [snapshotStatus, symbols]);

  const formatSnapshotStatusLabel = useCallback((status: SignalSnapshotStatus | null) => {
    return formatUnifiedSnapshotStatusLabel(status, {
      readyLabel: 'Native chart snapshot ready',
      missingLabel: 'No snapshot yet.',
      warmingLabel: 'Warming up...'
    });
  }, []);

  const formatSnapshotFrames = useCallback((status: SignalSnapshotStatus | null) => {
    const frames = status?.frames || [];
    if (frames.length === 0) return '';
    return frames.map((f) => `${f.tf} ${f.barsCount}`).join(' | ');
  }, []);

  const formatSnapshotIncomplete = useCallback((status: SignalSnapshotStatus | null) => {
    const missing = Array.isArray(status?.missingFrames) ? status?.missingFrames ?? [] : [];
    const short = Array.isArray(status?.shortFrames) ? status?.shortFrames ?? [] : [];
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`Missing: ${missing.map(formatTimeframe).filter(Boolean).join(', ')}`);
    }
    if (short.length > 0) {
      parts.push(`Short: ${short.map((entry) => `${formatTimeframe(entry.tf)} ${entry.barsCount}/${entry.minBars}`).join(', ')}`);
    }
    return parts.join(' | ');
  }, []);

  const handleAddSymbol = (value?: string) => {
    const raw = String(value ?? query ?? '').trim();
    if (!raw) return;
    const parts = raw
      .split(/[,|\n]+/)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    parts.forEach((part) => onAddSymbol(part));
    setQuery('');
    setShowSuggestions(false);
  };

  const handleSelectSuggestion = (entry: SymbolSuggestion) => {
    const next = String(entry.symbol || '').trim();
    if (!next) return;
    handleAddSymbol(next);
  };

  const handleSymbolSubmit = () => {
    handleAddSymbol();
  };

  const handleRunScan = useCallback(() => {
    const gate = requireBridge('signal.scan');
    if (!gate.ok) {
      setBridgeError(gate.error);
      return;
    }
    setBridgeError(null);
    onRunScan();
  }, [onRunScan]);

  const updateSession = (id: SignalSessionWindow['id'], patch: Partial<SignalSessionWindow>) => {
    const next = sessions.map((session) =>
      session.id === id ? { ...session, ...patch } : session
    );
    onSessionsChange(next);
  };

  const signalCount = sortedSignals.length;
  const autoPilotLabel = autoPilotEnabled
    ? autoPilotKill
      ? 'KILL'
      : autoPilotMode
        ? `ON (${autoPilotMode})`
        : 'ON'
    : 'OFF';
  return (
    <div className="flex flex-col h-full min-h-0 bg-[#060606]">
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Signal Panel</div>
            <div className="text-xs text-gray-400">Agent-driven signals with TradeLocker tickets</div>
            {crossPanelContext?.symbol ? (
              <div className="text-[11px] text-gray-500">
                Context: {crossPanelContext.symbol}{crossPanelContext.timeframe ? ` ${String(crossPanelContext.timeframe).toUpperCase()}` : ''}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full border ${autoPilotEnabled ? 'border-green-500/40 text-green-200' : 'border-white/10 text-gray-400'}`}>
              AutoPilot {autoPilotLabel}
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
            >
              {settingsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && !signalsExpanded && (
        <div className="px-4 py-3 border-b border-white/10 space-y-3 text-xs">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-400">Symbols</label>
              <div className="relative mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSymbolSubmit();
                      }
                    }}
                    placeholder="Search broker symbols..."
                    className="w-full px-3 py-2 rounded border border-white/10 bg-black/40 text-sm text-white focus:outline-none focus:border-cyan-400/60"
                  />
                  {searching && (
                    <div className="absolute right-2 top-2 text-gray-500">
                      <Activity size={14} />
                    </div>
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded border border-white/10 bg-[#0b0b0b] shadow-lg max-h-48 overflow-auto">
                      {suggestions.map((entry) => (
                        <button
                          type="button"
                          key={`${entry.symbol}-${entry.label || ''}`}
                          onClick={() => handleSelectSuggestion(entry)}
                          className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between gap-3"
                        >
                          <span className="text-sm text-white">{entry.symbol}</span>
                          {entry.label && <span className="text-[11px] text-gray-400">{entry.label}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSymbolSubmit()}
                  className="px-2.5 py-2 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
                >
                  <Plus size={14} />
                </button>
              </div>
              {symbols.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {symbols.map((sym) => (
                    <span key={sym} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/10 text-[11px] text-gray-300 bg-white/5">
                      {sym}
                      <button type="button" onClick={() => onRemoveSymbol(sym)} className="text-gray-500 hover:text-white">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Timeframes</label>
                <span className="text-[11px] text-gray-500">
                  {timeframes.map(formatTimeframe).join('/') || 'none'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {FRAME_OPTIONS.map((tf) => {
                  const active = timeframes.includes(tf.value);
                  return (
                    <button
                      type="button"
                      key={tf.value}
                      onClick={() => onTimeframesChange(toggleList(timeframes, tf.value))}
                      className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                    >
                      {tf.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Session Windows</label>
                <div className="mt-2 space-y-2">
                  {sessions.filter((session) => session.id !== 'custom').map((session) => (
                    <div key={session.id} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => updateSession(session.id, { enabled: !session.enabled })}
                        className={`px-2 py-1 rounded border text-[11px] ${session.enabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400'}`}
                      >
                        {session.label}
                      </button>
                      <span className="text-[11px] text-gray-500">{session.startHour}:00 - {session.endHour}:00</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Custom Session</label>
                <div className="mt-2 space-y-2">
                  {sessions.filter((s) => s.id === 'custom').map((session) => (
                    <div key={session.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateSession('custom', { enabled: !session.enabled })}
                          className={`px-2 py-1 rounded border text-[11px] ${session.enabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400'}`}
                        >
                          Custom
                        </button>
                        <span className="text-[11px] text-gray-500">Local time</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={session.startHour}
                          onChange={(e) => updateSession('custom', { startHour: clampNumber(e.target.value, 0, 23) })}
                          className="w-16 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                        />
                        <span className="text-gray-500">to</span>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={session.endHour}
                          onChange={(e) => updateSession('custom', { endHour: clampNumber(e.target.value, 0, 23) })}
                          className="w-16 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Strategy Modes</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(['scalp', 'day', 'swing'] as SignalStrategyMode[]).map((mode) => {
                    const active = strategyModes.includes(mode);
                    return (
                      <button
                        type="button"
                        key={mode}
                        onClick={() => onStrategyModesChange(toggleList(strategyModes, mode))}
                        className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-purple-400/60 text-purple-100 bg-purple-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Auto Refresh</label>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => onAutoRefreshChange(!autoRefreshEnabled)}
                    className={`px-2 py-1 rounded border text-[11px] ${autoRefreshEnabled ? 'border-sky-400/60 text-sky-100 bg-sky-500/10' : 'border-white/10 text-gray-400'}`}
                  >
                    {autoRefreshEnabled ? 'ON' : 'OFF'}
                  </button>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={Math.max(5, Math.floor(refreshIntervalMs / 1000))}
                    onChange={(e) => onRefreshIntervalChange(clampNumber(e.target.value, 5, 600) * 1000)}
                    className="w-20 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  />
                  <span className="text-[11px] text-gray-500">sec</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Auto Execute</label>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => onAutoExecuteChange(!autoExecuteEnabled)}
                    className={`px-2 py-1 rounded border text-[11px] ${autoExecuteEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400'}`}
                  >
                    {autoExecuteEnabled ? 'ENABLED' : 'OFF'}
                  </button>
                  <span className="text-[11px] text-gray-500">Requires AutoPilot ON</span>
                </div>
                <div className="mt-3">
                  <label className="text-[11px] uppercase tracking-wider text-gray-400">Execution Target</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {([
                      { value: 'auto', label: 'Auto' },
                      { value: 'mt5', label: 'MT5' },
                      { value: 'tradelocker', label: 'TradeLocker' }
                    ] as const).map((option) => {
                      const active = executionTarget === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onExecutionTargetChange(option.value)}
                          className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">Auto uses broker link defaults.</div>
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Probability Range</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">Min</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={probabilityThreshold}
                      onChange={(e) => onProbabilityThresholdChange(clampNumber(e.target.value, 1, 100))}
                      className="w-16 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                    />
                    <span className="text-[11px] text-gray-500">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-500">Max</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={probabilityMax}
                      onChange={(e) => onProbabilityMaxChange(clampNumber(e.target.value, 1, 100))}
                      className="w-16 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                    />
                    <span className="text-[11px] text-gray-500">%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Signal Memory</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {([
                    { value: 'inject', label: 'Inject' },
                    { value: 'tool', label: 'Tools' },
                    { value: 'both', label: 'Both' }
                  ] as const).map((option) => {
                    const active = resolvedMemoryMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onMemoryModeChange(option.value)}
                        className={`px-2 py-1 rounded border text-[11px] ${active ? 'border-amber-400/60 text-amber-100 bg-amber-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Memory Limit</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={memoryLimit}
                    onChange={(e) => onMemoryLimitChange(clampNumber(e.target.value, 2, 50))}
                    className="w-20 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  />
                  <span className="text-[11px] text-gray-500">items</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Pattern Context</label>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => onPatternContextChange(!patternContextEnabled)}
                    className={`px-2.5 py-1 rounded border text-[11px] ${patternContextEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
                  >
                    {patternContextEnabled ? 'On' : 'Off'}
                  </button>
                  <span className="text-[11px] text-gray-500">Include chart patterns in signals</span>
                </div>
              </div>
              <div />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-gray-400">Signal Expiry</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={expiryMinutes}
                    onChange={(e) => onExpiryMinutesChange(clampNumber(e.target.value, 5, 1440))}
                    className="w-20 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  />
                  <span className="text-[11px] text-gray-500">min</span>
                </div>
              </div>
              <div className="flex items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={handleRunScan}
                  disabled={symbols.length === 0 || isRunning}
                  className={`px-3 py-2 rounded border text-xs flex items-center gap-2 ${symbols.length > 0 && !isRunning ? 'border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/10' : 'border-white/10 text-gray-500 cursor-not-allowed'}`}
                >
                  <RefreshCw size={14} />
                  {symbols.length > 1 ? `Run Scan (${symbols.length})` : 'Run Scan'}
                </button>
                <button
                  type="button"
                  onClick={onClearSignals}
                  className="px-3 py-2 rounded border border-white/10 text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!signalsExpanded && (
        <div className="px-4 py-3 border-b border-white/10 text-xs">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">Snapshot Status</div>
              {snapshotStatusList.length > 0 ? (
                <div className="space-y-2">
                  {snapshotStatusList.map((entry) => {
                    const normalized = classifyUnifiedSnapshotStatus(entry.status);
                    const ok = normalized?.ok === true;
                    const framesLine = formatSnapshotFrames(entry.status);
                    const incompleteLine = formatSnapshotIncomplete(entry.status);
                    return (
                      <div key={entry.symbol || 'snapshot'} className="space-y-1">
                        <div className={`text-sm ${ok ? 'text-emerald-200' : 'text-amber-300'}`}>
                          {entry.symbol ? `${entry.symbol}: ` : ''}
                          {formatSnapshotStatusLabel(entry.status)}
                        </div>
                        {framesLine && (
                          <div className="text-[11px] text-gray-500">
                            Frames: {framesLine}
                          </div>
                        )}
                        {incompleteLine && (
                          <div className="text-[11px] text-amber-300">
                            Incomplete: {incompleteLine}
                          </div>
                        )}
                        {snapshotScopeMismatch?.signalScopeKey && snapshotScopeMismatch?.panelScopeKey ? (
                          <div className="text-[11px] text-cyan-300">
                            Scope mismatch: Signal snapshot scope differs from Snapshot panel scope.
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-gray-400">No snapshot yet.</div>
              )}
            </div>
            <div className="text-[11px] text-gray-500 text-right space-y-1">
              <div>Last scan: {lastRunAtMs ? formatAge(lastRunAtMs) : '--'}</div>
              <div>Last attempt: {lastAttemptAtMs ? formatAge(lastAttemptAtMs) : '--'}</div>
              {signalSla && (
                <div className={signalSla.state === 'missed' ? 'text-rose-300' : signalSla.state === 'delayed' ? 'text-amber-300' : 'text-emerald-300'}>
                  SLA: {String(signalSla.state || 'idle').replace('_', ' ')}
                  {signalSla.nextDueAt ? ` | next ${formatDue(signalSla.nextDueAt)}` : ''}
                </div>
              )}
              {signalConnectivityIssue ? (
                <div className="text-amber-300">
                  Connectivity: {String(signalConnectivityIssue.source || 'catalog').toUpperCase()} degraded
                  {signalConnectivityIssue.retryAfterMs
                    ? ` (retry ${formatDuration(signalConnectivityIssue.retryAfterMs) || formatDue(Date.now() + Number(signalConnectivityIssue.retryAfterMs || 0))})`
                    : signalConnectivityIssue.blockedUntilMs
                      ? ` (retry ${formatDue(signalConnectivityIssue.blockedUntilMs)})`
                      : ''}
                </div>
              ) : null}
              {lastSuccessfulScanAtMs && <div>Last successful: {formatAge(lastSuccessfulScanAtMs)}</div>}
              {openCircuitSources.length > 0 && <div className="text-amber-300">Circuit open: {openCircuitSources.join(', ')}</div>}
              {bridgeError && <div className="text-red-300">{bridgeError}</div>}
              {lastError && <div className="text-rose-300">Last error: {lastError}</div>}
              {lastParseError && (
                <div className="text-amber-300">
                  Parse issue: {lastParseError}{lastParseAtMs ? ` (${formatAge(lastParseAtMs)})` : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-b border-white/10 text-[11px] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-gray-400">
          {Object.keys(statusCounts).length === 0 ? (
            <span>No signals</span>
          ) : (
            Object.entries(statusCounts).map(([key, count]) => (
              <span key={key} className="px-2 py-0.5 rounded-full border border-white/10">
                {key} {count}
              </span>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setSignalsExpanded((prev) => {
                const next = !prev;
                if (next) setSettingsOpen(false);
                return next;
              })
            }
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
          >
            {signalsExpanded ? (
              <span className="flex items-center gap-1">
                <ChevronDown size={12} />
                Collapse
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <ChevronUp size={12} />
                Expand
              </span>
            )}
          </button>
          <span className="text-gray-500">{selectedIds.length} selected</span>
          <button
            type="button"
            onClick={handleSelectAll}
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleClearSelection}
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleBulkExecute}
            disabled={bulkTargets.length === 0}
            className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40"
          >
            Execute Selected
          </button>
          <button
            type="button"
            onClick={handleBulkReject}
            disabled={bulkTargets.length === 0}
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
          >
            Reject Selected
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/10 text-[11px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-500 uppercase tracking-wider">Signal Filters</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
            >
              {filtersOpen ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
            >
              Clear Filters
            </button>
          </div>
        </div>
        {filtersOpen && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto_auto_auto] gap-2 text-xs">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name..."
                className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
              />
              <select
                value={activePresetId}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
              >
                <option value="">Select preset</option>
                {filterPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSavePreset}
                className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/10"
              >
                Save New
              </button>
              <button
                type="button"
                onClick={handleUpdatePreset}
                disabled={!activePresetId}
                className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
              >
                Update
              </button>
              <button
                type="button"
                onClick={handleDeletePreset}
                disabled={!activePresetId}
                className="px-2 py-1 rounded border border-rose-400/60 text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
              >
                Delete
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search signals..."
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            >
              <option value="all">All Status</option>
              {signalFilterOptions.status.map((status) => (
                <option key={status} value={status}>{status.toUpperCase()}</option>
              ))}
              {signalFilterOptions.status.length === 0 && <option value="none">No Status</option>}
            </select>
            <select
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            >
              <option value="all">All Symbols</option>
              {signalFilterOptions.symbols.map((symbol) => (
                <option key={symbol} value={symbol}>{symbol}</option>
              ))}
              {signalFilterOptions.hasSymbolEmpty && <option value="none">No Symbol</option>}
            </select>
            <select
              value={filterTimeframe}
              onChange={(e) => setFilterTimeframe(e.target.value)}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            >
              <option value="all">All Timeframes</option>
              {signalFilterOptions.timeframes.map((tf) => (
                <option key={tf} value={tf}>{formatTimeframe(tf)}</option>
              ))}
              {signalFilterOptions.hasTimeframeEmpty && <option value="none">No Timeframe</option>}
            </select>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            >
              <option value="all">All Agents</option>
              {signalFilterOptions.agents.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
              {signalFilterOptions.hasAgentEmpty && <option value="none">No Agent</option>}
            </select>
            <select
              value={filterStrategy}
              onChange={(e) => setFilterStrategy(e.target.value)}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            >
              <option value="all">All Strategies</option>
              {signalFilterOptions.strategies.map((strategy) => (
                <option key={strategy} value={strategy}>{strategy}</option>
              ))}
              {signalFilterOptions.hasStrategyEmpty && <option value="none">No Strategy</option>}
            </select>
            <select
              value={filterExecutionMode}
              onChange={(e) => setFilterExecutionMode(e.target.value)}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            >
              <option value="all">All Modes</option>
              {signalFilterOptions.executionModes.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
              {signalFilterOptions.hasModeEmpty && <option value="none">No Mode</option>}
            </select>
            <select
              value={filterExecutionBroker}
              onChange={(e) => setFilterExecutionBroker(e.target.value)}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            >
              <option value="all">All Brokers</option>
              {signalFilterOptions.executionBrokers.map((broker) => (
                <option key={broker} value={broker}>{broker}</option>
              ))}
              {signalFilterOptions.hasBrokerEmpty && <option value="none">No Broker</option>}
            </select>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {signalCount === 0 ? (
          <div className="border border-dashed border-white/10 rounded-lg p-4 text-sm text-gray-500">
            No signals yet. Select symbols and run a scan.
          </div>
        ) : (
          sortedSignals.map((signal) => {
            const isExecuted = signal.status === 'EXECUTED' || signal.status === 'WIN' || signal.status === 'LOSS';
            const isInFlight = signal.status === 'SUBMITTING' || signal.status === 'PENDING';
            const isDone = signal.status === 'REJECTED' || signal.status === 'EXPIRED' || signal.status === 'WIN' || signal.status === 'LOSS';
            const canCancel =
              signal.status === 'PENDING' &&
              signal.executionBroker === 'tradelocker' &&
              !!signal.executionOrderId;
            const simOutcome = simulatedOutcomes ? simulatedOutcomes[signal.id] : null;
            const showSimOutcome = !!simOutcome && !isExecuted && !isInFlight;
            const simDurationLabel = simOutcome?.durationMs != null ? formatDuration(simOutcome.durationMs) : '';
            const simBarsLabel = simOutcome?.barsToOutcome != null ? `${simOutcome.barsToOutcome} bars` : '';
            const simTfLabel = simOutcome?.timeframe ? formatTimeframe(simOutcome.timeframe) : '';
            const simMeta = [simTfLabel, simBarsLabel, simDurationLabel].filter(Boolean).join(' • ');
            const simColor =
              simOutcome?.outcome === 'WIN'
                ? 'text-emerald-300'
                : simOutcome?.outcome === 'LOSS'
                  ? 'text-red-300'
                  : 'text-amber-300';
            const newsLabel = getNewsImpactLabel(signal.newsSnapshot);
            const toneLabel = getNewsToneLabel(signal.newsSnapshot);
            const trumpNews = !!signal.newsSnapshot?.trumpNews;
            const statusColor =
              signal.status === 'WIN'
                ? 'text-emerald-300'
                : signal.status === 'LOSS'
                  ? 'text-red-300'
                  : signal.status === 'EXECUTED'
                    ? 'text-sky-300'
                    : signal.status === 'PENDING'
                      ? 'text-amber-300'
                      : signal.status === 'SUBMITTING'
                        ? 'text-cyan-200'
                    : signal.status === 'REJECTED'
                      ? 'text-gray-400'
                      : signal.status === 'EXPIRED'
                        ? 'text-amber-300'
                        : signal.status === 'FAILED'
                          ? 'text-red-300'
                          : 'text-cyan-200';
            const quantTelemetry = signal.quantTelemetry || null;
            const quantStatus = String(quantTelemetry?.status || '').trim().toLowerCase();
            const quantStatusLabel =
              quantStatus === 'block'
                ? 'BLOCK'
                : quantStatus === 'warn'
                  ? 'WARN'
                  : quantStatus === 'pass'
                    ? 'PASS'
                    : '';
            const quantStatusClass =
              quantStatus === 'block'
                ? 'border-rose-400/50 text-rose-200'
                : quantStatus === 'warn'
                  ? 'border-amber-400/50 text-amber-200'
                  : quantStatus === 'pass'
                    ? 'border-emerald-400/40 text-emerald-200'
                    : 'border-white/10 text-gray-400';
            const quantPrimaryReason = (Array.isArray(quantTelemetry?.blockReasons) && quantTelemetry?.blockReasons?.length > 0)
              ? String(quantTelemetry?.blockReasons?.[0] || '')
              : (Array.isArray(quantTelemetry?.warnReasons) && quantTelemetry?.warnReasons?.length > 0)
                ? String(quantTelemetry?.warnReasons?.[0] || '')
                : '';
            return (
              <VirtualItem key={signal.id} minHeight={220} className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-white">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(signal.id)}
                    onChange={() => toggleSelected(signal)}
                    className="accent-emerald-400"
                  />
                  <span>
                    {signal.action} {signal.symbol}
                    {signal.timeframe ? ` • ${signal.timeframe}` : ''}
                  </span>
                </label>
                  <div className={`text-xs font-semibold ${statusColor}`}>{signal.status}</div>
                </div>
                <div className="text-xs text-gray-400 flex flex-wrap gap-3">
                  <span>Entry {signal.entryPrice}</span>
                  <span>SL {signal.stopLoss}</span>
                  <span>TP {signal.takeProfit}</span>
                  <span>Prob {Math.round(signal.probability)}%</span>
                  {signal.strategyMode && <span>Mode {signal.strategyMode}</span>}
                </div>
                <TagPills
                  tags={[
                    signal.timeframe ? formatTimeframe(signal.timeframe) : null,
                    signal.strategyMode || null,
                    signal.agentName || null,
                    signal.executionBroker || null,
                    signal.executionMode || null
                  ]}
                  className="text-[10px]"
                  max={5}
                />
                {(newsLabel || toneLabel || trumpNews) && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {newsLabel && (
                      <span className={`px-2 py-0.5 rounded border ${getNewsImpactClass(signal.newsSnapshot)}`}>
                        News {newsLabel}
                      </span>
                    )}
                    {toneLabel && (
                      <span className={`px-2 py-0.5 rounded border ${getNewsToneClass(signal.newsSnapshot)}`}>
                        Tone {toneLabel}
                      </span>
                    )}
                    {trumpNews && (
                      <span className="px-2 py-0.5 rounded border border-amber-400/40 text-amber-200">
                        Trump News
                      </span>
                    )}
                  </div>
                )}
                {quantTelemetry && quantStatusLabel && (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`px-2 py-0.5 rounded border ${quantStatusClass}`}>
                        Q {quantStatusLabel}
                      </span>
                      {quantTelemetry.regimeLabel && (
                        <span className="px-2 py-0.5 rounded border border-white/10 text-gray-300">
                          Regime {String(quantTelemetry.regimeLabel).toUpperCase()}
                        </span>
                      )}
                      {quantTelemetry.ensembleAction && (
                        <span className="px-2 py-0.5 rounded border border-white/10 text-gray-300">
                          Ens {String(quantTelemetry.ensembleAction).toUpperCase()}
                          {Number.isFinite(Number(quantTelemetry.ensembleScore))
                            ? ` ${Number(quantTelemetry.ensembleScore).toFixed(2)}`
                            : ''}
                        </span>
                      )}
                      {quantTelemetry.metaDecision && (
                        <span className="px-2 py-0.5 rounded border border-white/10 text-gray-300">
                          Meta {String(quantTelemetry.metaDecision).toUpperCase()}
                          {Number.isFinite(Number(quantTelemetry.metaConfidence))
                            ? ` ${Math.round(Number(quantTelemetry.metaConfidence) * 100)}%`
                            : ''}
                        </span>
                      )}
                      {quantTelemetry.portfolioAllowed != null && (
                        <span className={`px-2 py-0.5 rounded border ${quantTelemetry.portfolioAllowed ? 'border-emerald-400/30 text-emerald-200' : 'border-rose-400/40 text-rose-200'}`}>
                          Risk {quantTelemetry.portfolioAllowed ? 'OK' : 'BLOCK'}
                        </span>
                      )}
                    </div>
                    {quantPrimaryReason && (
                      <div
                        className={`text-[11px] ${quantStatus === 'block' ? 'text-rose-300' : 'text-amber-300'}`}
                        title={quantPrimaryReason}
                      >
                        {quantStatus === 'block' ? 'Blocked: ' : 'Warning: '}
                        {quantPrimaryReason}
                      </div>
                    )}
                  </div>
                )}
                {signal.reason && (
                  <div className="text-xs text-gray-500">{signal.reason}</div>
                )}
                {(signal.executionOrderId || signal.executionPositionId || signal.executionOrderStatus || signal.executionBroker) && (
                  <div className="text-[11px] text-gray-500 flex flex-wrap gap-3">
                    {signal.executionBroker && <span>Broker {signal.executionBroker}</span>}
                    {signal.executionOrderId && <span>Order #{signal.executionOrderId}</span>}
                    {signal.executionPositionId && <span>Pos #{signal.executionPositionId}</span>}
                    {signal.executionOrderStatus && <span>Status {signal.executionOrderStatus}</span>}
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>{signal.agentName ? `Agent ${signal.agentName}` : 'Agent team'}</span>
                  <span>Created {formatAge(signal.createdAtMs)}</span>
                </div>
                {signal.executionError && (
                  <div className="text-xs text-red-300">{signal.executionError}</div>
                )}
                {showSimOutcome && simOutcome && (
                  <div className={`text-xs ${simColor}`}>
                    Sim outcome: {simOutcome.outcome}
                    {simMeta ? ` • ${simMeta}` : ''}
                    {simOutcome.resolvedAtMs ? ` • ${formatAge(simOutcome.resolvedAtMs)}` : ''}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {!isExecuted && !isDone && !isInFlight && (
                    <button
                      type="button"
                      onClick={() => {
                        focusSignal(signal);
                        onExecuteSignal(signal.id);
                      }}
                      className="px-3 py-1.5 rounded border border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/10 text-xs inline-flex items-center gap-1"
                    >
                      <CheckCircle2 size={14} />
                      Execute
                    </button>
                  )}
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => {
                        focusSignal(signal);
                        onCancelSignalOrder(signal.id);
                      }}
                      className="px-3 py-1.5 rounded border border-amber-400/60 text-amber-100 hover:bg-amber-500/10 text-xs inline-flex items-center gap-1"
                    >
                      <XCircle size={14} />
                      Cancel Pending
                    </button>
                  )}
                  {!isDone && !isInFlight && (
                    <button
                      type="button"
                      onClick={() => {
                        focusSignal(signal);
                        onRejectSignal(signal.id);
                      }}
                      className="px-3 py-1.5 rounded border border-white/10 text-gray-400 hover:text-white text-xs inline-flex items-center gap-1"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  )}
                  {onOpenAcademyCase && (
                    <button
                      type="button"
                      onClick={() => {
                        focusSignal(signal);
                        onOpenAcademyCase(signal.id);
                      }}
                      className="px-3 py-1.5 rounded border border-white/10 text-gray-400 hover:text-white text-xs inline-flex items-center gap-1"
                    >
                      <Activity size={14} />
                      Academy
                    </button>
                  )}
                  {onOpenChart && (
                    <button
                      type="button"
                      onClick={() => {
                        focusSignal(signal);
                        onOpenChart(signal.symbol, signal.timeframe || null);
                      }}
                      className="px-2 py-1.5 rounded border border-white/10 text-gray-300 hover:text-white text-xs"
                    >
                      Chart
                    </button>
                  )}
                  {(onOpenMt5 || onPrefillMt5Ticket) && (
                    <button
                      type="button"
                      onClick={() => {
                        focusSignal(signal);
                        if (onPrefillMt5Ticket) {
                          onPrefillMt5Ticket(signal);
                          return;
                        }
                        onOpenMt5?.(signal.symbol, signal.timeframe || null);
                      }}
                      className="px-2 py-1.5 rounded border border-white/10 text-gray-300 hover:text-white text-xs"
                    >
                      MT5
                    </button>
                  )}
                  {(onOpenTradeLocker || onPrefillTradeLockerTicket) && (
                    <button
                      type="button"
                      onClick={() => {
                        focusSignal(signal);
                        if (onPrefillTradeLockerTicket) {
                          onPrefillTradeLockerTicket(signal);
                          return;
                        }
                        onOpenTradeLocker?.(signal.symbol, signal.timeframe || null);
                      }}
                      className="px-2 py-1.5 rounded border border-white/10 text-gray-300 hover:text-white text-xs"
                    >
                      Locker
                    </button>
                  )}
                  {isInFlight && (
                    <span className="text-[11px] text-cyan-200">Submitting...</span>
                  )}
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    {signal.executionSource === 'autopilot' ? <Shield size={12} /> : <Play size={12} />}
                    {signal.executionSource ? signal.executionSource.toUpperCase() : 'manual'}
                  </span>
                </div>
              </VirtualItem>
            );
          })
        )}
      </div>
    </div>
  );
};

export default React.memo(SignalInterface);
