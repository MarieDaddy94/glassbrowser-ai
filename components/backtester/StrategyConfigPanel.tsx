import React from 'react';
import { Copy, Download, RefreshCw } from 'lucide-react';
import type { StrategyConfigPanelProps } from './types';

const StrategyConfigPanel: React.FC<StrategyConfigPanelProps> = ({ ctx }) => {
  const {
    seedOptimizerFromCurrent,
    autoApplyTopOptimizer,
    optimizerResults,
    runOptimizer,
    optimizerRunning,
    barsLoading,
    optimizerCfg,
    setOptimizerCfg,
    optimizerPresets,
    optimizerPresetName,
    setOptimizerPresetName,
    setOptimizerPresetError,
    setOptimizerPresetStatus,
    optimizerPresetId,
    setOptimizerPresetId,
    handleSaveOptimizerPreset,
    handleLoadOptimizerPreset,
    handleDeleteOptimizerPreset,
    handleCopyOptimizerPresets,
    handleDownloadOptimizerPresets,
    optimizerImportRef,
    handlePresetFileChange,
    selectedOptimizerPreset,
    formatAge,
    optimizerPresetError,
    optimizerPresetStatus,
    optimizerSummary,
    optimizerError,
    formatR,
    formatPercent,
    optimizerAppliedId,
    applyOptimizerResult
  } = ctx as any;

  const formatOptimizerParams = (result: any) => {
    const params = result?.params || {};
    const keys =
      result?.setup === 'range_breakout'
        ? ['lookbackBars', 'atrMult', 'rr', 'breakoutMode', 'bufferAtrMult']
        : result?.setup === 'break_retest'
          ? ['lookbackBars', 'atrMult', 'rr', 'breakoutMode', 'bufferAtrMult', 'retestBars', 'retestBufferAtrMult', 'retestConfirm']
          : result?.setup === 'fvg_retrace'
            ? ['atrMult', 'rr', 'maxWaitBars', 'entryMode', 'minGapAtrMult']
            : result?.setup === 'trend_pullback'
              ? ['fastEma', 'slowEma', 'atrMult', 'rr', 'confirmMode', 'pullbackEma', 'minTrendBars']
              : ['smaPeriod', 'bandAtrMult', 'stopAtrMult', 'rr', 'useRsiFilter', 'rsiPeriod'];
    return keys
      .filter((key) => params[key] != null)
      .map((key) => `${key}:${String(params[key])}`)
      .join(' | ');
  };

  return (
    <>
<div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wider text-gray-400">Optimizer</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={seedOptimizerFromCurrent}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200"
                  >
                    Seed Current
                  </button>
                  <button
                    type="button"
                    onClick={autoApplyTopOptimizer}
                    disabled={optimizerResults.length === 0}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
                  >
                    Apply Top
                  </button>
                  <button
                    type="button"
                    onClick={runOptimizer}
                    disabled={optimizerRunning || barsLoading}
                    className="px-2 py-1 rounded-md text-[11px] bg-emerald-600/80 hover:bg-emerald-600 text-white flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw size={14} /> {optimizerRunning ? 'Running' : 'Run'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex flex-col gap-1">
                  Sort By
                  <select
                    value={optimizerCfg.sortBy}
                    onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, sortBy: e.target.value as any }))}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  >
                    <option value="netR">Net R</option>
                    <option value="expectancy">Expectancy</option>
                    <option value="profitFactor">Profit Factor</option>
                    <option value="winRate">Win Rate</option>
                    <option value="maxDrawdown">Max Drawdown</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Max Combos
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={optimizerCfg.maxCombos}
                    onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, maxCombos: Math.max(10, Math.min(5000, Number(e.target.value) || 250)) }))}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  Top Results
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={optimizerCfg.topN}
                    onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, topN: Math.max(1, Math.min(200, Number(e.target.value) || 12)) }))}
                    className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                  />
                </label>
                <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                  <input
                    type="checkbox"
                    checked={optimizerCfg.useReplayWindow}
                    onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, useReplayWindow: e.target.checked }))}
                  />
                  Use replay window
                </label>
                <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
                  <input
                    type="checkbox"
                    checked={optimizerCfg.useConfluence}
                    onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, useConfluence: e.target.checked }))}
                  />
                  Apply confluence
                </label>
              </div>

              <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-gray-400 uppercase tracking-wider">
                  <span>Presets</span>
                  <span className="text-gray-500">{optimizerPresets.length} saved</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1 col-span-2">
                    Preset Name
                    <input
                      value={optimizerPresetName}
                      onChange={(e) => {
                        setOptimizerPresetName(e.target.value);
                        setOptimizerPresetError(null);
                        setOptimizerPresetStatus(null);
                      }}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      placeholder="Enter preset name"
                    />
                  </label>
                  <label className="flex flex-col gap-1 col-span-2">
                    Saved Presets
                    <select
                      value={optimizerPresetId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setOptimizerPresetId(next);
                        setOptimizerPresetError(null);
                        setOptimizerPresetStatus(null);
                      }}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                    >
                      <option value="">Select preset</option>
                      {optimizerPresets.map((preset) => (
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
                    onClick={() => handleSaveOptimizerPreset('new')}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200"
                  >
                    Save New
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveOptimizerPreset('update')}
                    disabled={!optimizerPresetId}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadOptimizerPreset}
                    disabled={!optimizerPresetId}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteOptimizerPreset}
                    disabled={!optimizerPresetId}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyOptimizerPresets}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
                  >
                    <Copy size={12} /> Copy JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadOptimizerPresets}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200 flex items-center gap-1"
                  >
                    <Download size={12} /> Download
                  </button>
                  <button
                    type="button"
                    onClick={() => optimizerImportRef.current?.click()}
                    className="px-2 py-1 rounded-md text-[11px] bg-white/10 hover:bg-white/20 text-gray-200"
                  >
                    Import
                  </button>
                </div>
                <input
                  ref={optimizerImportRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handlePresetFileChange}
                />
                {selectedOptimizerPreset && (
                  <div className="text-[11px] text-gray-500">
                    {[selectedOptimizerPreset.symbol ? `Symbol ${selectedOptimizerPreset.symbol}` : '',
                      selectedOptimizerPreset.timeframe ? `TF ${selectedOptimizerPreset.timeframe}` : '',
                      `Updated ${formatAge(selectedOptimizerPreset.updatedAtMs)}`]
                      .filter(Boolean)
                      .join(' | ')}
                  </div>
                )}
                {optimizerPresetError && <div className="text-[11px] text-red-400">{optimizerPresetError}</div>}
                {optimizerPresetStatus && <div className="text-[11px] text-emerald-300">{optimizerPresetStatus}</div>}
              </div>
              <div className="text-[11px] text-gray-500">
                Comma-separated values. Leave a field blank to keep the current value.
              </div>

              <div className="grid grid-cols-1 gap-3 text-xs">
                <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={optimizerCfg.range.enabled}
                      onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, range: { ...prev.range, enabled: e.target.checked } }))}
                    />
                    Range Breakout
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      Lookback
                      <input
                        value={optimizerCfg.range.lookbackBars}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, range: { ...prev.range, lookbackBars: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      ATR Mult
                      <input
                        value={optimizerCfg.range.atrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, range: { ...prev.range, atrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      RR
                      <input
                        value={optimizerCfg.range.rr}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, range: { ...prev.range, rr: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Breakout Mode
                      <input
                        value={optimizerCfg.range.breakoutMode}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, range: { ...prev.range, breakoutMode: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                      Buffer ATR
                      <input
                        value={optimizerCfg.range.bufferAtrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, range: { ...prev.range, bufferAtrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={optimizerCfg.breakRetest.enabled}
                      onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, enabled: e.target.checked } }))}
                    />
                    Break + Retest
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      Lookback
                      <input
                        value={optimizerCfg.breakRetest.lookbackBars}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, lookbackBars: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Retest Bars
                      <input
                        value={optimizerCfg.breakRetest.retestBars}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, retestBars: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      ATR Mult
                      <input
                        value={optimizerCfg.breakRetest.atrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, atrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      RR
                      <input
                        value={optimizerCfg.breakRetest.rr}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, rr: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Breakout Mode
                      <input
                        value={optimizerCfg.breakRetest.breakoutMode}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, breakoutMode: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Retest Confirm
                      <input
                        value={optimizerCfg.breakRetest.retestConfirm}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, retestConfirm: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                      Buffer ATR
                      <input
                        value={optimizerCfg.breakRetest.bufferAtrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, bufferAtrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                      Retest Buffer ATR
                      <input
                        value={optimizerCfg.breakRetest.retestBufferAtrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, breakRetest: { ...prev.breakRetest, retestBufferAtrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={optimizerCfg.fvg.enabled}
                      onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, fvg: { ...prev.fvg, enabled: e.target.checked } }))}
                    />
                    FVG Retrace
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      ATR Mult
                      <input
                        value={optimizerCfg.fvg.atrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, fvg: { ...prev.fvg, atrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      RR
                      <input
                        value={optimizerCfg.fvg.rr}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, fvg: { ...prev.fvg, rr: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Max Wait
                      <input
                        value={optimizerCfg.fvg.maxWaitBars}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, fvg: { ...prev.fvg, maxWaitBars: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Entry Mode
                      <input
                        value={optimizerCfg.fvg.entryMode}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, fvg: { ...prev.fvg, entryMode: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                      Min Gap ATR
                      <input
                        value={optimizerCfg.fvg.minGapAtrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, fvg: { ...prev.fvg, minGapAtrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={optimizerCfg.trend.enabled}
                      onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, enabled: e.target.checked } }))}
                    />
                    Trend Pullback
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      Fast EMA
                      <input
                        value={optimizerCfg.trend.fastEma}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, fastEma: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Slow EMA
                      <input
                        value={optimizerCfg.trend.slowEma}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, slowEma: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      ATR Mult
                      <input
                        value={optimizerCfg.trend.atrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, atrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      RR
                      <input
                        value={optimizerCfg.trend.rr}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, rr: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Confirm
                      <input
                        value={optimizerCfg.trend.confirmMode}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, confirmMode: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Pullback EMA
                      <input
                        value={optimizerCfg.trend.pullbackEma}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, pullbackEma: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                      Min Trend Bars
                      <input
                        value={optimizerCfg.trend.minTrendBars}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, trend: { ...prev.trend, minTrendBars: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-gray-300">
                    <input
                      type="checkbox"
                      checked={optimizerCfg.mean.enabled}
                      onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, mean: { ...prev.mean, enabled: e.target.checked } }))}
                    />
                    Mean Reversion
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      SMA Period
                      <input
                        value={optimizerCfg.mean.smaPeriod}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, mean: { ...prev.mean, smaPeriod: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Band ATR
                      <input
                        value={optimizerCfg.mean.bandAtrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, mean: { ...prev.mean, bandAtrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Stop ATR
                      <input
                        value={optimizerCfg.mean.stopAtrMult}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, mean: { ...prev.mean, stopAtrMult: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      RR
                      <input
                        value={optimizerCfg.mean.rr}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, mean: { ...prev.mean, rr: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      RSI Filter
                      <input
                        value={optimizerCfg.mean.useRsiFilter}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, mean: { ...prev.mean, useRsiFilter: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                        placeholder="true,false"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      RSI Period
                      <input
                        value={optimizerCfg.mean.rsiPeriod}
                        onChange={(e) => setOptimizerCfg((prev) => ({ ...prev, mean: { ...prev.mean, rsiPeriod: e.target.value } }))}
                        className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {optimizerSummary && (
                <div className="text-[11px] text-gray-500">
                  Tested {optimizerSummary.attempted} of {optimizerSummary.estimated} combos in {(optimizerSummary.durationMs / 1000).toFixed(2)}s
                  {optimizerSummary.truncated ? ' (capped)' : ''}
                </div>
              )}
              {optimizerError && <div className="text-[11px] text-red-400">{optimizerError}</div>}

              <div className="max-h-[240px] overflow-y-auto text-xs">
                {optimizerResults.length === 0 ? (
                  <div className="text-gray-500">Run the optimizer to see ranked results.</div>
                ) : (
                  <table className="w-full text-left text-[11px]">
                    <thead className="text-gray-500">
                      <tr>
                        <th className="py-1">Setup</th>
                        <th>Net R</th>
                        <th>WR</th>
                        <th>PF</th>
                        <th>DD</th>
                        <th>Trades</th>
                        <th>Params</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {optimizerResults.map((result) => (
                        <tr
                          key={result.id}
                          className={`border-t border-white/5 text-gray-200 ${
                            optimizerAppliedId === result.id ? 'bg-emerald-500/10' : ''
                          }`}
                        >
                          <td className="py-1">
                            {result.setup === 'range_breakout'
                              ? 'Range'
                              : result.setup === 'fvg_retrace'
                                ? 'FVG'
                                : result.setup === 'trend_pullback'
                                  ? 'Trend'
                                  : 'MeanRev'}
                          </td>
                          <td>{formatR(result.netR)}</td>
                          <td>{formatPercent(result.winRate)}</td>
                          <td>{result.profitFactor != null ? result.profitFactor.toFixed(2) : '--'}</td>
                          <td>{formatR(result.maxDrawdown)}</td>
                          <td>{result.stats.closed}</td>
                          <td className="text-gray-400">{formatOptimizerParams(result)}</td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() => applyOptimizerResult(result)}
                              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                            >
                              {optimizerAppliedId === result.id ? 'Applied' : 'Apply'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            
    </>
  );
};

export default React.memo(StrategyConfigPanel);
