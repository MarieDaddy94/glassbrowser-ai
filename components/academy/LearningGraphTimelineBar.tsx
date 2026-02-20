import React, { useMemo } from 'react';
import type { LearningGraphTimelineRange, LearningGraphTimelineWindow } from '../../types';

type Props = {
  range: LearningGraphTimelineRange;
  stats?: {
    caseCount?: number;
    lessonCount?: number;
    symbolLearningCount?: number;
    wins?: number;
    losses?: number;
    netR?: number;
  } | null;
  onRangeChange: (next: LearningGraphTimelineRange) => void;
};

const fmtLocalInput = (valueMs?: number | null) => {
  const ms = Number(valueMs);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const dt = new Date(ms);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const parseLocalInput = (value: string): number | null => {
  const text = String(value || '').trim();
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
};

const LearningGraphTimelineBar: React.FC<Props> = ({ range, stats, onRangeChange }) => {
  const windowValue: LearningGraphTimelineWindow = useMemo(() => {
    const raw = String(range?.window || 'all').trim().toLowerCase();
    if (raw === '7d' || raw === '30d' || raw === '90d' || raw === 'all' || raw === 'custom') {
      return raw;
    }
    return 'all';
  }, [range?.window]);

  return (
    <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5 flex flex-wrap items-end gap-2 text-[11px]">
      <label className="flex flex-col gap-1 text-gray-400 min-w-[120px]">
        Timeline
        <select
          value={windowValue}
          onChange={(e) => onRangeChange({ ...range, window: e.target.value as LearningGraphTimelineWindow })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="7d">Last 7d</option>
          <option value="30d">Last 30d</option>
          <option value="90d">Last 90d</option>
          <option value="all">All</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {windowValue === 'custom' ? (
        <>
          <label className="flex flex-col gap-1 text-gray-400 min-w-[185px]">
            Start
            <input
              type="datetime-local"
              value={fmtLocalInput(range?.startAtMs)}
              onChange={(e) => onRangeChange({
                ...range,
                window: 'custom',
                startAtMs: parseLocalInput(e.target.value),
                endAtMs: range?.endAtMs ?? null
              })}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-gray-400 min-w-[185px]">
            End
            <input
              type="datetime-local"
              value={fmtLocalInput(range?.endAtMs)}
              onChange={(e) => onRangeChange({
                ...range,
                window: 'custom',
                startAtMs: range?.startAtMs ?? null,
                endAtMs: parseLocalInput(e.target.value)
              })}
              className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            />
          </label>
        </>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
        <span>Cases {Number(stats?.caseCount || 0)}</span>
        <span>Lessons {Number(stats?.lessonCount || 0)}</span>
        <span>Symbols {Number(stats?.symbolLearningCount || 0)}</span>
        <span>W/L {Number(stats?.wins || 0)}/{Number(stats?.losses || 0)}</span>
        <span>NetR {Number.isFinite(Number(stats?.netR)) ? Number(stats?.netR).toFixed(2) : '--'}</span>
      </div>
    </div>
  );
};

export default LearningGraphTimelineBar;
