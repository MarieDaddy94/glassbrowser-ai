import React from 'react';
import type { TimelineTruthPanelProps } from './types';

const TimelineTruthPanel: React.FC<TimelineTruthPanelProps> = ({ ctx }) => {
  const {
    timelineRun,
    onResumePlaybookRun,
    statusBadge,
    retryPolicyLine,
    formatRunTime,
    blockedStep,
    blockedHeader,
    blockedNote,
    blockedIsMissing,
    getResumeDraft,
    updateResumeDraft,
    runResume,
    timelineStepFilters,
    setTimelineStepFilters,
    timelineFilterOptions,
    timelineSteps,
    taskTreeResumeQueue,
    onResumeTaskTreeRun,
    taskTreeRunList,
    actionTaskTreeRunList,
    selectedTaskTreeRun,
    selectedTaskTreeRunId,
    setSelectedTaskTreeRunId,
    selectedActionTaskTreeRun,
    selectedActionTaskTreeRunId,
    setSelectedActionTaskTreeRunId,
    renderTaskTreeRun,
    taskTruthRunId,
    taskTruthUpdatedAtMs,
    setTaskTruthRunId,
    taskTruthError,
    filteredTaskTruthEvents,
    truthLevelBadge
  } = ctx;

  if (!timelineRun && taskTreeRunList.length === 0 && actionTaskTreeRunList.length === 0) return null;

  return (
    <>
      {timelineRun && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wider text-gray-400">Playbook Timeline</div>
            <div className="flex items-center gap-2">
              {onResumePlaybookRun && (timelineRun.status === 'blocked' || timelineRun.status === 'failed') && (
                <button
                  type="button"
                  onClick={() => onResumePlaybookRun(timelineRun.runId)}
                  className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                >
                  Resume
                </button>
              )}
              <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusBadge(timelineRun.status)}`}>
                {String(timelineRun.status || 'unknown').toUpperCase()}
              </span>
            </div>
          </div>
          <div className="text-[10px] text-gray-500">{retryPolicyLine}</div>
          <div className="text-[11px] text-gray-300">
            <span className="font-semibold text-gray-100">{timelineRun.playbookName || timelineRun.playbookId}</span>
            {timelineRun.symbol ? ` | ${timelineRun.symbol}` : ''}
            {timelineRun.timeframe ? ` ${timelineRun.timeframe}` : ''}
            {timelineRun.strategy ? ` | ${timelineRun.strategy}` : ''}
            {timelineRun.mode ? ` | ${timelineRun.mode}` : ''}
          </div>
          <div className="text-[10px] text-gray-500">
            Started {formatRunTime(timelineRun.startedAtMs)}{timelineRun.finishedAtMs ? `  | Finished ${formatRunTime(timelineRun.finishedAtMs)}` : ''}
          </div>
          {timelineRun.error && <div className="text-[10px] text-red-300">Error: {timelineRun.error}</div>}

          {blockedStep && onResumePlaybookRun && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-100">
              <div className="font-semibold text-amber-200">{blockedHeader}: {blockedStep.label || blockedStep.actionId}</div>
              {blockedNote && <div className="text-[10px] text-amber-200/80">Reason: {blockedStep.note}</div>}
              {blockedIsMissing && timelineRun && (
                <div className="mt-2 grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={getResumeDraft(timelineRun.runId).symbol}
                      onChange={(e) => updateResumeDraft(timelineRun.runId, { symbol: e.target.value })}
                      placeholder={timelineRun.symbol || 'Symbol'}
                      className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                    />
                    <input
                      type="text"
                      value={getResumeDraft(timelineRun.runId).timeframe}
                      onChange={(e) => updateResumeDraft(timelineRun.runId, { timeframe: e.target.value })}
                      placeholder={timelineRun.timeframe || 'Timeframe'}
                      className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                    />
                    <input
                      type="text"
                      value={getResumeDraft(timelineRun.runId).strategy}
                      onChange={(e) => updateResumeDraft(timelineRun.runId, { strategy: e.target.value })}
                      placeholder={timelineRun.strategy || 'Strategy'}
                      className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                    />
                    <input
                      type="text"
                      value={getResumeDraft(timelineRun.runId).timeframes}
                      onChange={(e) => updateResumeDraft(timelineRun.runId, { timeframes: e.target.value })}
                      placeholder="MTF list (4h,1h,15m,5m)"
                      className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => runResume(timelineRun.runId)}
                    className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                  >
                    Resume with overrides
                  </button>
                </div>
              )}
            </div>
          )}

          {timelineFilterOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
              {timelineFilterOptions.map((entry: any) => {
                const key = String(entry.value || '');
                const selected = timelineStepFilters.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTimelineStepFilters((prev: string[]) =>
                        prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
                      );
                    }}
                    className={`px-2 py-1 rounded-md border ${selected ? 'border-cyan-400/70 bg-cyan-500/10 text-cyan-100' : 'border-white/10 bg-black/30 text-gray-300'}`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {timelineSteps.length === 0 ? (
              <div className="text-[10px] text-gray-500">No timeline steps yet.</div>
            ) : (
              timelineSteps.map((step: any, idx: number) => (
                <div key={step.stepId || `${step.actionId || 'step'}-${idx}`} className="rounded-lg border border-white/10 bg-black/30 p-2">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="text-gray-300">{step.label || step.actionId || `Step ${idx + 1}`}</div>
                    <span className={`px-2 py-0.5 rounded-full border text-[9px] ${statusBadge(step.status || 'pending')}`}>
                      {String(step.status || 'pending').toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    {step.startedAtMs ? `Started ${formatRunTime(step.startedAtMs)}` : 'Pending'}
                    {step.finishedAtMs ? ` • Finished ${formatRunTime(step.finishedAtMs)}` : ''}
                    {step.note ? ` • ${step.note}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {taskTreeResumeQueue.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
          <div className="text-xs uppercase tracking-wider text-gray-400">Task Tree Resume Queue</div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {taskTreeResumeQueue.map((entry: any) => {
              const label = entry.taskType === 'action' ? 'Action' : 'Signal';
              const context = entry.context || {};
              const symbol = context.symbol ? String(context.symbol) : '';
              const timeframe = context.timeframe ? String(context.timeframe) : '';
              const strategy = context.strategy ? String(context.strategy) : '';
              const requiresConfirmation = entry.requiresConfirmation || entry.blockedReason === 'confirmation_required' || entry.lastStep?.note === 'confirmation_required';
              const canSkip = !!entry.blocked && !requiresConfirmation;
              const status = entry.status ? String(entry.status).toUpperCase() : 'PENDING';
              return (
                <div key={`${entry.taskType}-${entry.runId}`} className="rounded-lg border border-white/10 bg-black/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-gray-200">{label} run {entry.runId.slice(-6)}{symbol ? ` | ${symbol}` : ''}{timeframe ? ` ${timeframe}` : ''}{strategy ? ` | ${strategy}` : ''}</div>
                    <div className="flex items-center gap-2">
                      {onResumeTaskTreeRun && (
                        <>
                          {requiresConfirmation ? (
                            <button type="button" onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'approve' })} className="px-2 py-1 rounded-md text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-100">Approve</button>
                          ) : (
                            <button type="button" onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'resume' })} className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100">Resume</button>
                          )}
                          {canSkip && (
                            <button type="button" onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'skip' })} className="px-2 py-1 rounded-md text-[10px] bg-slate-500/20 hover:bg-slate-500/30 text-slate-200">Skip</button>
                          )}
                          <button type="button" onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'abort' })} className="px-2 py-1 rounded-md text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-200">Abort</button>
                        </>
                      )}
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusBadge(status.toLowerCase())}`}>{status}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500">Updated {formatRunTime(entry.updatedAtMs)}{Number.isFinite(Number(entry.queueDepth)) ? ` • Queue ${entry.queueDepth}` : ''}</div>
                  {entry.lastStep && <div className="mt-1 text-[10px] text-gray-400">Last step: {entry.lastStep.step} ({entry.lastStep.status}){entry.lastStep.note ? ` • ${entry.lastStep.note}` : ''}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(taskTreeRunList.length > 0 || actionTaskTreeRunList.length > 0) && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
          <div className="text-xs uppercase tracking-wider text-gray-400">Task Tree Activity</div>
          {taskTreeRunList.length > 0 && (
            <div className="space-y-2">
              {taskTreeRunList.length > 1 && (
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>Signal run</span>
                  <select value={selectedTaskTreeRun?.runId || ''} onChange={(e) => setSelectedTaskTreeRunId(String(e.target.value))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200">
                    {taskTreeRunList.map((run: any) => (
                      <option key={run.runId} value={run.runId}>{run.runId.slice(-6)} {String(run.status || '').toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              )}
              {selectedTaskTreeRun && renderTaskTreeRun(selectedTaskTreeRun, 'Signal Task Tree')}
            </div>
          )}

          {actionTaskTreeRunList.length > 0 && (
            <div className="space-y-2">
              {actionTaskTreeRunList.length > 1 && (
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>Action run</span>
                  <select value={selectedActionTaskTreeRun?.runId || ''} onChange={(e) => setSelectedActionTaskTreeRunId(String(e.target.value))} className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200">
                    {actionTaskTreeRunList.map((run: any) => (
                      <option key={run.runId} value={run.runId}>{run.runId.slice(-6)} {String(run.status || '').toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              )}
              {selectedActionTaskTreeRun && renderTaskTreeRun(selectedActionTaskTreeRun, 'Action Task Tree')}
            </div>
          )}

          {taskTruthRunId && (
            <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-gray-400">
                <span>Truth Replay (Run {taskTruthRunId.slice(-6)})</span>
                <div className="flex items-center gap-2">
                  {taskTruthUpdatedAtMs && <span className="text-[10px] text-gray-500">Updated {formatRunTime(taskTruthUpdatedAtMs)}</span>}
                  <button type="button" onClick={() => setTaskTruthRunId('')} className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200">Clear</button>
                </div>
              </div>
              {taskTruthError && <div className="text-[10px] text-red-300">{taskTruthError}</div>}
              {filteredTaskTruthEvents.length > 0 ? (
                <div className="space-y-2">
                  {filteredTaskTruthEvents.map((event: any, idx: number) => {
                    const eventType = String(event?.eventType || event?.kind || 'event');
                    const label = eventType.replace(/_/g, ' ');
                    const detail = event?.payload?.error || event?.payload?.reason || event?.payload?.note || event?.payload?.status || null;
                    const ts = Number(event?.createdAtMs || event?.updatedAtMs || 0);
                    return (
                      <div key={event?.id || `${eventType}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                        <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${truthLevelBadge(event?.level)}`}>{String(event?.level || 'info').toUpperCase()}</div>
                        <div className="flex-1">
                          <div className="text-gray-200">{label}{Number.isFinite(ts) && ts > 0 && <span className="ml-2 text-gray-500">{formatRunTime(ts)}</span>}</div>
                          {detail && <div className="text-gray-500">{String(detail)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500">No truth events for this run.</div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default React.memo(TimelineTruthPanel);
