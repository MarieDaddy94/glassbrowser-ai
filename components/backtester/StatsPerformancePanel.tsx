import React from 'react';
import type { StatsPerformancePanelProps } from './types';

const StatsPerformancePanel: React.FC<StatsPerformancePanelProps> = ({ ctx }) => {
  const {
    stats,
    formatPercent,
    currentHtfBias,
    confluenceCfg,
    htfError,
    performance,
    formatR,
    maxDrawdownLabel,
    avgHoldLabel,
    equityCanvasRef
  } = ctx;

  return (
    <>
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2" style={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}>
        <div className="text-xs uppercase tracking-wider text-gray-400">Stats</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Trades</div><div className="text-gray-100 text-sm">{stats.total}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Win Rate</div><div className="text-gray-100 text-sm">{formatPercent(stats.winRate)}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Expectancy</div><div className="text-gray-100 text-sm">{stats.expectancy != null ? `${stats.expectancy.toFixed(2)}R` : '--'}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Profit Factor</div><div className="text-gray-100 text-sm">{stats.profitFactor != null ? stats.profitFactor.toFixed(2) : '--'}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Wins</div><div className="text-gray-100 text-sm">{stats.wins}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Losses</div><div className="text-gray-100 text-sm">{stats.losses}</div></div>
        </div>
        <div className="mt-2 text-[11px] text-gray-400">
          HTF Bias: {currentHtfBias ? currentHtfBias.toUpperCase() : confluenceCfg.enabled ? 'LOADING' : 'OFF'}
          {confluenceCfg.enabled ? ` | ${confluenceCfg.htfResolution} ${confluenceCfg.biasMode}` : ''}
        </div>
        {htfError && <div className="text-[11px] text-red-400">{htfError}</div>}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
        <div className="text-xs uppercase tracking-wider text-gray-400">Performance</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Net R</div><div className="text-gray-100 text-sm">{formatR(performance.netR)}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Max Drawdown</div><div className="text-gray-100 text-sm">{maxDrawdownLabel}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Avg R</div><div className="text-gray-100 text-sm">{formatR(performance.avgR)}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Median R</div><div className="text-gray-100 text-sm">{formatR(performance.medianR)}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Avg Hold</div><div className="text-gray-100 text-sm">{avgHoldLabel}</div></div>
          <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Streaks</div><div className="text-gray-100 text-sm">W {performance.maxWinStreak} / L {performance.maxLossStreak}</div></div>
        </div>
        <div className="mt-2 h-[120px] w-full"><canvas ref={equityCanvasRef} className="w-full h-full" /></div>
        <div className="text-[11px] text-gray-500">Closed trades only.</div>
      </div>
    </>
  );
};

export default React.memo(StatsPerformancePanel);
