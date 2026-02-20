import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, RefreshCw } from 'lucide-react';
import {
  AcademyCase,
  AcademyLesson,
  AcademySymbolLearning,
  CrossPanelContext,
  LearningCaseAction,
  LearningPathSummary,
  OutcomeFeedConsistencyState,
  OutcomeFeedCursor,
  PanelFreshnessState
} from '../types';
import TagPills from './TagPills';
import { usePersistenceHealth } from '../hooks/usePersistenceHealth';
import LearningGraphWorkbench from './academy/LearningGraphWorkbench';

interface AcademyInterfaceProps {
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings: AcademySymbolLearning[];
  selectedCaseId?: string | null;
  onSelectCase: (id: string | null) => void;
  autoApplyEnabled: boolean;
  onToggleAutoApply: (next: boolean) => void;
  autoExportEnabled: boolean;
  onToggleAutoExport: (next: boolean) => void;
  lessonLimit: number;
  onLessonLimitChange: (next: number) => void;
  onRefresh: () => void;
  onExport: () => void;
  onOpenChart?: (symbol: string, timeframe?: string | null) => void;
  onOpenMt5?: (symbol: string, timeframe?: string | null) => void;
  onOpenTradeLocker?: (symbol: string, timeframe?: string | null) => void;
  onReplayTrade?: (payload: {
    symbol: string;
    timeframe?: string | null;
    entryPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    closePrice?: number | null;
    action?: string | null;
    ledgerId?: string | null;
    noteId?: string | null;
  }) => void;
  crossPanelContext?: CrossPanelContext | null;
  outcomeFeedCursor?: OutcomeFeedCursor | null;
  outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;
  panelFreshness?: PanelFreshnessState | null;
  focusRequest?: { requestId: string; signalId?: string | null; caseId?: string | null; forceVisible?: boolean } | null;
  onFocusRequestConsumed?: (requestId: string, result: 'matched' | 'materialized' | 'missing') => void;
  onApplyLesson?: (lessonId: string, targetAgentKey?: string | null) => void;
  onSimulateLesson?: (lessonId: string) => void;
  onPinLesson?: (lessonId: string, nextPinned: boolean) => void;
  onSetLessonLifecycle?: (lessonId: string, next: 'candidate' | 'core' | 'deprecated') => void;
  onLearningGraphBuilt?: (payload: {
    scopeKey: string;
    lens: 'hierarchy' | 'performance' | 'recency' | 'failure_mode' | 'strategy_broker';
    nodeCount: number;
    edgeCount: number;
    buildMs: number;
    conflictCount: number;
    hotNodeCount: number;
  }) => void;
  onLearningGraphLensChanged?: (payload: {
    lens: 'hierarchy' | 'performance' | 'recency' | 'failure_mode' | 'strategy_broker';
    scopeKey: string;
  }) => void;
  onLearningPathGenerated?: (payload: {
    goalText: string;
    stepCount: number;
    highlightedNodeCount: number;
    highlightedEdgeCount: number;
    scopeKey: string;
    summary?: LearningPathSummary | null;
    pathBuildMs?: number;
    pathCoverage?: number;
  }) => void;
  onLearningGraphCaseAction?: (payload: LearningCaseAction & {
    scopeKey?: string | null;
    nodeId?: string | null;
  }) => void;
  onLearningGraphPathZoom?: (payload: {
    scopeKey: string;
    highlightedNodeCount: number;
    highlightedEdgeCount: number;
    goalText?: string | null;
  }) => void;
  learningGraphFeatureFlags?: {
    learningGraphV22Inspector?: boolean;
    learningGraphV22PathSummary?: boolean;
    learningGraphV22LifecycleActions?: boolean;
    learningGraphV23Timeline?: boolean;
    learningGraphV23Diff?: boolean;
    learningGraphV23ConflictResolver?: boolean;
    learningGraphV23PerfWorker?: boolean;
    learningGraphV23EdgeBundling?: boolean;
  } | null;
}

const PANEL_STORAGE_KEY = 'glass_academy_panel_ui_v1';
const CASE_PRESET_KEY = 'glass_academy_case_filter_presets_v1';
const LESSON_PRESET_KEY = 'glass_academy_lesson_filter_presets_v1';

type AcademyPanelState = {
  activeTab?: 'cases' | 'learning_graph';
  query?: string;
  outcomeFilter?: string;
  selectedSymbol?: string | null;
  learningGraphAgentId?: string;
  learningGraphExpandedIds?: string[];
  filterSymbol?: string;
  filterTimeframe?: string;
  filterAgent?: string;
  filterStrategy?: string;
  filterBroker?: string;
  filterExecutionMode?: string;
  lessonQuery?: string;
  lessonSymbol?: string;
  lessonTimeframe?: string;
  lessonStrategy?: string;
  lessonAgent?: string;
  lessonOutcome?: string;
};

type CaseFilterPreset = {
  id: string;
  name: string;
  filters: {
    query?: string;
    outcomeFilter?: string;
    filterSymbol?: string;
    filterTimeframe?: string;
    filterAgent?: string;
    filterStrategy?: string;
    filterBroker?: string;
    filterExecutionMode?: string;
  };
};

type LessonFilterPreset = {
  id: string;
  name: string;
  filters: {
    lessonQuery?: string;
    lessonSymbol?: string;
    lessonTimeframe?: string;
    lessonStrategy?: string;
    lessonAgent?: string;
    lessonOutcome?: string;
  };
};

const loadPanelState = (): AcademyPanelState => {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      activeTab: parsed?.activeTab === 'learning_graph' ? 'learning_graph' : 'cases',
      query: typeof parsed?.query === 'string' ? parsed.query : '',
      outcomeFilter: typeof parsed?.outcomeFilter === 'string' ? parsed.outcomeFilter : 'all',
      selectedSymbol: typeof parsed?.selectedSymbol === 'string' ? parsed.selectedSymbol : null,
      learningGraphAgentId: typeof parsed?.learningGraphAgentId === 'string' ? parsed.learningGraphAgentId : '',
      learningGraphExpandedIds: Array.isArray(parsed?.learningGraphExpandedIds)
        ? parsed.learningGraphExpandedIds.map((item: any) => String(item || '')).filter(Boolean)
        : [],
      filterSymbol: typeof parsed?.filterSymbol === 'string' ? parsed.filterSymbol : 'all',
      filterTimeframe: typeof parsed?.filterTimeframe === 'string' ? parsed.filterTimeframe : 'all',
      filterAgent: typeof parsed?.filterAgent === 'string' ? parsed.filterAgent : 'all',
      filterStrategy: typeof parsed?.filterStrategy === 'string' ? parsed.filterStrategy : 'all',
      filterBroker: typeof parsed?.filterBroker === 'string' ? parsed.filterBroker : 'all',
      filterExecutionMode: typeof parsed?.filterExecutionMode === 'string' ? parsed.filterExecutionMode : 'all',
      lessonQuery: typeof parsed?.lessonQuery === 'string' ? parsed.lessonQuery : '',
      lessonSymbol: typeof parsed?.lessonSymbol === 'string' ? parsed.lessonSymbol : 'all',
      lessonTimeframe: typeof parsed?.lessonTimeframe === 'string' ? parsed.lessonTimeframe : 'all',
      lessonStrategy: typeof parsed?.lessonStrategy === 'string' ? parsed.lessonStrategy : 'all',
      lessonAgent: typeof parsed?.lessonAgent === 'string' ? parsed.lessonAgent : 'all',
      lessonOutcome: typeof parsed?.lessonOutcome === 'string' ? parsed.lessonOutcome : 'all'
    };
  } catch {
    return {};
  }
};

const loadCaseFilterPresets = (): CaseFilterPreset[] => {
  try {
    const raw = localStorage.getItem(CASE_PRESET_KEY);
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

const persistCaseFilterPresets = (presets: CaseFilterPreset[]) => {
  try {
    localStorage.setItem(CASE_PRESET_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
};

const loadLessonFilterPresets = (): LessonFilterPreset[] => {
  try {
    const raw = localStorage.getItem(LESSON_PRESET_KEY);
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

const persistLessonFilterPresets = (presets: LessonFilterPreset[]) => {
  try {
    localStorage.setItem(LESSON_PRESET_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
};

const persistPanelState = (state: AcademyPanelState) => {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
};

const formatAge = (ts?: number | null) => {
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
  if (!ms || ms <= 0) return '--';
  const seconds = Math.max(1, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const formatPrice = (value: number | null | undefined) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '--';
  const rounded = Math.round(num * 100_000) / 100_000;
  return String(rounded);
};

const formatBps = (value?: number | null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const rounded = Math.round(num * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} bps`;
};

const AcademyInterface: React.FC<AcademyInterfaceProps> = ({
  cases,
  lessons,
  symbolLearnings,
  selectedCaseId,
  onSelectCase,
  autoApplyEnabled,
  onToggleAutoApply,
  autoExportEnabled,
  onToggleAutoExport,
  lessonLimit,
  onLessonLimitChange,
  onRefresh,
  onExport,
  onOpenChart,
  onOpenMt5,
  onOpenTradeLocker,
  onReplayTrade,
  crossPanelContext,
  outcomeFeedCursor,
  outcomeFeedConsistency,
  panelFreshness,
  focusRequest,
  onFocusRequestConsumed,
  onApplyLesson,
  onSimulateLesson,
  onPinLesson,
  onSetLessonLifecycle,
  onLearningGraphBuilt,
  onLearningGraphLensChanged,
  onLearningPathGenerated,
  onLearningGraphCaseAction,
  onLearningGraphPathZoom,
  learningGraphFeatureFlags
}) => {
  const { degraded } = usePersistenceHealth('academy');
  const hasResolvedOutcomeFeed = Number(outcomeFeedCursor?.total || 0) > 0;
  const hasResolvedCaseRows = useMemo(
    () =>
      (Array.isArray(cases) ? cases : []).some((entry) => {
        const outcome = String(
          entry?.outcome ||
          entry?.status ||
          entry?.decisionOutcome ||
          entry?.resolvedOutcomeEnvelope?.decisionOutcome ||
          ''
        ).trim().toUpperCase();
        return outcome === 'WIN' || outcome === 'LOSS' || outcome === 'EXPIRED' || outcome === 'REJECTED' || outcome === 'FAILED';
      }),
    [cases]
  );
  const initialPanelState = useMemo(loadPanelState, []);
  const [activeTab, setActiveTab] = useState<'cases' | 'learning_graph'>(initialPanelState.activeTab || 'cases');
  const [query, setQuery] = useState(initialPanelState.query || '');
  const [outcomeFilter, setOutcomeFilter] = useState(initialPanelState.outcomeFilter || 'all');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(initialPanelState.selectedSymbol ?? null);
  const [filterSymbol, setFilterSymbol] = useState(initialPanelState.filterSymbol || 'all');
  const [filterTimeframe, setFilterTimeframe] = useState(initialPanelState.filterTimeframe || 'all');
  const [filterAgent, setFilterAgent] = useState(initialPanelState.filterAgent || 'all');
  const [filterStrategy, setFilterStrategy] = useState(initialPanelState.filterStrategy || 'all');
  const [filterBroker, setFilterBroker] = useState(initialPanelState.filterBroker || 'all');
  const [filterExecutionMode, setFilterExecutionMode] = useState(initialPanelState.filterExecutionMode || 'all');
  const [lessonQuery, setLessonQuery] = useState(initialPanelState.lessonQuery || '');
  const [lessonSymbol, setLessonSymbol] = useState(initialPanelState.lessonSymbol || 'all');
  const [lessonTimeframe, setLessonTimeframe] = useState(initialPanelState.lessonTimeframe || 'all');
  const [lessonStrategy, setLessonStrategy] = useState(initialPanelState.lessonStrategy || 'all');
  const [lessonAgent, setLessonAgent] = useState(initialPanelState.lessonAgent || 'all');
  const [lessonOutcome, setLessonOutcome] = useState(initialPanelState.lessonOutcome || 'all');
  const [lessonVisibleCount, setLessonVisibleCount] = useState<number>(12);
  const [casePresets, setCasePresets] = useState<CaseFilterPreset[]>(() => loadCaseFilterPresets());
  const [activeCasePresetId, setActiveCasePresetId] = useState<string>('');
  const [casePresetName, setCasePresetName] = useState<string>('');
  const [lessonPresets, setLessonPresets] = useState<LessonFilterPreset[]>(() => loadLessonFilterPresets());
  const [activeLessonPresetId, setActiveLessonPresetId] = useState<string>('');
  const [lessonPresetName, setLessonPresetName] = useState<string>('');
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [forcedFocusCaseId, setForcedFocusCaseId] = useState<string | null>(null);
  const [focusRequestMiss, setFocusRequestMiss] = useState<{ signalId: string; requestId: string } | null>(null);
  const [lastConsumedFocusRequestId, setLastConsumedFocusRequestId] = useState<string>('');

  useEffect(() => {
    persistPanelState({
      activeTab,
      query,
      outcomeFilter,
      selectedSymbol,
      filterSymbol,
      filterTimeframe,
      filterAgent,
      filterStrategy,
      filterBroker,
      filterExecutionMode,
      lessonQuery,
      lessonSymbol,
      lessonTimeframe,
      lessonStrategy,
      lessonAgent,
      lessonOutcome
    });
  }, [
    activeTab,
    filterAgent,
    filterBroker,
    filterExecutionMode,
    filterStrategy,
    filterSymbol,
    filterTimeframe,
    lessonQuery,
    lessonSymbol,
    lessonTimeframe,
    lessonStrategy,
    lessonAgent,
    lessonOutcome,
    outcomeFilter,
    query,
    selectedSymbol
  ]);

  useEffect(() => {
    persistCaseFilterPresets(casePresets);
  }, [casePresets]);

  useEffect(() => {
    persistLessonFilterPresets(lessonPresets);
  }, [lessonPresets]);

  const sortedSymbolLearnings = useMemo(() => {
    const list = Array.isArray(symbolLearnings) ? [...symbolLearnings] : [];
    list.sort((a, b) => (Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0)));
    return list;
  }, [symbolLearnings]);

  const selectedLearning = useMemo(() => {
    if (sortedSymbolLearnings.length === 0) return null;
    if (!selectedSymbol) return sortedSymbolLearnings[0] || null;
    return sortedSymbolLearnings.find((item) => item.symbol === selectedSymbol) || sortedSymbolLearnings[0] || null;
  }, [selectedSymbol, sortedSymbolLearnings]);

  const selectedLearningStats = useMemo(() => {
    if (!selectedLearning) return { winRate: null };
    const wins = Number(selectedLearning.wins || 0);
    const losses = Number(selectedLearning.losses || 0);
    const total = wins + losses;
    let winRate = selectedLearning.winRate != null ? selectedLearning.winRate : (total > 0 ? wins / total : null);
    if (winRate != null && winRate > 1) winRate = winRate / 100;
    return { winRate };
  }, [selectedLearning]);

  const lessonFilterOptions = useMemo(() => {
    const symbolSet = new Set<string>();
    const timeframeSet = new Set<string>();
    const strategySet = new Set<string>();
    const agentSet = new Set<string>();
    const outcomeSet = new Set<string>();
    let hasSymbolEmpty = false;
    let hasTimeframeEmpty = false;
    let hasStrategyEmpty = false;
    let hasAgentEmpty = false;
    let hasOutcomeEmpty = false;
    lessons.forEach((lesson) => {
      const symbol = String(lesson?.appliesTo?.symbol || '').trim();
      if (symbol) symbolSet.add(symbol);
      else hasSymbolEmpty = true;
      const timeframe = String(lesson?.appliesTo?.timeframe || '').trim();
      if (timeframe) timeframeSet.add(timeframe);
      else hasTimeframeEmpty = true;
      const strategy = String(lesson?.appliesTo?.strategyMode || '').trim();
      if (strategy) strategySet.add(strategy);
      else hasStrategyEmpty = true;
      const agent = String(lesson?.agentName || lesson?.agentId || '').trim();
      if (agent) agentSet.add(agent);
      else hasAgentEmpty = true;
      const outcome = String(lesson?.outcome || '').trim().toUpperCase();
      if (outcome) outcomeSet.add(outcome);
      else hasOutcomeEmpty = true;
    });
    const toSorted = (set: Set<string>) => Array.from(set.values()).sort((a, b) => a.localeCompare(b));
    return {
      symbols: toSorted(symbolSet),
      timeframes: toSorted(timeframeSet),
      strategies: toSorted(strategySet),
      agents: toSorted(agentSet),
      outcomes: toSorted(outcomeSet),
      hasSymbolEmpty,
      hasTimeframeEmpty,
      hasStrategyEmpty,
      hasAgentEmpty,
      hasOutcomeEmpty
    };
  }, [lessons]);

  const filteredLessons = useMemo(() => {
    const q = lessonQuery.trim().toLowerCase();
    const symbolFilter = String(lessonSymbol || 'all').trim().toLowerCase();
    const timeframeFilter = String(lessonTimeframe || 'all').trim().toLowerCase();
    const strategyFilter = String(lessonStrategy || 'all').trim().toLowerCase();
    const agentFilter = String(lessonAgent || 'all').trim().toLowerCase();
    const outcomeFilterValue = String(lessonOutcome || 'all').trim().toLowerCase();
    return lessons.filter((lesson) => {
      if (!lesson) return false;
      const symbolValue = String(lesson?.appliesTo?.symbol || '').trim().toLowerCase();
      if (symbolFilter !== 'all') {
        if (symbolFilter === 'none') {
          if (symbolValue) return false;
        } else if (symbolValue !== symbolFilter) {
          return false;
        }
      }
      const timeframeValue = String(lesson?.appliesTo?.timeframe || '').trim().toLowerCase();
      if (timeframeFilter !== 'all') {
        if (timeframeFilter === 'none') {
          if (timeframeValue) return false;
        } else if (timeframeValue !== timeframeFilter) {
          return false;
        }
      }
      const strategyValue = String(lesson?.appliesTo?.strategyMode || '').trim().toLowerCase();
      if (strategyFilter !== 'all') {
        if (strategyFilter === 'none') {
          if (strategyValue) return false;
        } else if (strategyValue !== strategyFilter) {
          return false;
        }
      }
      const agentValue = String(lesson?.agentName || lesson?.agentId || '').trim().toLowerCase();
      if (agentFilter !== 'all') {
        if (agentFilter === 'none') {
          if (agentValue) return false;
        } else if (agentValue !== agentFilter) {
          return false;
        }
      }
      const outcomeValue = String(lesson?.outcome || '').trim().toLowerCase();
      if (outcomeFilterValue !== 'all') {
        if (outcomeFilterValue === 'none') {
          if (outcomeValue) return false;
        } else if (outcomeValue !== outcomeFilterValue) {
          return false;
        }
      }
      if (!q) return true;
      const hay = [
        lesson.title,
        lesson.summary,
        lesson.recommendedAction,
        lesson.triggerConditions?.join(' '),
        lesson.agentName,
        lesson.outcome
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [lessonQuery, lessonStrategy, lessonSymbol, lessonTimeframe, lessonAgent, lessonOutcome, lessons]);

  const caseFilterOptions = useMemo(() => {
    const symbolSet = new Set<string>();
    const timeframeSet = new Set<string>();
    const agentSet = new Set<string>();
    const strategySet = new Set<string>();
    const brokerSet = new Set<string>();
    const modeSet = new Set<string>();
    let hasSymbolEmpty = false;
    let hasTimeframeEmpty = false;
    let hasAgentEmpty = false;
    let hasStrategyEmpty = false;
    let hasBrokerEmpty = false;
    let hasModeEmpty = false;

    cases.forEach((entry) => {
      const symbol = String(entry.symbol || '').trim();
      if (symbol) symbolSet.add(symbol);
      else hasSymbolEmpty = true;
      const timeframe = String(entry.timeframe || '').trim();
      if (timeframe) timeframeSet.add(timeframe);
      else hasTimeframeEmpty = true;
      const agent = String(entry.agentName || entry.agentId || '').trim();
      if (agent) agentSet.add(agent);
      else hasAgentEmpty = true;
      const strategy = String(entry.strategyMode || '').trim();
      if (strategy) strategySet.add(strategy);
      else hasStrategyEmpty = true;
      const broker = String(entry.executionBroker || '').trim();
      if (broker) brokerSet.add(broker);
      else hasBrokerEmpty = true;
      const mode = String(entry.executionMode || '').trim();
      if (mode) modeSet.add(mode);
      else hasModeEmpty = true;
    });

    const toSorted = (set: Set<string>) => Array.from(set.values()).sort((a, b) => a.localeCompare(b));

    return {
      symbols: toSorted(symbolSet),
      timeframes: toSorted(timeframeSet),
      agents: toSorted(agentSet),
      strategies: toSorted(strategySet),
      brokers: toSorted(brokerSet),
      modes: toSorted(modeSet),
      hasSymbolEmpty,
      hasTimeframeEmpty,
      hasAgentEmpty,
      hasStrategyEmpty,
      hasBrokerEmpty,
      hasModeEmpty
    };
  }, [cases]);

  const caseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cases.forEach((entry) => {
      const key = String(entry.outcome || entry.status || 'PROPOSED').toUpperCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [cases]);

  const filteredCases = useMemo(() => {
    const q = query.trim().toLowerCase();
    const symbolFilter = String(filterSymbol || 'all').trim().toLowerCase();
    const timeframeFilter = String(filterTimeframe || 'all').trim().toLowerCase();
    const agentFilter = String(filterAgent || 'all').trim().toLowerCase();
    const strategyFilter = String(filterStrategy || 'all').trim().toLowerCase();
    const brokerFilter = String(filterBroker || 'all').trim().toLowerCase();
    const modeFilter = String(filterExecutionMode || 'all').trim().toLowerCase();
    return cases.filter((entry) => {
      if (!entry) return false;
      if (outcomeFilter !== 'all') {
        const outcome = String(entry.outcome || entry.status || '').toLowerCase();
        if (!outcome.includes(outcomeFilter)) return false;
      }
      const symbolValue = String(entry.symbol || '').trim().toLowerCase();
      if (symbolFilter !== 'all') {
        if (symbolFilter === 'none') {
          if (symbolValue) return false;
        } else if (symbolValue !== symbolFilter) {
          return false;
        }
      }
      const timeframeValue = String(entry.timeframe || '').trim().toLowerCase();
      if (timeframeFilter !== 'all') {
        if (timeframeFilter === 'none') {
          if (timeframeValue) return false;
        } else if (timeframeValue !== timeframeFilter) {
          return false;
        }
      }
      const agentValue = String(entry.agentName || entry.agentId || '').trim().toLowerCase();
      if (agentFilter !== 'all') {
        if (agentFilter === 'none') {
          if (agentValue) return false;
        } else if (agentValue !== agentFilter) {
          return false;
        }
      }
      const strategyValue = String(entry.strategyMode || '').trim().toLowerCase();
      if (strategyFilter !== 'all') {
        if (strategyFilter === 'none') {
          if (strategyValue) return false;
        } else if (strategyValue !== strategyFilter) {
          return false;
        }
      }
      const brokerValue = String(entry.executionBroker || '').trim().toLowerCase();
      if (brokerFilter !== 'all') {
        if (brokerFilter === 'none') {
          if (brokerValue) return false;
        } else if (brokerValue !== brokerFilter) {
          return false;
        }
      }
      const modeValue = String(entry.executionMode || '').trim().toLowerCase();
      if (modeFilter !== 'all') {
        if (modeFilter === 'none') {
          if (modeValue) return false;
        } else if (modeValue !== modeFilter) {
          return false;
        }
      }
      if (!q) return true;
      const hay = [
        entry.symbol,
        entry.timeframe,
        entry.action,
        entry.strategyMode,
        entry.reason,
        entry.agentName
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [
    cases,
    filterAgent,
    filterBroker,
    filterExecutionMode,
    filterStrategy,
    filterSymbol,
    filterTimeframe,
    outcomeFilter,
    query
  ]);

  const displayedCases = useMemo(() => {
    const next = Array.isArray(filteredCases) ? [...filteredCases] : [];
    const includePinned = (pinId: string | null | undefined) => {
      const key = String(pinId || '').trim();
      if (!key) return;
      const alreadyVisible = next.some((entry) => entry.id === key || entry.signalId === key);
      if (alreadyVisible) return;
      const focused = (cases || []).find((entry) => entry.id === key || entry.signalId === key);
      if (!focused) return;
      next.unshift(focused);
    };
    includePinned(forcedFocusCaseId);
    includePinned(selectedCaseId);
    return next;
  }, [cases, filteredCases, forcedFocusCaseId, selectedCaseId]);

  const selectedCases = useMemo(() => {
    if (selectedCaseIds.length === 0) return [];
    const byId = new Map(displayedCases.map((entry) => [entry.id, entry]));
    return selectedCaseIds.map((id) => byId.get(id)).filter(Boolean) as AcademyCase[];
  }, [displayedCases, selectedCaseIds]);

  useEffect(() => {
    if (selectedCaseIds.length === 0) return;
    const filteredIds = new Set(displayedCases.map((entry) => entry.id));
    setSelectedCaseIds((prev) => prev.filter((id) => filteredIds.has(id)));
  }, [displayedCases, selectedCaseIds.length]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedCaseIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedCaseIds(displayedCases.map((entry) => entry.id));
  }, [displayedCases]);

  const handleClearSelection = useCallback(() => {
    setSelectedCaseIds([]);
  }, []);

  const handleClearCaseFilters = useCallback(() => {
    setFilterSymbol('all');
    setFilterTimeframe('all');
    setFilterAgent('all');
    setFilterStrategy('all');
    setFilterBroker('all');
    setFilterExecutionMode('all');
  }, []);

  const buildCaseFilterSnapshot = useCallback(() => ({
    query,
    outcomeFilter,
    filterSymbol,
    filterTimeframe,
    filterAgent,
    filterStrategy,
    filterBroker,
    filterExecutionMode
  }), [
    filterAgent,
    filterBroker,
    filterExecutionMode,
    filterStrategy,
    filterSymbol,
    filterTimeframe,
    outcomeFilter,
    query
  ]);

  const applyCaseFilterSnapshot = useCallback((filters: CaseFilterPreset['filters'] | null) => {
    if (!filters) return;
    if (filters.query != null) setQuery(String(filters.query));
    if (filters.outcomeFilter != null) setOutcomeFilter(String(filters.outcomeFilter));
    if (filters.filterSymbol != null) setFilterSymbol(String(filters.filterSymbol));
    if (filters.filterTimeframe != null) setFilterTimeframe(String(filters.filterTimeframe));
    if (filters.filterAgent != null) setFilterAgent(String(filters.filterAgent));
    if (filters.filterStrategy != null) setFilterStrategy(String(filters.filterStrategy));
    if (filters.filterBroker != null) setFilterBroker(String(filters.filterBroker));
    if (filters.filterExecutionMode != null) setFilterExecutionMode(String(filters.filterExecutionMode));
  }, []);

  const handleCasePresetSelect = useCallback((id: string) => {
    setActiveCasePresetId(id);
    const preset = casePresets.find((item) => item.id === id);
    if (!preset) return;
    setCasePresetName(preset.name);
    applyCaseFilterSnapshot(preset.filters);
  }, [applyCaseFilterSnapshot, casePresets]);

  const handleCasePresetSave = useCallback(() => {
    const name = casePresetName.trim() || `Preset ${casePresets.length + 1}`;
    const snapshot = buildCaseFilterSnapshot();
    const next: CaseFilterPreset = {
      id: `case_preset_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      filters: snapshot
    };
    setCasePresets((prev) => [next, ...prev]);
    setActiveCasePresetId(next.id);
    setCasePresetName(name);
  }, [buildCaseFilterSnapshot, casePresetName, casePresets.length]);

  const handleCasePresetUpdate = useCallback(() => {
    if (!activeCasePresetId) return;
    const name = casePresetName.trim();
    const snapshot = buildCaseFilterSnapshot();
    setCasePresets((prev) => prev.map((item) => {
      if (item.id !== activeCasePresetId) return item;
      return {
        ...item,
        name: name || item.name,
        filters: snapshot
      };
    }));
  }, [activeCasePresetId, buildCaseFilterSnapshot, casePresetName]);

  const handleCasePresetDelete = useCallback(() => {
    if (!activeCasePresetId) return;
    setCasePresets((prev) => prev.filter((item) => item.id !== activeCasePresetId));
    setActiveCasePresetId('');
    setCasePresetName('');
  }, [activeCasePresetId]);

  const handleClearLessonFilters = useCallback(() => {
    setLessonQuery('');
    setLessonSymbol('all');
    setLessonTimeframe('all');
    setLessonStrategy('all');
    setLessonAgent('all');
    setLessonOutcome('all');
  }, []);

  const buildLessonFilterSnapshot = useCallback(() => ({
    lessonQuery,
    lessonSymbol,
    lessonTimeframe,
    lessonStrategy,
    lessonAgent,
    lessonOutcome
  }), [lessonQuery, lessonStrategy, lessonSymbol, lessonTimeframe, lessonAgent, lessonOutcome]);

  const applyLessonFilterSnapshot = useCallback((filters: LessonFilterPreset['filters'] | null) => {
    if (!filters) return;
    if (filters.lessonQuery != null) setLessonQuery(String(filters.lessonQuery));
    if (filters.lessonSymbol != null) setLessonSymbol(String(filters.lessonSymbol));
    if (filters.lessonTimeframe != null) setLessonTimeframe(String(filters.lessonTimeframe));
    if (filters.lessonStrategy != null) setLessonStrategy(String(filters.lessonStrategy));
    if (filters.lessonAgent != null) setLessonAgent(String(filters.lessonAgent));
    if (filters.lessonOutcome != null) setLessonOutcome(String(filters.lessonOutcome));
  }, []);

  const handleLessonPresetSelect = useCallback((id: string) => {
    setActiveLessonPresetId(id);
    const preset = lessonPresets.find((item) => item.id === id);
    if (!preset) return;
    setLessonPresetName(preset.name);
    applyLessonFilterSnapshot(preset.filters);
  }, [applyLessonFilterSnapshot, lessonPresets]);

  const handleLessonPresetSave = useCallback(() => {
    const name = lessonPresetName.trim() || `Preset ${lessonPresets.length + 1}`;
    const snapshot = buildLessonFilterSnapshot();
    const next: LessonFilterPreset = {
      id: `lesson_preset_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      filters: snapshot
    };
    setLessonPresets((prev) => [next, ...prev]);
    setActiveLessonPresetId(next.id);
    setLessonPresetName(name);
  }, [buildLessonFilterSnapshot, lessonPresetName, lessonPresets.length]);

  const handleLessonPresetUpdate = useCallback(() => {
    if (!activeLessonPresetId) return;
    const name = lessonPresetName.trim();
    const snapshot = buildLessonFilterSnapshot();
    setLessonPresets((prev) => prev.map((item) => {
      if (item.id !== activeLessonPresetId) return item;
      return {
        ...item,
        name: name || item.name,
        filters: snapshot
      };
    }));
  }, [activeLessonPresetId, buildLessonFilterSnapshot, lessonPresetName]);

  const handleLessonPresetDelete = useCallback(() => {
    if (!activeLessonPresetId) return;
    setLessonPresets((prev) => prev.filter((item) => item.id !== activeLessonPresetId));
    setActiveLessonPresetId('');
    setLessonPresetName('');
  }, [activeLessonPresetId]);

  const buildReplayPayload = useCallback((entry: AcademyCase) => ({
    symbol: entry.symbol,
    timeframe: entry.timeframe ?? null,
    entryPrice: entry.entryPrice ?? null,
    stopLoss: entry.stopLoss ?? null,
    takeProfit: entry.takeProfit ?? null,
    closePrice: entry.exitPrice ?? null,
    action: entry.action ?? null,
    ledgerId: entry.ledgerId ?? null,
    noteId: entry.id ?? null
  }), []);

  const handleLearningGraphCaseAction = useCallback((payload: LearningCaseAction, entry: AcademyCase) => {
    const action = String(payload?.action || '').trim() as LearningCaseAction['action'];
    const caseId = String(payload?.caseId || entry?.id || '').trim();
    if (!action || !caseId) return;
    if (action === 'open_chart') {
      onOpenChart?.(entry.symbol, entry.timeframe || null);
    } else if (action === 'replay_case') {
      if (onReplayTrade) onReplayTrade(buildReplayPayload(entry));
    } else if (action === 'show_reasoning') {
      setActiveTab('cases');
      setForcedFocusCaseId(caseId);
      onSelectCase(caseId);
    }
    onLearningGraphCaseAction?.({
      caseId,
      action,
      scopeKey: Number.isFinite(Number(outcomeFeedCursor?.version))
        ? `v${Number(outcomeFeedCursor?.version)}`
        : null,
      nodeId: null
    });
  }, [
    buildReplayPayload,
    onLearningGraphCaseAction,
    onOpenChart,
    onReplayTrade,
    onSelectCase,
    outcomeFeedCursor?.version
  ]);

  const handleBulkReplay = useCallback(() => {
    if (!onReplayTrade) return;
    selectedCases.forEach((entry) => onReplayTrade(buildReplayPayload(entry)));
  }, [buildReplayPayload, onReplayTrade, selectedCases]);

  const handleBulkOpenChart = useCallback(() => {
    if (!onOpenChart) return;
    selectedCases.forEach((entry) => onOpenChart(entry.symbol, entry.timeframe || null));
  }, [onOpenChart, selectedCases]);

  const handleBulkOpenMt5 = useCallback(() => {
    if (!onOpenMt5) return;
    selectedCases.forEach((entry) => onOpenMt5(entry.symbol, entry.timeframe || null));
  }, [onOpenMt5, selectedCases]);

  const handleBulkOpenTradeLocker = useCallback(() => {
    if (!onOpenTradeLocker) return;
    selectedCases.forEach((entry) => onOpenTradeLocker(entry.symbol, entry.timeframe || null));
  }, [onOpenTradeLocker, selectedCases]);

  const selected = useMemo(() => {
    if (!selectedCaseId) return displayedCases[0] || null;
    return displayedCases.find((entry) => entry.id === selectedCaseId) || null;
  }, [displayedCases, selectedCaseId]);

  const selectedAttribution = useMemo(() => {
    if (!selected) {
      return {
        decisionOutcome: 'UNKNOWN',
        executionOutcome: 'UNKNOWN',
        alphaBps: null as number | null,
        executionDragBps: null as number | null,
        unresolved: true
      };
    }
    const decisionOutcome = String(
      selected.decisionOutcome ||
      selected.resolvedOutcomeEnvelope?.decisionOutcome ||
      selected.attribution?.decisionOutcome ||
      'UNKNOWN'
    ).toUpperCase();
    const executionOutcome = String(
      selected.executionOutcome ||
      selected.resolvedOutcomeEnvelope?.executionOutcome ||
      selected.attribution?.executionOutcome ||
      'UNKNOWN'
    ).toUpperCase();
    const alphaBps = Number.isFinite(Number(selected.attribution?.alphaBps))
      ? Number(selected.attribution?.alphaBps)
      : null;
    const executionDragBps = Number.isFinite(Number(selected.attribution?.executionDragBps))
      ? Number(selected.attribution?.executionDragBps)
      : null;
    const unresolved = decisionOutcome === 'UNKNOWN' || executionOutcome === 'UNKNOWN';
    return {
      decisionOutcome,
      executionOutcome,
      alphaBps,
      executionDragBps,
      unresolved
    };
  }, [selected]);

  useEffect(() => {
    const requestId = String(focusRequest?.requestId || '').trim();
    if (!requestId || requestId === lastConsumedFocusRequestId) return;
    const requestedSignalId = String(focusRequest?.signalId || '').trim();
    const requestedCaseId = String(focusRequest?.caseId || '').trim();
    const targetId = requestedCaseId || requestedSignalId;
    const matched = (cases || []).find((entry) => {
      if (!entry) return false;
      const entryId = String(entry.id || '').trim();
      const signalId = String(entry.signalId || '').trim();
      return !!targetId && (entryId === targetId || signalId === targetId);
    });
    setLastConsumedFocusRequestId(requestId);
    if (matched) {
      if (focusRequest?.forceVisible) {
        setForcedFocusCaseId(String(matched.id || matched.signalId || targetId || '').trim() || null);
      }
      setFocusRequestMiss(null);
      setActiveTab('cases');
      onSelectCase(matched.id);
      onFocusRequestConsumed?.(requestId, 'matched');
      return;
    }
    if (focusRequest?.forceVisible && targetId) {
      setForcedFocusCaseId(targetId);
    }
    if (requestedSignalId) {
      setFocusRequestMiss({ signalId: requestedSignalId, requestId });
    } else if (targetId) {
      setFocusRequestMiss({ signalId: targetId, requestId });
    } else {
      setFocusRequestMiss(null);
    }
    onFocusRequestConsumed?.(requestId, 'missing');
  }, [cases, focusRequest, lastConsumedFocusRequestId, onFocusRequestConsumed, onSelectCase]);

  useEffect(() => {
    if (!selectedCaseId && displayedCases.length > 0) {
      onSelectCase(displayedCases[0].id);
    }
  }, [displayedCases, onSelectCase, selectedCaseId]);

  useEffect(() => {
    if (sortedSymbolLearnings.length === 0) {
      if (selectedSymbol) setSelectedSymbol(null);
      return;
    }
    if (!selectedSymbol || !sortedSymbolLearnings.some((item) => item.symbol === selectedSymbol)) {
      setSelectedSymbol(sortedSymbolLearnings[0].symbol);
    }
  }, [selectedSymbol, sortedSymbolLearnings]);

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#0a0a0a]">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-emerald-900/20 to-black flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-300 text-xs uppercase tracking-wider font-bold mb-1">
            <BookOpen size={14} />
            <span>Academy</span>
          </div>
          <div className="text-[10px] text-gray-500">Signals to outcomes to lessons to agent updates.</div>
          {crossPanelContext?.symbol ? (
            <div className="text-[10px] text-gray-500">
              Context: {crossPanelContext.symbol}{crossPanelContext.timeframe ? ` ${String(crossPanelContext.timeframe).toUpperCase()}` : ''}
            </div>
          ) : null}
          {outcomeFeedCursor ? (
            <div className="text-[10px] text-gray-500">
              Feed cursor v{outcomeFeedCursor.version} | {outcomeFeedCursor.total} resolved trades.
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 text-xs inline-flex items-center gap-1"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onExport}
            className="px-2 py-1 rounded border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/10 text-xs inline-flex items-center gap-1"
          >
            <Download size={12} />
            Export
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/10 text-xs flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('cases')}
          className={`px-2 py-1 rounded border ${activeTab === 'cases' ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
        >
          Cases
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('learning_graph')}
          className={`px-2 py-1 rounded border ${activeTab === 'learning_graph' ? 'border-cyan-400/60 text-cyan-100 bg-cyan-500/10' : 'border-white/10 text-gray-400 hover:text-white'}`}
        >
          Learning Graph
        </button>
      </div>

      <div className="px-4 py-3 border-b border-white/10 text-xs grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-gray-400">Auto Apply Lessons</span>
          <button
            type="button"
            onClick={() => onToggleAutoApply(!autoApplyEnabled)}
            className={`px-2 py-1 rounded border text-[11px] ${autoApplyEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400'}`}
          >
            {autoApplyEnabled ? 'ENABLED' : 'OFF'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-gray-400">Auto Export</span>
          <button
            type="button"
            onClick={() => onToggleAutoExport(!autoExportEnabled)}
            className={`px-2 py-1 rounded border text-[11px] ${autoExportEnabled ? 'border-emerald-400/60 text-emerald-100 bg-emerald-500/10' : 'border-white/10 text-gray-400'}`}
          >
            {autoExportEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-gray-400">Lesson Limit</span>
          <input
            value={lessonLimit}
            onChange={(e) => onLessonLimitChange(Number(e.target.value))}
            className="w-16 px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            type="number"
            min={3}
            max={30}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-gray-400">Outcome Filter</span>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="all">All</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/10 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 uppercase tracking-wider">Case Filters</span>
          <button
            type="button"
            onClick={handleClearCaseFilters}
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
          >
            Clear Filters
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_160px_auto_auto_auto] gap-2 text-xs">
          <input
            value={casePresetName}
            onChange={(e) => setCasePresetName(e.target.value)}
            placeholder="Preset name..."
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          />
          <select
            value={activeCasePresetId}
            onChange={(e) => handleCasePresetSelect(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="">Select preset</option>
            {casePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCasePresetSave}
            className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/10"
          >
            Save New
          </button>
          <button
            type="button"
            onClick={handleCasePresetUpdate}
            disabled={!activeCasePresetId}
            className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
          >
            Update
          </button>
          <button
            type="button"
            onClick={handleCasePresetDelete}
            disabled={!activeCasePresetId}
            className="px-2 py-1 rounded border border-rose-400/60 text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <select
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="all">All Symbols</option>
            {caseFilterOptions.symbols.map((symbol) => (
              <option key={symbol} value={symbol}>{symbol}</option>
            ))}
            {caseFilterOptions.hasSymbolEmpty && <option value="none">No Symbol</option>}
          </select>
          <select
            value={filterTimeframe}
            onChange={(e) => setFilterTimeframe(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="all">All Timeframes</option>
            {caseFilterOptions.timeframes.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
            {caseFilterOptions.hasTimeframeEmpty && <option value="none">No Timeframe</option>}
          </select>
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="all">All Agents</option>
            {caseFilterOptions.agents.map((agent) => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
            {caseFilterOptions.hasAgentEmpty && <option value="none">No Agent</option>}
          </select>
          <select
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="all">All Strategies</option>
            {caseFilterOptions.strategies.map((strategy) => (
              <option key={strategy} value={strategy}>{strategy}</option>
            ))}
            {caseFilterOptions.hasStrategyEmpty && <option value="none">No Strategy</option>}
          </select>
          <select
            value={filterBroker}
            onChange={(e) => setFilterBroker(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="all">All Brokers</option>
            {caseFilterOptions.brokers.map((broker) => (
              <option key={broker} value={broker}>{broker}</option>
            ))}
            {caseFilterOptions.hasBrokerEmpty && <option value="none">No Broker</option>}
          </select>
          <select
            value={filterExecutionMode}
            onChange={(e) => setFilterExecutionMode(e.target.value)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="all">All Modes</option>
            {caseFilterOptions.modes.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
            {caseFilterOptions.hasModeEmpty && <option value="none">No Mode</option>}
          </select>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-white/10 text-[11px] flex flex-wrap gap-2 text-gray-400">
        {Object.keys(caseCounts).length === 0 ? (
          <span>No cases yet.</span>
        ) : (
          Object.entries(caseCounts).map(([key, count]) => (
            <span key={key} className="px-2 py-0.5 rounded-full border border-white/10">
              {key} {count}
            </span>
          ))
        )}
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border-r border-white/5 overflow-y-auto p-3 space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by symbol, reason, agent..."
            className="w-full px-3 py-2 rounded border border-white/10 bg-black/40 text-sm text-white focus:outline-none focus:border-emerald-400/60"
          />
          <div className="flex flex-wrap items-center justify-between text-[10px] text-gray-500">
            <span>{selectedCaseIds.length} selected</span>
            <div className="flex items-center gap-2">
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
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {onReplayTrade && (
              <button
                type="button"
                onClick={handleBulkReplay}
                disabled={selectedCases.length === 0}
                className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40"
              >
                Replay Selected
              </button>
            )}
            {onOpenChart && (
              <button
                type="button"
                onClick={handleBulkOpenChart}
                disabled={selectedCases.length === 0}
                className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
              >
                Open Chart
              </button>
            )}
            {onOpenMt5 && (
              <button
                type="button"
                onClick={handleBulkOpenMt5}
                disabled={selectedCases.length === 0}
                className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
              >
                Open MT5
              </button>
            )}
            {onOpenTradeLocker && (
              <button
                type="button"
                onClick={handleBulkOpenTradeLocker}
                disabled={selectedCases.length === 0}
                className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
              >
                Open Locker
              </button>
            )}
          </div>
          {displayedCases.length === 0 ? (
            <div className="text-xs text-gray-500 p-3 border border-dashed border-white/10 rounded">
              No cases yet.
            </div>
          ) : (
            displayedCases.map((entry) => {
              const isActive = selected && entry.id === selected.id;
              const isSelected = selectedCaseIds.includes(entry.id);
              const status = entry.outcome || entry.status || 'PROPOSED';
              return (
                <div
                  key={entry.id}
                  className={`w-full text-left p-3 rounded border ${isActive ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 bg-black/40 hover:border-white/20'}`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        toggleSelected(entry.id);
                        onSelectCase(entry.id);
                      }}
                      className="mt-1 accent-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => onSelectCase(entry.id)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-semibold text-white">
                        {entry.action} {entry.symbol} {entry.timeframe ? `- ${entry.timeframe}` : ''}
                      </div>
                      <div className="text-[11px] text-gray-400 flex flex-wrap gap-2">
                        <span>{status}</span>
                        {entry.score != null && <span>{entry.score.toFixed(2)}R</span>}
                        {entry.probability != null && <span>{Math.round(entry.probability)}%</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 flex items-center justify-between">
                        <span>{entry.agentName || 'Agent team'}</span>
                        <span>{formatAge(entry.createdAtMs ?? null)}</span>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {degraded ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Academy memory is degraded while ledger sync recovers.
            </div>
          ) : null}
          {hasResolvedOutcomeFeed && hasResolvedCaseRows && (outcomeFeedConsistency?.degraded || outcomeFeedConsistency?.stale) ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Outcome feed {outcomeFeedConsistency.degraded ? 'degraded' : 'stale'}
              {outcomeFeedConsistency.reason ? ` (${outcomeFeedConsistency.reason})` : ''}.
            </div>
          ) : null}
          {panelFreshness && panelFreshness.state !== 'fresh' ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              Panel sync {panelFreshness.state}
              {panelFreshness.reason ? ` (${panelFreshness.reason})` : ''}.
            </div>
          ) : null}
          {focusRequestMiss ? (
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-200">
              Focus request pending for signal `{focusRequestMiss.signalId}`. Retry after refresh if not yet materialized.
            </div>
          ) : null}
          {activeTab === 'learning_graph' ? (
            <LearningGraphWorkbench
              cases={cases}
              lessons={lessons}
              symbolLearnings={symbolLearnings}
              onDrilldown={(target) => {
                if (target.agent) {
                  setFilterAgent(target.agent);
                  setLessonAgent(target.agent);
                }
                if (target.symbol) {
                  setFilterSymbol(target.symbol);
                  setLessonSymbol(target.symbol);
                  setSelectedSymbol(target.symbol);
                }
                if (target.pattern) {
                  setQuery(target.pattern);
                }
                if (target.lesson) {
                  setLessonQuery(target.lesson);
                }
                setActiveTab('cases');
              }}
              onApplyLesson={onApplyLesson}
              onSimulateLesson={onSimulateLesson}
              onPinLesson={onPinLesson}
              onSetLessonLifecycle={onSetLessonLifecycle}
              onGraphBuilt={onLearningGraphBuilt}
              onLensChanged={onLearningGraphLensChanged}
              onPathGenerated={onLearningPathGenerated}
              onCaseAction={handleLearningGraphCaseAction}
              onPathZoom={onLearningGraphPathZoom}
              featureFlags={learningGraphFeatureFlags || null}
            />
          ) : !selected ? (
            <div className="text-xs text-gray-500 border border-dashed border-white/10 rounded p-4">
              Select a case to view details.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {selected.action} {selected.symbol} {selected.timeframe ? `- ${selected.timeframe}` : ''}
                  </div>
                  <div className="text-xs text-gray-400 flex flex-wrap gap-2">
                    <span>Status {selected.outcome || selected.status || 'PROPOSED'}</span>
                    {selected.executionMode && <span>Mode {selected.executionMode}</span>}
                    {selected.executionSource && <span>Source {selected.executionSource}</span>}
                    {selected.executionBroker && <span>Broker {selected.executionBroker}</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-400 text-right">
                  <div>Created {formatAge(selected.createdAtMs ?? null)}</div>
                  <div>Resolved {formatAge(selected.resolvedAtMs ?? null)}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-white/5 border border-white/10 rounded p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Entry</div>
                  <div className="text-sm text-white">{formatPrice(selected.entryPrice)}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Stop</div>
                  <div className="text-sm text-white">{formatPrice(selected.stopLoss)}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Target</div>
                  <div className="text-sm text-white">{formatPrice(selected.takeProfit)}</div>
                </div>
              </div>

              <TagPills
                tags={[
                  selected.timeframe || null,
                  selected.strategyMode || null,
                  selected.agentName || null,
                  selected.executionBroker || null,
                  selected.executionMode || null,
                  selected.outcome || selected.status || null
                ]}
                max={6}
              />
              <div className="text-[11px] text-gray-400 flex flex-wrap gap-3">
                <span>Duration {formatDuration(selected.durationMs ?? null)}</span>
                <span>Bars {selected.barsToOutcome != null ? selected.barsToOutcome : '--'}</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Attribution</div>
                <div className="text-[11px] text-gray-300 flex flex-wrap gap-3">
                  <span>Decision {selectedAttribution.decisionOutcome}</span>
                  <span>Execution {selectedAttribution.executionOutcome}</span>
                </div>
                <div className="text-[11px] text-gray-400 flex flex-wrap gap-3">
                  <span>Alpha {formatBps(selectedAttribution.alphaBps)}</span>
                  <span>Execution drag {formatBps(selectedAttribution.executionDragBps)}</span>
                </div>
                {selectedAttribution.unresolved ? (
                  <div className="text-[11px] text-gray-500">
                    Attribution unresolved for this case.
                  </div>
                ) : null}
              </div>

              {(onReplayTrade || onOpenChart || onOpenMt5 || onOpenTradeLocker) && (
                <div className="flex flex-wrap gap-2">
                  {onReplayTrade && (
                    <button
                      type="button"
                      onClick={() => onReplayTrade(buildReplayPayload(selected))}
                      className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/10 text-[11px]"
                    >
                      Replay
                    </button>
                  )}
                  {onOpenChart && (
                    <button
                      type="button"
                      onClick={() => onOpenChart(selected.symbol, selected.timeframe || null)}
                      className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-[11px]"
                    >
                      Open in Chart
                    </button>
                  )}
                  {onOpenMt5 && (
                    <button
                      type="button"
                      onClick={() => onOpenMt5(selected.symbol, selected.timeframe || null)}
                      className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-[11px]"
                    >
                      Open in MT5
                    </button>
                  )}
                  {onOpenTradeLocker && (
                    <button
                      type="button"
                      onClick={() => onOpenTradeLocker(selected.symbol, selected.timeframe || null)}
                      className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-[11px]"
                    >
                      Open in Locker
                    </button>
                  )}
                </div>
              )}

              {selected.snapshot && (
                <div className="bg-white/5 border border-white/10 rounded p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">Snapshot</div>
                  {selected.snapshot.imageDataUrl ? (
                    <img src={selected.snapshot.imageDataUrl} alt="Chart snapshot" className="w-full rounded border border-white/10" />
                  ) : (
                    <div className="text-xs text-gray-500">
                      {selected.snapshot.savedPath ? `Saved: ${selected.snapshot.savedPath}` : 'No image available.'}
                    </div>
                  )}
                  {selected.snapshot.frames && selected.snapshot.frames.length > 0 && (
                    <div className="text-[11px] text-gray-500">
                      Frames: {selected.snapshot.frames.map((f) => `${f.tf} ${f.barsCount}`).join(' | ')}
                    </div>
                  )}
                </div>
              )}

              {selected.brokerSnapshot && (
                <div className="bg-white/5 border border-white/10 rounded p-3 text-xs space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">Broker Snapshot</div>
                  <div>Broker: {selected.brokerSnapshot.broker || '--'}</div>
                  <div>Equity: {selected.brokerSnapshot.equity ?? '--'} | Balance: {selected.brokerSnapshot.balance ?? '--'}</div>
                  <div>Spread: {selected.brokerSnapshot.spread ?? '--'} | Quote age: {formatAge(selected.brokerSnapshot.quoteUpdatedAtMs ?? null)}</div>
                  <div>AutoPilot: {selected.brokerSnapshot.autoPilotEnabled ? 'ON' : 'OFF'} {selected.brokerSnapshot.killSwitch ? '(KILL)' : ''}</div>
                </div>
              )}

              {selected.telemetry && selected.telemetry.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded p-3 text-xs space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">Timeline</div>
                  <div className="space-y-1">
                    {selected.telemetry.slice(0, 10).map((evt) => (
                      <div key={evt.id} className="text-[11px] text-gray-400">
                        {new Date(evt.atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {evt.type}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.analysis && (
                <div className="bg-white/5 border border-white/10 rounded p-3 text-xs space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">Academy Analyst</div>
                  <div className="text-gray-300">{selected.analysis.report?.summary || selected.analysis.report?.rootCause || 'Analysis captured.'}</div>
                  {selected.analysis.report?.failureModeTag && (
                    <div className="text-[11px] text-gray-500">Failure mode: {selected.analysis.report.failureModeTag}</div>
                  )}
                  {selected.analysis.report?.improvement && (
                    <div className="text-[11px] text-gray-400">Next time: {selected.analysis.report.improvement}</div>
                  )}
                </div>
              )}

              <div className="bg-white/5 border border-white/10 rounded p-3 text-xs space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Active Lessons</div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto_auto_auto] gap-2 text-[10px]">
                  <input
                    value={lessonPresetName}
                    onChange={(e) => setLessonPresetName(e.target.value)}
                    placeholder="Preset name..."
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  />
                  <select
                    value={activeLessonPresetId}
                    onChange={(e) => handleLessonPresetSelect(e.target.value)}
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  >
                    <option value="">Select preset</option>
                    {lessonPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleLessonPresetSave}
                    className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-200 hover:bg-emerald-500/10"
                  >
                    Save New
                  </button>
                  <button
                    type="button"
                    onClick={handleLessonPresetUpdate}
                    disabled={!activeLessonPresetId}
                    className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={handleLessonPresetDelete}
                    disabled={!activeLessonPresetId}
                    className="px-2 py-1 rounded border border-rose-400/60 text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[10px]">
                  <input
                    value={lessonQuery}
                    onChange={(e) => setLessonQuery(e.target.value)}
                    placeholder="Search lessons..."
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  />
                  <select
                    value={lessonSymbol}
                    onChange={(e) => setLessonSymbol(e.target.value)}
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  >
                    <option value="all">All Symbols</option>
                    {lessonFilterOptions.symbols.map((symbol) => (
                      <option key={symbol} value={symbol}>{symbol}</option>
                    ))}
                    {lessonFilterOptions.hasSymbolEmpty && <option value="none">No Symbol</option>}
                  </select>
                  <select
                    value={lessonTimeframe}
                    onChange={(e) => setLessonTimeframe(e.target.value)}
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  >
                    <option value="all">All Timeframes</option>
                    {lessonFilterOptions.timeframes.map((tf) => (
                      <option key={tf} value={tf}>{tf}</option>
                    ))}
                    {lessonFilterOptions.hasTimeframeEmpty && <option value="none">No Timeframe</option>}
                  </select>
                  <select
                    value={lessonStrategy}
                    onChange={(e) => setLessonStrategy(e.target.value)}
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  >
                    <option value="all">All Strategies</option>
                    {lessonFilterOptions.strategies.map((strategy) => (
                      <option key={strategy} value={strategy}>{strategy}</option>
                    ))}
                    {lessonFilterOptions.hasStrategyEmpty && <option value="none">No Strategy</option>}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                  <select
                    value={lessonAgent}
                    onChange={(e) => setLessonAgent(e.target.value)}
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  >
                    <option value="all">All Agents</option>
                    {lessonFilterOptions.agents.map((agent) => (
                      <option key={agent} value={agent}>{agent}</option>
                    ))}
                    {lessonFilterOptions.hasAgentEmpty && <option value="none">No Agent</option>}
                  </select>
                  <select
                    value={lessonOutcome}
                    onChange={(e) => setLessonOutcome(e.target.value)}
                    className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
                  >
                    <option value="all">All Outcomes</option>
                    {lessonFilterOptions.outcomes.map((outcome) => (
                      <option key={outcome} value={outcome}>{outcome}</option>
                    ))}
                    {lessonFilterOptions.hasOutcomeEmpty && <option value="none">No Outcome</option>}
                  </select>
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-500">
                  <span>
                    {Math.min(lessonVisibleCount, filteredLessons.length)} / {filteredLessons.length} visible lessons
                  </span>
                  <button
                    type="button"
                    onClick={handleClearLessonFilters}
                    className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
                  >
                    Clear Lesson Filters
                  </button>
                </div>
                {filteredLessons.length === 0 ? (
                  <div className="text-gray-500">No lessons yet.</div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1">
                    {filteredLessons.slice(0, lessonVisibleCount).map((lesson) => (
                      <div key={lesson.id} className="text-[11px] text-gray-400">
                        {lesson.title}
                      </div>
                    ))}
                    </div>
                    {filteredLessons.length > lessonVisibleCount ? (
                      <button
                        type="button"
                        onClick={() => setLessonVisibleCount((prev) => Math.min(filteredLessons.length, prev + 12))}
                        className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white text-[10px]"
                      >
                        Show more ({filteredLessons.length - lessonVisibleCount} remaining)
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 rounded p-3 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400">Symbol Learning (Signals)</div>
                  {selectedLearning && (
                    <div className="text-[10px] text-gray-500">{formatAge(selectedLearning.updatedAtMs ?? null)}</div>
                  )}
                </div>
                {sortedSymbolLearnings.length === 0 ? (
                  <div className="text-gray-500">No symbol learning yet.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-3">
                    <div className="space-y-2">
                      {sortedSymbolLearnings.map((item) => {
                        const isActive = selectedLearning && item.symbol === selectedLearning.symbol;
                        const total = Number(item.wins || 0) + Number(item.losses || 0);
                        const winRate = item.winRate != null
                          ? Math.round(item.winRate * 100)
                          : total > 0
                            ? Math.round((Number(item.wins || 0) / total) * 100)
                            : null;
                        return (
                          <button
                            key={item.symbol}
                            onClick={() => setSelectedSymbol(item.symbol)}
                            className={`w-full text-left p-2 rounded border ${isActive ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/10 bg-black/40 hover:border-white/20'}`}
                          >
                            <div className="text-[12px] font-semibold text-white">{item.symbol}</div>
                            <div className="text-[10px] text-gray-400 flex flex-wrap gap-2">
                              <span>W {item.wins} / L {item.losses}</span>
                              <span>{winRate != null ? `${winRate}%` : '--'}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="bg-black/40 border border-white/10 rounded p-3 space-y-2">
                      {selectedLearning ? (
                        <>
                          <div className="text-sm font-semibold text-white">{selectedLearning.symbol}</div>
                          <div className="text-[11px] text-gray-400">
                            Wins {selectedLearning.wins} | Losses {selectedLearning.losses}
                            {selectedLearningStats.winRate != null && (
                              <> | Win rate {Math.round(selectedLearningStats.winRate * 100)}%</>
                            )}
                            {selectedLearning.avgScore != null && (
                              <> | Avg {selectedLearning.avgScore.toFixed(2)}R</>
                            )}
                          </div>
                          <div className="text-gray-300">{selectedLearning.summary || 'No summary yet.'}</div>
                          {selectedLearning.bestConditions && selectedLearning.bestConditions.length > 0 && (
                            <div className="text-[11px] text-gray-400">
                              Best conditions: {selectedLearning.bestConditions.join(' | ')}
                            </div>
                          )}
                          {selectedLearning.failurePatterns && selectedLearning.failurePatterns.length > 0 && (
                            <div className="text-[11px] text-gray-400">
                              Failure patterns: {selectedLearning.failurePatterns.join(' | ')}
                            </div>
                          )}
                          {selectedLearning.recommendedAdjustments && selectedLearning.recommendedAdjustments.length > 0 && (
                            <div className="text-[11px] text-gray-400">
                              Adjustments: {selectedLearning.recommendedAdjustments.join(' | ')}
                            </div>
                          )}
                          {(onOpenChart || onOpenMt5 || onOpenTradeLocker) && (
                            <div className="flex flex-wrap gap-2">
                              {onOpenChart && (
                                <button
                                  type="button"
                                  onClick={() => onOpenChart(selectedLearning.symbol, null)}
                                  className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-[11px]"
                                >
                                  Open in Chart
                                </button>
                              )}
                              {onOpenMt5 && (
                                <button
                                  type="button"
                                  onClick={() => onOpenMt5(selectedLearning.symbol, null)}
                                  className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-[11px]"
                                >
                                  Open in MT5
                                </button>
                              )}
                              {onOpenTradeLocker && (
                                <button
                                  type="button"
                                  onClick={() => onOpenTradeLocker(selectedLearning.symbol, null)}
                                  className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-[11px]"
                                >
                                  Open in Locker
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-gray-500">Select a symbol to view details.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcademyInterface;
