import type {
  TradeLockerAccountShardState,
  TradeLockerMarketSubscriptionState,
  TradeLockerStrategyMatrixRow,
  TradeLockerStrategyRuntimeState,
  TradeLockerTenantKey
} from '../types';

type TenantRecord = {
  tenantKey: TradeLockerTenantKey;
  accountKey: string;
  strategyId: string;
  state: TradeLockerStrategyRuntimeState;
  symbols: string[];
  timeframes: string[];
  riskCaps: {
    maxOpenPositions?: number | null;
    maxPerSymbolExposure?: number | null;
    maxActionsPerMinute?: number | null;
  } | null;
  lastDecision?: string | null;
  lastOrder?: string | null;
  lastError?: string | null;
  updatedAtMs: number;
};

type ShardRecord = TradeLockerAccountShardState & {
  accountKey: string;
};

type Snapshot = {
  shards: ShardRecord[];
  tenants: TenantRecord[];
  subscriptions: TradeLockerMarketSubscriptionState[];
};

type Listener = (snapshot: Snapshot) => void;

const normText = (value: unknown) => String(value || '').trim();
const normList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const key = normText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
};

export const buildTradeLockerTenantKey = (accountKey: unknown, strategyId: unknown): TradeLockerTenantKey => {
  const account = normText(accountKey);
  const strategy = normText(strategyId) || 'manual';
  return `${account}|${strategy}`;
};

export const parseTradeLockerTenantKey = (tenantKey: unknown): { accountKey: string; strategyId: string } | null => {
  const raw = normText(tenantKey);
  if (!raw) return null;
  const idx = raw.indexOf('|');
  if (idx <= 0 || idx >= raw.length - 1) return null;
  const accountKey = normText(raw.slice(0, idx));
  const strategyId = normText(raw.slice(idx + 1));
  if (!accountKey || !strategyId) return null;
  return { accountKey, strategyId };
};

export const createTradeLockerTenantRegistry = () => {
  const shardByAccount = new Map<string, ShardRecord>();
  const tenantByKey = new Map<TradeLockerTenantKey, TenantRecord>();
  const symbolSubscribers = new Map<string, Set<TradeLockerTenantKey>>();
  const listeners = new Set<Listener>();

  const now = () => Date.now();

  const ensureShard = (accountKey: string): ShardRecord => {
    const key = normText(accountKey);
    const existing = key ? shardByAccount.get(key) : null;
    if (existing) return existing;
    const created: ShardRecord = {
      accountKey: key,
      queueDepth: 0,
      rateBudget: 0,
      circuitState: 'closed',
      lastError: null,
      lastReconcileAtMs: null
    };
    shardByAccount.set(key, created);
    return created;
  };

  const resetSubscriptionsForTenant = (tenantKey: TradeLockerTenantKey) => {
    for (const [symbol, subscribers] of symbolSubscribers.entries()) {
      if (!subscribers.has(tenantKey)) continue;
      subscribers.delete(tenantKey);
      if (subscribers.size === 0) symbolSubscribers.delete(symbol);
    }
  };

  const writeSubscriptionsForTenant = (tenantKey: TradeLockerTenantKey, symbols: string[]) => {
    resetSubscriptionsForTenant(tenantKey);
    for (const symbol of symbols) {
      const key = normText(symbol).toUpperCase();
      if (!key) continue;
      const bucket = symbolSubscribers.get(key) || new Set<TradeLockerTenantKey>();
      bucket.add(tenantKey);
      symbolSubscribers.set(key, bucket);
    }
  };

  const snapshot = (): Snapshot => {
    const subscriptions: TradeLockerMarketSubscriptionState[] = [];
    for (const [symbol, subscribers] of symbolSubscribers.entries()) {
      subscriptions.push({
        symbol,
        subscriberCount: subscribers.size,
        subscribers: Array.from(subscribers.values()).sort(),
        lastQuoteAtMs: null
      });
    }
    subscriptions.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
    return {
      shards: Array.from(shardByAccount.values()).map((entry) => ({ ...entry })),
      tenants: Array.from(tenantByKey.values()).map((entry) => ({ ...entry, symbols: entry.symbols.slice(), timeframes: entry.timeframes.slice() })),
      subscriptions
    };
  };

  const emit = () => {
    if (listeners.size === 0) return;
    const snap = snapshot();
    for (const listener of listeners.values()) {
      try {
        listener(snap);
      } catch {
        // ignore listener errors
      }
    }
  };

  const upsertTenant = (input: {
    accountKey: string;
    strategyId: string;
    state?: TradeLockerStrategyRuntimeState;
    symbols?: string[];
    timeframes?: string[];
    riskCaps?: TenantRecord['riskCaps'];
    lastDecision?: string | null;
    lastOrder?: string | null;
    lastError?: string | null;
  }) => {
    const accountKey = normText(input.accountKey);
    if (!accountKey) return null;
    const strategyId = normText(input.strategyId) || 'manual';
    const tenantKey = buildTradeLockerTenantKey(accountKey, strategyId);
    ensureShard(accountKey);
    const existing = tenantByKey.get(tenantKey);
    const next: TenantRecord = {
      tenantKey,
      accountKey,
      strategyId,
      state: input.state || existing?.state || 'idle',
      symbols: normList(input.symbols ?? existing?.symbols ?? []),
      timeframes: normList(input.timeframes ?? existing?.timeframes ?? []),
      riskCaps: input.riskCaps ?? existing?.riskCaps ?? null,
      lastDecision: input.lastDecision ?? existing?.lastDecision ?? null,
      lastOrder: input.lastOrder ?? existing?.lastOrder ?? null,
      lastError: input.lastError ?? existing?.lastError ?? null,
      updatedAtMs: now()
    };
    tenantByKey.set(tenantKey, next);
    writeSubscriptionsForTenant(tenantKey, next.symbols);
    emit();
    return next;
  };

  const removeTenant = (tenantKeyRaw: unknown) => {
    const tenantKey = normText(tenantKeyRaw) as TradeLockerTenantKey;
    if (!tenantKey || !tenantByKey.has(tenantKey)) return false;
    tenantByKey.delete(tenantKey);
    resetSubscriptionsForTenant(tenantKey);
    emit();
    return true;
  };

  const assignStrategyToAccounts = (
    strategyIdRaw: unknown,
    accountKeysRaw: unknown,
    opts?: { state?: TradeLockerStrategyRuntimeState; symbols?: string[]; timeframes?: string[] }
  ) => {
    const strategyId = normText(strategyIdRaw) || 'manual';
    const accountKeys = normList(Array.isArray(accountKeysRaw) ? accountKeysRaw : []);
    const activeKeys = new Set(accountKeys.map((entry) => buildTradeLockerTenantKey(entry, strategyId)));
    for (const entry of Array.from(tenantByKey.values())) {
      if (entry.strategyId !== strategyId) continue;
      if (!activeKeys.has(entry.tenantKey)) {
        removeTenant(entry.tenantKey);
      }
    }
    for (const accountKey of accountKeys) {
      upsertTenant({
        accountKey,
        strategyId,
        state: opts?.state || 'armed',
        symbols: opts?.symbols || [],
        timeframes: opts?.timeframes || []
      });
    }
  };

  const setTenantState = (tenantKeyRaw: unknown, state: TradeLockerStrategyRuntimeState, detail?: { error?: string | null; decision?: string | null; order?: string | null }) => {
    const tenantKey = normText(tenantKeyRaw) as TradeLockerTenantKey;
    const existing = tenantByKey.get(tenantKey);
    if (!existing) return null;
    const next: TenantRecord = {
      ...existing,
      state,
      lastError: detail?.error ?? existing.lastError ?? null,
      lastDecision: detail?.decision ?? existing.lastDecision ?? null,
      lastOrder: detail?.order ?? existing.lastOrder ?? null,
      updatedAtMs: now()
    };
    tenantByKey.set(tenantKey, next);
    emit();
    return next;
  };

  const updateShard = (accountKeyRaw: unknown, patch: Partial<TradeLockerAccountShardState>) => {
    const accountKey = normText(accountKeyRaw);
    if (!accountKey) return null;
    const shard = ensureShard(accountKey);
    const next: ShardRecord = {
      ...shard,
      ...patch,
      accountKey
    };
    shardByAccount.set(accountKey, next);
    emit();
    return next;
  };

  const setTenantSymbols = (tenantKeyRaw: unknown, symbolsRaw: unknown, timeframesRaw?: unknown) => {
    const tenantKey = normText(tenantKeyRaw) as TradeLockerTenantKey;
    const existing = tenantByKey.get(tenantKey);
    if (!existing) return null;
    const next: TenantRecord = {
      ...existing,
      symbols: normList(Array.isArray(symbolsRaw) ? symbolsRaw : []),
      timeframes: normList(Array.isArray(timeframesRaw) ? timeframesRaw : existing.timeframes),
      updatedAtMs: now()
    };
    tenantByKey.set(tenantKey, next);
    writeSubscriptionsForTenant(tenantKey, next.symbols);
    emit();
    return next;
  };

  const getMatrixRows = (): TradeLockerStrategyMatrixRow[] =>
    Array.from(tenantByKey.values())
      .map((entry) => {
        const shard = shardByAccount.get(entry.accountKey);
        return {
          tenantKey: entry.tenantKey,
          accountKey: entry.accountKey,
          strategyId: entry.strategyId,
          state: entry.state,
          symbols: entry.symbols.slice(),
          timeframes: entry.timeframes.slice(),
          lastDecision: entry.lastDecision ?? null,
          lastOrder: entry.lastOrder ?? null,
          risk: {
            maxOpenPositions: entry.riskCaps?.maxOpenPositions ?? null,
            maxPerSymbolExposure: entry.riskCaps?.maxPerSymbolExposure ?? null,
            maxActionsPerMinute: entry.riskCaps?.maxActionsPerMinute ?? null
          },
          circuit: shard?.circuitState || 'closed',
          queueDepth: Number(shard?.queueDepth || 0),
          updatedAtMs: entry.updatedAtMs
        };
      })
      .sort((a, b) => String(a.accountKey).localeCompare(String(b.accountKey)) || String(a.strategyId).localeCompare(String(b.strategyId)));

  const getTelemetry = () => ({
    shardCount: shardByAccount.size,
    tenantCount: tenantByKey.size,
    subscriptionSymbols: symbolSubscribers.size,
    byCircuit: Array.from(shardByAccount.values()).reduce(
      (acc, shard) => {
        const key = String(shard.circuitState || 'closed');
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    )
  });

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    buildTenantKey: buildTradeLockerTenantKey,
    parseTenantKey: parseTradeLockerTenantKey,
    upsertTenant,
    removeTenant,
    assignStrategyToAccounts,
    setTenantState,
    setTenantSymbols,
    updateShard,
    getMatrixRows,
    getSnapshot: snapshot,
    getTelemetry,
    subscribe
  };
};

export type TradeLockerTenantRegistry = ReturnType<typeof createTradeLockerTenantRegistry>;
