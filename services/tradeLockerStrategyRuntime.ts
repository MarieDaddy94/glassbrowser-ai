import type {
  SetupWatcher,
  TradeLockerStrategyMatrixRow,
  TradeLockerStrategyPolicy,
  TradeLockerStrategyRuntimeState,
  TradeLockerTenantKey
} from '../types';
import type { TradeLockerTenantRegistry } from './tradeLockerTenantRegistry';
import type { TradeLockerShardScheduler } from './tradeLockerShardScheduler';
import type { TradeLockerReconcileStore } from './tradeLockerReconcileStore';
import { evaluateTradeLockerTenantRisk } from './tradeLockerRiskScopes';

type RuntimeTelemetry = {
  actionRuns: number;
  actionFailures: number;
  lastError: string | null;
  lastActionAtMs: number;
};

const normText = (value: unknown) => String(value || '').trim();
const normList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const key = normText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
};

export type TradeLockerStrategyRuntimeOptions = {
  tenantRegistry: TradeLockerTenantRegistry;
  shardScheduler: TradeLockerShardScheduler;
  reconcileStore: TradeLockerReconcileStore;
};

export const createTradeLockerStrategyRuntime = (opts: TradeLockerStrategyRuntimeOptions) => {
  const tenantRegistry = opts.tenantRegistry;
  const shardScheduler = opts.shardScheduler;
  const reconcileStore = opts.reconcileStore;
  const policyByStrategy = new Map<string, TradeLockerStrategyPolicy>();
  const assignmentsByStrategy = new Map<string, string[]>();
  const telemetry: RuntimeTelemetry = {
    actionRuns: 0,
    actionFailures: 0,
    lastError: null,
    lastActionAtMs: 0
  };

  const now = () => Date.now();

  const updateTelemetry = (error?: string | null) => {
    telemetry.actionRuns += 1;
    telemetry.lastActionAtMs = now();
    if (error) {
      telemetry.actionFailures += 1;
      telemetry.lastError = error;
    } else {
      telemetry.lastError = null;
    }
  };

  const setStrategyPolicy = (policy: TradeLockerStrategyPolicy) => {
    const strategyId = normText(policy?.strategyId || '').toLowerCase() || 'manual';
    policyByStrategy.set(strategyId, {
      ...policy,
      strategyId,
      symbols: normList(policy?.symbols),
      timeframes: normList(policy?.timeframes),
      enabled: policy?.enabled !== false
    });
    return policyByStrategy.get(strategyId)!;
  };

  const assignStrategyAccounts = (strategyIdRaw: unknown, accountKeysRaw: unknown) => {
    const strategyId = normText(strategyIdRaw).toLowerCase() || 'manual';
    const accountKeys = normList(Array.isArray(accountKeysRaw) ? accountKeysRaw : []);
    assignmentsByStrategy.set(strategyId, accountKeys);
    const policy = policyByStrategy.get(strategyId);
    tenantRegistry.assignStrategyToAccounts(strategyId, accountKeys, {
      state: policy?.enabled === false ? 'paused' : 'armed',
      symbols: policy?.symbols || [],
      timeframes: policy?.timeframes || []
    });
    return { strategyId, accountKeys };
  };

  const syncFromWatchers = (watchersRaw: unknown, input?: { defaultAccountKey?: string | null }) => {
    const watchers = Array.isArray(watchersRaw) ? (watchersRaw as SetupWatcher[]) : [];
    const defaultAccountKey = normText(input?.defaultAccountKey || '');
    const grouped = new Map<string, { symbols: Set<string>; timeframes: Set<string>; enabled: boolean }>();
    for (const watcher of watchers) {
      const strategyId = normText((watcher as any)?.strategy || '').toLowerCase();
      if (!strategyId) continue;
      const symbol = normText((watcher as any)?.symbol || '').toUpperCase();
      const timeframe = normText((watcher as any)?.timeframe || '').toLowerCase();
      const entry = grouped.get(strategyId) || { symbols: new Set<string>(), timeframes: new Set<string>(), enabled: true };
      if (symbol) entry.symbols.add(symbol);
      if (timeframe) entry.timeframes.add(timeframe);
      if ((watcher as any)?.enabled === false) entry.enabled = false;
      grouped.set(strategyId, entry);
    }
    for (const [strategyId, groupedEntry] of grouped.entries()) {
      const existing = policyByStrategy.get(strategyId);
      setStrategyPolicy({
        strategyId,
        mode: existing?.mode || 'suggest',
        symbols: Array.from(groupedEntry.symbols.values()),
        timeframes: Array.from(groupedEntry.timeframes.values()),
        enabled: groupedEntry.enabled,
        riskCaps: existing?.riskCaps || null
      });
      const assigned = assignmentsByStrategy.get(strategyId) || (defaultAccountKey ? [defaultAccountKey] : []);
      if (assigned.length > 0) {
        assignStrategyAccounts(strategyId, assigned);
      }
    }
  };

  const setRuntimeState = (tenantKeyRaw: unknown, state: TradeLockerStrategyRuntimeState, reason?: string | null) => {
    const tenantKey = normText(tenantKeyRaw) as TradeLockerTenantKey;
    const updated = tenantRegistry.setTenantState(tenantKey, state, {
      error: state === 'faulted' ? (reason || 'faulted') : null
    });
    if (!updated) return { ok: false, error: 'tenant_not_found' };
    updateTelemetry(state === 'faulted' ? (reason || 'faulted') : null);
    return { ok: true, tenant: updated };
  };

  const listRuntimes = (): TradeLockerStrategyMatrixRow[] => tenantRegistry.getMatrixRows();

  const reconcileTenant = async (
    tenantKeyRaw: unknown,
    run: (input: { accountKey: string; strategyId: string; tenantKey: string }) => Promise<any>
  ) => {
    const tenantKey = normText(tenantKeyRaw);
    const parsed = tenantRegistry.parseTenantKey(tenantKey);
    if (!parsed) return { ok: false, error: 'tenant_not_found' };
    const risk = evaluateTradeLockerTenantRisk({
      strategyId: parsed.strategyId,
      accountKey: parsed.accountKey,
      caps: policyByStrategy.get(parsed.strategyId)?.riskCaps || null
    });
    if (!risk.ok) {
      updateTelemetry(risk.message || 'risk_blocked');
      return { ok: false, code: risk.code || 'risk_blocked', error: risk.message || 'Tenant risk blocked reconcile.' };
    }
    const result = await shardScheduler.enqueue(parsed.accountKey, 'strategy_runtime.reconcile', async () => {
      const data = await run({ accountKey: parsed.accountKey, strategyId: parsed.strategyId, tenantKey });
      return data;
    }, { priority: 'high' });
    if (!result.ok) {
      updateTelemetry(result.error || 'reconcile_failed');
      tenantRegistry.setTenantState(tenantKey, 'degraded', { error: result.error || 'reconcile_failed' });
      return result;
    }
    reconcileStore.upsertTenantCheckpoint({ tenantKey, lastReconciledAtMs: now() });
    shardScheduler.markShardReconciled(parsed.accountKey, now());
    tenantRegistry.setTenantState(tenantKey, 'running');
    updateTelemetry(null);
    return result;
  };

  const reconcileShard = async (accountKeyRaw: unknown, run: (input: { accountKey: string }) => Promise<any>) => {
    const accountKey = normText(accountKeyRaw);
    if (!accountKey) return { ok: false, error: 'account_key_required' };
    const result = await shardScheduler.enqueue(accountKey, 'strategy_runtime.reconcile_shard', async () => await run({ accountKey }), { priority: 'high' });
    if (!result.ok) {
      updateTelemetry(result.error || 'reconcile_shard_failed');
      shardScheduler.setShardCircuitState(accountKey, 'open', result.error || 'reconcile_shard_failed');
      return result;
    }
    reconcileStore.upsertAccountCheckpoint({ accountKey, lastReconciledAtMs: now() });
    shardScheduler.markShardReconciled(accountKey, now());
    shardScheduler.setShardCircuitState(accountKey, 'closed');
    updateTelemetry(null);
    return result;
  };

  const getAssignments = () =>
    Array.from(assignmentsByStrategy.entries()).map(([strategyId, accountKeys]) => ({
      strategyId,
      accountKeys: accountKeys.slice()
    }));

  const getTelemetry = () => ({
    ...telemetry,
    policyCount: policyByStrategy.size,
    assignmentCount: assignmentsByStrategy.size
  });

  return {
    setStrategyPolicy,
    assignStrategyAccounts,
    syncFromWatchers,
    setRuntimeState,
    listRuntimes,
    reconcileTenant,
    reconcileShard,
    getAssignments,
    getTelemetry
  };
};

export type TradeLockerStrategyRuntime = ReturnType<typeof createTradeLockerStrategyRuntime>;
