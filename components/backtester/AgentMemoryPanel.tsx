import React from 'react';
import type { AgentMemoryPanelProps } from './types';
import TagPills from '../TagPills';
import VirtualItem from '../VirtualItem';

const AgentMemoryPanel: React.FC<AgentMemoryPanelProps> = ({ ctx }) => {
  const {
    agentMemorySymbol,
    setAgentMemorySymbol,
    agentMemoryTimeframe,
    setAgentMemoryTimeframe,
    agentMemoryKind,
    setAgentMemoryKind,
    agentMemoryAgentId,
    setAgentMemoryAgentId,
    agentMemoryScope,
    setAgentMemoryScope,
    agentMemoryCategory,
    setAgentMemoryCategory,
    agentMemorySubcategory,
    setAgentMemorySubcategory,
    agentMemoryLimit,
    setAgentMemoryLimit,
    memoryPresets,
    memoryPresetName,
    setMemoryPresetName,
    setMemoryPresetError,
    setMemoryPresetStatus,
    memoryPresetId,
    setMemoryPresetId,
    handleSaveMemoryPreset,
    handleLoadMemoryPreset,
    handleDeleteMemoryPreset,
    memoryPresetError,
    memoryPresetStatus,
    handleUseCurrentMemoryFilters,
    loadAgentMemory,
    agentMemoryUpdatedAtMs,
    formatAge,
    agentMemoryQuery,
    setAgentMemoryQuery,
    agentMemoryLoading,
    filteredAgentMemory,
    agentMemoryExpandedId,
    setAgentMemoryExpandedId,
    agentMemoryError
  } = ctx;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
      <div className="text-xs uppercase tracking-wider text-gray-400">Agent Memory</div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
        <label className="flex flex-col gap-1">
          Symbol
          <input
            value={agentMemorySymbol}
            onChange={(e) => setAgentMemorySymbol(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          Timeframe
          <input
            value={agentMemoryTimeframe}
            onChange={(e) => setAgentMemoryTimeframe(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          Kind
          <input
            value={agentMemoryKind}
            onChange={(e) => setAgentMemoryKind(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="backtest_summary"
          />
        </label>
        <label className="flex flex-col gap-1">
          Agent
          <input
            value={agentMemoryAgentId}
            onChange={(e) => setAgentMemoryAgentId(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="agent-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Scope
          <input
            value={agentMemoryScope}
            onChange={(e) => setAgentMemoryScope(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="shared"
          />
        </label>
        <label className="flex flex-col gap-1">
          Category
          <input
            value={agentMemoryCategory}
            onChange={(e) => setAgentMemoryCategory(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="backtest"
          />
        </label>
        <label className="flex flex-col gap-1">
          Subcategory
          <input
            value={agentMemorySubcategory}
            onChange={(e) => setAgentMemorySubcategory(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="summary"
          />
        </label>
        <label className="flex flex-col gap-1">
          Limit
          <input
            type="number"
            min={1}
            max={100}
            value={agentMemoryLimit}
            onChange={(e) => {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw)) return;
              setAgentMemoryLimit(Math.max(1, Math.min(100, Math.floor(raw))));
            }}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span className="uppercase tracking-wider">Presets</span>
        <span>{memoryPresets.length} saved</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
        <label className="flex flex-col gap-1">
          Preset Name
          <input
            value={memoryPresetName}
            onChange={(e) => {
              setMemoryPresetName(e.target.value);
              setMemoryPresetError(null);
              setMemoryPresetStatus(null);
            }}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="Agent memory preset"
          />
        </label>
        <label className="flex flex-col gap-1">
          Saved Presets
          <select
            value={memoryPresetId}
            onChange={(e) => {
              const next = e.target.value;
              setMemoryPresetId(next);
              setMemoryPresetError(null);
              setMemoryPresetStatus(null);
            }}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          >
            <option value="">Select preset</option>
            {memoryPresets.map((preset: any) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => handleSaveMemoryPreset('new')}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => handleSaveMemoryPreset('update')}
          disabled={!memoryPresetId}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
        >
          Update
        </button>
        <button
          type="button"
          onClick={handleLoadMemoryPreset}
          disabled={!memoryPresetId}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
        >
          Load
        </button>
        <button
          type="button"
          onClick={handleDeleteMemoryPreset}
          disabled={!memoryPresetId}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {memoryPresetError && <div className="text-[11px] text-red-400">{memoryPresetError}</div>}
      {memoryPresetStatus && <div className="text-[11px] text-emerald-400">{memoryPresetStatus}</div>}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={handleUseCurrentMemoryFilters}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
        >
          Use Current
        </button>
        <button
          type="button"
          onClick={loadAgentMemory}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
        >
          Refresh
        </button>
        {agentMemoryUpdatedAtMs && (
          <span className="text-[10px] text-gray-500">Updated {formatAge(agentMemoryUpdatedAtMs)} ago</span>
        )}
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-gray-300">
        Search
        <input
          value={agentMemoryQuery}
          onChange={(e) => setAgentMemoryQuery(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          placeholder="filter by symbol, kind, category, or agent"
        />
      </label>
      <div className="max-h-[220px] overflow-y-auto space-y-2 text-[11px]">
        {agentMemoryLoading && <div className="text-gray-500">Loading agent memory...</div>}
        {!agentMemoryLoading && filteredAgentMemory.length === 0 && (
          <div className="text-gray-500">No agent memories found.</div>
        )}
        {!agentMemoryLoading && filteredAgentMemory.map((entry: any, idx: number) => {
          const key = String(entry?.id || entry?.key || idx);
          const expanded = agentMemoryExpandedId === key;
          const summaryRaw = String(entry?.summary || '').trim();
          const summaryLines = summaryRaw ? summaryRaw.split('\n') : [];
          const summaryPreview = expanded ? summaryRaw : summaryLines.slice(0, 4).join('\n');
          const summarySuffix = !expanded && summaryLines.length > 4 ? '\n...more' : '';
          const meta = [
            entry?.kind,
            entry?.scope,
            entry?.category,
            entry?.subcategory,
            entry?.symbol,
            entry?.timeframe,
            entry?.agentId
          ].filter(Boolean).join(' ');
          const ageValue = entry?.updatedAtMs ?? entry?.createdAtMs ?? null;
          const age = ageValue ? formatAge(ageValue) : '';
          const tags = Array.isArray(entry?.tags) ? entry.tags.filter(Boolean) : [];
          let payloadBlock = '';
          if (expanded && entry?.payload) {
            try {
              payloadBlock = JSON.stringify(entry.payload, null, 2);
            } catch {
              payloadBlock = '';
            }
          }
          const payloadPreview = payloadBlock
            ? `${payloadBlock.slice(0, 1200)}${payloadBlock.length > 1200 ? '\n...truncated...' : ''}`
            : '';
          return (
            <VirtualItem key={key} minHeight={160} className="rounded-md border border-white/10 bg-black/30 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                <div>{meta || 'Memory'}</div>
                <button
                  type="button"
                  onClick={() => setAgentMemoryExpandedId(expanded ? null : key)}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  {expanded ? 'Hide' : 'Details'}
                </button>
              </div>
              {age && <div className="text-[10px] text-gray-500">Updated {age} ago</div>}
              <TagPills tags={tags} className="mt-1" />
              <div className="whitespace-pre-wrap text-gray-200">
                {summaryPreview || '(no summary)'}
                {summarySuffix}
              </div>
              {expanded && entry?.key && (
                <div className="text-[10px] text-gray-500">Key: {entry.key}</div>
              )}
              {expanded && payloadPreview && (
                <pre className="max-h-40 overflow-y-auto rounded bg-black/40 p-2 text-[10px] text-gray-300 whitespace-pre-wrap">
{payloadPreview}
                </pre>
              )}
            </VirtualItem>
          );
        })}
      </div>
      {agentMemoryError && <div className="text-[11px] text-red-400">{agentMemoryError}</div>}
    </div>
  );
};

export default React.memo(AgentMemoryPanel);

