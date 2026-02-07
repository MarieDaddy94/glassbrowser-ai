import { getCacheBudgetManager } from './cacheBudgetManager';

export type TaskTreeStep =
  | 'observe'
  | 'evaluate'
  | 'decide'
  | 'verify'
  | 'execute'
  | 'monitor'
  | 'review';

export type TaskTreeStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';

export type TaskTreeStepResult = {
  ok: boolean;
  skip?: boolean;
  error?: string;
  note?: string;
  data?: Record<string, any>;
  code?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  blocked?: boolean;
};

export type TaskTreeStepState = {
  step: TaskTreeStep;
  status: TaskTreeStatus;
  startedAtMs?: number | null;
  finishedAtMs?: number | null;
  attempts?: number | null;
  retryCount?: number | null;
  error?: string | null;
  note?: string | null;
  code?: string | null;
  data?: Record<string, any> | null;
};

export type TaskTreeContext = {
  runId: string;
  createdAtMs: number;
  source: string;
  correlationId?: string;
  symbol?: string;
  timeframe?: string;
  strategy?: string;
  watcherId?: string;
  mode?: string;
  signal?: any;
  watcher?: any;
  data: Record<string, any>;
};

export type TaskTreeHandlers = Partial<Record<TaskTreeStep, (ctx: TaskTreeContext) => TaskTreeStepResult | Promise<TaskTreeStepResult>>>;

export type TaskTreeAuditEvent = {
  eventType: string;
  runId: string;
  step?: TaskTreeStep;
  status?: string;
  error?: string;
  note?: string;
  correlationId?: string;
  payload?: Record<string, any>;
  level?: 'info' | 'warn' | 'error';
};

export type TaskTreeRunSummary = {
  runId: string;
  status: TaskTreeStatus;
  createdAtMs: number;
  finishedAtMs: number;
  steps: Array<{
    step: TaskTreeStep;
    status: TaskTreeStatus;
    startedAtMs: number;
    finishedAtMs: number;
    attempts?: number;
    retryCount?: number;
    error?: string;
    note?: string;
  }>;
  context: {
    source: string;
    correlationId?: string;
    symbol?: string;
    timeframe?: string;
    strategy?: string;
    watcherId?: string;
    mode?: string;
  };
};

export type TaskTreeStateSnapshot = {
  updatedAtMs: number;
  processing: boolean;
  queueDepth: number;
  queue: Array<{
    runId: string;
    status: TaskTreeStatus;
    enqueuedAtMs: number;
    dedupeKey?: string;
    context: TaskTreeContext;
  }>;
  current: {
    runId: string;
    status: TaskTreeStatus;
    step?: TaskTreeStep | null;
    stepStartedAtMs?: number | null;
    context: TaskTreeContext;
    lastStep?: TaskTreeStepState | null;
  } | null;
};

type TaskTreeJob = {
  runId: string;
  dedupeKey?: string;
  context: TaskTreeContext;
  status: TaskTreeStatus;
  enqueuedAtMs: number;
};

type TaskTreeOptions = {
  steps?: TaskTreeStep[];
  dedupeWindowMs?: number;
  maxQueue?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  getTimeoutMs?: (input: { step: TaskTreeStep; ctx: TaskTreeContext; attempt: number }) => number | null;
  shouldRetry?: (input: {
    step: TaskTreeStep;
    ctx: TaskTreeContext;
    result: TaskTreeStepResult | null;
    attempt: number;
    retryCount: number;
    maxRetries: number;
  }) => { retry: boolean; retryAfterMs?: number | null; note?: string | null };
  dependencyCodes?: string[];
  onAudit?: (event: TaskTreeAuditEvent) => void | Promise<void>;
  onPersist?: (summary: TaskTreeRunSummary) => void | Promise<void>;
  onState?: (snapshot: TaskTreeStateSnapshot) => void | Promise<void>;
};

const DEFAULT_STEPS: TaskTreeStep[] = [
  'observe',
  'evaluate',
  'decide',
  'verify',
  'execute',
  'monitor',
  'review'
];
const TASK_TREE_QUEUE_BUDGET_NAME = 'taskTree.queue';

export class TaskTreeOrchestrator {
  private handlers: TaskTreeHandlers = {};
  private readonly steps: TaskTreeStep[];
  private readonly dedupeWindowMs: number;
  private readonly maxQueue: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly getTimeoutMs?: TaskTreeOptions['getTimeoutMs'];
  private readonly shouldRetry?: TaskTreeOptions['shouldRetry'];
  private readonly dependencyCodes: Set<string>;
  private readonly onAudit?: TaskTreeOptions['onAudit'];
  private readonly onPersist?: TaskTreeOptions['onPersist'];
  private readonly onState?: TaskTreeOptions['onState'];
  private readonly queue: TaskTreeJob[] = [];
  private readonly queueBudgetMap = new Map<string, { createdAtMs: number }>();
  private readonly cacheBudgetManager = getCacheBudgetManager();
  private processing = false;
  private readonly dedupeMap = new Map<string, { runId: string; expiresAtMs: number; correlationId?: string }>();
  private currentJob: TaskTreeJob | null = null;
  private currentStep: TaskTreeStep | null = null;
  private currentStepStartedAtMs: number | null = null;
  private updatedAtMs = Date.now();

  constructor(options: TaskTreeOptions = {}) {
    this.steps = Array.isArray(options.steps) && options.steps.length > 0 ? options.steps : DEFAULT_STEPS;
    this.dedupeWindowMs = Number.isFinite(Number(options.dedupeWindowMs)) ? Number(options.dedupeWindowMs) : 60_000;
    this.maxQueue = Number.isFinite(Number(options.maxQueue)) ? Number(options.maxQueue) : 200;
    this.maxRetries = Number.isFinite(Number(options.maxRetries)) ? Math.max(0, Math.floor(Number(options.maxRetries))) : 0;
    this.retryDelayMs = Number.isFinite(Number(options.retryDelayMs)) ? Math.max(0, Math.floor(Number(options.retryDelayMs))) : 1000;
    this.getTimeoutMs = options.getTimeoutMs;
    this.shouldRetry = options.shouldRetry;
    this.dependencyCodes = new Set(
      Array.isArray(options.dependencyCodes) && options.dependencyCodes.length > 0
        ? options.dependencyCodes.map((code) => String(code))
        : [
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
            'confirmation_required'
          ]
    );
    this.onAudit = options.onAudit;
    this.onPersist = options.onPersist;
    this.onState = options.onState;
    this.cacheBudgetManager.register({
      name: TASK_TREE_QUEUE_BUDGET_NAME,
      maxEntries: this.maxQueue,
      maxAgeMs: this.dedupeWindowMs * 4
    });
  }

  public setHandlers(handlers: TaskTreeHandlers) {
    this.handlers = handlers || {};
  }

  public getSteps() {
    return [...this.steps];
  }

  public getSnapshot(): TaskTreeStateSnapshot {
    const queue = this.queue.map((job) => ({
      runId: job.runId,
      status: job.status,
      enqueuedAtMs: job.enqueuedAtMs,
      dedupeKey: job.dedupeKey,
      context: job.context
    }));
    const taskState = this.currentJob?.context?.data?._taskTree;
    const lastStep = taskState && typeof taskState === 'object' ? taskState.last || null : null;
    const current = this.currentJob
      ? {
          runId: this.currentJob.runId,
          status: this.currentJob.status,
          step: this.currentStep,
          stepStartedAtMs: this.currentStepStartedAtMs,
          context: this.currentJob.context,
          lastStep: lastStep || null
        }
      : null;
    return {
      updatedAtMs: this.updatedAtMs,
      processing: this.processing,
      queueDepth: queue.length,
      queue,
      current
    };
  }

  public enqueue(input: {
    source: string;
    correlationId?: string;
    symbol?: string;
    timeframe?: string;
    strategy?: string;
    watcherId?: string;
    mode?: string;
    signal?: any;
    watcher?: any;
    dedupeKey?: string;
    runId?: string;
    data?: Record<string, any>;
  }) {
    const now = Date.now();
    this.pruneDedupe(now);
    const dedupeKey = input.dedupeKey ? String(input.dedupeKey) : undefined;
    if (dedupeKey) {
      const hit = this.dedupeMap.get(dedupeKey);
      if (hit && hit.expiresAtMs > now) {
        this.emitAudit({
          eventType: 'task_tree_deduped',
          runId: hit.runId,
          status: 'skipped',
          note: 'dedupe_window',
          correlationId: hit.correlationId
        });
        return { runId: hit.runId, queued: false };
      }
    }

    const runId = input.runId ? String(input.runId) : `run_${now}_${Math.random().toString(16).slice(2, 8)}`;
    const context: TaskTreeContext = {
      runId,
      createdAtMs: now,
      source: String(input.source || 'unknown'),
      correlationId: input.correlationId ? String(input.correlationId) : undefined,
      symbol: input.symbol,
      timeframe: input.timeframe,
      strategy: input.strategy,
      watcherId: input.watcherId,
      mode: input.mode,
      signal: input.signal,
      watcher: input.watcher,
      data: { ...(input.data || {}) }
    };
    const job: TaskTreeJob = {
      runId,
      dedupeKey,
      context,
      status: 'queued',
      enqueuedAtMs: now
    };

    if (dedupeKey) {
      this.dedupeMap.set(dedupeKey, {
        runId,
        expiresAtMs: now + this.dedupeWindowMs,
        correlationId: context.correlationId
      });
    }

    this.queue.push(job);
    this.queueBudgetMap.set(job.runId, { createdAtMs: now });
    this.cacheBudgetManager.noteSet(TASK_TREE_QUEUE_BUDGET_NAME, job.runId);
    if (this.queue.length > this.maxQueue) {
      const overflow = this.queue.length - this.maxQueue;
      for (let i = 0; i < overflow; i += 1) {
        const removed = this.queue.shift();
        if (!removed) continue;
        this.queueBudgetMap.delete(removed.runId);
      }
      this.cacheBudgetManager.noteEviction(TASK_TREE_QUEUE_BUDGET_NAME, overflow, 'lru');
      this.emitAudit({
        eventType: 'task_tree_queue_trim',
        runId,
        status: 'queued',
        note: `max_queue_${this.maxQueue}`
      });
    }
    this.cacheBudgetManager.apply(TASK_TREE_QUEUE_BUDGET_NAME, this.queueBudgetMap, (entry) => Number(entry?.createdAtMs || 0) || null);
    if (this.queueBudgetMap.size < this.queue.length) {
      const allowed = new Set(this.queueBudgetMap.keys());
      const retained = this.queue.filter((entry) => allowed.has(entry.runId));
      const removed = this.queue.length - retained.length;
      if (removed > 0) {
        this.cacheBudgetManager.noteEviction(TASK_TREE_QUEUE_BUDGET_NAME, removed, 'ttl');
      }
      this.queue.length = 0;
      this.queue.push(...retained);
    }
    this.cacheBudgetManager.setSize(TASK_TREE_QUEUE_BUDGET_NAME, this.queueBudgetMap.size);

    this.emitAudit({
      eventType: 'task_tree_queued',
      runId,
      status: 'queued',
      payload: {
        source: context.source,
        correlationId: context.correlationId,
        symbol: context.symbol,
        timeframe: context.timeframe,
        strategy: context.strategy,
        watcherId: context.watcherId,
        mode: context.mode
      }
    });

    this.schedule();
    this.markUpdated();
    this.emitState();
    return { runId, queued: true };
  }

  private schedule() {
    if (this.processing) return;
    this.processing = true;
    this.markUpdated();
    this.emitState();
    setTimeout(() => void this.processQueue(), 0);
  }

  private async processQueue() {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;
      this.queueBudgetMap.delete(job.runId);
      this.cacheBudgetManager.noteGet(TASK_TREE_QUEUE_BUDGET_NAME, job.runId, true);
      this.cacheBudgetManager.setSize(TASK_TREE_QUEUE_BUDGET_NAME, this.queueBudgetMap.size);
      await this.runJob(job);
    }
    this.processing = false;
    this.currentJob = null;
    this.currentStep = null;
    this.currentStepStartedAtMs = null;
    this.markUpdated();
    this.emitState();
  }

  private async runJob(job: TaskTreeJob) {
    const runId = job.runId;
    job.status = 'running';
    const stepResults: TaskTreeRunSummary['steps'] = [];
    let failed = false;
    let skipped = false;
    let blocked = false;
    const taskState = this.ensureTaskState(job.context);
    const resumeMeta =
      taskState && typeof taskState.resume === 'object' && taskState.resume
        ? taskState.resume
        : null;
    const resumeFromIndex = Number.isFinite(Number(resumeMeta?.fromStepIndex))
      ? Math.max(0, Math.floor(Number(resumeMeta.fromStepIndex)))
      : null;
    const shouldResume = !!resumeMeta;
    let startIndex = 0;
    if (shouldResume && Number.isFinite(Number(resumeFromIndex))) {
      startIndex = Number(resumeFromIndex);
    } else if (shouldResume && taskState && typeof taskState.steps === 'object') {
      const nextIdx = this.steps.findIndex((step) => {
        const prev = taskState.steps?.[step];
        return !prev || (prev.status !== 'completed' && prev.status !== 'skipped');
      });
      if (nextIdx >= 0) startIndex = nextIdx;
    }

    this.currentJob = job;
    this.currentStep = null;
    this.currentStepStartedAtMs = null;
    this.markUpdated();
    this.emitState();

    for (let index = 0; index < this.steps.length; index += 1) {
      const step = this.steps[index];
      const handler = this.handlers?.[step];
      const startedAtMs = Date.now();
      const prevStep = taskState?.steps?.[step];
      if (shouldResume && index < startIndex) {
        const finishedAtMs = Number(prevStep?.finishedAtMs) || startedAtMs;
        stepResults.push({
          step,
          status: prevStep?.status || 'skipped',
          startedAtMs: Number(prevStep?.startedAtMs) || startedAtMs,
          finishedAtMs,
          attempts: prevStep?.attempts,
          retryCount: prevStep?.retryCount,
          error: prevStep?.error || undefined,
          note: prevStep?.note || 'resume_skip'
        });
        continue;
      }
      if (!handler) {
        const finishedAtMs = Date.now();
        stepResults.push({
          step,
          status: 'skipped',
          startedAtMs,
          finishedAtMs,
          note: 'no_handler'
        });
        continue;
      }

      let result: TaskTreeStepResult | null = null;
      let status: TaskTreeStatus = 'failed';
      let attempts = 0;
      let retryCount = 0;
      let finishedAtMs = startedAtMs;
      let dependencyBlocked = false;

      while (true) {
        attempts += 1;
        this.currentStep = step;
        this.currentStepStartedAtMs = startedAtMs;
        this.markUpdated();
        this.emitState();
        this.emitAudit({
          eventType: 'task_tree_step_start',
          runId,
          step,
          status: 'running',
          payload: { attempt: attempts }
        });

        try {
          const timeoutMs = this.getTimeoutMs ? this.getTimeoutMs({ step, ctx: job.context, attempt: attempts }) : null;
          result = await this.runWithTimeout(Promise.resolve(handler(job.context)), timeoutMs);
        } catch (err: any) {
          result = { ok: false, error: err?.message ? String(err.message) : 'Unhandled task error.' };
        }

        finishedAtMs = Date.now();
        dependencyBlocked = !!result?.code && typeof result.code === 'string' && this.dependencyCodes.has(result.code);
        const blockedStep = !!result?.blocked || dependencyBlocked;
        status = blockedStep
          ? 'blocked'
          : result?.skip
            ? 'skipped'
            : result?.ok
              ? 'completed'
              : 'failed';

        if (result?.data && typeof result.data === 'object') {
          job.context.data = { ...job.context.data, ...result.data };
        }

        const retryDecision = this.shouldRetry
          ? this.shouldRetry({ step, ctx: job.context, result, attempt: attempts, retryCount, maxRetries: this.maxRetries })
          : this.defaultRetryDecision(result, retryCount);

        if (status === 'failed' && retryDecision.retry && retryCount < this.maxRetries) {
          retryCount += 1;
          const delayMs = Number.isFinite(Number(retryDecision.retryAfterMs))
            ? Math.max(0, Math.floor(Number(retryDecision.retryAfterMs)))
            : this.retryDelayMs;
          this.emitAudit({
            eventType: 'task_tree_step_retry',
            runId,
            step,
            status: 'running',
            note: retryDecision.note || 'retry',
            payload: { attempt: attempts, retryCount, retryAfterMs: delayMs }
          });
          if (delayMs > 0) {
            await this.sleep(delayMs);
          }
          continue;
        }
        break;
      }

      stepResults.push({
        step,
        status,
        startedAtMs,
        finishedAtMs,
        attempts,
        retryCount,
        error: result?.error,
        note: result?.note || (dependencyBlocked && result?.code ? result.code : undefined)
      });

      taskState.steps[step] = {
        step,
        status,
        attempts,
        retryCount,
        startedAtMs,
        finishedAtMs,
        error: result?.error || null,
        note: result?.note || (dependencyBlocked && result?.code ? result.code : null),
        code: result?.code || null,
        data: result?.data ?? null
      };
      taskState.last = taskState.steps[step];
      job.context.data.steps = taskState.steps;
      job.context.data.prev = taskState.last;

      this.currentStep = null;
      this.currentStepStartedAtMs = null;
      this.markUpdated();
      this.emitState();
      this.emitAudit({
        eventType: 'task_tree_step_finish',
        runId,
        step,
        status,
        error: result?.error,
        note: result?.note,
        payload: { attempts, retryCount }
      });

      if (status === 'failed') {
        failed = true;
        break;
      }
      if (status === 'blocked') {
        blocked = true;
        break;
      }
      if (status === 'skipped' && result?.note === 'halt') {
        skipped = true;
        break;
      }
    }

    const finishedAtMs = Date.now();
    const finalStatus: TaskTreeStatus = failed ? 'failed' : blocked ? 'blocked' : skipped ? 'skipped' : 'completed';
    job.status = finalStatus;

    const summary: TaskTreeRunSummary = {
      runId,
      status: finalStatus,
      createdAtMs: job.context.createdAtMs,
      finishedAtMs,
      steps: stepResults,
      context: {
        source: job.context.source,
        correlationId: job.context.correlationId,
        symbol: job.context.symbol,
        timeframe: job.context.timeframe,
        strategy: job.context.strategy,
        watcherId: job.context.watcherId,
        mode: job.context.mode
      }
    };

    this.emitAudit({
      eventType: 'task_tree_complete',
      runId,
      status: finalStatus,
      payload: summary.context
    });

    if (this.onPersist) {
      try {
        await this.onPersist(summary);
      } catch {
        // ignore persistence failures
      }
    }
    this.markUpdated();
    this.emitState();
  }

  private ensureTaskState(ctx: TaskTreeContext) {
    const data = ctx.data && typeof ctx.data === 'object' ? ctx.data : {};
    const existing = data._taskTree && typeof data._taskTree === 'object' ? data._taskTree : null;
    if (existing && typeof existing.steps === 'object') {
      if (!('last' in existing)) existing.last = null;
      if (!('resume' in existing)) existing.resume = null;
      return existing;
    }
    const next = { steps: {} as Record<string, any>, last: null, resume: null };
    data._taskTree = next;
    data.steps = data.steps && typeof data.steps === 'object' ? data.steps : next.steps;
    if (!('prev' in data)) data.prev = null;
    ctx.data = data;
    return next;
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number | null) {
    if (!Number.isFinite(Number(timeoutMs)) || Number(timeoutMs) <= 0) {
      return promise;
    }
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const timed = new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({
            ok: false,
            error: 'Task step timed out.',
            code: 'timeout',
            retryable: true
          } as any);
        }, Math.max(1, Math.floor(Number(timeoutMs))));
      });
      return await Promise.race([promise, timed]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private defaultRetryDecision(result: TaskTreeStepResult | null, retryCount: number) {
    if (!result || result.ok || result.skip || result.blocked) return { retry: false, retryAfterMs: null, note: null };
    if (result.retryable) return { retry: true, retryAfterMs: result.retryAfterMs ?? null, note: result.code || null };
    if (Number.isFinite(Number(result.retryAfterMs))) {
      return { retry: true, retryAfterMs: Number(result.retryAfterMs), note: result.code || 'retry_after' };
    }
    return { retry: false, retryAfterMs: null, note: null };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private pruneDedupe(now: number) {
    for (const [key, entry] of this.dedupeMap.entries()) {
      if (entry.expiresAtMs <= now) this.dedupeMap.delete(key);
    }
  }

  private emitAudit(event: TaskTreeAuditEvent) {
    if (!this.onAudit) return;
    try {
      const correlationId = event.correlationId || this.currentJob?.context?.correlationId;
      let payload = event.payload;
      if (correlationId) {
        const base = payload && typeof payload === 'object' ? { ...payload } : payload ? { value: payload } : {};
        if (base.correlationId == null) base.correlationId = correlationId;
        payload = base;
      }
      const next = payload === event.payload && correlationId === event.correlationId
        ? event
        : { ...event, payload, correlationId };
      void this.onAudit(next);
    } catch {
      // ignore audit failures
    }
  }

  private markUpdated() {
    this.updatedAtMs = Date.now();
  }

  private emitState() {
    if (!this.onState) return;
    try {
      void this.onState(this.getSnapshot());
    } catch {
      // ignore state failures
    }
  }
}
