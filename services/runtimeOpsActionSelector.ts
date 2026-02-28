import type { HealthSnapshot, RuntimeOpsEvent, RuntimeOpsMode } from '../types';
import { isRuntimeOpsLiveAction } from './runtimeOpsGuardrails';

export type RuntimeOpsActionPlan = {
  actionId: string;
  payload?: Record<string, any>;
  domain: string;
  reason: string;
  confidence: number;
  liveExecution: boolean;
  sourceEventIds: string[];
};

export type RuntimeOpsActionSelectorInput = {
  events: RuntimeOpsEvent[];
  health: HealthSnapshot | null;
  mode: RuntimeOpsMode;
  now: number;
};

const isErrorLike = (event: RuntimeOpsEvent) => {
  const level = String(event.level || '').toLowerCase();
  if (level === 'error') return true;
  const code = String(event.code || '').toLowerCase();
  return code.includes('error') || code.includes('failed') || code.includes('crash');
};

const quoteStale = (updatedAtMs?: number | null, now = Date.now(), maxAgeMs = 120_000) => {
  const ts = Number(updatedAtMs || 0);
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return now - ts > maxAgeMs;
};

const domainFromAction = (actionId: string) => {
  const idx = String(actionId || '').indexOf('.');
  return idx > 0 ? String(actionId).slice(0, idx) : 'system';
};

export const selectRuntimeOpsAction = (input: RuntimeOpsActionSelectorInput): RuntimeOpsActionPlan | null => {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const events = Array.isArray(input.events) ? input.events.slice(-40) : [];
  const health = input.health;

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    const payloadActionId = String((event.payload as any)?.actionId || '').trim();
    if (payloadActionId) {
      return {
        actionId: payloadActionId,
        payload: (event.payload as any)?.payload && typeof (event.payload as any).payload === 'object'
          ? ((event.payload as any).payload as Record<string, any>)
          : {},
        domain: domainFromAction(payloadActionId),
        reason: 'event_requested_action',
        confidence: 0.9,
        liveExecution: isRuntimeOpsLiveAction(payloadActionId),
        sourceEventIds: [event.id]
      };
    }
  }

  const severe = events.filter((event) => isErrorLike(event));
  if (severe.length > 0) {
    const sourceEventIds = severe.slice(-3).map((event) => event.id);
    return {
      actionId: 'system.snapshot',
      payload: { detail: 'full', maxItems: 8, source: 'runtime_ops' },
      domain: 'system',
      reason: 'severe_runtime_error_detected',
      confidence: 0.84,
      liveExecution: false,
      sourceEventIds
    };
  }

  const brokerStatus = String(health?.brokerStatus || '').trim().toLowerCase();
  const streamStatus = String(health?.brokerStreamStatus || '').trim().toLowerCase();
  const streamError = String(health?.brokerStreamError || '').trim();
  if (brokerStatus === 'connected' && (streamStatus === 'error' || streamStatus === 'disconnected' || !!streamError)) {
    return {
      actionId: 'broker.refresh_snapshot',
      payload: { source: 'runtime_ops', reason: 'stream_recovery' },
      domain: 'broker',
      reason: 'broker_stream_degraded',
      confidence: 0.79,
      liveExecution: false,
      sourceEventIds: []
    };
  }

  if (brokerStatus === 'connected' && quoteStale(health?.brokerQuotesUpdatedAtMs, now, 180_000)) {
    return {
      actionId: 'broker.refresh_snapshot',
      payload: { source: 'runtime_ops', reason: 'quote_stale' },
      domain: 'broker',
      reason: 'broker_quotes_stale',
      confidence: 0.72,
      liveExecution: false,
      sourceEventIds: []
    };
  }

  if (quoteStale(health?.nativeChartUpdatedAtMs, now, 180_000)) {
    return {
      actionId: 'chart.refresh',
      payload: { source: 'runtime_ops', reason: 'chart_stale' },
      domain: 'chart',
      reason: 'native_chart_stale',
      confidence: 0.63,
      liveExecution: false,
      sourceEventIds: []
    };
  }

  if (input.mode === 'autonomous' && brokerStatus === 'disconnected') {
    return {
      actionId: 'tradelocker.connect',
      payload: { source: 'runtime_ops', reason: 'broker_disconnected' },
      domain: 'broker',
      reason: 'broker_reconnect',
      confidence: 0.58,
      liveExecution: false,
      sourceEventIds: []
    };
  }

  return null;
};
