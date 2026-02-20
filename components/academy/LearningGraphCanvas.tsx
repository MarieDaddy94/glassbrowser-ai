import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import type { LearningGraphDiffSnapshot, LearningGraphEdge, LearningGraphNode, LearningGraphSnapshot } from '../../types';
import { buildGraphRenderState } from '../../services/learningGraphCanvasModel';
import { resolveLearningGraphLayout } from '../../services/learningGraphLayout';
import LearningGraphMiniMap from './LearningGraphMiniMap';

type BoxZoomState = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type Props = {
  graph: LearningGraphSnapshot;
  selectedNodeId: string | null;
  highlightedNodeIds?: string[];
  highlightedEdgeIds?: string[];
  onSelectNode: (id: string) => void;
  layoutRunNonce?: number;
  pathZoomNonce?: number;
  pathAnimationNonce?: number;
  pathAnimationNodeIds?: string[];
  bundleVisibleEdgeIds?: string[] | null;
  diffSnapshot?: LearningGraphDiffSnapshot | null;
  onZoomBandChange?: (next: 'far' | 'mid' | 'near') => void;
};

const nodeSize = (node: LearningGraphNode) => {
  const impact = Number(node.impactScore || 0);
  const sample = Number(node.sampleSize || 0);
  const raw = 24 + Math.max(0, Math.abs(impact) * 12) + Math.min(30, sample * 0.22);
  return Math.max(20, Math.min(64, raw));
};

const edgeWidth = (edge: LearningGraphEdge) => {
  const weight = Number(edge.supportCount ?? edge.weight ?? 0) || 0;
  return Math.max(1, Math.min(7, 1 + (weight / 5)));
};

const LearningGraphCanvas: React.FC<Props> = ({
  graph,
  selectedNodeId,
  highlightedNodeIds,
  highlightedEdgeIds,
  onSelectNode,
  layoutRunNonce,
  pathZoomNonce,
  pathAnimationNonce,
  pathAnimationNodeIds,
  bundleVisibleEdgeIds,
  diffSnapshot,
  onZoomBandChange
}) => {
  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const zoomBandRef = useRef<'far' | 'mid' | 'near' | null>(null);
  const lastTapRef = useRef<{ id: string; atMs: number }>({ id: '', atMs: 0 });
  const homeViewRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [revealAllLabels, setRevealAllLabels] = useState(false);
  const [boxZoom, setBoxZoom] = useState<BoxZoomState | null>(null);
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  const selectedSet = useMemo(() => new Set([String(selectedNodeId || '')]), [selectedNodeId]);
  const highlightedNodes = useMemo(
    () => new Set((highlightedNodeIds || []).map((entry) => String(entry || '').trim()).filter(Boolean)),
    [highlightedNodeIds]
  );
  const highlightedEdges = useMemo(
    () => new Set((highlightedEdgeIds || []).map((entry) => String(entry || '').trim()).filter(Boolean)),
    [highlightedEdgeIds]
  );

  const nodeById = useMemo(() => {
    const map = new Map<string, LearningGraphNode>();
    (graph.nodes || []).forEach((node) => map.set(String(node.id), node));
    return map;
  }, [graph.nodes]);

  const breadcrumb = useMemo(() => {
    const selectedId = String(selectedNodeId || '').trim();
    if (!selectedId) return 'No selection';
    const path: string[] = [];
    let cursor = nodeById.get(selectedId) || null;
    while (cursor) {
      const label = String(cursor.label || '').trim();
      if (label) path.unshift(label);
      const parentId = String(cursor.parentId || '').trim();
      cursor = parentId ? (nodeById.get(parentId) || null) : null;
    }
    return path.length > 0 ? path.join(' > ') : 'No selection';
  }, [nodeById, selectedNodeId]);

  const layoutConfig = useMemo(() => resolveLearningGraphLayout({
    lens: graph.filters?.lens || null,
    layoutMode: graph.filters?.layoutMode || null,
    spread: graph.filters?.spread ?? 1
  }), [graph.filters?.lens, graph.filters?.layoutMode, graph.filters?.spread]);

  const elements = useMemo(() => {
    const nodes = (graph.nodes || []).map((node) => ({
      data: {
        id: String(node.id),
        label: String(node.label || ''),
        displayLabel: '',
        type: String(node.type || 'node'),
        size: nodeSize(node),
        selected: selectedSet.has(String(node.id)) ? 1 : 0,
        highlighted: highlightedNodes.has(String(node.id)) ? 1 : 0,
        pulse: 0,
        contradicted: node.contradicted ? 1 : 0,
        hot: node.hot ? 1 : 0,
        nodeOpacity: 1,
        diffStatus: 'stable',
        color: String(node.meta?.viewColor || '#64748b')
      }
    }));
    const edges = (graph.edges || []).map((edge) => ({
      data: {
        id: String(edge.id),
        source: String(edge.source),
        target: String(edge.target),
        type: String(edge.type || 'contains'),
        width: edgeWidth(edge),
        highlighted: highlightedEdges.has(String(edge.id)) ? 1 : 0,
        diffStatus: 'stable',
        edgeOpacity: 0.82
      }
    }));
    return [...nodes, ...edges];
  }, [graph.edges, graph.nodes, highlightedEdges, highlightedNodes, selectedSet]);

  const stylesheet = useMemo(() => ([
    {
      selector: 'node',
      style: {
        label: 'data(displayLabel)',
        color: '#e5e7eb',
        'font-size': 10,
        'text-max-width': 140,
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        width: 'data(size)',
        height: 'data(size)',
        'border-width': 1.2,
        'border-color': '#0f172a',
        'background-color': 'data(color)',
        opacity: 'data(nodeOpacity)'
      }
    },
    {
      selector: 'node[highlighted = 1]',
      style: {
        'border-width': 2,
        'border-color': '#22d3ee'
      }
    },
    {
      selector: 'node[pulse = 1]',
      style: {
        'border-width': 3,
        'border-color': '#fbbf24',
        'overlay-color': '#fbbf24',
        'overlay-opacity': 0.22
      }
    },
    {
      selector: 'node[selected = 1]',
      style: {
        'border-width': 3,
        'border-color': '#67e8f9'
      }
    },
    {
      selector: 'node[contradicted = 1]',
      style: {
        'border-color': '#fb7185'
      }
    },
    {
      selector: 'node[hot = 1]',
      style: {
        'overlay-color': '#f59e0b',
        'overlay-opacity': 0.12
      }
    },
    {
      selector: 'node[diffStatus = "added"]',
      style: {
        'border-color': '#22c55e',
        'border-width': 3
      }
    },
    {
      selector: 'node[diffStatus = "removed"]',
      style: {
        'border-color': '#f43f5e',
        'border-width': 3,
        opacity: 0.45
      }
    },
    {
      selector: 'node[diffStatus = "changed"]',
      style: {
        'border-color': '#f59e0b',
        'border-width': 3
      }
    },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': '#334155',
        'target-arrow-color': '#334155',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        opacity: 'data(edgeOpacity)'
      }
    },
    {
      selector: 'edge[type = "conflicts"]',
      style: {
        'line-color': '#fb7185',
        'target-arrow-color': '#fb7185',
        'line-style': 'dashed'
      }
    },
    {
      selector: 'edge[type = "overrides_when"]',
      style: {
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        'line-style': 'dotted'
      }
    },
    {
      selector: 'edge[highlighted = 1]',
      style: {
        'line-color': '#22d3ee',
        'target-arrow-color': '#22d3ee',
        opacity: 1
      }
    },
    {
      selector: 'edge[diffStatus = "added"]',
      style: {
        'line-color': '#22c55e',
        'target-arrow-color': '#22c55e'
      }
    },
    {
      selector: 'edge[diffStatus = "removed"]',
      style: {
        'line-color': '#f43f5e',
        'target-arrow-color': '#f43f5e',
        opacity: 0.35
      }
    },
    {
      selector: 'edge[diffStatus = "changed"]',
      style: {
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b'
      }
    }
  ]), []);

  const fitGraph = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.fit(undefined, 34);
  }, []);

  const fitSelection = useCallback(() => {
    if (!cyRef.current) return;
    const selectedId = String(selectedNodeId || '').trim();
    if (!selectedId) {
      cyRef.current.fit(undefined, 34);
      return;
    }
    const selected = cyRef.current.getElementById?.(selectedId);
    if (!selected || selected.empty?.()) {
      cyRef.current.fit(undefined, 34);
      return;
    }
    const neighborhood = selected.closedNeighborhood?.();
    if (neighborhood && neighborhood.length > 0) {
      cyRef.current.fit(neighborhood, 44);
    } else {
      cyRef.current.fit(selected, 44);
    }
  }, [selectedNodeId]);

  const zoomBy = useCallback((delta: number) => {
    if (!cyRef.current) return;
    const current = Number(cyRef.current.zoom?.() || 1);
    const next = Math.max(0.12, Math.min(3.4, current + delta));
    const center = {
      x: Number(cyRef.current.width?.() || 0) / 2,
      y: Number(cyRef.current.height?.() || 0) / 2
    };
    cyRef.current.zoom({
      level: next,
      renderedPosition: center
    });
  }, []);

  const goHome = useCallback(() => {
    if (!cyRef.current) return;
    const home = homeViewRef.current;
    if (!home) {
      fitGraph();
      return;
    }
    cyRef.current.zoom(home.zoom);
    cyRef.current.pan(home.pan);
  }, [fitGraph]);

  const applyRenderModel = useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const viewport = {
      width: Number(cy.width?.() || 0),
      height: Number(cy.height?.() || 0)
    };
    const positions: Record<string, { x: number; y: number }> = {};
    cy.nodes?.().forEach((node: any) => {
      const id = String(node.id?.() || '').trim();
      if (!id) return;
      const renderedPos = node.renderedPosition?.();
      positions[id] = {
        x: Number(renderedPos?.x || 0),
        y: Number(renderedPos?.y || 0)
      };
    });
    const render = buildGraphRenderState({
      nodes: graph.nodes || [],
      edges: graph.edges || [],
      selectedNodeId,
      hoveredNodeId,
      highlightedNodeIds,
      highlightedEdgeIds,
      focusMode: graph.filters?.focusMode || 'off',
      zoom: Number(cy.zoom?.() || 1),
      positions,
      viewport,
      revealAllLabels,
      bundleVisibleEdgeIds,
      diffSnapshot
    });
    if (render.zoomBand !== zoomBandRef.current) {
      zoomBandRef.current = render.zoomBand;
      onZoomBandChange?.(render.zoomBand);
    }
    cy.batch?.(() => {
      cy.nodes?.().forEach((node: any) => {
        const id = String(node.id?.() || '').trim();
        if (!id) return;
        node.data?.('displayLabel', render.labels[id] || '');
        node.data?.('nodeOpacity', Number(render.nodeOpacity[id] ?? 1));
        node.data?.('selected', id === String(selectedNodeId || '').trim() ? 1 : 0);
        node.data?.('highlighted', highlightedNodes.has(id) ? 1 : 0);
        node.data?.('pulse', pulseNodeId && pulseNodeId === id ? 1 : 0);
        node.data?.('diffStatus', render.nodeDiffStatus?.[id] || 'stable');
      });
      cy.edges?.().forEach((edge: any) => {
        const id = String(edge.id?.() || '').trim();
        if (!id) return;
        edge.data?.('edgeOpacity', Number(render.edgeOpacity[id] ?? 0.82));
        edge.data?.('highlighted', highlightedEdges.has(id) ? 1 : 0);
        edge.data?.('diffStatus', render.edgeDiffStatus?.[id] || 'stable');
      });
    });
    setZoomPercent(Math.max(1, Math.round(Number(cy.zoom?.() || 1) * 100)));
  }, [
    graph.edges,
    graph.filters?.focusMode,
    graph.nodes,
    diffSnapshot,
    bundleVisibleEdgeIds,
    highlightedEdgeIds,
    highlightedEdges,
    highlightedNodeIds,
    highlightedNodes,
    onZoomBandChange,
    hoveredNodeId,
    revealAllLabels,
    selectedNodeId,
    pulseNodeId
  ]);

  const queueRenderModel = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyRenderModel();
    });
  }, [applyRenderModel]);

  const handleCy = useCallback((cy: any) => {
    if (!cy || cyRef.current === cy) return;
    cyRef.current = cy;
    cy.on?.('tap', 'node', (evt: any) => {
      const nodeId = String(evt?.target?.id?.() || '').trim();
      if (!nodeId) return;
      onSelectNode(nodeId);
      const now = Date.now();
      if (lastTapRef.current.id === nodeId && (now - lastTapRef.current.atMs) <= 320) {
        const node = cy.getElementById?.(nodeId);
        if (node && !node.empty?.()) {
          const hood = node.closedNeighborhood?.();
          if (hood && hood.length > 0) cy.fit(hood, 44);
          else cy.fit(node, 44);
        }
      }
      lastTapRef.current = { id: nodeId, atMs: now };
      queueRenderModel();
    });
    cy.on?.('mouseover', 'node', (evt: any) => {
      const nodeId = String(evt?.target?.id?.() || '').trim();
      setHoveredNodeId(nodeId || null);
    });
    cy.on?.('mouseout', 'node', () => {
      setHoveredNodeId(null);
    });
    cy.on?.('zoom pan render layoutstop', () => {
      queueRenderModel();
    });
    const container = cy.container?.();
    if (container) {
      container.addEventListener('contextmenu', (event: Event) => {
        event.preventDefault();
      });
    }
    cy.userPanningEnabled?.(true);
    cy.userZoomingEnabled?.(true);
    cy.boxSelectionEnabled?.(false);
    setTimeout(() => {
      cy.resize?.();
      cy.fit?.(undefined, 34);
      homeViewRef.current = {
        zoom: Number(cy.zoom?.() || 1),
        pan: { ...(cy.pan?.() || { x: 0, y: 0 }) }
      };
      queueRenderModel();
    }, 10);
  }, [onSelectNode, queueRenderModel]);

  useEffect(() => {
    queueRenderModel();
  }, [queueRenderModel, graph.scopeKey, selectedNodeId, hoveredNodeId, revealAllLabels, highlightedNodeIds, highlightedEdgeIds]);

  useEffect(() => {
    if (!cyRef.current) return;
    const layout = cyRef.current.layout?.(layoutConfig);
    layout?.run?.();
    queueRenderModel();
  }, [layoutConfig, layoutRunNonce, queueRenderModel, graph.scopeKey]);

  useEffect(() => {
    if (!cyRef.current) return;
    if (!Number.isFinite(Number(pathZoomNonce)) || Number(pathZoomNonce) <= 0) return;
    const nodes = (pathAnimationNodeIds || highlightedNodeIds || [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    const edges = (highlightedEdgeIds || [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (nodes.length === 0 && edges.length === 0) return;
    const collection = cyRef.current.collection?.();
    nodes.forEach((id) => {
      const node = cyRef.current.getElementById?.(id);
      if (node && !node.empty?.()) collection?.merge?.(node);
    });
    edges.forEach((id) => {
      const edge = cyRef.current.getElementById?.(id);
      if (edge && !edge.empty?.()) collection?.merge?.(edge);
    });
    if (collection && collection.length > 0) {
      cyRef.current.fit(collection, 38);
    }
  }, [highlightedEdgeIds, highlightedNodeIds, pathAnimationNodeIds, pathZoomNonce]);

  useEffect(() => {
    if (pulseTimerRef.current != null) {
      window.clearInterval(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
    if (!Number.isFinite(Number(pathAnimationNonce)) || Number(pathAnimationNonce) <= 0) {
      setPulseNodeId(null);
      return;
    }
    const ordered = (pathAnimationNodeIds || highlightedNodeIds || [])
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    if (ordered.length === 0) {
      setPulseNodeId(null);
      return;
    }
    let idx = 0;
    setPulseNodeId(ordered[0] || null);
    pulseTimerRef.current = window.setInterval(() => {
      idx += 1;
      if (idx >= ordered.length) {
        if (pulseTimerRef.current != null) {
          window.clearInterval(pulseTimerRef.current);
          pulseTimerRef.current = null;
        }
        setPulseNodeId(null);
        return;
      }
      setPulseNodeId(ordered[idx] || null);
    }, 220);
    return () => {
      if (pulseTimerRef.current != null) {
        window.clearInterval(pulseTimerRef.current);
        pulseTimerRef.current = null;
      }
      setPulseNodeId(null);
    };
  }, [highlightedNodeIds, pathAnimationNodeIds, pathAnimationNonce]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (pulseTimerRef.current != null) {
      window.clearInterval(pulseTimerRef.current);
      pulseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || '').toLowerCase();
      if (event.altKey) setRevealAllLabels(true);
      if (key === '0') {
        event.preventDefault();
        goHome();
      } else if (key === '=' || key === '+') {
        event.preventDefault();
        zoomBy(0.12);
      } else if (key === '-') {
        event.preventDefault();
        zoomBy(-0.12);
      } else if (key === 'f') {
        event.preventDefault();
        fitSelection();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.altKey) setRevealAllLabels(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [fitSelection, goHome, zoomBy]);

  const resolveBoxRect = (value: BoxZoomState | null) => {
    if (!value) return null;
    const x = Math.min(value.startX, value.endX);
    const y = Math.min(value.startY, value.endY);
    const width = Math.abs(value.endX - value.startX);
    const height = Math.abs(value.endY - value.startY);
    if (width < 6 || height < 6) return null;
    return { x, y, width, height };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setBoxZoom({ startX: x, startY: y, endX: x, endY: y });
    event.preventDefault();
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!boxZoom) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBoxZoom((prev) => prev ? ({
      ...prev,
      endX: event.clientX - rect.left,
      endY: event.clientY - rect.top
    }) : prev);
  };

  const handleMouseUp = () => {
    if (!boxZoom || !cyRef.current) {
      setBoxZoom(null);
      return;
    }
    const nextRect = resolveBoxRect(boxZoom);
    if (nextRect) {
      const inside = cyRef.current.nodes?.().filter((node: any) => {
        const pos = node.renderedPosition?.();
        const x = Number(pos?.x || 0);
        const y = Number(pos?.y || 0);
        return x >= nextRect.x &&
          x <= (nextRect.x + nextRect.width) &&
          y >= nextRect.y &&
          y <= (nextRect.y + nextRect.height);
      });
      if (inside && inside.length > 0) {
        cyRef.current.fit(inside, 32);
      }
    }
    setBoxZoom(null);
  };

  const drawRect = resolveBoxRect(boxZoom);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[520px] rounded border border-white/10 bg-black/25 overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <CytoscapeComponent
        elements={elements}
        style={{ width: '100%', height: '100%' }}
        layout={layoutConfig}
        stylesheet={stylesheet}
        cy={handleCy}
      />
      <div className="absolute left-2 top-2 z-20 flex flex-col gap-2 pointer-events-auto">
        <div className="rounded border border-white/10 bg-black/70 px-2 py-1 text-[10px] text-gray-300">
          {breadcrumb}
        </div>
        <div className="flex items-center gap-1 rounded border border-white/10 bg-black/70 px-1.5 py-1 text-[10px]">
          <button
            type="button"
            onClick={fitGraph}
            className="rounded border border-white/10 px-1.5 py-0.5 text-gray-200 hover:text-white"
          >
            Fit Graph
          </button>
          <button
            type="button"
            onClick={fitSelection}
            className="rounded border border-cyan-400/40 px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-500/10"
          >
            Fit Selection
          </button>
          <button
            type="button"
            onClick={goHome}
            className="rounded border border-white/10 px-1.5 py-0.5 text-gray-200 hover:text-white"
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-0.12)}
            className="rounded border border-white/10 px-1.5 py-0.5 text-gray-200 hover:text-white"
          >
            -
          </button>
          <span className="min-w-[44px] text-center text-gray-300">{zoomPercent}%</span>
          <button
            type="button"
            onClick={() => zoomBy(0.12)}
            className="rounded border border-white/10 px-1.5 py-0.5 text-gray-200 hover:text-white"
          >
            +
          </button>
          <button
            type="button"
            onClick={fitSelection}
            className="rounded border border-emerald-400/40 px-1.5 py-0.5 text-emerald-100 hover:bg-emerald-500/10"
          >
            Zoom to Focus
          </button>
        </div>
      </div>
      {drawRect ? (
        <div
          className="pointer-events-none absolute border border-cyan-300/80 bg-cyan-300/10 z-30"
          style={{
            left: drawRect.x,
            top: drawRect.y,
            width: drawRect.width,
            height: drawRect.height
          }}
        />
      ) : null}
      <LearningGraphMiniMap
        cy={cyRef.current}
        nodeCount={graph.nodes.length}
        edgeCount={graph.edges.length}
        zoomPercent={zoomPercent}
        onReturnToSelection={fitSelection}
      />
    </div>
  );
};

export default LearningGraphCanvas;
