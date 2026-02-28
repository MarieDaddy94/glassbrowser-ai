import type { RuntimeOpsMode, RuntimeOpsPolicy } from '../types';

export const RUNTIME_OPS_POLICY_KEY = 'glass_runtime_ops_policy_v1';
export const RUNTIME_OPS_STATE_KEY = 'glass_runtime_ops_state_v1';
export const RUNTIME_OPS_LAST_RUN_KEY = 'glass_runtime_ops_last_run_v1';

export const DEFAULT_RUNTIME_OPS_POLICY: RuntimeOpsPolicy = {
  version: 'v1',
  alwaysArmed: true,
  allowLiveExecution: true,
  maxActionsPerMinute: 12,
  maxActionsPerDomain: 6,
  consecutiveFailureCircuit: 3,
  actionCooldownMs: 8_000,
  liveActionCooldownMs: 20_000,
  duplicateSuppressionMs: 30_000,
  reconnectBackoffMs: 5_000
};

export type RuntimeOpsPersistedState = {
  mode?: RuntimeOpsMode;
  armed?: boolean;
  emergencyStop?: boolean;
  updatedAtMs?: number;
};

const clampInt = (value: any, min: number, max: number, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
};

const safeParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const readStorage = (key: string) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: any) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

export const readRuntimeOpsPolicy = (): RuntimeOpsPolicy => {
  const parsed = safeParse<Partial<RuntimeOpsPolicy>>(readStorage(RUNTIME_OPS_POLICY_KEY));
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_RUNTIME_OPS_POLICY };
  return {
    version: 'v1',
    alwaysArmed: parsed.alwaysArmed !== false,
    allowLiveExecution: parsed.allowLiveExecution !== false,
    maxActionsPerMinute: clampInt(parsed.maxActionsPerMinute, 1, 120, DEFAULT_RUNTIME_OPS_POLICY.maxActionsPerMinute),
    maxActionsPerDomain: clampInt(parsed.maxActionsPerDomain, 1, 60, DEFAULT_RUNTIME_OPS_POLICY.maxActionsPerDomain),
    consecutiveFailureCircuit: clampInt(
      parsed.consecutiveFailureCircuit,
      1,
      20,
      DEFAULT_RUNTIME_OPS_POLICY.consecutiveFailureCircuit
    ),
    actionCooldownMs: clampInt(parsed.actionCooldownMs, 1000, 120_000, DEFAULT_RUNTIME_OPS_POLICY.actionCooldownMs),
    liveActionCooldownMs: clampInt(parsed.liveActionCooldownMs, 1000, 180_000, DEFAULT_RUNTIME_OPS_POLICY.liveActionCooldownMs),
    duplicateSuppressionMs: clampInt(
      parsed.duplicateSuppressionMs,
      1000,
      180_000,
      DEFAULT_RUNTIME_OPS_POLICY.duplicateSuppressionMs
    ),
    reconnectBackoffMs: clampInt(parsed.reconnectBackoffMs, 500, 60_000, DEFAULT_RUNTIME_OPS_POLICY.reconnectBackoffMs || 5_000)
  };
};

export const writeRuntimeOpsPolicy = (policy: RuntimeOpsPolicy) => {
  writeStorage(RUNTIME_OPS_POLICY_KEY, policy);
};

export const readRuntimeOpsState = (): RuntimeOpsPersistedState => {
  const parsed = safeParse<RuntimeOpsPersistedState>(readStorage(RUNTIME_OPS_STATE_KEY));
  if (!parsed || typeof parsed !== 'object') return {};
  const modeRaw = String(parsed.mode || '').trim();
  const mode: RuntimeOpsMode | undefined =
    modeRaw === 'autonomous' || modeRaw === 'observe_only' || modeRaw === 'disarmed' || modeRaw === 'emergency_stop'
      ? (modeRaw as RuntimeOpsMode)
      : undefined;
  return {
    mode,
    armed: typeof parsed.armed === 'boolean' ? parsed.armed : undefined,
    emergencyStop: parsed.emergencyStop === true,
    updatedAtMs: Number.isFinite(Number(parsed.updatedAtMs)) ? Number(parsed.updatedAtMs) : undefined
  };
};

export const writeRuntimeOpsState = (state: RuntimeOpsPersistedState) => {
  writeStorage(RUNTIME_OPS_STATE_KEY, {
    mode: state.mode,
    armed: state.armed,
    emergencyStop: state.emergencyStop,
    updatedAtMs: Number.isFinite(Number(state.updatedAtMs)) ? Number(state.updatedAtMs) : Date.now()
  });
};

export const writeRuntimeOpsLastRun = (payload: Record<string, any>) => {
  writeStorage(RUNTIME_OPS_LAST_RUN_KEY, {
    ...payload,
    atMs: Date.now()
  });
};
