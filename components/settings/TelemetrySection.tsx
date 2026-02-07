import React from 'react';
import type { TelemetrySectionProps } from './types';

const TelemetrySection: React.FC<TelemetrySectionProps> = ({ ctx }) => {
  const {
    setShowLiveErrorLog,
    liveErrors,
    setShowDiagnosticsConsole,
    setShowTechAgentConsole,
    healthSnapshot,
  } = ctx;

  const startupOpenaiState = String(healthSnapshot?.startupOpenaiState || '').trim().toLowerCase();
  const startupTradeLockerState = String(healthSnapshot?.startupTradeLockerState || '').trim().toLowerCase();
  const startupBridgeState = String(healthSnapshot?.startupBridgeState || '').trim().toLowerCase();
  const startupBridgeError = String(healthSnapshot?.startupBridgeError || '').trim();
  const startupProbeErrors = healthSnapshot?.startupProbeErrors || null;
  const startupBlockedReason =
    startupProbeErrors?.secrets ||
    startupProbeErrors?.tradelocker ||
    startupProbeErrors?.broker ||
    startupProbeErrors?.tradeLedger ||
    null;
  const setupCheckReason = startupBridgeState === 'failed'
    ? `bridge_failed: ${startupBridgeError || 'Renderer bridge unavailable.'}`
    : startupBlockedReason
    ? `blocked: ${startupBlockedReason}`
    : (startupOpenaiState === 'missing' || startupTradeLockerState === 'missing')
      ? `missing: ${startupOpenaiState === 'missing' ? 'OpenAI' : ''}${startupOpenaiState === 'missing' && startupTradeLockerState === 'missing' ? ', ' : ''}${startupTradeLockerState === 'missing' ? 'TradeLocker' : ''}`
      : 'not shown';
  const cacheBudgets = Array.isArray(healthSnapshot?.cacheBudgets) ? healthSnapshot.cacheBudgets : [];
  const workerFallback = healthSnapshot?.workerFallback || null;
  const persistenceHealth = healthSnapshot?.persistenceHealth || null;

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Telemetry</div>
      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Live Error Log</div>
          <button type="button" onClick={() => setShowLiveErrorLog(true)} className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300">
            Open ({Array.isArray(liveErrors) ? liveErrors.length : 0})
          </button>
        </div>
        <div className="text-[10px] text-gray-600">Streams renderer errors, promise rejections, and console.error output in real time.</div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Diagnostics Console</div>
          <button type="button" onClick={() => setShowDiagnosticsConsole(true)} className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300">
            Open
          </button>
        </div>
        <div className="text-[10px] text-gray-600">Health snapshot, audit tail, rate-limit telemetry, and release checks.</div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Live Tech Agent</div>
          <button type="button" onClick={() => setShowTechAgentConsole(true)} className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300">
            Open
          </button>
        </div>
        <div className="text-[10px] text-gray-600">SRE console that analyzes logs + code context with GPT-5.2.</div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Startup Health</div>
        <div className="text-[11px] text-gray-300">Phase: {healthSnapshot?.startupPhase || '--'}</div>
        <div className="text-[11px] text-gray-300">Broker: {healthSnapshot?.brokerStatus || '--'}</div>
        <div className="text-[11px] text-gray-300">Stream: {healthSnapshot?.brokerStreamStatus || '--'}</div>
        <div className="text-[11px] text-gray-300">Startup checked: {healthSnapshot?.startupCheckedAtMs ? new Date(healthSnapshot.startupCheckedAtMs).toLocaleTimeString() : '--'}</div>
        <div className="text-[11px] text-gray-300">Bridge: {healthSnapshot?.startupBridgeState || '--'}{startupBridgeError ? ` (${startupBridgeError})` : ''}</div>
        <div className="text-[11px] text-gray-300">OpenAI state: {healthSnapshot?.startupOpenaiState || '--'} ({healthSnapshot?.startupOpenaiProbeSource || '--'})</div>
        <div className="text-[11px] text-gray-300">TradeLocker state: {healthSnapshot?.startupTradeLockerState || '--'} ({healthSnapshot?.startupTradeLockerProbeSource || '--'})</div>
        <div className="text-[11px] text-gray-300">Probe skipped due to bridge: {healthSnapshot?.startupProbeSkippedDueToBridge ? 'yes' : 'no'}</div>
        <div className="text-[11px] text-gray-300">
          TradeLocker auto-restore: {healthSnapshot?.startupTradeLockerAutoRestoreAttempted ? (healthSnapshot?.startupTradeLockerAutoRestoreSuccess ? 'success' : 'failed') : 'not attempted'}
          {healthSnapshot?.startupTradeLockerAutoRestoreAtMs ? ` @ ${new Date(healthSnapshot.startupTradeLockerAutoRestoreAtMs).toLocaleTimeString()}` : ''}
        </div>
        {healthSnapshot?.startupTradeLockerAutoRestoreError ? (
          <div className="text-[11px] text-amber-300">Auto-restore error: {healthSnapshot.startupTradeLockerAutoRestoreError}</div>
        ) : null}
        <div className="text-[11px] text-gray-300">Setup check reason: {setupCheckReason}</div>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Cache Budgets</div>
        {cacheBudgets.length === 0 ? (
          <div className="text-[11px] text-gray-500">No cache telemetry.</div>
        ) : (
          cacheBudgets.slice(0, 10).map((entry) => (
            <div key={entry.name} className="text-[11px] text-gray-300">
              {entry.name}: {entry.size}/{entry.maxEntries} | evict {entry.evictions} | ttl {entry.ttlEvictions} | hit {(entry.hitRate * 100).toFixed(1)}%
            </div>
          ))
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Worker Fallback</div>
        {!workerFallback?.byDomain ? (
          <div className="text-[11px] text-gray-500">No worker fallback telemetry.</div>
        ) : (
          Object.entries(workerFallback.byDomain).map(([domain, stats]) => (
            <div key={domain} className="text-[11px] text-gray-300">
              {domain}: total {Number(stats?.total || 0)} | fallback {Number(stats?.fallbackUsed || 0)}
            </div>
          ))
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-1">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Persistence Health</div>
        <div className="text-[11px] text-gray-300">
          Overall: {persistenceHealth?.overallOk === false ? 'DEGRADED' : 'OK'}
        </div>
        {persistenceHealth?.domains ? (
          Object.entries(persistenceHealth.domains).slice(0, 10).map(([name, state]) => (
            <div key={name} className="text-[11px] text-gray-300">
              {name}: {state?.ok === false ? 'error' : 'ok'} | fails {Number(state?.failures || 0)} | queued {Number(state?.writesQueued || 0)}
            </div>
          ))
        ) : (
          <div className="text-[11px] text-gray-500">No persistence telemetry.</div>
        )}
      </div>
    </div>
  );
};

export default React.memo(TelemetrySection);
