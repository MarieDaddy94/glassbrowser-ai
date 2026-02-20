import type {
  LearningGraphDiffSnapshot,
  LearningGraphEdge,
  LearningGraphEdgeDiff,
  LearningGraphNode,
  LearningGraphNodeDiff,
  LearningGraphSnapshot
} from '../types';

const toNum = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const statusFor = (existsInBase: boolean, existsInCompare: boolean) => {
  if (existsInBase && !existsInCompare) return 'removed' as const;
  if (!existsInBase && existsInCompare) return 'added' as const;
  return 'changed' as const;
};

const nodeMetrics = (node: LearningGraphNode | null | undefined) => {
  if (!node) {
    return {
      impact: 0,
      confidence: 0,
      sample: 0,
      winRate: 0
    };
  }
  return {
    impact: toNum(node.impactScore, 0),
    confidence: toNum(node.confidence, 0),
    sample: toNum(node.sampleSize, 0),
    winRate: toNum((node.meta as any)?.winRate, 0)
  };
};

const edgeMetrics = (edge: LearningGraphEdge | null | undefined) => {
  if (!edge) {
    return {
      support: 0,
      confidence: 0
    };
  }
  return {
    support: toNum(edge.supportCount ?? edge.weight, 0),
    confidence: toNum(edge.confidence, 0)
  };
};

const isChangedNode = (left: LearningGraphNode, right: LearningGraphNode) => {
  const l = nodeMetrics(left);
  const r = nodeMetrics(right);
  return (
    Math.abs(l.impact - r.impact) >= 0.0001 ||
    Math.abs(l.confidence - r.confidence) >= 0.0001 ||
    Math.abs(l.sample - r.sample) >= 0.0001 ||
    Math.abs(l.winRate - r.winRate) >= 0.0001
  );
};

const isChangedEdge = (left: LearningGraphEdge, right: LearningGraphEdge) => {
  const l = edgeMetrics(left);
  const r = edgeMetrics(right);
  return (
    Math.abs(l.support - r.support) >= 0.0001 ||
    Math.abs(l.confidence - r.confidence) >= 0.0001 ||
    String(left.type || '') !== String(right.type || '')
  );
};

export const buildLearningGraphDiffSnapshot = (input: {
  base: LearningGraphSnapshot;
  compare: LearningGraphSnapshot;
}): LearningGraphDiffSnapshot => {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const base = input.base;
  const compare = input.compare;
  const baseNodeMap = new Map((base?.nodes || []).map((node) => [String(node.id), node]));
  const compareNodeMap = new Map((compare?.nodes || []).map((node) => [String(node.id), node]));
  const baseEdgeMap = new Map((base?.edges || []).map((edge) => [String(edge.id), edge]));
  const compareEdgeMap = new Map((compare?.edges || []).map((edge) => [String(edge.id), edge]));

  const nodeIds = new Set<string>([...baseNodeMap.keys(), ...compareNodeMap.keys()]);
  const edgeIds = new Set<string>([...baseEdgeMap.keys(), ...compareEdgeMap.keys()]);

  const nodeDiffs: LearningGraphNodeDiff[] = [];
  const edgeDiffs: LearningGraphEdgeDiff[] = [];

  let netImpactDelta = 0;
  let confidenceShift = 0;
  let confidenceCount = 0;

  for (const nodeId of nodeIds) {
    const baseNode = baseNodeMap.get(nodeId);
    const compareNode = compareNodeMap.get(nodeId);
    if (baseNode && compareNode) {
      if (!isChangedNode(baseNode, compareNode)) {
        nodeDiffs.push({ nodeId, status: 'stable' });
        continue;
      }
      const b = nodeMetrics(baseNode);
      const c = nodeMetrics(compareNode);
      const impactDelta = Math.round((c.impact - b.impact) * 1000) / 1000;
      const confidenceDelta = Math.round((c.confidence - b.confidence) * 1000) / 1000;
      const sampleDelta = Math.round((c.sample - b.sample) * 1000) / 1000;
      const winRateDelta = Math.round((c.winRate - b.winRate) * 1000) / 1000;
      nodeDiffs.push({
        nodeId,
        status: 'changed',
        impactDelta,
        confidenceDelta,
        sampleDelta,
        winRateDelta
      });
      netImpactDelta += impactDelta;
      confidenceShift += confidenceDelta;
      confidenceCount += 1;
      continue;
    }
    const status = statusFor(Boolean(baseNode), Boolean(compareNode));
    const b = nodeMetrics(baseNode);
    const c = nodeMetrics(compareNode);
    const impactDelta = Math.round((c.impact - b.impact) * 1000) / 1000;
    const confidenceDelta = Math.round((c.confidence - b.confidence) * 1000) / 1000;
    const sampleDelta = Math.round((c.sample - b.sample) * 1000) / 1000;
    const winRateDelta = Math.round((c.winRate - b.winRate) * 1000) / 1000;
    nodeDiffs.push({
      nodeId,
      status,
      impactDelta,
      confidenceDelta,
      sampleDelta,
      winRateDelta
    });
    netImpactDelta += impactDelta;
    confidenceShift += confidenceDelta;
    confidenceCount += 1;
  }

  for (const edgeId of edgeIds) {
    const baseEdge = baseEdgeMap.get(edgeId);
    const compareEdge = compareEdgeMap.get(edgeId);
    if (baseEdge && compareEdge) {
      if (!isChangedEdge(baseEdge, compareEdge)) {
        edgeDiffs.push({ edgeId, status: 'stable' });
        continue;
      }
      const b = edgeMetrics(baseEdge);
      const c = edgeMetrics(compareEdge);
      edgeDiffs.push({
        edgeId,
        status: 'changed',
        supportDelta: Math.round((c.support - b.support) * 1000) / 1000,
        confidenceDelta: Math.round((c.confidence - b.confidence) * 1000) / 1000
      });
      continue;
    }
    const status = statusFor(Boolean(baseEdge), Boolean(compareEdge));
    const b = edgeMetrics(baseEdge);
    const c = edgeMetrics(compareEdge);
    edgeDiffs.push({
      edgeId,
      status,
      supportDelta: Math.round((c.support - b.support) * 1000) / 1000,
      confidenceDelta: Math.round((c.confidence - b.confidence) * 1000) / 1000
    });
  }

  const addedNodes = nodeDiffs.filter((diff) => diff.status === 'added').length;
  const removedNodes = nodeDiffs.filter((diff) => diff.status === 'removed').length;
  const changedNodes = nodeDiffs.filter((diff) => diff.status === 'changed').length;
  const addedEdges = edgeDiffs.filter((diff) => diff.status === 'added').length;
  const removedEdges = edgeDiffs.filter((diff) => diff.status === 'removed').length;
  const changedEdges = edgeDiffs.filter((diff) => diff.status === 'changed').length;

  const buildMs = Math.max(1, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started));

  return {
    baseScopeKey: String(base?.scopeKey || '').trim() || 'base',
    compareScopeKey: String(compare?.scopeKey || '').trim() || 'compare',
    nodeDiffs,
    edgeDiffs,
    summary: {
      addedNodes,
      removedNodes,
      changedNodes,
      addedEdges,
      removedEdges,
      changedEdges,
      netImpactDelta: Math.round(netImpactDelta * 1000) / 1000,
      confidenceShift: confidenceCount > 0
        ? Math.round((confidenceShift / confidenceCount) * 1000) / 1000
        : null
    },
    builtAtMs: Date.now(),
    buildMs
  };
};
