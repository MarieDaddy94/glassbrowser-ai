import type { HealthSnapshot, RuntimeOpsActionRecord, RuntimeOpsGuardrailState, RuntimeOpsPolicy } from '../types';

export type RuntimeOpsGuardrailInput = {
  policy: RuntimeOpsPolicy;
  health: HealthSnapshot | null;
  actionId: string;
  domain?: string | null;
  now: number;
  recentActions: RuntimeOpsActionRecord[];
  failureStreak: number;
  cooldownUntilMs?: number | null;
  duplicateBlocked?: boolean;
};

const LIVE_ACTION_IDS = new Set([
  'trade.execute',
  'broker.action.execute',
  'broker.close_position',
  'broker.cancel_order',
  'broker.modify_position',
  'broker.modify_order',
  'tradelocker.place_order',
  'tradelocker.close_all_positions',
  'tradelocker.cancel_all_orders'
]);

const getDomain = (actionId: string, fallback?: string | null) => {
  if (fallback) return String(fallback);
  const raw = String(actionId || '').trim();
  const idx = raw.indexOf('.');
  return idx > 0 ? raw.slice(0, idx) : 'system';
};

export const isRuntimeOpsLiveAction = (actionId: string) => LIVE_ACTION_IDS.has(String(actionId || '').trim());

export const evaluateRuntimeOpsGuardrails = (input: RuntimeOpsGuardrailInput): RuntimeOpsGuardrailState => {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const actionId = String(input.actionId || '').trim();
  const policy = input.policy;
  const health = input.health;
  const domain = getDomain(actionId, input.domain);
  const blockedReasons: string[] = [];

  const minuteWindowStart = now - 60_000;
  const recent = (input.recentActions || []).filter((row) => Number(row.atMs || 0) >= minuteWindowStart);
  const actionsLastMinute = recent.length;
  const domainActionsLastMinute = recent.reduce((acc, row) => {
    const key = getDomain(String(row.actionId || ''), row.domain || null);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (input.duplicateBlocked) blockedReasons.push('duplicate_suppression');
  if (Number.isFinite(Number(input.cooldownUntilMs)) && Number(input.cooldownUntilMs) > now) {
    blockedReasons.push('cooldown_active');
  }
  if (actionsLastMinute >= Math.max(1, policy.maxActionsPerMinute)) {
    blockedReasons.push('max_actions_per_minute');
  }
  if ((domainActionsLastMinute[domain] || 0) >= Math.max(1, policy.maxActionsPerDomain)) {
    blockedReasons.push('max_actions_per_domain');
  }
  if (Number(input.failureStreak || 0) >= Math.max(1, policy.consecutiveFailureCircuit)) {
    blockedReasons.push('failure_circuit_open');
  }

  const isLiveAction = isRuntimeOpsLiveAction(actionId);
  const canRunLive = policy.allowLiveExecution === true;
  if (isLiveAction) {
    if (!canRunLive) {
      blockedReasons.push('live_execution_disabled');
    }
    if (health?.killSwitch === true) {
      blockedReasons.push('kill_switch_active');
    }
    const brokerStatus = String(health?.brokerStatus || '').trim().toLowerCase();
    if (brokerStatus && brokerStatus !== 'connected' && brokerStatus !== 'ok' && brokerStatus !== 'ready') {
      blockedReasons.push('broker_not_connected');
    }
    const autoPilotState = String(health?.autoPilotState || '').trim().toLowerCase();
    if (autoPilotState === 'halted' || autoPilotState === 'error' || autoPilotState === 'cooldown') {
      blockedReasons.push('autopilot_guard');
    }
  }

  const pass = blockedReasons.length === 0;
  return {
    pass,
    blockedReasons,
    canRunLive,
    cooldownUntilMs: Number.isFinite(Number(input.cooldownUntilMs)) ? Number(input.cooldownUntilMs) : null,
    failureStreak: Number(input.failureStreak || 0),
    actionsLastMinute,
    domainActionsLastMinute,
    duplicateBlocked: !!input.duplicateBlocked
  };
};
