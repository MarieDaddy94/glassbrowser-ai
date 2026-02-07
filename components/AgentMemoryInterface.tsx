import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Database, Download, Filter, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { Agent, AgentMemoryEntry } from '../types';
import TagPills from './TagPills';
import VirtualItem from './VirtualItem';
import { createPanelActionRunner } from '../services/panelConnectivityEngine';

interface AgentMemoryInterfaceProps {
  activeSymbol?: string;
  activeTimeframe?: string;
  agents?: Agent[];
  onOpenSettings?: () => void;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
}

const STORAGE_KEY = 'glass_agent_memory_panel_v1';
const PRESET_KEY = 'glass_agent_memory_filter_presets_v1';

type AgentMemoryFilterPreset = {
  id: string;
  name: string;
  filters: {
    symbol?: string;
    timeframe?: string;
    kind?: string;
    tags?: string;
    limit?: number;
    query?: string;
    agentId?: string;
    scope?: string;
    category?: string;
    subcategory?: string;
  };
};

function readStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredConfig(payload: any) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function readMemoryPresets(): AgentMemoryFilterPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || ''),
        filters: item?.filters && typeof item.filters === 'object' ? item.filters : {}
      }))
      .filter((item) => item.id && item.name);
  } catch {
    return [];
  }
}

function writeMemoryPresets(presets: AgentMemoryFilterPreset[]) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

function formatAge(ms: number | null | undefined) {
  if (!ms || ms <= 0) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(1, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatTs(ts: number | null | undefined) {
  if (!ts || ts <= 0) return '--';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function parseTags(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const parts = text.split(/[,\n]+/g).map((part) => part.trim()).filter(Boolean);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(part);
  }
  return tags;
}

const AgentMemoryInterface: React.FC<AgentMemoryInterfaceProps> = ({
  activeSymbol,
  activeTimeframe,
  agents,
  onOpenSettings,
  onRunActionCatalog
}) => {
  const initialConfig = readStoredConfig();
  const [symbol, setSymbol] = useState<string>(initialConfig?.symbol || '');
  const [timeframe, setTimeframe] = useState<string>(initialConfig?.timeframe || '');
  const [kind, setKind] = useState<string>(initialConfig?.kind || '');
  const [agentId, setAgentId] = useState<string>(initialConfig?.agentId || '');
  const [scope, setScope] = useState<string>(initialConfig?.scope || 'all');
  const [category, setCategory] = useState<string>(initialConfig?.category || '');
  const [subcategory, setSubcategory] = useState<string>(initialConfig?.subcategory || '');
  const [tagsInput, setTagsInput] = useState<string>(initialConfig?.tags || '');
  const [limit, setLimit] = useState<number>(initialConfig?.limit ?? 200);
  const [query, setQuery] = useState<string>('');
  const [entries, setEntries] = useState<AgentMemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [memoryPresets, setMemoryPresets] = useState<AgentMemoryFilterPreset[]>(() => readMemoryPresets());
  const [memoryPresetId, setMemoryPresetId] = useState<string>(initialConfig?.presetId || '');
  const [memoryPresetName, setMemoryPresetName] = useState<string>('');
  const [memoryPresetStatus, setMemoryPresetStatus] = useState<string | null>(null);
  const [memoryPresetError, setMemoryPresetError] = useState<string | null>(null);
  const runPanelAction = useMemo(
    () =>
      createPanelActionRunner({
        panel: 'agentmemory',
        runActionCatalog: onRunActionCatalog,
        defaultSource: 'catalog',
        defaultFallbackSource: 'ledger'
      }),
    [onRunActionCatalog]
  );

  const runActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      return runPanelAction(actionId, payload, {
        fallback: async () => {
          fallback?.();
          return { ok: true, data: null };
        }
      });
    },
    [runPanelAction]
  );

  const agentOptions = useMemo(() => {
    const list = Array.isArray(agents) ? agents : [];
    const seen = new Set<string>();
    const items: Array<{ id: string; name: string }> = [];
    for (const agent of list) {
      const id = String(agent?.id || '').trim();
      const name = String(agent?.name || '').trim();
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      items.push({ id, name });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [agents]);

  const tagFilters = useMemo(() => parseTags(tagsInput), [tagsInput]);
  const normalizedLimit = useMemo(() => {
    const raw = Number(limit);
    return Number.isFinite(raw) ? Math.max(1, Math.min(5000, Math.floor(raw))) : 200;
  }, [limit]);

  useEffect(() => {
    if (symbol) return;
    const fallback = String(activeSymbol || '').trim();
    if (fallback) setSymbol(fallback);
  }, [activeSymbol, symbol]);

  useEffect(() => {
    if (timeframe) return;
    const fallback = String(activeTimeframe || '').trim();
    if (fallback) setTimeframe(fallback);
  }, [activeTimeframe, timeframe]);

  useEffect(() => {
    writeStoredConfig({
      symbol,
      timeframe,
      kind,
      agentId,
      scope,
      category,
      subcategory,
      tags: tagsInput,
      limit: normalizedLimit,
      presetId: memoryPresetId
    });
  }, [agentId, category, kind, memoryPresetId, normalizedLimit, scope, subcategory, symbol, tagsInput, timeframe]);

  useEffect(() => {
    writeMemoryPresets(memoryPresets);
  }, [memoryPresets]);

  const buildDefaultPresetName = useCallback(() => {
    const parts = [
      symbol || '',
      timeframe || '',
      kind || '',
      category || '',
      subcategory || '',
      scope && scope !== 'all' ? scope : '',
      agentId ? `agent:${agentId}` : ''
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Agent Memory Filter';
  }, [agentId, category, kind, scope, subcategory, symbol, timeframe]);

  const applyMemoryPreset = useCallback((preset: AgentMemoryFilterPreset) => {
    const filters = preset.filters || {};
    setSymbol(String(filters.symbol || ''));
    setTimeframe(String(filters.timeframe || ''));
    setKind(String(filters.kind || ''));
    setAgentId(String(filters.agentId || ''));
    setScope(String(filters.scope || 'all'));
    setCategory(String(filters.category || ''));
    setSubcategory(String(filters.subcategory || ''));
    setTagsInput(String(filters.tags || ''));
    if (filters.limit != null) {
      const raw = Number(filters.limit);
      if (Number.isFinite(raw)) setLimit(Math.max(1, Math.min(5000, Math.floor(raw))));
    }
    setQuery(String(filters.query || ''));
  }, []);

  const handleSavePreset = useCallback((mode: 'new' | 'update') => {
    setMemoryPresetError(null);
    setMemoryPresetStatus(null);
    const name = memoryPresetName.trim() || buildDefaultPresetName();
    if (!name) {
      setMemoryPresetError('Preset name is required.');
      return;
    }
    if (mode === 'update' && !memoryPresetId) {
      setMemoryPresetError('Select a preset to update.');
      return;
    }
    const filters = {
      symbol: String(symbol || '').trim(),
      timeframe: String(timeframe || '').trim(),
      kind: String(kind || '').trim(),
      agentId: String(agentId || '').trim(),
      scope: String(scope || '').trim(),
      category: String(category || '').trim(),
      subcategory: String(subcategory || '').trim(),
      tags: String(tagsInput || '').trim(),
      limit: normalizedLimit,
      query: String(query || '').trim()
    };
    setMemoryPresets((prev) => {
      const next = [...prev];
      if (mode === 'update') {
        const idx = next.findIndex((item) => item.id === memoryPresetId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], name, filters };
        }
        return next.sort((a, b) => a.name.localeCompare(b.name));
      }
      const id = `memory_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
      next.push({ id, name, filters });
      setMemoryPresetId(id);
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setMemoryPresetStatus(mode === 'update' ? 'Preset updated.' : 'Preset saved.');
    setMemoryPresetName('');
  }, [
    agentId,
    buildDefaultPresetName,
    category,
    kind,
    memoryPresetId,
    memoryPresetName,
    normalizedLimit,
    query,
    scope,
    subcategory,
    symbol,
    tagsInput,
    timeframe
  ]);

  const handleLoadPreset = useCallback(() => {
    setMemoryPresetError(null);
    setMemoryPresetStatus(null);
    if (!memoryPresetId) {
      setMemoryPresetError('Select a preset to load.');
      return;
    }
    const preset = memoryPresets.find((item) => item.id === memoryPresetId);
    if (!preset) {
      setMemoryPresetError('Preset not found.');
      return;
    }
    applyMemoryPreset(preset);
    setMemoryPresetStatus('Preset applied.');
  }, [applyMemoryPreset, memoryPresetId, memoryPresets]);

  const handleDeletePreset = useCallback(() => {
    setMemoryPresetError(null);
    setMemoryPresetStatus(null);
    if (!memoryPresetId) {
      setMemoryPresetError('Select a preset to delete.');
      return;
    }
    const preset = memoryPresets.find((item) => item.id === memoryPresetId);
    if (!preset) {
      setMemoryPresetError('Preset not found.');
      return;
    }
    setMemoryPresets((prev) => prev.filter((item) => item.id !== memoryPresetId));
    setMemoryPresetId('');
    setMemoryPresetStatus(`Deleted "${preset.name}".`);
  }, [memoryPresetId, memoryPresets]);

  const loadMemory = useCallback(async () => {
    const symbolValue = String(symbol || '').trim();
    const timeframeValue = String(timeframe || '').trim();
    const kindValue = String(kind || '').trim();
    const agentValue = String(agentId || '').trim();
    const scopeValue = String(scope || '').trim().toLowerCase();
    const categoryValue = String(category || '').trim();
    const subcategoryValue = String(subcategory || '').trim();
    const scopeFilter = scopeValue && scopeValue !== 'all' ? scopeValue : undefined;
    const tags = tagFilters.length > 0 ? tagFilters : undefined;
    const payload = {
      limit: normalizedLimit,
      symbol: symbolValue || undefined,
      timeframe: timeframeValue || undefined,
      kind: kindValue || undefined,
      tags,
      agentId: agentValue || undefined,
      scope: scopeFilter,
      category: categoryValue || undefined,
      subcategory: subcategoryValue || undefined
    };

    setLoading(true);
    setError(null);
    setExportStatus(null);
    try {
      const res = await runPanelAction('agent.memory.list', payload, {
        fallback: async () => {
          const ledger = window.glass?.tradeLedger;
          if (!ledger?.listAgentMemory) {
            return { ok: false, error: 'Agent memory unavailable.' };
          }
          return await ledger.listAgentMemory(payload);
        }
      });
      if (!res?.ok) {
        setError(res?.error ? String(res.error) : 'Failed to load agent memory.');
        setEntries([]);
        return;
      }
      const nextEntries = Array.isArray(res?.data?.memories) ? res.data.memories : [];
      setEntries(nextEntries);
      setUpdatedAtMs(Date.now());
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to load agent memory.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [agentId, category, kind, normalizedLimit, runPanelAction, scope, subcategory, symbol, tagFilters, timeframe]);

  const handleUseActive = useCallback(() => {
    const nextSymbol = String(activeSymbol || '').trim();
    const nextTimeframe = String(activeTimeframe || '').trim();
    runActionOr(
      'agent.memory.filters.set',
      { useActive: true },
      () => {
        if (nextSymbol) setSymbol(nextSymbol);
        if (nextTimeframe) setTimeframe(nextTimeframe);
      }
    );
  }, [activeSymbol, activeTimeframe, runActionOr]);

  const handleClearFilters = useCallback(() => {
    runActionOr(
      'agent.memory.filters.set',
      { clear: true },
      () => {
        setSymbol('');
        setTimeframe('');
        setKind('');
        setAgentId('');
        setScope('all');
        setCategory('');
        setSubcategory('');
        setTagsInput('');
        setQuery('');
        setLimit(200);
      }
    );
  }, [runActionOr]);

  useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      if (detail.clear) {
        handleClearFilters();
        if (detail.refresh) void loadMemory();
        return;
      }
      if (detail.symbol != null) setSymbol(String(detail.symbol));
      if (detail.timeframe != null) setTimeframe(String(detail.timeframe));
      if (detail.kind != null) setKind(String(detail.kind));
      if (detail.agentId != null) setAgentId(String(detail.agentId));
      if (detail.scope != null) setScope(String(detail.scope));
      if (detail.category != null) setCategory(String(detail.category));
      if (detail.subcategory != null) setSubcategory(String(detail.subcategory));
      if (detail.tags != null) setTagsInput(String(detail.tags));
      if (detail.query != null) setQuery(String(detail.query));
      if (detail.limit != null) {
        const next = Number(detail.limit);
        if (Number.isFinite(next)) setLimit(Math.max(1, Math.min(5000, Math.floor(next))));
      }
      if (detail.useActive) handleUseActive();
      if (detail.refresh) void loadMemory();
    };
    window.addEventListener('glass_agent_memory_filters', handler as any);
    return () => window.removeEventListener('glass_agent_memory_filters', handler as any);
  }, [handleClearFilters, handleUseActive, loadMemory]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => {
      if (!entry) return false;
      const blob = [
        entry.key,
        entry.familyKey,
        entry.agentId,
        entry.scope,
        entry.category,
        entry.subcategory,
        entry.kind,
        entry.symbol,
        entry.timeframe,
        entry.summary,
        entry.source,
        Array.isArray(entry.tags) ? entry.tags.join(' ') : ''
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [entries, query]);

  const handleDeleteEntry = useCallback(async (entry: AgentMemoryEntry) => {
    const id = String(entry?.id || '').trim();
    const key = String(entry?.key || '').trim();
    if (!id && !key) return;
    const label = key || id;
    if (!window.confirm(`Delete agent memory "${label}"?`)) return;
    setError(null);
    try {
      const res = await runPanelAction('agent.memory.delete', { id, key }, {
        fallback: async () => {
          const ledger = window.glass?.tradeLedger;
          if (!ledger?.deleteAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
          return await ledger.deleteAgentMemory({ id: id || undefined, key: key || undefined });
        }
      });
      if (!res?.ok) {
        setError(res?.error ? String(res.error) : 'Failed to delete memory.');
        return;
      }
      setEntries((prev) => prev.filter((item) => item?.id !== id && item?.key !== key));
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to delete memory.');
    }
  }, [runPanelAction]);

  const handleClearAll = useCallback(async () => {
    if (!window.confirm('Clear all agent memory entries?')) return;
    setError(null);
    setExportStatus(null);
    try {
      const res = await runPanelAction('agent.memory.clear', {}, {
        fallback: async () => {
          const ledger = window.glass?.tradeLedger;
          if (!ledger?.clearAgentMemory) return { ok: false, error: 'Agent memory unavailable.' };
          return await ledger.clearAgentMemory();
        }
      });
      if (!res?.ok) {
        setError(res?.error ? String(res.error) : 'Failed to clear agent memory.');
        return;
      }
      setEntries([]);
      setUpdatedAtMs(Date.now());
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to clear agent memory.');
    }
  }, [runPanelAction]);

  const buildExportPayload = useCallback(() => {
    return {
      exportedAt: new Date().toISOString(),
      filters: {
        symbol: symbol || null,
        timeframe: timeframe || null,
        kind: kind || null,
        agentId: agentId || null,
        scope: scope || null,
        category: category || null,
        subcategory: subcategory || null,
        tags: tagFilters.length > 0 ? tagFilters : null,
        limit: normalizedLimit,
        query: query || null
      },
      totalLoaded: entries.length,
      totalFiltered: filteredEntries.length,
      entries: filteredEntries
    };
  }, [agentId, category, entries.length, filteredEntries, kind, normalizedLimit, query, scope, subcategory, symbol, tagFilters, timeframe]);

  const exportFilters = useMemo(() => {
    const scopeValue = String(scope || '').trim().toLowerCase();
    return {
      limit: normalizedLimit,
      symbol: symbol || undefined,
      timeframe: timeframe || undefined,
      kind: kind || undefined,
      tags: tagFilters.length > 0 ? tagFilters : undefined,
      agentId: agentId || undefined,
      scope: scopeValue && scopeValue !== 'all' ? scopeValue : undefined,
      category: category || undefined,
      subcategory: subcategory || undefined
    };
  }, [agentId, category, kind, normalizedLimit, scope, subcategory, symbol, tagFilters, timeframe]);

  const copyExport = useCallback(async () => {
    const payload = JSON.stringify(buildExportPayload(), null, 2);
    try {
      const fn = window.glass?.clipboard?.writeText;
      if (fn) {
        const res = fn(payload);
        if (res && typeof res.then === 'function') await res;
        setExportStatus('Copied JSON to clipboard.');
        return;
      }
    } catch {
      // ignore
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setExportStatus('Copied JSON to clipboard.');
      }
    } catch {
      setExportStatus('Copy failed.');
    }
  }, [buildExportPayload]);

  const downloadExport = useCallback(() => {
    const payload = JSON.stringify(buildExportPayload(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const symbolPart = symbol ? symbol.replace(/[^A-Za-z0-9_-]+/g, '_') : 'all';
    const tfPart = timeframe ? timeframe.replace(/[^A-Za-z0-9_-]+/g, '_') : 'any';
    link.href = url;
    link.download = `agent_memory_${symbolPart}_${tfPart}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportStatus('Download started.');
  }, [buildExportPayload, symbol, timeframe]);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const mode = String(detail.mode || detail.format || '').trim().toLowerCase();
      if (detail.refresh) void loadMemory();
      if (mode === 'download' || mode === 'file') {
        downloadExport();
        return;
      }
      copyExport();
    };
    window.addEventListener('glass_agent_memory_export', handler as any);
    return () => window.removeEventListener('glass_agent_memory_export', handler as any);
  }, [copyExport, downloadExport, loadMemory]);

  const activeLabel = useMemo(() => {
    const parts = [String(activeSymbol || '').trim(), String(activeTimeframe || '').trim()].filter(Boolean);
    return parts.length ? parts.join(' ') : '';
  }, [activeSymbol, activeTimeframe]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
          <Database size={16} />
          <span>Agent Memory</span>
          {activeLabel && <span className="text-[11px] text-gray-400">({activeLabel})</span>}
        </div>
        <div className="flex items-center gap-2">
          {updatedAtMs && (
            <span className="text-[10px] text-gray-500">Updated {formatAge(updatedAtMs)} ago</span>
          )}
          <button
            type="button"
            onClick={loadMemory}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-gray-200"
              title="Settings"
            >
              <Settings size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Filter size={12} />
                Filters
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
                <label className="flex flex-col gap-1">
                  Symbol
                  <input
                    value={symbol}
                    onChange={(e) => runActionOr('agent.memory.filters.set', { symbol: e.target.value }, () => setSymbol(e.target.value))}
                    placeholder="BTCUSD"
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Timeframe
                  <input
                    value={timeframe}
                    onChange={(e) => runActionOr('agent.memory.filters.set', { timeframe: e.target.value }, () => setTimeframe(e.target.value))}
                    placeholder="15m"
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Agent
                  <select
                    value={agentId}
                    onChange={(e) => runActionOr('agent.memory.filters.set', { agentId: e.target.value }, () => setAgentId(e.target.value))}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  >
                    <option value="">All agents</option>
                    {agentOptions.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Scope
                  <select
                    value={scope}
                    onChange={(e) => runActionOr('agent.memory.filters.set', { scope: e.target.value }, () => setScope(e.target.value))}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  >
                    <option value="all">All</option>
                    <option value="shared">Shared</option>
                    <option value="agent">Agent</option>
                    <option value="global">Global</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Category
                  <input
                    value={category}
                    onChange={(e) => runActionOr('agent.memory.filters.set', { category: e.target.value }, () => setCategory(e.target.value))}
                    placeholder="signal"
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Subcategory
                  <input
                    value={subcategory}
                    onChange={(e) => runActionOr('agent.memory.filters.set', { subcategory: e.target.value }, () => setSubcategory(e.target.value))}
                    placeholder="history"
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Kind
                  <input
                    value={kind}
                    onChange={(e) => runActionOr('agent.memory.filters.set', { kind: e.target.value }, () => setKind(e.target.value))}
                    placeholder="backtest_summary"
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Limit
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={normalizedLimit}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      if (!Number.isFinite(raw)) return;
                      const next = Math.max(1, Math.min(5000, Math.floor(raw)));
                      runActionOr('agent.memory.filters.set', { limit: next }, () => setLimit(next));
                    }}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[11px] text-gray-300">
                Tags (comma separated)
                <input
                  value={tagsInput}
                  onChange={(e) => runActionOr('agent.memory.filters.set', { tags: e.target.value }, () => setTagsInput(e.target.value))}
                  placeholder="range, fvg, replay"
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-gray-300">
                Search
                <input
                  value={query}
                  onChange={(e) => runActionOr('agent.memory.filters.set', { query: e.target.value }, () => setQuery(e.target.value))}
                  placeholder="filter summary, symbol, kind"
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleUseActive}
                  className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  Use Active
                </button>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-gray-400">Presets</div>
              <label className="flex flex-col gap-1 text-[11px] text-gray-300">
                Preset Name
                <input
                  value={memoryPresetName}
                  onChange={(e) => setMemoryPresetName(e.target.value)}
                  placeholder="Agent memory preset"
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-gray-300">
                Saved Presets
                <select
                  value={memoryPresetId}
                  onChange={(e) => setMemoryPresetId(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                >
                  <option value="">Select preset</option>
                  {memoryPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleSavePreset('new')}
                  className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
                >
                  Save New
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePreset('update')}
                  disabled={!memoryPresetId}
                  className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-40"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={handleLoadPreset}
                  disabled={!memoryPresetId}
                  className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-40"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={handleDeletePreset}
                  disabled={!memoryPresetId}
                  className="px-2 py-1 rounded-md text-xs bg-red-500/20 hover:bg-red-500/30 text-red-200 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
              <div className="text-[10px] text-gray-500">{memoryPresets.length} saved</div>
              {memoryPresetError && <div className="text-[10px] text-red-400">{memoryPresetError}</div>}
              {memoryPresetStatus && <div className="text-[10px] text-emerald-400">{memoryPresetStatus}</div>}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-gray-400">Export</div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => runActionOr('agent.memory.export', { mode: 'copy', ...exportFilters }, () => copyExport())}
                  className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
                >
                  <Copy size={12} />
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() => runActionOr('agent.memory.export', { mode: 'download', ...exportFilters }, () => downloadExport())}
                  className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
                >
                  <Download size={12} />
                  Download
                </button>
              </div>
              <div className="text-[10px] text-gray-500">
                {filteredEntries.length} shown of {entries.length} loaded.
              </div>
              {exportStatus && <div className="text-[10px] text-gray-400">{exportStatus}</div>}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-gray-400">Maintenance</div>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2 py-1 rounded-md text-xs bg-red-500/20 hover:bg-red-500/30 text-red-200 flex items-center gap-1"
              >
                <Trash2 size={12} />
                Clear All Memory
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-gray-400">
                <span>Entries</span>
                <span className="text-[10px] text-gray-500">
                  {loading ? 'Loading...' : `${filteredEntries.length} shown`}
                </span>
              </div>
              {error && <div className="text-[11px] text-red-400">{error}</div>}
              {!loading && filteredEntries.length === 0 && (
                <div className="text-[11px] text-gray-500">No agent memories found.</div>
              )}
              <div className="space-y-2">
                {filteredEntries.map((entry, idx) => {
                  const key = String(entry?.id || entry?.key || idx);
                  const expanded = expandedId === key;
                  const summaryRaw = String(entry?.summary || '').trim();
                  const summaryLines = summaryRaw ? summaryRaw.split('\n') : [];
                  const summaryPreview = expanded ? summaryRaw : summaryLines.slice(0, 4).join('\n');
                  const summarySuffix = !expanded && summaryLines.length > 4 ? '\n...more' : '';
                  const ageValue = entry?.updatedAtMs ?? entry?.createdAtMs ?? null;
                  const age = ageValue ? formatAge(ageValue) : '';
                  const entryTags = Array.isArray(entry?.tags) ? entry.tags : [];
                  let payloadBlock = '';
                  if (expanded && entry?.payload) {
                    try {
                      payloadBlock = JSON.stringify(entry.payload, null, 2);
                    } catch {
                      payloadBlock = '';
                    }
                  }
                  const payloadPreview = payloadBlock
                    ? `${payloadBlock.slice(0, 2000)}${payloadBlock.length > 2000 ? '\n...truncated...' : ''}`
                    : '';
                  return (
                    <VirtualItem key={key} minHeight={140} className="rounded-md border border-white/10 bg-black/30 p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                        <div>Memory</div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : key)}
                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                          >
                            {expanded ? 'Hide' : 'Details'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry)}
                            className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <TagPills
                        tags={[
                          entry?.category,
                          entry?.subcategory,
                          entry?.kind,
                          entry?.symbol,
                          entry?.timeframe,
                          entry?.agentId ? `agent:${entry.agentId}` : '',
                          entry?.scope ? `scope:${entry.scope}` : '',
                          ...entryTags
                        ]}
                        className="text-[10px]"
                        max={6}
                      />
                      {age && (
                        <div className="text-[10px] text-gray-500">Updated {age} ago</div>
                      )}
                      <div className="whitespace-pre-wrap text-gray-200">
                        {summaryPreview || '(no summary)'}
                        {summarySuffix}
                      </div>
                      {expanded && (
                        <div className="text-[10px] text-gray-500 space-y-1">
                          {entry?.key && <div>Key: {entry.key}</div>}
                          {entry?.familyKey && <div>Family: {entry.familyKey}</div>}
                          {entry?.agentId && <div>Agent: {entry.agentId}</div>}
                          {entry?.scope && <div>Scope: {entry.scope}</div>}
                          {entry?.category && <div>Category: {entry.category}</div>}
                          {entry?.subcategory && <div>Subcategory: {entry.subcategory}</div>}
                          {entry?.source && <div>Source: {entry.source}</div>}
                          <div>Created: {formatTs(entry?.createdAtMs ?? null)}</div>
                          <div>Updated: {formatTs(entry?.updatedAtMs ?? null)}</div>
                          {entry?.lastAccessedAtMs && <div>Accessed: {formatTs(entry.lastAccessedAtMs)}</div>}
                        </div>
                      )}
                      {expanded && payloadPreview && (
                        <pre className="max-h-48 overflow-y-auto rounded bg-black/40 p-2 text-[10px] text-gray-300 whitespace-pre-wrap">
{payloadPreview}
                        </pre>
                      )}
                    </VirtualItem>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4">
        </div>
      </div>
    </div>
  );
};

export default AgentMemoryInterface;
