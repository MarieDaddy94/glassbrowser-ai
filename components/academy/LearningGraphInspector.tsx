import React, { useMemo } from 'react';
import type {
  AcademyCase,
  AcademyLesson,
  LearningCaseAction,
  LearningGraphInspectorView,
  LearningGraphNode,
  LearningGraphSnapshot
} from '../../types';

type LessonLifecycle = 'candidate' | 'core' | 'deprecated';

type Props = {
  graph: LearningGraphSnapshot;
  node: LearningGraphNode | null;
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  onApplyLesson?: (lessonId: string, targetAgentKey?: string | null) => Promise<any> | any;
  onSimulateLesson?: (lessonId: string) => Promise<any> | any;
  onPinLesson?: (lessonId: string, nextPinned: boolean) => Promise<any> | any;
  onSetLessonLifecycle?: (lessonId: string, next: LessonLifecycle) => Promise<any> | any;
  onDrilldownNode?: (node: LearningGraphNode) => void;
  onCaseAction?: (payload: LearningCaseAction, entry: AcademyCase) => Promise<any> | any;
  features?: {
    learningGraphV22Inspector?: boolean;
    learningGraphV22PathSummary?: boolean;
    learningGraphV22LifecycleActions?: boolean;
  } | null;
};

const formatPct = (value?: number | null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return `${Math.round(num * 100)}%`;
};

const formatNum = (value?: number | null, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return num.toFixed(digits);
};

const readLessonId = (node: LearningGraphNode | null) =>
  String(node?.meta?.lessonId || '').trim() || '';

const LearningGraphInspector: React.FC<Props> = ({
  graph,
  node,
  cases,
  lessons,
  onApplyLesson,
  onSimulateLesson,
  onPinLesson,
  onSetLessonLifecycle,
  onDrilldownNode,
  onCaseAction,
  features
}) => {
  const [view, setView] = React.useState<LearningGraphInspectorView>('overview');
  const [actionState, setActionState] = React.useState<{
    status: 'idle' | 'running' | 'success' | 'error';
    message: string;
    atMs?: number | null;
    sampleSize?: number | null;
  }>({
    status: 'idle',
    message: ''
  });
  const [reasoningCaseId, setReasoningCaseId] = React.useState<string>('');

  const evidenceCases = useMemo(() => {
    if (!node) return [] as AcademyCase[];
    const caseIdSet = new Set((node.evidenceCaseIds || []).map((entry) => String(entry)));
    if (caseIdSet.size === 0) return [];
    return (cases || [])
      .filter((entry) => caseIdSet.has(String(entry.id || entry.signalId || '')))
      .slice(0, 12);
  }, [cases, node]);

  const lesson = useMemo(() => {
    const lessonId = readLessonId(node);
    if (!lessonId) return null;
    return (lessons || []).find((entry) => String(entry.id) === lessonId) || null;
  }, [lessons, node]);

  const relatedConflicts = useMemo(() => {
    if (!node) return [];
    return (graph.edges || [])
      .filter((edge) => edge.type === 'conflicts' && (edge.source === node.id || edge.target === node.id))
      .slice(0, 8);
  }, [graph.edges, node]);

  const evidenceSupport = useMemo(
    () => evidenceCases.filter((entry) => String(entry.outcome || entry.status || '').toUpperCase() === 'WIN').slice(0, 8),
    [evidenceCases]
  );
  const evidenceContradictory = useMemo(
    () => evidenceCases.filter((entry) => String(entry.outcome || entry.status || '').toUpperCase() !== 'WIN').slice(0, 8),
    [evidenceCases]
  );
  const reasoningCase = useMemo(
    () => evidenceCases.find((entry) => String(entry.id) === String(reasoningCaseId || '')) || null,
    [evidenceCases, reasoningCaseId]
  );

  const invokeAction = async (
    label: string,
    run: () => Promise<any> | any,
    opts?: { sampleSize?: number | null }
  ) => {
    setActionState({
      status: 'running',
      message: `${label}...`
    });
    try {
      const result = await Promise.resolve(run());
      const sampleSize = Number.isFinite(Number(result?.sampleSize))
        ? Number(result.sampleSize)
        : Number.isFinite(Number(opts?.sampleSize))
          ? Number(opts?.sampleSize)
          : null;
      setActionState({
        status: 'success',
        message: result?.message ? String(result.message) : `${label} completed.`,
        atMs: Date.now(),
        sampleSize
      });
      return result;
    } catch (err: any) {
      setActionState({
        status: 'error',
        message: err?.message ? String(err.message) : `${label} failed.`,
        atMs: Date.now()
      });
      return null;
    }
  };

  if (!node) {
    return (
      <div className="h-full min-h-0 rounded border border-white/10 bg-black/25 p-3 text-[11px] text-gray-500">
        Select a node to inspect evidence, impact, and actions.
      </div>
    );
  }

  const canUseV22Inspector = features?.learningGraphV22Inspector !== false;
  const canUseLifecycleActions = features?.learningGraphV22LifecycleActions !== false;

  return (
    <div className="h-full min-h-0 rounded border border-white/10 bg-black/25 p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">
            Inspector • {String(node.type || 'node').toUpperCase()}
          </div>
          <div className="text-sm font-semibold text-white">{node.label}</div>
        </div>
        {onDrilldownNode ? (
          <button
            type="button"
            onClick={() => onDrilldownNode(node)}
            className="px-2 py-1 rounded border border-white/10 text-[10px] text-gray-300 hover:text-white"
          >
            Drill to Cases
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
        <div className="rounded border border-white/10 bg-black/30 p-2">
          Sample: {node.sampleSize ?? '--'}
        </div>
        <div className="rounded border border-white/10 bg-black/30 p-2">
          Confidence: {formatPct(node.confidence)}
        </div>
        <div className="rounded border border-white/10 bg-black/30 p-2">
          Impact: {formatNum(node.impactScore, 3)}
        </div>
        <div className="rounded border border-white/10 bg-black/30 p-2">
          Hot: {node.hot ? 'YES' : 'NO'}
        </div>
      </div>

      {canUseV22Inspector ? (
        <div className="flex items-center gap-2 text-[10px]">
          {(['overview', 'evidence', 'actions'] as LearningGraphInspectorView[]).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setView(entry)}
              className={`px-2 py-1 rounded border ${
                view === entry
                  ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
                  : 'border-white/10 text-gray-300 hover:text-white'
              }`}
            >
              {entry.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}

      {(view === 'overview' || !canUseV22Inspector) && node.type === 'symbol' ? (
        <div className="rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300 space-y-1">
          <div>W/L: {node.meta?.wins ?? 0}/{node.meta?.losses ?? 0}</div>
          <div>Win rate: {formatPct(node.meta?.winRate)}</div>
          <div>Net R: {formatNum(node.meta?.netR, 2)}</div>
          <div>Recency: {formatNum(node.meta?.recencyScore, 2)}</div>
        </div>
      ) : null}

      {(view === 'overview' || !canUseV22Inspector) && node.type === 'pattern' ? (
        <div className="rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300 space-y-1">
          <div>Trades: {node.meta?.tradeCount ?? 0}</div>
          <div>Win rate: {formatPct(node.meta?.winRate)}</div>
          <div>Net R: {formatNum(node.meta?.netR, 2)}</div>
          <div>Timeframe-weighted support: {formatNum(node.meta?.timeframeWeightedSupport, 2)}</div>
        </div>
      ) : null}

      {(view === 'overview' || !canUseV22Inspector) && node.type === 'lesson' && lesson ? (
        <div className="rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300 space-y-2">
          <div className="text-gray-200">{lesson.summary || lesson.recommendedAction || 'Lesson details unavailable.'}</div>
          <div>Lifecycle: {lesson.lifecycleState || 'candidate'}</div>
          <div>Pinned: {lesson.pinned ? 'YES' : 'NO'}</div>
          <div>Evidence: {Array.isArray(lesson.evidenceCaseIds) ? lesson.evidenceCaseIds.length : 0}</div>
          {canUseLifecycleActions ? (
            <div className="flex flex-wrap gap-1">
              {onApplyLesson ? (
                <button
                  type="button"
                  onClick={() => {
                    void invokeAction('Apply lesson', () => onApplyLesson(lesson.id, node.agentKey || null));
                  }}
                  className="px-2 py-1 rounded border border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/10"
                >
                  Apply
                </button>
              ) : null}
              {onSimulateLesson ? (
                <button
                  type="button"
                  onClick={() => {
                    void invokeAction('Simulate lesson', () => onSimulateLesson(lesson.id));
                  }}
                  className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white"
                >
                  Simulate
                </button>
              ) : null}
              {onPinLesson ? (
                <button
                  type="button"
                  onClick={() => {
                    void invokeAction(lesson.pinned ? 'Unpin lesson' : 'Pin lesson', () => onPinLesson(lesson.id, !lesson.pinned));
                  }}
                  className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white"
                >
                  {lesson.pinned ? 'Unpin' : 'Pin'}
                </button>
              ) : null}
              {onSetLessonLifecycle ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void invokeAction('Promote lesson', () => onSetLessonLifecycle(lesson.id, 'core'));
                    }}
                    className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/10"
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void invokeAction('Set candidate', () => onSetLessonLifecycle(lesson.id, 'candidate'));
                    }}
                    className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white"
                  >
                    Candidate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void invokeAction('Deprecate lesson', () => onSetLessonLifecycle(lesson.id, 'deprecated'));
                    }}
                    className="px-2 py-1 rounded border border-rose-400/60 text-rose-100 hover:bg-rose-500/10"
                  >
                    Deprecate
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {canUseV22Inspector && view === 'evidence' ? (
        <div className="rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300 space-y-3">
          <div>
            <div className="uppercase tracking-wider text-[10px] text-emerald-300 mb-1">Supporting Cases</div>
            {evidenceSupport.length === 0 ? (
              <div className="text-gray-500">No supporting cases.</div>
            ) : (
              <div className="space-y-1">
                {evidenceSupport.map((entry) => (
                  <div key={`support:${entry.id}`} className="rounded border border-white/10 px-2 py-1">
                    <div className="text-gray-100">{entry.action} {entry.symbol} {entry.timeframe || ''}</div>
                    <div className="text-gray-500 text-[10px]">{entry.outcome || entry.status || 'PROPOSED'}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onCaseAction?.({ caseId: String(entry.id), action: 'open_chart' }, entry);
                        }}
                        className="px-1.5 py-0.5 rounded border border-cyan-400/40 text-cyan-100"
                      >
                        Open Chart
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onCaseAction?.({ caseId: String(entry.id), action: 'replay_case' }, entry);
                        }}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-300"
                      >
                        Replay
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReasoningCaseId(String(entry.id));
                          onCaseAction?.({ caseId: String(entry.id), action: 'show_reasoning' }, entry);
                        }}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-300"
                      >
                        Reasoning
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-[10px] text-rose-300 mb-1">Contradictory Cases</div>
            {evidenceContradictory.length === 0 ? (
              <div className="text-gray-500">No contradictory cases.</div>
            ) : (
              <div className="space-y-1">
                {evidenceContradictory.map((entry) => (
                  <div key={`contradict:${entry.id}`} className="rounded border border-white/10 px-2 py-1">
                    <div className="text-gray-100">{entry.action} {entry.symbol} {entry.timeframe || ''}</div>
                    <div className="text-gray-500 text-[10px]">{entry.outcome || entry.status || 'PROPOSED'}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onCaseAction?.({ caseId: String(entry.id), action: 'open_chart' }, entry);
                        }}
                        className="px-1.5 py-0.5 rounded border border-cyan-400/40 text-cyan-100"
                      >
                        Open Chart
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onCaseAction?.({ caseId: String(entry.id), action: 'replay_case' }, entry);
                        }}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-300"
                      >
                        Replay
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReasoningCaseId(String(entry.id));
                          onCaseAction?.({ caseId: String(entry.id), action: 'show_reasoning' }, entry);
                        }}
                        className="px-1.5 py-0.5 rounded border border-white/10 text-gray-300"
                      >
                        Reasoning
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {reasoningCase ? (
            <div className="rounded border border-white/10 bg-black/40 p-2 text-[11px] text-gray-300">
              <div className="uppercase tracking-wider text-[10px] text-gray-400 mb-1">Reasoning</div>
              <div className="text-gray-200 whitespace-pre-wrap">
                {String(reasoningCase.analysis?.report || reasoningCase.analysis?.summary || reasoningCase.reason || 'No reasoning available.')}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {canUseV22Inspector && view === 'actions' ? (
        <div className="rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300 space-y-2">
          {node.type === 'lesson' && lesson ? (
            <div className="flex flex-wrap gap-1">
              {onApplyLesson ? (
                <button
                  type="button"
                  onClick={() => {
                    void invokeAction('Apply lesson', () => onApplyLesson(lesson.id, node.agentKey || null));
                  }}
                  className="px-2 py-1 rounded border border-cyan-400/60 text-cyan-100 hover:bg-cyan-500/10"
                >
                  Apply
                </button>
              ) : null}
              {onSimulateLesson ? (
                <button
                  type="button"
                  onClick={() => {
                    void invokeAction('Simulate lesson', () => onSimulateLesson(lesson.id));
                  }}
                  className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white"
                >
                  Simulate
                </button>
              ) : null}
              {onSetLessonLifecycle ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void invokeAction('Promote lesson', () => onSetLessonLifecycle(lesson.id, 'core'));
                    }}
                    className="px-2 py-1 rounded border border-emerald-400/60 text-emerald-100 hover:bg-emerald-500/10"
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void invokeAction('Set candidate', () => onSetLessonLifecycle(lesson.id, 'candidate'));
                    }}
                    className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white"
                  >
                    Candidate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void invokeAction('Deprecate lesson', () => onSetLessonLifecycle(lesson.id, 'deprecated'));
                    }}
                    className="px-2 py-1 rounded border border-rose-400/60 text-rose-100 hover:bg-rose-500/10"
                  >
                    Deprecate
                  </button>
                </>
              ) : null}
              {onPinLesson ? (
                <button
                  type="button"
                  onClick={() => {
                    void invokeAction(lesson.pinned ? 'Unpin lesson' : 'Pin lesson', () => onPinLesson(lesson.id, !lesson.pinned));
                  }}
                  className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white"
                >
                  {lesson.pinned ? 'Unpin' : 'Pin'}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="text-gray-500">Select a lesson node to run lifecycle actions.</div>
          )}
          <div className={`rounded border px-2 py-1 ${
            actionState.status === 'error'
              ? 'border-rose-400/40 bg-rose-500/10 text-rose-200'
              : actionState.status === 'success'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                : actionState.status === 'running'
                  ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/10 bg-black/40 text-gray-400'
          }`}>
            <div>Status: {actionState.status.toUpperCase()}</div>
            <div>{actionState.message || 'No action yet.'}</div>
            {actionState.atMs ? <div>Updated: {new Date(actionState.atMs).toLocaleTimeString()}</div> : null}
            {actionState.sampleSize != null ? <div>Sample: {actionState.sampleSize}</div> : null}
          </div>
        </div>
      ) : null}

      {relatedConflicts.length > 0 ? (
        <div className="rounded border border-rose-400/30 bg-rose-500/10 p-2 text-[11px] text-rose-100 space-y-1">
          <div className="uppercase tracking-wider text-[10px] text-rose-200">Conflict Links</div>
          {relatedConflicts.map((edge) => (
            <div key={String(edge.id)}>
              {edge.source} ↔ {edge.target} ({formatNum(edge.confidence, 2)})
            </div>
          ))}
        </div>
      ) : null}

      {!canUseV22Inspector ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded border border-white/10 bg-black/30 p-2 text-[11px] text-gray-300 space-y-1">
          <div className="uppercase tracking-wider text-[10px] text-gray-400">Evidence Cases</div>
          {evidenceCases.length === 0 ? (
            <div className="text-gray-500">No evidence cases attached to this node.</div>
          ) : (
            evidenceCases.map((entry) => (
              <div key={entry.id} className="border border-white/10 rounded px-2 py-1">
                <div className="text-gray-100">{entry.action} {entry.symbol} {entry.timeframe || ''}</div>
                <div className="text-gray-500">
                  {entry.outcome || entry.status || 'PROPOSED'} • score {Number.isFinite(Number(entry.score)) ? Number(entry.score).toFixed(2) : '--'}R
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};

export default LearningGraphInspector;
