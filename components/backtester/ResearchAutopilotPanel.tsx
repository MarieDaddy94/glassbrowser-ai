import React from 'react';
import type { ResearchAutopilotPanelProps } from './types';

const ResearchAutopilotPanel: React.FC<ResearchAutopilotPanelProps> = ({ ctx }) => {
  const {
    loadExperimentNotes,
    experimentsUpdatedAtMs,
    formatAge,
    experimentsLoading,
    experimentNotes,
    formatR,
    applyExperimentNote,
    experimentsError,
    runResearchAutopilot,
    researchRunning,
    resumeResearchAutopilot,
    stopResearchAutopilot,
    researchSession,
    refreshResearchAutopilot,
    exportResearchAutopilot,
    promoteResearchChampion,
    canPromoteChampion,
    researchUpdatedAtMs,
    researchPresetId,
    setResearchPresetId,
    loopPresets,
    researchMaxExperiments,
    setResearchMaxExperiments,
    batchMaxCombos,
    setBatchMaxCombos,
    researchRobustness,
    setResearchRobustness,
    researchAdvancedOpen,
    setResearchAdvancedOpen,
    researchRegimeOverrides,
    setResearchRegimeOverrides,
    effectiveRegimePassRate,
    setResearchRequiredRegimePassRate,
    effectiveMinRegimesSeen,
    setResearchMinRegimesSeen,
    effectiveAllowRegimeBrittle,
    setResearchAllowRegimeBrittle,
    effectiveCriticalRegimes,
    knownRegimeKeys,
    setResearchCriticalRegimes,
    researchCriticalRegimesExtra,
    setResearchCriticalRegimesExtra,
    researchChampion,
    researchChampionMetrics,
    formatEdgeMargin,
    researchChampionWorst,
    researchTargetRegimeKey,
    researchTargetOutcome,
    researchTargetMinSamples,
    researchRegimeCoverage,
    researchRegimeRows,
    applyRegimeChampion,
    promoteRegimeChampion,
    onCreateWatchProfile,
    researchSteps,
    researchError,
    researchStatus,
    formatPercent
  } = ctx;

  return (
    <>
      <div
        className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '760px' }}
      >
        <div className="text-xs uppercase tracking-wider text-gray-400">Experiments</div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={loadExperimentNotes}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200"
          >
            Refresh
          </button>
          {experimentsUpdatedAtMs && (
            <span className="text-[10px] text-gray-500">Updated {formatAge(experimentsUpdatedAtMs)} ago</span>
          )}
        </div>
        <div className="max-h-[220px] overflow-y-auto space-y-2 text-[11px]">
          {experimentsLoading && <div className="text-gray-500">Loading experiments...</div>}
          {!experimentsLoading && experimentNotes.length === 0 && (
            <div className="text-gray-500">No experiment notes yet.</div>
          )}
          {!experimentsLoading && experimentNotes.map((note: any) => {
            const key = String(note?.id || `${note?.symbol || 'note'}_${note?.createdAtMs || '0'}`);
            const meta = [note?.symbol, note?.timeframe, note?.strategy].filter(Boolean).join(' ');
            const ageValue = note?.updatedAtMs ?? note?.createdAtMs ?? null;
            const age = ageValue ? formatAge(ageValue) : '';
            const decision = String(note?.decision || 'investigate').toUpperCase();
            const metrics = note?.recommendedMetrics || note?.resultSummary?.round2?.metrics;
            const summary = note?.summary
              || (metrics
                ? `WR ${Number.isFinite(Number(metrics.winRate)) ? `${(Number(metrics.winRate) * 100).toFixed(1)}%` : '--'} | DD ${formatR(metrics.maxDrawdown)} | Net ${formatR(metrics.netR)} | PF ${Number.isFinite(Number(metrics.profitFactor)) ? Number(metrics.profitFactor).toFixed(2) : '--'} | Trades ${metrics.tradeCount ?? '--'}`
                : '');
            const hypothesis = String(note?.hypothesis || '').trim();
            const objectivePreset = String(note?.objectivePreset || '').trim();
            const targetKey = note?.resultSummary?.targetRegimeKey ? String(note.resultSummary.targetRegimeKey) : '';
            const targetOutcome = note?.resultSummary?.targetRegimeOutcome || null;
            const targetLine = targetKey
              ? `Target ${targetKey} | ${targetOutcome?.foundChampion ? 'FOUND' : String(targetOutcome?.reason || 'MISS').toUpperCase()}${targetOutcome?.samples != null ? ` | Samples ${targetOutcome.samples}` : ''}`
              : '';
            return (
              <div key={key} className="rounded-md border border-white/10 bg-black/30 p-2 space-y-1">
                <div className="flex items-center justify-between gap-2 text-[10px] text-gray-400">
                  <div>{meta || 'Experiment'}</div>
                  <div className="text-[10px] text-gray-300">{decision}</div>
                </div>
                {(age || objectivePreset) && (
                  <div className="text-[10px] text-gray-500">
                    {[age ? `Updated ${age} ago` : '', objectivePreset ? `Preset ${objectivePreset}` : ''].filter(Boolean).join(' | ')}
                  </div>
                )}
                {summary && (
                  <div className="text-gray-200">{summary}</div>
                )}
                {targetLine && (
                  <div className="text-[10px] text-gray-500">{targetLine}</div>
                )}
                {hypothesis && (
                  <div className="text-[10px] text-gray-500">Hypothesis: {hypothesis}</div>
                )}
                <div className="flex items-center gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => applyExperimentNote(note)}
                    disabled={!note?.recommendedParams}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Apply Recommended
                  </button>
                  {note?.round2SessionId && (
                    <span className="text-gray-500">Round 2 {note.round2SessionId}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {experimentsError && <div className="text-[11px] text-red-400">{experimentsError}</div>}
      </div>

      <div
        className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '520px' }}
      >
        <div className="text-xs uppercase tracking-wider text-gray-400">Research Autopilot</div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={runResearchAutopilot}
            disabled={researchRunning}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start
          </button>
          <button
            type="button"
            onClick={resumeResearchAutopilot}
            disabled={researchRunning}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Resume Latest
          </button>
          <button
            type="button"
            onClick={stopResearchAutopilot}
            disabled={!researchRunning}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop
          </button>
          <button
            type="button"
            onClick={() => {
              if (researchSession?.sessionId) {
                void refreshResearchAutopilot(researchSession.sessionId);
              }
            }}
            disabled={!researchSession?.sessionId}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportResearchAutopilot}
            disabled={!researchSession?.sessionId}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export
          </button>
          <button
            type="button"
            onClick={promoteResearchChampion}
            disabled={!canPromoteChampion}
            className="px-2 py-1 rounded-md text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Promote Champion
          </button>
          {researchUpdatedAtMs && (
            <span className="text-[10px] text-gray-500">Updated {formatAge(researchUpdatedAtMs)} ago</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
          <label className="flex flex-col gap-1">
            Preset
            <select
              value={researchPresetId}
              onChange={(e) => setResearchPresetId(e.target.value)}
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
            Max Experiments
            <input
              type="number"
              min={1}
              max={10}
              value={researchMaxExperiments}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                setResearchMaxExperiments(Math.max(1, Math.min(10, Math.floor(raw))));
              }}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            Budget (max combos)
            <input
              type="number"
              min={10}
              max={2000}
              value={batchMaxCombos}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                setBatchMaxCombos(Math.max(10, Math.min(2000, Math.floor(raw))));
              }}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            Robustness
            <select
              value={researchRobustness}
              onChange={(e) => setResearchRobustness(e.target.value as 'lite' | 'standard' | 'strict')}
              className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100"
            >
              <option value="lite">Lite</option>
              <option value="standard">Standard</option>
              <option value="strict">Strict</option>
            </select>
          </label>
        </div>
        <div className="text-[10px] text-gray-500">
          <button
            type="button"
            onClick={() => setResearchAdvancedOpen((prev: boolean) => !prev)}
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-200"
          >
            {researchAdvancedOpen ? 'Hide Advanced' : 'Show Advanced'}
          </button>
        </div>
        {researchAdvancedOpen && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={researchRegimeOverrides}
                onChange={(e) => setResearchRegimeOverrides(e.target.checked)}
              />
              Use custom regime gate (override defaults)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                Pass rate
                <input
                  type="number"
                  min={0.4}
                  max={0.9}
                  step={0.05}
                  value={effectiveRegimePassRate}
                  disabled={!researchRegimeOverrides}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    setResearchRequiredRegimePassRate(Math.max(0.4, Math.min(0.9, raw)));
                  }}
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1">
                Min regimes seen
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={effectiveMinRegimesSeen}
                  disabled={!researchRegimeOverrides}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    setResearchMinRegimesSeen(Math.max(1, Math.min(5, Math.floor(raw))));
                  }}
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 disabled:opacity-60"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={effectiveAllowRegimeBrittle}
                  disabled={!researchRegimeOverrides}
                  onChange={(e) => setResearchAllowRegimeBrittle(e.target.checked)}
                />
                Allow brittle regimes
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                Critical regimes
                <select
                  multiple
                  value={effectiveCriticalRegimes.filter((entry: string) => knownRegimeKeys.includes(entry))}
                  disabled={!researchRegimeOverrides}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                    setResearchCriticalRegimes(selected);
                  }}
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 disabled:opacity-60"
                >
                  {knownRegimeKeys.map((key: string) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Other regimes (comma separated)
                <input
                  value={researchCriticalRegimesExtra}
                  disabled={!researchRegimeOverrides}
                  onChange={(e) => setResearchCriticalRegimesExtra(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-gray-100 disabled:opacity-60"
                  placeholder="high_trend_ny, high_range_ny"
                />
              </label>
            </div>
          </div>
        )}
        {researchSession && (
          <div className="text-[11px] text-gray-400 space-y-1">
            <div>
              Status {researchSession.status} | Experiments {researchSession.stats?.experimentsRun ?? 0}/
              {researchSession.stats?.experimentsPlanned ?? '--'}
            </div>
            {researchSession.stats?.bestScore != null && Number.isFinite(Number(researchSession.stats.bestScore)) && (
              <div>Best score {Number(researchSession.stats.bestScore).toFixed(3)}</div>
            )}
            {researchSession.stats?.bestExperimentId && (
              <div>Best experiment {researchSession.stats.bestExperimentId}</div>
            )}
            {researchChampion && (
              <div className="text-[10px] text-gray-500">
                Champion {String(researchChampion.decision || 'run').toUpperCase()} | Score {Number.isFinite(Number(researchChampion.score)) ? Number(researchChampion.score).toFixed(3) : '--'} | Trades {researchChampionMetrics?.tradeCount ?? '--'} | Edge {formatEdgeMargin(researchChampionMetrics?.edgeMargin)} | Worst DD {researchChampionWorst?.metrics?.maxDrawdown != null ? formatR(researchChampionWorst.metrics.maxDrawdown) : '--'}
              </div>
            )}
            {researchTargetRegimeKey && (
              <div className="text-[10px] text-gray-500">
                Target Regime {researchTargetRegimeKey}
                {researchTargetOutcome?.samples != null || researchTargetMinSamples != null
                  ? ` | Samples ${researchTargetOutcome?.samples ?? '--'}/${researchTargetMinSamples ?? '--'}`
                  : ''}
                {researchTargetOutcome
                  ? ` | Outcome ${researchTargetOutcome.foundChampion ? 'FOUND' : String(researchTargetOutcome.reason || 'MISS').toUpperCase()}`
                  : ''}
              </div>
            )}
            {researchRegimeCoverage && (
              <div className="text-[10px] text-gray-500">
                Regimes Seen {researchRegimeCoverage.regimesSeenCount ?? '--'} | Pass {researchRegimeCoverage.regimesPassCount ?? '--'} | PassRate {Number.isFinite(Number(researchRegimeCoverage.passRate)) ? `${(Number(researchRegimeCoverage.passRate) * 100).toFixed(0)}%` : '--'} | Worst {researchRegimeCoverage.worstRegimeKey || '--'}{Array.isArray(researchRegimeCoverage.brittleRegimes) && researchRegimeCoverage.brittleRegimes.length > 0 ? ` | Brittle ${researchRegimeCoverage.brittleRegimes.slice(0, 3).join(', ')}` : ''}
              </div>
            )}
            {researchRegimeRows.length > 0 && (
              <div className="mt-2 space-y-1 text-[10px] text-gray-500">
                <div className="uppercase tracking-wider text-gray-500">Champions by Regime</div>
                {researchRegimeRows.map((row: any) => {
                  const record = row.record;
                  const decisionRaw = String(record?.decision || 'run').toLowerCase();
                  const decisionLabel = decisionRaw.toUpperCase();
                  const decisionClass =
                    decisionRaw === 'adopt'
                      ? 'text-emerald-400'
                      : decisionRaw === 'reject'
                        ? 'text-red-400'
                        : decisionRaw === 'investigate'
                          ? 'text-amber-400'
                          : 'text-gray-400';
                  const trades = record?.testMetrics?.tradeCount ?? '--';
                  const edge = formatEdgeMargin(record?.testMetrics?.edgeMargin);
                  const dd = record?.testMetrics?.maxDrawdown != null ? formatR(record.testMetrics.maxDrawdown) : '--';
                  const score = Number.isFinite(Number(record?.score)) ? Number(record?.score).toFixed(3) : '--';
                  const canAct = Boolean(record?.experimentNoteId);
                  return (
                    <div key={row.regimeKey} className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-gray-300">
                          {row.regimeKey} <span className="text-[10px] text-gray-500">x{row.count}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">
                          <span className={decisionClass}>{decisionLabel}</span> | Score {score} | Trades {trades} | Edge {edge} | DD {dd}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyRegimeChampion(record)}
                          disabled={!canAct}
                          className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => promoteRegimeChampion(record ? { ...record, regimeKey: row.regimeKey } : null)}
                          disabled={!canAct || !onCreateWatchProfile}
                          className="px-2 py-1 rounded-md text-[10px] border border-white/10 bg-black/40 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          Promote
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {researchSteps.length > 0 && (
          <div className="space-y-1 text-[10px] text-gray-500">
            <div className="uppercase tracking-wider text-gray-500">Timeline</div>
            {researchSteps.slice(-6).map((step: any) => {
              const key = String(step?.id || `${step?.kind || 'step'}_${step?.createdAtMs || Math.random()}`);
              const detail =
                step?.payload?.index != null
                  ? ` #${step.payload.index}`
                  : step?.payload?.sessionId
                    ? ` ${step.payload.sessionId}`
                    : '';
              const decision = String(step?.payload?.decision || '').toLowerCase();
              const statusTag = step?.kind === 'skipped_duplicate'
                ? 'SKIP'
                : step?.kind === 'rate_limit_pause'
                  ? 'PAUSE'
                  : step?.kind === 'stop_plateau' || step?.kind === 'stop_robustness' || step?.kind === 'stop_rate_limit'
                    ? 'STOP'
                    : step?.kind === 'error' || decision === 'reject'
                      ? 'FAIL'
                      : decision === 'investigate'
                        ? 'WARN'
                        : decision === 'adopt'
                          ? 'OK'
                          : '';
              const age = step?.createdAtMs ? formatAge(step.createdAtMs) : '';
              return (
                <div key={key}>
                  {statusTag ? `[${statusTag}] ` : ''}{step?.kind || 'step'}{detail}{age ? ` | ${age} ago` : ''}
                </div>
              );
            })}
          </div>
        )}
        {researchError && <div className="text-[11px] text-red-400">{researchError}</div>}
        {researchStatus && <div className="text-[11px] text-emerald-400">{researchStatus}</div>}
      </div>
    </>
  );
};

export default React.memo(ResearchAutopilotPanel);

