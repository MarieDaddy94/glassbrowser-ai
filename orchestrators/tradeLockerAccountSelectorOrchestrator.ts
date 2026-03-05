import type {
  TradeLockerAccountSelectorItem,
  TradeLockerAccountSelectorModel,
  TradeLockerAccountSelectorSnapshot
} from '../types';

export type TradeLockerAccountCardCacheEntry = {
  balance?: number | null;
  equity?: number | null;
  freeMargin?: number | null;
  currency?: string | null;
  lastUpdatedAtMs?: number | null;
  lastError?: string | null;
  isConnected?: boolean;
  rateLimited?: boolean;
  retryAtMs?: number | null;
};

const parseTradeLockerNumeric = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const raw = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(raw) ? raw : null;
};

const readTradeLockerNumeric = (input: unknown, keys: string[]): number | null => {
  if (!input || typeof input !== 'object') return null;
  for (const key of keys) {
    const value = parseTradeLockerNumeric((input as Record<string, unknown>)[key]);
    if (value != null) return value;
  }
  return null;
};

const normalizeTradeLockerEnvironment = (value: unknown, fallback: 'demo' | 'live' = 'demo'): 'demo' | 'live' => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'live') return 'live';
  if (raw === 'demo') return 'demo';
  return fallback;
};

export interface BuildTradeLockerAccountSelectorBaseRowsInput {
  activeTradeLockerAccountKey: string | null;
  tlAccounts: unknown[];
  tlSavedConfig: Record<string, unknown> | null;
  tlAccountMetrics: Record<string, unknown> | null;
  tlBalance: unknown;
  tlEquity: unknown;
  tlStatus: string;
  accountMapEntries: Array<{
    env?: string | null;
    server?: string | null;
    accountId?: number | null;
    accNum?: number | null;
    accountKey?: string | null;
  }>;
  buildTradeLockerAccountKey: (input: {
    env?: string | null;
    server?: string | null;
    accountId?: number | null;
    accNum?: number | null;
  }) => string;
  normalizeTradeLockerAccountRecord: (input: unknown, opts: { env: string; server: string }) => {
    accountKey?: string | null;
    accountId?: number | null;
    accNum?: number | null;
  } | null;
  areAccountKeysEquivalent: (left: string, right: string) => boolean;
  parseTradeLockerAccountNumber: (value: unknown) => number | null;
}

export const buildTradeLockerAccountSelectorBaseRows = (
  input: BuildTradeLockerAccountSelectorBaseRowsInput
): TradeLockerAccountSelectorItem[] => {
  const rowsByKey = new Map<string, TradeLockerAccountSelectorItem>();
  const envFallback = normalizeTradeLockerEnvironment(input.tlSavedConfig?.env, 'demo');
  const env = String(input.tlSavedConfig?.env || '').trim().toLowerCase();
  const server = String(input.tlSavedConfig?.server || '').trim().toLowerCase();
  const accountsList = Array.isArray(input.tlAccounts) ? input.tlAccounts : [];

  const pushRow = (row: TradeLockerAccountSelectorItem) => {
    const key = String(row.accountKey || '').trim();
    if (!key) return;
    rowsByKey.set(key, row);
  };

  for (const acct of accountsList) {
    const normalized = input.normalizeTradeLockerAccountRecord(acct, { env, server });
    const accountKey =
      normalized?.accountKey ||
      input.buildTradeLockerAccountKey({
        env,
        server,
        accountId: normalized?.accountId,
        accNum: normalized?.accNum ?? null
      });
    if (!accountKey || normalized?.accountId == null) continue;
    const account = acct as Record<string, unknown>;
    const labelRaw = String(account?.name || account?.accountName || account?.label || '').trim();
    const label = labelRaw || `Account ${normalized.accountId}${normalized.accNum != null ? `/${normalized.accNum}` : ''}`;
    const environment = normalizeTradeLockerEnvironment(account?.environment ?? account?.env, envFallback);
    const currency =
      account?.currency != null
        ? String(account.currency)
        : account?.accountCurrency != null
          ? String(account.accountCurrency)
          : null;
    const balance = readTradeLockerNumeric(acct, ['aaccountBalance', 'accountBalance', 'balance']);
    const equity = readTradeLockerNumeric(acct, ['equity', 'accountEquity', 'netAssetValue', 'nav']);
    const freeMargin = readTradeLockerNumeric(acct, ['freeMargin', 'marginFree', 'availableMargin', 'availableFunds']);
    pushRow({
      accountKey,
      accountId: normalized.accountId,
      accNum: normalized.accNum ?? null,
      label,
      environment,
      currency,
      balance,
      equity,
      freeMargin,
      isActive: !!input.activeTradeLockerAccountKey && input.areAccountKeysEquivalent(accountKey, input.activeTradeLockerAccountKey),
      isConnected: input.tlStatus === 'connected',
      status: 'unavailable',
      lastUpdatedAtMs: null,
      lastError: null
    });
  }

  const uniqueMapEntries = Array.from(
    new Map(
      input.accountMapEntries
        .map((entry) => [String(entry?.accountKey || '').trim(), entry] as const)
        .filter(([key, entry]) => !!key && !!entry?.accountId)
    ).values()
  );

  for (const entry of uniqueMapEntries) {
    if (!entry?.accountKey || rowsByKey.has(entry.accountKey)) continue;
    const environment = normalizeTradeLockerEnvironment(entry.env || envFallback, envFallback);
    pushRow({
      accountKey: entry.accountKey,
      accountId: entry.accountId ?? 0,
      accNum: entry.accNum ?? null,
      label: `Account ${entry.accountId}${entry.accNum != null ? `/${entry.accNum}` : ''}`,
      environment,
      currency: null,
      balance: null,
      equity: null,
      freeMargin: null,
      isActive:
        !!input.activeTradeLockerAccountKey &&
        input.areAccountKeysEquivalent(entry.accountKey, input.activeTradeLockerAccountKey),
      isConnected: input.tlStatus === 'connected',
      status: 'unavailable',
      lastUpdatedAtMs: null,
      lastError: null
    });
  }

  const savedAccountId = input.parseTradeLockerAccountNumber(input.tlSavedConfig?.accountId);
  const savedAccNum = input.parseTradeLockerAccountNumber(input.tlSavedConfig?.accNum);
  const savedKey = input.buildTradeLockerAccountKey({
    env: (input.tlSavedConfig?.env as string) ?? null,
    server: (input.tlSavedConfig?.server as string) ?? null,
    accountId: savedAccountId,
    accNum: savedAccNum
  });
  if (savedKey && savedAccountId != null && !rowsByKey.has(savedKey)) {
    const balance =
      input.tlAccountMetrics && Number.isFinite(Number(input.tlAccountMetrics.balance))
        ? Number(input.tlAccountMetrics.balance)
        : Number.isFinite(Number(input.tlBalance))
          ? Number(input.tlBalance)
          : null;
    const equity =
      input.tlAccountMetrics && Number.isFinite(Number(input.tlAccountMetrics.equity))
        ? Number(input.tlAccountMetrics.equity)
        : Number.isFinite(Number(input.tlEquity))
          ? Number(input.tlEquity)
          : null;
    const freeMargin =
      input.tlAccountMetrics && Number.isFinite(Number(input.tlAccountMetrics.marginFree))
        ? Number(input.tlAccountMetrics.marginFree)
        : null;
    pushRow({
      accountKey: savedKey,
      accountId: savedAccountId,
      accNum: savedAccNum ?? null,
      label: `Active ${savedAccountId}${savedAccNum != null ? `/${savedAccNum}` : ''}`,
      environment: normalizeTradeLockerEnvironment(input.tlSavedConfig?.env, envFallback),
      currency: input.tlAccountMetrics?.currency != null ? String(input.tlAccountMetrics.currency) : null,
      balance,
      equity,
      freeMargin,
      isActive: !!input.activeTradeLockerAccountKey && input.areAccountKeysEquivalent(savedKey, input.activeTradeLockerAccountKey),
      isConnected: input.tlStatus === 'connected',
      status: 'unavailable',
      lastUpdatedAtMs: Number.isFinite(Number(input.tlAccountMetrics?.updatedAtMs))
        ? Number(input.tlAccountMetrics?.updatedAtMs)
        : null,
      lastError: null
    });
  }

  return Array.from(rowsByKey.values());
};

export const mergeTradeLockerAccountCardCacheFromBaseRows = (
  prev: Record<string, TradeLockerAccountCardCacheEntry>,
  rows: TradeLockerAccountSelectorItem[]
): Record<string, TradeLockerAccountCardCacheEntry> => {
  let changed = false;
  const next = { ...prev };
  for (const row of rows) {
    if (!row.accountKey) continue;
    const existing = next[row.accountKey] || {};
    const patch: TradeLockerAccountCardCacheEntry = {
      ...existing
    };
    if ((existing.balance == null || !Number.isFinite(Number(existing.balance))) && Number.isFinite(Number(row.balance))) {
      patch.balance = Number(row.balance);
    }
    if ((existing.equity == null || !Number.isFinite(Number(existing.equity))) && Number.isFinite(Number(row.equity))) {
      patch.equity = Number(row.equity);
    }
    if ((existing.freeMargin == null || !Number.isFinite(Number(existing.freeMargin))) && Number.isFinite(Number(row.freeMargin))) {
      patch.freeMargin = Number(row.freeMargin);
    }
    if (!existing.currency && row.currency) patch.currency = row.currency;
    if (!existing.lastUpdatedAtMs && row.lastUpdatedAtMs) patch.lastUpdatedAtMs = row.lastUpdatedAtMs;
    const hasDiff =
      patch.balance !== existing.balance ||
      patch.equity !== existing.equity ||
      patch.freeMargin !== existing.freeMargin ||
      patch.currency !== existing.currency ||
      patch.lastUpdatedAtMs !== existing.lastUpdatedAtMs;
    if (hasDiff) {
      next[row.accountKey] = patch;
      changed = true;
    }
  }
  return changed ? next : prev;
};

export interface BuildTradeLockerAccountSelectorItemsInput {
  activeTradeLockerAccountKey: string | null;
  search: string;
  status: string;
  freshMs: number;
  staleMs: number;
  rows: TradeLockerAccountSelectorItem[];
  cache: Record<string, TradeLockerAccountCardCacheEntry>;
  areAccountKeysEquivalent: (left: string, right: string) => boolean;
}

export const buildTradeLockerAccountSelectorItems = (
  input: BuildTradeLockerAccountSelectorItemsInput
): TradeLockerAccountSelectorItem[] => {
  const now = Date.now();
  const search = String(input.search || '').trim().toLowerCase();
  const enriched = input.rows.map((row) => {
    const cache = input.cache[row.accountKey] || {};
    const balance =
      cache.balance != null && Number.isFinite(Number(cache.balance))
        ? Number(cache.balance)
        : row.balance != null && Number.isFinite(Number(row.balance))
          ? Number(row.balance)
          : null;
    const equity =
      cache.equity != null && Number.isFinite(Number(cache.equity))
        ? Number(cache.equity)
        : row.equity != null && Number.isFinite(Number(row.equity))
          ? Number(row.equity)
          : null;
    const freeMargin =
      cache.freeMargin != null && Number.isFinite(Number(cache.freeMargin))
        ? Number(cache.freeMargin)
        : row.freeMargin != null && Number.isFinite(Number(row.freeMargin))
          ? Number(row.freeMargin)
          : null;
    const lastUpdatedAtMs =
      cache.lastUpdatedAtMs != null && Number.isFinite(Number(cache.lastUpdatedAtMs))
        ? Number(cache.lastUpdatedAtMs)
        : row.lastUpdatedAtMs != null && Number.isFinite(Number(row.lastUpdatedAtMs))
          ? Number(row.lastUpdatedAtMs)
          : null;
    const hasData = [balance, equity, freeMargin].some((value) => value != null && Number.isFinite(Number(value)));
    const ageMs = lastUpdatedAtMs != null ? Math.max(0, now - lastUpdatedAtMs) : Number.POSITIVE_INFINITY;
    let status: TradeLockerAccountSelectorItem['status'] = 'unavailable';
    if (hasData && ageMs <= input.freshMs) status = 'fresh';
    else if (hasData && ageMs <= input.staleMs) status = 'stale';
    else if (hasData) status = 'stale';
    const lastError = cache.lastError || row.lastError || null;
    if (lastError && (!hasData || ageMs > input.staleMs)) {
      status = 'unavailable';
    }
    const label = String(row.label || '').trim() || `Account ${row.accountId}${row.accNum != null ? `/${row.accNum}` : ''}`;
    return {
      ...row,
      label,
      balance,
      equity,
      freeMargin,
      currency: cache.currency || row.currency || null,
      lastUpdatedAtMs,
      lastError,
      isConnected: cache.isConnected ?? row.isConnected ?? input.status === 'connected',
      status,
      isActive:
        !!input.activeTradeLockerAccountKey &&
        input.areAccountKeysEquivalent(row.accountKey, input.activeTradeLockerAccountKey)
    };
  });

  const filtered = search
    ? enriched.filter((item) => {
        const haystack = [
          item.label,
          item.environment,
          item.accountId != null ? String(item.accountId) : '',
          item.accNum != null ? String(item.accNum) : '',
          item.accountKey
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      })
    : enriched;

  filtered.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.environment !== b.environment) return a.environment === 'live' ? -1 : 1;
    const aBalance = Number.isFinite(Number(a.balance)) ? Number(a.balance) : Number.NEGATIVE_INFINITY;
    const bBalance = Number.isFinite(Number(b.balance)) ? Number(b.balance) : Number.NEGATIVE_INFINITY;
    if (aBalance !== bBalance) return bBalance - aBalance;
    return String(a.label || '').localeCompare(String(b.label || ''));
  });

  return filtered;
};

export const buildTradeLockerAccountSelectorSnapshot = (input: {
  activeTradeLockerAccountKey: string | null;
  items: TradeLockerAccountSelectorItem[];
  refreshState: {
    queueDepth: number;
    lastRefreshAtMs: number | null;
    lastError: string | null;
  };
}): TradeLockerAccountSelectorSnapshot => {
  const freshCount = input.items.filter((item) => item.status === 'fresh').length;
  const staleCount = input.items.filter((item) => item.status === 'stale').length;
  const unavailableCount = input.items.filter((item) => item.status === 'unavailable').length;
  return {
    activeAccountKey: input.activeTradeLockerAccountKey || null,
    cardsCount: input.items.length,
    freshCount,
    staleCount,
    unavailableCount,
    refreshQueueDepth: Number(input.refreshState.queueDepth || 0),
    lastRefreshAtMs: input.refreshState.lastRefreshAtMs ?? null,
    lastRefreshError: input.refreshState.lastError ?? null
  };
};

export const buildTradeLockerAccountSelectorModel = (input: {
  show: boolean;
  items: TradeLockerAccountSelectorItem[];
  isOpen: boolean;
  search: string;
  refreshState: {
    switching: boolean;
    refreshingAccounts: boolean;
    refreshingBalances: boolean;
    queueDepth: number;
    lastRefreshAtMs: number | null;
    lastError: string | null;
  };
  onToggleOpen: () => void;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (accountKey: string) => void;
  onRefreshAccounts: () => void;
  onRefreshBalances: () => void;
}): TradeLockerAccountSelectorModel | null => {
  if (!input.show) return null;
  const activeItem = input.items.find((item) => item.isActive) || input.items[0] || null;
  return {
    activeLabel: activeItem?.label || null,
    activeBalance: activeItem?.balance ?? null,
    activeCurrency: activeItem?.currency ?? null,
    activeAccNum: activeItem?.accNum ?? null,
    items: input.items,
    isOpen: input.isOpen,
    search: input.search,
    switching: input.refreshState.switching,
    refreshingAccounts: input.refreshState.refreshingAccounts,
    refreshingBalances: input.refreshState.refreshingBalances,
    queueDepth: input.refreshState.queueDepth,
    lastRefreshAtMs: input.refreshState.lastRefreshAtMs,
    lastError: input.refreshState.lastError,
    onToggleOpen: input.onToggleOpen,
    onClose: input.onClose,
    onSearchChange: input.onSearchChange,
    onSelect: input.onSelect,
    onRefreshAccounts: input.onRefreshAccounts,
    onRefreshBalances: input.onRefreshBalances
  };
};
