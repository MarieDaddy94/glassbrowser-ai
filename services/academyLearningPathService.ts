import type { LearningGraphFilters, LearningGraphSnapshot, LearningPathSummary } from '../types';

const asText = (value: any) => String(value || '').trim();

export type LearningGoalTemplateId =
  | 'reduce_stopouts'
  | 'fix_oversold_mean_reversion_trap'
  | 'improve_session_scalps';

export type LearningGoalTemplate = {
  id: LearningGoalTemplateId;
  label: string;
  keywords: string[];
};

export const LEARNING_GOAL_TEMPLATES: LearningGoalTemplate[] = [
  {
    id: 'reduce_stopouts',
    label: 'Reduce stop-outs on continuation shorts',
    keywords: ['stop', 'stop-out', 'invalidation', 'continuation', 'short']
  },
  {
    id: 'fix_oversold_mean_reversion_trap',
    label: 'Fix oversold mean reversion trap',
    keywords: ['oversold', 'mean', 'reversion', 'trap', 'reclaim']
  },
  {
    id: 'improve_session_scalps',
    label: 'Improve session-specific scalps',
    keywords: ['session', 'london', 'ny', 'scalp', 'open']
  }
];

export type LearningPathStep = {
  nodeId: string;
  label: string;
  type: string;
  score: number;
  evidenceCount: number;
  confidence?: number | null;
  impactScore?: number | null;
};

export type LearningPathResult = {
  goalText: string;
  filters: LearningGraphFilters | null;
  highlightedNodeIds: string[];
  highlightedEdgeIds: string[];
  steps: LearningPathStep[];
  summary: LearningPathSummary;
  buildMs: number;
  pathCoverage: number;
};

const scoreNodeAgainstGoal = (node: any, keywords: string[]) => {
  const label = asText(node?.label).toLowerCase();
  const reason = asText(node?.meta?.reason).toLowerCase();
  const hay = `${label} ${reason}`;
  let hit = 0;
  for (const word of keywords) {
    if (hay.includes(word.toLowerCase())) hit += 1;
  }
  const evidence = Number(node?.sampleSize || node?.meta?.tradeCount || 0) || 0;
  const impact = Number(node?.impactScore || node?.meta?.impactScore || 0) || 0;
  const confidence = Number(node?.confidence || node?.meta?.confidence || 0) || 0;
  return hit * 1.2 + Math.min(2.5, evidence / 8) + Math.max(-1, Math.min(3, impact)) + confidence;
};

const templateForGoal = (goal: string | null | undefined): LearningGoalTemplate | null => {
  const text = asText(goal).toLowerCase();
  if (!text) return null;
  return (
    LEARNING_GOAL_TEMPLATES.find((entry) => text.includes(entry.id) || text.includes(entry.label.toLowerCase())) || null
  );
};

export const buildLearningPathResult = (input: {
  graph: LearningGraphSnapshot | null | undefined;
  goalText: string;
  filters?: LearningGraphFilters | null;
}): LearningPathResult | null => {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const graph = input.graph;
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return null;
  const template = templateForGoal(input.goalText);
  const customKeywords = asText(input.goalText)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3);
  const keywords = template?.keywords?.length ? template.keywords : customKeywords;
  if (!keywords.length) return null;

  const ranked = graph.nodes
    .map((node) => {
      const score = scoreNodeAgainstGoal(node, keywords);
      const evidenceCount = Number(node?.sampleSize || node?.meta?.tradeCount || 0) || 0;
      return {
        node,
        score,
        evidenceCount
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (ranked.length === 0) return null;

  const highlightedNodeIds = ranked.map((entry) => String(entry.node.id));
  const highlightedNodeSet = new Set(highlightedNodeIds);
  const highlightedEdgeIds = (graph.edges || [])
    .filter((edge) => highlightedNodeSet.has(String(edge.source)) || highlightedNodeSet.has(String(edge.target)))
    .map((edge) => String(edge.id));
  const steps: LearningPathStep[] = ranked.map((entry) => ({
    nodeId: String(entry.node.id),
    label: String(entry.node.label || ''),
    type: String(entry.node.type || 'node'),
    score: Math.round(entry.score * 100) / 100,
    evidenceCount: entry.evidenceCount,
    confidence: Number.isFinite(Number(entry.node?.confidence)) ? Number(entry.node.confidence) : null,
    impactScore: Number.isFinite(Number(entry.node?.impactScore)) ? Number(entry.node.impactScore) : null
  }));

  const confidenceValues = steps
    .map((entry) => Number(entry.confidence))
    .filter((entry) => Number.isFinite(entry));
  const impactValues = steps
    .map((entry) => Number(entry.impactScore))
    .filter((entry) => Number.isFinite(entry));
  const sampleSize = steps.reduce((sum, entry) => sum + Number(entry.evidenceCount || 0), 0);
  const summary: LearningPathSummary = {
    stepCount: steps.length,
    confidence: confidenceValues.length > 0
      ? Math.round((confidenceValues.reduce((sum, entry) => sum + entry, 0) / confidenceValues.length) * 1000) / 1000
      : null,
    sampleSize,
    estimatedImpact: impactValues.length > 0
      ? Math.round((impactValues.reduce((sum, entry) => sum + entry, 0) / impactValues.length) * 1000) / 1000
      : null
  };
  const buildMs = Math.max(
    1,
    Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
  );
  const pathCoverage = graph.nodes.length > 0
    ? Math.max(0, Math.min(1, highlightedNodeIds.length / graph.nodes.length))
    : 0;

  return {
    goalText: template?.label || input.goalText,
    filters: input.filters || null,
    highlightedNodeIds,
    highlightedEdgeIds,
    steps,
    summary,
    buildMs,
    pathCoverage
  };
};
