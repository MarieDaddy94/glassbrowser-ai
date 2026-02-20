import type {
  AcademyCase,
  AcademyLesson,
  AcademySymbolLearning,
  LearningGraphFilters,
  LearningGraphNode,
  LearningGraphEdge,
  LearningGraphSnapshot
} from '../types';
import { detectLessonConflicts } from './academyLessonConflictService';

const FINAL_OUTCOMES = new Set(['WIN', 'LOSS', 'EXPIRED', 'REJECTED', 'FAILED']);

const asText = (value: any) => String(value || '').trim();

const asNum = (value: any, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
};

const slug = (value: any) =>
  asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const caseTime = (entry: AcademyCase) =>
  asNum(entry.resolvedAtMs ?? entry.executedAtMs ?? entry.createdAtMs ?? 0, 0);

const tfWeight = (value: string | null | undefined) => {
  const key = asText(value).toLowerCase();
  if (!key) return 1;
  if (key === '1m') return 1;
  if (key === '5m') return 1.1;
  if (key === '15m') return 1.2;
  if (key === '30m') return 1.3;
  if (key === '1h') return 1.35;
  if (key === '4h') return 1.45;
  if (key === '1d') return 1.6;
  if (key === '1w') return 1.8;
  return 1.15;
};

const normalizeOutcomeKey = (value: any) => asText(value).toUpperCase();

const normalizeTimeframe = (value: any) => asText(value).toLowerCase();

const parseWindowMs = (value: LearningGraphFilters['timeWindow']) => {
  const now = Date.now();
  if (value === '7d') return now - (7 * 24 * 60 * 60_000);
  if (value === '30d') return now - (30 * 24 * 60 * 60_000);
  if (value === '90d') return now - (90 * 24 * 60 * 60_000);
  return 0;
};

const derivePatternKeyFromCase = (entry: AcademyCase): string => {
  const failureMode = asText((entry.analysis as any)?.failureMode || (entry.analysis as any)?.report?.failureModeTag);
  if (failureMode) return slug(failureMode);

  const patternTag =
    Array.isArray((entry.analysis as any)?.patternTags) && (entry.analysis as any).patternTags.length > 0
      ? asText((entry.analysis as any).patternTags[0])
      : '';
  if (patternTag) return slug(patternTag);

  const reason = asText(entry.reason);
  if (reason) {
    const tokens = reason
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5);
    if (tokens.length > 0) return slug(tokens.join('_'));
  }
  return 'uncategorized_pattern';
};

export const normalizeLearningGraphAgentKey = (value: any) => {
  const normalized = slug(value);
  return normalized || 'unknown_agent';
};

const resolveFilterOutcomes = (filters?: LearningGraphFilters | null) =>
  Array.isArray(filters?.includeOutcomes) && filters?.includeOutcomes.length > 0
    ? new Set(filters.includeOutcomes.map((value) => normalizeOutcomeKey(value)))
    : FINAL_OUTCOMES;

const buildLessonIndexByCase = (lessons: AcademyLesson[]) => {
  const byCaseId = new Map<string, AcademyLesson[]>();
  for (const lesson of lessons) {
    const evidenceIds = Array.isArray(lesson.evidenceCaseIds) ? lesson.evidenceCaseIds : [];
    for (const raw of evidenceIds) {
      const caseId = asText(raw);
      if (!caseId) continue;
      if (!byCaseId.has(caseId)) byCaseId.set(caseId, []);
      byCaseId.get(caseId)?.push(lesson);
    }
  }
  return byCaseId;
};

const lessonMatchesScope = (
  lesson: AcademyLesson,
  params: { agentKey: string; symbol: string; strategyMode?: string | null; broker?: string | null }
) => {
  const lessonAgent = asText(lesson.agentId || lesson.agentName);
  if (lessonAgent && normalizeLearningGraphAgentKey(lessonAgent) !== params.agentKey) return false;
  const applies = lesson.appliesTo || {};
  const lessonSymbol = asText(applies.symbol);
  if (lessonSymbol && lessonSymbol.toUpperCase() !== asText(params.symbol).toUpperCase()) return false;
  if (params.strategyMode) {
    const lessonMode = asText(applies.strategyMode);
    if (lessonMode && lessonMode.toLowerCase() !== asText(params.strategyMode).toLowerCase()) return false;
  }
  if (params.broker) {
    const lessonBroker = asText(applies.broker);
    if (lessonBroker && lessonBroker.toLowerCase() !== asText(params.broker).toLowerCase()) return false;
  }
  return true;
};

const makeScopeKey = (filters?: LearningGraphFilters | null) => {
  const agent = asText(filters?.agentId || 'all');
  const lens = asText(filters?.lens || 'hierarchy');
  const win = asText(filters?.timeWindow || 'all');
  const mode = asText(filters?.strategyMode || 'all');
  const broker = asText(filters?.broker || 'all');
  const life = asText(filters?.lessonLifecycle || 'all');
  const conf = Number.isFinite(Number(filters?.confidenceMin)) ? Number(filters?.confidenceMin) : 0;
  const layout = asText(filters?.layoutMode || 'hierarchy');
  const spread = Number.isFinite(Number(filters?.spread)) ? Number(filters?.spread) : 1;
  const focus = asText(filters?.focusMode || 'off');
  return `learning_graph|a:${agent}|l:${lens}|w:${win}|m:${mode}|b:${broker}|ls:${life}|c:${conf}|ly:${layout}|sp:${spread}|f:${focus}`;
};

type GraphBuildCoreResult = {
  nodes: LearningGraphNode[];
  edges: LearningGraphEdge[];
  rootNodeIds: string[];
};

export const buildHierarchyNodesEdges = (input: {
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings?: AcademySymbolLearning[];
  filters?: LearningGraphFilters | null;
}): GraphBuildCoreResult => {
  const filters = input.filters || null;
  const includeOutcomes = resolveFilterOutcomes(filters);
  const selectedAgentKey = asText(filters?.agentId) ? normalizeLearningGraphAgentKey(filters?.agentId) : '';
  const windowStartMs = parseWindowMs(filters?.timeWindow || 'all');
  const strategyFilter = asText(filters?.strategyMode).toLowerCase();
  const brokerFilter = asText(filters?.broker).toLowerCase();
  const lifecycleFilter = asText(filters?.lessonLifecycle || 'all').toLowerCase();
  const confidenceMin = Number.isFinite(Number(filters?.confidenceMin)) ? Number(filters?.confidenceMin) : 0;

  const allCases = Array.isArray(input.cases) ? input.cases : [];
  const filteredCases = allCases
    .filter((entry) => entry && includeOutcomes.has(normalizeOutcomeKey(entry.outcome || entry.status)))
    .filter((entry) => {
      if (windowStartMs <= 0) return true;
      return caseTime(entry) >= windowStartMs;
    })
    .filter((entry) => {
      if (!selectedAgentKey) return true;
      return normalizeLearningGraphAgentKey(entry.agentId || entry.agentName || 'unknown_agent') === selectedAgentKey;
    })
    .filter((entry) => {
      if (!strategyFilter) return true;
      return asText(entry.strategyMode).toLowerCase() === strategyFilter;
    })
    .filter((entry) => {
      if (!brokerFilter) return true;
      return asText(entry.executionBroker).toLowerCase() === brokerFilter;
    })
    .sort((a, b) => caseTime(b) - caseTime(a));

  const allLessons = Array.isArray(input.lessons) ? input.lessons : [];
  const filteredLessons = allLessons
    .filter((lesson) => {
      if (lifecycleFilter === 'all' || !lifecycleFilter) return true;
      return asText(lesson.lifecycleState || 'candidate').toLowerCase() === lifecycleFilter;
    })
    .filter((lesson) => {
      const confidence = asNum(lesson.confidence, 0);
      if (confidenceMin <= 0) return true;
      return confidence >= confidenceMin;
    });
  const lessonsByCaseId = buildLessonIndexByCase(filteredLessons);

  const nodes: LearningGraphNode[] = [];
  const edges: LearningGraphEdge[] = [];
  const rootNodeIds: string[] = [];
  const nodeById = new Map<string, LearningGraphNode>();
  const edgeSeen = new Set<string>();

  const ensureNode = (node: LearningGraphNode) => {
    const existing = nodeById.get(node.id);
    if (existing) return existing;
    nodeById.set(node.id, node);
    nodes.push(node);
    return node;
  };
  const ensureEdge = (edge: LearningGraphEdge) => {
    const id = String(edge.id || '').trim();
    if (!id || edgeSeen.has(id)) return;
    edgeSeen.add(id);
    edges.push(edge);
  };

  const agentGroups = new Map<string, AcademyCase[]>();
  for (const entry of filteredCases) {
    const agentKey = normalizeLearningGraphAgentKey(entry.agentId || entry.agentName || 'unknown_agent');
    if (!agentGroups.has(agentKey)) agentGroups.set(agentKey, []);
    agentGroups.get(agentKey)?.push(entry);
  }

  for (const [agentKey, agentCases] of agentGroups.entries()) {
    const agentLabel = asText(agentCases[0]?.agentName || agentCases[0]?.agentId || 'Unknown Agent') || 'Unknown Agent';
    const agentNodeId = `agent:${slug(agentKey || agentLabel) || 'unknown'}`;
    const agentWins = agentCases.filter((entry) => normalizeOutcomeKey(entry.outcome || entry.status) === 'WIN').length;
    const agentLosses = agentCases.filter((entry) => normalizeOutcomeKey(entry.outcome || entry.status) === 'LOSS').length;
    ensureNode({
      id: agentNodeId,
      type: 'agent',
      kind: 'agent',
      label: agentLabel,
      agentKey,
      sampleSize: agentCases.length,
      lastSeenAtMs: Math.max(...agentCases.map((entry) => caseTime(entry)), 0),
      evidenceCaseIds: agentCases.map((entry) => entry.id).slice(0, 400),
      meta: {
        agentKey,
        tradeCount: agentCases.length,
        wins: agentWins,
        losses: agentLosses,
        netR: agentCases.reduce((sum, entry) => sum + (Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0), 0)
      }
    });
    rootNodeIds.push(agentNodeId);

    const symbolGroups = new Map<string, AcademyCase[]>();
    for (const entry of agentCases) {
      const symbolKey = asText(entry.symbol || 'UNKNOWN').toUpperCase();
      if (!symbolGroups.has(symbolKey)) symbolGroups.set(symbolKey, []);
      symbolGroups.get(symbolKey)?.push(entry);
    }

    for (const [symbolKey, symbolCases] of symbolGroups.entries()) {
      const symbolNodeId = `${agentNodeId}|symbol:${slug(symbolKey) || 'unknown'}`;
      const symbolWins = symbolCases.filter((entry) => normalizeOutcomeKey(entry.outcome || entry.status) === 'WIN').length;
      const symbolLosses = symbolCases.filter((entry) => normalizeOutcomeKey(entry.outcome || entry.status) === 'LOSS').length;
      const symbolNetR = symbolCases.reduce((sum, entry) => sum + (Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0), 0);
      ensureNode({
        id: symbolNodeId,
        type: 'symbol',
        kind: 'symbol',
        label: symbolKey,
        parentId: agentNodeId,
        agentKey,
        sampleSize: symbolCases.length,
        lastSeenAtMs: Math.max(...symbolCases.map((entry) => caseTime(entry)), 0),
        evidenceCaseIds: symbolCases.map((entry) => entry.id).slice(0, 400),
        meta: {
          tradeCount: symbolCases.length,
          wins: symbolWins,
          losses: symbolLosses,
          winRate: symbolCases.length > 0 ? symbolWins / symbolCases.length : 0,
          netR: symbolNetR
        }
      });
      ensureEdge({
        id: `${agentNodeId}->${symbolNodeId}`,
        source: agentNodeId,
        target: symbolNodeId,
        type: 'contains',
        weight: symbolCases.length
      });

      const patternGroups = new Map<string, AcademyCase[]>();
      for (const entry of symbolCases) {
        const patternKey = derivePatternKeyFromCase(entry);
        if (!patternGroups.has(patternKey)) patternGroups.set(patternKey, []);
        patternGroups.get(patternKey)?.push(entry);
      }

      for (const [patternKey, patternCases] of patternGroups.entries()) {
        const patternNodeId = `${symbolNodeId}|pattern:${slug(patternKey) || 'uncategorized_pattern'}`;
        const patternWins = patternCases.filter((entry) => normalizeOutcomeKey(entry.outcome || entry.status) === 'WIN').length;
        const patternLosses = patternCases.filter((entry) => normalizeOutcomeKey(entry.outcome || entry.status) === 'LOSS').length;
        const patternNetR = patternCases.reduce((sum, entry) => sum + (Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0), 0);
        const patternTimeframeWeighted = patternCases.reduce((sum, entry) => sum + tfWeight(entry.timeframe), 0);
        ensureNode({
          id: patternNodeId,
          type: 'pattern',
          kind: 'pattern',
          label: patternKey || 'uncategorized_pattern',
          parentId: symbolNodeId,
          agentKey,
          sampleSize: patternCases.length,
          lastSeenAtMs: Math.max(...patternCases.map((entry) => caseTime(entry)), 0),
          evidenceCaseIds: patternCases.map((entry) => entry.id).slice(0, 400),
          meta: {
            tradeCount: patternCases.length,
            wins: patternWins,
            losses: patternLosses,
            winRate: patternCases.length > 0 ? patternWins / patternCases.length : 0,
            netR: patternNetR,
            timeframeWeightedSupport: patternTimeframeWeighted
          }
        });
        ensureEdge({
          id: `${symbolNodeId}->${patternNodeId}`,
          source: symbolNodeId,
          target: patternNodeId,
          type: 'contains',
          weight: patternCases.length
        });

        const lessonMap = new Map<string, AcademyLesson>();
        for (const patternCase of patternCases) {
          const caseId = asText(patternCase.id || patternCase.signalId);
          if (!caseId) continue;
          const fromEvidence = lessonsByCaseId.get(caseId) || [];
          for (const lesson of fromEvidence) {
            lessonMap.set(asText(lesson.id), lesson);
          }
        }
        for (const lesson of filteredLessons) {
          if (!lessonMatchesScope(lesson, {
            agentKey,
            symbol: symbolKey,
            strategyMode: patternCases[0]?.strategyMode || null,
            broker: patternCases[0]?.executionBroker || null
          })) continue;
          const lessonId = asText(lesson.id);
          if (!lessonId) continue;
          lessonMap.set(lessonId, lesson);
        }

        for (const lesson of lessonMap.values()) {
          const lessonNodeId = `${patternNodeId}|lesson:${slug(lesson.id) || slug(lesson.title) || 'lesson'}`;
          const lessonEvidence = Array.isArray(lesson.evidenceCaseIds)
            ? lesson.evidenceCaseIds.map((entry) => String(entry)).filter(Boolean)
            : [];
          ensureNode({
            id: lessonNodeId,
            type: 'lesson',
            kind: 'lesson',
            label: asText(lesson.title) || 'Untitled Lesson',
            parentId: patternNodeId,
            agentKey,
            sampleSize: lessonEvidence.length || patternCases.length,
            confidence: Number.isFinite(Number(lesson.confidence)) ? Number(lesson.confidence) : null,
            lastSeenAtMs: asNum(lesson.updatedAtMs ?? lesson.createdAtMs, 0) || Math.max(...patternCases.map((entry) => caseTime(entry)), 0),
            evidenceCaseIds: lessonEvidence.length > 0 ? lessonEvidence : patternCases.map((entry) => entry.id).slice(0, 200),
            meta: {
              lessonId: lesson.id,
              lifecycleState: lesson.lifecycleState || 'candidate',
              confidence: lesson.confidence ?? null,
              outcome: lesson.outcome ?? null,
              pinned: lesson.pinned === true,
              recommendedAction: lesson.recommendedAction || null,
              appliesTo: lesson.appliesTo || null
            }
          });
          ensureEdge({
            id: `${patternNodeId}->${lessonNodeId}`,
            source: patternNodeId,
            target: lessonNodeId,
            type: 'learns_from',
            weight: lessonEvidence.length || patternCases.length
          });
          const supportCount = patternCases.filter((entry) => {
            const ids = new Set(lessonEvidence);
            return ids.size === 0 || ids.has(String(entry.id));
          }).length;
          ensureEdge({
            id: `${lessonNodeId}->${patternNodeId}|supports`,
            source: lessonNodeId,
            target: patternNodeId,
            type: 'supports',
            weight: supportCount || patternCases.length,
            supportCount: supportCount || patternCases.length
          });
        }
      }
    }
  }

  const symbolLeaningList = Array.isArray(input.symbolLearnings) ? input.symbolLearnings : [];
  for (const learning of symbolLeaningList) {
    const symbolKey = asText(learning.symbol).toUpperCase();
    if (!symbolKey) continue;
    const symbolNode = nodes.find((node) => node.type === 'symbol' && asText(node.label).toUpperCase() === symbolKey);
    if (!symbolNode) continue;
    const best = Array.isArray(learning.bestConditions) ? learning.bestConditions.slice(0, 4).join(' | ') : null;
    symbolNode.meta = {
      ...(symbolNode.meta || {}),
      symbolLearningSummary: learning.summary || null,
      symbolLearningBestConditions: best,
      symbolLearningFailurePatterns: Array.isArray(learning.failurePatterns) ? learning.failurePatterns.slice(0, 4) : null,
      symbolLearningAvgScore: learning.avgScore ?? null
    };
  }

  return { nodes, edges, rootNodeIds };
};

export const deriveSupportEdges = (input: GraphBuildCoreResult): GraphBuildCoreResult => {
  const outEdges = [...input.edges];
  const seen = new Set(outEdges.map((edge) => edge.id));
  const patternNodes = input.nodes.filter((node) => node.type === 'pattern');
  for (const node of patternNodes) {
    const siblings = input.nodes.filter((entry) => entry.parentId === node.parentId && entry.type === 'pattern' && entry.id !== node.id);
    for (const sib of siblings) {
      const leftCases = Number(node.sampleSize || node.meta?.tradeCount || 0);
      const rightCases = Number(sib.sampleSize || sib.meta?.tradeCount || 0);
      if (leftCases <= 0 || rightCases <= 0) continue;
      const sharedWeight = Math.min(leftCases, rightCases);
      if (sharedWeight < 2) continue;
      const id = `${node.id}<->${sib.id}|co`;
      if (seen.has(id)) continue;
      seen.add(id);
      outEdges.push({
        id,
        source: node.id,
        target: sib.id,
        type: 'co_occurs',
        weight: sharedWeight
      });
    }
  }
  return {
    ...input,
    edges: outEdges
  };
};

export const deriveConflictEdges = (input: {
  graph: GraphBuildCoreResult;
  lessons: AcademyLesson[];
}): GraphBuildCoreResult => {
  const conflicts = detectLessonConflicts(input.lessons || []);
  if (conflicts.length === 0) return input.graph;
  const nodeByLessonId = new Map<string, LearningGraphNode[]>();
  for (const node of input.graph.nodes) {
    if (node.type !== 'lesson') continue;
    const lessonId = asText(node.meta?.lessonId || node.id);
    if (!lessonId) continue;
    if (!nodeByLessonId.has(lessonId)) nodeByLessonId.set(lessonId, []);
    nodeByLessonId.get(lessonId)?.push(node);
  }
  const edges = [...input.graph.edges];
  const seen = new Set(edges.map((edge) => edge.id));
  const markContradicted = new Set<string>();
  for (const conflict of conflicts) {
    const left = nodeByLessonId.get(conflict.lessonAId) || [];
    const right = nodeByLessonId.get(conflict.lessonBId) || [];
    if (left.length === 0 || right.length === 0) continue;
    for (const l of left) {
      for (const r of right) {
        if (l.id === r.id) continue;
        markContradicted.add(l.id);
        markContradicted.add(r.id);
        const id = `${l.id}<->${r.id}|conflict`;
        if (!seen.has(id)) {
          seen.add(id);
          edges.push({
            id,
            source: l.id,
            target: r.id,
            type: 'conflicts',
            weight: 1,
            confidence: conflict.confidence
          });
        }
        if (conflict.overrideCondition) {
          const overrideId = `${l.id}->${r.id}|override`;
          if (!seen.has(overrideId)) {
            seen.add(overrideId);
            edges.push({
              id: overrideId,
              source: l.id,
              target: r.id,
              type: 'overrides_when',
              weight: 1,
              confidence: conflict.confidence
            });
          }
        }
      }
    }
  }
  const nodes = input.graph.nodes.map((node) => {
    if (!markContradicted.has(node.id)) return node;
    return {
      ...node,
      contradicted: true
    };
  });
  return {
    ...input.graph,
    nodes,
    edges
  };
};

export const enrichNodeMetrics = (input: GraphBuildCoreResult): GraphBuildCoreResult => {
  const now = Date.now();
  const nodes = input.nodes.map((node) => {
    const sampleSize = Number(node.sampleSize || node.meta?.tradeCount || 0) || 0;
    const wins = Number(node.meta?.wins || 0) || 0;
    const losses = Number(node.meta?.losses || 0) || 0;
    const winRate = sampleSize > 0 ? wins / sampleSize : 0;
    const netR = Number(node.meta?.netR || 0) || 0;
    const normalizedNetR = clamp(netR / Math.max(1, sampleSize * 1.5), -1.5, 1.5);
    const winRateLift = clamp(winRate - 0.5, -0.5, 0.5);
    const confidenceSample = sampleSize / (sampleSize + 8);
    const consistencyPenalty = sampleSize > 0 ? Math.abs(wins - losses) / sampleSize : 0;
    const lastSeenAtMs = Number(node.lastSeenAtMs || node.meta?.recentResolvedAtMs || 0) || 0;
    const ageHours = lastSeenAtMs > 0 ? Math.max(0, (now - lastSeenAtMs) / (60 * 60_000)) : 999;
    const recencyScore = lastSeenAtMs > 0 ? clamp(1 - (ageHours / (24 * 7)), 0, 1) : 0;
    const preventedLossEstimate = clamp((losses * 0.08) * (node.confidence ?? confidenceSample), 0, 8);
    const confidence = clamp(confidenceSample * (0.6 + (1 - consistencyPenalty) * 0.4) * (0.45 + recencyScore * 0.55), 0, 1);
    const impactScoreRaw =
      (0.35 * normalizedNetR) +
      (0.25 * winRateLift) +
      (0.20 * clamp(preventedLossEstimate / 8, 0, 1)) +
      (0.20 * recencyScore);
    const impactScore = Math.round(impactScoreRaw * 1000) / 1000;
    const hot = recencyScore >= 0.6 && sampleSize >= 2;
    return {
      ...node,
      sampleSize,
      confidence: Math.round(confidence * 1000) / 1000,
      impactScore,
      lastSeenAtMs: lastSeenAtMs || null,
      hot,
      meta: {
        ...(node.meta || {}),
        winRate,
        netR,
        normalizedNetR,
        winRateLift,
        preventedLossEstimate,
        recencyScore
      }
    };
  });
  const edgeSupport = new Map<string, number>();
  for (const edge of input.edges) {
    const weight = Number(edge.supportCount ?? edge.weight ?? 0) || 0;
    edgeSupport.set(edge.id, weight);
  }
  const edges = input.edges.map((edge) => ({
    ...edge,
    supportCount: Number(edge.supportCount ?? edge.weight ?? edgeSupport.get(edge.id) ?? 0) || null,
    confidence: edge.confidence ?? (Number(edge.supportCount ?? edge.weight ?? 0) > 0 ? clamp(Number(edge.supportCount ?? edge.weight ?? 0) / 20, 0.1, 1) : null)
  }));
  return { ...input, nodes, edges };
};

export const applyLensTransform = (
  input: GraphBuildCoreResult,
  lens: LearningGraphFilters['lens'] | null | undefined
): GraphBuildCoreResult => {
  const lensKey = asText(lens || 'hierarchy').toLowerCase();
  const nodes = input.nodes.map((node) => {
    const impact = Number(node.impactScore || 0);
    const recency = Number(node.meta?.recencyScore || 0);
    let viewColor = '#64748b';
    if (lensKey === 'performance') {
      viewColor = impact >= 0.1 ? '#34d399' : impact <= -0.1 ? '#fb7185' : '#94a3b8';
    } else if (lensKey === 'recency') {
      viewColor = recency >= 0.65 ? '#22d3ee' : recency >= 0.35 ? '#60a5fa' : '#64748b';
    } else if (lensKey === 'failure_mode') {
      const label = asText(node.label).toLowerCase();
      viewColor = label.includes('trap') || label.includes('failure') || label.includes('loss') ? '#f59e0b' : '#64748b';
    } else if (lensKey === 'strategy_broker') {
      viewColor = '#a78bfa';
    } else {
      viewColor = node.type === 'agent'
        ? '#06b6d4'
        : node.type === 'symbol'
          ? '#38bdf8'
          : node.type === 'pattern'
            ? '#6366f1'
            : '#14b8a6';
    }
    return {
      ...node,
      meta: {
        ...(node.meta || {}),
        viewColor
      }
    };
  });
  return {
    ...input,
    nodes
  };
};

export const buildAcademyLearningGraph = (input: {
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings?: AcademySymbolLearning[];
  filters?: LearningGraphFilters | null;
}): LearningGraphSnapshot => {
  const buildStartedAt = performance.now();
  const filters = input.filters || null;
  const hierarchy = buildHierarchyNodesEdges({
    cases: input.cases || [],
    lessons: input.lessons || [],
    symbolLearnings: input.symbolLearnings || [],
    filters
  });
  const withSupport = deriveSupportEdges(hierarchy);
  const withConflicts = deriveConflictEdges({
    graph: withSupport,
    lessons: Array.isArray(input.lessons) ? input.lessons : []
  });
  const withMetrics = enrichNodeMetrics(withConflicts);
  const transformed = applyLensTransform(withMetrics, filters?.lens || 'hierarchy');
  const buildMs = Math.max(1, Math.round(performance.now() - buildStartedAt));
  const conflictCount = transformed.edges.filter((edge) => edge.type === 'conflicts').length;
  const hotNodeCount = transformed.nodes.filter((node) => node.hot === true).length;
  return {
    builtAtMs: Date.now(),
    scopeKey: makeScopeKey(filters),
    filters,
    nodes: transformed.nodes,
    edges: transformed.edges,
    rootNodeIds: transformed.rootNodeIds,
    stats: {
      nodeCount: transformed.nodes.length,
      edgeCount: transformed.edges.length,
      buildMs,
      conflictCount,
      hotNodeCount
    },
    builtFromCursor: {
      cases: Array.isArray(input.cases) ? input.cases.length : null,
      lessons: Array.isArray(input.lessons) ? input.lessons.length : null,
      symbols: Array.isArray(input.symbolLearnings) ? input.symbolLearnings.length : null
    }
  };
};
