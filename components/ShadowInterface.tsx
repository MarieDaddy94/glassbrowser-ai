import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Shield, SlidersHorizontal, TrendingDown, TrendingUp, User } from 'lucide-react';
import type { Agent, ShadowAccountSnapshot, ShadowProfile, ShadowTradeView } from '../types';
import { memoByKeys } from '../services/renderPerfGuards';

type ShadowInterfaceProps = {
  agents: Agent[];
  profiles: ShadowProfile[];
  accounts: ShadowAccountSnapshot[];
  trades: ShadowTradeView[];
  followEnabled: boolean;
  onToggleFollow: (next: boolean) => void;
  onUpdateProfile: (agentId: string, patch: Partial<ShadowProfile>) => void;
  onRefresh?: () => void;
};

const formatMoney = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPct = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Number(value).toFixed(1)}%`;
};

const formatAge = (ts?: number | null) => {
  if (!ts) return '--';
  const delta = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const ShadowInterface: React.FC<ShadowInterfaceProps> = ({
  agents,
  profiles,
  accounts,
  trades,
  followEnabled,
  onToggleFollow,
  onUpdateProfile,
  onRefresh
}) => {
  const profileByAgent = useMemo(() => {
    const map = new Map<string, ShadowProfile>();
    for (const profile of profiles || []) {
      if (profile?.agentId) map.set(profile.agentId, profile);
    }
    return map;
  }, [profiles]);

  const accountByAgent = useMemo(() => {
    const map = new Map<string, ShadowAccountSnapshot>();
    for (const snapshot of accounts || []) {
      if (snapshot?.agentId) map.set(snapshot.agentId, snapshot);
    }
    return map;
  }, [accounts]);

  const [drafts, setDrafts] = useState<Record<string, Partial<ShadowProfile>>>({});
  const [agentFilter, setAgentFilter] = useState<string>('all');

  useEffect(() => {
    const next: Record<string, Partial<ShadowProfile>> = {};
    for (const agent of agents) {
      const profile = profileByAgent.get(agent.id);
      if (!profile) continue;
      next[agent.id] = {
        startingBalance: profile.startingBalance,
        riskPct: profile.riskPct,
        lotSize: profile.lotSize ?? null,
        maxDrawdownPct: profile.maxDrawdownPct ?? null,
        dailyDrawdownPct: profile.dailyDrawdownPct ?? null,
        enabled: profile.enabled,
        liveDeployEnabled: profile.liveDeployEnabled ?? false,
        liveBroker: profile.liveBroker ?? 'mt5',
        liveMode: profile.liveMode ?? 'fixed',
        liveLotSize: profile.liveLotSize ?? null,
        liveRiskPct: profile.liveRiskPct ?? null,
        liveAccountKey: profile.liveAccountKey ?? null,
        liveMaxDailyLoss: profile.liveMaxDailyLoss ?? 0,
        liveMaxOpenPositions: profile.liveMaxOpenPositions ?? 0,
        liveMaxOrdersPerMinute: profile.liveMaxOrdersPerMinute ?? 0,
        liveMaxConsecutiveLosses: profile.liveMaxConsecutiveLosses ?? 0,
        liveSymbolAllowlistRaw: profile.liveSymbolAllowlistRaw ?? '',
        liveEntryTolerancePct: profile.liveEntryTolerancePct ?? 0.15
      };
    }
    setDrafts(next);
  }, [agents, profileByAgent]);

  const filteredTrades = useMemo(() => {
    const list = Array.isArray(trades) ? trades : [];
    if (agentFilter === 'all') return list;
    return list.filter((trade) => trade.agentId === agentFilter);
  }, [agentFilter, trades]);

  const totalOpen = useMemo(() => {
    return (accounts || []).reduce((acc, snapshot) => acc + (snapshot.openTrades || 0), 0);
  }, [accounts]);

  const handleDraftChange = (agentId: string, patch: Partial<ShadowProfile>) => {
    setDrafts((prev) => ({ ...prev, [agentId]: { ...prev[agentId], ...patch } }));
  };

  const handleSave = (agentId: string) => {
    const draft = drafts[agentId];
    if (!draft) return;
    onUpdateProfile(agentId, draft);
  };

  const applyPropFirmPreset = (agentId: string) => {
    handleDraftChange(agentId, { maxDrawdownPct: 10, dailyDrawdownPct: 5, preset: 'prop_firm' });
    onUpdateProfile(agentId, { maxDrawdownPct: 10, dailyDrawdownPct: 5, preset: 'prop_firm' });
  };

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#0a0a0a]">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-slate-900/40 to-black flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-200 text-xs uppercase tracking-wider font-bold mb-1">
            <Shield size={14} />
            <span>Shadow Panel</span>
          </div>
          <p className="text-[10px] text-gray-500">
            Virtual agent accounts. Track every signal outcome without placing live trades.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFollow(!followEnabled)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              followEnabled
                ? 'bg-emerald-600/20 text-emerald-200 border-emerald-400/40'
                : 'bg-white/5 text-gray-400 border-white/10'
            }`}
          >
            Shadow Follow {followEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => onRefresh?.()}
            className="px-2 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-2"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between text-[11px] text-gray-400">
        <div className="flex items-center gap-3">
          <span>Agents: {agents.length}</span>
          <span>Open shadow trades: {totalOpen}</span>
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={12} />
          <span>Shadow settings are per agent.</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {agents.map((agent) => {
            const profile = profileByAgent.get(agent.id);
            const account = accountByAgent.get(agent.id);
            const draft = drafts[agent.id] || {};
            const wins = account?.wins || 0;
            const losses = account?.losses || 0;
            const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : null;
            const balanceLabel = account?.balanceSource === 'live' ? 'Balance (Live)' : 'Balance';
            const liveEnabled = draft.liveDeployEnabled === true;
            const liveMode = String(draft.liveMode || 'fixed').toLowerCase() === 'risk' ? 'risk' : 'fixed';
            return (
              <div key={agent.id} className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full ${agent.color} flex items-center justify-center`}>
                      <span className="text-sm font-bold text-white">{agent.name.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                        {agent.name}
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <User size={10} />
                          {agent.id}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Updated {formatAge(account?.updatedAtMs || profile?.updatedAtMs || null)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateProfile(agent.id, { enabled: !(draft.enabled !== false) })}
                    className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wide ${
                      draft.enabled !== false ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-gray-500'
                    }`}
                  >
                    {draft.enabled !== false ? 'Tracking' : 'Paused'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-black/30 rounded-lg p-2">
                    <div className="text-[9px] uppercase text-gray-500">{balanceLabel}</div>
                    <div className="text-sm font-mono text-emerald-200">${formatMoney(account?.balance ?? profile?.startingBalance)}</div>
                  </div>
                  <div className="bg-black/30 rounded-lg p-2">
                    <div className="text-[9px] uppercase text-gray-500">Net R</div>
                    <div className={`text-sm font-mono ${Number(account?.netR || 0) >= 0 ? 'text-emerald-200' : 'text-red-300'}`}>
                      {Number(account?.netR || 0) >= 0 ? '+' : ''}{Number(account?.netR || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-lg p-2">
                    <div className="text-[9px] uppercase text-gray-500">Win Rate</div>
                    <div className={`text-sm font-mono ${winRate != null && winRate >= 50 ? 'text-emerald-200' : 'text-gray-400'}`}>
                      {winRate != null ? `${winRate.toFixed(1)}%` : '--'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400">
                  <div className="flex items-center gap-2">
                    {Number(account?.drawdownPct || 0) > 0 ? <TrendingDown size={12} className="text-red-300" /> : <TrendingUp size={12} className="text-emerald-300" />}
                    <span>Max DD: {formatPct(account?.drawdownPct)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Daily DD: {formatPct(account?.dailyDrawdownPct)}</span>
                  </div>
                  <div>Wins {wins} / Losses {losses} / Expires {account?.expires ?? 0}</div>
                  <div>Open trades {account?.openTrades ?? 0}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400">
                  <label className="flex flex-col gap-1">
                    <span>Starting Balance</span>
                    <input
                      type="number"
                      value={draft.startingBalance ?? ''}
                      onChange={(e) => handleDraftChange(agent.id, { startingBalance: Number(e.target.value) })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Risk %</span>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.riskPct ?? ''}
                      onChange={(e) => handleDraftChange(agent.id, { riskPct: Number(e.target.value) })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Lot Size</span>
                    <input
                      type="number"
                      step="0.01"
                      value={draft.lotSize ?? ''}
                      onChange={(e) => handleDraftChange(agent.id, { lotSize: Number(e.target.value) })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Max Drawdown %</span>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.maxDrawdownPct ?? ''}
                      onChange={(e) => handleDraftChange(agent.id, { maxDrawdownPct: Number(e.target.value) })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span>Daily Drawdown %</span>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.dailyDrawdownPct ?? ''}
                      onChange={(e) => handleDraftChange(agent.id, { dailyDrawdownPct: Number(e.target.value) })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </label>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">Live Deploy</span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextEnabled = !liveEnabled;
                        handleDraftChange(agent.id, { liveDeployEnabled: nextEnabled });
                        onUpdateProfile(agent.id, {
                          liveDeployEnabled: nextEnabled,
                          liveBroker: draft.liveBroker ?? 'mt5',
                          liveMode: draft.liveMode ?? 'fixed'
                        });
                      }}
                      className={`px-2 py-1 rounded border text-[10px] uppercase tracking-wide ${
                        liveEnabled ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-gray-500'
                      }`}
                    >
                      {liveEnabled ? 'Live ON' : 'Live OFF'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400">
                    <label className="flex flex-col gap-1">
                      <span>Broker</span>
                      <select
                        value={draft.liveBroker ?? 'mt5'}
                        onChange={(e) => {
                          const nextBroker = e.target.value === 'tradelocker' ? 'tradelocker' : 'mt5';
                          handleDraftChange(agent.id, { liveBroker: nextBroker });
                          if (liveEnabled) {
                            onUpdateProfile(agent.id, { liveBroker: nextBroker, liveDeployEnabled: true });
                          }
                        }}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                      >
                        <option value="mt5">MT5</option>
                        <option value="tradelocker">TradeLocker</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>Mode</span>
                      <select
                        value={liveMode}
                        onChange={(e) => {
                          const mode = e.target.value === 'risk' ? 'risk' : 'fixed';
                          handleDraftChange(agent.id, { liveMode: mode });
                          if (liveEnabled) {
                            onUpdateProfile(agent.id, { liveMode: mode, liveDeployEnabled: true });
                          }
                        }}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                      >
                        <option value="fixed">Fixed Lot</option>
                        <option value="risk">Risk %</option>
                      </select>
                    </label>
                    <label className={`flex flex-col gap-1 ${liveMode === 'fixed' ? '' : 'opacity-50'}`}>
                      <span>Live Lot Size</span>
                      <input
                        type="number"
                        step="0.01"
                        value={draft.liveLotSize ?? ''}
                        onChange={(e) => handleDraftChange(agent.id, { liveLotSize: Number(e.target.value) })}
                        disabled={liveMode !== 'fixed'}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className={`flex flex-col gap-1 ${liveMode === 'risk' ? '' : 'opacity-50'}`}>
                      <span>Live Risk %</span>
                      <input
                        type="number"
                        step="0.1"
                        value={draft.liveRiskPct ?? ''}
                        onChange={(e) => handleDraftChange(agent.id, { liveRiskPct: Number(e.target.value) })}
                        disabled={liveMode !== 'risk'}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed"
                      />
                    </label>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    One agent per account. Live balance mirrors broker equity when connected.
                  </div>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">Live Guardrails</span>
                    <span className="text-[10px] text-gray-500">Active when Live Deploy is ON</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-400">
                    <label className="flex flex-col gap-1">
                      <span>Max Daily Loss ($)</span>
                      <input
                        type="number"
                        step="1"
                        value={draft.liveMaxDailyLoss ?? ''}
                        onChange={(e) => handleDraftChange(agent.id, { liveMaxDailyLoss: Number(e.target.value) })}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>Max Open Positions</span>
                      <input
                        type="number"
                        step="1"
                        value={draft.liveMaxOpenPositions ?? ''}
                        onChange={(e) => handleDraftChange(agent.id, { liveMaxOpenPositions: Number(e.target.value) })}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>Max Orders / Minute</span>
                      <input
                        type="number"
                        step="1"
                        value={draft.liveMaxOrdersPerMinute ?? ''}
                        onChange={(e) => handleDraftChange(agent.id, { liveMaxOrdersPerMinute: Number(e.target.value) })}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span>Max Loss Streak</span>
                      <input
                        type="number"
                        step="1"
                        value={draft.liveMaxConsecutiveLosses ?? ''}
                        onChange={(e) => handleDraftChange(agent.id, { liveMaxConsecutiveLosses: Number(e.target.value) })}
                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1 text-[10px] text-gray-400">
                    <span>Symbol Allowlist (optional)</span>
                    <textarea
                      rows={2}
                      value={draft.liveSymbolAllowlistRaw ?? ''}
                      onChange={(e) => handleDraftChange(agent.id, { liveSymbolAllowlistRaw: e.target.value })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 disabled:cursor-not-allowed"
                      placeholder="XAUUSD.R, NAS100.R"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] text-gray-400">
                    <span>Entry Tolerance %</span>
                    <input
                      type="number"
                      step="0.01"
                      value={draft.liveEntryTolerancePct ?? ''}
                      onChange={(e) => handleDraftChange(agent.id, { liveEntryTolerancePct: Number(e.target.value) })}
                      className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                    />
                  </label>
                  <div className="text-[10px] text-gray-500">
                    Pending signals execute only when price is within the entry tolerance.
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSave(agent.id)}
                    className="px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPropFirmPreset(agent.id)}
                    className="px-3 py-1.5 rounded border border-white/10 text-gray-300 hover:bg-white/10"
                  >
                    Prop Firm Preset
                  </button>
                  <span className="text-[10px] text-gray-500">Risk % drives virtual PnL.</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-200">Shadow Trades</div>
              <div className="text-[10px] text-gray-500">Most recent outcomes across agents.</div>
            </div>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
            >
              <option value="all">All Agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-2">
            {filteredTrades.length === 0 ? (
              <div className="text-[11px] text-gray-500">No shadow trades yet.</div>
            ) : (
              filteredTrades.slice(0, 60).map((trade) => (
                <div key={trade.id} className="bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-[11px] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${trade.action === 'BUY' ? 'text-emerald-300' : 'text-red-300'}`}>
                      {trade.action}
                    </span>
                    <span className="font-mono text-gray-300">{trade.symbol}</span>
                    {trade.outcome && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase ${
                        trade.outcome === 'WIN'
                          ? 'bg-emerald-500/20 text-emerald-200'
                          : trade.outcome === 'LOSS'
                            ? 'bg-red-500/20 text-red-200'
                            : 'bg-gray-500/20 text-gray-300'
                      }`}>
                        {trade.outcome}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <span>R {trade.shadowR != null ? trade.shadowR.toFixed(2) : '--'}</span>
                    <span>{trade.closedAtMs ? formatAge(trade.closedAtMs) : 'Open'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memoByKeys(ShadowInterface, [
  'agents',
  'profiles',
  'accounts',
  'trades',
  'followEnabled',
  'onToggleFollow',
  'onUpdateProfile',
  'onRefresh'
]);
