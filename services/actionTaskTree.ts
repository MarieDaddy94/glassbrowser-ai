import { TaskTreeOrchestrator, TaskTreeRunSummary, TaskTreeStateSnapshot } from './taskTreeService';

type ActionTaskTreeDeps = {
  executeCatalogAction: (input: {
    actionId: string;
    payload?: Record<string, any> | null;
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    mode?: string | null;
    source?: string | null;
  }) => Promise<any>;
  appendAuditEvent: (event: {
    eventType: string;
    level?: 'info' | 'warn' | 'error';
    symbol?: string | null;
    runId?: string | null;
    correlationId?: string | null;
    payload?: Record<string, any> | null;
  }) => void;
  persistState: (snapshot: TaskTreeStateSnapshot, opts?: { immediate?: boolean }) => void;
  recordTaskTreeRun: (summary: TaskTreeRunSummary) => void;
  recordActionTrace: (input: any, result: any) => void;
  sanitizeActionTraceValue: (payload: Record<string, any>) => any;
  setQueueDepth: (depth: number) => void;
  touchUpdatedAt?: () => void;
  setLastSummary?: (summary: TaskTreeRunSummary) => void;
  actionTaskActiveStepRef?: { current: any };
};

export const createActionTaskTree = (deps: ActionTaskTreeDeps) => {
  const orchestrator = new TaskTreeOrchestrator({
    steps: ['execute'],
    dedupeWindowMs: 30_000,
    maxQueue: 200,
    maxRetries: 2,
    retryDelayMs: 1200,
    getTimeoutMs: ({ ctx }) => {
      const raw = ctx?.data?.timeoutMs;
      if (Number.isFinite(Number(raw))) return Math.max(0, Math.floor(Number(raw)));
      const def = ctx?.data?.definition?.defaultTimeoutMs;
      if (Number.isFinite(Number(def))) return Math.max(0, Math.floor(Number(def)));
      return null;
    },
    onState: (snapshot) => {
      deps.touchUpdatedAt?.();
      deps.persistState(snapshot);
      deps.setQueueDepth(snapshot.queueDepth);
    },
    onAudit: (event) => {
      deps.touchUpdatedAt?.();
      void deps.appendAuditEvent({
        eventType: event.eventType,
        runId: event.runId || null,
        level: event.level || 'info',
        correlationId: event.correlationId || event.payload?.correlationId || null,
        symbol: event.payload?.symbol || null,
        payload: {
          step: event.step || null,
          status: event.status || null,
          note: event.note || null,
          error: event.error || null,
          ...(event.payload || {})
        }
      });
    },
    onPersist: (summary) => {
      deps.touchUpdatedAt?.();
      deps.setLastSummary?.(summary);
      void deps.appendAuditEvent({
        eventType: 'task_tree_persist',
        runId: summary.runId || null,
        symbol: summary.context?.symbol || null,
        correlationId: summary.context?.correlationId || null,
        payload: summary as any
      });
      deps.recordTaskTreeRun(summary);
      const snapshot = orchestrator.getSnapshot();
      deps.persistState(snapshot, { immediate: true });
    }
  });

  orchestrator.setHandlers({
    execute: async (ctx) => {
      const actionId = String(ctx.data?.actionId || '').trim();
      if (!actionId) return { ok: false, error: 'Missing actionId.' };
      const payload = ctx.data?.payload && typeof ctx.data.payload === 'object' ? ctx.data.payload : {};
      const timeoutMs = Number.isFinite(Number(ctx.data?.timeoutMs))
        ? Math.max(0, Math.floor(Number(ctx.data?.timeoutMs)))
        : Number.isFinite(Number(ctx.data?.definition?.defaultTimeoutMs))
          ? Math.max(0, Math.floor(Number(ctx.data?.definition?.defaultTimeoutMs)))
          : null;
      if (deps.actionTaskActiveStepRef) {
        deps.actionTaskActiveStepRef.current = {
          runId: ctx.runId,
          actionId,
          maxRetries: 2,
          retryDelayMs: 1200,
          timeoutMs
        };
      }
      let result: any;
      try {
        const startedAtMs = Date.now();
        result = await deps.executeCatalogAction({
          actionId,
          payload,
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          strategy: ctx.strategy,
          mode: ctx.mode,
          source: ctx.source
        });
        const auditEventType = ctx.data?.definition?.auditEventType;
        if (auditEventType) {
          void deps.appendAuditEvent({
            eventType: auditEventType,
            level: result?.ok ? 'info' : 'warn',
            symbol: ctx.symbol ?? payload.symbol ?? null,
            runId: ctx.runId || null,
            correlationId: ctx.correlationId || null,
            payload: {
              actionId,
              ok: !!result?.ok,
              error: result?.ok ? null : (result?.error || null),
              source: ctx.source || null,
              actionPayload: deps.sanitizeActionTraceValue(payload)
            }
          });
        }
        void deps.recordActionTrace({
          actionId,
          payload,
          source: ctx.source,
          symbol: ctx.symbol,
          timeframe: ctx.timeframe,
          strategy: ctx.strategy,
          messageId: payload?.messageId || null,
          correlationId: ctx.correlationId || null,
          runId: ctx.runId,
          kind: 'action',
          startedAtMs
        }, {
          ok: !!result?.ok,
          error: result?.error || null,
          code: result?.code || null,
          data: result?.data ?? null
        });
      } finally {
        if (deps.actionTaskActiveStepRef) {
          deps.actionTaskActiveStepRef.current = null;
        }
      }
      if (!result.ok) {
        const code = result.code ? String(result.code) : null;
        const retryableCodes = new Set(['rate_limited', 'timeout', 'network']);
        const blockedCodes = new Set([
          'confirmation_required',
          'broker_not_connected',
          'broker_trading_disabled',
          'autopilot_disabled',
          'autopilot_killswitch',
          'backtester_unavailable',
          'chart_unavailable',
          'agent_not_found',
          'agent_tools_denied',
          'agent_broker_denied',
          'risk_exceeds_cap',
          'risk_requires_confirmation'
        ]);
        const retryable = !!result.retryAfterMs || (code ? retryableCodes.has(code) : false);
        const blocked = code ? blockedCodes.has(code) : false;
        return {
          ok: false,
          error: result.error || 'Action failed.',
          code: code || undefined,
          retryable,
          retryAfterMs: result.retryAfterMs ?? null,
          blocked
        };
      }
      return { ok: true, data: { actionResult: result.data ?? null } };
    }
  });

  return orchestrator;
};
