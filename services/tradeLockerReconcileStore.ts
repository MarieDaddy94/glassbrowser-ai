type AccountCheckpoint = {
  accountKey: string;
  lastReconciledAtMs: number;
  lastOrdersHistorySeenTs?: number | null;
  lastPositionsHash?: string | null;
};

type TenantCheckpoint = {
  tenantKey: string;
  lastReconciledAtMs: number;
  lastDecisionAtMs?: number | null;
  lastOrderAtMs?: number | null;
};

type PersistedShape = {
  account: Record<string, AccountCheckpoint>;
  tenant: Record<string, TenantCheckpoint>;
  updatedAtMs: number;
};

export type TradeLockerReconcileStoreOptions = {
  storageKey?: string;
};

const DEFAULT_STORAGE_KEY = 'glass_tl_shard_scheduler_state_v1';

const normText = (value: unknown) => String(value || '').trim();

const loadPersisted = (storageKey: string): PersistedShape => {
  if (typeof localStorage === 'undefined') {
    return { account: {}, tenant: {}, updatedAtMs: 0 };
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { account: {}, tenant: {}, updatedAtMs: 0 };
    const parsed = JSON.parse(raw);
    return {
      account: parsed?.account && typeof parsed.account === 'object' ? parsed.account : {},
      tenant: parsed?.tenant && typeof parsed.tenant === 'object' ? parsed.tenant : {},
      updatedAtMs: Number.isFinite(Number(parsed?.updatedAtMs)) ? Number(parsed.updatedAtMs) : 0
    };
  } catch {
    return { account: {}, tenant: {}, updatedAtMs: 0 };
  }
};

export const createTradeLockerReconcileStore = (opts?: TradeLockerReconcileStoreOptions) => {
  const storageKey = normText(opts?.storageKey) || DEFAULT_STORAGE_KEY;
  let state = loadPersisted(storageKey);

  const persist = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore persistence failures
    }
  };

  const upsertAccountCheckpoint = (input: {
    accountKey: string;
    lastReconciledAtMs?: number | null;
    lastOrdersHistorySeenTs?: number | null;
    lastPositionsHash?: string | null;
  }) => {
    const accountKey = normText(input.accountKey);
    if (!accountKey) return null;
    const previous = state.account[accountKey];
    const next: AccountCheckpoint = {
      accountKey,
      lastReconciledAtMs: Number.isFinite(Number(input.lastReconciledAtMs))
        ? Number(input.lastReconciledAtMs)
        : (previous?.lastReconciledAtMs || Date.now()),
      lastOrdersHistorySeenTs: Number.isFinite(Number(input.lastOrdersHistorySeenTs))
        ? Number(input.lastOrdersHistorySeenTs)
        : (previous?.lastOrdersHistorySeenTs ?? null),
      lastPositionsHash: input.lastPositionsHash != null ? String(input.lastPositionsHash) : (previous?.lastPositionsHash ?? null)
    };
    state = {
      ...state,
      account: {
        ...state.account,
        [accountKey]: next
      },
      updatedAtMs: Date.now()
    };
    persist();
    return next;
  };

  const upsertTenantCheckpoint = (input: {
    tenantKey: string;
    lastReconciledAtMs?: number | null;
    lastDecisionAtMs?: number | null;
    lastOrderAtMs?: number | null;
  }) => {
    const tenantKey = normText(input.tenantKey);
    if (!tenantKey) return null;
    const previous = state.tenant[tenantKey];
    const next: TenantCheckpoint = {
      tenantKey,
      lastReconciledAtMs: Number.isFinite(Number(input.lastReconciledAtMs))
        ? Number(input.lastReconciledAtMs)
        : (previous?.lastReconciledAtMs || Date.now()),
      lastDecisionAtMs: Number.isFinite(Number(input.lastDecisionAtMs))
        ? Number(input.lastDecisionAtMs)
        : (previous?.lastDecisionAtMs ?? null),
      lastOrderAtMs: Number.isFinite(Number(input.lastOrderAtMs))
        ? Number(input.lastOrderAtMs)
        : (previous?.lastOrderAtMs ?? null)
    };
    state = {
      ...state,
      tenant: {
        ...state.tenant,
        [tenantKey]: next
      },
      updatedAtMs: Date.now()
    };
    persist();
    return next;
  };

  return {
    storageKey,
    getAccountCheckpoint: (accountKeyRaw: unknown) => {
      const accountKey = normText(accountKeyRaw);
      return accountKey ? state.account[accountKey] || null : null;
    },
    getTenantCheckpoint: (tenantKeyRaw: unknown) => {
      const tenantKey = normText(tenantKeyRaw);
      return tenantKey ? state.tenant[tenantKey] || null : null;
    },
    upsertAccountCheckpoint,
    upsertTenantCheckpoint,
    getSnapshot: () => ({
      account: { ...state.account },
      tenant: { ...state.tenant },
      updatedAtMs: state.updatedAtMs
    }),
    clear: () => {
      state = { account: {}, tenant: {}, updatedAtMs: Date.now() };
      persist();
    }
  };
};

export type TradeLockerReconcileStore = ReturnType<typeof createTradeLockerReconcileStore>;
