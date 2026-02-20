import type { LearningGraphFilters } from '../types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const asNum = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

export type LearningGraphLayoutMode = 'hierarchy' | 'radial' | 'force';

export const normalizeLearningGraphLayoutMode = (
  value: unknown,
  fallback: LearningGraphLayoutMode = 'hierarchy'
): LearningGraphLayoutMode => {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'radial') return 'radial';
  if (key === 'force') return 'force';
  if (key === 'hierarchy') return 'hierarchy';
  return fallback;
};

export const normalizeLearningGraphSpread = (value: unknown, fallback = 1): number => (
  clamp(asNum(value, fallback), 0.55, 2.4)
);

export const resolveLearningGraphLayout = (
  filters: Pick<LearningGraphFilters, 'lens' | 'layoutMode' | 'spread'> | null | undefined
) => {
  const lens = String(filters?.lens || '').trim().toLowerCase();
  const mode = normalizeLearningGraphLayoutMode(filters?.layoutMode, lens === 'recency' ? 'radial' : 'hierarchy');
  const spread = normalizeLearningGraphSpread(filters?.spread, 1);
  if (mode === 'hierarchy') {
    return {
      name: 'breadthfirst',
      directed: true,
      fit: true,
      animate: false,
      padding: Math.round(30 + (spread * 24)),
      spacingFactor: Number((1 + (spread * 0.85)).toFixed(2))
    };
  }
  if (mode === 'radial') {
    return {
      name: 'concentric',
      fit: true,
      animate: false,
      padding: Math.round(28 + (spread * 20)),
      spacingFactor: Number((0.92 + (spread * 0.7)).toFixed(2)),
      levelWidth: () => 1
    };
  }
  return {
    name: 'cose',
    fit: true,
    animate: false,
    padding: Math.round(24 + (spread * 18)),
    idealEdgeLength: Number((90 * spread).toFixed(2)),
    nodeRepulsion: Number((4200 * spread).toFixed(0)),
    gravity: Number((0.8 / spread).toFixed(3))
  };
};
