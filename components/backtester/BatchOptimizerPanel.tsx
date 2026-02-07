import React from 'react';
import { Download } from 'lucide-react';

type BatchOptimizerPanelProps = {
  ctx: Record<string, any>;
};

const BatchOptimizerPanel: React.FC<BatchOptimizerPanelProps> = ({ ctx }) => {
  const {
    clearBatchResults,
    batchRunning,
    batchResults,
    handleExportBatchCsv,
    handleExportBatchJson,
    cancelBatchOptimization,
    runBatchOptimization,
    batchSymbolsInput,
    setBatchSymbolsInput,
    batchTimeframesInput,
    setBatchTimeframesInput,
    batchStrategy,
    setBatchStrategy,
    batchRangeDays,
    setBatchRangeDays,
    maxRangeDays,
    clampRangeDays,
    defaultRangeDays,
    batchMaxCombos,
    setBatchMaxCombos,
    batchPresets,
    batchPresetName,
    setBatchPresetName,
    setBatchPresetError,
    setBatchPresetStatus,
    batchPresetId,
    setBatchPresetId,
    handleSaveBatchPreset,
    handleLoadBatchPreset,
    handleDeleteBatchPreset,
    selectedBatchPreset,
    formatAge,
    batchPresetError,
    batchPresetStatus,
    batchAutoApplyRunning,
    batchAutoApplyCount,
    setBatchAutoApplyCount,
    stopBatchAutoApply,
    startBatchAutoApply,
    batchAutoApplyStatus,
    batchProgressLabel,
    batchProgressPct,
    batchSummary,
    formatDurationMs,
    batchOkCount,
    batchFailCount,
    batchError,
    formatR,
    formatPercent,
    formatBatchParams,
    applyOptimization
  } = ctx;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-gray-400">Batch Optimizer</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearBatchResults}
            disabled={batchRunning || batchResults.length === 0}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleExportBatchCsv}
            disabled={batchResults.length === 0}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 flex items-center gap-1"
          >
            <Download size={12} /> CSV
          </button>
          <button
            type="button"
            onClick={handleExportBatchJson}
            disabled={batchResults.length === 0}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 flex items-center gap-1"
          >
            <Download size={12} /> JSON
          </button>
          {batchRunning ? (
            <button
              type="button"
              onClick={cancelBatchOptimization}
              className="px-2 py-1 rounded-md text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-200"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={runBatchOptimization}
              className="px-2 py-1 rounded-md text-[11px] bg-emerald-600/80 hover:bg-emerald-600 text-white"
            >
              Run Batch
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1 col-span-2">
          Symbols (comma/space)
          <input
            value={batchSymbolsInput}
            onChange={(e) => setBatchSymbolsInput(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="XAUUSD NAS100 BTCUSD"
          />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          Timeframes (comma/space)
          <input
            value={batchTimeframesInput}
            onChange={(e) => setBatchTimeframesInput(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            placeholder="15m 1H 4H"
          />
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
        <label className="flex flex-col gap-1">
          Range Days
          <input
            type="number"
            min={1}
            max={maxRangeDays}
            value={batchRangeDays}
            onChange={(e) => setBatchRangeDays(clampRangeDays(Number(e.target.value) || defaultRangeDays))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          Max Combos
          <input
            type="number"
            min={1}
            max={2000}
            value={batchMaxCombos}
            onChange={(e) => setBatchMaxCombos(Math.max(1, Math.min(2000, Math.floor(Number(e.target.value) || 200))))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
          />
        </label>
      </div>
      <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-gray-400 uppercase tracking-wider">
          <span>Batch Presets</span>
          <span className="text-gray-500">{batchPresets.length} saved</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1 col-span-2">
            Preset Name
            <input
              value={batchPresetName}
              onChange={(e) => {
                setBatchPresetName(e.target.value);
                setBatchPresetError(null);
                setBatchPresetStatus(null);
              }}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
              placeholder="Enter batch preset name"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            Saved Presets
            <select
              value={batchPresetId}
              onChange={(e) => {
                const next = e.target.value;
                setBatchPresetId(next);
                setBatchPresetError(null);
                setBatchPresetStatus(null);
              }}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            >
              <option value="">Select preset</option>
              {batchPresets.map((preset: any) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSaveBatchPreset('new')}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200"
          >
            Save New
          </button>
          <button
            type="button"
            onClick={() => handleSaveBatchPreset('update')}
            disabled={!batchPresetId}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
          >
            Update
          </button>
          <button
            type="button"
            onClick={handleLoadBatchPreset}
            disabled={!batchPresetId}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
          >
            Load
          </button>
          <button
            type="button"
            onClick={handleDeleteBatchPreset}
            disabled={!batchPresetId}
            className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
        {selectedBatchPreset && (
          <div className="text-[11px] text-gray-500">
            {`Updated ${formatAge(selectedBatchPreset.updatedAtMs)}`}
          </div>
        )}
        {batchPresetError && <div className="text-[11px] text-red-400">{batchPresetError}</div>}
        {batchPresetStatus && <div className="text-[11px] text-emerald-300">{batchPresetStatus}</div>}
      </div>
      <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-gray-400 uppercase tracking-wider">
          <span>Auto-Apply Top N</span>
          <span className="text-gray-500">{batchAutoApplyRunning ? 'Running' : 'Idle'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex flex-col gap-1">
            Top N
            <input
              type="number"
              min={1}
              max={50}
              value={batchAutoApplyCount}
              onChange={(e) => setBatchAutoApplyCount(Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))))}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            />
          </label>
          {batchAutoApplyRunning ? (
            <button
              type="button"
              onClick={stopBatchAutoApply}
              className="px-2 py-1 rounded-md text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-200"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={startBatchAutoApply}
              disabled={batchRunning || batchResults.length === 0}
              className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
            >
              Auto-Apply
            </button>
          )}
        </div>
        {batchAutoApplyStatus && <div className="text-[11px] text-gray-500">{batchAutoApplyStatus}</div>}
      </div>
      <div className="text-[11px] text-gray-500">
        Uses the optimizer grid above for the selected strategy. Fields not listed use the current setup values.
      </div>
      {(batchProgressLabel || batchProgressPct != null) && (
        <div className="space-y-1">
          {batchProgressLabel && <div className="text-[11px] text-gray-400">{batchProgressLabel}</div>}
          {batchProgressPct != null && (
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-emerald-400/70" style={{ width: `${batchProgressPct}%` }} />
            </div>
          )}
        </div>
      )}
      {batchSummary && (
        <div className="text-[11px] text-gray-500">
          Runs {batchSummary.completedRuns}/{batchSummary.totalRuns} | {formatDurationMs(batchSummary.durationMs)}
          {batchSummary.cancelled ? ' (cancelled)' : ''} | OK {batchOkCount} / Fail {batchFailCount}
        </div>
      )}
      {batchError && <div className="text-[11px] text-red-400">{batchError}</div>}
      <div className="max-h-[220px] overflow-y-auto text-xs">
        {batchResults.length === 0 ? (
          <div className="text-gray-500">Run a batch to see results.</div>
        ) : (
          <table className="w-full text-left text-[11px]">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1">Symbol</th>
                <th>TF</th>
                <th>Net R</th>
                <th>WR</th>
                <th>PF</th>
                <th>Trades</th>
                <th>Combos</th>
                <th>Params</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batchResults.map((row: any) => {
                const result = row.result;
                if (!result.ok) {
                  return (
                    <tr key={row.key} className="border-t border-white/5 text-red-300">
                      <td className="py-1">{row.symbol}</td>
                      <td>{row.timeframe}</td>
                      <td colSpan={7}>{result.error || 'Failed to run.'}</td>
                    </tr>
                  );
                }
                const top = result.bestConfig;
                const trades = top?.stats?.total ?? top?.stats?.closed ?? 0;
                return (
                  <tr key={row.key} className="border-t border-white/5 text-gray-200">
                    <td className="py-1">{result.symbol}</td>
                    <td>{result.timeframe}</td>
                    <td>{top ? formatR(top.performance?.netR) : '--'}</td>
                    <td>{top ? formatPercent(top.stats?.winRate) : '--'}</td>
                    <td>{top && top.stats?.profitFactor != null ? top.stats.profitFactor.toFixed(2) : '--'}</td>
                    <td>{trades}</td>
                    <td>{result.combosTested}</td>
                    <td className="text-gray-400">{top ? formatBatchParams(result.strategy, top.params) : '--'}</td>
                    <td className="text-right">
                      {top ? (
                        <button
                          type="button"
                          onClick={() =>
                            applyOptimization({
                              strategy: result.strategy,
                              params: top.params,
                              symbol: result.symbol,
                              timeframe: result.timeframe,
                              rangeDays: result.rangeDays
                            })}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                        >
                          Apply
                        </button>
                      ) : (
                        <span className="text-gray-500">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default React.memo(BatchOptimizerPanel);

