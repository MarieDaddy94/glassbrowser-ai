import React from 'react';
import type { LearningGraphDiffMode, LearningGraphDiffSnapshot } from '../../types';

type Props = {
  diffMode: LearningGraphDiffMode;
  compareWindow: '7d' | '30d' | '90d' | 'all';
  compareAgentId: string | null;
  compareAgentOptions: Array<{ agentKey: string; label: string }>;
  diffSnapshot: LearningGraphDiffSnapshot | null;
  onDiffModeChange: (next: LearningGraphDiffMode) => void;
  onCompareWindowChange: (next: '7d' | '30d' | '90d' | 'all') => void;
  onCompareAgentChange: (next: string | null) => void;
};

const summarize = (diff: LearningGraphDiffSnapshot | null) => {
  if (!diff?.summary) {
    return {
      added: 0,
      removed: 0,
      changed: 0
    };
  }
  return {
    added: Number(diff.summary.addedNodes || 0) + Number(diff.summary.addedEdges || 0),
    removed: Number(diff.summary.removedNodes || 0) + Number(diff.summary.removedEdges || 0),
    changed: Number(diff.summary.changedNodes || 0) + Number(diff.summary.changedEdges || 0)
  };
};

const LearningGraphDiffPanel: React.FC<Props> = ({
  diffMode,
  compareWindow,
  compareAgentId,
  compareAgentOptions,
  diffSnapshot,
  onDiffModeChange,
  onCompareWindowChange,
  onCompareAgentChange
}) => {
  const summary = summarize(diffSnapshot);
  const nodeDelta = (diffSnapshot?.nodeDiffs || []).filter((entry) => entry.status !== 'stable').slice(0, 5);
  const edgeDelta = (diffSnapshot?.edgeDiffs || []).filter((entry) => entry.status !== 'stable').slice(0, 5);

  return (
    <div className="rounded border border-white/10 bg-black/30 p-2 space-y-2 text-[11px]">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-gray-400 min-w-[150px]">
          Diff Mode
          <select
            value={diffMode}
            onChange={(e) => onDiffModeChange(e.target.value as LearningGraphDiffMode)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
          >
            <option value="off">Off</option>
            <option value="time_compare">Time Compare</option>
            <option value="agent_compare">Agent Compare</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-gray-400 min-w-[130px]">
          Compare Window
          <select
            value={compareWindow}
            onChange={(e) => onCompareWindowChange(e.target.value as '7d' | '30d' | '90d' | 'all')}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            disabled={diffMode !== 'time_compare'}
          >
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="90d">90d</option>
            <option value="all">all</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-gray-400 min-w-[180px]">
          Compare Agent
          <select
            value={compareAgentId || ''}
            onChange={(e) => onCompareAgentChange(e.target.value || null)}
            className="px-2 py-1 rounded border border-white/10 bg-black/40 text-gray-200"
            disabled={diffMode !== 'agent_compare'}
          >
            <option value="">Select agent</option>
            {compareAgentOptions.map((entry) => (
              <option key={entry.agentKey} value={entry.agentKey}>{entry.label}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-400">
          <span>Added {summary.added}</span>
          <span>Removed {summary.removed}</span>
          <span>Changed {summary.changed}</span>
          <span>Build {Number(diffSnapshot?.buildMs || 0)}ms</span>
        </div>
      </div>
      {diffMode !== 'off' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div className="rounded border border-white/10 bg-black/40 p-2">
            <div className="uppercase tracking-wider text-[10px] text-cyan-300 mb-1">Node Deltas</div>
            {nodeDelta.length === 0 ? (
              <div className="text-gray-500">No node deltas.</div>
            ) : (
              nodeDelta.map((entry) => (
                <div key={`node:${entry.nodeId}`} className="text-gray-300 py-0.5 border-b border-white/5 last:border-b-0">
                  {entry.nodeId} • {entry.status}
                </div>
              ))
            )}
          </div>
          <div className="rounded border border-white/10 bg-black/40 p-2">
            <div className="uppercase tracking-wider text-[10px] text-cyan-300 mb-1">Edge Deltas</div>
            {edgeDelta.length === 0 ? (
              <div className="text-gray-500">No edge deltas.</div>
            ) : (
              edgeDelta.map((entry) => (
                <div key={`edge:${entry.edgeId}`} className="text-gray-300 py-0.5 border-b border-white/5 last:border-b-0">
                  {entry.edgeId} • {entry.status}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LearningGraphDiffPanel;
