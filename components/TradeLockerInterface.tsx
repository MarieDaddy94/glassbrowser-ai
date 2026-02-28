import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, TrendingUp, TrendingDown, Clock, RotateCw, Settings, Send, X, ChevronUp, ChevronDown, Link2, Plus, Eye, EyeOff } from 'lucide-react';
import { EvidenceCard, Position, TradeLockerAccountMetrics, TradeLockerOrder, TradeLockerQuote, TradeLockerRateLimitTelemetry } from '../types';
import type { SymbolMapEntry } from '../services/brokerLink';
import { normalizeSymbolKey } from '../services/symbols';
import { getRuntimeScheduler } from '../services/runtimeScheduler';
import { requireBridge } from '../services/bridgeGuard';
import { createPanelActionRunner } from '../services/panelConnectivityEngine';
import { GLASS_EVENT, dispatchGlassEvent } from '../services/glassEvents';
import { areAccountKeysEquivalent } from '../services/accountKeyIdentity';
import {
  buildTradeLockerProfileBaseId,
  buildTradeLockerAccountKey,
  buildTradeLockerProfileId,
  buildTradeLockerProfileLabel,
  normalizeTradeLockerAccountRecord,
  normalizeTradeLockerProfileId,
  parseTradeLockerAccountNumber,
  parseTradeLockerProfileId,
  resolveTradeLockerIdentityMatchState
} from '../services/tradeLockerIdentity';

interface TradeLockerInstrumentSuggestion {
  tradableInstrumentId: number | null;
  symbol: string;
  displayName: string | null;
}

interface TradeLockerInterfaceProps {
    balance: number;
    equity: number;
    positions: Position[];
    orders?: TradeLockerOrder[];
    ordersError?: string | null;
    brokerQuotes?: Record<string, TradeLockerQuote>;
    brokerQuotesUpdatedAtMs?: number | null;
    brokerQuotesError?: string | null;
    accountMetrics?: TradeLockerAccountMetrics | null;
    accountMetricsError?: string | null;
    snapshotUpdatedAtMs?: number | null;
    streamStatus?: string | null;
    streamUpdatedAtMs?: number | null;
    streamError?: string | null;
    rateLimitTelemetry?: TradeLockerRateLimitTelemetry | null;
    accounts?: Array<{
      id: number;
      accountId?: number;
      name: string;
      accNum?: number;
      accountNum?: number;
      accountNumber?: number;
      currency?: string;
      status?: string;
    }>;
    accountsError?: string | null;
    activeAccount?: {
      env?: 'demo' | 'live' | null;
      server?: string | null;
      accountId?: number | null;
      accNum?: number | null;
    } | null;
    snapshotSourceKey?: string | null;
    snapshotAutoSwitch?: boolean;
    snapshotFallbackOrder?: string[];
    executionTargets?: string[];
    normalizationEnabled?: boolean;
    normalizationReferenceKey?: string | null;
    symbolMap?: SymbolMapEntry[];
    onRefresh?: () => void;
    onRefreshAccounts?: () => void;
    onClosePosition: (id: string, qty?: number) => void | Promise<any>;
    onCancelOrder?: (orderId: string) => void | Promise<any>;
    onPlaceOrder?: (args: any) => void | Promise<any>;
    onSearchInstruments?: (query: string, limit?: number) => Promise<TradeLockerInstrumentSuggestion[]>;
    onOpenSettings?: () => void;
    isConnected?: boolean;
    tradingEnabled?: boolean;
    defaultOrderQty?: number;
    defaultOrderType?: 'market' | 'limit' | 'stop';
    serverLabel?: string;
    connectionLabel?: string;
    connectionDotClass?: string;
    defaultSymbol?: string | null;
    onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
    onRunActionCatalogImmediate?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
    onSnapshotSourceChange?: (key: string) => Promise<{ ok?: boolean; error?: string } | void> | { ok?: boolean; error?: string } | void;
    onSnapshotAutoSwitchChange?: (enabled: boolean) => void;
    onSnapshotFallbackChange?: (order: string[]) => void;
    onExecutionTargetsChange?: (targets: string[]) => void;
    onNormalizationChange?: (patch: { enabled?: boolean; referenceKey?: string | null }) => void;
    onSymbolMapChange?: (entries: SymbolMapEntry[]) => void;
}

type TicketSide = 'BUY' | 'SELL';
type TicketType = 'market' | 'limit' | 'stop';

const PANEL_STORAGE_KEY = 'glass_panel_tradelocker_v1';
const PRESET_STORAGE_KEY = 'glass_tradelocker_ticket_presets_v1';
const TL_PROFILES_KEY = 'glass_tradelocker_profiles_v1';
const TL_ACTIVE_PROFILE_KEY = 'glass_tradelocker_active_profile_v1';
const HISTORY_CACHE_STORAGE_KEY = 'glass_tradelocker_history_cache_v1';
const HISTORY_CACHE_ENTRY_LIMIT = 600;

type TradeLockerProfile = {
  id: string;
  label: string;
  env: 'demo' | 'live';
  server: string;
  email: string;
  accountId?: number | null;
  accNum?: number | null;
  rememberPassword?: boolean;
  rememberDeveloperKey?: boolean;
};

type TradeLockerTicketPreset = {
  id: string;
  label: string;
  accountKey?: string | null;
  symbol: string;
  side: TicketSide;
  type: TicketType;
  qty: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  strategyId?: string;
};

type TradeLockerPanelState = {
  activeView?: 'ticket' | 'positions' | 'orders' | 'history' | 'blotter';
  ticketSymbol?: string;
  ticketSide?: TicketSide;
  ticketType?: TicketType;
  ticketQty?: string;
};

const normalizeActiveView = (value: any): TradeLockerPanelState['activeView'] => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'ticket' || raw === 'positions' || raw === 'orders' || raw === 'history' || raw === 'blotter') {
    return raw as TradeLockerPanelState['activeView'];
  }
  return 'positions';
};

const normalizeTicketSide = (value: any): TicketSide => {
  const raw = String(value || '').trim().toUpperCase();
  return raw === 'SELL' ? 'SELL' : 'BUY';
};

const normalizeTicketType = (value: any): TicketType => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'limit') return 'limit';
  if (raw === 'stop') return 'stop';
  return 'market';
};

const parseTradeLockerAccountId = (value: any): number | null => parseTradeLockerAccountNumber(value);

const loadTradeLockerProfiles = (): TradeLockerProfile[] => {
  try {
    const raw = localStorage.getItem(TL_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const env = entry?.env === 'live' ? 'live' : 'demo';
        const server = String(entry?.server || '');
        const email = String(entry?.email || '');
        const accountId = parseTradeLockerAccountId(entry?.accountId);
        const accNum = parseTradeLockerAccountId(entry?.accNum);
        const id = normalizeTradeLockerProfileId(String(entry?.id || ''), env, server, email, accountId, accNum);
        const labelRaw = String(entry?.label || '').trim();
        const label = labelRaw || buildTradeLockerProfileLabel(env, server, email, accountId, accNum);
        return {
          id,
          label,
          env,
          server,
          email,
          accountId,
          accNum,
          rememberPassword: entry?.rememberPassword === true,
          rememberDeveloperKey: entry?.rememberDeveloperKey === true
        };
      })
      .filter((entry) => entry.id && entry.server && entry.email);
  } catch {
    return [];
  }
};

const persistTradeLockerProfiles = (profiles: TradeLockerProfile[]) => {
  try {
    localStorage.setItem(TL_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore
  }
};

const loadPanelState = (): TradeLockerPanelState => {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      activeView: normalizeActiveView(parsed?.activeView),
      ticketSymbol: typeof parsed?.ticketSymbol === 'string' ? parsed.ticketSymbol : '',
      ticketSide: normalizeTicketSide(parsed?.ticketSide),
      ticketType: normalizeTicketType(parsed?.ticketType),
      ticketQty: typeof parsed?.ticketQty === 'string' ? parsed.ticketQty : ''
    };
  } catch {
    return {};
  }
};

const persistPanelState = (state: TradeLockerPanelState) => {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
};

const loadPresets = (): TradeLockerTicketPreset[] => {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        id: String(entry?.id || ''),
        label: String(entry?.label || ''),
        accountKey: entry?.accountKey != null ? String(entry.accountKey) : null,
        symbol: String(entry?.symbol || ''),
        side: String(entry?.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        type: normalizeTicketType(entry?.type),
        qty: String(entry?.qty || ''),
        price: entry?.price != null ? String(entry.price) : '',
        stopLoss: entry?.stopLoss != null ? String(entry.stopLoss) : '',
        takeProfit: entry?.takeProfit != null ? String(entry.takeProfit) : '',
        strategyId: entry?.strategyId != null ? String(entry.strategyId) : ''
      }))
      .filter((entry) => entry.id && entry.label && entry.symbol);
  } catch {
    return [];
  }
};

const persistPresets = (presets: TradeLockerTicketPreset[]) => {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore storage failures
  }
};

const buildAccountKey = (account?: {
  env?: 'demo' | 'live' | null;
  server?: string | null;
  accountId?: number | null;
  accNum?: number | null;
} | null) => {
  if (!account) return '';
  const normalized = normalizeTradeLockerAccountRecord({
    id: parseTradeLockerAccountId(account.accountId),
    accNum: parseTradeLockerAccountId(account.accNum),
    env: account.env || null,
    server: account.server || null
  }, {
    env: account.env || null,
    server: account.server || null
  });
  if (normalized?.accountKey) return normalized.accountKey;
  return buildTradeLockerAccountKey({
    env: account.env || null,
    server: account.server || null,
    accountId: parseTradeLockerAccountId(account.accountId),
    accNum: parseTradeLockerAccountId(account.accNum)
  });
};

const buildHistoryCacheKey = (
  account?: {
    env?: 'demo' | 'live' | null;
    server?: string | null;
    accountId?: number | null;
    accNum?: number | null;
  } | null,
  includeAll = false
) => {
  if (includeAll) return 'all_accounts';
  const accountKey = buildAccountKey(account);
  return accountKey ? `account:${accountKey}` : 'account:default';
};

const inferPriceDecimals = (value: number | null | undefined) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const text = Math.abs(num).toString();
  if (text.includes('e-')) {
    const exp = Number(text.split('e-')[1]);
    return Number.isFinite(exp) ? Math.min(8, exp) : null;
  }
  const parts = text.split('.');
  if (parts.length < 2) return 0;
  return Math.min(8, parts[1].length);
};

const TradeLockerInterface: React.FC<TradeLockerInterfaceProps> = ({
    balance, 
    equity, 
    positions,
    orders = [],
    ordersError = null,
    brokerQuotes = {},
    brokerQuotesUpdatedAtMs = null,
    brokerQuotesError = null,
    accountMetrics = null,
    accountMetricsError = null,
    snapshotUpdatedAtMs = null,
    streamStatus = null,
    streamUpdatedAtMs = null,
    streamError = null,
    rateLimitTelemetry = null,
    accountsError = null,
    accounts = [],
    activeAccount = null,
    snapshotSourceKey = null,
    snapshotAutoSwitch = false,
    snapshotFallbackOrder = [],
    executionTargets = [],
    normalizationEnabled = false,
    normalizationReferenceKey = null,
    symbolMap = [],
    onRefresh,
    onRefreshAccounts,
    onClosePosition,
    onCancelOrder,
    onPlaceOrder,
    onSearchInstruments,
    onOpenSettings,
    isConnected = false,
    tradingEnabled = false,
    defaultOrderQty = 0,
    defaultOrderType = 'market',
    serverLabel,
    connectionLabel,
    connectionDotClass,
    defaultSymbol = null,
    onRunActionCatalog,
    onRunActionCatalogImmediate,
    onSnapshotSourceChange,
    onSnapshotAutoSwitchChange,
    onSnapshotFallbackChange,
    onExecutionTargetsChange,
    onNormalizationChange,
    onSymbolMapChange
}) => {
  const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);
  const initialPanelState = useMemo(loadPanelState, []);
  const [presets, setPresets] = useState<TradeLockerTicketPreset[]>(() => loadPresets());
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetLabel, setPresetLabel] = useState('');
  const accountKey = useMemo(() => buildAccountKey(activeAccount), [activeAccount]);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [snapshotSwitching, setSnapshotSwitching] = useState(false);
  const [snapshotSwitchError, setSnapshotSwitchError] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addAccountEnv, setAddAccountEnv] = useState<'demo' | 'live'>('demo');
  const [addAccountEmail, setAddAccountEmail] = useState('');
  const [addAccountPassword, setAddAccountPassword] = useState('');
  const [addAccountServer, setAddAccountServer] = useState('');
  const [addAccountDeveloperKey, setAddAccountDeveloperKey] = useState('');
  const [addAccountShowPassword, setAddAccountShowPassword] = useState(false);
  const [addAccountShowDeveloperKey, setAddAccountShowDeveloperKey] = useState(false);
  const [addAccountRememberPassword, setAddAccountRememberPassword] = useState(true);
  const [addAccountRememberDeveloperKey, setAddAccountRememberDeveloperKey] = useState(false);
  const [addAccountSubmitting, setAddAccountSubmitting] = useState(false);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<TradeLockerProfile[]>(() => loadTradeLockerProfiles());
  const [savedProfileId, setSavedProfileId] = useState<string>('');
  const visiblePresets = useMemo(() => {
    if (!accountKey) return presets.filter((preset) => !preset.accountKey);
    return presets.filter((preset) => !preset.accountKey || areAccountKeysEquivalent(preset.accountKey, accountKey));
  }, [accountKey, presets]);

  const accountOptions = useMemo(() => {
    const env = activeAccount?.env ?? null;
    const server = activeAccount?.server ?? null;
    if (!env || !server || !Array.isArray(accounts)) return [];
    return accounts
      .map((acct) => {
        const normalized = normalizeTradeLockerAccountRecord(acct, { env, server });
        if (!normalized) return null;
        const accountId = normalized.accountId;
        const accNum = normalized.accNum ?? null;
        const key =
          normalized.accountKey ||
          normalized.aliases[0] ||
          buildAccountKey({ env, server, accountId, accNum });
        if (!key) return null;
        const label = acct?.name
          ? `${acct.name} (${accountId}${accNum != null ? `/${accNum}` : ''})`
          : `Account ${accountId}${accNum != null ? `/${accNum}` : ''}`;
        return { key, label, accountId, accNum };
      })
      .filter(Boolean) as Array<{ key: string; label: string; accountId: number; accNum: number | null }>;
  }, [accounts, activeAccount?.env, activeAccount?.server]);

  const effectiveSnapshotKey = snapshotSourceKey || accountKey || (accountOptions[0]?.key ?? '');
  const fallbackOrder = Array.isArray(snapshotFallbackOrder) ? snapshotFallbackOrder : [];
  const availableFallbackOptions = useMemo(
    () => accountOptions.filter((opt) => !fallbackOrder.includes(opt.key)),
    [accountOptions, fallbackOrder]
  );
  const executionTargetSet = useMemo(
    () => new Set(Array.isArray(executionTargets) ? executionTargets : []),
    [executionTargets]
  );

  const handleSnapshotSourceSelect = useCallback(async (nextKey: string) => {
    if (!nextKey) return;
    setSnapshotSwitchError(null);
    setSnapshotSwitching(true);
    try {
      const res = await onSnapshotSourceChange?.(nextKey);
      if (res && typeof res === 'object' && (res as any).ok === false) {
        setSnapshotSwitchError((res as any).error ? String((res as any).error) : 'Failed to switch TradeLocker account.');
      }
    } catch (err: any) {
      setSnapshotSwitchError(err?.message ? String(err.message) : 'Failed to switch TradeLocker account.');
    } finally {
      setSnapshotSwitching(false);
    }
  }, [onSnapshotSourceChange]);

  const formatSymbolMapText = useCallback((entries: SymbolMapEntry[]) => {
    if (!Array.isArray(entries) || entries.length === 0) return '';
    return entries
      .map((entry) => {
        if (!entry || !entry.canonical) return '';
        const mt5 = entry.mt5 ? String(entry.mt5) : '';
        const tl = entry.tradelocker ? String(entry.tradelocker) : '';
        return [entry.canonical, mt5, tl].join(' | ');
      })
      .filter(Boolean)
      .join('\n');
  }, []);

  const parseSymbolMapText = useCallback((text: string): SymbolMapEntry[] => {
    const lines = String(text || '').split(/\r?\n/g);
    const entries: SymbolMapEntry[] = [];
    for (const line of lines) {
      const raw = String(line || '').trim();
      if (!raw) continue;
      const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      const [canonical, mt5, tradelocker] = parts;
      if (!canonical) continue;
      entries.push({
        canonical,
        mt5: mt5 || null,
        tradelocker: tradelocker || null
      });
    }
    return entries;
  }, []);

  useEffect(() => {
    if (!addAccountOpen) return;
    setAddAccountError(null);
    setSavedProfiles(loadTradeLockerProfiles());
    const initialEnv = activeAccount?.env === 'live' ? 'live' : 'demo';
    setAddAccountEnv(initialEnv);
    setAddAccountServer(activeAccount?.server ? String(activeAccount.server) : '');
    setAddAccountEmail('');
    setAddAccountPassword('');
    setAddAccountDeveloperKey('');
    setSavedProfileId('');
  }, [addAccountOpen, activeAccount?.env, activeAccount?.server]);

  useEffect(() => {
    if (!savedProfileId) return;
    if (savedProfiles.some((profile) => profile.id === savedProfileId)) return;
    const selectedParsed = parseTradeLockerProfileId(savedProfileId);
    const selectedBaseId = selectedParsed?.baseId || '';
    if (selectedBaseId) {
      const match = savedProfiles.find((profile) => {
        const parsed = parseTradeLockerProfileId(String(profile.id || ''));
        const baseId = parsed?.baseId || String(profile.id || '');
        return baseId === selectedBaseId;
      });
      if (match?.id) {
        setSavedProfileId(match.id);
        return;
      }
    }
    setSavedProfileId('');
  }, [savedProfileId, savedProfiles]);

  const [symbolMapText, setSymbolMapText] = useState(() => formatSymbolMapText(symbolMap || []));

  useEffect(() => {
    setSymbolMapText(formatSymbolMapText(symbolMap || []));
  }, [formatSymbolMapText, symbolMap]);

  useEffect(() => {
    persistPresets(presets);
  }, [presets]);

  useEffect(() => {
    if (!selectedPresetId) {
      setPresetLabel('');
      return;
    }
    const preset = visiblePresets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      setSelectedPresetId('');
      setPresetLabel('');
      return;
    }
    setPresetLabel(preset.label);
  }, [selectedPresetId, visiblePresets]);

  const handleSnapshotFallbackAdd = useCallback((key: string) => {
    if (!key) return;
    if (fallbackOrder.includes(key)) return;
    const next = [...fallbackOrder, key];
    onSnapshotFallbackChange?.(next);
  }, [fallbackOrder, onSnapshotFallbackChange]);

  const handleSnapshotFallbackRemove = useCallback((key: string) => {
    const next = fallbackOrder.filter((entry) => entry !== key);
    onSnapshotFallbackChange?.(next);
  }, [fallbackOrder, onSnapshotFallbackChange]);

  const moveSnapshotFallback = useCallback((index: number, direction: number) => {
    const next = [...fallbackOrder];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    onSnapshotFallbackChange?.(next);
  }, [fallbackOrder, onSnapshotFallbackChange]);

  const toggleExecutionTarget = useCallback((key: string) => {
    if (!key) return;
    const next = new Set(executionTargetSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onExecutionTargetsChange?.(Array.from(next));
  }, [executionTargetSet, onExecutionTargetsChange]);
  const metricsBalance =
    accountMetrics && Number.isFinite(Number(accountMetrics.balance)) ? Number(accountMetrics.balance) : null;
  const metricsEquity =
    accountMetrics && Number.isFinite(Number(accountMetrics.equity)) ? Number(accountMetrics.equity) : null;
  const metricsOpenNetPnl =
    accountMetrics && Number.isFinite(Number(accountMetrics.openNetPnl)) ? Number(accountMetrics.openNetPnl) : null;
  const metricsOpenGrossPnl =
    accountMetrics && Number.isFinite(Number(accountMetrics.openGrossPnl)) ? Number(accountMetrics.openGrossPnl) : null;

  const metricsAt = accountMetrics?.updatedAtMs != null ? Number(accountMetrics.updatedAtMs) : 0;
  const metricsAgeMs = metricsAt > 0 ? Math.max(0, Date.now() - metricsAt) : Number.POSITIVE_INFINITY;

  const metricsFresh = metricsAgeMs <= 30_000;
  const metricsOpenPnl = metricsOpenNetPnl != null ? metricsOpenNetPnl : metricsOpenGrossPnl;
  const runPanelAction = useMemo(
    () =>
      createPanelActionRunner({
        panel: 'tradelocker',
        runActionCatalog: onRunActionCatalog,
        defaultSource: 'catalog',
        defaultFallbackSource: 'bridge'
      }),
    [onRunActionCatalog]
  );

  const runActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      // Keep local panel interactions responsive even when action sources are in cooldown.
      fallback?.();
      void runPanelAction(actionId, payload);
    },
    [runPanelAction]
  );

  const runImmediateTradeLockerAction = useCallback(
    async (
      actionId: string,
      payload: Record<string, any>,
      fallback?: () => Promise<any>
    ): Promise<{ ok: boolean; error?: string; data?: any }> => {
      if (onRunActionCatalogImmediate) {
        try {
          const res = await onRunActionCatalogImmediate({ actionId, payload });
          if (res?.ok === false) {
            return { ok: false, error: res?.error ? String(res.error) : `Failed action: ${actionId}` };
          }
          return { ok: true, data: res?.data ?? res ?? null };
        } catch (err: any) {
          return { ok: false, error: err?.message ? String(err.message) : `Failed action: ${actionId}` };
        }
      }
      if (onRunActionCatalog) {
        const res = await runPanelAction(actionId, payload);
        if (res?.ok === false) {
          return { ok: false, error: res?.error ? String(res.error) : `Failed action: ${actionId}` };
        }
        return { ok: true, data: res?.data ?? null };
      }
      if (fallback) {
        try {
          const res = await fallback();
          if (res?.ok === false) {
            return { ok: false, error: res?.error ? String(res.error) : `Failed action: ${actionId}` };
          }
          return { ok: true, data: res?.data ?? res ?? null };
        } catch (err: any) {
          return { ok: false, error: err?.message ? String(err.message) : `Failed action: ${actionId}` };
        }
      }
      return { ok: false, error: 'TradeLocker bridge is not available.' };
    },
    [onRunActionCatalog, onRunActionCatalogImmediate, runPanelAction]
  );

  const emitTradeLockerSwitchShield = useCallback((input: {
    active: boolean;
    stage?: string | null;
    reason?: string | null;
  }) => {
    try {
      dispatchGlassEvent(GLASS_EVENT.TRADELOCKER_SWITCH_SHIELD, {
        active: input?.active === true,
        holdMs: input?.active === true ? 45_000 : 0,
        source: 'tradelocker_panel_direct',
        stage: String(input?.stage || (input?.active ? 'switch_start' : 'switch_end')).trim(),
        reason: input?.reason ? String(input.reason) : null,
        atMs: Date.now()
      });
    } catch {
      // ignore renderer event dispatch failures
    }
  }, []);

  const reconnectSavedProfile = useCallback(async (
    profile: TradeLockerProfile,
    accountId: number | null,
    accNum: number | null
  ) => {
    emitTradeLockerSwitchShield({
      active: true,
      stage: 'connect'
    });
    let finalStage = 'connect';
    let finalReason: string | null = null;
    const profileKey = buildTradeLockerProfileBaseId(profile.env, profile.server, profile.email);
    const payload = {
      env: profile.env === 'live' ? 'live' : 'demo',
      server: String(profile.server || '').trim(),
      email: String(profile.email || '').trim(),
      profileKey,
      password: '',
      developerApiKey: '',
      rememberPassword: profile.rememberPassword !== false,
      rememberDeveloperApiKey: profile.rememberDeveloperKey === true,
      accountId,
      accNum
    };
    try {
      if (!payload.server || !payload.email) {
        finalStage = 'connect';
        finalReason = 'Saved profile is missing server/email.';
        return { ok: false as const, error: finalReason };
      }
      const res = await runImmediateTradeLockerAction('tradelocker.connect', payload, async () => {
        const tl = (window as any)?.glass?.tradelocker;
        if (!tl?.connect) return { ok: false, error: 'TradeLocker bridge is not available.' };
        return await tl.connect(payload);
      });
      if (res?.ok === false) {
        finalStage = 'connect';
        finalReason = res?.error ? String(res.error) : 'Failed to switch TradeLocker profile.';
        return {
          ok: false as const,
          error: res?.error ? String(res.error) : 'Failed to switch TradeLocker profile.',
          stage: 'connect' as const
        };
      }
      if (accountId != null) {
        const switchRes = await runImmediateTradeLockerAction(
          'tradelocker.set_active_account',
          { accountId, accNum },
          async () => {
            const tl = (window as any)?.glass?.tradelocker;
            if (!tl?.setActiveAccount) return { ok: false, error: 'TradeLocker account switching unavailable.' };
            return await tl.setActiveAccount({ accountId, accNum: accNum ?? undefined });
          }
        );
        if (!switchRes?.ok) {
          finalStage = 'set_active_account';
          finalReason = switchRes?.error ? String(switchRes.error) : 'Failed to switch TradeLocker account.';
          return {
            ok: false as const,
            error: switchRes?.error ? String(switchRes.error) : 'Failed to switch TradeLocker account.',
            stage: 'set_active_account' as const
          };
        }
        try {
          dispatchGlassEvent(GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED, {
            accountId,
            accNum: accNum ?? null,
            source: 'tradelocker_panel_direct',
            makePrimary: true,
            atMs: Date.now()
          });
        } catch {
          // ignore renderer event dispatch failures
        }
      }
      onRefreshAccounts?.();
      finalStage = 'verify';
      return { ok: true as const, stage: 'verify' as const };
    } finally {
      emitTradeLockerSwitchShield({
        active: false,
        stage: finalStage,
        reason: finalReason
      });
    }
  }, [emitTradeLockerSwitchShield, onRefreshAccounts, runImmediateTradeLockerAction]);

  const handleSavedProfileSelect = useCallback((profileId: string) => {
    const previousProfileId = savedProfileId;
    setSavedProfileId(profileId);
    const profile = savedProfiles.find((entry) => entry.id === profileId);
    if (!profile) return;
    try {
      if (profile.id) localStorage.setItem(TL_ACTIVE_PROFILE_KEY, profile.id);
    } catch {
      // ignore storage failures
    }
    setAddAccountEnv(profile.env === 'live' ? 'live' : 'demo');
    setAddAccountServer(profile.server);
    setAddAccountEmail(profile.email);
    setAddAccountRememberPassword(!!profile.rememberPassword);
    setAddAccountRememberDeveloperKey(!!profile.rememberDeveloperKey);
    const accountId = parseTradeLockerAccountId(profile.accountId);
    const accNum = parseTradeLockerAccountId(profile.accNum);
    const activeEnv = String(activeAccount?.env || '').trim().toLowerCase();
    const activeServer = String(activeAccount?.server || '').trim().toLowerCase();
    const profileEnv = String(profile.env || '').trim().toLowerCase();
    const profileServer = String(profile.server || '').trim().toLowerCase();
    const shouldReconnect = !isConnected || activeEnv !== profileEnv || activeServer !== profileServer;
    if (shouldReconnect) {
      setAddAccountSubmitting(true);
      setAddAccountError(null);
      void reconnectSavedProfile(profile, accountId, accNum)
        .then((result) => {
          if (!result?.ok) {
            setSavedProfileId(previousProfileId);
            setAddAccountError(result?.error || 'Failed to switch saved TradeLocker login.');
          }
        })
        .finally(() => setAddAccountSubmitting(false));
      return;
    }
    if (accountId == null || accNum == null) {
      setSavedProfileId(previousProfileId);
      setAddAccountError('Saved profile account identity is incomplete.');
      return;
    }
    const shouldApplyAccount = activeEnv === profileEnv && activeServer === profileServer;
    if (!shouldApplyAccount) return;
    setAddAccountSubmitting(true);
    setAddAccountError(null);
    emitTradeLockerSwitchShield({
      active: true,
      stage: 'set_active_account'
    });
    void runImmediateTradeLockerAction(
        'tradelocker.set_active_account',
        { accountId, accNum },
        async () => {
        const tl = (window as any)?.glass?.tradelocker;
        if (!tl?.setActiveAccount) return { ok: false, error: 'TradeLocker account switching unavailable.' };
        return await tl.setActiveAccount({ accountId, accNum });
        }
    ).then((res) => {
      if (!res?.ok) {
        setSavedProfileId(previousProfileId);
        setAddAccountError(res?.error ? String(res.error) : 'Failed to switch saved TradeLocker account.');
        return;
      }
      try {
        dispatchGlassEvent(GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED, {
          accountId,
          accNum,
          source: 'tradelocker_panel_direct',
          makePrimary: true,
          atMs: Date.now()
        });
      } catch {
        // ignore renderer event dispatch failures
      }
      onRefreshAccounts?.();
    }).finally(() => {
      setAddAccountSubmitting(false);
      emitTradeLockerSwitchShield({
        active: false,
        stage: 'verify'
      });
    });
  }, [
    activeAccount?.env,
    activeAccount?.server,
    emitTradeLockerSwitchShield,
    isConnected,
    onRefreshAccounts,
    reconnectSavedProfile,
    runImmediateTradeLockerAction,
    savedProfileId,
    savedProfiles
  ]);

  const upsertProfile = useCallback((env: 'demo' | 'live', server: string, email: string, account?: {
    accountId?: number | null;
    accNum?: number | null;
  }) => {
    if (!server || !email) return;
    const accountId = parseTradeLockerAccountId(account?.accountId);
    const accNum = parseTradeLockerAccountId(account?.accNum);
    const id = buildTradeLockerProfileId(env, server, email, accountId, accNum);
    const label = buildTradeLockerProfileLabel(env, server, email, accountId, accNum);
    const next: TradeLockerProfile[] = [
      ...savedProfiles.filter((profile) => {
        if (profile.id === id) return false;
        const parsed = parseTradeLockerProfileId(String(profile.id || ''));
        const profileAccountId = parseTradeLockerAccountId(profile.accountId);
        const profileAccNum = parseTradeLockerAccountId(profile.accNum);
        if (parsed?.baseId) {
          const nextBase = parseTradeLockerProfileId(id)?.baseId || '';
          if (parsed.baseId === nextBase && profileAccountId === accountId && profileAccNum === accNum) {
            return false;
          }
        }
        return true;
      }),
      {
        id,
        label,
        env,
        server,
        email,
        accountId,
        accNum,
        rememberPassword: addAccountRememberPassword,
        rememberDeveloperKey: addAccountRememberDeveloperKey
      }
    ].sort((a, b) => a.label.localeCompare(b.label));
    setSavedProfiles(next);
    persistTradeLockerProfiles(next);
    try {
      localStorage.setItem(TL_ACTIVE_PROFILE_KEY, id);
    } catch {
      // ignore
    }
  }, [addAccountRememberDeveloperKey, addAccountRememberPassword, savedProfiles]);

  const handleAddAccountConnect = useCallback(async () => {
    setAddAccountError(null);
    const server = String(addAccountServer || '').trim();
    const email = String(addAccountEmail || '').trim();
    if (!server || !email) {
      setAddAccountError('Server and email are required.');
      return;
    }
    if (!onRunActionCatalog && !onRunActionCatalogImmediate && !(window as any)?.glass?.tradelocker?.connect) {
      setAddAccountError('TradeLocker bridge is not available. Restart the app or reinstall the latest build.');
      return;
    }
    setAddAccountSubmitting(true);
    emitTradeLockerSwitchShield({
      active: true,
      stage: 'connect'
    });
    try {
      const payload = {
        env: addAccountEnv,
        server,
        email,
        profileKey: buildTradeLockerProfileBaseId(addAccountEnv, server, email),
        password: addAccountPassword,
        developerApiKey: addAccountDeveloperKey,
        rememberPassword: addAccountRememberPassword,
        rememberDeveloperApiKey: addAccountRememberDeveloperKey
      };
      const res = await runImmediateTradeLockerAction('tradelocker.connect', payload, async () => {
        if (!(window as any)?.glass?.tradelocker?.connect) {
          return { ok: false, error: 'TradeLocker bridge is not available. Restart the app or reinstall the latest build.' };
        }
        return await (window as any).glass.tradelocker.connect(payload);
      });
      if (res && res.ok === false) {
        setAddAccountError(res?.error ? String(res.error) : 'Failed to connect.');
        return;
      }
      const tlApi = (window as any)?.glass?.tradelocker;
      let accountId = parseTradeLockerAccountId(activeAccount?.accountId);
      let accNum = parseTradeLockerAccountId(activeAccount?.accNum);
      try {
        const savedCfg = await tlApi?.getSavedConfig?.();
        if (savedCfg?.ok) {
          const cfgAccountId = parseTradeLockerAccountId(savedCfg?.accountId);
          const cfgAccNum = parseTradeLockerAccountId(savedCfg?.accNum);
          if (cfgAccountId != null) accountId = cfgAccountId;
          if (cfgAccNum != null) accNum = cfgAccNum;
        }
      } catch {
        // ignore saved config read failures for profile persistence
      }
      upsertProfile(addAccountEnv, server, email, { accountId, accNum });
      setAddAccountPassword('');
      setAddAccountDeveloperKey('');
      setAddAccountOpen(false);
      if (onRefreshAccounts) onRefreshAccounts();
    } catch (e: any) {
      setAddAccountError(e?.message ? String(e.message) : 'Failed to connect.');
    } finally {
      setAddAccountSubmitting(false);
      emitTradeLockerSwitchShield({
        active: false,
        stage: 'verify'
      });
    }
  }, [
    addAccountDeveloperKey,
    addAccountEmail,
    addAccountEnv,
    addAccountPassword,
    addAccountRememberDeveloperKey,
    addAccountRememberPassword,
    addAccountServer,
    activeAccount?.accNum,
    activeAccount?.accountId,
    emitTradeLockerSwitchShield,
    onRunActionCatalog,
    onRunActionCatalogImmediate,
    onRefreshAccounts,
    runImmediateTradeLockerAction,
    upsertProfile
  ]);

  const positionsPnL = useMemo(() => {
    const list = Array.isArray(positions) ? positions : [];
    return list.reduce((acc, p) => acc + (Number.isFinite(Number(p.pnl)) ? Number(p.pnl) : 0), 0);
  }, [positions]);

  // TradeLocker often represents TP/SL as separate close orders (opposite side) instead of fields on the position row.
  // If the position's stopLoss/takeProfit are missing, derive them from the nearest matching close orders.
  const displayPositions = useMemo(() => {
    const list = Array.isArray(positions) ? positions : [];
    if (!Array.isArray(orders) || orders.length === 0) return list;

    const orderPrice = (o: any) => {
      const p = Number(o?.price ?? 0);
      return Number.isFinite(p) ? p : 0;
    };

    const bySymbol = new Map<string, TradeLockerOrder[]>();
    for (const o of orders) {
      if (!o || !o.symbol) continue;
      const key = String(o.symbol);
      const arr = bySymbol.get(key) || [];
      arr.push(o);
      bySymbol.set(key, arr);
    }

    return list.map((pos) => {
      const baseSL = Number(pos?.stopLoss ?? 0);
      const baseTP = Number(pos?.takeProfit ?? 0);
      const hasSL = Number.isFinite(baseSL) && baseSL > 0;
      const hasTP = Number.isFinite(baseTP) && baseTP > 0;
      if (hasSL && hasTP) return pos;

      const sym = String(pos?.symbol || '');
      const entry = Number(pos?.entryPrice ?? 0);
      const side = String(pos?.type || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      if (!sym || !Number.isFinite(entry) || entry <= 0) return pos;

      const candidates = (bySymbol.get(sym) || []).filter((o) => {
        const oSide = String(o?.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
        // Close orders are typically the opposite side of the open position.
        return oSide !== side;
      });
      if (candidates.length === 0) return pos;

      const prices = candidates.map(orderPrice).filter((p) => Number.isFinite(p) && p > 0);
      if (prices.length === 0) return pos;

      let derivedTP: number | null = hasTP ? baseTP : null;
      let derivedSL: number | null = hasSL ? baseSL : null;

      if (side === 'BUY') {
        const above = prices.filter((p) => p > entry).sort((a, b) => a - b);
        const below = prices.filter((p) => p < entry).sort((a, b) => b - a);
        if (derivedTP == null && above.length > 0) derivedTP = above[0];
        if (derivedSL == null && below.length > 0) derivedSL = below[0];
      } else {
        const below = prices.filter((p) => p < entry).sort((a, b) => b - a);
        const above = prices.filter((p) => p > entry).sort((a, b) => a - b);
        if (derivedTP == null && below.length > 0) derivedTP = below[0];
        if (derivedSL == null && above.length > 0) derivedSL = above[0];
      }

      if (derivedSL == null && derivedTP == null) return pos;
      return {
        ...pos,
        stopLoss: derivedSL != null ? derivedSL : pos.stopLoss,
        takeProfit: derivedTP != null ? derivedTP : pos.takeProfit
      };
    });
  }, [orders, positions]);

  const effectiveBalance = metricsFresh && metricsBalance != null && metricsBalance > 0 ? metricsBalance : balance;

  const pnlFromMetrics =
    metricsFresh && metricsOpenPnl != null && Math.abs(metricsOpenPnl) > 0.0001
      ? metricsOpenPnl
      : metricsFresh && metricsBalance != null && metricsEquity != null
        ? metricsEquity - metricsBalance
        : null;

  const snapshotEquityDelta = equity - balance;
  const totalPnL =
    positions.length > 0 && Math.abs(positionsPnL) > 0.0001
      ? positionsPnL
      : pnlFromMetrics != null && Math.abs(pnlFromMetrics) > 0.0001
        ? pnlFromMetrics
        : metricsFresh && metricsEquity != null && metricsBalance != null
          ? Number(metricsEquity) - Number(metricsBalance)
          : snapshotEquityDelta;

  const effectiveEquity =
    positions.length > 0
      ? effectiveBalance + totalPnL
      : metricsFresh && metricsEquity != null && metricsEquity > 0
        ? metricsEquity
        : metricsFresh && metricsOpenPnl != null && effectiveBalance > 0
          ? effectiveBalance + metricsOpenPnl
          : equity;
  const pnlColor = totalPnL >= 0 ? 'text-green-400' : 'text-red-400';
  const [activeView, setActiveView] = useState<'ticket' | 'positions' | 'orders' | 'history' | 'blotter'>(
    initialPanelState.activeView ?? 'positions'
  );
  const [ordersQuery, setOrdersQuery] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyAllAccounts, setHistoryAllAccounts] = useState(false);
  const [blotterQuery, setBlotterQuery] = useState('');
  const [blotterLoading, setBlotterLoading] = useState(false);
  const [blotterError, setBlotterError] = useState<string | null>(null);
  const [blotterEntries, setBlotterEntries] = useState<any[]>([]);
  const [blotterAllAccounts, setBlotterAllAccounts] = useState(false);
  const [blotterUpdatedAtMs, setBlotterUpdatedAtMs] = useState<number | null>(null);
  const lastHistoryFetchAtRef = useRef<number>(0);
  const lastBlotterFetchAtRef = useRef<number>(0);
  const historyCacheRef = useRef<Map<string, { entries: any[]; updatedAtMs: number }>>(new Map());
  const historyCacheHydratedRef = useRef(false);

  const hydrateHistoryCache = useCallback(() => {
    if (historyCacheHydratedRef.current) return;
    historyCacheHydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem(HISTORY_CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const next = new Map<string, { entries: any[]; updatedAtMs: number }>();
      for (const [key, payload] of Object.entries(parsed as Record<string, any>)) {
        const entries = Array.isArray((payload as any)?.entries) ? (payload as any).entries : [];
        const updatedAtMs = Number((payload as any)?.updatedAtMs || 0);
        if (!key || entries.length === 0) continue;
        next.set(String(key), {
          entries: entries.slice(0, HISTORY_CACHE_ENTRY_LIMIT),
          updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0
        });
      }
      historyCacheRef.current = next;
    } catch {
      // ignore cache hydration issues
    }
  }, []);

  const persistHistoryCache = useCallback(() => {
    try {
      const payload: Record<string, { entries: any[]; updatedAtMs: number }> = {};
      for (const [key, value] of historyCacheRef.current.entries()) {
        if (!key || !Array.isArray(value?.entries) || value.entries.length === 0) continue;
        payload[key] = {
          entries: value.entries.slice(0, HISTORY_CACHE_ENTRY_LIMIT),
          updatedAtMs: Number.isFinite(Number(value?.updatedAtMs)) ? Number(value.updatedAtMs) : Date.now()
        };
      }
      sessionStorage.setItem(HISTORY_CACHE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore cache persistence failures
    }
  }, []);

  const parseLooseNumber = useCallback((value: string): number | null => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const n = Number(raw.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }, []);

  const parseTimestampMs = useCallback((value: any): number | null => {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 1e12 ? value : value * 1000;
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  const readBrokerHistoryNumber = useCallback((order: any, keys: string[]): number | null => {
    const raw = order?.raw && typeof order.raw === 'object' ? order.raw : {};
    for (const key of keys) {
      const candidate = order?.[key] ?? raw?.[key];
      const next = parseLooseNumber(String(candidate ?? ''));
      if (next != null) return next;
    }
    return null;
  }, [parseLooseNumber]);

  const readBrokerHistoryTimestampMs = useCallback((order: any, keys: string[]): number | null => {
    const raw = order?.raw && typeof order.raw === 'object' ? order.raw : {};
    for (const key of keys) {
      const next = parseTimestampMs(order?.[key] ?? raw?.[key]);
      if (next != null) return next;
    }
    return null;
  }, [parseTimestampMs]);

  const parseBrokerHistoryRealizedPnl = useCallback((order: any): number | null => {
    return readBrokerHistoryNumber(order, [
      'realizedPnl',
      'positionClosedPnl',
      'pnl',
      'profit',
      'profitLoss',
      'netPnl',
      'netProfit',
      'closedPnl',
      'closedProfit',
      'profitValue',
      'realized',
      'openNetPnL',
      'openNetPnl',
      'openGrossPnL',
      'openGrossPnl'
    ]);
  }, [readBrokerHistoryNumber]);

  const mapBrokerOrderHistoryEntry = useCallback((order: any) => {
    if (!order || typeof order !== 'object') return null;
    const raw = order?.raw && typeof order.raw === 'object' ? order.raw : {};
    const orderId = String(order?.id || raw?.orderId || raw?.id || '').trim();
    if (!orderId) return null;
    const side = String(order?.side || raw?.side || '').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const createdAtMs =
      readBrokerHistoryTimestampMs(order, [
        'createdAt',
        'submittedAt',
        'openedAt',
        'openTime',
        'filledAt',
        'closedAt'
      ]) || Date.now();
    const closedAtMs =
      readBrokerHistoryTimestampMs(order, [
        'closedAt',
        'closeTime',
        'closedTime',
        'filledAt',
        'updatedAt'
      ]) || createdAtMs;
    const qty =
      readBrokerHistoryNumber(order, [
        'qty',
        'quantity',
        'filledQty',
        'filledQuantity',
        'size',
        'volume'
      ]);
    const entryPrice =
      readBrokerHistoryNumber(order, [
        'price',
        'entryPrice',
        'openPrice',
        'avgPrice',
        'averagePrice',
        'filledPrice',
        'fillPrice'
      ]);
    const closePrice =
      readBrokerHistoryNumber(order, [
        'closePrice',
        'exitPrice',
        'close',
        'filledPrice',
        'fillPrice',
        'avgFillPrice',
        'averageFillPrice',
        'avgClosePrice',
        'stopPrice'
      ]);
    const stopLoss = readBrokerHistoryNumber(order, ['stopLoss', 'sl', 'slPrice', 'stop', 'stopPrice']);
    const takeProfit = readBrokerHistoryNumber(order, ['takeProfit', 'tp', 'tpPrice', 'take', 'takePrice']);
    const realizedPnl = parseBrokerHistoryRealizedPnl(order);
    const env = activeAccount?.env != null ? String(activeAccount.env) : (raw?.env != null ? String(raw.env) : null);
    const server = activeAccount?.server != null ? String(activeAccount.server) : (raw?.server != null ? String(raw.server) : null);
    const accountId =
      parseTradeLockerAccountId(activeAccount?.accountId) ??
      parseTradeLockerAccountId(order?.accountId) ??
      parseTradeLockerAccountId(raw?.accountId);
    const accNum =
      parseTradeLockerAccountId(activeAccount?.accNum) ??
      parseTradeLockerAccountId(order?.accNum ?? order?.accountNum) ??
      parseTradeLockerAccountId(raw?.accNum ?? raw?.accountNum);
    const accountIdentity = {
      env: env || null,
      server: server || null,
      accountId: accountId ?? null,
      accNum: accNum ?? null
    };
    const accountKey = buildAccountKey({
      env: accountIdentity.env as 'demo' | 'live' | null,
      server: accountIdentity.server,
      accountId: accountIdentity.accountId,
      accNum: accountIdentity.accNum
    }) || null;
    return {
      id: `broker_history_${orderId}`,
      brokerOrderId: orderId,
      orderId,
      kind: 'trade',
      broker: 'tradelocker',
      symbol: order?.symbol ? String(order.symbol) : (raw?.symbol ? String(raw.symbol) : null),
      action: side,
      side,
      orderType: order?.type ? String(order.type) : (raw?.type ? String(raw.type) : null),
      qty,
      brokerQty: qty,
      qtyNormalized: qty,
      entryPrice,
      brokerEntryPrice: entryPrice,
      closePrice,
      brokerClosePrice: closePrice,
      stopLoss,
      takeProfit,
      status: 'CLOSED',
      positionStatus: 'CLOSED',
      createdAtMs,
      updatedAtMs: closedAtMs,
      brokerOpenTimeMs: createdAtMs,
      positionOpenedAtMs: createdAtMs,
      positionClosedAtMs: closedAtMs,
      closedAtMs,
      realizedPnl: realizedPnl,
      positionClosedPnl: realizedPnl,
      realizedPnlSource: realizedPnl != null ? 'tradelocker_orders_history' : 'tradelocker_orders_history_unavailable',
      account: accountIdentity,
      acct: accountIdentity,
      env: accountIdentity.env,
      server: accountIdentity.server,
      accountId: accountIdentity.accountId,
      accNum: accountIdentity.accNum,
      accountKey
    };
  }, [activeAccount?.accNum, activeAccount?.accountId, activeAccount?.env, activeAccount?.server, parseBrokerHistoryRealizedPnl, readBrokerHistoryNumber, readBrokerHistoryTimestampMs]);

  const formatTs = useCallback((ms: any) => {
    const n = Number(ms || 0);
    if (!Number.isFinite(n) || n <= 0) return '--';
    try {
      return new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--';
    }
  }, []);

  const formatPrice = useCallback((value: any) => {
    const n = parseLooseNumber(String(value ?? ''));
    if (n == null) return '--';
    const abs = Math.abs(n);
    const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
    return n.toFixed(decimals).replace(/\.?0+$/, '');
  }, [parseLooseNumber]);

  const roundToPrecision = useCallback((value: string, decimals: number | null) => {
    if (decimals == null) return value;
    const n = parseLooseNumber(String(value ?? ''));
    if (n == null) return value;
    return n.toFixed(decimals);
  }, [parseLooseNumber]);

  const formatAge = useCallback((ms: number | null | undefined) => {
    if (!ms || ms <= 0) return '';
    const delta = Math.max(0, Date.now() - ms);
    const seconds = Math.max(1, Math.floor(delta / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }, []);

  const quotesAgeMs = brokerQuotesUpdatedAtMs != null ? Math.max(0, Date.now() - brokerQuotesUpdatedAtMs) : null;
  const quotesFresh = quotesAgeMs != null && quotesAgeMs <= 30_000;
  const streamAgeMs = streamUpdatedAtMs != null ? Math.max(0, Date.now() - streamUpdatedAtMs) : null;
  const streamFresh = streamAgeMs != null && streamAgeMs <= 30_000;
  const streamLabel = streamStatus ? String(streamStatus).trim().toUpperCase() : '';
  const streamAgeLabel = streamUpdatedAtMs != null ? formatAge(streamUpdatedAtMs) : '';
  const streamReasonLabel = streamError ? String(streamError).trim() : '';
  const streamStatusLine = streamLabel
    ? `Stream: ${streamLabel}${streamAgeLabel ? ` ${streamAgeLabel}` : ''}${streamReasonLabel ? ` (${streamReasonLabel})` : ''}`
    : '';
  const rateLimitMode = rateLimitTelemetry?.mode ? String(rateLimitTelemetry.mode).toUpperCase() : '';
  const rateLimitPolicy = rateLimitTelemetry?.policy ? String(rateLimitTelemetry.policy).toUpperCase() : '';
  const rateLimitPressure = Number.isFinite(Number(rateLimitTelemetry?.pressure)) ? Number(rateLimitTelemetry?.pressure) : null;
  const rateLimitLast429Age = rateLimitTelemetry?.last429AtMs ? formatAge(rateLimitTelemetry.last429AtMs) : '';
  const rateLimitLine = rateLimitMode
    ? `Rate governor: ${rateLimitMode}${rateLimitPolicy ? `/${rateLimitPolicy}` : ''} • 429s ${Number(rateLimitTelemetry?.window429 || 0)}`
      + `${rateLimitLast429Age ? ` • last ${rateLimitLast429Age}` : ''}`
      + `${rateLimitPressure != null ? ` • pressure ${rateLimitPressure.toFixed(2)}` : ''}`
      + ` • interval ${Math.max(0, Number(rateLimitTelemetry?.adaptiveMinIntervalMs || 0))}ms`
      + ` • concurrency ${Math.max(0, Number(rateLimitTelemetry?.adaptiveRequestConcurrency || 0))}`
    : '';
  const rateLimitTone =
    rateLimitTelemetry?.mode === 'cooldown'
      ? 'text-red-300/90'
      : rateLimitTelemetry?.mode === 'guarded'
        ? 'text-amber-300/90'
        : 'text-cyan-300/80';
  const tradeLedgerBridge = requireBridge('tradelocker.trade_ledger');
  const tradeLedgerAvailable = !!((window as any)?.glass?.tradeLedger?.list);
  const brokerHistoryAvailable = !!((window as any)?.glass?.tradelocker?.getOrdersHistory);
  const tradeLedgerUnavailableMessage = !tradeLedgerAvailable
    ? (tradeLedgerBridge.ok
        ? (brokerHistoryAvailable
            ? 'Trade ledger unavailable; showing broker order history only.'
            : 'Trade ledger not available in this build.')
        : tradeLedgerBridge.error)
    : null;

  const getQuoteForSymbol = useCallback((symbol: string) => {
    const key = normalizeSymbolKey(symbol);
    return brokerQuotes?.[key];
  }, [brokerQuotes]);

  const fetchHistory = useCallback(async (force: boolean = false) => {
    const bridge = requireBridge('tradelocker.history');
    if (!bridge.ok) {
      setHistoryError(bridge.error);
      return;
    }
    hydrateHistoryCache();
    const historyCacheKey = buildHistoryCacheKey(activeAccount, historyAllAccounts);
    const historyCacheAliasKey = !historyAllAccounts
      ? buildHistoryCacheKey(
          {
            env: activeAccount?.env ?? null,
            server: activeAccount?.server ?? null,
            accountId: activeAccount?.accountId ?? null,
            accNum: null
          },
          false
        )
      : null;
    const historyCacheCandidateKeys = [historyCacheKey];
    if (historyCacheAliasKey && historyCacheAliasKey !== historyCacheKey) {
      historyCacheCandidateKeys.push(historyCacheAliasKey);
    }
    if (!historyAllAccounts) {
      const env = String(activeAccount?.env || '').trim();
      const server = String(activeAccount?.server || '').trim();
      const accountId = parseTradeLockerAccountId(activeAccount?.accountId);
      if (env && server && accountId != null) {
        const prefix = `account:${[env, server, String(accountId)].join(':')}`;
        for (const key of historyCacheRef.current.keys()) {
          if (!key || historyCacheCandidateKeys.includes(key)) continue;
          if (key.startsWith(prefix)) historyCacheCandidateKeys.push(key);
        }
      }
    }
    const cachedHistoryRecord = historyCacheCandidateKeys
      .map((key) => ({ key, value: historyCacheRef.current.get(key) }))
      .find((entry) => Array.isArray(entry.value?.entries) && entry.value!.entries.length > 0);
    const cachedHistory = cachedHistoryRecord?.value || null;
    const ledger = (window as any)?.glass?.tradeLedger;
    const tlApi = (window as any)?.glass?.tradelocker;
    if (!ledger?.list && !tlApi?.getOrdersHistory) return;
    if (!force) {
      const now = Date.now();
      if (now - lastHistoryFetchAtRef.current < 5_000) return;
      lastHistoryFetchAtRef.current = now;
    } else {
      lastHistoryFetchAtRef.current = Date.now();
    }

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const env = activeAccount?.env ?? null;
      const server = activeAccount?.server ?? null;
      const accountId = parseTradeLockerAccountId(activeAccount?.accountId);
      const accNum = parseTradeLockerAccountId(activeAccount?.accNum);
      const [ledgerRes, brokerHistoryRes] = await Promise.all([
        ledger?.list
          ? ledger.list({ limit: 600 }).catch((err: any) => ({
              ok: false,
              error: err?.message ? String(err.message) : 'Failed to load trade ledger history.'
            }))
          : Promise.resolve(null),
        tlApi?.getOrdersHistory
          ? tlApi.getOrdersHistory().catch((err: any) => ({
              ok: false,
              error: err?.message ? String(err.message) : 'Failed to load broker order history.'
            }))
          : Promise.resolve(null)
      ]);

      const accountMatches = (entry: any) => {
        if (historyAllAccounts) return true;
        const activeIdentity = {
          env: env || null,
          server: server || null,
          accountId,
          accNum,
          accountKey: buildAccountKey({
            env: (env as 'demo' | 'live' | null) || null,
            server: server || null,
            accountId,
            accNum
          })
        };
        if (!activeIdentity.accountKey && !env && !server && !accountId && !accNum) return true;
        const a =
          entry?.account ||
          entry?.acct ||
          {
            env: entry?.env ?? null,
            server: entry?.server ?? null,
            accountId: entry?.accountId ?? entry?.account?.id ?? null,
            accNum: entry?.accNum ?? entry?.account?.accNum ?? null,
            accountKey: entry?.accountKey ?? null
          };
        const entryIdentity = {
          env: a?.env ?? null,
          server: a?.server ?? null,
          accountId: parseTradeLockerAccountId(a?.accountId),
          accNum: parseTradeLockerAccountId(a?.accNum),
          accountKey: a?.accountKey != null ? String(a.accountKey) : (entry?.accountKey != null ? String(entry.accountKey) : null)
        };
        const matchState = resolveTradeLockerIdentityMatchState(activeIdentity, entryIdentity);
        if (matchState === 'mismatch') return false;
        return matchState === 'match';
      };

      const isClosed = (entry: any) => {
        const status = String(entry?.status || '').toUpperCase();
        const posStatus = String(entry?.positionStatus || '').toUpperCase();
        const closedAt = Number(entry?.positionClosedAtMs || 0);
        return status === 'CLOSED' || posStatus === 'CLOSED' || closedAt > 0;
      };

      const ledgerEntries = ledgerRes?.ok && Array.isArray((ledgerRes as any).entries)
        ? ((ledgerRes as any).entries as any[])
            .filter((e) => e?.broker === 'tradelocker')
            .filter(accountMatches)
            .filter(isClosed)
        : [];
      const brokerHistoryEntries = brokerHistoryRes?.ok && Array.isArray((brokerHistoryRes as any).orders)
        ? (((brokerHistoryRes as any).orders as any[])
            .map((order) => mapBrokerOrderHistoryEntry(order))
            .filter(Boolean) as any[])
        : [];

      const dedupeKeys = new Set<string>();
      for (const entry of ledgerEntries) {
        const primary = String(entry?.brokerOrderId || entry?.orderId || entry?.id || '').trim();
        if (primary) dedupeKeys.add(primary.toUpperCase());
        const fallback = `${String(entry?.symbol || '').toUpperCase()}|${Number(entry?.positionClosedAtMs || entry?.closedAtMs || 0)}`;
        if (fallback && !fallback.endsWith('|0')) dedupeKeys.add(fallback);
      }
      const merged = [...ledgerEntries];
      for (const entry of brokerHistoryEntries) {
        const key = String(entry?.brokerOrderId || entry?.orderId || entry?.id || '').trim().toUpperCase();
        const fallback = `${String(entry?.symbol || '').toUpperCase()}|${Number(entry?.positionClosedAtMs || entry?.closedAtMs || 0)}`;
        if ((key && dedupeKeys.has(key)) || (fallback && dedupeKeys.has(fallback))) continue;
        if (key) dedupeKeys.add(key);
        if (fallback) dedupeKeys.add(fallback);
        merged.push(entry);
      }

      const sorted = [...merged].sort((a, b) => {
        const aClose = Number(a?.positionClosedAtMs || 0) || Number(a?.updatedAtMs || 0) || Number(a?.createdAtMs || 0);
        const bClose = Number(b?.positionClosedAtMs || 0) || Number(b?.updatedAtMs || 0) || Number(b?.createdAtMs || 0);
        return bClose - aClose;
      });

      const errors: string[] = [];
      if (ledgerRes && !ledgerRes.ok) errors.push(String((ledgerRes as any)?.error || 'Trade ledger history unavailable.'));
      if (brokerHistoryRes && !brokerHistoryRes.ok) errors.push(String((brokerHistoryRes as any)?.error || 'Broker order history unavailable.'));
      const brokerError = brokerHistoryRes && !brokerHistoryRes.ok
        ? String((brokerHistoryRes as any)?.error || 'Broker order history unavailable.')
        : '';
      const brokerLikelyTransient =
        brokerError.trim().length > 0 &&
        /429|rate|cloudflare|denied|temporar|unavailable|timeout|upstream|gateway/i.test(brokerError);
      const shouldUseCached =
        sorted.length === 0 &&
        Array.isArray(cachedHistory?.entries) &&
        cachedHistory.entries.length > 0 &&
        (errors.length > 0 || (brokerLikelyTransient && brokerHistoryEntries.length === 0));

      if (shouldUseCached) {
        const ageSec = cachedHistory?.updatedAtMs
          ? Math.max(1, Math.round((Date.now() - Number(cachedHistory.updatedAtMs)) / 1000))
          : null;
        const stalePrefix = errors.length > 0 ? `${errors.join(' | ')} | ` : '';
        setHistoryEntries(cachedHistory!.entries);
        setHistoryError(`${stalePrefix}Showing cached history${ageSec != null ? ` (${ageSec}s old)` : ''}.`);
        return;
      }

      setHistoryEntries(sorted);
      if (sorted.length > 0) {
        const cachedPayload = {
          entries: sorted.slice(0, HISTORY_CACHE_ENTRY_LIMIT),
          updatedAtMs: Date.now()
        };
        historyCacheRef.current.set(historyCacheKey, cachedPayload);
        if (historyCacheAliasKey && historyCacheAliasKey !== historyCacheKey) {
          historyCacheRef.current.set(historyCacheAliasKey, cachedPayload);
        }
        persistHistoryCache();
      }
      if (errors.length > 0 && sorted.length === 0) {
        setHistoryError(errors.join(' | '));
      } else {
        setHistoryError(null);
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Failed to load trade history.';
      if (Array.isArray(cachedHistory?.entries) && cachedHistory.entries.length > 0) {
        const ageSec = cachedHistory?.updatedAtMs
          ? Math.max(1, Math.round((Date.now() - Number(cachedHistory.updatedAtMs)) / 1000))
          : null;
        setHistoryEntries(cachedHistory.entries);
        setHistoryError(`${msg} | Showing cached history${ageSec != null ? ` (${ageSec}s old)` : ''}.`);
      } else {
        setHistoryError(msg);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [activeAccount, activeAccount?.accNum, activeAccount?.accountId, activeAccount?.env, activeAccount?.server, historyAllAccounts, hydrateHistoryCache, mapBrokerOrderHistoryEntry, persistHistoryCache]);

  const fetchBlotter = useCallback(async (force: boolean = false) => {
    const bridge = requireBridge('tradelocker.blotter');
    if (!bridge.ok) {
      setBlotterError(bridge.error);
      return;
    }
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.list) return;
    if (!force) {
      const now = Date.now();
      if (now - lastBlotterFetchAtRef.current < 5_000) return;
      lastBlotterFetchAtRef.current = now;
    } else {
      lastBlotterFetchAtRef.current = Date.now();
    }

    setBlotterLoading(true);
    setBlotterError(null);
    try {
      const res = await ledger.list({ limit: 600 });
      if (!res?.ok || !Array.isArray(res.entries)) {
        setBlotterError(res?.error ? String(res.error) : 'Failed to load trade blotter.');
        return;
      }

      const env = activeAccount?.env ?? null;
      const server = activeAccount?.server ?? null;
      const accountId = activeAccount?.accountId ?? null;
      const accNum = activeAccount?.accNum ?? null;

      const accountMatches = (entry: any) => {
        if (blotterAllAccounts) return true;
        const activeIdentity = {
          env: env || null,
          server: server || null,
          accountId: parseTradeLockerAccountId(accountId),
          accNum: parseTradeLockerAccountId(accNum),
          accountKey: buildAccountKey({
            env: (env as 'demo' | 'live' | null) || null,
            server: server || null,
            accountId: parseTradeLockerAccountId(accountId),
            accNum: parseTradeLockerAccountId(accNum)
          })
        };
        if (!activeIdentity.accountKey && !env && !server && !accountId && !accNum) return true;
        const a =
          entry?.account ||
          entry?.acct ||
          {
            env: entry?.env ?? null,
            server: entry?.server ?? null,
            accountId: entry?.accountId ?? null,
            accNum: entry?.accNum ?? null,
            accountKey: entry?.accountKey ?? null
          };
        const entryIdentity = {
          env: a?.env ?? null,
          server: a?.server ?? null,
          accountId: parseTradeLockerAccountId(a?.accountId),
          accNum: parseTradeLockerAccountId(a?.accNum),
          accountKey: a?.accountKey != null ? String(a.accountKey) : (entry?.accountKey != null ? String(entry.accountKey) : null)
        };
        return resolveTradeLockerIdentityMatchState(activeIdentity, entryIdentity) === 'match';
      };

      const filtered = (res.entries as any[])
        .filter((e) => e?.kind === 'trade')
        .filter((e) => e?.broker === 'tradelocker')
        .filter(accountMatches);

      const sorted = [...filtered].sort((a, b) => {
        const aTime = Number(a?.updatedAtMs || a?.createdAtMs || 0);
        const bTime = Number(b?.updatedAtMs || b?.createdAtMs || 0);
        return bTime - aTime;
      });

      setBlotterEntries(sorted);
      setBlotterUpdatedAtMs(Date.now());
    } catch (e: any) {
      setBlotterError(e?.message ? String(e.message) : 'Failed to load trade blotter.');
    } finally {
      setBlotterLoading(false);
    }
  }, [activeAccount?.accNum, activeAccount?.accountId, activeAccount?.env, activeAccount?.server, blotterAllAccounts]);

  useEffect(() => {
    if (activeView !== 'history') return;
    void fetchHistory(true);
    const dispose = runtimeScheduler.registerTask({
      id: 'tradelocker.history.poll',
      groupId: 'tradelocker',
      intervalMs: 9000,
      jitterPct: 0.1,
      visibilityMode: 'foreground',
      priority: 'low',
      run: async () => {
        await fetchHistory(false);
      }
    });
    return () => dispose();
  }, [activeView, fetchHistory, runtimeScheduler]);

  useEffect(() => {
    if (activeView !== 'blotter') return;
    void fetchBlotter(true);
    const dispose = runtimeScheduler.registerTask({
      id: 'tradelocker.blotter.poll',
      groupId: 'tradelocker',
      intervalMs: 9000,
      jitterPct: 0.1,
      visibilityMode: 'foreground',
      priority: 'low',
      run: async () => {
        await fetchBlotter(false);
      }
    });
    return () => dispose();
  }, [activeView, fetchBlotter, runtimeScheduler]);

  const defaultTicketType = defaultOrderType === 'limit' ? 'limit' : defaultOrderType === 'stop' ? 'stop' : 'market';
  const defaultTicketQty = defaultOrderQty > 0 ? String(defaultOrderQty) : '';
  const [ticketSymbol, setTicketSymbol] = useState(initialPanelState.ticketSymbol ?? '');
  const [ticketSide, setTicketSide] = useState<TicketSide>(initialPanelState.ticketSide ?? 'BUY');
  const [ticketType, setTicketType] = useState<TicketType>(initialPanelState.ticketType ?? defaultTicketType);
  const [ticketQty, setTicketQty] = useState<string>(initialPanelState.ticketQty ?? defaultTicketQty);
  const [ticketPrice, setTicketPrice] = useState<string>('');
  const [ticketStopLoss, setTicketStopLoss] = useState<string>('');
  const [ticketTakeProfit, setTicketTakeProfit] = useState<string>('');
  const [ticketStrategyId, setTicketStrategyId] = useState<string>('manual');
  const [ticketEvidence, setTicketEvidence] = useState<EvidenceCard | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketFlash, setTicketFlash] = useState<string | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const [symbolFocused, setSymbolFocused] = useState(false);
  const [symbolSuggestLoading, setSymbolSuggestLoading] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<TradeLockerInstrumentSuggestion[]>([]);
  const suggestReqIdRef = useRef(0);
  const lastDefaultSymbolRef = useRef('');

  const ticketQuote = useMemo(() => {
    const symbol = ticketSymbol.trim();
    if (!symbol) return null;
    return getQuoteForSymbol(symbol);
  }, [getQuoteForSymbol, ticketSymbol]);

  const ticketPrecision = useMemo(() => {
    const candidate = [ticketQuote?.bid, ticketQuote?.ask, ticketQuote?.last, ticketQuote?.mid].find((value) => Number.isFinite(Number(value)));
    return inferPriceDecimals(candidate != null ? Number(candidate) : null);
  }, [ticketQuote]);

  const ticketPrecisionLabel = ticketPrecision == null ? 'Precision: --' : `Precision: ${ticketPrecision} dp`;

  const applyPricePrecision = useCallback(() => {
    if (ticketPrecision == null) return;
    if (ticketType !== 'market') setTicketPrice(roundToPrecision(ticketPrice, ticketPrecision));
    setTicketStopLoss(roundToPrecision(ticketStopLoss, ticketPrecision));
    setTicketTakeProfit(roundToPrecision(ticketTakeProfit, ticketPrecision));
  }, [roundToPrecision, ticketPrecision, ticketPrice, ticketStopLoss, ticketTakeProfit, ticketType]);

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = visiblePresets.find((item) => item.id === presetId);
      if (!preset) return;
      setPresetLabel(preset.label);
      setTicketSymbol(preset.symbol);
      setTicketSide(preset.side);
      setTicketType(preset.type);
      setTicketQty(preset.qty);
      setTicketPrice(preset.price || '');
      setTicketStopLoss(preset.stopLoss || '');
      setTicketTakeProfit(preset.takeProfit || '');
      setTicketStrategyId(preset.strategyId || 'manual');
    },
    [visiblePresets]
  );

  const handleSavePreset = useCallback(() => {
    const symbol = ticketSymbol.trim().toUpperCase();
    if (!symbol) {
      setTicketError('Preset requires a symbol.');
      return;
    }
    const label = presetLabel.trim() || `${symbol} ${ticketSide} ${ticketType}`;
    const id = `tl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const preset: TradeLockerTicketPreset = {
      id,
      label,
      accountKey: accountKey || null,
      symbol,
      side: ticketSide,
      type: ticketType,
      qty: ticketQty,
      price: ticketPrice,
      stopLoss: ticketStopLoss,
      takeProfit: ticketTakeProfit,
      strategyId: ticketStrategyId
    };
    setPresets((prev) => [preset, ...prev].slice(0, 50));
    setSelectedPresetId(id);
    setPresetLabel(label);
    setTicketFlash('Preset saved.');
  }, [
    accountKey,
    presetLabel,
    ticketPrice,
    ticketQty,
    ticketSide,
    ticketStopLoss,
    ticketStrategyId,
    ticketSymbol,
    ticketTakeProfit,
    ticketType
  ]);

  const handleUpdatePreset = useCallback(() => {
    if (!selectedPresetId) return;
    const existing = visiblePresets.find((item) => item.id === selectedPresetId);
    if (!existing) return;
    const symbol = ticketSymbol.trim().toUpperCase();
    if (!symbol) {
      setTicketError('Preset requires a symbol.');
      return;
    }
    const label = presetLabel.trim() || existing.label || `${symbol} ${ticketSide} ${ticketType}`;
    const updated: TradeLockerTicketPreset = {
      ...existing,
      label,
      accountKey: accountKey || null,
      symbol,
      side: ticketSide,
      type: ticketType,
      qty: ticketQty,
      price: ticketPrice,
      stopLoss: ticketStopLoss,
      takeProfit: ticketTakeProfit,
      strategyId: ticketStrategyId
    };
    setPresets((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)].slice(0, 50));
    setSelectedPresetId(updated.id);
    setPresetLabel(label);
    setTicketFlash('Preset updated.');
  }, [
    accountKey,
    presetLabel,
    selectedPresetId,
    ticketPrice,
    ticketQty,
    ticketSide,
    ticketStopLoss,
    ticketStrategyId,
    ticketSymbol,
    ticketTakeProfit,
    ticketType,
    visiblePresets
  ]);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPresetId) return;
    setPresets((prev) => prev.filter((item) => item.id !== selectedPresetId));
    setSelectedPresetId('');
    setPresetLabel('');
    setTicketFlash('Preset removed.');
  }, [selectedPresetId]);

  useEffect(() => {
    persistPanelState({
      activeView,
      ticketSymbol,
      ticketSide,
      ticketType,
      ticketQty
    });
  }, [activeView, ticketSymbol, ticketSide, ticketType, ticketQty]);

  useEffect(() => {
    const next = String(defaultSymbol || '').trim();
    if (!next) return;
    const upper = next.toUpperCase();
    if (lastDefaultSymbolRef.current === upper) return;
    lastDefaultSymbolRef.current = upper;
    setTicketSymbol(upper);
  }, [defaultSymbol]);

  const [closeDraft, setCloseDraft] = useState<{ positionId: string; qtyText: string } | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  useEffect(() => {
    const handleView = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      const raw = String(detail.view || detail.activeView || '').trim().toLowerCase();
      if (!raw) return;
      if (raw === 'ticket' || raw === 'positions' || raw === 'orders' || raw === 'history' || raw === 'blotter') {
        setActiveView(raw as typeof activeView);
      }
    };

    const handleTicket = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setTicketSymbol('');
        setTicketSide('BUY');
        setTicketType(defaultOrderType === 'limit' ? 'limit' : defaultOrderType === 'stop' ? 'stop' : 'market');
        setTicketQty(defaultOrderQty > 0 ? String(defaultOrderQty) : '');
        setTicketPrice('');
        setTicketStopLoss('');
        setTicketTakeProfit('');
        setTicketStrategyId('manual');
        setTicketEvidence(null);
        return;
      }
      if (detail.symbol != null) setTicketSymbol(String(detail.symbol));
      if (detail.side != null) {
        const sideRaw = String(detail.side).trim().toUpperCase();
        if (sideRaw === 'SELL') setTicketSide('SELL');
        if (sideRaw === 'BUY') setTicketSide('BUY');
      }
      if (detail.type != null) {
        const typeRaw = String(detail.type).trim().toLowerCase();
        if (typeRaw === 'limit') setTicketType('limit');
        if (typeRaw === 'stop') setTicketType('stop');
        if (typeRaw === 'market') setTicketType('market');
      }
      if (detail.qty != null) setTicketQty(String(detail.qty));
      if (detail.price != null) setTicketPrice(String(detail.price));
      if (detail.stopLoss != null) setTicketStopLoss(String(detail.stopLoss));
      if (detail.takeProfit != null) setTicketTakeProfit(String(detail.takeProfit));
      if (detail.strategyId != null) setTicketStrategyId(String(detail.strategyId));
      if (detail.evidence !== undefined) {
        const raw = detail.evidence;
        if (raw && typeof raw === 'object') setTicketEvidence(raw as EvidenceCard);
        else if (raw === null) setTicketEvidence(null);
      }
      if (detail.open) setActiveView('ticket');
    };

    const handleOrdersFilters = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.query != null) setOrdersQuery(String(detail.query));
      if (detail.open) setActiveView('orders');
    };

    const handleHistoryFilters = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.query != null) setHistoryQuery(String(detail.query));
      if (detail.allAccounts != null) setHistoryAllAccounts(!!detail.allAccounts);
      if (detail.open) setActiveView('history');
    };

    const handleCloseDraft = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.clear) {
        setCloseDraft(null);
        return;
      }
      const positionId = detail.positionId != null ? String(detail.positionId).trim() : '';
      if (!positionId) {
        setCloseDraft(null);
        return;
      }
      const qtyText = detail.qty != null ? String(detail.qty) : '';
      setCloseDraft({ positionId, qtyText });
      if (detail.open) setActiveView('positions');
    };

    window.addEventListener('glass_tradelocker_view', handleView as any);
    window.addEventListener('glass_tradelocker_ticket', handleTicket as any);
    window.addEventListener('glass_tradelocker_orders_filters', handleOrdersFilters as any);
    window.addEventListener('glass_tradelocker_history_filters', handleHistoryFilters as any);
    window.addEventListener('glass_tradelocker_close_draft', handleCloseDraft as any);
    return () => {
      window.removeEventListener('glass_tradelocker_view', handleView as any);
      window.removeEventListener('glass_tradelocker_ticket', handleTicket as any);
      window.removeEventListener('glass_tradelocker_orders_filters', handleOrdersFilters as any);
      window.removeEventListener('glass_tradelocker_history_filters', handleHistoryFilters as any);
      window.removeEventListener('glass_tradelocker_close_draft', handleCloseDraft as any);
    };
  }, [defaultOrderQty, defaultOrderType]);

  useEffect(() => {
    if (!ticketFlash) return;
    const t = window.setTimeout(() => setTicketFlash(null), 2200);
    return () => window.clearTimeout(t);
  }, [ticketFlash]);

  useEffect(() => {
    if (!onSearchInstruments || !symbolFocused) {
      setSymbolSuggestLoading(false);
      setSymbolSuggestions([]);
      return;
    }

    const query = ticketSymbol.trim();
    if (query.length < 1) {
      setSymbolSuggestLoading(false);
      setSymbolSuggestions([]);
      return;
    }

    const reqId = ++suggestReqIdRef.current;
    setSymbolSuggestLoading(true);

    const t = window.setTimeout(async () => {
      try {
        const results = await onSearchInstruments(query, 12);
        if (suggestReqIdRef.current !== reqId) return;
        setSymbolSuggestions(Array.isArray(results) ? results : []);
      } catch {
        if (suggestReqIdRef.current !== reqId) return;
        setSymbolSuggestions([]);
      } finally {
        if (suggestReqIdRef.current === reqId) setSymbolSuggestLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(t);
  }, [onSearchInstruments, symbolFocused, ticketSymbol]);

  const marginLine = useMemo(() => {
    if (!accountMetrics) return null;
    const currency = accountMetrics.currency ? String(accountMetrics.currency) : null;
    const used = accountMetrics.marginUsed;
    const free = accountMetrics.marginFree;
    const level = accountMetrics.marginLevel;

    const hasAny = used != null || free != null || level != null || currency;
    if (!hasAny) return null;

    const parts: string[] = [];
    if (currency) parts.push(`CCY: ${currency}`);
    if (used != null) parts.push(`Margin: ${used.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (free != null) parts.push(`Free: ${free.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (level != null) parts.push(`Level: ${level.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
    return parts.join(' • ');
  }, [accountMetrics]);

  const snapshotUpdatedLabel = useMemo(() => {
    if (!snapshotUpdatedAtMs) return null;
    try {
      return new Date(snapshotUpdatedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return null;
    }
  }, [snapshotUpdatedAtMs]);

  const metricsUpdatedLabel = useMemo(() => {
    const ms = accountMetrics?.updatedAtMs;
    if (!ms) return null;
    try {
      return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return null;
    }
  }, [accountMetrics?.updatedAtMs]);

  const filteredOrders = useMemo(() => {
    const q = ordersQuery.trim().toLowerCase();
    const list = Array.isArray(orders) ? orders : [];
    const base = q ? list.filter(o => String(o.symbol || '').toLowerCase().includes(q)) : list;
    return [...base].sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  }, [orders, ordersQuery]);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const base = q
      ? historyEntries.filter((e) => String(e?.symbol || '').toLowerCase().includes(q))
      : historyEntries;
    return base;
  }, [historyEntries, historyQuery]);

  const filteredBlotterEntries = useMemo(() => {
    const q = blotterQuery.trim().toLowerCase();
    const base = q
      ? blotterEntries.filter((e) => String(e?.symbol || '').toLowerCase().includes(q))
      : blotterEntries;
    return base;
  }, [blotterEntries, blotterQuery]);

  const historySummary = useMemo(() => {
    const count = filteredHistory.length;
    const pnl = filteredHistory.reduce((acc, e) => {
      const v =
        Number.isFinite(Number(e?.realizedPnl))
          ? Number(e.realizedPnl)
          : Number.isFinite(Number(e?.positionClosedPnl))
            ? Number(e.positionClosedPnl)
            : Number.isFinite(Number(e?.positionClosedPnlEstimate))
              ? Number(e.positionClosedPnlEstimate)
              : 0;
      return acc + v;
    }, 0);
    return { count, pnl };
  }, [filteredHistory]);

  const blotterUpdatedLabel = blotterUpdatedAtMs ? formatAge(blotterUpdatedAtMs) : '';

  const handleCancelOrder = useCallback(async (o: TradeLockerOrder) => {
    if (!onCancelOrder) return;
    const confirmed = window.confirm(`Cancel ${o.type.toUpperCase()} ${o.side} ${o.symbol} (qty ${o.qty})?`);
    if (!confirmed) return;

    setCancelingOrderId(o.id);
    try {
      await Promise.resolve(onCancelOrder(o.id));
    } finally {
      setCancelingOrderId(null);
    }
  }, [onCancelOrder]);

  const handleToggleClosePanel = useCallback((positionId: string) => {
    setCloseError(null);
    const shouldClear = closeDraft?.positionId === positionId;
    runActionOr(
      'tradelocker.close_panel.set',
      shouldClear ? { clear: true } : { positionId, qty: '0', open: true },
      () => {
        setCloseDraft((prev) => (prev?.positionId === positionId ? null : { positionId, qtyText: '0' }));
      }
    );
  }, [closeDraft, runActionOr]);

  const handleConfirmClose = useCallback(async () => {
    if (!closeDraft) return;
    setCloseError(null);

    const qtyParsed = parseLooseNumber(closeDraft.qtyText);
    const qty = qtyParsed == null ? 0 : qtyParsed;
    if (!Number.isFinite(qty) || qty < 0) {
      setCloseError('Qty must be 0 (full close) or a positive number.');
      return;
    }

    const pos = positions.find((p) => p.id === closeDraft.positionId);
    if (qty !== 0 && pos && Number.isFinite(pos.size) && qty > pos.size) {
      setCloseError(`Qty exceeds position size (${pos.size}).`);
      return;
    }

    setCloseSubmitting(true);
    try {
      await Promise.resolve(onClosePosition(closeDraft.positionId, qty));
      setCloseDraft(null);
    } finally {
      setCloseSubmitting(false);
    }
  }, [closeDraft, onClosePosition, parseLooseNumber, positions]);

  const handleSubmitTicket = useCallback(async () => {
    setTicketError(null);
    setTicketFlash(null);

    if (!onPlaceOrder) {
      setTicketError('TradeLocker order entry is unavailable.');
      return;
    }
    if (!isConnected) {
      setTicketError('Not connected. Open Settings to connect.');
      return;
    }
    if (!tradingEnabled) {
      setTicketError('Trading is disabled in Settings.');
      return;
    }

    const symbol = ticketSymbol.trim();
    if (!symbol) {
      setTicketError('Symbol is required.');
      return;
    }

    const qtyNum = parseLooseNumber(ticketQty);
    if (ticketQty.trim() && (qtyNum == null || qtyNum <= 0)) {
      setTicketError('Qty must be > 0 (or leave blank to use default).');
      return;
    }

    const slNum = parseLooseNumber(ticketStopLoss);
    if (ticketStopLoss.trim() && (slNum == null || slNum <= 0)) {
      setTicketError('Stop loss must be a positive number (or leave blank).');
      return;
    }

    const tpNum = parseLooseNumber(ticketTakeProfit);
    if (ticketTakeProfit.trim() && (tpNum == null || tpNum <= 0)) {
      setTicketError('Take profit must be a positive number (or leave blank).');
      return;
    }

    const priceNum = parseLooseNumber(ticketPrice);
    if ((ticketType === 'limit' || ticketType === 'stop') && (priceNum == null || priceNum <= 0)) {
      setTicketError(`${ticketType === 'stop' ? 'Stop' : 'Limit'} orders require a valid price.`);
      return;
    }

    const args: any = {
      symbol,
      side: ticketSide,
      type: ticketType,
      strategyId: ticketStrategyId.trim() || 'manual'
    };
    if (qtyNum != null && qtyNum > 0) args.qty = qtyNum;
    if (ticketType === 'limit') args.price = priceNum;
    if (ticketType === 'stop') args.stopPrice = priceNum;
    if (slNum != null && slNum > 0) args.stopLoss = slNum;
    if (tpNum != null && tpNum > 0) args.takeProfit = tpNum;

    setTicketSubmitting(true);
    try {
      const res: any = await Promise.resolve(onPlaceOrder(args));
      if (res && res.ok === false) {
        setTicketError(res?.error ? String(res.error) : 'Order rejected.');
        return;
      }
      const resolved = res?.resolvedSymbol != null ? String(res.resolvedSymbol).trim() : '';
      if (resolved && resolved !== symbol) setTicketSymbol(resolved);
      const statusHint = res?.orderStatus ? ` (${String(res.orderStatus)})` : '';
      setTicketFlash(`Order submitted${statusHint}.`);
    } catch (e: any) {
      setTicketError(e?.message ? String(e.message) : 'Failed to submit order.');
    } finally {
      setTicketSubmitting(false);
    }
  }, [
    isConnected,
    onPlaceOrder,
    parseLooseNumber,
    ticketPrice,
    ticketQty,
    ticketSide,
    ticketStopLoss,
    ticketSymbol,
    ticketTakeProfit,
    ticketType,
    ticketStrategyId,
    tradingEnabled
  ]);

  return (
  <div className="flex flex-col h-full w-full text-gray-200 bg-[#0a0a0a]">
         {/* Header / Stats Bar */}
         <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-purple-900/20 to-black">
             <div className="flex items-center gap-2 text-purple-400 text-xs uppercase tracking-wider font-bold mb-4">
                  <Lock size={14} />
                  <span>TradeLocker Terminal</span>
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${tradingEnabled ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                    {tradingEnabled ? 'TRADING ON' : 'TRADING OFF'}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="text-[10px] text-gray-500 font-mono">
                      {snapshotUpdatedLabel ? `Snap: ${snapshotUpdatedLabel}` : 'Snap: --'}
                      {metricsUpdatedLabel ? ` • Acct: ${metricsUpdatedLabel}` : ''}
                      {streamStatusLine ? ` • ${streamStatusLine}` : ''}
                    </div>
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        title="Open Settings"
                      >
                        <Settings size={14} />
                      </button>
                    )}
                    {onRefresh && (
                      <button
                        type="button"
                        onClick={() => {
                          onRefresh();
                          if (activeView === 'history') {
                            fetchHistory(true);
                          }
                        }}
                        className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        title="Refresh TradeLocker snapshot"
                      >
                        <RotateCw size={14} />
                      </button>
                    )}
                  </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                 <div className="flex flex-col">
                     <span className="text-[10px] text-gray-500 uppercase tracking-widest">Balance</span>
                     <span className="text-xl font-mono text-white">${effectiveBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                 </div>
                 <div className="flex flex-col">
                     <span className="text-[10px] text-gray-500 uppercase tracking-widest">Equity</span>
                     <span className={`text-xl font-mono ${totalPnL >= 0 ? 'text-white' : 'text-red-200'}`}>
                         ${effectiveEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                     </span>
                 </div>
             </div>
            
             <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-end">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest">Floating P&L</span>
                  <span className={`text-lg font-mono font-bold ${pnlColor}`}>
                     {totalPnL >= 0 ? '+' : ''}{totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
             </div>

             {marginLine && (
               <div className="mt-2 text-[10px] text-gray-500 font-mono">
                 {marginLine}
               </div>
             )}

             {accountMetricsError && !marginLine && (
               <div className="mt-2 text-[10px] text-yellow-300/90 font-mono">
                 Account metrics unavailable: {accountMetricsError}
               </div>
             )}

            {brokerQuotesError && (
              <div className="mt-2 text-[10px] text-yellow-300/90 font-mono">
                Broker quotes unavailable: {brokerQuotesError}
              </div>
            )}

            {streamError && (
              <div className="mt-2 text-[10px] text-red-300/90 font-mono">
                Stream error: {streamError}
              </div>
            )}

            {rateLimitLine && (
              <div className={`mt-2 text-[10px] font-mono ${rateLimitTone}`}>
                {rateLimitLine}
              </div>
            )}

            {!brokerQuotesError && brokerQuotesUpdatedAtMs && (
              <div className={`mt-2 text-[10px] font-mono ${quotesFresh ? 'text-green-300/90' : 'text-gray-500'}`}>
                Broker quotes updated {formatAge(brokerQuotesUpdatedAtMs)} ago
              </div>
            )}

            {accountOptions.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setRoutingOpen((prev) => !prev)}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
                >
                  <Link2 size={12} />
                  <span>Account Routing</span>
                  <span className="text-[10px] text-gray-500">{routingOpen ? 'Hide' : 'Show'}</span>
                </button>
                {routingOpen && (
                  <div className="mt-3 rounded-lg border border-white/5 bg-black/30 p-3 space-y-4">
                    {accountsError && (
                      <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
                        Accounts error: {accountsError}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-500">Add TradeLocker Account</div>
                        <div className="text-[10px] text-gray-500">Add another login to populate more accounts.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddAccountOpen(true)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-white/10 text-[11px] text-gray-300 hover:text-white hover:border-white/30"
                      >
                        <Plus size={12} />
                        Add account
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Snapshot Source</div>
                        <div className="flex items-center gap-2">
                          <select
                            value={effectiveSnapshotKey}
                            onChange={(e) => void handleSnapshotSourceSelect(e.target.value)}
                            disabled={snapshotSwitching}
                            className="flex-1 bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded"
                          >
                            {accountOptions.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                          </select>
                          {onRefreshAccounts && (
                            <button
                              type="button"
                              onClick={onRefreshAccounts}
                              className="p-1.5 rounded border border-white/10 text-gray-400 hover:text-white hover:border-white/30"
                              title="Refresh account list"
                            >
                              <RotateCw size={12} />
                            </button>
                          )}
                        </div>
                        {snapshotSwitching && (
                          <div className="mt-1 text-[10px] text-cyan-300">Switching account...</div>
                        )}
                        {snapshotSwitchError && (
                          <div className="mt-1 text-[10px] text-red-300">{snapshotSwitchError}</div>
                        )}
                        <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
                          <input
                            type="checkbox"
                            checked={!!snapshotAutoSwitch}
                            onChange={(e) => onSnapshotAutoSwitchChange?.(e.target.checked)}
                          />
                          Auto-switch on failure
                        </label>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Normalization</div>
                        <label className="flex items-center gap-2 text-[11px] text-gray-400">
                          <input
                            type="checkbox"
                            checked={!!normalizationEnabled}
                            onChange={(e) => onNormalizationChange?.({ enabled: e.target.checked })}
                          />
                          Normalize prices across accounts
                        </label>
                        <div className="mt-2">
                          <select
                            value={normalizationReferenceKey || effectiveSnapshotKey}
                            onChange={(e) => onNormalizationChange?.({ referenceKey: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded"
                          >
                            {accountOptions.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                          </select>
                          <div className="mt-1 text-[10px] text-gray-500">Reference account for price offsets.</div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Execution Targets</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {accountOptions.map((opt) => (
                          <label key={`exec-${opt.key}`} className="flex items-center gap-2 text-[11px] text-gray-400">
                            <input
                              type="checkbox"
                              checked={executionTargetSet.has(opt.key)}
                              onChange={() => toggleExecutionTarget(opt.key)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-1 text-[10px] text-gray-500">Select multiple accounts for mirror/copy execution.</div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Snapshot Fallback Order</div>
                      {fallbackOrder.length === 0 && (
                        <div className="text-[11px] text-gray-500">No fallback accounts selected.</div>
                      )}
                      {availableFallbackOptions.length === 0 && (
                        <div className="text-[11px] text-gray-500">
                          No additional accounts detected. Add another TradeLocker account and click Refresh.
                        </div>
                      )}
                      <div className="space-y-2">
                        {fallbackOrder.map((key, idx) => {
                          const label = accountOptions.find((opt) => opt.key === key)?.label || key;
                          return (
                            <div key={`fallback-${key}`} className="flex items-center gap-2 text-[11px] text-gray-400">
                              <span className="flex-1">{label}</span>
                              <button
                                type="button"
                                onClick={() => moveSnapshotFallback(idx, -1)}
                                className="p-1 rounded border border-white/10 hover:border-white/30"
                                title="Move up"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSnapshotFallback(idx, 1)}
                                className="p-1 rounded border border-white/10 hover:border-white/30"
                                title="Move down"
                              >
                                <ChevronDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSnapshotFallbackRemove(key)}
                                className="p-1 rounded border border-white/10 hover:border-white/30"
                                title="Remove"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          className="flex-1 bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded"
                          disabled={availableFallbackOptions.length === 0}
                          onChange={(e) => {
                            const key = e.target.value;
                            if (key) handleSnapshotFallbackAdd(key);
                            e.currentTarget.selectedIndex = 0;
                          }}
                        >
                          <option value="">
                            {availableFallbackOptions.length === 0 ? 'No other accounts' : 'Add account…'}
                          </option>
                          {availableFallbackOptions.map((opt) => (
                            <option key={`fallback-add-${opt.key}`} value={opt.key}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Symbol Map</div>
                      <textarea
                        className="w-full h-20 bg-black/40 border border-white/10 text-[11px] px-2 py-1.5 rounded"
                        value={symbolMapText}
                        onChange={(e) => setSymbolMapText(e.target.value)}
                        placeholder="Canonical | MT5 | TradeLocker"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-[10px] text-gray-500">One per line. Canonical required.</div>
                        <button
                          type="button"
                          onClick={() => onSymbolMapChange?.(parseSymbolMapText(symbolMapText))}
                          className="px-2 py-1 rounded border border-white/10 text-[11px] text-gray-300 hover:text-white hover:border-white/30"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
         </div>
         
        {/* Positions / Orders */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
             <div className="sticky top-0 z-10 bg-[#0a0a0a]/90 backdrop-blur border-b border-white/5 px-3 py-2 flex items-center gap-2">
               <button
                 type="button"
                 onClick={() => runActionOr('tradelocker.view.set', { view: 'ticket' }, () => setActiveView('ticket'))}
                 className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                   activeView === 'ticket' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                 }`}
               >
                 Ticket
               </button>
              <button
                type="button"
                onClick={() => runActionOr('tradelocker.view.set', { view: 'positions' }, () => setActiveView('positions'))}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                 activeView === 'positions' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
               }`}
              >
                Positions <span className="text-[10px] text-gray-500">({positions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => runActionOr('tradelocker.view.set', { view: 'orders' }, () => setActiveView('orders'))}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === 'orders' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                Orders <span className="text-[10px] text-gray-500">({orders.length})</span>
              </button>
              <button
                type="button"
                onClick={() => runActionOr('tradelocker.view.set', { view: 'history' }, () => setActiveView('history'))}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === 'history' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                History <span className="text-[10px] text-gray-500">({historyEntries.length})</span>
              </button>
              <button
                type="button"
                onClick={() => runActionOr('tradelocker.view.set', { view: 'blotter' }, () => setActiveView('blotter'))}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === 'blotter' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                Blotter <span className="text-[10px] text-gray-500">({blotterEntries.length})</span>
              </button>
            </div>

            {activeView === 'positions' ? (
              displayPositions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-600 opacity-60">
                    <TrendingUp size={32} className="mb-2" />
                    <span className="text-xs">No open positions</span>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                    {displayPositions.map(pos => (
                        <div key={pos.id} className="p-4 hover:bg-white/5 transition-colors group">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pos.type === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {pos.type}
                                    </span>
                                    <span className="font-bold text-sm">{pos.symbol}</span>
                                 </div>
                                 <button 
                                     onClick={() => handleToggleClosePanel(pos.id)}
                                     className="p-1 hover:bg-red-500/20 text-gray-600 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                                     title="Close position (full or partial)"
                                 >
                                     <X size={14} />
                                 </button>
                             </div>
                            
                            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono text-gray-400 mb-2">
                                <div className="flex justify-between">
                                    <span>Entry:</span>
                                    <span className="text-gray-300">{pos.entryPrice}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>TP:</span>
                                    <span className="text-green-500/70">{pos.takeProfit}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Size:</span>
                                    <span className="text-gray-300">{pos.size}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>SL:</span>
                                    <span className="text-red-500/70">{pos.stopLoss}</span>
                                </div>
                            </div>

                            {(() => {
                              const quote = getQuoteForSymbol(pos.symbol);
                              if (!quote) return null;
                              const bid = quote.bid ?? null;
                              const ask = quote.ask ?? null;
                              const mid = quote.mid ?? null;
                              const ageLabel = formatAge(quote.fetchedAtMs ?? quote.timestampMs ?? null);
                              const spread = quote.spread != null ? formatPrice(quote.spread) : null;
                              return (
                                <div className="mb-2 text-[10px] text-gray-500 font-mono flex items-center justify-between">
                                  <span>
                                    Broker {bid != null ? formatPrice(bid) : '--'} / {ask != null ? formatPrice(ask) : '--'}
                                    {mid != null ? ` (mid ${formatPrice(mid)})` : ''}
                                    {spread ? ` sp ${spread}` : ''}
                                  </span>
                                  {ageLabel ? <span className="text-gray-600">{ageLabel}</span> : null}
                                </div>
                              );
                            })()}
                            
                             <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                 <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                     <Clock size={10} />
                                     <span>{pos.openTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                 </div>
                                  <span className={`font-mono font-bold text-sm ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                                  </span>
                              </div>

                              {closeDraft?.positionId === pos.id && (
                                <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/10">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={closeDraft.qtyText}
                                      onChange={(e) => runActionOr('tradelocker.close_panel.set', { positionId: pos.id, qty: e.target.value }, () => setCloseDraft({ positionId: pos.id, qtyText: e.target.value }))}
                                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-red-500/40 transition-colors font-mono"
                                      placeholder="0 = full close"
                                    />
                                    <button
                                      type="button"
                                      onClick={handleConfirmClose}
                                      disabled={closeSubmitting || !isConnected || !tradingEnabled}
                                      className="px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/20 border border-red-500/20 text-red-200 text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {closeSubmitting ? 'Closing…' : 'Close'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => runActionOr('tradelocker.close_panel.set', { clear: true }, () => setCloseDraft(null))}
                                      className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-[11px] font-semibold transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  <div className="mt-2 text-[10px] text-gray-500 font-mono">
                                    Qty is lots to close. Use 0 to fully close the position.
                                  </div>
                                  {closeError && (
                                    <div className="mt-2 text-[10px] text-yellow-300/90 font-mono">
                                      {closeError}
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                      ))}
                 </div>
               )
            ) : activeView === 'orders' ? (
              <div className="p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={ordersQuery}
                    onChange={(e) => runActionOr('tradelocker.orders.filters.set', { query: e.target.value }, () => setOrdersQuery(e.target.value))}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                    placeholder="Filter orders by symbol (e.g. EURUSD)"
                  />
                  <div className="flex-shrink-0 text-[10px] text-gray-500 font-mono">
                    {filteredOrders.length}/{orders.length}
                  </div>
                </div>
                <div className="mb-3 text-[10px] text-gray-500">
                  Tip: TP/SL close orders often show as the opposite side (BUY position → SELL order).
                </div>
                {ordersError && (
                  <div className="mb-3 text-[11px] text-yellow-300/90 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2">
                    Orders unavailable: {ordersError}
                  </div>
                )}
                {filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-600 opacity-60">
                    <TrendingDown size={32} className="mb-2" />
                    <span className="text-xs">{orders.length === 0 ? 'No pending orders' : 'No matching orders'}</span>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {filteredOrders.map((o) => {
                      const matchingPositions = displayPositions.filter((p) => p.symbol === o.symbol);
                      const isClose = matchingPositions.some((p) => p.type !== o.side);
                      const price = Number(o.price || 0);
                      const tol = price > 0 ? Math.max(0.01, Math.abs(price) * 0.00001) : 0;

                      const tagSet = new Set<string>();
                      if (isClose) tagSet.add('CLOSE');
                      if (price > 0) {
                        for (const p of matchingPositions) {
                          if (Number(p.takeProfit) > 0 && Math.abs(price - Number(p.takeProfit)) <= tol) tagSet.add('TP');
                          if (Number(p.stopLoss) > 0 && Math.abs(price - Number(p.stopLoss)) <= tol) tagSet.add('SL');
                        }
                      }

                      const tagOrder = ['TP', 'SL', 'CLOSE'];
                      const tags = tagOrder.filter((t) => tagSet.has(t));

                      return (
                        <div key={o.id} className="p-4 hover:bg-white/5 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${o.side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {o.side}
                            </span>
                            <span className="font-bold text-sm">{o.symbol}</span>
                            <span className="text-[10px] text-gray-500 font-mono px-2 py-0.5 rounded bg-white/5">
                              {o.type.toUpperCase()}
                            </span>
                            {tags.map((t) => (
                              <span
                                key={t}
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                  t === 'TP'
                                    ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                    : t === 'SL'
                                      ? 'bg-red-500/10 text-red-300 border-red-500/20'
                                      : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                }`}
                                title={t === 'CLOSE' ? 'Likely tied to an open position (TP/SL close order).' : undefined}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 font-mono">{o.status}</span>
                            {onCancelOrder && (
                              <button
                                type="button"
                                onClick={() => handleCancelOrder(o)}
                                disabled={cancelingOrderId === o.id || !isConnected || !tradingEnabled}
                                className="p-1 rounded hover:bg-red-500/20 text-gray-600 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Cancel order"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono text-gray-400 mb-2">
                          <div className="flex justify-between">
                            <span>Qty:</span>
                            <span className="text-gray-300">{o.qty}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Price:</span>
                            <span className="text-gray-300">{o.type === 'market' && price <= 0 ? 'MKT' : (price || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>SL:</span>
                            <span className="text-red-500/70">
                              {Number.isFinite(Number(o.stopLoss)) && Number(o.stopLoss) > 0 ? formatPrice(Number(o.stopLoss)) : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>TP:</span>
                            <span className="text-green-500/70">
                              {Number.isFinite(Number(o.takeProfit)) && Number(o.takeProfit) > 0 ? formatPrice(Number(o.takeProfit)) : '--'}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                          <div className="flex items-center gap-1 text-[10px] text-gray-600">
                            <Clock size={10} />
                            <span>{o.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="text-[10px] text-gray-600 font-mono">
                            {o.filledQty != null ? `Filled: ${o.filledQty}` : null}
                            {o.filledQty != null && o.remainingQty != null ? ' • ' : null}
                            {o.remainingQty != null ? `Remain: ${o.remainingQty}` : null}
                          </div>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeView === 'history' ? (
              <div className="p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={historyQuery}
                    onChange={(e) => runActionOr('tradelocker.history.filters.set', { query: e.target.value }, () => setHistoryQuery(e.target.value))}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                    placeholder="Filter history by symbol (e.g. BTCUSD)"
                  />
                  <div className="flex-shrink-0 text-[10px] text-gray-500 font-mono">
                    {historySummary.count}
                  </div>
                </div>

                <div className="mb-3 flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                  <div>
                    Realized P&L: <span className={historySummary.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {historySummary.pnl >= 0 ? '+' : ''}{historySummary.pnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runActionOr('tradelocker.history.filters.set', { allAccounts: !historyAllAccounts }, () => setHistoryAllAccounts((v) => !v))}
                      className={`px-2 py-1 rounded border text-[10px] font-semibold transition-colors ${
                        historyAllAccounts
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-200 hover:bg-purple-500/15'
                          : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10'
                      }`}
                      title={historyAllAccounts ? 'Showing all accounts' : 'Filtered to current account'}
                    >
                      {historyAllAccounts ? 'All accts' : 'This acct'}
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchHistory(true)}
                      className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-gray-200 transition-colors"
                      disabled={historyLoading}
                    >
                      {historyLoading ? 'Loading.' : 'Reload'}
                    </button>
                  </div>
                </div>
                <div className="mb-3 text-[10px] text-gray-600">
                  Note: History prefers Glass trade-ledger records and augments with TradeLocker broker order history when available.
                </div>

                {tradeLedgerUnavailableMessage && (
                  <div className="mb-3 text-[11px] text-yellow-300/90 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2">
                    {tradeLedgerUnavailableMessage}
                  </div>
                )}

                {historyError && (
                  <div className="mb-3 text-[11px] text-yellow-300/90 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2">
                    {historyError}
                  </div>
                )}

                {filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-600 opacity-60">
                    <TrendingDown size={32} className="mb-2" />
                    <span className="text-xs">{historyLoading ? 'Loading trade history...' : 'No closed trades found'}</span>
                    {activeAccount?.accountId != null && (
                      <span className="text-[10px] text-gray-600 mt-1 font-mono">
                        {historyAllAccounts
                          ? 'Showing all accounts'
                          : `Filtered to account ${activeAccount.accountId}${activeAccount.accNum != null ? `/${activeAccount.accNum}` : ''}`}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {filteredHistory.map((e) => {
                      const symbol = String(e?.symbol || 'UNKNOWN');
                      const side = String(e?.action || e?.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
                      const orderType = String(e?.orderType || e?.type || '').toLowerCase();

                      const qty =
                        Number.isFinite(Number(e?.qtyNormalized))
                          ? Number(e.qtyNormalized)
                          : Number.isFinite(Number(e?.brokerQty))
                            ? Number(e.brokerQty)
                          : Number.isFinite(Number(e?.qty))
                            ? Number(e.qty)
                            : null;

                      const brokerEntry =
                        Number.isFinite(Number(e?.brokerEntryPrice)) && Number(e.brokerEntryPrice) > 0
                          ? Number(e.brokerEntryPrice)
                          : null;
                      const entryPrice = brokerEntry != null
                        ? brokerEntry
                        : Number.isFinite(Number(e?.entryPrice)) && Number(e.entryPrice) > 0
                          ? Number(e.entryPrice)
                          : null;

                      const closePrice =
                        Number.isFinite(Number(e?.brokerClosePrice)) && Number(e.brokerClosePrice) > 0
                          ? Number(e.brokerClosePrice)
                          : null;

                      const realized =
                        Number.isFinite(Number(e?.realizedPnl))
                          ? Number(e.realizedPnl)
                          : Number.isFinite(Number(e?.positionClosedPnl))
                            ? Number(e.positionClosedPnl)
                            : Number.isFinite(Number(e?.positionClosedPnlEstimate))
                              ? Number(e.positionClosedPnlEstimate)
                              : null;

                      const pnlClass =
                        realized == null
                          ? 'text-gray-400'
                          : realized >= 0
                            ? 'text-green-400'
                            : 'text-red-400';
                      const stopLoss =
                        Number.isFinite(Number(e?.stopLoss)) && Number(e.stopLoss) > 0
                          ? Number(e.stopLoss)
                          : null;
                      const takeProfit =
                        Number.isFinite(Number(e?.takeProfit)) && Number(e.takeProfit) > 0
                          ? Number(e.takeProfit)
                          : null;
                      const closeAtMs = Number(e?.positionClosedAtMs || 0);
                      const openAtMs = Number(e?.brokerOpenTimeMs || e?.positionOpenedAtMs || 0);
                      const durationSec =
                        closeAtMs > 0 && openAtMs > 0 ? Math.max(0, Math.round((closeAtMs - openAtMs) / 1000)) : null;

                      return (
                        <div key={String(e?.id || `${symbol}-${closeAtMs}`)} className="p-4 hover:bg-white/5 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {side}
                              </span>
                              <span className="font-bold text-sm">{symbol}</span>
                              {orderType && (
                                <span className="text-[10px] text-gray-500 font-mono px-2 py-0.5 rounded bg-white/5">
                                  {orderType.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className={`font-mono font-bold text-sm ${pnlClass}`}>
                              {realized == null ? '--' : `${realized >= 0 ? '+' : ''}${realized.toFixed(2)}`}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono text-gray-400 mb-2">
                            <div className="flex justify-between">
                              <span>Qty:</span>
                              <span className="text-gray-300">{qty != null ? qty : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Entry:</span>
                              <span className="text-gray-300">{entryPrice != null ? entryPrice : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Exit:</span>
                              <span className="text-gray-300">{closePrice != null ? closePrice : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>SL:</span>
                              <span className="text-red-500/70">{stopLoss != null ? formatPrice(stopLoss) : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>TP:</span>
                              <span className="text-green-500/70">{takeProfit != null ? formatPrice(takeProfit) : '--'}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-white/5">
                            <div className="text-[10px] text-gray-600 font-mono space-y-0.5">
                              <div>Submitted: {formatTs(e?.createdAtMs)} • Accepted: {formatTs(e?.brokerAcceptedAtMs)}</div>
                              <div>Opened: {formatTs(openAtMs)} • Closed: {formatTs(e?.positionClosedAtMs)}{durationSec != null ? ` • Dur: ${durationSec}s` : ''}</div>
                            </div>
                            <div className="text-[10px] text-gray-600 font-mono text-right">
                              {e?.realizedPnlSource ? `Src: ${String(e.realizedPnlSource)}` : null}
                            </div>
                          </div>

                          {e?.reason && (
                            <div className="mt-2 text-[10px] text-gray-500">
                              Reason: {String(e.reason)}
                            </div>
                          )}

                          <details className="mt-2">
                            <summary className="text-[10px] text-gray-500 cursor-pointer select-none">Details</summary>
                            <div className="mt-2 text-[10px] text-gray-500 font-mono space-y-1">
                              <div>Ledger: {String(e?.id || '--')}</div>
                              {e?.brokerOrderId ? <div>Order ID: {String(e.brokerOrderId)}</div> : null}
                              {e?.positionId ? <div>Position ID: {String(e.positionId)}</div> : null}
                              {e?.clientTag ? <div>Tag: {String(e.clientTag)}</div> : null}
                              {e?.brokerCommission != null ? <div>Commission: {Number(e.brokerCommission).toFixed(2)}</div> : null}
                              {e?.brokerSwap != null ? <div>Swap: {Number(e.brokerSwap).toFixed(2)}</div> : null}
                              {e?.brokerFee != null ? <div>Fee: {Number(e.brokerFee).toFixed(2)}</div> : null}
                              {e?.positionClosedPnlEstimate != null ? (
                                <div>Est: {Number(e.positionClosedPnlEstimate).toFixed(2)}</div>
                              ) : null}
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : activeView === 'blotter' ? (
              <div className="p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={blotterQuery}
                    onChange={(e) => setBlotterQuery(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                    placeholder="Filter blotter by symbol (e.g. BTCUSD)"
                  />
                  <div className="flex-shrink-0 text-[10px] text-gray-500 font-mono">
                    {filteredBlotterEntries.length}
                  </div>
                </div>

                <div className="mb-3 flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                  <div>
                    {blotterUpdatedLabel ? `Updated ${blotterUpdatedLabel} ago` : 'Updated --'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBlotterAllAccounts((v) => !v)}
                      className={`px-2 py-1 rounded border text-[10px] font-semibold transition-colors ${
                        blotterAllAccounts
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-200 hover:bg-purple-500/15'
                          : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/10'
                      }`}
                      title={blotterAllAccounts ? 'Showing all accounts' : 'Filtered to current account'}
                    >
                      {blotterAllAccounts ? 'All accts' : 'This acct'}
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchBlotter(true)}
                      className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-gray-200 transition-colors"
                      disabled={blotterLoading}
                    >
                      {blotterLoading ? 'Loading.' : 'Reload'}
                    </button>
                  </div>
                </div>

                <div className="mb-3 text-[10px] text-gray-600">
                  Note: Blotter tracks trades submitted through this app (Glass trade ledger).
                </div>

                {tradeLedgerUnavailableMessage && (
                  <div className="mb-3 text-[11px] text-yellow-300/90 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2">
                    {tradeLedgerUnavailableMessage}
                  </div>
                )}

                {blotterError && (
                  <div className="mb-3 text-[11px] text-yellow-300/90 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2">
                    {blotterError}
                  </div>
                )}

                {filteredBlotterEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-600 opacity-60">
                    <TrendingDown size={32} className="mb-2" />
                    <span className="text-xs">{blotterLoading ? 'Loading trade blotter...' : 'No blotter trades found'}</span>
                    {activeAccount?.accountId != null && (
                      <span className="text-[10px] text-gray-600 mt-1 font-mono">
                        {blotterAllAccounts
                          ? 'Showing all accounts'
                          : `Filtered to account ${activeAccount.accountId}${activeAccount.accNum != null ? `/${activeAccount.accNum}` : ''}`}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {filteredBlotterEntries.map((e) => {
                      const symbol = String(e?.symbol || 'UNKNOWN');
                      const side = String(e?.action || e?.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
                      const status = String(e?.status || '--').toUpperCase();
                      const mode = e?.executionMode ? String(e.executionMode).toUpperCase() : '';
                      const qty =
                        Number.isFinite(Number(e?.qtyNormalized))
                          ? Number(e.qtyNormalized)
                          : Number.isFinite(Number(e?.brokerQty))
                            ? Number(e.brokerQty)
                            : Number.isFinite(Number(e?.qty))
                              ? Number(e.qty)
                              : null;
                      const entryPrice =
                        Number.isFinite(Number(e?.brokerEntryPrice)) && Number(e.brokerEntryPrice) > 0
                          ? Number(e.brokerEntryPrice)
                          : Number.isFinite(Number(e?.entryPrice)) && Number(e.entryPrice) > 0
                            ? Number(e.entryPrice)
                            : null;
                      const stopLoss =
                        Number.isFinite(Number(e?.brokerStopLoss)) && Number(e.brokerStopLoss) > 0
                          ? Number(e.brokerStopLoss)
                          : Number.isFinite(Number(e?.stopLoss)) && Number(e.stopLoss) > 0
                            ? Number(e.stopLoss)
                            : null;
                      const takeProfit =
                        Number.isFinite(Number(e?.brokerTakeProfit)) && Number(e.brokerTakeProfit) > 0
                          ? Number(e.brokerTakeProfit)
                          : Number.isFinite(Number(e?.takeProfit)) && Number(e.takeProfit) > 0
                            ? Number(e.takeProfit)
                            : null;
                      const updatedAt = Number(e?.updatedAtMs || e?.createdAtMs || 0);

                      return (
                        <div key={String(e?.id || `${symbol}-${updatedAt}`)} className="p-4 hover:bg-white/5 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {side}
                              </span>
                              <span className="font-bold text-sm">{symbol}</span>
                              {mode && (
                                <span className="text-[10px] text-gray-500 font-mono px-2 py-0.5 rounded bg-white/5">
                                  {mode}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">{status}</div>
                          </div>

                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-mono text-gray-400 mb-2">
                            <div className="flex justify-between">
                              <span>Qty:</span>
                              <span className="text-gray-300">{qty != null ? qty : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Entry:</span>
                              <span className="text-gray-300">{entryPrice != null ? formatPrice(entryPrice) : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>SL:</span>
                              <span className="text-red-500/70">{stopLoss != null ? formatPrice(stopLoss) : '--'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>TP:</span>
                              <span className="text-green-500/70">{takeProfit != null ? formatPrice(takeProfit) : '--'}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-white/5">
                            <div className="flex items-center gap-1 text-[10px] text-gray-600">
                              <Clock size={10} />
                              <span>{updatedAt ? formatTs(updatedAt) : '--'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {!isConnected && (
                  <div className="text-[11px] text-yellow-300/90 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span>Not connected. Use Settings to connect TradeLocker.</span>
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-gray-200 transition-colors"
                      >
                        Settings
                      </button>
                    )}
                  </div>
                )}

                {isConnected && !tradingEnabled && (
                  <div className="text-[11px] text-yellow-300/90 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span>Trading is disabled. Enable it in Settings to place orders.</span>
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-gray-200 transition-colors"
                      >
                        Settings
                      </button>
                    )}
                  </div>
                )}

                {ticketError && (
                  <div className="text-[11px] text-red-300/90 bg-red-900/20 border border-red-500/20 rounded-lg px-3 py-2">
                    {ticketError}
                  </div>
                )}
                {ticketFlash && (
                  <div className="text-[11px] text-green-300/90 bg-green-900/20 border border-green-500/20 rounded-lg px-3 py-2">
                    {ticketFlash}
                  </div>
                )}

                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest">Preset</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      value={selectedPresetId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setSelectedPresetId(next);
                        if (next) handleApplyPreset(next);
                      }}
                      className="flex-1 min-w-[180px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                    >
                      <option value="">Select preset</option>
                      {visiblePresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={presetLabel}
                      onChange={(e) => setPresetLabel(e.target.value)}
                      className="flex-1 min-w-[180px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      placeholder="Preset name (optional)"
                    />
                    <button
                      type="button"
                      onClick={handleSavePreset}
                      className="px-3 py-2 rounded-lg text-[11px] bg-white/10 border border-white/10 text-gray-200 hover:bg-white/20"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdatePreset}
                      disabled={!selectedPresetId}
                      className="px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 disabled:opacity-50"
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePreset}
                      disabled={!selectedPresetId}
                      className="px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Symbol</label>
                    <div className="mt-1 relative">
                      <input
                        type="text"
                        value={ticketSymbol}
                        onChange={(e) => runActionOr('tradelocker.ticket.set', { symbol: e.target.value }, () => setTicketSymbol(e.target.value))}
                        onFocus={() => setSymbolFocused(true)}
                        onBlur={() => setSymbolFocused(false)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                        placeholder="EURUSD"
                        autoComplete="off"
                      />

                      {(symbolFocused && (symbolSuggestLoading || symbolSuggestions.length > 0)) && (
                        <div className="absolute z-20 mt-1 w-full bg-black/90 border border-white/10 rounded-lg shadow-xl overflow-hidden">
                          <div className="max-h-56 overflow-y-auto custom-scrollbar py-1">
                            {symbolSuggestLoading && (
                              <div className="px-3 py-2 text-[10px] text-gray-400 font-mono">Searching...</div>
                            )}
                            {!symbolSuggestLoading && symbolSuggestions.map((s) => (
                              <button
                                key={`${s.tradableInstrumentId ?? 'na'}:${s.symbol}`}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  runActionOr('tradelocker.ticket.set', { symbol: s.symbol }, () => setTicketSymbol(s.symbol));
                                  setSymbolSuggestions([]);
                                  setSymbolFocused(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors flex items-center justify-between gap-3"
                              >
                                <span className="text-[11px] font-mono text-gray-100">{s.symbol}</span>
                                {s.displayName && s.displayName !== s.symbol && (
                                  <span className="text-[10px] text-gray-500 truncate">{s.displayName}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {ticketSymbol.trim() && (
                    <div className="col-span-2 text-[10px] text-gray-500 font-mono">
                      {(() => {
                        const quote = getQuoteForSymbol(ticketSymbol.trim());
                        if (!quote) return <span>Broker quote: --</span>;
                        const bid = quote.bid ?? null;
                        const ask = quote.ask ?? null;
                        const mid = quote.mid ?? null;
                        const ageLabel = formatAge(quote.fetchedAtMs ?? quote.timestampMs ?? null);
                        return (
                          <span>
                            Broker {bid != null ? formatPrice(bid) : '--'} / {ask != null ? formatPrice(ask) : '--'}
                            {mid != null ? ` (mid ${formatPrice(mid)})` : ''}
                            {ageLabel ? ` · ${ageLabel} ago` : ''}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  <div className="col-span-2 flex items-center gap-2">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest mr-2">Side</label>
                    <button
                      type="button"
                      onClick={() => runActionOr('tradelocker.ticket.set', { side: 'BUY' }, () => setTicketSide('BUY'))}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                        ticketSide === 'BUY' ? 'bg-green-500/20 text-green-200' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => runActionOr('tradelocker.ticket.set', { side: 'SELL' }, () => setTicketSide('SELL'))}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                        ticketSide === 'SELL' ? 'bg-red-500/20 text-red-200' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      SELL
                    </button>
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest mr-2">Type</label>
                    <button
                      type="button"
                      onClick={() => runActionOr('tradelocker.ticket.set', { type: 'market' }, () => setTicketType('market'))}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                        ticketType === 'market' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      Market
                    </button>
                    <button
                      type="button"
                      onClick={() => runActionOr('tradelocker.ticket.set', { type: 'limit' }, () => setTicketType('limit'))}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                        ticketType === 'limit' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      Limit
                    </button>
                    <button
                      type="button"
                      onClick={() => runActionOr('tradelocker.ticket.set', { type: 'stop' }, () => setTicketType('stop'))}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                        ticketType === 'stop' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      Stop
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Qty (lots)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ticketQty}
                      onChange={(e) => runActionOr('tradelocker.ticket.set', { qty: e.target.value }, () => setTicketQty(e.target.value))}
                      className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      placeholder={defaultOrderQty > 0 ? `Default: ${defaultOrderQty}` : 'e.g. 1'}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Entry Price</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={ticketPrice}
                      onChange={(e) => runActionOr('tradelocker.ticket.set', { price: e.target.value }, () => setTicketPrice(e.target.value))}
                      className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono disabled:opacity-50"
                      placeholder={ticketType === 'limit' ? 'Limit price' : ticketType === 'stop' ? 'Stop price' : '-'}
                      disabled={ticketType === 'market'}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Stop Loss</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={ticketStopLoss}
                      onChange={(e) => runActionOr('tradelocker.ticket.set', { stopLoss: e.target.value }, () => setTicketStopLoss(e.target.value))}
                      className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Take Profit</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={ticketTakeProfit}
                      onChange={(e) => runActionOr('tradelocker.ticket.set', { takeProfit: e.target.value }, () => setTicketTakeProfit(e.target.value))}
                      className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      placeholder="Optional"
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between text-[10px] text-gray-500 font-mono">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={applyPricePrecision}
                        disabled={ticketPrecision == null}
                        className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-50"
                      >
                        Round prices
                      </button>
                      <span>{ticketPrecisionLabel}</span>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Strategy ID</label>
                    <input
                      type="text"
                      value={ticketStrategyId}
                      onChange={(e) => runActionOr('tradelocker.ticket.set', { strategyId: e.target.value }, () => setTicketStrategyId(e.target.value))}
                      className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      placeholder="manual"
                    />
                    <p className="mt-1 text-[10px] text-gray-500">Tip: leave Qty blank to use your default size.</p>
                  </div>
                  {ticketEvidence && (
                    <div className="col-span-2 text-[10px] text-gray-400 bg-black/30 border border-white/10 rounded-lg px-3 py-2 space-y-1">
                      <div className="text-[9px] uppercase tracking-widest text-gray-500">Evidence</div>
                      {ticketEvidence.bias && <div>Bias: {ticketEvidence.bias}</div>}
                      {ticketEvidence.setup && <div>Setup: {ticketEvidence.setup}</div>}
                      {ticketEvidence.invalidation && <div>Invalidation: {ticketEvidence.invalidation}</div>}
                      {ticketEvidence.confidence?.score != null && (
                        <div>Confidence: {Math.round(Number(ticketEvidence.confidence.score) * 100)}%</div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSubmitTicket}
                  disabled={ticketSubmitting || !isConnected || !tradingEnabled || !onPlaceOrder}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/30 text-purple-100 text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send size={14} />
                  {ticketSubmitting ? 'Submitting…' : 'Submit Order'}
                </button>
              </div>
            )}
          </div>

          <div className="mt-4">
          </div>

          {addAccountOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="w-[380px] max-w-[92vw] bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                  <div className="flex items-center gap-2 text-gray-200">
                    <Lock size={16} />
                    <span className="font-semibold text-sm">Add TradeLocker Account</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddAccountOpen(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {savedProfiles.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider">Saved logins</label>
                      <select
                        value={savedProfileId}
                        onChange={(e) => handleSavedProfileSelect(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      >
                        <option value="">Select saved login…</option>
                        {savedProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.label}
                            {parseTradeLockerAccountId(profile.accountId) != null
                              ? ` • acct ${parseTradeLockerAccountId(profile.accountId)}${parseTradeLockerAccountId(profile.accNum) != null ? `/${parseTradeLockerAccountId(profile.accNum)}` : ''}`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddAccountEnv('demo')}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                        addAccountEnv === 'demo' ? 'bg-purple-600/80 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/15'
                      }`}
                    >
                      Demo
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddAccountEnv('live')}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                        addAccountEnv === 'live' ? 'bg-purple-600/80 text-white' : 'bg-white/10 text-gray-400 hover:bg-white/15'
                      }`}
                    >
                      Live
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">E-mail</label>
                    <input
                      type="text"
                      value={addAccountEmail}
                      onChange={(e) => setAddAccountEmail(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <input
                        type={addAccountShowPassword ? 'text' : 'password'}
                        value={addAccountPassword}
                        onChange={(e) => setAddAccountPassword(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setAddAccountShowPassword((v) => !v)}
                        className="absolute right-2 top-2 text-gray-500 hover:text-gray-200"
                        title={addAccountShowPassword ? 'Hide' : 'Show'}
                      >
                        {addAccountShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Server</label>
                    <input
                      type="text"
                      value={addAccountServer}
                      onChange={(e) => setAddAccountServer(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                      placeholder="demo.tradelocker.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider">Developer key (optional)</label>
                    <div className="relative">
                      <input
                        type={addAccountShowDeveloperKey ? 'text' : 'password'}
                        value={addAccountDeveloperKey}
                        onChange={(e) => setAddAccountDeveloperKey(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-gray-100 focus:outline-none focus:border-purple-500/50 transition-colors font-mono"
                        placeholder="tl-... (optional)"
                      />
                      <button
                        type="button"
                        onClick={() => setAddAccountShowDeveloperKey((v) => !v)}
                        className="absolute right-2 top-2 text-gray-500 hover:text-gray-200"
                        title={addAccountShowDeveloperKey ? 'Hide' : 'Show'}
                      >
                        {addAccountShowDeveloperKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
                    <label className="flex items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={addAccountRememberPassword}
                        onChange={(e) => setAddAccountRememberPassword(e.target.checked)}
                      />
                      Remember password (encrypted)
                    </label>
                    <label className="flex items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={addAccountRememberDeveloperKey}
                        onChange={(e) => setAddAccountRememberDeveloperKey(e.target.checked)}
                      />
                      Remember developer key
                    </label>
                  </div>

                  {addAccountError && (
                    <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
                      {addAccountError}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleAddAccountConnect}
                      disabled={addAccountSubmitting}
                      className="flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold bg-purple-600/80 hover:bg-purple-600 text-white transition-colors disabled:opacity-50"
                    >
                      {addAccountSubmitting ? 'Connecting…' : 'Log In'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddAccountOpen(false)}
                      className="px-3 py-2 rounded-lg text-[12px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        
        {/* Footer */}
        <div className="p-3 bg-white/5 text-[10px] text-gray-500 flex justify-between border-t border-white/5 font-mono">
            <span>Server: {serverLabel || 'DEMO'}</span>
            <span>Trade: {tradingEnabled ? 'ON' : 'OFF'}</span>
            <span><span className={`w-1.5 h-1.5 rounded-full ${connectionDotClass || 'bg-gray-600'} inline-block mr-1`}></span>{connectionLabel || 'DISCONNECTED'}</span>
        </div>
    </div>
  );
};

export default TradeLockerInterface;

