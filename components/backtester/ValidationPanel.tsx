import React from 'react';
import type { ValidationPanelProps } from './types';

const ValidationPanel: React.FC<ValidationPanelProps> = ({ ctx }) => {
  const {
    validationCfg,
    setValidationCfg,
    validationData,
    formatTs,
    formatPercent,
    formatR,
    walkForwardCfg,
    setWalkForwardCfg,
    walkForwardData,
    walkForwardCanvasRef,
    replayTrades,
    selectedTrade,
    formatPrice,
    jumpToIndex,
    selectTrade,
    selectedTradeId,
    htfBiasLabel,
  } = ctx;

  return (
    <>
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-gray-400">Validation</div>
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input type="checkbox" checked={validationCfg.enabled} onChange={(e) => setValidationCfg((prev: any) => ({ ...prev, enabled: e.target.checked }))} />
            Enable
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            Split Mode
            <select value={validationCfg.mode} onChange={(e) => setValidationCfg((prev: any) => ({ ...prev, mode: e.target.value === 'last_days' ? 'last_days' : 'percent' }))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100" disabled={!validationCfg.enabled}>
              <option value="percent">Percent</option>
              <option value="last_days">Last Days</option>
            </select>
          </label>
          {validationCfg.mode === 'percent' ? (
            <label className="flex flex-col gap-1">
              Train %
              <input type="number" min={50} max={95} value={validationCfg.splitPercent} onChange={(e) => setValidationCfg((prev: any) => ({ ...prev, splitPercent: Math.max(50, Math.min(95, Number(e.target.value) || 70)) }))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100" disabled={!validationCfg.enabled} />
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              Test Days
              <input type="number" min={5} value={validationCfg.lastDays} onChange={(e) => setValidationCfg((prev: any) => ({ ...prev, lastDays: Math.max(5, Number(e.target.value) || 30) }))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100" disabled={!validationCfg.enabled} />
            </label>
          )}
          <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5">
            <input type="checkbox" checked={validationCfg.useReplayWindow} onChange={(e) => setValidationCfg((prev: any) => ({ ...prev, useReplayWindow: e.target.checked }))} disabled={!validationCfg.enabled} />
            Use replay window
          </label>
        </div>

        {validationCfg.enabled && validationData ? (
          <>
            <div className="text-[11px] text-gray-500">Split at {formatTs(validationData.splitTime)} | Train bars {validationData.trainBars} | Test bars {validationData.testBars}</div>
            <table className="w-full text-left text-[11px]">
              <thead className="text-gray-500"><tr><th className="py-1">Metric</th><th>Train</th><th>Test</th></tr></thead>
              <tbody className="text-gray-200">
                <tr className="border-t border-white/5"><td className="py-1">Trades</td><td>{validationData.trainStats.total}</td><td>{validationData.testStats.total}</td></tr>
                <tr className="border-t border-white/5"><td className="py-1">Win Rate</td><td>{formatPercent(validationData.trainStats.winRate)}</td><td>{formatPercent(validationData.testStats.winRate)}</td></tr>
                <tr className="border-t border-white/5"><td className="py-1">Expectancy</td><td>{validationData.trainStats.expectancy != null ? `${validationData.trainStats.expectancy.toFixed(2)}R` : '--'}</td><td>{validationData.testStats.expectancy != null ? `${validationData.testStats.expectancy.toFixed(2)}R` : '--'}</td></tr>
                <tr className="border-t border-white/5"><td className="py-1">Profit Factor</td><td>{validationData.trainStats.profitFactor != null ? validationData.trainStats.profitFactor.toFixed(2) : '--'}</td><td>{validationData.testStats.profitFactor != null ? validationData.testStats.profitFactor.toFixed(2) : '--'}</td></tr>
                <tr className="border-t border-white/5"><td className="py-1">Net R</td><td>{formatR(validationData.trainEquity.netR)}</td><td>{formatR(validationData.testEquity.netR)}</td></tr>
                <tr className="border-t border-white/5"><td className="py-1">Max DD</td><td>{formatR(validationData.trainEquity.maxDrawdown)}</td><td>{formatR(validationData.testEquity.maxDrawdown)}</td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <div className="text-[11px] text-gray-500">{validationCfg.enabled ? 'Not enough data for validation.' : 'Validation is off.'}</div>
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-gray-400">Walk-Forward</div>
          <label className="flex items-center gap-2 text-[11px] text-gray-300">
            <input type="checkbox" checked={walkForwardCfg.enabled} onChange={(e) => setWalkForwardCfg((prev: any) => ({ ...prev, enabled: e.target.checked }))} />
            Enable
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">Train Days<input type="number" min={10} value={walkForwardCfg.trainDays} onChange={(e) => setWalkForwardCfg((prev: any) => ({ ...prev, trainDays: Math.max(10, Number(e.target.value) || 90) }))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100" disabled={!walkForwardCfg.enabled} /></label>
          <label className="flex flex-col gap-1">Test Days<input type="number" min={5} value={walkForwardCfg.testDays} onChange={(e) => setWalkForwardCfg((prev: any) => ({ ...prev, testDays: Math.max(5, Number(e.target.value) || 30) }))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100" disabled={!walkForwardCfg.enabled} /></label>
          <label className="flex flex-col gap-1">Step Days<input type="number" min={5} value={walkForwardCfg.stepDays} onChange={(e) => setWalkForwardCfg((prev: any) => ({ ...prev, stepDays: Math.max(5, Number(e.target.value) || 30) }))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100" disabled={!walkForwardCfg.enabled} /></label>
          <label className="flex flex-col gap-1">Min Trades<input type="number" min={0} value={walkForwardCfg.minTrades} onChange={(e) => setWalkForwardCfg((prev: any) => ({ ...prev, minTrades: Math.max(0, Number(e.target.value) || 0) }))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100" disabled={!walkForwardCfg.enabled} /></label>
          <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-5"><input type="checkbox" checked={walkForwardCfg.useReplayWindow} onChange={(e) => setWalkForwardCfg((prev: any) => ({ ...prev, useReplayWindow: e.target.checked }))} disabled={!walkForwardCfg.enabled} />Use replay window</label>
        </div>

        {walkForwardCfg.enabled && walkForwardData ? (
          walkForwardData.folds.length === 0 ? (
            <div className="text-[11px] text-gray-500">No valid folds for this window.</div>
          ) : (
            <>
              {walkForwardData.summary && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Folds</div><div className="text-gray-100 text-sm">{walkForwardData.summary.folds}</div></div>
                  <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Positive Test</div><div className="text-gray-100 text-sm">{formatPercent(walkForwardData.summary.positiveNetPct)}</div></div>
                  <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Avg Test Net R</div><div className="text-gray-100 text-sm">{formatR(walkForwardData.summary.avgNetR)}</div></div>
                  <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Avg Test Expect</div><div className="text-gray-100 text-sm">{formatR(walkForwardData.summary.avgExpectancy)}</div></div>
                  <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Avg Test Win</div><div className="text-gray-100 text-sm">{formatPercent(walkForwardData.summary.avgWinRate)}</div></div>
                  <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Avg Test PF</div><div className="text-gray-100 text-sm">{walkForwardData.summary.avgProfitFactor != null ? walkForwardData.summary.avgProfitFactor.toFixed(2) : '--'}</div></div>
                  <div className="bg-black/30 rounded-md p-2"><div className="text-gray-500">Stability Score</div><div className="text-gray-100 text-sm">{Number.isFinite(Number(walkForwardData.summary.stabilityScore)) ? walkForwardData.summary.stabilityScore : '--'}</div></div>
                  <div className="bg-black/30 rounded-md p-2 col-span-2"><div className="text-gray-500">Drift Flags</div><div className="text-gray-100 text-[11px]">{Array.isArray(walkForwardData.summary.driftFlags) && walkForwardData.summary.driftFlags.length > 0 ? walkForwardData.summary.driftFlags.join(' ') : 'None'}</div></div>
                </div>
              )}

              <div className="mt-2 h-[90px] w-full"><canvas ref={walkForwardCanvasRef} className="w-full h-full" /></div>
              <div className="text-[11px] text-gray-500">Test net R by fold.</div>

              <div className="text-[11px] text-gray-500">Recent folds (test):</div>
              <div className="max-h-[180px] overflow-y-auto text-xs">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-gray-500"><tr><th className="py-1">Fold</th><th>Test Range</th><th>Net R</th><th>WR</th><th>PF</th></tr></thead>
                  <tbody className="text-gray-200">
                    {walkForwardData.folds.slice(-6).map((fold: any) => (
                      <tr key={fold.id} className="border-t border-white/5">
                        <td className="py-1">#{fold.id}</td>
                        <td>{new Date(fold.testStart).toLocaleDateString()} → {new Date(fold.testEnd).toLocaleDateString()}</td>
                        <td>{formatR(fold.testEquity.netR)}</td>
                        <td>{formatPercent(fold.testStats.winRate)}</td>
                        <td>{fold.testStats.profitFactor != null ? fold.testStats.profitFactor.toFixed(2) : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : (
          <div className="text-[11px] text-gray-500">{walkForwardCfg.enabled ? 'Not enough data for walk-forward.' : 'Walk-forward is off.'}</div>
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-gray-400">Trades</div>
          <div className="text-[11px] text-gray-500">{replayTrades.length} shown</div>
        </div>
        {selectedTrade && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
            <div>
              Selected: <span className="text-gray-200">{htfBiasLabel(selectedTrade)} {selectedTrade.side} @ {formatPrice(selectedTrade.entryPrice)}</span>
              <span className="ml-2 text-gray-500">SL {formatPrice(selectedTrade.stopLoss)} | TP {formatPrice(selectedTrade.takeProfit)}{selectedTrade.rMultiple != null ? ` | ${selectedTrade.rMultiple.toFixed(2)}R` : ''}</span>
              {selectedTrade.meta?.htfBias && <span className="ml-2 text-gray-500">HTF {String(selectedTrade.meta.htfBias).toUpperCase()}</span>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => jumpToIndex(selectedTrade.entryIndex)} className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200">Entry</button>
              <button type="button" onClick={() => jumpToIndex(selectedTrade.exitIndex ?? selectedTrade.entryIndex)} className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200">Exit</button>
              <button type="button" onClick={() => selectTrade(null)} className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200">Clear</button>
            </div>
          </div>
        )}
        <div className="max-h-[320px] overflow-y-auto text-xs">
          {replayTrades.length === 0 ? (
            <div className="text-gray-500">No trades for this window.</div>
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-gray-500"><tr><th className="py-1">Time</th><th>Setup</th><th>Side</th><th>Entry</th><th>R</th><th>Status</th></tr></thead>
              <tbody>
                {replayTrades.slice(-120).reverse().map((trade: any) => (
                  <tr
                    key={trade.id}
                    onClick={() => selectTrade(trade)}
                    className={`border-t border-white/5 text-gray-200 cursor-pointer ${selectedTradeId === trade.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    <td className="py-1">{formatTs(trade.entryTime)}</td>
                    <td>{htfBiasLabel(trade)}</td>
                    <td className={trade.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>{trade.side}</td>
                    <td>{formatPrice(trade.entryPrice)}</td>
                    <td>{trade.rMultiple != null ? trade.rMultiple.toFixed(2) : '--'}</td>
                    <td className={trade.outcome === 'win' ? 'text-green-400' : trade.outcome === 'loss' ? 'text-red-400' : 'text-yellow-300'}>{trade.outcome || 'open'}</td>
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

export default React.memo(ValidationPanel);
