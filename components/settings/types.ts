import type React from 'react';

export type CatalogActionResult = {
  ok: boolean;
  error?: string;
  data?: unknown;
};

export type CatalogActionRunner = (input: {
  actionId: string;
  payload?: Record<string, unknown>;
}) => Promise<CatalogActionResult>;

export interface AiKeysSectionCtx {
  showOpenai: boolean;
  setShowOpenai: React.Dispatch<React.SetStateAction<boolean>>;
  openaiKey: string;
  setOpenaiKey: React.Dispatch<React.SetStateAction<string>>;
  openaiKeyStored: boolean;
  secretsAvailable: boolean;
  readClipboardText: () => Promise<string | null>;
  onRunActionCatalog?: CatalogActionRunner;
  refreshSecretsStatus: () => Promise<void>;
  showGemini: boolean;
  setShowGemini: React.Dispatch<React.SetStateAction<boolean>>;
  geminiKey: string;
  setGeminiKey: React.Dispatch<React.SetStateAction<string>>;
  geminiKeyStored: boolean;
  textModelSelectValue: string;
  setTextModel: (value: string) => void;
  textModelIsPreset: boolean;
  textModel: string;
  visionModelSelectValue: string;
  setVisionModel: (value: string) => void;
  visionModelIsPreset: boolean;
  visionModel: string;
  visionDetail: string;
  setVisionDetail: (value: 'auto' | 'low' | 'high') => void;
  liveModelSelectValue: string;
  setLiveModel: (value: string) => void;
  liveModelIsPreset: boolean;
  liveModel: string;
  vectorStoreIds: string;
  setVectorStoreIds: (value: string) => void;
  techReasoningEffort: string;
  setTechReasoningEffort: (value: string) => void;
  activeVisionIntervalMs: string;
  setActiveVisionIntervalMs: (value: string) => void;
  watchedVisionIntervalMs: string;
  setWatchedVisionIntervalMs: (value: string) => void;
  chartWatchIntervalMs: string;
  setChartWatchIntervalMs: (value: string) => void;
  autoWatchTradingView: boolean;
  setAutoWatchTradingView: React.Dispatch<React.SetStateAction<boolean>>;
  chatTabContextMode: string;
  setChatTabContextMode: (value: string) => void;
  chatTabContextMaxTabs: string;
  setChatTabContextMaxTabs: (value: string) => void;
  chatTabContextRoi: string;
  setChatTabContextRoi: (value: string) => void;
  chatTabContextRedaction: string;
  setChatTabContextRedaction: (value: string) => void;
  chatTabContextChangeOnly: boolean;
  setChatTabContextChangeOnly: React.Dispatch<React.SetStateAction<boolean>>;
  OPENAI_TEXT_MODEL_PRESETS: Array<{ value: string; label: string }>;
  OPENAI_VISION_MODEL_PRESETS: Array<{ value: string; label: string }>;
  OPENAI_VISION_DETAIL_PRESETS: Array<{ value: string; label: string }>;
  OPENAI_LIVE_MODEL_PRESETS: Array<{ value: string; label: string }>;
  OPENAI_TECH_REASONING_PRESETS: Array<{ value: string; label: string }>;
}

export interface SignalWarmupSectionCtx {
  onSignalTelegramChange?: (patch: Record<string, unknown>) => void;
  signalTelegramResolved: {
    enabled: boolean;
    botToken: string;
    chatId: string;
    sendOn: string[];
    alertsEnabled: boolean;
    alertTrades: boolean;
    alertTpSl: boolean;
    alertDrawdown: boolean;
    alertAgentConfidence: boolean;
    alertConfidenceDrop?: number;
    alertDrawdownPct?: number;
    commandsEnabled: boolean;
    commandMode: 'read' | 'manage';
    commandPassphrase?: string;
    allowChart: boolean;
    allowStatus: boolean;
    allowManage: boolean;
    inlineActionsEnabled: boolean;
    confirmationsEnabled: boolean;
    confirmationTimeoutSec?: number;
    digestDailyEnabled: boolean;
    digestWeeklyEnabled: boolean;
    digestHourLocal?: number;
    digestWeeklyDay?: number;
  };
  signalTelegramMissing: boolean;
  handleSignalTelegramPaste: (field: 'botToken' | 'chatId') => Promise<void>;
  signalTelegramStatuses: string[];
  toggleList: (source: string[], value: string) => string[];
  parseNumberInput: (value: string) => number | null;
  DEFAULT_SIGNAL_TELEGRAM_SETTINGS: {
    alertConfidenceDrop: number;
    alertDrawdownPct: number;
    confirmationTimeoutSec: number;
    digestHourLocal: number;
    digestWeeklyDay: number;
  };
  onSignalSnapshotWarmupChange?: (patch: Record<string, unknown>) => void;
  signalSnapshotWarmupResolved: {
    barsDefault?: number;
    bars1d?: number;
    bars1w?: number;
  };
  signalSnapshotWarmupTimeoutSec?: number;
  DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS: {
    barsDefault: number;
    bars1d: number;
    bars1w: number;
    timeoutMs: number;
  };
  secretsError?: string | null;
}

export interface PerformanceDebugSectionCtx {
  performance: {
    keepWatchedTabsMounted?: boolean;
    keepWatchedTabsMountedRequested?: boolean;
    isLive?: boolean;
    liveMode?: string | null;
    chartWatchEnabled?: boolean;
    chatOpen?: boolean;
    sidebarMode?: string | null;
    watchedTabs?: { total?: number; manual?: number; auto?: number };
    chartSessions?: { total?: number; watchEnabled?: number; assignedViews?: number };
  };
  refreshLedgerStats: () => Promise<void>;
  flushLedgerNow: () => Promise<void>;
  ledgerStatsError?: string | null;
  ledgerPending: number;
  ledgerInFlight: boolean;
  ledgerLastPersistAtMs: number;
  ledgerLastDirtyAtMs: number;
  ledgerPersistDelayMs?: number | null;
  ledgerStats?: { lastError?: string | null } | null;
  ledgerPath?: string | null;
  formatAgo: (value: number) => string;
  writeClipboardText: (text: string) => Promise<void>;
  actionFlowDebugEnabled: boolean;
  setActionFlowDebugEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface BrokerAdapterSectionCtx {
  brokerStatusMeta: { dot: string; label: string };
  brokerError?: string | null;
  brokerActiveId: string;
  activeBroker?: { id?: string; kind?: string } | null;
  brokerList: Array<{ id: string; label?: string }>;
  handleBrokerSelect: (id: string) => void;
  brokerCaps: string[];
  refreshBrokerInfo: () => Promise<void>;
  brokerStatus?: { lastError?: string | null } | null;
  parseNumberInput: (value: string) => number | null;
  tlStatusMeta: { dot: string; label: string };
  electronBridgeAvailable: boolean;
  tlBridgeAvailable: boolean;
  tlEncryptionAvailable: boolean;
  tlLastError?: string | null;
  tlActiveProfileId: string;
  handleTradeLockerProfileSelect: (id: string) => void;
  tlProfiles: Array<{ id: string; label: string; accountId?: number | null; accNum?: number | null }>;
  upsertTradeLockerProfile: (opts?: { setActive?: boolean }) => boolean | Promise<void>;
  handleTradeLockerProfileRemove: (id: string) => void | Promise<void>;
  tlEnv: 'demo' | 'live';
  setTlEnv: React.Dispatch<React.SetStateAction<'demo' | 'live'>>;
  tlServer: string;
  setTlServer: React.Dispatch<React.SetStateAction<string>>;
  tlEmail: string;
  setTlEmail: React.Dispatch<React.SetStateAction<string>>;
  tlHasSavedPassword: boolean;
  tlShowPassword: boolean;
  setTlShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  tlPassword: string;
  setTlPassword: React.Dispatch<React.SetStateAction<string>>;
  tlHasSavedDeveloperKey: boolean;
  tlShowDeveloperKey: boolean;
  setTlShowDeveloperKey: React.Dispatch<React.SetStateAction<boolean>>;
  tlDeveloperKey: string;
  setTlDeveloperKey: React.Dispatch<React.SetStateAction<string>>;
  tlRememberPassword: boolean;
  setTlRememberPassword: React.Dispatch<React.SetStateAction<boolean>>;
  tlRememberDeveloperKey: boolean;
  setTlRememberDeveloperKey: React.Dispatch<React.SetStateAction<boolean>>;
  tlAutoConnect: boolean;
  setTlAutoConnect: React.Dispatch<React.SetStateAction<boolean>>;
  tlConnected: boolean;
  tlConnecting: boolean;
  handleTradeLockerConnect: () => Promise<void>;
  handleTradeLockerDisconnect: () => Promise<void>;
  handleTradeLockerRefreshAccounts: () => Promise<void>;
  handleTradeLockerClearSecrets: () => Promise<void>;
  tlSelectedAccountId: string;
  handleTradeLockerAccountSelected: (id: string) => void;
  tlAccounts: Array<{ id?: string | number; name?: string; currency?: string }>;
  tlSelectedAccNum?: string | null;
  tlDefaultOrderQty: string;
  setTlDefaultOrderQty: React.Dispatch<React.SetStateAction<string>>;
  tlDefaultOrderType: 'market' | 'limit' | 'stop';
  setTlDefaultOrderType: React.Dispatch<React.SetStateAction<'market' | 'limit' | 'stop'>>;
  tlTradingEnabled: boolean;
  handleTradingToggle: (enabled: boolean) => Promise<void>;
  tlAutoPilotEnabled: boolean;
  handleAutoPilotToggle: (enabled: boolean) => Promise<void>;
  tlStreamingEnabled: boolean;
  setTlStreamingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  tlStreamingUrl: string;
  setTlStreamingUrl: React.Dispatch<React.SetStateAction<string>>;
  tlStreamingAutoReconnect: boolean;
  setTlStreamingAutoReconnect: React.Dispatch<React.SetStateAction<boolean>>;
  tlStreamingSubscribe: string;
  setTlStreamingSubscribe: React.Dispatch<React.SetStateAction<string>>;
  tlDebugEnabled: boolean;
  setTlDebugEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  tlDebugMaxBytesMb: string;
  setTlDebugMaxBytesMb: React.Dispatch<React.SetStateAction<string>>;
  tlDebugMaxFiles: string;
  setTlDebugMaxFiles: React.Dispatch<React.SetStateAction<string>>;
  tlDebugTextLimit: string;
  setTlDebugTextLimit: React.Dispatch<React.SetStateAction<string>>;
  brokerLinkDraft: Record<string, unknown>;
  setBrokerLinkDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  brokerLinkSymbolMapText: string;
  setBrokerLinkSymbolMapText: React.Dispatch<React.SetStateAction<string>>;
}

export interface TelemetrySectionCtx {
  setShowLiveErrorLog: React.Dispatch<React.SetStateAction<boolean>>;
  liveErrors: unknown[];
  setShowDiagnosticsConsole: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTechAgentConsole: React.Dispatch<React.SetStateAction<boolean>>;
  healthSnapshot?: {
    startupPhase?: 'booting' | 'restoring' | 'settled' | null;
    startupOpenaiState?: 'ready' | 'assumed_ready' | 'missing' | 'unknown' | null;
    startupTradeLockerState?: 'ready' | 'assumed_ready' | 'missing' | 'unknown' | null;
    startupOpenaiProbeSource?: string | null;
    startupTradeLockerProbeSource?: string | null;
    startupBridgeState?: 'ready' | 'failed' | null;
    startupBridgeError?: string | null;
    startupProbeSkippedDueToBridge?: boolean | null;
    startupProbeErrors?: {
      secrets?: string | null;
      broker?: string | null;
      tradeLedger?: string | null;
      tradelocker?: string | null;
    } | null;
    startupTradeLockerAutoRestoreAttempted?: boolean | null;
    startupTradeLockerAutoRestoreSuccess?: boolean | null;
    startupTradeLockerAutoRestoreError?: string | null;
    startupTradeLockerAutoRestoreAtMs?: number | null;
    brokerStatus?: string;
    brokerStreamStatus?: string;
    tradelockerRateLimitTelemetry?: {
      mode: 'normal' | 'guarded' | 'cooldown';
      modeChangedAtMs: number;
      policy?: 'safe' | 'balanced' | 'aggressive';
      pressure?: number;
      policyThresholds?: {
        guardedThreshold: number;
        cooldownThreshold: number;
        guardedPressure: number;
        cooldownPressure: number;
        recoveryStreak: number;
        maxIntervalMs: number;
      } | null;
      windowMs: number;
      windowStartedAtMs: number;
      windowRequests: number;
      window429: number;
      windowBlocked: number;
      totalRequests: number;
      total429: number;
      totalBlocked: number;
      totalErrors: number;
      totalSuccess: number;
      consecutive429: number;
      consecutiveSuccess: number;
      adaptiveMinIntervalMs: number;
      baseMinIntervalMs: number;
      adaptiveRequestConcurrency: number;
      baseRequestConcurrency: number;
      last429AtMs?: number | null;
      lastSuccessAtMs?: number | null;
      lastBlockedAtMs?: number | null;
      lastRouteKey?: string | null;
      lastAccountKey?: string | null;
      topRoutes?: Array<{
        routeKey: string;
        method?: string | null;
        path?: string | null;
        windowRequests: number;
        window429: number;
        windowBlocked: number;
        totalRequests: number;
        total429: number;
        totalBlocked: number;
        lastStatus?: number | null;
        lastError?: string | null;
        lastRequestAtMs?: number | null;
        last429AtMs?: number | null;
        lastBlockedAtMs?: number | null;
        blockedUntilMs?: number | null;
        retryAfterMs?: number | null;
        avgLatencyMs?: number | null;
      }> | null;
      topAccounts?: Array<{
        accountKey: string;
        env?: 'demo' | 'live' | null;
        server?: string | null;
        accountId?: number | null;
        accNum?: number | null;
        label?: string | null;
        windowRequests: number;
        window429: number;
        windowBlocked: number;
        totalRequests: number;
        total429: number;
        totalBlocked: number;
        lastStatus?: number | null;
        lastError?: string | null;
        lastRequestAtMs?: number | null;
        last429AtMs?: number | null;
        lastBlockedAtMs?: number | null;
        blockedUntilMs?: number | null;
        retryAfterMs?: number | null;
      }> | null;
    } | null;
    startupCheckedAtMs?: number;
    perf?: {
      brokerCoordinatorRequests?: number | null;
      brokerCoordinatorExecutions?: number | null;
      brokerCoordinatorCacheHits?: number | null;
      brokerCoordinatorDedupeHits?: number | null;
      brokerCoordinatorCacheHitRate?: number | null;
      brokerCoordinatorDedupeRate?: number | null;
      patternWatchSyncCoalesced?: number | null;
    } | null;
    scheduler?: {
      visible?: boolean | null;
      taskCount?: number | null;
      signalTaskId?: string | null;
      signalTask?: {
        id: string;
        groupId: string;
        runCount?: number | null;
        errorCount?: number | null;
        lastRunAtMs?: number | null;
        lastDurationMs?: number | null;
        paused?: boolean | null;
        consecutiveFailures?: number | null;
      } | null;
      shadowTaskId?: string | null;
      shadowTask?: {
        id: string;
        groupId: string;
        runCount?: number | null;
        errorCount?: number | null;
        lastRunAtMs?: number | null;
        lastDurationMs?: number | null;
        paused?: boolean | null;
        consecutiveFailures?: number | null;
      } | null;
    } | null;
    cacheBudgets?: Array<{
      name: string;
      size: number;
      maxEntries: number;
      evictions: number;
      ttlEvictions: number;
      hitRate: number;
    }> | null;
    workerFallback?: {
      updatedAtMs?: number | null;
      byDomain?: Record<string, {
        total?: number | null;
        fallbackUsed?: number | null;
        byReason?: Record<string, number> | null;
      }> | null;
    } | null;
    refreshSlaByChannel?: Array<{
      channel: 'signal' | 'snapshot' | 'backtest';
      taskId?: string | null;
      expectedIntervalMs: number;
      lastRunAt?: number | null;
      lastSuccessAt?: number | null;
      delayMs: number;
      state: 'idle' | 'on_time' | 'delayed' | 'missed';
      nextDueAt?: number | null;
    }> | null;
    bridgeDomainReadiness?: Record<string, {
      ready: boolean;
      missingPaths?: string[] | null;
      reason?: string | null;
    }> | null;
    brokerCircuitBySource?: Array<{
      source: string;
      state: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
      failureCount: number;
      openedAt?: number | null;
      retryAfterMs?: number | null;
      lastError?: string | null;
    }> | null;
    lastSuccessfulScanAtMs?: number | null;
    rankFreshness?: {
      degraded: boolean;
      stale: boolean;
      updatedAtMs?: number | null;
      reason?: string | null;
    } | null;
    agentDrift?: {
      updatedAtMs?: number | null;
      reports?: Array<{
        agentId: string;
        segment: string;
        severity: 'ok' | 'warn' | 'poor';
        triggeredAt: number;
      }> | null;
    } | null;
    executionAudit?: {
      updatedAtMs?: number | null;
      recordsCount?: number | null;
      mismatches?: Array<{
        dedupeKey: string;
        signalId?: string | null;
        reasons: string[];
      }> | null;
    } | null;
    livePolicy?: {
      activeChampionId?: string | null;
      previousChampionId?: string | null;
      demotedAtMs?: number | null;
      demotionReason?: string | null;
      updatedAtMs: number;
    } | null;
    panelConnectivity?: Array<{
      source: string;
      panel?: string | null;
      ready: boolean;
      latencyMs: number | null;
      error?: string | null;
      updatedAt: number;
      failureCount?: number;
      blocked?: boolean | null;
      retryAfterMs?: number | null;
      blockedReason?: string | null;
      blockedUntilMs?: number | null;
    }> | null;
    panelFreshness?: Array<{
      panel: string;
      state: 'fresh' | 'stale' | 'degraded' | 'unknown';
      lastSyncAt?: number | null;
      reason?: string | null;
    }> | null;
    outcomeFeed?: {
      cursor?: {
        version: number;
        total: number;
        lastResolvedAtMs?: number | null;
        checksum: string;
        generatedAtMs: number;
      } | null;
      consistency?: {
        degraded: boolean;
        stale: boolean;
        desyncedPanels: string[];
        reason?: string | null;
        updatedAtMs: number;
      } | null;
    } | null;
    crossPanelContext?: {
      symbol?: string | null;
      timeframe?: string | null;
      session?: string | null;
      agentId?: string | null;
      strategyId?: string | null;
      originPanel?: string | null;
      updatedAtMs?: number | null;
    } | null;
    persistenceHealth?: {
      overallOk?: boolean | null;
      updatedAtMs?: number | null;
      domains?: Record<string, {
        ok?: boolean | null;
        failures?: number | null;
        writesQueued?: number | null;
      }> | null;
    } | null;
  } | null;
}

export interface AiKeysSectionProps {
  ctx: AiKeysSectionCtx;
}

export interface SignalWarmupSectionProps {
  ctx: SignalWarmupSectionCtx;
}

export interface PerformanceDebugSectionProps {
  ctx: PerformanceDebugSectionCtx;
}

export interface BrokerAdapterSectionProps {
  ctx: BrokerAdapterSectionCtx;
}

export interface TelemetrySectionProps {
  ctx: TelemetrySectionCtx;
}
