import type { AutoPilotStateSnapshot } from '../types';

export type AutoPilotStateInput = {
  enabled: boolean;
  killSwitch: boolean;
  brokerConnected: boolean;
  brokerTradingEnabled: boolean;
  brokerAutoPilotEnabled?: boolean | null;
  streamStatus?: string | null;
  streamUpdatedAtMs?: number | null;
  quotesUpdatedAtMs?: number | null;
  maxStreamAgeMs?: number;
  maxQuoteAgeMs?: number;
  watchersEnabledCount?: number;
  now?: number;
};

const normalizeStatus = (value?: string | null) => String(value || '').trim().toLowerCase();

const streamLooksHealthy = (status: string) => {
  if (!status) return true;
  if (status.includes('disabled')) return true;
  if (status.includes('error')) return false;
  if (status.includes('disconnected')) return false;
  if (status.includes('stopped')) return false;
  if (status.includes('closed')) return false;
  return true;
};

export const evaluateAutoPilotState = (input: AutoPilotStateInput): AutoPilotStateSnapshot => {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  if (!input.enabled) {
    return {
      state: 'DISABLED',
      reason: 'AUTOPILOT_DISABLED',
      message: 'AutoPilot is disabled.',
      updatedAtMs: now
    };
  }
  if (input.killSwitch) {
    return {
      state: 'PAUSED',
      reason: 'KILL_SWITCH_ON',
      message: 'AutoPilot kill switch is ON.',
      updatedAtMs: now
    };
  }
  if (!input.brokerConnected) {
    return {
      state: 'PAUSED',
      reason: 'BROKER_DISCONNECTED',
      message: 'Broker is not connected.',
      updatedAtMs: now
    };
  }
  if (!input.brokerTradingEnabled) {
    return {
      state: 'PAUSED',
      reason: 'BROKER_TRADING_DISABLED',
      message: 'Broker trading is disabled.',
      updatedAtMs: now
    };
  }
  if (input.brokerAutoPilotEnabled === false) {
    return {
      state: 'PAUSED',
      reason: 'BROKER_AUTOPILOT_DISABLED',
      message: 'Broker AutoPilot execution is disabled.',
      updatedAtMs: now
    };
  }

  const streamStatus = normalizeStatus(input.streamStatus);
  if (!streamLooksHealthy(streamStatus)) {
    return {
      state: 'PAUSED',
      reason: 'STREAM_UNHEALTHY',
      message: input.streamStatus ? `Stream status: ${input.streamStatus}` : 'Stream unhealthy.',
      updatedAtMs: now
    };
  }
  const maxStreamAgeMs = Number.isFinite(Number(input.maxStreamAgeMs)) ? Number(input.maxStreamAgeMs) : 30_000;
  const streamUpdatedAtMs = Number(input.streamUpdatedAtMs || 0);
  if (streamUpdatedAtMs > 0 && now - streamUpdatedAtMs > maxStreamAgeMs) {
    return {
      state: 'PAUSED',
      reason: 'STREAM_UNHEALTHY',
      message: `Stream stale (${Math.round((now - streamUpdatedAtMs) / 1000)}s).`,
      updatedAtMs: now
    };
  }

  const maxQuoteAgeMs = Number.isFinite(Number(input.maxQuoteAgeMs)) ? Number(input.maxQuoteAgeMs) : 30_000;
  const quotesUpdatedAtMs = Number(input.quotesUpdatedAtMs || 0);
  if (!quotesUpdatedAtMs) {
    return {
      state: 'PAUSED',
      reason: 'STALE_MARKET_DATA',
      message: 'Market data unavailable.',
      updatedAtMs: now
    };
  }
  if (now - quotesUpdatedAtMs > maxQuoteAgeMs) {
    return {
      state: 'PAUSED',
      reason: 'STALE_MARKET_DATA',
      message: `Market data stale (${Math.round((now - quotesUpdatedAtMs) / 1000)}s).`,
      updatedAtMs: now
    };
  }

  const watchersEnabledCount = Number.isFinite(Number(input.watchersEnabledCount))
    ? Number(input.watchersEnabledCount)
    : 0;
  if (watchersEnabledCount <= 0) {
    return {
      state: 'ARMED',
      reason: 'NO_WATCHERS',
      message: 'AutoPilot enabled but no active watchers.',
      updatedAtMs: now
    };
  }

  return {
    state: 'RUNNING',
    reason: null,
    message: null,
    updatedAtMs: now
  };
};

export const mergeAutoPilotState = (
  prev: AutoPilotStateSnapshot | null,
  next: AutoPilotStateSnapshot
): AutoPilotStateSnapshot => {
  if (!prev) return next;
  if (prev.state === next.state && prev.reason === next.reason && (prev.message || '') === (next.message || '')) {
    return { ...next, updatedAtMs: prev.updatedAtMs };
  }
  return next;
};
