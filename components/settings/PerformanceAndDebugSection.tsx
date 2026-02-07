import React from 'react';
import { Cpu } from 'lucide-react';
import type { PerformanceDebugSectionProps } from './types';

const PerformanceAndDebugSection: React.FC<PerformanceDebugSectionProps> = ({ ctx }) => {
  const {
    performance,
    refreshLedgerStats,
    flushLedgerNow,
    ledgerStatsError,
    ledgerPending,
    ledgerInFlight,
    ledgerLastPersistAtMs,
    ledgerLastDirtyAtMs,
    ledgerPersistDelayMs,
    ledgerStats,
    ledgerPath,
    formatAgo,
    writeClipboardText,
    actionFlowDebugEnabled,
    setActionFlowDebugEnabled,
  } = ctx;

  const perf = performance || {};

  return (
    <div className="pt-2 border-t border-white/5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Cpu size={12} className="text-emerald-400" />
          Performance
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refreshLedgerStats()} className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300" title="Refresh stats">Refresh</button>
          <button onClick={() => void flushLedgerNow()} className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300" title="Force flush trade ledger to disk">Flush</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-black/20 border border-white/10">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Background Webviews</div>
          <div className="text-xs font-mono text-gray-200">
            Mounted:{' '}
            <span className={perf.keepWatchedTabsMounted ? 'text-green-400' : 'text-gray-400'}>
              {perf.keepWatchedTabsMounted ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Requested: {perf.keepWatchedTabsMountedRequested ? 'ON' : 'OFF'} {perf.keepWatchedTabsMountedRequested && !perf.keepWatchedTabsMounted ? '(paused while Settings open)' : ''}
          </div>
          <div className="text-[10px] text-gray-500 mt-2">
            Live: {perf.isLive ? `ON${perf.liveMode ? ` (${perf.liveMode})` : ''}` : 'OFF'} • Chart Watch: {perf.chartWatchEnabled ? 'ON' : 'OFF'}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Chat: {perf.chatOpen ? 'OPEN' : 'CLOSED'}{perf.sidebarMode ? ` (${perf.sidebarMode})` : ''}
          </div>
          <div className="text-[10px] text-gray-500 mt-2">
            Watched tabs: {perf.watchedTabs?.total ?? 0} (manual {perf.watchedTabs?.manual ?? 0}, auto {perf.watchedTabs?.auto ?? 0})
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Chart sessions: {perf.chartSessions?.total ?? 0} (watch {perf.chartSessions?.watchEnabled ?? 0}, assigned {perf.chartSessions?.assignedViews ?? 0})
          </div>
        </div>

        <div className="p-3 rounded-lg bg-black/20 border border-white/10">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Trade Ledger</div>
          {ledgerStatsError ? (
            <div className="text-[10px] text-red-400/90 font-mono">{ledgerStatsError}</div>
          ) : (
            <>
              <div className="text-xs font-mono text-gray-200">
                Pending writes: <span className={ledgerPending > 0 ? 'text-yellow-400' : 'text-gray-300'}>{ledgerPending}</span>
                {ledgerInFlight ? <span className="text-gray-500"> • in-flight</span> : null}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                Last persist: {ledgerLastPersistAtMs > 0 ? formatAgo(ledgerLastPersistAtMs) : '--'}
                {ledgerLastPersistAtMs > 0 ? ` (${new Date(ledgerLastPersistAtMs).toLocaleTimeString()})` : ''}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">Last change: {ledgerLastDirtyAtMs > 0 ? formatAgo(ledgerLastDirtyAtMs) : '--'}</div>
              <div className="text-[10px] text-gray-500 mt-1">Flush delay: {ledgerPersistDelayMs != null && Number.isFinite(ledgerPersistDelayMs) ? `${Math.max(0, Math.floor(ledgerPersistDelayMs))}ms` : '--'}</div>
              {ledgerStats?.lastError ? (
                <div className="mt-2 text-[10px] text-red-400/90 font-mono bg-black/20 border border-red-500/20 rounded-md p-2">
                  {String(ledgerStats.lastError)}
                </div>
              ) : null}
              {ledgerPath ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-gray-500 font-mono truncate" title={ledgerPath}>{ledgerPath}</div>
                  <button onClick={() => void writeClipboardText(ledgerPath)} className="flex-shrink-0 px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300" title="Copy ledger path">Copy</button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-white/5 space-y-2">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Debug</div>
        <label className="flex items-center gap-2 text-[11px] text-gray-400 select-none">
          <input type="checkbox" checked={actionFlowDebugEnabled} onChange={(e) => setActionFlowDebugEnabled(e.target.checked)} />
          Action flow debug toasts
        </label>
        <div className="text-[10px] text-gray-600">Show a notification when a multi-step action sequence is queued.</div>
      </div>
    </div>
  );
};

export default React.memo(PerformanceAndDebugSection);
