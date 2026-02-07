import React, { useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, Award, BarChart2 } from 'lucide-react';
import { Agent, AgentDriftReport, CrossPanelContext, OutcomeFeedConsistencyState, OutcomeFeedCursor, PanelFreshnessState, RankFreshnessState, SignalHistoryEntry } from '../types';
import { usePersistenceHealth } from '../hooks/usePersistenceHealth';

type AgentScorecardSnapshot = {
  agentId?: string | null;
  agentName?: string | null;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalScore: number;
  avgScore: number;
  avgHoldMs: number | null;
  avgBars: number | null;
  updatedAtMs?: number | null;
};

interface LeaderboardInterfaceProps {
    agents: Agent[];
    history: SignalHistoryEntry[];
    scorecards?: AgentScorecardSnapshot[];
    rankFreshness?: RankFreshnessState | null;
    agentDriftReports?: AgentDriftReport[] | null;
    onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
    onOpenAcademy?: () => void;
    filter?: string;
    onFilterChange?: (next: string) => void;
    crossPanelContext?: CrossPanelContext | null;
    outcomeFeedCursor?: OutcomeFeedCursor | null;
    outcomeFeedConsistency?: OutcomeFeedConsistencyState | null;
    panelFreshness?: PanelFreshnessState | null;
}

const formatDuration = (ms?: number | null) => {
  if (!ms || ms <= 0) return '--';
  const seconds = Math.max(1, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const formatAge = (ms?: number | null) => {
  if (!ms || ms <= 0) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(1, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
};

const LeaderboardInterface: React.FC<LeaderboardInterfaceProps> = ({
  agents,
  history,
  scorecards,
  rankFreshness,
  agentDriftReports,
  onRunActionCatalog,
  onOpenAcademy,
  filter,
  onFilterChange,
  crossPanelContext,
  outcomeFeedCursor,
  outcomeFeedConsistency,
  panelFreshness
}) => {
  const { degraded } = usePersistenceHealth('rank');
  const rankDegraded = degraded || rankFreshness?.degraded === true;
  const rankStale = rankFreshness?.stale === true;
  const driftPoor = (agentDriftReports || []).filter((row) => row?.severity === 'poor').length;
  const driftWarn = (agentDriftReports || []).filter((row) => row?.severity === 'warn').length;
  const hasHistory = Array.isArray(history) && history.length > 0;
  const scorecardMap = useMemo(() => {
    const map = new Map<string, AgentScorecardSnapshot>();
    const list = Array.isArray(scorecards) ? scorecards : [];
    for (const entry of list) {
      const id = entry.agentId ? String(entry.agentId) : '';
      const name = entry.agentName ? String(entry.agentName) : '';
      if (id) map.set(id, entry);
      if (name) map.set(`name:${name}`, entry);
    }
    return map;
  }, [scorecards]);
  const scorecardUpdatedAtMs = useMemo(() => {
    const list = Array.isArray(scorecards) ? scorecards : [];
    let max = 0;
    for (const entry of list) {
      const ts = Number(entry.updatedAtMs || 0);
      if (Number.isFinite(ts) && ts > max) max = ts;
    }
    return max > 0 ? max : null;
  }, [scorecards]);

  const stats = useMemo(() => {
    if (!hasHistory && scorecardMap.size > 0) {
      return agents
        .map((agent) => {
          const card =
            scorecardMap.get(agent.id) ||
            (agent.name ? scorecardMap.get(`name:${agent.name}`) : null);
          if (!card) {
            return {
              ...agent,
              trades: 0,
              wins: 0,
              losses: 0,
              winRate: 0,
              totalScore: 0,
              avgHoldMs: null,
              avgBars: null
            };
          }
          const winRatePct = Number.isFinite(Number(card.winRate)) ? Number(card.winRate) * 100 : 0;
          return {
            ...agent,
            trades: card.trades ?? 0,
            wins: card.wins ?? 0,
            losses: card.losses ?? 0,
            winRate: winRatePct,
            totalScore: card.totalScore ?? 0,
            avgHoldMs: card.avgHoldMs ?? null,
            avgBars: card.avgBars ?? null
          };
        })
        .filter((entry) => entry.trades > 0)
        .sort((a, b) => b.totalScore - a.totalScore);
    }

    return agents.map(agent => {
        const agentTrades = history.filter(p => (
            p.agentId === agent.id ||
            (!p.agentId && p.agentName && p.agentName === agent.name)
        ));
        const completed = agentTrades.filter(p => p.outcome === 'WIN' || p.outcome === 'LOSS');
        const wins = completed.filter(p => p.outcome === 'WIN');
        const losses = completed.filter(p => p.outcome === 'LOSS');
        const totalScore = completed.reduce((acc, curr) => acc + (curr.score ?? 0), 0);
        const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;
        let durationTotal = 0;
        let durationCount = 0;
        let barsTotal = 0;
        let barsCount = 0;
        completed.forEach((entry) => {
          const duration = Number(entry.durationMs);
          if (Number.isFinite(duration) && duration > 0) {
            durationTotal += duration;
            durationCount += 1;
          }
          const bars = Number(entry.barsToOutcome);
          if (Number.isFinite(bars) && bars > 0) {
            barsTotal += bars;
            barsCount += 1;
          }
        });
        const avgHoldMs = durationCount > 0 ? durationTotal / durationCount : null;
        const avgBars = barsCount > 0 ? barsTotal / barsCount : null;
        return {
            ...agent,
            trades: completed.length,
            wins: wins.length,
            losses: losses.length,
            winRate,
            totalScore,
            avgHoldMs,
            avgBars
        };
    }).sort((a, b) => b.totalScore - a.totalScore);
  }, [agents, hasHistory, history, scorecardMap]);

  const filterOptions = [
    { id: 'all', label: 'All' },
    { id: 'shadow', label: 'Shadow' },
    { id: 'live', label: 'Live' },
    { id: 'paper', label: 'Paper' },
    { id: 'sim', label: 'Sim' },
    { id: 'suggest', label: 'Suggest' }
  ];
  const activeFilter = String(filter || 'all').toLowerCase();

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#0a0a0a]">
        
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-yellow-900/20 to-black flex items-center justify-between gap-4">
            <div>
                <div className="flex items-center gap-2 text-yellow-400 text-xs uppercase tracking-wider font-bold mb-1">
                    <Trophy size={14} />
                    <span>Agent Leaderboard</span>
                </div>
                <p className="text-[10px] text-gray-500">Performance metrics for your trading team.</p>
                {crossPanelContext?.symbol ? (
                  <p className="text-[10px] text-gray-500">
                    Context: {crossPanelContext.symbol}{crossPanelContext.timeframe ? ` ${String(crossPanelContext.timeframe).toUpperCase()}` : ''}
                  </p>
                ) : null}
                {!hasHistory && scorecardMap.size > 0 && (
                  <p className="text-[10px] text-gray-500">Scorecard snapshot {formatAge(scorecardUpdatedAtMs)} ago.</p>
                )}
            </div>
            <div className="flex items-center gap-2">
                {onFilterChange && (
                    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-1">
                        {filterOptions.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => onFilterChange(option.id)}
                                className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${
                                    activeFilter === option.id
                                        ? 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/40'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}
                {onOpenAcademy && (
                    <button
                        type="button"
                        onClick={onOpenAcademy}
                        className="px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 text-xs"
                    >
                        Open Academy
                    </button>
                )}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            {rankDegraded ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    Rank data is degraded while persistence/drift checks recover.
                </div>
            ) : null}
            {rankStale ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    Rank data is stale.
                </div>
            ) : null}
            {driftPoor > 0 || driftWarn > 0 ? (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                    Drift alerts: poor {driftPoor}, warn {driftWarn}.
                </div>
            ) : null}
            {outcomeFeedConsistency?.degraded || outcomeFeedConsistency?.stale ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                Outcome feed {outcomeFeedConsistency.degraded ? 'degraded' : 'stale'}
                {outcomeFeedConsistency.reason ? ` (${outcomeFeedConsistency.reason})` : ''}.
              </div>
            ) : null}
            {panelFreshness && panelFreshness.state !== 'fresh' ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                Panel sync {panelFreshness.state}
                {panelFreshness.reason ? ` (${panelFreshness.reason})` : ''}.
              </div>
            ) : null}
            {outcomeFeedCursor ? (
              <div className="text-[10px] text-gray-500">
                Feed cursor v{outcomeFeedCursor.version} | {outcomeFeedCursor.total} resolved trades.
              </div>
            ) : null}
            
            {stats.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-48 opacity-50">
                    <BarChart2 size={32} className="mb-2 text-gray-600" />
                    <span className="text-xs text-gray-500">No trades recorded yet.</span>
                 </div>
            ) : (
                stats.map((agent, index) => (
                    <div key={agent.id} className="bg-white/5 border border-white/5 rounded-xl p-4 relative overflow-hidden group hover:border-white/10 transition-colors">
                        
                        {/* Rank Badge */}
                        <div className="absolute top-0 right-0 p-2 opacity-50">
                            {index === 0 && <Award size={24} className="text-yellow-400" />}
                            {index === 1 && <Award size={24} className="text-gray-400" />}
                            {index === 2 && <Award size={24} className="text-orange-400" />}
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                             <div className={`w-8 h-8 rounded-full ${agent.color} flex items-center justify-center shadow-lg`}>
                                 <span className="text-xs font-bold text-white">{agent.name.charAt(0)}</span>
                             </div>
                             <div>
                                 <div className="text-sm font-bold text-gray-200">{agent.name}</div>
                                 <div className="text-[10px] text-gray-500">{agent.trades} Trades Taken</div>
                             </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                            <div className="bg-black/30 rounded p-2">
                                <div className="text-[9px] text-gray-500 uppercase">Win Rate</div>
                                <div className={`text-sm font-mono font-bold ${agent.winRate > 50 ? 'text-green-400' : 'text-gray-400'}`}>
                                    {agent.winRate.toFixed(1)}%
                                </div>
                            </div>
                            <div className="bg-black/30 rounded p-2">
                                <div className="text-[9px] text-gray-500 uppercase">Net R</div>
                                <div className={`text-sm font-mono font-bold ${agent.totalScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {agent.totalScore >= 0 ? '+' : ''}{agent.totalScore.toFixed(2)}
                                </div>
                            </div>
                            <div className="bg-black/30 rounded p-2">
                                <div className="text-[9px] text-gray-500 uppercase">W/L Ratio</div>
                                <div className="text-sm font-mono font-bold text-blue-400">
                                    {agent.wins}/{agent.losses}
                                </div>
                            </div>
                            <div className="bg-black/30 rounded p-2">
                                <div className="text-[9px] text-gray-500 uppercase">Avg Hold</div>
                                <div className="text-sm font-mono font-bold text-purple-300">
                                    {formatDuration(agent.avgHoldMs)}
                                </div>
                                <div className="text-[9px] text-gray-500">
                                    {Number.isFinite(Number(agent.avgBars)) ? `${Number(agent.avgBars).toFixed(1)} bars` : ''}
                                </div>
                            </div>
                        </div>
                        
                        {/* Recent History Mini-Log */}
                        {history.filter(h => h.agentId === agent.id).length > 0 && (
                            <div className="mt-3 pt-3 border-t border-white/5">
                                <div className="text-[9px] text-gray-500 mb-2 uppercase">Recent Logic Log</div>
                                <div className="space-y-1">
                                    {history
                                        .filter(h => h.agentId === agent.id)
                                        .sort((a, b) => {
                                            const aTime = a.resolvedAtMs ?? a.executedAtMs ?? 0;
                                            const bTime = b.resolvedAtMs ?? b.executedAtMs ?? 0;
                                            return bTime - aTime;
                                        })
                                        .slice(0, 3)
                                        .map(h => (
                                            <div key={h.id} className="text-[10px] text-gray-400 truncate flex gap-2 items-center">
                                                <span className={h.outcome === 'WIN' ? "text-green-500" : h.outcome === 'LOSS' ? "text-red-500" : "text-gray-500"}>
                                                    {h.outcome === 'WIN' ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                                                </span>
                                                <span className="font-mono opacity-50 text-[9px]">
                                                    {(h.resolvedAtMs || h.executedAtMs)
                                                        ? new Date(h.resolvedAtMs || h.executedAtMs || 0).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
                                                        : '--'}
                                                </span>
                                                <span className="opacity-70 truncate">"{h.reason || 'No reason provided'}"</span>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    </div>
  );
};

export default LeaderboardInterface;
