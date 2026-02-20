import type {
  LearningGraphEdge,
  LearningGraphNode,
  LearningGraphSnapshot,
  LessonConflictPolicy,
  LessonConflictResolution
} from '../types';

const asText = (value: any) => String(value || '').trim();

const conflictPairKey = (left: string, right: string) => {
  const a = asText(left);
  const b = asText(right);
  if (!a || !b) return '';
  return [a, b].sort((x, y) => x.localeCompare(y)).join('|');
};

export const buildLearningConflictId = (lessonAId: string, lessonBId: string) =>
  `conflict:${conflictPairKey(lessonAId, lessonBId)}`;

const normalizePolicyType = (value: any): LessonConflictResolution['policyType'] => {
  const key = asText(value).toLowerCase();
  if (key === 'conditional_override') return 'conditional_override';
  if (key === 'precedence') return 'precedence';
  if (key === 'scope_split') return 'scope_split';
  return 'unresolved';
};

export const normalizeLearningConflictResolution = (
  input: Partial<LessonConflictResolution> | null | undefined
): LessonConflictResolution | null => {
  if (!input) return null;
  const lessonAId = asText(input.lessonAId);
  const lessonBId = asText(input.lessonBId);
  const conflictId = asText(input.conflictId) || buildLearningConflictId(lessonAId, lessonBId);
  if (!lessonAId || !lessonBId || !conflictId) return null;
  const now = Date.now();
  return {
    conflictId,
    lessonAId,
    lessonBId,
    policyType: normalizePolicyType(input.policyType),
    condition: input.condition && typeof input.condition === 'object'
      ? {
          symbol: asText(input.condition.symbol) || null,
          timeframe: asText(input.condition.timeframe) || null,
          strategyMode: asText(input.condition.strategyMode) || null,
          session: asText(input.condition.session) || null,
          trigger: asText(input.condition.trigger) || null
        }
      : null,
    precedence: input.precedence === 'lessonA_wins' || input.precedence === 'lessonB_wins'
      ? input.precedence
      : null,
    scopeSplit: input.scopeSplit && typeof input.scopeSplit === 'object'
      ? {
          lessonASymbols: Array.isArray(input.scopeSplit.lessonASymbols) ? input.scopeSplit.lessonASymbols : null,
          lessonBSymbols: Array.isArray(input.scopeSplit.lessonBSymbols) ? input.scopeSplit.lessonBSymbols : null,
          lessonATimeframes: Array.isArray(input.scopeSplit.lessonATimeframes) ? input.scopeSplit.lessonATimeframes : null,
          lessonBTimeframes: Array.isArray(input.scopeSplit.lessonBTimeframes) ? input.scopeSplit.lessonBTimeframes : null
        }
      : null,
    note: asText(input.note) || null,
    createdAtMs: Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : now,
    updatedAtMs: Number.isFinite(Number(input.updatedAtMs)) ? Number(input.updatedAtMs) : now,
    source: asText(input.source) || 'academy_learning_graph'
  };
};

export const mergeLearningConflictPolicies = (
  previous: LessonConflictResolution[],
  nextPolicies: LessonConflictResolution[]
): LessonConflictResolution[] => {
  const out = new Map<string, LessonConflictResolution>();
  for (const entry of Array.isArray(previous) ? previous : []) {
    const normalized = normalizeLearningConflictResolution(entry);
    if (!normalized) continue;
    out.set(normalized.conflictId, normalized);
  }
  for (const entry of Array.isArray(nextPolicies) ? nextPolicies : []) {
    const normalized = normalizeLearningConflictResolution(entry);
    if (!normalized) continue;
    const existing = out.get(normalized.conflictId);
    if (!existing) {
      out.set(normalized.conflictId, normalized);
      continue;
    }
    const existingTs = Number(existing.updatedAtMs || existing.createdAtMs || 0);
    const incomingTs = Number(normalized.updatedAtMs || normalized.createdAtMs || 0);
    out.set(normalized.conflictId, incomingTs >= existingTs ? normalized : existing);
  }
  return Array.from(out.values()).sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
};

type LessonConflictEntry = {
  conflictId: string;
  lessonAId: string;
  lessonBId: string;
  nodeAId: string;
  nodeBId: string;
  confidence: number | null;
  reason: string | null;
  policy: LessonConflictResolution | null;
};

const lessonNodeMap = (nodes: LearningGraphNode[]) => {
  const map = new Map<string, LearningGraphNode[]>();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (String(node.type || '').toLowerCase() !== 'lesson') continue;
    const lessonId = asText(node.meta?.lessonId || node.id);
    if (!lessonId) continue;
    if (!map.has(lessonId)) map.set(lessonId, []);
    map.get(lessonId)?.push(node);
  }
  return map;
};

const policyLookup = (list: LessonConflictResolution[]) => {
  const map = new Map<string, LessonConflictResolution>();
  for (const policy of Array.isArray(list) ? list : []) {
    const normalized = normalizeLearningConflictResolution(policy);
    if (!normalized) continue;
    map.set(normalized.conflictId, normalized);
  }
  return map;
};

const readLessonIdFromNodeId = (nodeId: string) => {
  const id = asText(nodeId);
  if (!id) return '';
  const marker = '|lesson:';
  const idx = id.lastIndexOf(marker);
  if (idx < 0) return '';
  const tail = id.slice(idx + marker.length).trim();
  return tail || '';
};

export const listLearningSnapshotConflicts = (input: {
  snapshot: LearningGraphSnapshot | null | undefined;
  policies?: LessonConflictResolution[] | null;
}): LessonConflictEntry[] => {
  const snapshot = input.snapshot;
  if (!snapshot) return [];
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const byLesson = lessonNodeMap(nodes);
  const policies = policyLookup(Array.isArray(input.policies) ? input.policies : []);
  const out: LessonConflictEntry[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (String(edge.type || '') !== 'conflicts') continue;
    const source = asText(edge.source);
    const target = asText(edge.target);
    if (!source || !target) continue;
    const sourceNode = nodeById.get(source);
    const targetNode = nodeById.get(target);
    if (!sourceNode || !targetNode) continue;
    const leftLessonId = asText(sourceNode.meta?.lessonId || readLessonIdFromNodeId(source) || sourceNode.id);
    const rightLessonId = asText(targetNode.meta?.lessonId || readLessonIdFromNodeId(target) || targetNode.id);
    if (!leftLessonId || !rightLessonId) continue;
    const conflictId = buildLearningConflictId(leftLessonId, rightLessonId);
    if (seen.has(conflictId)) continue;
    seen.add(conflictId);
    const leftNode = (byLesson.get(leftLessonId) || [sourceNode])[0];
    const rightNode = (byLesson.get(rightLessonId) || [targetNode])[0];
    out.push({
      conflictId,
      lessonAId: leftLessonId,
      lessonBId: rightLessonId,
      nodeAId: String(leftNode?.id || source),
      nodeBId: String(rightNode?.id || target),
      confidence: Number.isFinite(Number(edge.confidence)) ? Number(edge.confidence) : null,
      reason: asText((edge as any).reason) || null,
      policy: policies.get(conflictId) || null
    });
  }
  return out;
};

const cloneEdge = (edge: LearningGraphEdge): LearningGraphEdge => ({ ...edge });

export const applyConflictPoliciesToSnapshot = (input: {
  snapshot: LearningGraphSnapshot;
  policies?: LessonConflictResolution[] | null;
}): LearningGraphSnapshot => {
  const snapshot = input.snapshot;
  const policies = policyLookup(Array.isArray(input.policies) ? input.policies : []);
  if (policies.size === 0) return snapshot;
  const edges = (snapshot.edges || []).map(cloneEdge);
  const nodes = (snapshot.nodes || []).map((node) => ({ ...node, meta: node.meta ? { ...node.meta } : node.meta }));
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const resolvedConflictNodeIds = new Set<string>();
  const extraEdges: LearningGraphEdge[] = [];
  const seenEdgeIds = new Set(edges.map((edge) => String(edge.id)));

  for (const edge of edges) {
    if (String(edge.type || '') !== 'conflicts') continue;
    const sourceNode = nodeById.get(String(edge.source || ''));
    const targetNode = nodeById.get(String(edge.target || ''));
    if (!sourceNode || !targetNode) continue;
    const lessonAId = asText(sourceNode.meta?.lessonId || sourceNode.id);
    const lessonBId = asText(targetNode.meta?.lessonId || targetNode.id);
    const conflictId = buildLearningConflictId(lessonAId, lessonBId);
    const policy = policies.get(conflictId);
    if (!policy || policy.policyType === 'unresolved') {
      continue;
    }
    resolvedConflictNodeIds.add(String(sourceNode.id));
    resolvedConflictNodeIds.add(String(targetNode.id));
    edge.type = 'overrides_when';
    (edge as any).policyType = policy.policyType;
    (edge as any).conflictId = conflictId;
    edge.confidence = Number.isFinite(Number(edge.confidence))
      ? edge.confidence
      : 0.75;

    if (policy.policyType === 'precedence') {
      const winner = policy.precedence === 'lessonB_wins' ? String(targetNode.id) : String(sourceNode.id);
      const loser = policy.precedence === 'lessonB_wins' ? String(sourceNode.id) : String(targetNode.id);
      const id = `${winner}->${loser}|policy:${conflictId}`;
      if (!seenEdgeIds.has(id)) {
        seenEdgeIds.add(id);
        extraEdges.push({
          id,
          source: winner,
          target: loser,
          type: 'overrides_when',
          weight: 1,
          confidence: Number.isFinite(Number(edge.confidence)) ? Number(edge.confidence) : 0.75
        });
      }
    }
  }

  const nextNodes = nodes.map((node) => {
    if (!resolvedConflictNodeIds.has(String(node.id))) return node;
    return {
      ...node,
      contradicted: false,
      meta: {
        ...(node.meta || {}),
        conflictResolved: true
      }
    };
  });

  return {
    ...snapshot,
    nodes: nextNodes,
    edges: [...edges, ...extraEdges]
  };
};

export const toConflictPolicyMemoryPayload = (policy: LessonConflictResolution): LessonConflictPolicy => ({
  conflictId: String(policy.conflictId || ''),
  policy
});
