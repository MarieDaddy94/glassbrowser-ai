import type { LearningGraphEdge, LearningGraphNode, LearningGraphSnapshot } from '../types';

const asText = (value: any) => String(value || '').trim();

const asNum = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

type ZoomBand = 'far' | 'mid' | 'near';

export type LearningGraphEdgeBundleResult = {
  visibleEdgeIds: string[];
  bundledEdgeIds: string[];
  bundleCount: number;
  buildMs: number;
};

const nodeTypeMap = (nodes: LearningGraphNode[]) => {
  const map = new Map<string, string>();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const id = asText(node.id);
    if (!id) continue;
    map.set(id, asText(node.type || node.kind || 'node') || 'node');
  }
  return map;
};

const sortBySupportDesc = (edges: LearningGraphEdge[]) =>
  [...edges].sort((a, b) => asNum(b.supportCount ?? b.weight, 0) - asNum(a.supportCount ?? a.weight, 0));

export const buildLearningGraphEdgeBundleMap = (input: {
  snapshot: LearningGraphSnapshot | null | undefined;
  zoomBand: ZoomBand;
}): LearningGraphEdgeBundleResult => {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const snapshot = input.snapshot;
  const edges = Array.isArray(snapshot?.edges) ? snapshot!.edges : [];
  if (edges.length === 0) {
    return {
      visibleEdgeIds: [],
      bundledEdgeIds: [],
      bundleCount: 0,
      buildMs: 0
    };
  }
  if (input.zoomBand === 'near') {
    return {
      visibleEdgeIds: edges.map((edge) => String(edge.id)),
      bundledEdgeIds: [],
      bundleCount: 0,
      buildMs: Math.max(1, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt))
    };
  }

  const typeByNodeId = nodeTypeMap(Array.isArray(snapshot?.nodes) ? snapshot!.nodes : []);
  const grouped = new Map<string, LearningGraphEdge[]>();
  const alwaysVisible = new Set<string>();
  for (const edge of edges) {
    const edgeId = asText(edge.id);
    if (!edgeId) continue;
    const edgeType = asText(edge.type || 'contains');
    if (edgeType === 'conflicts' || edgeType === 'overrides_when') {
      alwaysVisible.add(edgeId);
      continue;
    }
    const sourceType = typeByNodeId.get(asText(edge.source)) || 'node';
    const targetType = typeByNodeId.get(asText(edge.target)) || 'node';
    const groupKey = `${sourceType}->${targetType}:${edgeType}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey)?.push(edge);
  }

  const visible = new Set<string>(alwaysVisible);
  const bundled = new Set<string>();
  const keepPerGroup = input.zoomBand === 'far' ? 5 : 10;
  for (const groupEdges of grouped.values()) {
    const sorted = sortBySupportDesc(groupEdges);
    sorted.forEach((edge, idx) => {
      const edgeId = asText(edge.id);
      if (!edgeId) return;
      if (idx < keepPerGroup) {
        visible.add(edgeId);
        return;
      }
      bundled.add(edgeId);
    });
  }

  return {
    visibleEdgeIds: Array.from(visible),
    bundledEdgeIds: Array.from(bundled),
    bundleCount: bundled.size,
    buildMs: Math.max(1, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt))
  };
};
