import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AcademyCase,
  AcademyLesson,
  AcademySymbolLearning,
  LearningCaseAction,
  LearningGraphDiffMode,
  LearningGraphDiffSnapshot,
  LearningGraphFilters,
  LearningGraphNode,
  LearningGraphSnapshot,
  LearningGraphTimelineRange,
  LearningGraphTimelineWindow,
  LearningPathSummary,
  LessonConflictResolution
} from '../../types';
import {
  buildAcademyLearningGraph,
  normalizeLearningGraphAgentKey
} from '../../services/academyLearningGraph';
import { buildLearningPathResult } from '../../services/academyLearningPathService';
import {
  filterAcademyDataByTimeline,
  resolveLearningTimelineRange
} from '../../services/academyLearningTimelineService';
import { buildLearningGraphDiffSnapshot } from '../../services/academyLearningGraphDiffService';
import {
  applyConflictPoliciesToSnapshot,
  buildLearningConflictId,
  listLearningSnapshotConflicts,
  mergeLearningConflictPolicies,
  normalizeLearningConflictResolution
} from '../../services/academyLearningConflictResolutionService';
import {
  buildLearningGraphBundleWithWorker,
  buildLearningGraphDiffWithWorker,
  buildLearningGraphSnapshotWithWorker
} from '../../services/academyLearningGraphWorkerClient';
import { buildLearningGraphEdgeBundleMap } from '../../services/learningGraphEdgeBundling';
import LearningGraphCanvas from './LearningGraphCanvas';
import LearningGraphExplorer from './LearningGraphExplorer';
import LearningGraphInspector from './LearningGraphInspector';
import LearningGraphLensBar from './LearningGraphLensBar';
import LearningGraphTimelineBar from './LearningGraphTimelineBar';
import LearningGraphDiffPanel from './LearningGraphDiffPanel';
import LearningGraphConflictResolver from './LearningGraphConflictResolver';

type Props = {
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings: AcademySymbolLearning[];
  onDrilldown?: (target: { agent?: string; symbol?: string; pattern?: string; lesson?: string }) => void;
  onApplyLesson?: (lessonId: string, targetAgentKey?: string | null) => Promise<any> | any;
  onSimulateLesson?: (lessonId: string) => Promise<any> | any;
  onPinLesson?: (lessonId: string, nextPinned: boolean) => Promise<any> | any;
  onSetLessonLifecycle?: (lessonId: string, next: 'candidate' | 'core' | 'deprecated') => Promise<any> | any;
  onGraphBuilt?: (payload: {
    scopeKey: string;
    lens: 'hierarchy' | 'performance' | 'recency' | 'failure_mode' | 'strategy_broker';
    nodeCount: number;
    edgeCount: number;
    buildMs: number;
    conflictCount: number;
    hotNodeCount: number;
  }) => void;
  onLensChanged?: (payload: {
    lens: 'hierarchy' | 'performance' | 'recency' | 'failure_mode' | 'strategy_broker';
    scopeKey: string;
  }) => void;
  onPathGenerated?: (payload: {
    goalText: string;
    stepCount: number;
    highlightedNodeCount: number;
    highlightedEdgeCount: number;
    scopeKey: string;
    summary?: LearningPathSummary | null;
    pathBuildMs?: number;
    pathCoverage?: number;
  }) => void;
  onCaseAction?: (payload: LearningCaseAction, entry: AcademyCase) => void;
  onPathZoom?: (payload: {
    scopeKey: string;
    highlightedNodeCount: number;
    highlightedEdgeCount: number;
    goalText?: string | null;
  }) => void;
  featureFlags?: {
    learningGraphV22Inspector?: boolean;
    learningGraphV22PathSummary?: boolean;
    learningGraphV22LifecycleActions?: boolean;
    learningGraphV23Timeline?: boolean;
    learningGraphV23Diff?: boolean;
    learningGraphV23ConflictResolver?: boolean;
    learningGraphV23PerfWorker?: boolean;
    learningGraphV23EdgeBundling?: boolean;
  } | null;
};

type AgentOption = {
  agentKey: string;
  label: string;
};

type WorkbenchState = {
  selectedAgentKey: string;
  selectedNodeId: string;
  goalText: string;
  lens: NonNullable<LearningGraphFilters['lens']>;
  strategyMode: string;
  broker: string;
  lessonLifecycle: NonNullable<LearningGraphFilters['lessonLifecycle']>;
  confidenceMin: number;
  layoutMode: NonNullable<LearningGraphFilters['layoutMode']>;
  spread: number;
  focusMode: NonNullable<LearningGraphFilters['focusMode']>;
  timeWindow: NonNullable<LearningGraphFilters['timeWindow']>;
  timelineRange: LearningGraphTimelineRange;
  diffMode: LearningGraphDiffMode;
  compareWindow: Extract<LearningGraphTimelineWindow, '7d' | '30d' | '90d' | 'all'>;
  compareAgentId: string;
};

const UI_STORAGE_KEY = 'glass_academy_learning_graph_ui_v2';
const CONFLICT_STORAGE_KEY = 'glass_academy_learning_graph_conflicts_v1';

const toText = (value: any) => String(value || '').trim();

const emptyGraph = (): LearningGraphSnapshot => ({
  builtAtMs: Date.now(),
  scopeKey: 'learning_graph|empty',
  nodes: [],
  edges: [],
  rootNodeIds: [],
  stats: {
    nodeCount: 0,
    edgeCount: 0,
    buildMs: 0,
    conflictCount: 0,
    hotNodeCount: 0
  }
});

const readInitialState = (): WorkbenchState => {
  const fallbackRange = resolveLearningTimelineRange({ window: 'all' });
  const fallback: WorkbenchState = {
    selectedAgentKey: '',
    selectedNodeId: '',
    goalText: '',
    lens: 'hierarchy',
    strategyMode: '',
    broker: '',
    lessonLifecycle: 'all',
    confidenceMin: 0,
    layoutMode: 'hierarchy',
    spread: 1,
    focusMode: 'off',
    timeWindow: 'all',
    timelineRange: fallbackRange,
    diffMode: 'off',
    compareWindow: '30d',
    compareAgentId: ''
  };
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const timelineRange = resolveLearningTimelineRange({
      window: parsed?.timelineRange?.window || parsed?.timeWindow || 'all',
      startAtMs: parsed?.timelineRange?.startAtMs ?? null,
      endAtMs: parsed?.timelineRange?.endAtMs ?? null
    });
    return {
      ...fallback,
      selectedAgentKey: toText(parsed?.selectedAgentKey),
      selectedNodeId: toText(parsed?.selectedNodeId),
      goalText: toText(parsed?.goalText),
      lens: (['hierarchy', 'performance', 'recency', 'failure_mode', 'strategy_broker'].includes(toText(parsed?.lens))
        ? parsed.lens
        : fallback.lens) as WorkbenchState['lens'],
      strategyMode: toText(parsed?.strategyMode),
      broker: toText(parsed?.broker),
      lessonLifecycle: (['all', 'candidate', 'core', 'deprecated'].includes(toText(parsed?.lessonLifecycle))
        ? parsed.lessonLifecycle
        : fallback.lessonLifecycle) as WorkbenchState['lessonLifecycle'],
      confidenceMin: Number.isFinite(Number(parsed?.confidenceMin)) ? Math.max(0, Math.min(1, Number(parsed.confidenceMin))) : 0,
      layoutMode: (['hierarchy', 'radial', 'force'].includes(toText(parsed?.layoutMode))
        ? parsed.layoutMode
        : fallback.layoutMode) as WorkbenchState['layoutMode'],
      spread: Number.isFinite(Number(parsed?.spread)) ? Math.max(0.55, Math.min(2.4, Number(parsed.spread))) : fallback.spread,
      focusMode: (['off', 'hop1', 'hop2', 'path'].includes(toText(parsed?.focusMode))
        ? parsed.focusMode
        : fallback.focusMode) as WorkbenchState['focusMode'],
      timeWindow: (['7d', '30d', '90d', 'all'].includes(toText(parsed?.timeWindow))
        ? parsed.timeWindow
        : fallback.timeWindow) as WorkbenchState['timeWindow'],
      timelineRange,
      diffMode: (['off', 'time_compare', 'agent_compare'].includes(toText(parsed?.diffMode))
        ? parsed.diffMode
        : fallback.diffMode) as LearningGraphDiffMode,
      compareWindow: (['7d', '30d', '90d', 'all'].includes(toText(parsed?.compareWindow))
        ? parsed.compareWindow
        : fallback.compareWindow) as WorkbenchState['compareWindow'],
      compareAgentId: toText(parsed?.compareAgentId)
    };
  } catch {
    return fallback;
  }
};

const buildAgentOptions = (cases: AcademyCase[], lessons: AcademyLesson[]): AgentOption[] => {
  const map = new Map<string, AgentOption>();
  const upsert = (rawKey: any, rawLabel?: any) => {
    const agentKey = normalizeLearningGraphAgentKey(rawKey || rawLabel || 'unknown_agent');
    const label = toText(rawLabel || rawKey || 'Unknown Agent') || 'Unknown Agent';
    if (!map.has(agentKey)) {
      map.set(agentKey, { agentKey, label });
      return;
    }
    const existing = map.get(agentKey);
    if (existing && existing.label.toLowerCase().includes('unknown') && !label.toLowerCase().includes('unknown')) {
      map.set(agentKey, { agentKey, label });
    }
  };
  (cases || []).forEach((entry) => upsert(entry.agentId || entry.agentName, entry.agentName || entry.agentId));
  (lessons || []).forEach((entry) => upsert(entry.agentId || entry.agentName, entry.agentName || entry.agentId));
  return Array.from(map.values()).sort((a, b) => a.agentKey.localeCompare(b.agentKey));
};

const readConflictPoliciesLocal = (): LessonConflictResolution[] => {
  try {
    const raw = localStorage.getItem(CONFLICT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeLearningConflictResolution(entry))
      .filter(Boolean) as LessonConflictResolution[];
  } catch {
    return [];
  }
};

const LearningGraphWorkbench: React.FC<Props> = ({
  cases,
  lessons,
  symbolLearnings,
  onDrilldown,
  onApplyLesson,
  onSimulateLesson,
  onPinLesson,
  onSetLessonLifecycle,
  onGraphBuilt,
  onLensChanged,
  onPathGenerated,
  onCaseAction,
  onPathZoom,
  featureFlags
}) => {
  const initial = useMemo(() => readInitialState(), []);
  const [graph, setGraph] = useState<LearningGraphSnapshot>(() => emptyGraph());
  const [selectedNodeId, setSelectedNodeId] = useState<string>(toText(initial.selectedNodeId));
  const [goalText, setGoalText] = useState<string>(toText(initial.goalText));
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>(toText(initial.selectedAgentKey));
  const [timelineRange, setTimelineRange] = useState<LearningGraphTimelineRange>(initial.timelineRange);
  const [filters, setFilters] = useState<LearningGraphFilters>({
    lens: initial.lens,
    strategyMode: initial.strategyMode || null,
    broker: initial.broker || null,
    lessonLifecycle: initial.lessonLifecycle,
    confidenceMin: initial.confidenceMin,
    layoutMode: initial.layoutMode,
    spread: initial.spread,
    focusMode: initial.focusMode,
    timeWindow: initial.timeWindow
  });
  const [diffMode, setDiffMode] = useState<LearningGraphDiffMode>(initial.diffMode);
  const [compareWindow, setCompareWindow] = useState<Extract<LearningGraphTimelineWindow, '7d' | '30d' | '90d' | 'all'>>(initial.compareWindow);
  const [compareAgentId, setCompareAgentId] = useState<string>(toText(initial.compareAgentId));
  const [diffSnapshot, setDiffSnapshot] = useState<LearningGraphDiffSnapshot | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<string[]>([]);
  const [activePathSummary, setActivePathSummary] = useState<LearningPathSummary | null>(null);
  const [pathZoomNonce, setPathZoomNonce] = useState<number>(0);
  const [pathAnimationNonce, setPathAnimationNonce] = useState<number>(0);
  const [layoutRunNonce, setLayoutRunNonce] = useState<number>(0);
  const [zoomBand, setZoomBand] = useState<'far' | 'mid' | 'near'>('near');
  const [bundleVisibleEdgeIds, setBundleVisibleEdgeIds] = useState<string[] | null>(null);
  const [conflictPolicies, setConflictPolicies] = useState<LessonConflictResolution[]>(() => readConflictPoliciesLocal());
  const [bundleBuildMs, setBundleBuildMs] = useState<number>(0);
  const [workerFallbackCount, setWorkerFallbackCount] = useState<number>(0);
  const agentOptions = useMemo(() => buildAgentOptions(cases, lessons), [cases, lessons]);
  const lastStableAgentRef = useRef<string>(toText(initial.selectedAgentKey));

  useEffect(() => {
    if (selectedAgentKey && agentOptions.some((entry) => entry.agentKey === selectedAgentKey)) {
      lastStableAgentRef.current = selectedAgentKey;
      return;
    }
    const fallback = agentOptions.some((entry) => entry.agentKey === lastStableAgentRef.current)
      ? lastStableAgentRef.current
      : (agentOptions[0]?.agentKey || '');
    setSelectedAgentKey(fallback);
  }, [agentOptions, selectedAgentKey]);

  useEffect(() => {
    lastStableAgentRef.current = toText(selectedAgentKey);
  }, [selectedAgentKey]);

  const timelineEnabled = featureFlags?.learningGraphV23Timeline !== false;
  const diffEnabled = featureFlags?.learningGraphV23Diff !== false;
  const conflictEnabled = featureFlags?.learningGraphV23ConflictResolver !== false;
  const workerEnabled = featureFlags?.learningGraphV23PerfWorker !== false;
  const bundlingEnabled = featureFlags?.learningGraphV23EdgeBundling !== false;

  const timelineResult = useMemo(() => filterAcademyDataByTimeline({
    cases,
    lessons,
    symbolLearnings,
    range: timelineRange
  }), [cases, lessons, symbolLearnings, timelineRange]);

  const strategyOptions = useMemo(() => {
    const set = new Set<string>();
    (timelineResult.cases || []).forEach((entry) => {
      const value = toText(entry.strategyMode);
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [timelineResult.cases]);

  const brokerOptions = useMemo(() => {
    const set = new Set<string>();
    (timelineResult.cases || []).forEach((entry) => {
      const value = toText(entry.executionBroker);
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [timelineResult.cases]);

  const effectiveFilters = useMemo<LearningGraphFilters>(() => ({
    ...filters,
    agentId: selectedAgentKey || null,
    diffMode,
    compareWindow,
    compareAgentId: compareAgentId || null,
    timelineRange
  }), [filters, selectedAgentKey, diffMode, compareWindow, compareAgentId, timelineRange]);

  useEffect(() => {
    const payload = {
      selectedAgentKey,
      selectedNodeId,
      goalText,
      lens: effectiveFilters.lens || 'hierarchy',
      strategyMode: toText(effectiveFilters.strategyMode),
      broker: toText(effectiveFilters.broker),
      lessonLifecycle: effectiveFilters.lessonLifecycle || 'all',
      confidenceMin: Number(effectiveFilters.confidenceMin || 0),
      layoutMode: effectiveFilters.layoutMode || 'hierarchy',
      spread: Number(effectiveFilters.spread ?? 1),
      focusMode: effectiveFilters.focusMode || 'off',
      timeWindow: effectiveFilters.timeWindow || 'all',
      timelineRange,
      diffMode,
      compareWindow,
      compareAgentId
    };
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [compareAgentId, compareWindow, diffMode, effectiveFilters, goalText, selectedAgentKey, selectedNodeId, timelineRange]);

  useEffect(() => {
    try {
      localStorage.setItem(CONFLICT_STORAGE_KEY, JSON.stringify(conflictPolicies));
    } catch {
      // ignore
    }
  }, [conflictPolicies]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const buildInput = {
        cases: timelineResult.cases,
        lessons: timelineResult.lessons,
        symbolLearnings: timelineResult.symbolLearnings,
        filters: effectiveFilters
      };
      let snapshot = buildAcademyLearningGraph(buildInput);
      let fallbackUsed = false;
      if (workerEnabled) {
        const workerRes = await buildLearningGraphSnapshotWithWorker(buildInput);
        snapshot = workerRes.snapshot;
        fallbackUsed = workerRes.fallbackUsed;
      }
      if (fallbackUsed) {
        setWorkerFallbackCount((prev) => prev + 1);
      }
      const withPolicies = conflictEnabled
        ? applyConflictPoliciesToSnapshot({ snapshot, policies: conflictPolicies })
        : snapshot;
      if (cancelled) return;
      setGraph(withPolicies);
      onGraphBuilt?.({
        scopeKey: String(withPolicies.scopeKey || ''),
        lens: (withPolicies.filters?.lens || 'hierarchy') as NonNullable<LearningGraphFilters['lens']>,
        nodeCount: Number(withPolicies.stats?.nodeCount || withPolicies.nodes.length),
        edgeCount: Number(withPolicies.stats?.edgeCount || withPolicies.edges.length),
        buildMs: Number(withPolicies.stats?.buildMs || 0),
        conflictCount: Number(withPolicies.stats?.conflictCount || 0),
        hotNodeCount: Number(withPolicies.stats?.hotNodeCount || 0)
      });
      onLensChanged?.({
        lens: (withPolicies.filters?.lens || 'hierarchy') as NonNullable<LearningGraphFilters['lens']>,
        scopeKey: String(withPolicies.scopeKey || '')
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [conflictEnabled, conflictPolicies, effectiveFilters, onGraphBuilt, onLensChanged, timelineResult, workerEnabled]);

  useEffect(() => {
    if (!bundlingEnabled) {
      setBundleVisibleEdgeIds(null);
      setBundleBuildMs(0);
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (!graph.nodes.length || !graph.edges.length) {
        setBundleVisibleEdgeIds(null);
        setBundleBuildMs(0);
        return;
      }
      let bundle = buildLearningGraphEdgeBundleMap({ snapshot: graph, zoomBand });
      let fallbackUsed = false;
      if (workerEnabled) {
        const workerRes = await buildLearningGraphBundleWithWorker({ snapshot: graph, zoomBand });
        bundle = workerRes.bundle;
        fallbackUsed = workerRes.fallbackUsed;
      }
      if (cancelled) return;
      if (fallbackUsed) {
        setWorkerFallbackCount((prev) => prev + 1);
      }
      setBundleVisibleEdgeIds(bundle.visibleEdgeIds);
      setBundleBuildMs(Number(bundle.buildMs || 0));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [bundlingEnabled, graph, workerEnabled, zoomBand]);

  useEffect(() => {
    if (!diffEnabled || diffMode === 'off') {
      setDiffSnapshot(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const compareBaseFilters: LearningGraphFilters = { ...effectiveFilters, diffMode: 'off' };
      let compareRange = timelineRange;
      let compareAgent = selectedAgentKey;
      if (diffMode === 'time_compare') {
        compareRange = resolveLearningTimelineRange({ window: compareWindow });
      } else if (diffMode === 'agent_compare') {
        compareAgent = compareAgentId || '';
      }
      const compareSlice = filterAcademyDataByTimeline({
        cases,
        lessons,
        symbolLearnings,
        range: compareRange
      });
      const compareSnapshotInput = {
        cases: compareSlice.cases,
        lessons: compareSlice.lessons,
        symbolLearnings: compareSlice.symbolLearnings,
        filters: {
          ...compareBaseFilters,
          agentId: compareAgent || null,
          timelineRange: compareRange
        }
      };
      const compareSnapshot = buildAcademyLearningGraph(compareSnapshotInput);
      let diff = buildLearningGraphDiffSnapshot({ base: graph, compare: compareSnapshot });
      let fallbackUsed = false;
      if (workerEnabled) {
        const workerRes = await buildLearningGraphDiffWithWorker({ base: graph, compare: compareSnapshot });
        diff = workerRes.diff;
        fallbackUsed = workerRes.fallbackUsed;
      }
      if (cancelled) return;
      if (fallbackUsed) {
        setWorkerFallbackCount((prev) => prev + 1);
      }
      setDiffSnapshot(diff);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [cases, compareAgentId, compareWindow, diffEnabled, diffMode, effectiveFilters, graph, lessons, selectedAgentKey, symbolLearnings, timelineRange, workerEnabled]);

  const conflicts = useMemo(() => listLearningSnapshotConflicts({
    snapshot: graph,
    policies: conflictPolicies
  }), [conflictPolicies, graph]);

  const selectedNode = useMemo(() => {
    const id = toText(selectedNodeId);
    if (!id) return null;
    return graph.nodes.find((entry) => String(entry.id) === id) || null;
  }, [graph.nodes, selectedNodeId]);

  const handleDrilldownNode = (node: LearningGraphNode) => {
    if (!onDrilldown) return;
    const target: { agent?: string; symbol?: string; pattern?: string; lesson?: string } = {};
    const byId = new Map(graph.nodes.map((entry) => [String(entry.id), entry]));
    const visited = new Set<string>();
    let cursor: LearningGraphNode | null = node;
    while (cursor && !visited.has(String(cursor.id))) {
      visited.add(String(cursor.id));
      if (!target.lesson && cursor.type === 'lesson') target.lesson = toText(cursor.label);
      if (!target.pattern && cursor.type === 'pattern') target.pattern = toText(cursor.label);
      if (!target.symbol && cursor.type === 'symbol') target.symbol = toText(cursor.label);
      if (!target.agent && cursor.type === 'agent') target.agent = toText(cursor.label);
      if (target.lesson && target.pattern && target.symbol && target.agent) break;
      const parentId = toText(cursor.parentId || cursor.meta?.parentId);
      cursor = parentId ? (byId.get(parentId) || null) : null;
    }
    if (!target.agent) {
      const agentText = toText(node.agentKey || node.meta?.agentKey);
      if (agentText) target.agent = agentText;
    }
    if (!target.symbol && (node.type === 'symbol' || node.type === 'pattern' || node.type === 'lesson')) {
      const symbolText = toText(node.meta?.symbol);
      if (symbolText) target.symbol = symbolText;
    }
    onDrilldown(target);
  };

  const zoomToPath = () => {
    setPathZoomNonce((prev) => prev + 1);
    onPathZoom?.({
      scopeKey: String(graph.scopeKey || ''),
      highlightedNodeCount: highlightedNodeIds.length,
      highlightedEdgeCount: highlightedEdgeIds.length,
      goalText: goalText || null
    });
  };

  const runPath = useCallback(() => {
    const result = buildLearningPathResult({ graph, goalText, filters: effectiveFilters });
    if (!result) {
      setHighlightedNodeIds([]);
      setHighlightedEdgeIds([]);
      setActivePathSummary(null);
      return;
    }
    setHighlightedNodeIds(result.highlightedNodeIds);
    setHighlightedEdgeIds(result.highlightedEdgeIds);
    setActivePathSummary(result.summary);
    setPathAnimationNonce((prev) => prev + 1);
    onPathGenerated?.({
      goalText: result.goalText,
      stepCount: result.steps.length,
      highlightedNodeCount: result.highlightedNodeIds.length,
      highlightedEdgeCount: result.highlightedEdgeIds.length,
      scopeKey: String(graph.scopeKey || ''),
      summary: result.summary,
      pathBuildMs: result.buildMs,
      pathCoverage: result.pathCoverage
    });
  }, [effectiveFilters, goalText, graph, onPathGenerated]);

  const clearPath = useCallback(() => {
    setHighlightedNodeIds([]);
    setHighlightedEdgeIds([]);
    setActivePathSummary(null);
  }, []);

  const handleConflictResolve = useCallback((policy: LessonConflictResolution) => {
    const normalized = normalizeLearningConflictResolution({
      ...policy,
      conflictId: policy.conflictId || buildLearningConflictId(policy.lessonAId, policy.lessonBId)
    });
    if (!normalized) return;
    setConflictPolicies((prev) => mergeLearningConflictPolicies(prev, [normalized]));
    const key = `academy_lesson_conflict_resolution:${normalized.conflictId}`;
    const upsert = window.glass?.tradeLedger?.upsertAgentMemory;
    if (typeof upsert === 'function') {
      void upsert({
        key,
        kind: 'academy_lesson_conflict_resolution',
        payload: { conflictId: normalized.conflictId, policy: normalized },
        updatedAtMs: normalized.updatedAtMs || Date.now(),
        createdAtMs: normalized.createdAtMs || Date.now(),
        source: 'learning_graph_conflict_resolver'
      });
    }
  }, []);

  const compareAgentOptions = useMemo(() => {
    return agentOptions.filter((entry) => entry.agentKey !== selectedAgentKey);
  }, [agentOptions, selectedAgentKey]);

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-cyan-300 uppercase tracking-wide">
        Learning Graph Cockpit
        <span className="ml-2 text-[11px] text-gray-400 normal-case">Explorer • Canvas • Inspector</span>
      </div>
      <LearningGraphLensBar
        filters={effectiveFilters}
        strategyOptions={strategyOptions}
        brokerOptions={brokerOptions}
        goalText={goalText}
        hasActivePath={highlightedNodeIds.length > 0 || highlightedEdgeIds.length > 0}
        onFiltersChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onGoalTextChange={setGoalText}
        onRunPath={runPath}
        onClearPath={clearPath}
        onRerunLayout={() => setLayoutRunNonce((prev) => prev + 1)}
      />
      {timelineEnabled ? (
        <LearningGraphTimelineBar
          range={timelineRange}
          stats={timelineResult.stats}
          onRangeChange={(next) => {
            setTimelineRange(resolveLearningTimelineRange({
              window: next.window,
              startAtMs: next.startAtMs ?? null,
              endAtMs: next.endAtMs ?? null
            }));
          }}
        />
      ) : null}
      {diffEnabled ? (
        <LearningGraphDiffPanel
          diffMode={diffMode}
          compareWindow={compareWindow}
          compareAgentId={compareAgentId || null}
          compareAgentOptions={compareAgentOptions}
          diffSnapshot={diffSnapshot}
          onDiffModeChange={setDiffMode}
          onCompareWindowChange={setCompareWindow}
          onCompareAgentChange={(next) => setCompareAgentId(toText(next))}
        />
      ) : null}
      {(featureFlags?.learningGraphV22PathSummary !== false && activePathSummary) ? (
        <div className="rounded border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-100 flex flex-wrap gap-3 items-center">
          <span className="font-semibold">Path Summary</span>
          <span>Steps: {activePathSummary.stepCount}</span>
          <span>Sample: {activePathSummary.sampleSize}</span>
          <span>Confidence: {Number.isFinite(Number(activePathSummary.confidence)) ? Number(activePathSummary.confidence).toFixed(2) : '--'}</span>
          <span>Impact: {Number.isFinite(Number(activePathSummary.estimatedImpact)) ? Number(activePathSummary.estimatedImpact).toFixed(3) : '--'}</span>
          <button
            type="button"
            onClick={zoomToPath}
            className="ml-auto px-2 py-1 rounded border border-cyan-400/50 hover:bg-cyan-500/10"
          >
            Zoom to Path
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px] gap-3">
        <LearningGraphExplorer
          graph={graph}
          selectedNodeId={selectedNodeId || null}
          highlightedNodeIds={highlightedNodeIds}
          onSelectNode={setSelectedNodeId}
          onDrilldownNode={handleDrilldownNode}
        />
        <LearningGraphCanvas
          graph={graph}
          selectedNodeId={selectedNodeId || null}
          highlightedNodeIds={highlightedNodeIds}
          highlightedEdgeIds={highlightedEdgeIds}
          onSelectNode={setSelectedNodeId}
          layoutRunNonce={layoutRunNonce}
          pathZoomNonce={pathZoomNonce}
          pathAnimationNonce={pathAnimationNonce}
          pathAnimationNodeIds={highlightedNodeIds}
          bundleVisibleEdgeIds={bundleVisibleEdgeIds}
          diffSnapshot={diffSnapshot}
          onZoomBandChange={setZoomBand}
        />
        <div className="space-y-3">
          <label className="block text-[11px] text-gray-400">
            Agent
            <select
              value={selectedAgentKey}
              onChange={(event) => setSelectedAgentKey(normalizeLearningGraphAgentKey(event.target.value))}
              className="mt-1 w-full px-2 py-1 rounded border border-white/10 bg-black/30 text-gray-200"
            >
              <option value="">All agents</option>
              {agentOptions.map((entry) => (
                <option key={entry.agentKey} value={entry.agentKey}>{entry.label}</option>
              ))}
            </select>
          </label>
          <LearningGraphInspector
            graph={graph}
            node={selectedNode as LearningGraphNode | null}
            cases={timelineResult.cases}
            lessons={timelineResult.lessons}
            onApplyLesson={onApplyLesson}
            onSimulateLesson={onSimulateLesson}
            onPinLesson={onPinLesson}
            onSetLessonLifecycle={onSetLessonLifecycle}
            onDrilldownNode={handleDrilldownNode}
            onCaseAction={onCaseAction}
            features={featureFlags}
          />
          {conflictEnabled ? (
            <LearningGraphConflictResolver
              conflicts={conflicts}
              onResolve={handleConflictResolve}
            />
          ) : null}
          <div className="rounded border border-white/10 bg-black/25 px-2 py-1 text-[10px] text-gray-400">
            Nodes {graph.nodes.length} • Edges {graph.edges.length} • Build {Number(graph.stats?.buildMs || 0)}ms • Bundle {bundleBuildMs}ms • Worker fallback {workerFallbackCount}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearningGraphWorkbench;
