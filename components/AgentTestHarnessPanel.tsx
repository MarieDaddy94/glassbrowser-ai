import React, { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { normalizeAgentTestScenario } from '../services/agentTestHarnessService';
import type { AgentTestScenario, AgentTestRun } from '../types';

type AgentTestHarnessPanelProps = {
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  title?: string;
  compact?: boolean;
};

const formatAge = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return '--';
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(1, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const AgentTestHarnessPanel: React.FC<AgentTestHarnessPanelProps> = ({
  onRunActionCatalog,
  title = 'Agent Test Harness',
  compact = false
}) => {
  const [scenarios, setScenarios] = useState<AgentTestScenario[]>([]);
  const [runs, setRuns] = useState<AgentTestRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [runsUpdatedAtMs, setRunsUpdatedAtMs] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadScenarios = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listAgentMemory) {
      setError('Agent test scenarios unavailable.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ledger.listAgentMemory({ limit: 30, kind: 'agent_test_scenario' });
      if (!res?.ok) {
        setError(res?.error ? String(res.error) : 'Failed to load scenarios.');
        setScenarios([]);
        return;
      }
      const next = (Array.isArray(res.memories) ? res.memories : [])
        .map((entry: any) => normalizeAgentTestScenario(entry?.payload || entry))
        .filter(Boolean) as AgentTestScenario[];
      setScenarios(next);
      setUpdatedAtMs(Date.now());
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to load scenarios.');
      setScenarios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listAgentMemory) {
      setRunsError('Agent test runs unavailable.');
      return;
    }
    setRunsLoading(true);
    setRunsError(null);
    try {
      const res = await ledger.listAgentMemory({ limit: 20, kind: 'agent_test_run' });
      if (!res?.ok) {
        setRunsError(res?.error ? String(res.error) : 'Failed to load test runs.');
        setRuns([]);
        return;
      }
      const next = (Array.isArray(res.memories) ? res.memories : [])
        .map((entry: any) => entry?.payload || entry)
        .filter(Boolean) as AgentTestRun[];
      next.sort((a, b) => Number(b.updatedAtMs || b.createdAtMs || 0) - Number(a.updatedAtMs || a.createdAtMs || 0));
      setRuns(next);
      setRunsUpdatedAtMs(Date.now());
    } catch (err: any) {
      setRunsError(err?.message ? String(err.message) : 'Failed to load test runs.');
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const runScenario = useCallback(async (scenario: AgentTestScenario) => {
    if (!scenario?.id) return;
    if (!onRunActionCatalog) {
      setStatus('Action catalog unavailable.');
      return;
    }
    setStatus(null);
    const payload: Record<string, any> = { scenarioId: scenario.id };
    if (scenario.context?.symbol) payload.symbol = scenario.context.symbol;
    if (scenario.context?.timeframe) payload.timeframe = scenario.context.timeframe;
    if (scenario.context?.mode) payload.mode = scenario.context.mode;
    if (scenario.context?.strategy) payload.strategy = scenario.context.strategy;
    if (Array.isArray(scenario.context?.timeframes)) payload.timeframes = scenario.context.timeframes;
    const res = await onRunActionCatalog({ actionId: 'agent_test.run', payload });
    if (!res?.ok) {
      setStatus(res?.error || 'Failed to start scenario run.');
      return;
    }
    setStatus('Scenario run started.');
    void loadRuns();
  }, [loadRuns, onRunActionCatalog]);

  const replayRun = useCallback(async (runId: string) => {
    if (!onRunActionCatalog) {
      setStatus('Action catalog unavailable.');
      return;
    }
    setStatus(null);
    const res = await onRunActionCatalog({ actionId: 'truth.replay', payload: { runId, limit: 600 } });
    if (!res?.ok) {
      setStatus(res?.error || 'Failed to load run replay.');
      return;
    }
    setStatus(`Loaded replay for ${runId}.`);
  }, [onRunActionCatalog]);

  useEffect(() => {
    void loadScenarios();
    void loadRuns();
  }, [loadRuns, loadScenarios]);

  const listMaxHeight = compact ? 'max-h-[140px]' : 'max-h-[200px]';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-200 uppercase tracking-wider">
        <Activity size={12} className="text-emerald-300" />
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={loadScenarios}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
        >
          Refresh Scenarios
        </button>
        <button
          type="button"
          onClick={loadRuns}
          className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
        >
          Refresh Runs
        </button>
        {updatedAtMs && (
          <span className="text-[10px] text-gray-500">Scenarios {formatAge(updatedAtMs)} ago</span>
        )}
        {runsUpdatedAtMs && (
          <span className="text-[10px] text-gray-500">Runs {formatAge(runsUpdatedAtMs)} ago</span>
        )}
      </div>
      {status && <div className="text-[11px] text-emerald-200">{status}</div>}
      <div className="grid grid-cols-1 gap-3 text-[11px]">
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Scenarios</div>
          <div className={`${listMaxHeight} overflow-y-auto space-y-2`}>
            {loading && <div className="text-gray-500">Loading scenarios...</div>}
            {!loading && scenarios.length === 0 && (
              <div className="text-gray-500">No agent test scenarios yet.</div>
            )}
            {!loading && scenarios.map((scenario) => {
              const key = scenario.id;
              const meta = [scenario.context?.symbol, scenario.context?.timeframe, scenario.context?.strategy].filter(Boolean).join(' ');
              const expected = scenario.expected?.status ? String(scenario.expected.status).toUpperCase() : '';
              const steps = scenario.steps?.length ?? scenario.playbook?.steps?.length ?? 0;
              return (
                <div key={key} className="rounded-md border border-white/10 bg-black/30 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                    <div>{scenario.name}</div>
                    {expected && <div>{expected}</div>}
                  </div>
                  {meta && <div className="text-gray-200">{meta}</div>}
                  <div className="text-[10px] text-gray-500">
                    {steps ? `${steps} steps` : 'No steps'}{scenario.playbookId ? ` | ${scenario.playbookId}` : ''}
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => runScenario(scenario)}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                    >
                      Run
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {error && <div className="text-[11px] text-red-400">{error}</div>}
        </div>
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Recent Runs</div>
          <div className={`${listMaxHeight} overflow-y-auto space-y-2`}>
            {runsLoading && <div className="text-gray-500">Loading test runs...</div>}
            {!runsLoading && runs.length === 0 && (
              <div className="text-gray-500">No agent test runs yet.</div>
            )}
            {!runsLoading && runs.map((run) => {
              const statusLabel = String(run.status || '').toUpperCase();
              const passLabel = run.pass == null ? '' : run.pass ? 'PASS' : 'FAIL';
              const meta = [run.context?.symbol, run.context?.timeframe, run.context?.strategy].filter(Boolean).join(' ');
              const steps = run.metrics?.completedSteps != null && run.metrics?.totalSteps != null
                ? `${run.metrics.completedSteps}/${run.metrics.totalSteps} steps`
                : '';
              const tradeSummary = run.metrics?.tradeClosedCount != null
                ? [
                    `Trades ${run.metrics.tradeClosedCount}`,
                    run.metrics.tradeWinRate != null ? `WR ${(run.metrics.tradeWinRate * 100).toFixed(1)}%` : '',
                    run.metrics.tradeNetPnl != null ? `Net ${Number(run.metrics.tradeNetPnl).toFixed(2)}` : ''
                  ].filter(Boolean).join(' | ')
                : '';
              const signalSummary = run.metrics?.setupTriggeredCount != null
                ? [
                    `Signals ${run.metrics.setupTriggeredCount}`,
                    run.metrics.falseTriggerCount != null ? `False ${run.metrics.falseTriggerCount}` : ''
                  ].filter(Boolean).join(' | ')
                : '';
              const updated = Number(run.updatedAtMs || run.createdAtMs || 0);
              return (
                <div key={run.runId} className="rounded-md border border-white/10 bg-black/30 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                    <div>{run.scenarioName || run.scenarioId}</div>
                    <div>{[statusLabel, passLabel].filter(Boolean).join(' ')}</div>
                  </div>
                  {meta && <div className="text-gray-200">{meta}</div>}
                  <div className="text-[10px] text-gray-500">
                    {[steps, updated ? `Updated ${formatAge(updated)} ago` : ''].filter(Boolean).join(' | ')}
                  </div>
                  {(tradeSummary || signalSummary) && (
                    <div className="text-[10px] text-gray-500">
                      {[tradeSummary, signalSummary].filter(Boolean).join(' | ')}
                    </div>
                  )}
                  {onRunActionCatalog && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => replayRun(run.runId)}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200"
                      >
                        Replay
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {runsError && <div className="text-[11px] text-red-400">{runsError}</div>}
        </div>
      </div>
    </div>
  );
};

export default AgentTestHarnessPanel;
