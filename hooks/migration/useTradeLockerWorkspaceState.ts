import React from 'react';
import type { EnterpriseFeatureFlags } from '../../services/enterpriseFeatureFlags';
import { useTradeLockerAccountStore } from '../../stores/tradeLockerAccountStore';
import {
  buildParityMismatchKey,
  parityValuesEqual,
  type MigrationParitySlice
} from '../../services/migrationParity';

type SetStateAction<T> = React.SetStateAction<T>;

const resolveNext = <T,>(action: SetStateAction<T>, prev: T): T =>
  typeof action === 'function' ? (action as (input: T) => T)(prev) : action;

export interface TradeLockerSelectorRefreshState {
  switching: boolean;
  refreshingAccounts: boolean;
  refreshingBalances: boolean;
  queueDepth: number;
  lastRefreshAtMs: number | null;
  lastError: string | null;
}

export interface UseTradeLockerWorkspaceStateArgs {
  flags: EnterpriseFeatureFlags;
  activeTradeLockerAccountKey: string | null;
  legacySelectorOpen: boolean;
  setLegacySelectorOpen: React.Dispatch<SetStateAction<boolean>>;
  legacySelectorSearch: string;
  setLegacySelectorSearch: React.Dispatch<SetStateAction<string>>;
  legacyRefreshState: TradeLockerSelectorRefreshState;
  setLegacyRefreshState: React.Dispatch<SetStateAction<TradeLockerSelectorRefreshState>>;
  onParityMismatch?: (slice: MigrationParitySlice, field: string, legacyValue: any, storeValue: any) => void;
}

export const useTradeLockerWorkspaceState = ({
  flags,
  activeTradeLockerAccountKey,
  legacySelectorOpen,
  setLegacySelectorOpen,
  legacySelectorSearch,
  setLegacySelectorSearch,
  legacyRefreshState,
  setLegacyRefreshState,
  onParityMismatch
}: UseTradeLockerWorkspaceStateArgs) => {
  const storeActiveAccountKey = useTradeLockerAccountStore((state) => state.activeAccountKey);
  const storeSwitching = useTradeLockerAccountStore((state) => state.switching);
  const storeSelectorOpen = useTradeLockerAccountStore((state) => state.selectorOpen);
  const storeSelectorSearch = useTradeLockerAccountStore((state) => state.selectorSearch);
  const storeQueueDepth = useTradeLockerAccountStore((state) => state.refreshQueueDepth);
  const storeLastRefreshAtMs = useTradeLockerAccountStore((state) => state.lastRefreshAtMs);
  const storeLastRefreshError = useTradeLockerAccountStore((state) => state.lastRefreshError);
  const setStoreActiveAccountKey = useTradeLockerAccountStore((state) => state.setActiveAccountKey);
  const setStoreSwitching = useTradeLockerAccountStore((state) => state.setSwitching);
  const setStoreSelectorOpen = useTradeLockerAccountStore((state) => state.setSelectorOpen);
  const setStoreSelectorSearch = useTradeLockerAccountStore((state) => state.setSelectorSearch);
  const setStoreRefreshState = useTradeLockerAccountStore((state) => state.setRefreshState);
  const parityKeysRef = React.useRef<Set<string>>(new Set());

  const sliceEnabled = flags.zustandMigrationV1 && flags.zustandTradeLockerSliceV1;
  const parityEnabled = flags.phase4ParityAuditV1;

  const tlAccountSelectorOpen =
    sliceEnabled && typeof storeSelectorOpen === 'boolean'
      ? storeSelectorOpen
      : legacySelectorOpen;
  const tlAccountSelectorSearch =
    sliceEnabled && typeof storeSelectorSearch === 'string'
      ? storeSelectorSearch
      : legacySelectorSearch;
  const tlAccountSelectorRefreshState: TradeLockerSelectorRefreshState =
    sliceEnabled
      ? {
          ...legacyRefreshState,
          switching: storeSwitching === true,
          queueDepth: Number(storeQueueDepth || 0),
          lastRefreshAtMs: storeLastRefreshAtMs ?? null,
          lastError: storeLastRefreshError || null
        }
      : legacyRefreshState;

  React.useEffect(() => {
    if (!sliceEnabled) return;
    try {
      setStoreActiveAccountKey(activeTradeLockerAccountKey ?? null);
    } catch {
      // fallback to legacy state only
    }
  }, [activeTradeLockerAccountKey, setStoreActiveAccountKey, sliceEnabled]);

  React.useEffect(() => {
    if (!sliceEnabled) return;
    try {
      setStoreSwitching(legacyRefreshState.switching === true);
      setStoreSelectorOpen(legacySelectorOpen === true);
      setStoreSelectorSearch(String(legacySelectorSearch || ''));
      setStoreRefreshState({
        refreshQueueDepth: Number(legacyRefreshState.queueDepth || 0),
        lastRefreshAtMs: legacyRefreshState.lastRefreshAtMs ?? null,
        lastRefreshError: legacyRefreshState.lastError || null
      });
    } catch {
      // fallback to legacy state only
    }
  }, [
    legacyRefreshState.lastError,
    legacyRefreshState.lastRefreshAtMs,
    legacyRefreshState.queueDepth,
    legacyRefreshState.switching,
    legacySelectorOpen,
    legacySelectorSearch,
    setStoreRefreshState,
    setStoreSelectorOpen,
    setStoreSelectorSearch,
    setStoreSwitching,
    sliceEnabled
  ]);

  React.useEffect(() => {
    if (!sliceEnabled || !parityEnabled || typeof onParityMismatch !== 'function') return;
    const checks: Array<{ field: string; legacy: any; store: any }> = [
      { field: 'activeAccountKey', legacy: activeTradeLockerAccountKey, store: storeActiveAccountKey },
      { field: 'switching', legacy: legacyRefreshState.switching === true, store: storeSwitching === true },
      { field: 'selectorOpen', legacy: legacySelectorOpen === true, store: storeSelectorOpen === true },
      { field: 'selectorSearch', legacy: String(legacySelectorSearch || ''), store: String(storeSelectorSearch || '') },
      { field: 'queueDepth', legacy: Number(legacyRefreshState.queueDepth || 0), store: Number(storeQueueDepth || 0) },
      { field: 'lastRefreshAtMs', legacy: legacyRefreshState.lastRefreshAtMs ?? null, store: storeLastRefreshAtMs ?? null },
      { field: 'lastRefreshError', legacy: legacyRefreshState.lastError || null, store: storeLastRefreshError || null }
    ];
    for (const check of checks) {
      if (parityValuesEqual(check.legacy, check.store)) continue;
      const mismatchKey = buildParityMismatchKey('tradeLocker', check.field, check.legacy, check.store);
      if (parityKeysRef.current.has(mismatchKey)) continue;
      parityKeysRef.current.add(mismatchKey);
      onParityMismatch('tradeLocker', check.field, check.legacy, check.store);
    }
  }, [
    activeTradeLockerAccountKey,
    legacyRefreshState.lastError,
    legacyRefreshState.lastRefreshAtMs,
    legacyRefreshState.queueDepth,
    legacyRefreshState.switching,
    legacySelectorOpen,
    legacySelectorSearch,
    onParityMismatch,
    parityEnabled,
    sliceEnabled,
    storeActiveAccountKey,
    storeLastRefreshAtMs,
    storeLastRefreshError,
    storeQueueDepth,
    storeSelectorOpen,
    storeSelectorSearch,
    storeSwitching
  ]);

  const setTlAccountSelectorOpen = React.useCallback((action: SetStateAction<boolean>) => {
    setLegacySelectorOpen((prev) => {
      const next = resolveNext<boolean>(action, prev) === true;
      try {
        setStoreSelectorOpen(next);
      } catch {
        // fallback to legacy state only
      }
      return next;
    });
  }, [setLegacySelectorOpen, setStoreSelectorOpen]);

  const setTlAccountSelectorSearch = React.useCallback((action: SetStateAction<string>) => {
    setLegacySelectorSearch((prev) => {
      const next = String(resolveNext<string>(action, prev) || '');
      try {
        setStoreSelectorSearch(next);
      } catch {
        // fallback to legacy state only
      }
      return next;
    });
  }, [setLegacySelectorSearch, setStoreSelectorSearch]);

  const setTlAccountSelectorRefreshState = React.useCallback((action: SetStateAction<TradeLockerSelectorRefreshState>) => {
    setLegacyRefreshState((prev) => {
      const next = resolveNext<TradeLockerSelectorRefreshState>(action, prev);
      try {
        setStoreSwitching(next.switching === true);
        setStoreRefreshState({
          refreshQueueDepth: Number(next.queueDepth || 0),
          lastRefreshAtMs: next.lastRefreshAtMs ?? null,
          lastRefreshError: next.lastError || null
        });
      } catch {
        // fallback to legacy state only
      }
      return next;
    });
  }, [setLegacyRefreshState, setStoreRefreshState, setStoreSwitching]);

  return {
    activeTradeLockerAccountKey:
      sliceEnabled && (storeActiveAccountKey == null || typeof storeActiveAccountKey === 'string')
        ? storeActiveAccountKey
        : activeTradeLockerAccountKey,
    tlAccountSelectorOpen,
    setTlAccountSelectorOpen,
    tlAccountSelectorSearch,
    setTlAccountSelectorSearch,
    tlAccountSelectorRefreshState,
    setTlAccountSelectorRefreshState
  };
};
