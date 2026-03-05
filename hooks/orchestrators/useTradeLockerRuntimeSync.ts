import React from 'react';
import { GLASS_EVENT } from '../../services/glassEvents';

type UseTradeLockerRuntimeSyncArgs = {
  tlAccounts: any[];
  tlSavedConfig: any;
  tlSnapshotSourceKey: string;
  setTlSnapshotSourceKey: (value: string) => void;
  tlNormalizeRefKey: string;
  setTlNormalizeRefKey: (value: string) => void;
  tlAccountMapRef: React.MutableRefObject<Map<string, any>>;
  normalizeTradeLockerAccountRecord: (value: any, opts: { env: string; server: string }) => any;
  buildTradeLockerAccountKey: (value: { env?: string | null; server?: string | null; accountId?: any; accNum?: any }) => string;
  tlShardScheduler: any;
  tlTenantRegistry: any;
  tlStrategyRuntime: any;
  tlMarketBus: any;
  setupWatchers: any[];
  tlStrategyAssignments: Record<string, string[]>;
  setTlStrategyAssignments: (value: Record<string, string[]>) => void;
  setTlShardStates: (value: any[]) => void;
  setTlStrategyMatrixRows: (value: any[]) => void;
  setTlMarketSubscriptions: (value: any[]) => void;
  tlStatusMeta: any;
  promoteTradeLockerPrimaryRouting: (args: any) => Promise<any>;
  parseTradeLockerAccountNumber: (value: any) => number | null;
  tlStatus: string;
  tlRefreshAccounts: (() => void) | null | undefined;
};

export const useTradeLockerRuntimeSync = (args: UseTradeLockerRuntimeSyncArgs) => {
  const {
    tlAccounts,
    tlSavedConfig,
    tlSnapshotSourceKey,
    setTlSnapshotSourceKey,
    tlNormalizeRefKey,
    setTlNormalizeRefKey,
    tlAccountMapRef,
    normalizeTradeLockerAccountRecord,
    buildTradeLockerAccountKey,
    tlShardScheduler,
    tlTenantRegistry,
    tlStrategyRuntime,
    tlMarketBus,
    setupWatchers,
    tlStrategyAssignments,
    setTlStrategyAssignments,
    setTlShardStates,
    setTlStrategyMatrixRows,
    setTlMarketSubscriptions,
    tlStatusMeta,
    promoteTradeLockerPrimaryRouting,
    parseTradeLockerAccountNumber,
    tlStatus,
    tlRefreshAccounts
  } = args;

  const tlAccountsRef = React.useRef(tlAccounts);

  React.useEffect(() => {
    const accountsList = Array.isArray(tlAccounts) ? tlAccounts : [];
    tlAccountsRef.current = accountsList;
    const map = new Map<string, any>();
    const env = tlSavedConfig?.env ? String(tlSavedConfig.env).trim().toLowerCase() : '';
    const server = tlSavedConfig?.server ? String(tlSavedConfig.server).trim().toLowerCase() : '';
    const addNormalizedEntry = (normalized: any) => {
      if (!normalized) return;
      const accountKey =
        normalized.accountKey ||
        buildTradeLockerAccountKey({
          env,
          server,
          accountId: normalized.accountId,
          accNum: normalized.accNum ?? null
        }) ||
        buildTradeLockerAccountKey({
          env,
          server,
          accountId: normalized.accountId,
          accNum: null
        });
      if (!accountKey) return;
      const fallbackKey = buildTradeLockerAccountKey({
        env,
        server,
        accountId: normalized.accountId,
        accNum: null
      });
      const aliases = Array.from(
        new Set([
          accountKey,
          fallbackKey,
          ...(Array.isArray(normalized.aliases) ? normalized.aliases : [])
        ].filter((value): value is string => !!String(value || '').trim()))
      );
      const entry = {
        env,
        server,
        accountId: normalized.accountId,
        accNum: normalized.accNum ?? null,
        accountKey,
        aliases
      };
      for (const alias of aliases) {
        const key = String(alias || '').trim();
        if (!key) continue;
        map.set(key, entry);
      }
    };

    if (env && server) {
      for (const acct of accountsList) {
        addNormalizedEntry(normalizeTradeLockerAccountRecord(acct, { env, server }));
      }
      addNormalizedEntry(
        normalizeTradeLockerAccountRecord(
          {
            accountId: tlSavedConfig?.accountId,
            accNum: tlSavedConfig?.accNum
          },
          { env, server }
        )
      );
    }
    tlAccountMapRef.current = map;
    if (map.size > 0) {
      const canonical = Array.from(new Set(Array.from(map.values()).map((entry: any) => entry.accountKey).filter(Boolean)));
      const fallback = canonical.length > 0 ? canonical[0] : null;
      if (fallback) {
        if (!tlSnapshotSourceKey || !map.has(tlSnapshotSourceKey)) {
          setTlSnapshotSourceKey(fallback);
        }
        if (!tlNormalizeRefKey || !map.has(tlNormalizeRefKey)) {
          setTlNormalizeRefKey(fallback);
        }
      }
    }
  }, [tlAccounts, tlSavedConfig?.env, tlSavedConfig?.server, tlSavedConfig?.accountId, tlSavedConfig?.accNum, tlSnapshotSourceKey, tlNormalizeRefKey, tlAccountMapRef, normalizeTradeLockerAccountRecord, buildTradeLockerAccountKey, setTlSnapshotSourceKey, setTlNormalizeRefKey]);

  React.useEffect(() => {
    const env = tlSavedConfig?.env ? String(tlSavedConfig.env).trim().toLowerCase() : '';
    const server = tlSavedConfig?.server ? String(tlSavedConfig.server).trim().toLowerCase() : '';
    const accountKeys = new Set<string>();
    if (env && server) {
      for (const acct of Array.isArray(tlAccounts) ? tlAccounts : []) {
        const normalized = normalizeTradeLockerAccountRecord(acct, { env, server });
        const accountKey = normalized?.accountKey || buildTradeLockerAccountKey({
          env,
          server,
          accountId: normalized?.accountId,
          accNum: normalized?.accNum ?? null
        });
        if (!accountKey) continue;
        accountKeys.add(accountKey);
        tlShardScheduler.ensureShard(accountKey);
      }
      const activeKey = buildTradeLockerAccountKey({
        env,
        server,
        accountId: tlSavedConfig?.accountId,
        accNum: tlSavedConfig?.accNum ?? null
      });
      if (activeKey) accountKeys.add(activeKey);
    }

    const activeAccountKey = buildTradeLockerAccountKey({
      env,
      server,
      accountId: tlSavedConfig?.accountId,
      accNum: tlSavedConfig?.accNum ?? null
    });

    const incomingAssignments: Record<string, string[]> = { ...tlStrategyAssignments };
    const hasConfiguredAssignments = Object.keys(incomingAssignments).length > 0;
    if (!hasConfiguredAssignments && activeAccountKey) {
      incomingAssignments.manual = [activeAccountKey];
      setTlStrategyAssignments(incomingAssignments);
    }

    for (const [strategyId, assigned] of Object.entries(incomingAssignments)) {
      tlStrategyRuntime.assignStrategyAccounts(strategyId, assigned);
    }
    tlStrategyRuntime.syncFromWatchers(setupWatchers, { defaultAccountKey: activeAccountKey || null });

    const shards = tlShardScheduler.getSnapshot();
    for (const shard of shards) {
      if (!accountKeys.has(shard.accountKey)) continue;
      if (shard.accountKey === activeAccountKey) {
        tlTenantRegistry.updateShard(shard.accountKey, {
          queueDepth: Number(shard.queueDepth || 0),
          rateBudget: Number(shard.rateBudget || 0),
          circuitState: (shard.circuitState || 'closed') as any,
          lastError: shard.lastError || tlStatusMeta?.accountProbeLastError || null,
          lastReconcileAtMs: shard.lastReconcileAtMs ?? null
        });
      } else {
        tlTenantRegistry.updateShard(shard.accountKey, {
          queueDepth: Number(shard.queueDepth || 0),
          rateBudget: Number(shard.rateBudget || 0),
          circuitState: (shard.circuitState || 'closed') as any,
          lastError: shard.lastError || null,
          lastReconcileAtMs: shard.lastReconcileAtMs ?? null
        });
      }
    }

    setTlShardStates(shards.map((entry: any) => ({ ...entry })));
    setTlStrategyMatrixRows(tlStrategyRuntime.listRuntimes());
    setTlMarketSubscriptions(tlMarketBus.getSubscriptionSnapshot());
  }, [
    setupWatchers,
    tlAccounts,
    tlSavedConfig?.accNum,
    tlSavedConfig?.accountId,
    tlSavedConfig?.env,
    tlSavedConfig?.server,
    tlShardScheduler,
    tlStatusMeta?.accountProbeLastError,
    tlMarketBus,
    tlStrategyAssignments,
    tlStrategyRuntime,
    tlTenantRegistry,
    normalizeTradeLockerAccountRecord,
    buildTradeLockerAccountKey,
    setTlShardStates,
    setTlStrategyAssignments,
    setTlStrategyMatrixRows,
    setTlMarketSubscriptions
  ]);

  React.useEffect(() => {
    const eventName = GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED;
    const promotableSources = new Set([
      'settings_modal_select_direct',
      'tradelocker_panel_direct',
      'external_codex'
    ]);
    const onAccountChanged = (evt: Event) => {
      const custom = evt as CustomEvent<any>;
      const detail = custom?.detail && typeof custom.detail === 'object' ? custom.detail : {};
      if (detail?.skipPrimarySync === true) return;
      const source = String(detail?.source || '').trim().toLowerCase();
      const shouldPromote = detail?.makePrimary === true || promotableSources.has(source);
      if (!shouldPromote) return;
      void promoteTradeLockerPrimaryRouting({
        accountKey: detail?.accountKey ? String(detail.accountKey) : null,
        accountId: parseTradeLockerAccountNumber(detail?.accountId),
        accNum: parseTradeLockerAccountNumber(detail?.accNum),
        source: source || 'unknown',
        stage: detail?.stage ? String(detail.stage) : 'account_changed_event',
        resolvedBy: detail?.resolvedBy === 'accountId_fallback' || detail?.resolvedBy === 'reconnect_retry'
          ? detail.resolvedBy
          : 'exact',
        retryRefresh: true
      });
    };
    window.addEventListener(eventName, onAccountChanged as EventListener);
    return () => {
      window.removeEventListener(eventName, onAccountChanged as EventListener);
    };
  }, [promoteTradeLockerPrimaryRouting, parseTradeLockerAccountNumber]);

  React.useEffect(() => {
    if (tlStatus === 'connected') {
      try {
        tlRefreshAccounts?.();
      } catch {
        // ignore
      }
    }
  }, [tlRefreshAccounts, tlStatus]);
};
