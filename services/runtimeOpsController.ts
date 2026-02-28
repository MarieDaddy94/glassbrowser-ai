import type {
  AgentToolAction,
  HealthSnapshot,
  RuntimeOpsActionRecord,
  RuntimeOpsControllerState,
  RuntimeOpsDecision,
  RuntimeOpsEvent,
  RuntimeOpsGuardrailState,
  RuntimeOpsMode,
  RuntimeOpsPolicy
} from '../types';
import { evaluateRuntimeOpsGuardrails, isRuntimeOpsLiveAction } from './runtimeOpsGuardrails';
import { selectRuntimeOpsAction, type RuntimeOpsActionPlan } from './runtimeOpsActionSelector';
import { DEFAULT_RUNTIME_EVENT_BUFFER_LIMIT, pushRuntimeOpsEvent } from './runtimeOpsEventStream';

const DEFAULT_GUARDRAIL: RuntimeOpsGuardrailState = {
  pass: true,
  blockedReasons: [],
  canRunLive: true,
  cooldownUntilMs: null,
  failureStreak: 0,
  actionsLastMinute: 0,
  domainActionsLastMinute: null,
  duplicateBlocked: false
};

export type RuntimeOpsControllerDeps = {
  getHealthSnapshot: () => HealthSnapshot | null;
  runActionCatalog: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any>;
  executeAgentToolRequest?: (action: AgentToolAction) => Promise<any>;
  appendAuditEvent?: (event: {
    eventType: string;
    level?: 'info' | 'warn' | 'error';
    payload?: Record<string, any> | null;
  }) => Promise<any> | any;
  persistEvent?: (kind: 'runtime_ops_event' | 'runtime_ops_action' | 'runtime_ops_guardrail' | 'runtime_ops_decision', payload: Record<string, any>) => Promise<any> | any;
  onStateChange?: (state: RuntimeOpsControllerState) => void;
  now?: () => number;
};

const trimList = <T>(list: T[], max = 80): T[] => {
  if (list.length <= max) return list;
  return list.slice(list.length - max);
};

const domainFromAction = (actionId: string) => {
  const idx = String(actionId || '').indexOf('.');
  return idx > 0 ? String(actionId).slice(0, idx) : 'system';
};

export class RuntimeOpsController {
  private deps: RuntimeOpsControllerDeps;

  private policy: RuntimeOpsPolicy;

  private state: RuntimeOpsControllerState;

  private eventQueue: RuntimeOpsEvent[] = [];

  private running = false;

  private timer: any = null;

  private dedupeByActionKey = new Map<string, number>();

  constructor(input: {
    deps: RuntimeOpsControllerDeps;
    policy: RuntimeOpsPolicy;
    initialMode?: RuntimeOpsMode;
    armed?: boolean;
  }) {
    this.deps = input.deps;
    this.policy = input.policy;
    const initialMode = input.initialMode || (input.policy.alwaysArmed ? 'autonomous' : 'observe_only');
    this.state = {
      mode: initialMode,
      armed: input.armed == null ? initialMode !== 'disarmed' : !!input.armed,
      streamStatus: 'disconnected',
      activeStreamId: null,
      streamConnectedAtMs: null,
      streamLastError: null,
      commandSubscriberHealthy: false,
      externalRelayHealthy: true,
      lastExternalCommandAtMs: null,
      lastExternalCommandError: null,
      lastEventAtMs: null,
      lastDecisionAtMs: null,
      guardrail: { ...DEFAULT_GUARDRAIL },
      recentActions: [],
      recentDecisions: [],
      queueDepth: 0,
      cooldownUntilMs: null,
      failureStreak: 0,
      droppedCount: 0,
      reconnectCount: 0,
      actionRuns: 0,
      actionFailures: 0,
      guardrailTrips: 0,
      lockedAttempts: 0
    };
  }

  private now() {
    return this.deps.now ? Number(this.deps.now()) : Date.now();
  }

  private emitState() {
    this.state.queueDepth = this.eventQueue.length;
    this.deps.onStateChange?.({
      ...this.state,
      guardrail: { ...this.state.guardrail },
      recentActions: this.state.recentActions.slice(),
      recentDecisions: this.state.recentDecisions.slice()
    });
  }

  private async recordAudit(eventType: string, payload: Record<string, any>, level: 'info' | 'warn' | 'error' = 'info') {
    try {
      await this.deps.appendAuditEvent?.({ eventType, level, payload });
    } catch {
      // ignore audit failures
    }
  }

  private async persist(kind: 'runtime_ops_event' | 'runtime_ops_action' | 'runtime_ops_guardrail' | 'runtime_ops_decision', payload: Record<string, any>) {
    try {
      await this.deps.persistEvent?.(kind, payload);
    } catch {
      // ignore persistence failures
    }
  }

  setPolicy(policy: RuntimeOpsPolicy) {
    this.policy = policy;
    this.emitState();
  }

  getPolicy() {
    return this.policy;
  }

  getState() {
    return {
      ...this.state,
      guardrail: { ...this.state.guardrail },
      recentActions: this.state.recentActions.slice(),
      recentDecisions: this.state.recentDecisions.slice()
    };
  }

  setStreamStatus(
    status: RuntimeOpsControllerState['streamStatus'],
    meta?: {
      streamId?: string | null;
      connectedAtMs?: number | null;
      error?: string | null;
    }
  ) {
    const statusChanged = this.state.streamStatus !== status;
    if (!statusChanged && !meta) return;
    if (statusChanged && status === 'reconnecting') {
      this.state.reconnectCount += 1;
    }
    this.state.streamStatus = status;
    if (meta) {
      if (meta.streamId !== undefined) {
        this.state.activeStreamId = meta.streamId ? String(meta.streamId) : null;
      }
      if (meta.connectedAtMs !== undefined) {
        this.state.streamConnectedAtMs = Number.isFinite(Number(meta.connectedAtMs))
          ? Number(meta.connectedAtMs)
          : null;
      }
      if (meta.error !== undefined) {
        this.state.streamLastError = meta.error ? String(meta.error) : null;
      }
    }
    if (status === 'disconnected') {
      this.state.activeStreamId = null;
      this.state.streamConnectedAtMs = null;
    }
    if (status === 'connected') {
      this.state.streamLastError = null;
    }
    this.emitState();
  }

  ingestEvent(event: RuntimeOpsEvent) {
    this.eventQueue = pushRuntimeOpsEvent(this.eventQueue, event, DEFAULT_RUNTIME_EVENT_BUFFER_LIMIT);
    this.state.lastEventAtMs = event.ts;
    if (Number.isFinite(Number(event.droppedCount)) && Number(event.droppedCount) > 0) {
      this.state.droppedCount += Number(event.droppedCount);
    }
    void this.persist('runtime_ops_event', {
      ...event,
      receivedAtMs: this.now()
    });
    this.emitState();
  }

  setMode(mode: RuntimeOpsMode) {
    this.state.mode = mode;
    this.state.armed = mode !== 'disarmed';
    this.emitState();
  }

  emergencyStop(reason = 'manual_stop') {
    this.state.mode = 'emergency_stop';
    this.state.armed = false;
    this.state.cooldownUntilMs = this.now() + Math.max(this.policy.actionCooldownMs, 15_000);
    void this.recordAudit('runtime_ops_emergency_stop', {
      reason,
      cooldownUntilMs: this.state.cooldownUntilMs
    }, 'warn');
    this.emitState();
  }

  resumeAutonomy() {
    this.state.mode = 'autonomous';
    this.state.armed = true;
    this.state.cooldownUntilMs = null;
    this.emitState();
  }

  forceObserveOnly(reason = 'manual_observe_only') {
    this.state.mode = 'observe_only';
    this.state.armed = true;
    void this.recordAudit('runtime_ops_observe_only', { reason });
    this.emitState();
  }

  async requestManualAction(actionId: string, payload?: Record<string, any>, source: RuntimeOpsActionRecord['source'] = 'monitor') {
    const plan: RuntimeOpsActionPlan = {
      actionId: String(actionId || '').trim(),
      payload: payload && typeof payload === 'object' ? payload : {},
      domain: domainFromAction(actionId),
      reason: 'manual_runtime_ops_action',
      confidence: 1,
      liveExecution: isRuntimeOpsLiveAction(actionId),
      sourceEventIds: []
    };
    if (!plan.actionId) {
      return { ok: false, error: 'Action id is required.' };
    }
    return this.executePlan(plan, source);
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.policy.alwaysArmed && this.state.mode === 'disarmed') {
      this.state.mode = 'autonomous';
      this.state.armed = true;
    }
    this.emitState();
    this.timer = setInterval(() => {
      void this.tick();
    }, 3000);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private canRunNow(now: number) {
    if (!this.running) return false;
    if (!this.state.armed) return false;
    if (this.state.mode === 'disarmed' || this.state.mode === 'emergency_stop') return false;
    const cooldownUntilMs = Number(this.state.cooldownUntilMs || 0);
    if (cooldownUntilMs > now) return false;
    return true;
  }

  private buildDecision(plan: RuntimeOpsActionPlan | null, reason: string, blocked = false): RuntimeOpsDecision {
    return {
      id: `rt_decision_${this.now()}_${Math.random().toString(16).slice(2, 8)}`,
      atMs: this.now(),
      mode: this.state.mode,
      reason,
      confidence: plan?.confidence ?? 0,
      actionId: plan?.actionId || null,
      domain: plan?.domain || null,
      blocked,
      sourceEventIds: plan?.sourceEventIds || []
    };
  }

  private rememberDecision(decision: RuntimeOpsDecision) {
    this.state.lastDecisionAtMs = decision.atMs;
    this.state.recentDecisions = trimList([...this.state.recentDecisions, decision], 100);
    this.state.actionRuns = this.state.recentActions.length;
    void this.persist('runtime_ops_decision', decision as any);
    void this.recordAudit('runtime_ops_decision_made', {
      decisionId: decision.id,
      actionId: decision.actionId,
      reason: decision.reason,
      blocked: !!decision.blocked,
      mode: decision.mode,
      confidence: decision.confidence
    }, decision.blocked ? 'warn' : 'info');
  }

  private actionDedupeKey(plan: RuntimeOpsActionPlan) {
    const payload = plan.payload && typeof plan.payload === 'object' ? JSON.stringify(plan.payload) : '';
    return `${plan.actionId}|${payload}`;
  }

  private async executePlan(plan: RuntimeOpsActionPlan, source: RuntimeOpsActionRecord['source'] = 'controller') {
    const now = this.now();
    const dedupeKey = this.actionDedupeKey(plan);
    const lastAt = this.dedupeByActionKey.get(dedupeKey) || 0;
    const duplicateBlocked = now - lastAt < Math.max(1000, this.policy.duplicateSuppressionMs);
    const guardrail = evaluateRuntimeOpsGuardrails({
      policy: this.policy,
      health: this.deps.getHealthSnapshot(),
      actionId: plan.actionId,
      domain: plan.domain,
      now,
      recentActions: this.state.recentActions,
      failureStreak: this.state.failureStreak,
      cooldownUntilMs: this.state.cooldownUntilMs,
      duplicateBlocked
    });

    this.state.guardrail = guardrail;

    const decision = this.buildDecision(plan, plan.reason, !guardrail.pass || this.state.mode === 'observe_only');
    decision.guardrail = guardrail;

    if (!guardrail.pass || this.state.mode === 'observe_only') {
      if (!guardrail.pass) {
        this.state.guardrailTrips += 1;
      }
      if (plan.liveExecution) {
        this.state.lockedAttempts += 1;
      }
      this.rememberDecision(decision);
      await this.persist('runtime_ops_guardrail', {
        atMs: now,
        actionId: plan.actionId,
        blockedReasons: guardrail.blockedReasons,
        mode: this.state.mode
      });
      this.emitState();
      return {
        ok: false,
        blocked: true,
        decision,
        guardrail
      };
    }

    this.dedupeByActionKey.set(dedupeKey, now);

    const actionRecord: RuntimeOpsActionRecord = {
      id: `rt_action_${now}_${Math.random().toString(16).slice(2, 8)}`,
      atMs: now,
      actionId: plan.actionId,
      domain: plan.domain,
      ok: false,
      blocked: false,
      error: null,
      resultCode: null,
      source,
      liveExecution: plan.liveExecution,
      payload: plan.payload || null,
      decisionId: decision.id
    };

    let result: any = null;
    try {
      result = await this.deps.runActionCatalog({
        actionId: plan.actionId,
        payload: plan.payload || {}
      });
      const ok = result?.ok !== false;
      actionRecord.ok = ok;
      actionRecord.completedAtMs = this.now();
      actionRecord.latencyMs = Math.max(0, Number(actionRecord.completedAtMs || now) - now);
      actionRecord.resultCode = ok ? 'ok' : String(result?.error || result?.text || 'failed');
      actionRecord.error = ok ? null : String(result?.error || result?.text || 'Action failed.');
    } catch (err: any) {
      actionRecord.ok = false;
      actionRecord.completedAtMs = this.now();
      actionRecord.latencyMs = Math.max(0, Number(actionRecord.completedAtMs || now) - now);
      actionRecord.error = err?.message ? String(err.message) : 'Action failed.';
      actionRecord.resultCode = 'exception';
    }

    this.state.recentActions = trimList([...this.state.recentActions, actionRecord], 120);
    this.state.actionRuns += 1;
    if (!actionRecord.ok) {
      this.state.failureStreak += 1;
      this.state.actionFailures += 1;
      this.state.cooldownUntilMs = this.now() + (plan.liveExecution ? this.policy.liveActionCooldownMs : this.policy.actionCooldownMs);
    } else {
      this.state.failureStreak = 0;
      this.state.cooldownUntilMs = null;
    }

    this.rememberDecision(decision);
    await this.persist('runtime_ops_action', actionRecord as any);
    await this.recordAudit(actionRecord.ok ? 'runtime_ops_action_executed' : 'runtime_ops_action_failed', {
      actionRecordId: actionRecord.id,
      actionId: actionRecord.actionId,
      domain: actionRecord.domain,
      source: actionRecord.source,
      liveExecution: actionRecord.liveExecution,
      latencyMs: actionRecord.latencyMs,
      error: actionRecord.error
    }, actionRecord.ok ? 'info' : 'warn');

    this.emitState();
    return {
      ok: actionRecord.ok,
      result,
      actionRecord,
      decision,
      guardrail
    };
  }

  private async tick() {
    const now = this.now();
    if (!this.canRunNow(now)) {
      this.emitState();
      return;
    }

    const health = this.deps.getHealthSnapshot();
    if (health?.startupBridgeState === 'failed' && this.state.mode === 'autonomous') {
      this.forceObserveOnly('startup_bridge_failed');
    }

    const recentEvents = this.eventQueue.slice(-30);
    const plan = selectRuntimeOpsAction({
      events: recentEvents,
      health,
      mode: this.state.mode,
      now
    });
    if (!plan) {
      this.emitState();
      return;
    }

    await this.executePlan(plan, 'controller');
  }
}
