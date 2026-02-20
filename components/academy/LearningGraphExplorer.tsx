import React, { useMemo, useState } from 'react';
import type { LearningGraphNode, LearningGraphSnapshot } from '../../types';

type Props = {
  graph: LearningGraphSnapshot;
  selectedNodeId: string | null;
  highlightedNodeIds?: string[];
  onSelectNode: (nodeId: string) => void;
  onDrilldownNode?: (node: LearningGraphNode) => void;
};

const nodeCount = (node: LearningGraphNode) =>
  Number(node.sampleSize || node.meta?.tradeCount || 0) || 0;

const LearningGraphExplorer: React.FC<Props> = ({
  graph,
  selectedNodeId,
  highlightedNodeIds,
  onSelectNode,
  onDrilldownNode
}) => {
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const highlighted = useMemo(
    () => new Set((highlightedNodeIds || []).map((entry) => String(entry))),
    [highlightedNodeIds]
  );

  const nodeById = useMemo(() => {
    const map = new Map<string, LearningGraphNode>();
    (graph.nodes || []).forEach((node) => map.set(String(node.id), node));
    return map;
  }, [graph.nodes]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, LearningGraphNode[]>();
    (graph.nodes || []).forEach((node) => {
      const parentId = String(node.parentId || '').trim();
      if (!parentId) return;
      if (!map.has(parentId)) map.set(parentId, []);
      map.get(parentId)?.push(node);
    });
    for (const list of map.values()) {
      list.sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
    }
    return map;
  }, [graph.nodes]);

  const toggle = (id: string) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const matchesQuery = (node: LearningGraphNode) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const label = String(node.label || '').toLowerCase();
    const type = String(node.type || '').toLowerCase();
    return label.includes(q) || type.includes(q);
  };

  const hasQueryMatchInSubtree = (id: string): boolean => {
    const node = nodeById.get(id);
    if (!node) return false;
    if (matchesQuery(node)) return true;
    const children = childrenByParent.get(id) || [];
    return children.some((child) => hasQueryMatchInSubtree(String(child.id)));
  };

  const renderNode = (nodeId: string, depth = 0): React.ReactNode => {
    const node = nodeById.get(nodeId);
    if (!node) return null;
    const children = childrenByParent.get(node.id) || [];
    const open = expandedIds.includes(node.id) || !!query;
    if (!hasQueryMatchInSubtree(node.id)) return null;
    const selected = selectedNodeId === node.id;
    const hot = node.hot === true;
    const contradicted = node.contradicted === true;
    const count = nodeCount(node);

    return (
      <div key={node.id} className="space-y-1">
        <div
          className={`rounded border px-2 py-1 text-[11px] ${
            selected ? 'border-cyan-400/70 bg-cyan-500/10' : 'border-white/10 bg-black/30'
          }`}
          style={{ marginLeft: `${depth * 12}px` }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              {children.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggle(node.id)}
                  className="text-gray-400 hover:text-white"
                >
                  {open ? '▾' : '▸'}
                </button>
              ) : (
                <span className="text-gray-500">•</span>
              )}
              <button
                type="button"
                onClick={() => onSelectNode(node.id)}
                className="truncate text-left text-gray-200 hover:text-white"
                title={`${node.type} ${node.label}`}
              >
                {node.label}
              </button>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              {highlighted.has(node.id) ? <span className="rounded border border-cyan-400/50 px-1 text-cyan-200">PATH</span> : null}
              {hot ? <span className="rounded border border-amber-400/50 px-1 text-amber-200">HOT</span> : null}
              {contradicted ? <span className="rounded border border-rose-400/50 px-1 text-rose-200">CONFLICT</span> : null}
              <span>{String(node.type || '').toUpperCase()}</span>
              {count > 0 ? <span>· {count}</span> : null}
              {onDrilldownNode ? (
                <button
                  type="button"
                  onClick={() => onDrilldownNode(node)}
                  className="rounded border border-white/10 px-1 text-gray-300 hover:text-white"
                >
                  Drill
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {open ? children.map((child) => renderNode(child.id, depth + 1)) : null}
      </div>
    );
  };

  const roots = (graph.rootNodeIds || []).filter((id) => nodeById.has(String(id)));

  return (
    <div className="h-full min-h-0 rounded border border-white/10 bg-black/25 p-2 flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-wider text-gray-400">Explorer</div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search nodes..."
        className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200 text-[11px]"
      />
      <div className="min-h-0 flex-1 overflow-y-auto space-y-1 pr-1">
        {roots.length === 0 ? <div className="text-[11px] text-gray-500">No graph nodes.</div> : roots.map((id) => renderNode(id))}
      </div>
    </div>
  );
};

export default LearningGraphExplorer;
