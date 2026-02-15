import type {
  AcademyCase,
  AcademyLesson,
  AcademySymbolLearning,
  LearningGraphFilters,
  LearningGraphNode,
  LearningGraphEdge,
  LearningGraphSnapshot
} from '../types';

const FINAL_OUTCOMES = new Set(['WIN', 'LOSS', 'EXPIRED', 'REJECTED', 'FAILED']);

const asText = (value: any) => String(value || '').trim();

const slug = (value: any) =>
  asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeLearningGraphAgentKey = (value: any) => {
  const normalized = slug(value);
  return normalized || 'unknown_agent';
};

const derivePatternKeyFromCase = (entry: AcademyCase): string => {
  const failureMode = asText((entry.analysis as any)?.failureMode);
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
      .slice(0, 4);
    if (tokens.length > 0) return slug(tokens.join('_'));
  }
  return 'uncategorized_pattern';
};

const caseTime = (entry: AcademyCase) =>
  Number(entry.resolvedAtMs ?? entry.executedAtMs ?? entry.createdAtMs ?? 0) || 0;

const buildLessonIndex = (lessons: AcademyLesson[]) => {
  const byCaseId = new Map<string, AcademyLesson[]>();
  for (const lesson of lessons) {
    const evidence = Array.isArray(lesson.evidenceCaseIds) ? lesson.evidenceCaseIds : [];
    for (const caseId of evidence) {
      const key = asText(caseId);
      if (!key) continue;
      if (!byCaseId.has(key)) byCaseId.set(key, []);
      byCaseId.get(key)?.push(lesson);
    }
  }
  return byCaseId;
};

export const buildAcademyLearningGraph = (input: {
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings?: AcademySymbolLearning[];
  filters?: LearningGraphFilters | null;
}): LearningGraphSnapshot => {
  const filters = input.filters || null;
  const includeOutcomes =
    Array.isArray(filters?.includeOutcomes) && filters?.includeOutcomes?.length
      ? new Set(filters.includeOutcomes.map((value) => asText(value).toUpperCase()))
      : FINAL_OUTCOMES;
  const selectedAgentRaw = asText(filters?.agentId);
  const selectedAgentKey = selectedAgentRaw ? normalizeLearningGraphAgentKey(selectedAgentRaw) : '';
  const resolvedCases = (Array.isArray(input.cases) ? input.cases : [])
    .filter((entry) => entry && includeOutcomes.has(asText(entry.outcome || entry.status).toUpperCase()))
    .filter((entry) => {
      if (!selectedAgentKey) return true;
      const entryAgentKey = normalizeLearningGraphAgentKey(entry.agentId || entry.agentName || 'unknown_agent');
      return entryAgentKey === selectedAgentKey;
    })
    .sort((a, b) => caseTime(b) - caseTime(a));

  const lessons = Array.isArray(input.lessons) ? input.lessons : [];
  const byCaseId = buildLessonIndex(lessons);

  const nodes: LearningGraphNode[] = [];
  const edges: LearningGraphEdge[] = [];
  const rootNodeIds: string[] = [];
  const nodeSeen = new Set<string>();

  const ensureNode = (node: LearningGraphNode) => {
    if (nodeSeen.has(node.id)) return;
    nodeSeen.add(node.id);
    nodes.push(node);
  };

  const ensureEdge = (edge: LearningGraphEdge) => {
    if (edges.some((entry) => entry.id === edge.id)) return;
    edges.push(edge);
  };

  const agentGroups = new Map<string, AcademyCase[]>();
  for (const entry of resolvedCases) {
    const agentKey = normalizeLearningGraphAgentKey(entry.agentId || entry.agentName || 'unknown_agent');
    if (!agentGroups.has(agentKey)) agentGroups.set(agentKey, []);
    agentGroups.get(agentKey)?.push(entry);
  }

  for (const [agentKey, agentCases] of agentGroups.entries()) {
    const agentLabel = asText(agentCases[0]?.agentName || agentCases[0]?.agentId || 'Unknown Agent') || 'Unknown Agent';
    const agentNodeId = `agent:${slug(agentKey || agentLabel) || 'unknown'}`;
    ensureNode({
      id: agentNodeId,
      type: 'agent',
      label: agentLabel,
      meta: {
        agentKey,
        tradeCount: agentCases.length,
        wins: agentCases.filter((entry) => asText(entry.outcome).toUpperCase() === 'WIN').length,
        losses: agentCases.filter((entry) => asText(entry.outcome).toUpperCase() === 'LOSS').length
      }
    });
    rootNodeIds.push(agentNodeId);

    const symbolGroups = new Map<string, AcademyCase[]>();
    for (const entry of agentCases) {
      const symbolKey = asText(entry.symbol || 'UNKNOWN');
      if (!symbolGroups.has(symbolKey)) symbolGroups.set(symbolKey, []);
      symbolGroups.get(symbolKey)?.push(entry);
    }

    for (const [symbolKey, symbolCases] of symbolGroups.entries()) {
      const symbolNodeId = `${agentNodeId}|symbol:${slug(symbolKey) || 'unknown'}`;
      ensureNode({
        id: symbolNodeId,
        type: 'symbol',
        label: symbolKey,
        parentId: agentNodeId,
        meta: {
          tradeCount: symbolCases.length,
          wins: symbolCases.filter((entry) => asText(entry.outcome).toUpperCase() === 'WIN').length,
          losses: symbolCases.filter((entry) => asText(entry.outcome).toUpperCase() === 'LOSS').length,
          recentResolvedAtMs: Math.max(...symbolCases.map((entry) => caseTime(entry)), 0)
        }
      });
      ensureEdge({
        id: `${agentNodeId}->${symbolNodeId}`,
        source: agentNodeId,
        target: symbolNodeId,
        type: 'contains'
      });

      const patternGroups = new Map<string, AcademyCase[]>();
      for (const entry of symbolCases) {
        const patternKey = derivePatternKeyFromCase(entry);
        if (!patternGroups.has(patternKey)) patternGroups.set(patternKey, []);
        patternGroups.get(patternKey)?.push(entry);
      }

      for (const [patternKey, patternCases] of patternGroups.entries()) {
        const patternNodeId = `${symbolNodeId}|pattern:${slug(patternKey) || 'uncategorized_pattern'}`;
        ensureNode({
          id: patternNodeId,
          type: 'pattern',
          label: patternKey || 'uncategorized_pattern',
          parentId: symbolNodeId,
          meta: {
            tradeCount: patternCases.length,
            wins: patternCases.filter((entry) => asText(entry.outcome).toUpperCase() === 'WIN').length,
            losses: patternCases.filter((entry) => asText(entry.outcome).toUpperCase() === 'LOSS').length,
            caseIds: patternCases.map((entry) => entry.id)
          }
        });
        ensureEdge({
          id: `${symbolNodeId}->${patternNodeId}`,
          source: symbolNodeId,
          target: patternNodeId,
          type: 'contains'
        });

        const lessonSet = new Map<string, AcademyLesson>();
        for (const patternCase of patternCases) {
          const caseId = asText(patternCase.id || patternCase.signalId);
          if (!caseId) continue;
          const fromEvidence = byCaseId.get(caseId) || [];
          for (const lesson of fromEvidence) {
            lessonSet.set(asText(lesson.id), lesson);
          }
        }

        for (const lesson of lessons) {
          const lessonId = asText(lesson.id);
          if (!lessonId || lessonSet.has(lessonId)) continue;
          const lessonAgent = asText(lesson.agentId || lesson.agentName);
          const lessonSymbol = asText(lesson.appliesTo?.symbol);
          if (lessonAgent && normalizeLearningGraphAgentKey(lessonAgent) !== agentKey) continue;
          if (lessonSymbol && lessonSymbol !== symbolKey) continue;
          lessonSet.set(lessonId, lesson);
        }

        for (const lesson of lessonSet.values()) {
          const lessonNodeId = `${patternNodeId}|lesson:${slug(lesson.id) || slug(lesson.title) || 'lesson'}`;
          ensureNode({
            id: lessonNodeId,
            type: 'lesson',
            label: asText(lesson.title) || 'Untitled Lesson',
            parentId: patternNodeId,
            meta: {
              lessonId: lesson.id,
              confidence: lesson.confidence ?? null,
              outcome: lesson.outcome ?? null,
              updatedAtMs: lesson.updatedAtMs ?? lesson.createdAtMs ?? null
            }
          });
          ensureEdge({
            id: `${patternNodeId}->${lessonNodeId}`,
            source: patternNodeId,
            target: lessonNodeId,
            type: 'learns_from'
          });
        }
      }
    }
  }

  return {
    builtAtMs: Date.now(),
    filters,
    nodes,
    edges,
    rootNodeIds
  };
};
