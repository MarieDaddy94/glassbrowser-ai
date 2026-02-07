import React from 'react';

type OptimizerLoopPanelProps = {
  ctx: Record<string, any>;
};

const OptimizerLoopPanel: React.FC<OptimizerLoopPanelProps> = ({ ctx }) => {
  const {
    clearOptimizerLoop,
    optimizerLoopRunning,
    optimizerLoopResults,
    optimizerLoopError,
    runOptimizerLoop,
    barsLoading,
    optimizerLoopPresetId,
    setOptimizerLoopPresetId,
    loopPresets,
    batchStrategy,
    setBatchStrategy,
    batchRangeDays,
    setBatchRangeDays,
    maxRangeDays,
    clampRangeDays,
    batchMaxCombos,
    setBatchMaxCombos,
    optimizerLoopSession,
    optimizerLoopCandidate,
    formatPercent,
    formatR,
    formatEdgeMargin,
    formatLoopParams,
    formatLoopDiagnostics,
    applyOptimizerLoopCandidate,
    optimizerLoopAppliedStatus,
    optimizerLoopApplyError,
    optimizerLoopApplyWarnings
  } = ctx;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-gray-400">Optimizer Loop</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearOptimizerLoop}
            disabled={optimizerLoopRunning && !optimizerLoopResults && !optimizerLoopError}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={runOptimizerLoop}
            disabled={optimizerLoopRunning || barsLoading}
            className="px-2 py-1 rounded-md text-[11px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 disabled:opacity-50"
          >
            {optimizerLoopRunning ? 'Running...' : 'Optimize'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-300">
        <label className="flex flex-col gap-1">
          Objective
          <select
            value={optimizerLoopPresetId}
            onChange={(e) => setOptimizerLoopPresetId(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          >
            {(Array.isArray(loopPresets) ? loopPresets : []).map((preset: any) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Strategy
          <select
            value={batchStrategy}
            onChange={(e) => setBatchStrategy(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          >
            <option value="RANGE_BREAKOUT">Range Breakout</option>
            <option value="BREAK_RETEST">Break + Retest</option>
            <option value="FVG_RETRACE">FVG Retrace</option>
            <option value="TREND_PULLBACK">Trend Pullback</option>
            <option value="MEAN_REVERSION">Mean Reversion</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-300">
        <label className="flex flex-col gap-1">
          Range days
          <input
            type="number"
            min={1}
            max={maxRangeDays}
            value={batchRangeDays}
            onChange={(e) => setBatchRangeDays(clampRangeDays(Number(e.target.value) || 1))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          Max combos
          <input
            type="number"
            min={10}
            max={2000}
            value={batchMaxCombos}
            onChange={(e) => setBatchMaxCombos(Math.max(10, Math.min(2000, Math.floor(Number(e.target.value) || 10))))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
      </div>

      {optimizerLoopSession && (
        <div className="text-[11px] text-gray-400">
          {`Session ${optimizerLoopSession.sessionId} | Status ${optimizerLoopSession.status}`}
          {optimizerLoopSession.progress
            ? ` | ${optimizerLoopSession.progress.phase} ${optimizerLoopSession.progress.done}/${optimizerLoopSession.progress.total} (${optimizerLoopSession.progress.pct}%)`
            : ''}
        </div>
      )}
      {optimizerLoopError && <div className="text-[11px] text-red-400">{optimizerLoopError}</div>}
      {optimizerLoopResults && (
        <div className="space-y-1 text-[11px] text-gray-300">
          <div>
            {optimizerLoopCandidate
              ? `Recommended: WR ${formatPercent(optimizerLoopCandidate.test.winRate)} | DD ${formatR(optimizerLoopCandidate.test.maxDrawdown)} | Net ${formatR(optimizerLoopCandidate.test.netR)} | PF ${optimizerLoopCandidate.test.profitFactor?.toFixed(2) ?? '--'} | Trades ${optimizerLoopCandidate.test.tradeCount}`
              : 'Recommended: --'}
          </div>
          {optimizerLoopCandidate && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-300">
              <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5">
                Trades {optimizerLoopCandidate.test.tradeCount}
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5">
                Edge {formatEdgeMargin(optimizerLoopCandidate.test.edgeMargin)}
              </span>
              {optimizerLoopResults?.recommendedDiagnostics?.worstFold && (
                <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5">
                  Worst fold {optimizerLoopResults.recommendedDiagnostics.worstFold.index} DD{' '}
                  {formatR(optimizerLoopResults.recommendedDiagnostics.worstFold.maxDrawdown)}
                </span>
              )}
            </div>
          )}
          {optimizerLoopCandidate && (
            <div className="text-[10px] text-gray-400">Params: {formatLoopParams(optimizerLoopCandidate.params)}</div>
          )}
          {optimizerLoopResults.recommendedDiagnostics && (
            <div className="text-[10px] text-gray-400">
              Diagnostics: {formatLoopDiagnostics(optimizerLoopResults.recommendedDiagnostics)}
            </div>
          )}
          {optimizerLoopCandidate && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applyOptimizerLoopCandidate}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200 text-[10px]"
              >
                Apply Recommended
              </button>
              {optimizerLoopAppliedStatus && (
                <span className="text-[10px] text-emerald-300">{optimizerLoopAppliedStatus}</span>
              )}
            </div>
          )}
          {optimizerLoopApplyError && (
            <div className="text-[10px] text-red-400">{optimizerLoopApplyError}</div>
          )}
          {optimizerLoopApplyWarnings.length > 0 && (
            <div className="text-[10px] text-amber-300">
              Apply warnings: {optimizerLoopApplyWarnings.join(' ')}
            </div>
          )}
          <div className="text-[10px] text-gray-400">
            Pareto {optimizerLoopResults.pareto.length} | Evaluated {optimizerLoopResults.evaluated}/{optimizerLoopResults.totalCombos}
          </div>
          {optimizerLoopResults.warnings.length > 0 && (
            <div className="text-[10px] text-amber-300">Warnings: {optimizerLoopResults.warnings.join(' ')}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(OptimizerLoopPanel);

