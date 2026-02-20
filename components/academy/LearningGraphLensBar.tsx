import React from 'react';
import type { LearningGraphFilters } from '../../types';

type Props = {
  filters: LearningGraphFilters;
  strategyOptions: string[];
  brokerOptions: string[];
  goalText: string;
  hasActivePath: boolean;
  onFiltersChange: (patch: Partial<LearningGraphFilters>) => void;
  onGoalTextChange: (value: string) => void;
  onRunPath: () => void;
  onClearPath: () => void;
  onRerunLayout?: () => void;
};

const LearningGraphLensBar: React.FC<Props> = ({
  filters,
  strategyOptions,
  brokerOptions,
  goalText,
  hasActivePath,
  onFiltersChange,
  onGoalTextChange,
  onRunPath,
  onClearPath,
  onRerunLayout
}) => (
  <div className="rounded border border-white/10 bg-black/30 p-2 space-y-2">
    <div className="grid grid-cols-1 lg:grid-cols-9 gap-2 text-[11px]">
      <label className="flex flex-col gap-1 text-gray-400">
        Lens
        <select
          value={filters.lens || 'hierarchy'}
          onChange={(e) => onFiltersChange({ lens: e.target.value as LearningGraphFilters['lens'] })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="hierarchy">Hierarchy</option>
          <option value="performance">Performance</option>
          <option value="recency">Recency</option>
          <option value="failure_mode">Failure Mode</option>
          <option value="strategy_broker">Strategy/Broker</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Window
        <select
          value={filters.timeWindow || 'all'}
          onChange={(e) => onFiltersChange({ timeWindow: e.target.value as LearningGraphFilters['timeWindow'] })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="90d">90d</option>
          <option value="all">All</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Strategy
        <select
          value={filters.strategyMode || ''}
          onChange={(e) => onFiltersChange({ strategyMode: e.target.value || null })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="">All strategies</option>
          {strategyOptions.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Broker
        <select
          value={filters.broker || ''}
          onChange={(e) => onFiltersChange({ broker: e.target.value || null })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="">All brokers</option>
          {brokerOptions.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Lesson State
        <select
          value={filters.lessonLifecycle || 'all'}
          onChange={(e) => onFiltersChange({ lessonLifecycle: e.target.value as LearningGraphFilters['lessonLifecycle'] })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="all">All</option>
          <option value="candidate">Candidate</option>
          <option value="core">Core</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Confidence {Number(filters.confidenceMin || 0).toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={Number(filters.confidenceMin || 0)}
          onChange={(e) => onFiltersChange({ confidenceMin: Number(e.target.value) })}
          className="accent-cyan-400"
        />
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Layout
        <select
          value={filters.layoutMode || 'hierarchy'}
          onChange={(e) => onFiltersChange({ layoutMode: e.target.value as LearningGraphFilters['layoutMode'] })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="hierarchy">Hierarchy</option>
          <option value="radial">Radial</option>
          <option value="force">Force</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Spread {Number(filters.spread ?? 1).toFixed(2)}
        <input
          type="range"
          min={0.55}
          max={2.4}
          step={0.05}
          value={Number(filters.spread ?? 1)}
          onChange={(e) => onFiltersChange({ spread: Number(e.target.value) })}
          className="accent-cyan-400"
        />
      </label>
      <label className="flex flex-col gap-1 text-gray-400">
        Focus
        <select
          value={filters.focusMode || 'off'}
          onChange={(e) => onFiltersChange({ focusMode: e.target.value as LearningGraphFilters['focusMode'] })}
          className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
        >
          <option value="off">Off</option>
          <option value="hop1">1-Hop</option>
          <option value="hop2">2-Hop</option>
          <option value="path">Path</option>
        </select>
      </label>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-2">
      <input
        value={goalText}
        onChange={(e) => onGoalTextChange(e.target.value)}
        placeholder="Goal path (e.g. reduce stop-outs on continuation shorts)"
        className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200 text-[11px]"
      />
      <button
        type="button"
        onClick={onRunPath}
        className="px-2 py-1 rounded border border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/10 text-[11px]"
      >
        Run Path
      </button>
      <button
        type="button"
        onClick={onClearPath}
        disabled={!hasActivePath}
        className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white disabled:opacity-40 text-[11px]"
      >
        Clear Path
      </button>
    </div>
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={onRerunLayout}
        disabled={!onRerunLayout}
        className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white text-[11px] disabled:opacity-40"
      >
        Re-run Layout
      </button>
    </div>
  </div>
);

export default LearningGraphLensBar;
