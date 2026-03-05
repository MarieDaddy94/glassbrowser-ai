import React from 'react';
import { createTradeLockerSelectorActionBundle } from '../../orchestrators/tradeLockerWorkspaceOrchestrator';
import {
  buildTradeLockerAccountSelectorBaseRows,
  buildTradeLockerAccountSelectorItems,
  buildTradeLockerAccountSelectorModel,
  buildTradeLockerAccountSelectorSnapshot,
  mergeTradeLockerAccountCardCacheFromBaseRows,
  type TradeLockerAccountCardCacheEntry
} from '../../orchestrators/tradeLockerAccountSelectorOrchestrator';
import type {
  TradeLockerAccountSelectorItem,
  TradeLockerAccountSelectorModel,
  TradeLockerAccountSelectorSnapshot
} from '../../types';

export interface TradeLockerSelectorRefreshState {
  switching: boolean;
  refreshingAccounts: boolean;
  refreshingBalances: boolean;
  queueDepth: number;
  lastRefreshAtMs: number | null;
  lastError: string | null;
}

export interface UseTradeLockerAccountSelectorRuntimeArgs {
  mode: string;
  tlStatus: string;
  tlStatusMeta: any;
  tlAccounts: unknown[];
  tlSavedConfig: Record<string, any> | null;
  tlBalance: unknown;
  tlEquity: unknown;
  tlAccountMetrics: Record<string, any> | null;
  tlRefreshAccounts?: (() => Promise<void> | void) | null;
  tlRefreshAccountMetrics?: (() => Promise<void> | void) | null;
  tlAccountMapRef: React.MutableRefObject<Map<string, any>>;
  activeTradeLockerAccountKey: string | null;
  appendAuditEvent: (payload: any) => void | Promise<void>;
  handleSnapshotSourceChange: (accountKey: string) => Promise<any>;
  resolveTradeLockerAccountEntry: (accountKey: string) => any;
  parseTradeLockerAccountKey: (accountKey: string) => { accountId?: number | null; accNum?: number | null } | null;
  parseTradeLockerAccountNumber: (value: unknown) => number | null;
  areAccountKeysEquivalent: (left: string, right: string) => boolean;
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
  loadFeatureControllers: () => Promise<{
    startIntervalControllerSafe: (args: { intervalMs: number; onTick: () => void }) => (() => void) | null;
  }>;
  selectorSearchStorageKey: string;
  freshMs: number;
  staleMs: number;
  recentUsageMs: number;
  normalRefreshMs: number;
  guardedRefreshMs: number;
}

export interface TradeLockerAccountSelectorRuntime {
  tlAccountSelectorOpen: boolean;
  setTlAccountSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tlAccountSelectorSearch: string;
  setTlAccountSelectorSearch: React.Dispatch<React.SetStateAction<string>>;
  tlAccountSelectorRefreshState: TradeLockerSelectorRefreshState;
  setTlAccountSelectorRefreshState: React.Dispatch<React.SetStateAction<TradeLockerSelectorRefreshState>>;
  tradeLockerAccountSelectorItems: TradeLockerAccountSelectorItem[];
  tradeLockerAccountSelectorSnapshot: TradeLockerAccountSelectorSnapshot;
  tradeLockerAccountSelectorModel: TradeLockerAccountSelectorModel | null;
}

export const useTradeLockerAccountSelectorRuntime = (
  args: UseTradeLockerAccountSelectorRuntimeArgs
): TradeLockerAccountSelectorRuntime => {
  const {
    mode,
    tlStatus,
    tlStatusMeta,
    tlAccounts,
    tlSavedConfig,
    tlBalance,
    tlEquity,
    tlAccountMetrics,
    tlRefreshAccounts,
    tlRefreshAccountMetrics,
    tlAccountMapRef,
    activeTradeLockerAccountKey,
    appendAuditEvent,
    handleSnapshotSourceChange,
    resolveTradeLockerAccountEntry,
    parseTradeLockerAccountKey,
    parseTradeLockerAccountNumber,
    areAccountKeysEquivalent,
    buildTradeLockerAccountKey,
    normalizeTradeLockerAccountRecord,
    loadFeatureControllers,
    selectorSearchStorageKey,
    freshMs,
    staleMs,
    recentUsageMs,
    normalRefreshMs,
    guardedRefreshMs
  } = args;

  const [tlAccountSelectorOpen, setTlAccountSelectorOpen] = React.useState(false);
  const [tlAccountSelectorSearch, setTlAccountSelectorSearch] = React.useState(() => {
    try {
      return localStorage.getItem(selectorSearchStorageKey) || '';
    } catch {
      return '';
    }
  });
  const [tlAccountCardByKey, setTlAccountCardByKey] = React.useState<Record<string, TradeLockerAccountCardCacheEntry>>({});
  const [tlAccountSelectorRefreshState, setTlAccountSelectorRefreshState] = React.useState<TradeLockerSelectorRefreshState>({
    switching: false,
    refreshingAccounts: false,
    refreshingBalances: false,
    queueDepth: 0,
    lastRefreshAtMs: null,
    lastError: null
  });

  const tlAccountSelectorQueueRef = React.useRef<string[]>([]);
  const tlAccountSelectorQueueRunningRef = React.useRef(false);
  const tlAccountSelectorQueuePromiseRef = React.useRef<Promise<void> | null>(null);
  const tlAccountSelectorLastUsedAtRef = React.useRef(0);
  const tlAccountSelectorRoundRobinRef = React.useRef(0);
  const tlAccountSelectorSearchLastAuditAtRef = React.useRef(0);

  React.useEffect(() => {
    try {
      localStorage.setItem(selectorSearchStorageKey, String(tlAccountSelectorSearch || ''));
    } catch {
      // ignore
    }
  }, [selectorSearchStorageKey, tlAccountSelectorSearch]);

  const tradeLockerAccountSelectorBaseRows = React.useMemo(() => {
    return buildTradeLockerAccountSelectorBaseRows({
      activeTradeLockerAccountKey: activeTradeLockerAccountKey,
      tlAccounts: tlAccounts,
      tlSavedConfig: tlSavedConfig,
      tlAccountMetrics: tlAccountMetrics,
      tlBalance: tlBalance,
      tlEquity: tlEquity,
      tlStatus: tlStatus,
      accountMapEntries: Array.from(tlAccountMapRef.current.values()),
      buildTradeLockerAccountKey: buildTradeLockerAccountKey,
      normalizeTradeLockerAccountRecord: normalizeTradeLockerAccountRecord,
      areAccountKeysEquivalent: areAccountKeysEquivalent,
      parseTradeLockerAccountNumber: parseTradeLockerAccountNumber
    });
  }, [
    activeTradeLockerAccountKey,
    areAccountKeysEquivalent,
    buildTradeLockerAccountKey,
    normalizeTradeLockerAccountRecord,
    parseTradeLockerAccountNumber,
    tlAccountMapRef,
    tlAccounts,
    tlAccountMetrics,
    tlBalance,
    tlEquity,
    tlSavedConfig,
    tlStatus
  ]);

  React.useEffect(() => {
    if (tradeLockerAccountSelectorBaseRows.length === 0) return;
    setTlAccountCardByKey((prev) => mergeTradeLockerAccountCardCacheFromBaseRows(prev, tradeLockerAccountSelectorBaseRows));
  }, [tradeLockerAccountSelectorBaseRows]);

  React.useEffect(() => {
    if (!activeTradeLockerAccountKey) return;
    const balance =
      tlAccountMetrics && Number.isFinite(Number(tlAccountMetrics.balance))
        ? Number(tlAccountMetrics.balance)
        : Number.isFinite(Number(tlBalance))
          ? Number(tlBalance)
          : null;
    const equity =
      tlAccountMetrics && Number.isFinite(Number(tlAccountMetrics.equity))
        ? Number(tlAccountMetrics.equity)
        : Number.isFinite(Number(tlEquity))
          ? Number(tlEquity)
          : null;
    const freeMargin =
      tlAccountMetrics && Number.isFinite(Number(tlAccountMetrics.marginFree))
        ? Number(tlAccountMetrics.marginFree)
        : null;
    const lastUpdatedAtMs = Number.isFinite(Number(tlAccountMetrics?.updatedAtMs))
      ? Number(tlAccountMetrics?.updatedAtMs)
      : Date.now();

    setTlAccountCardByKey((prev) => ({
      ...prev,
      [activeTradeLockerAccountKey || '']: {
        ...(prev[activeTradeLockerAccountKey || ''] || {}),
        balance,
        equity,
        freeMargin,
        currency:
          tlAccountMetrics?.currency != null
            ? String(tlAccountMetrics.currency)
            : (prev[activeTradeLockerAccountKey || '']?.currency ?? null),
        lastUpdatedAtMs,
        lastError: null,
        isConnected: tlStatus === 'connected',
        rateLimited: false,
        retryAtMs: null
      }
    }));
  }, [activeTradeLockerAccountKey, tlAccountMetrics, tlBalance, tlEquity, tlStatus]);

  const tradeLockerAccountSelectorItems = React.useMemo(() => {
    return buildTradeLockerAccountSelectorItems({
      activeTradeLockerAccountKey: activeTradeLockerAccountKey,
      search: tlAccountSelectorSearch,
      status: tlStatus,
      freshMs: freshMs,
      staleMs: staleMs,
      rows: tradeLockerAccountSelectorBaseRows,
      cache: tlAccountCardByKey,
      areAccountKeysEquivalent: areAccountKeysEquivalent
    });
  }, [
    activeTradeLockerAccountKey,
    areAccountKeysEquivalent,
    freshMs,
    staleMs,
    tlStatus,
    tlAccountCardByKey,
    tlAccountSelectorSearch,
    tradeLockerAccountSelectorBaseRows
  ]);

  const tradeLockerAccountSelectorSnapshot = React.useMemo(() => {
    return buildTradeLockerAccountSelectorSnapshot({
      activeTradeLockerAccountKey: activeTradeLockerAccountKey,
      items: tradeLockerAccountSelectorItems,
      refreshState: {
        queueDepth: tlAccountSelectorRefreshState.queueDepth,
        lastRefreshAtMs: tlAccountSelectorRefreshState.lastRefreshAtMs,
        lastError: tlAccountSelectorRefreshState.lastError
      }
    });
  }, [
    activeTradeLockerAccountKey,
    tlAccountSelectorRefreshState.lastError,
    tlAccountSelectorRefreshState.lastRefreshAtMs,
    tlAccountSelectorRefreshState.queueDepth,
    tradeLockerAccountSelectorItems
  ]);

  const refreshTradeLockerAccountCardMetrics = React.useCallback(
    async (accountKey: string) => {
      const canonicalKey = String(accountKey || '').trim();
      if (!canonicalKey) return { ok: false as const, error: 'Account key missing.' };
      const bridge = window.glass?.tradelocker;
      if (!bridge?.getAccountMetricsForAccount) {
        const err = 'TradeLocker account metrics bridge unavailable.';
        setTlAccountCardByKey((prev) => ({
          ...prev,
          [canonicalKey]: {
            ...(prev[canonicalKey] || {}),
            lastError: err,
            isConnected: false
          }
        }));
        return { ok: false as const, error: err };
      }
      const resolved = resolveTradeLockerAccountEntry(canonicalKey);
      const parsed = parseTradeLockerAccountKey(canonicalKey);
      const accountId = parseTradeLockerAccountNumber(resolved?.accountId ?? parsed?.accountId);
      const accNum = parseTradeLockerAccountNumber(resolved?.accNum ?? parsed?.accNum);
      if (accountId == null || accNum == null) {
        const err = 'TradeLocker account identity incomplete.';
        setTlAccountCardByKey((prev) => ({
          ...prev,
          [canonicalKey]: {
            ...(prev[canonicalKey] || {}),
            lastError: err,
            isConnected: false
          }
        }));
        return { ok: false as const, error: err };
      }
      try {
        const res = await bridge.getAccountMetricsForAccount({
          accountId,
          accNum,
          maxAgeMs: 0
        });
        if (!res?.ok) {
          const err = res?.error ? String(res.error) : 'Failed to refresh account metrics.';
          setTlAccountCardByKey((prev) => ({
            ...prev,
            [canonicalKey]: {
              ...(prev[canonicalKey] || {}),
              lastError: err,
              isConnected: false,
              rateLimited: !!res?.rateLimited,
              retryAtMs: Number.isFinite(Number(res?.retryAtMs)) ? Number(res.retryAtMs) : null
            }
          }));
          return { ok: false as const, error: err };
        }
        const updatedAtMs = Number.isFinite(Number(res?.updatedAtMs)) ? Number(res.updatedAtMs) : Date.now();
        setTlAccountCardByKey((prev) => ({
          ...prev,
          [canonicalKey]: {
            ...(prev[canonicalKey] || {}),
            balance: Number.isFinite(Number(res?.balance)) ? Number(res.balance) : (prev[canonicalKey]?.balance ?? null),
            equity: Number.isFinite(Number(res?.equity)) ? Number(res.equity) : (prev[canonicalKey]?.equity ?? null),
            freeMargin: Number.isFinite(Number(res?.marginFree)) ? Number(res.marginFree) : (prev[canonicalKey]?.freeMargin ?? null),
            currency: res?.currency != null ? String(res.currency) : (prev[canonicalKey]?.currency ?? null),
            lastUpdatedAtMs: updatedAtMs,
            lastError: null,
            isConnected: true,
            rateLimited: !!res?.rateLimited,
            retryAtMs: Number.isFinite(Number(res?.retryAtMs)) ? Number(res.retryAtMs) : null
          }
        }));
        return { ok: true as const };
      } catch (err: any) {
        const message = err?.message ? String(err.message) : 'Failed to refresh account metrics.';
        setTlAccountCardByKey((prev) => ({
          ...prev,
          [canonicalKey]: {
            ...(prev[canonicalKey] || {}),
            lastError: message,
            isConnected: false
          }
        }));
        return { ok: false as const, error: message };
      }
    },
    [parseTradeLockerAccountKey, parseTradeLockerAccountNumber, resolveTradeLockerAccountEntry]
  );

  const runTradeLockerAccountSelectorQueue = React.useCallback(() => {
    if (tlAccountSelectorQueuePromiseRef.current) return tlAccountSelectorQueuePromiseRef.current;
    const task = (async () => {
      tlAccountSelectorQueueRunningRef.current = true;
      setTlAccountSelectorRefreshState((prev) => ({ ...prev, refreshingBalances: true }));
      try {
        while (tlAccountSelectorQueueRef.current.length > 0) {
          const nextKey = tlAccountSelectorQueueRef.current.shift() || '';
          setTlAccountSelectorRefreshState((prev) => ({ ...prev, queueDepth: tlAccountSelectorQueueRef.current.length }));
          if (!nextKey) continue;
          await refreshTradeLockerAccountCardMetrics(nextKey);
        }
        setTlAccountSelectorRefreshState((prev) => ({
          ...prev,
          refreshingBalances: false,
          queueDepth: 0,
          lastRefreshAtMs: Date.now()
        }));
      } finally {
        tlAccountSelectorQueueRunningRef.current = false;
        tlAccountSelectorQueuePromiseRef.current = null;
      }
    })();
    tlAccountSelectorQueuePromiseRef.current = task;
    return task;
  }, [refreshTradeLockerAccountCardMetrics]);

  const enqueueTradeLockerAccountSelectorRefresh = React.useCallback(
    (accountKeys: string[]) => {
      const queue = tlAccountSelectorQueueRef.current;
      for (const rawKey of Array.isArray(accountKeys) ? accountKeys : []) {
        const key = String(rawKey || '').trim();
        if (!key || queue.includes(key)) continue;
        queue.push(key);
      }
      setTlAccountSelectorRefreshState((prev) => ({ ...prev, queueDepth: queue.length }));
      return runTradeLockerAccountSelectorQueue();
    },
    [runTradeLockerAccountSelectorQueue]
  );

  const handleTradeLockerAccountSelectorRefreshAccounts = React.useCallback(async () => {
    setTlAccountSelectorRefreshState((prev) => ({ ...prev, refreshingAccounts: true, lastError: null }));
    void appendAuditEvent({
      eventType: 'tradelocker_account_selector_refresh_requested',
      payload: { source: 'browser_chrome_selector', target: 'accounts' }
    });
    try {
      if (tlRefreshAccounts) {
        await tlRefreshAccounts();
      }
      setTlAccountSelectorRefreshState((prev) => ({
        ...prev,
        refreshingAccounts: false,
        lastRefreshAtMs: Date.now(),
        lastError: null
      }));
      void appendAuditEvent({
        eventType: 'tradelocker_account_selector_refresh_completed',
        payload: { source: 'browser_chrome_selector', target: 'accounts', ok: true }
      });
    } catch (err: any) {
      const message = err?.message ? String(err.message) : 'Failed to refresh accounts.';
      setTlAccountSelectorRefreshState((prev) => ({
        ...prev,
        refreshingAccounts: false,
        lastError: message
      }));
      void appendAuditEvent({
        eventType: 'tradelocker_account_selector_refresh_completed',
        level: 'warn',
        payload: { source: 'browser_chrome_selector', target: 'accounts', ok: false, error: message }
      });
    }
  }, [appendAuditEvent, tlRefreshAccounts]);

  const handleTradeLockerAccountSelectorRefreshBalances = React.useCallback(
    async (opts?: { reason?: 'manual' | 'auto' }) => {
      const reason = opts?.reason || 'manual';
      const targetKeys = tradeLockerAccountSelectorItems.filter((item) => !item.isActive).map((item) => item.accountKey);
      tlAccountSelectorLastUsedAtRef.current = Date.now();
      if (reason === 'manual') {
        void appendAuditEvent({
          eventType: 'tradelocker_account_selector_refresh_requested',
          payload: { source: 'browser_chrome_selector', target: 'balances', count: targetKeys.length }
        });
      }
      if (activeTradeLockerAccountKey && tlRefreshAccountMetrics) {
        try {
          await tlRefreshAccountMetrics();
        } catch {
          // ignore active metrics refresh failures; queued inactive fetches still run
        }
      }
      await enqueueTradeLockerAccountSelectorRefresh(targetKeys);
      if (reason === 'manual') {
        void appendAuditEvent({
          eventType: 'tradelocker_account_selector_refresh_completed',
          payload: { source: 'browser_chrome_selector', target: 'balances', ok: true, count: targetKeys.length }
        });
      }
    },
    [
      activeTradeLockerAccountKey,
      appendAuditEvent,
      enqueueTradeLockerAccountSelectorRefresh,
      tlRefreshAccountMetrics,
      tradeLockerAccountSelectorItems
    ]
  );

  const handleTradeLockerAccountSelectorSelect = React.useCallback(
    async (accountKey: string) => {
      const nextKey = String(accountKey || '').trim();
      if (!nextKey) return;
      tlAccountSelectorLastUsedAtRef.current = Date.now();
      setTlAccountSelectorRefreshState((prev) => ({ ...prev, switching: true, lastError: null }));
      void appendAuditEvent({
        eventType: 'tradelocker_account_selector_switch_requested',
        payload: { source: 'browser_chrome_selector', accountKey: nextKey }
      });
      try {
        const res = await handleSnapshotSourceChange(nextKey);
        if (!res?.ok) {
          const message = res?.error ? String(res.error) : 'Failed to switch account.';
          setTlAccountSelectorRefreshState((prev) => ({ ...prev, switching: false, lastError: message }));
          void appendAuditEvent({
            eventType: 'tradelocker_account_selector_switch_failed',
            level: 'warn',
            payload: { source: 'browser_chrome_selector', accountKey: nextKey, error: message }
          });
          return;
        }
        setTlAccountSelectorRefreshState((prev) => ({ ...prev, switching: false, lastError: null }));
        setTlAccountSelectorOpen(false);
        void appendAuditEvent({
          eventType: 'tradelocker_account_selector_switch_succeeded',
          payload: { source: 'browser_chrome_selector', accountKey: nextKey, resolvedBy: res?.resolvedBy || 'exact' }
        });
      } catch (err: any) {
        const message = err?.message ? String(err.message) : 'Failed to switch account.';
        setTlAccountSelectorRefreshState((prev) => ({ ...prev, switching: false, lastError: message }));
        void appendAuditEvent({
          eventType: 'tradelocker_account_selector_switch_failed',
          level: 'warn',
          payload: { source: 'browser_chrome_selector', accountKey: nextKey, error: message }
        });
      }
    },
    [appendAuditEvent, handleSnapshotSourceChange]
  );

  const tradeLockerSelectorActionBundle = React.useMemo(
    () =>
      createTradeLockerSelectorActionBundle({
        setTlAccountSelectorSearch,
        appendAuditEvent: appendAuditEvent,
        tlAccountSelectorSearchLastAuditAtRef,
        setTlAccountSelectorOpen,
        tlAccountSelectorLastUsedAtRef,
        tradeLockerAccountSelectorItemsLength: tradeLockerAccountSelectorItems.length,
        handleTradeLockerAccountSelectorRefreshAccounts,
        handleTradeLockerAccountSelectorRefreshBalances
      }),
    [
      appendAuditEvent,
      handleTradeLockerAccountSelectorRefreshAccounts,
      handleTradeLockerAccountSelectorRefreshBalances,
      tradeLockerAccountSelectorItems.length
    ]
  );

  const handleTradeLockerAccountSelectorSearch = tradeLockerSelectorActionBundle.handleTradeLockerAccountSelectorSearch;
  const handleTradeLockerAccountSelectorToggleOpen = tradeLockerSelectorActionBundle.handleTradeLockerAccountSelectorToggleOpen;
  const handleTradeLockerAccountSelectorClose = tradeLockerSelectorActionBundle.handleTradeLockerAccountSelectorClose;

  React.useEffect(() => {
    const now = Date.now();
    const recentlyUsed =
      tlAccountSelectorOpen || now - tlAccountSelectorLastUsedAtRef.current <= recentUsageMs;
    if (!recentlyUsed) return;
    const mode = String(tlStatusMeta?.rateLimitTelemetry?.mode || 'normal').trim().toLowerCase();
    if (mode === 'cooldown') return;
    const intervalMs = mode === 'guarded' ? guardedRefreshMs : normalRefreshMs;
    let cancelled = false;
    let stop: (() => void) | null = null;
    const onTick = () => {
      if (tlAccountSelectorQueueRunningRef.current) return;
      if (tlAccountSelectorRefreshState.switching) return;
      const candidates = tradeLockerAccountSelectorItems.filter((item) => !item.isActive && item.status !== 'fresh');
      if (candidates.length === 0) return;
      const index = tlAccountSelectorRoundRobinRef.current % candidates.length;
      tlAccountSelectorRoundRobinRef.current += 1;
      const next = candidates[index];
      if (!next?.accountKey) return;
      void enqueueTradeLockerAccountSelectorRefresh([next.accountKey]);
    };
    void loadFeatureControllers()
      .then((mod) => {
        if (cancelled) return;
        stop = mod.startIntervalControllerSafe({
          intervalMs,
          onTick
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [
    guardedRefreshMs,
    loadFeatureControllers,
    normalRefreshMs,
    recentUsageMs,
    enqueueTradeLockerAccountSelectorRefresh,
    tlAccountSelectorOpen,
    tlAccountSelectorRefreshState.switching,
    tlStatusMeta?.rateLimitTelemetry?.mode,
    tradeLockerAccountSelectorItems
  ]);

  const showTradeLockerAccountSelector = React.useMemo(() => {
    const hasRows = tradeLockerAccountSelectorItems.length > 0;
    const tradeLockerActive =
      mode === 'tradelocker' || tlStatus === 'connected' || tlStatus === 'degraded_account_auth';
    return hasRows && tradeLockerActive;
  }, [mode, tlStatus, tradeLockerAccountSelectorItems.length]);

  const tradeLockerAccountSelectorModel = React.useMemo(
    () =>
      buildTradeLockerAccountSelectorModel({
        show: showTradeLockerAccountSelector,
        items: tradeLockerAccountSelectorItems,
        isOpen: tlAccountSelectorOpen,
        search: tlAccountSelectorSearch,
        refreshState: tlAccountSelectorRefreshState,
        onToggleOpen: handleTradeLockerAccountSelectorToggleOpen,
        onClose: handleTradeLockerAccountSelectorClose,
        onSearchChange: handleTradeLockerAccountSelectorSearch,
        onSelect: handleTradeLockerAccountSelectorSelect,
        onRefreshAccounts: () => {
          void handleTradeLockerAccountSelectorRefreshAccounts();
        },
        onRefreshBalances: () => {
          void handleTradeLockerAccountSelectorRefreshBalances({ reason: 'manual' });
        }
      }),
    [
      handleTradeLockerAccountSelectorClose,
      handleTradeLockerAccountSelectorRefreshAccounts,
      handleTradeLockerAccountSelectorRefreshBalances,
      handleTradeLockerAccountSelectorSearch,
      handleTradeLockerAccountSelectorSelect,
      handleTradeLockerAccountSelectorToggleOpen,
      showTradeLockerAccountSelector,
      tlAccountSelectorOpen,
      tlAccountSelectorRefreshState,
      tlAccountSelectorSearch,
      tradeLockerAccountSelectorItems
    ]
  );

  return {
    tlAccountSelectorOpen,
    setTlAccountSelectorOpen,
    tlAccountSelectorSearch,
    setTlAccountSelectorSearch,
    tlAccountSelectorRefreshState,
    setTlAccountSelectorRefreshState,
    tradeLockerAccountSelectorItems,
    tradeLockerAccountSelectorSnapshot,
    tradeLockerAccountSelectorModel
  };
};
