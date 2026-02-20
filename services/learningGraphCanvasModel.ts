import type {
  LearningGraphDiffSnapshot,
  LearningGraphEdge,
  LearningGraphFilters,
  LearningGraphNode,
  LearningGraphRenderState
} from '../types';

type ZoomBand = 'far' | 'mid' | 'near';

type LabelCandidate = {
  id: string;
  label: string;
  priority: number;
  x: number;
  y: number;
};

const asNum = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const shortLabel = (value: string, max = 16) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(3, max - 1))}\u2026`;
};

const addToSetMap = (map: Map<string, Set<string>>, left: string, right: string) => {
  if (!map.has(left)) map.set(left, new Set());
  map.get(left)?.add(right);
};

const buildNeighborMap = (edges: LearningGraphEdge[]) => {
  const map = new Map<string, Set<string>>();
  for (const edge of edges || []) {
    const source = String(edge.source || '').trim();
    const target = String(edge.target || '').trim();
    if (!source || !target) continue;
    addToSetMap(map, source, target);
    addToSetMap(map, target, source);
  }
  return map;
};

const walkNeighbors = (
  neighborMap: Map<string, Set<string>>,
  startId: string,
  depth: number
) => {
  const seen = new Set<string>();
  if (!startId || depth <= 0) return seen;
  let frontier = new Set<string>([startId]);
  for (let i = 0; i < depth; i += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier) {
      const neighbors = neighborMap.get(nodeId);
      if (!neighbors) continue;
      for (const neighborId of neighbors) {
        if (seen.has(neighborId) || neighborId === startId) continue;
        seen.add(neighborId);
        next.add(neighborId);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return seen;
};

export const computeZoomBand = (zoom: number): ZoomBand => {
  const value = asNum(zoom, 1);
  if (value < 0.65) return 'far';
  if (value < 1.22) return 'mid';
  return 'near';
};

export const applyCollisionDeclutter = (
  candidates: LabelCandidate[],
  viewport: { width: number; height: number }
) => {
  const width = Math.max(0, asNum(viewport.width, 0));
  const height = Math.max(0, asNum(viewport.height, 0));
  const sorted = [...candidates]
    .filter((entry) => entry && entry.label)
    .sort((a, b) => b.priority - a.priority);
  const accepted = new Set<string>();
  const boxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const entry of sorted) {
    const labelWidth = Math.max(28, Math.min(220, entry.label.length * 6.2));
    const labelHeight = 14;
    const x1 = entry.x - (labelWidth / 2);
    const y1 = entry.y - (labelHeight / 2);
    const x2 = x1 + labelWidth;
    const y2 = y1 + labelHeight;
    if (x2 < -12 || y2 < -12 || x1 > (width + 12) || y1 > (height + 12)) continue;
    const overlaps = boxes.some((box) => !(x2 < box.x1 || x1 > box.x2 || y2 < box.y1 || y1 > box.y2));
    if (overlaps) continue;
    accepted.add(entry.id);
    boxes.push({ x1, y1, x2, y2 });
  }
  return accepted;
};

export const buildLabelVisibilityPlan = (input: {
  nodes: LearningGraphNode[];
  edges: LearningGraphEdge[];
  selectedNodeId?: string | null;
  hoveredNodeId?: string | null;
  highlightedNodeIds?: string[];
  zoomBand: ZoomBand;
  positions: Record<string, { x: number; y: number }>;
  viewport: { width: number; height: number };
  revealAll?: boolean;
}) => {
  const selectedId = String(input.selectedNodeId || '').trim();
  const hoveredId = String(input.hoveredNodeId || '').trim();
  const highlighted = new Set((input.highlightedNodeIds || []).map((entry) => String(entry || '').trim()).filter(Boolean));
  const neighborMap = buildNeighborMap(input.edges || []);
  const selectedNeighbors = walkNeighbors(neighborMap, selectedId, 1);
  const candidates: LabelCandidate[] = [];
  for (const node of input.nodes || []) {
    const id = String(node.id || '').trim();
    if (!id) continue;
    const pos = input.positions[id];
    if (!pos) continue;
    const rawLabel = String(node.label || '').trim();
    if (!rawLabel) continue;
    const isSelected = id === selectedId;
    const isHovered = id === hoveredId;
    const isHighlighted = highlighted.has(id);
    const isNeighbor = selectedNeighbors.has(id);
    const isTopLevel = node.type === 'agent' || node.type === 'symbol';
    const impactScore = Math.abs(asNum(node.impactScore, 0));
    const confidence = asNum(node.confidence, 0);
    const sample = asNum(node.sampleSize, 0);
    let show = false;
    let label = rawLabel;
    if (input.revealAll) {
      show = true;
    } else if (input.zoomBand === 'far') {
      show = isTopLevel || isSelected || isHovered || isHighlighted;
      if (show && (isTopLevel || sample > 0)) {
        label = `${shortLabel(rawLabel, 14)}${sample > 0 ? ` (${sample})` : ''}`;
      }
    } else if (input.zoomBand === 'mid') {
      show = isSelected || isHovered || isHighlighted || isNeighbor || impactScore >= 0.35 || confidence >= 0.72;
      if (show && !isSelected && !isHovered && !isHighlighted) label = shortLabel(rawLabel, 20);
    } else {
      show = true;
      label = rawLabel;
    }
    if (!show) continue;
    const priority =
      (isSelected ? 10_000 : 0) +
      (isHovered ? 9_000 : 0) +
      (isHighlighted ? 8_000 : 0) +
      (isNeighbor ? 6_500 : 0) +
      Math.round(impactScore * 1000) +
      Math.round(confidence * 600) +
      Math.round(sample * 2);
    candidates.push({
      id,
      label,
      priority,
      x: pos.x,
      y: pos.y
    });
  }
  const accepted = input.zoomBand === 'near'
    ? applyCollisionDeclutter(candidates, input.viewport)
    : new Set(candidates.map((entry) => entry.id));
  const labels: Record<string, string> = {};
  for (const entry of candidates) {
    labels[entry.id] = accepted.has(entry.id) ? entry.label : '';
  }
  return labels;
};

const buildFocusNodeSet = (input: {
  nodes: LearningGraphNode[];
  edges: LearningGraphEdge[];
  selectedNodeId?: string | null;
  highlightedNodeIds?: string[];
  focusMode?: LearningGraphFilters['focusMode'];
}) => {
  const allNodeIds = new Set((input.nodes || []).map((node) => String(node.id || '').trim()).filter(Boolean));
  const selectedId = String(input.selectedNodeId || '').trim();
  const highlighted = new Set((input.highlightedNodeIds || []).map((entry) => String(entry || '').trim()).filter(Boolean));
  const mode = String(input.focusMode || 'off').trim().toLowerCase();
  if (mode === 'off' || !selectedId || !allNodeIds.has(selectedId)) return allNodeIds;
  const neighborMap = buildNeighborMap(input.edges || []);
  const focused = new Set<string>([selectedId]);
  if (mode === 'path') {
    for (const id of highlighted) focused.add(id);
    const selectedNeighbors = neighborMap.get(selectedId);
    if (selectedNeighbors) {
      for (const id of selectedNeighbors) focused.add(id);
    }
    return focused;
  }
  const depth = mode === 'hop2' ? 2 : 1;
  const neighbors = walkNeighbors(neighborMap, selectedId, depth);
  for (const id of neighbors) focused.add(id);
  return focused;
};

export const buildGraphRenderState = (input: {
  nodes: LearningGraphNode[];
  edges: LearningGraphEdge[];
  selectedNodeId?: string | null;
  hoveredNodeId?: string | null;
  highlightedNodeIds?: string[];
  highlightedEdgeIds?: string[];
  focusMode?: LearningGraphFilters['focusMode'];
  zoom: number;
  positions: Record<string, { x: number; y: number }>;
  viewport: { width: number; height: number };
  revealAllLabels?: boolean;
  bundleVisibleEdgeIds?: string[] | Set<string> | null;
  diffSnapshot?: LearningGraphDiffSnapshot | null;
}) => {
  const zoomBand = computeZoomBand(input.zoom);
  const focusNodes = buildFocusNodeSet({
    nodes: input.nodes,
    edges: input.edges,
    selectedNodeId: input.selectedNodeId,
    highlightedNodeIds: input.highlightedNodeIds,
    focusMode: input.focusMode
  });
  const highlightedEdges = new Set((input.highlightedEdgeIds || []).map((entry) => String(entry || '').trim()).filter(Boolean));
  const bundledVisibleEdges = Array.isArray(input.bundleVisibleEdgeIds)
    ? new Set(input.bundleVisibleEdgeIds.map((entry) => String(entry || '').trim()).filter(Boolean))
    : input.bundleVisibleEdgeIds instanceof Set
      ? new Set(Array.from(input.bundleVisibleEdgeIds).map((entry) => String(entry || '').trim()).filter(Boolean))
      : null;
  const diffNodeStatus: Record<string, 'added' | 'removed' | 'changed' | 'stable'> = {};
  const diffEdgeStatus: Record<string, 'added' | 'removed' | 'changed' | 'stable'> = {};
  for (const entry of input.diffSnapshot?.nodeDiffs || []) {
    const id = String(entry?.nodeId || '').trim();
    if (!id) continue;
    diffNodeStatus[id] = entry.status;
  }
  for (const entry of input.diffSnapshot?.edgeDiffs || []) {
    const id = String(entry?.edgeId || '').trim();
    if (!id) continue;
    diffEdgeStatus[id] = entry.status;
  }
  const labels = buildLabelVisibilityPlan({
    nodes: input.nodes,
    edges: input.edges,
    selectedNodeId: input.selectedNodeId,
    hoveredNodeId: input.hoveredNodeId,
    highlightedNodeIds: input.highlightedNodeIds,
    zoomBand,
    positions: input.positions,
    viewport: input.viewport,
    revealAll: input.revealAllLabels
  });
  const nodeOpacity: Record<string, number> = {};
  for (const node of input.nodes || []) {
    const id = String(node.id || '').trim();
    if (!id) continue;
    nodeOpacity[id] = focusNodes.has(id) ? 1 : 0.12;
  }
  const edgeOpacity: Record<string, number> = {};
  for (const edge of input.edges || []) {
    const id = String(edge.id || '').trim();
    if (!id) continue;
    const source = String(edge.source || '').trim();
    const target = String(edge.target || '').trim();
    const support = asNum(edge.supportCount ?? edge.weight, 0);
    const diffStatus = diffEdgeStatus[id] || 'stable';
    let visible = true;
    if (zoomBand === 'far') {
      visible = highlightedEdges.has(id) || diffStatus !== 'stable' || support >= 5 || source === input.selectedNodeId || target === input.selectedNodeId;
      if (bundledVisibleEdges && bundledVisibleEdges.size > 0) {
        visible = visible || bundledVisibleEdges.has(id);
      }
    } else if (zoomBand === 'mid') {
      visible = highlightedEdges.has(id) || diffStatus !== 'stable' || focusNodes.has(source) || focusNodes.has(target);
    } else {
      visible = true;
    }
    if (!(focusNodes.has(source) && focusNodes.has(target))) visible = false;
    edgeOpacity[id] = visible ? 0.82 : 0.06;
  }
  const visibleEdgeIds = Object.keys(edgeOpacity).filter((id) => edgeOpacity[id] > 0.1);
  const focusNodeIds = Array.from(focusNodes);
  const renderState: LearningGraphRenderState = {
    zoomBand,
    labels,
    nodeOpacity,
    edgeOpacity,
    nodeDiffStatus: diffNodeStatus,
    edgeDiffStatus: diffEdgeStatus,
    visibleEdgeIds,
    focusNodeIds
  };
  return renderState;
};
