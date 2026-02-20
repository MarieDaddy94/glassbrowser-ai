import React, { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  cy: any | null;
  nodeCount: number;
  edgeCount: number;
  zoomPercent: number;
  onReturnToSelection?: () => void;
};

const WIDTH = 190;
const HEIGHT = 118;
const PADDING = 8;

const drawRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const radius = 5;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const resolveBounds = (cy: any) => {
  const nodeBounds = cy?.nodes?.().boundingBox?.({ includeLabels: false, includeOverlays: false });
  if (nodeBounds && Number.isFinite(Number(nodeBounds.w)) && Number(nodeBounds.w) > 0 && Number(nodeBounds.h) > 0) {
    return nodeBounds;
  }
  const ext = cy?.extent?.();
  const x1 = Number(ext?.x1 || -1);
  const y1 = Number(ext?.y1 || -1);
  const x2 = Number(ext?.x2 || 1);
  const y2 = Number(ext?.y2 || 1);
  return {
    x1,
    y1,
    x2,
    y2,
    w: Math.max(1, x2 - x1),
    h: Math.max(1, y2 - y1)
  };
};

const LearningGraphMiniMap: React.FC<Props> = ({
  cy,
  nodeCount,
  edgeCount,
  zoomPercent,
  onReturnToSelection
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const draggingViewportRef = useRef(false);
  const [stamp, setStamp] = useState(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(2,6,23,0.85)';
    drawRoundRect(ctx, 0.5, 0.5, canvas.width - 1, canvas.height - 1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (!cy) return;
    const bounds = resolveBounds(cy);
    const worldW = Math.max(1, Number(bounds.w) || 1);
    const worldH = Math.max(1, Number(bounds.h) || 1);
    const scaleX = (canvas.width - (PADDING * 2)) / worldW;
    const scaleY = (canvas.height - (PADDING * 2)) / worldH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = ((canvas.width - (worldW * scale)) / 2) - (bounds.x1 * scale);
    const offsetY = ((canvas.height - (worldH * scale)) / 2) - (bounds.y1 * scale);
    const toMini = (x: number, y: number) => ({
      x: (x * scale) + offsetX,
      y: (y * scale) + offsetY
    });

    ctx.fillStyle = 'rgba(125,211,252,0.75)';
    const nodes = cy.nodes?.() || [];
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const pos = node.position?.();
      const point = toMini(Number(pos?.x || 0), Number(pos?.y || 0));
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const ext = cy.extent?.() || {};
    const tl = toMini(Number(ext.x1 || bounds.x1), Number(ext.y1 || bounds.y1));
    const br = toMini(Number(ext.x2 || bounds.x2), Number(ext.y2 || bounds.y2));
    const rect = {
      x: Math.min(tl.x, br.x),
      y: Math.min(tl.y, br.y),
      w: Math.max(8, Math.abs(br.x - tl.x)),
      h: Math.max(8, Math.abs(br.y - tl.y))
    };
    viewportRectRef.current = rect;
    ctx.strokeStyle = 'rgba(34,211,238,0.95)';
    ctx.fillStyle = 'rgba(34,211,238,0.14)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }, [cy]);

  useEffect(() => {
    draw();
  }, [draw, stamp, nodeCount, edgeCount, zoomPercent]);

  useEffect(() => {
    if (!cy) return undefined;
    const onUpdate = () => setStamp((prev) => prev + 1);
    cy.on?.('pan zoom render add remove position', onUpdate);
    onUpdate();
    return () => {
      cy.off?.('pan zoom render add remove position', onUpdate);
    };
  }, [cy]);

  const centerAt = useCallback((clientX: number, clientY: number) => {
    if (!cy || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const bounds = resolveBounds(cy);
    const worldW = Math.max(1, Number(bounds.w) || 1);
    const worldH = Math.max(1, Number(bounds.h) || 1);
    const scaleX = (canvasRef.current.width - (PADDING * 2)) / worldW;
    const scaleY = (canvasRef.current.height - (PADDING * 2)) / worldH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = ((canvasRef.current.width - (worldW * scale)) / 2) - (bounds.x1 * scale);
    const offsetY = ((canvasRef.current.height - (worldH * scale)) / 2) - (bounds.y1 * scale);
    const worldX = (x - offsetX) / scale;
    const worldY = (y - offsetY) / scale;
    const zoom = Number(cy.zoom?.() || 1);
    cy.pan?.({
      x: (Number(cy.width?.() || 0) / 2) - (worldX * zoom),
      y: (Number(cy.height?.() || 0) / 2) - (worldY * zoom)
    });
  }, [cy]);

  const handlePointerDown = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    draggingViewportRef.current = true;
    centerAt(evt.clientX, evt.clientY);
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingViewportRef.current) return;
    centerAt(evt.clientX, evt.clientY);
  };

  const handlePointerUp = () => {
    draggingViewportRef.current = false;
  };

  return (
    <div className="absolute right-2 bottom-2 z-20 flex flex-col gap-1 pointer-events-auto">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="rounded border border-white/15 bg-black/55 cursor-crosshair shadow-md"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex items-center justify-between rounded border border-white/10 bg-black/65 px-2 py-1 text-[10px] text-gray-300">
        <span>Mini-map: N{nodeCount} • E{edgeCount} • {zoomPercent}%</span>
        <button
          type="button"
          onClick={onReturnToSelection}
          className="rounded border border-cyan-400/40 px-1.5 py-0.5 text-cyan-100 hover:bg-cyan-500/10"
          title="Return to selected node"
        >
          Selection
        </button>
      </div>
    </div>
  );
};

export default LearningGraphMiniMap;
