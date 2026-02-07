import React from 'react';
import { runStartupBootstrap, isPermissionDeniedResult, readResultError } from '../services/startupBootstrap';
import { getBridgeState, onBridgeStateChange } from '../services/bridgeGuard';

type StartupPhase = 'booting' | 'restoring' | 'settled';
type ReadinessState = 'ready' | 'assumed_ready' | 'missing' | 'unknown';

const SETTLE_WINDOW_MS = 8000;

type StartupStatus = {
  checkedAtMs: number | null;
  startupPhase: StartupPhase;
  bridgeState: 'ready' | 'failed' | null;
  bridgeError: string | null;
  bridgeMissingPaths: string[];
  probeSkippedDueToBridge: boolean;
  requestedScopes: string[];
  skippedScopes: string[];
  activeScopes: string[];
  blockedScopes: string[];
  unknownScopes: string[];
  permissionError: string | null;
  diagnosticWarning: string | null;
  openaiProbeSource: string | null;
  tradeLockerProbeSource: string | null;
  probeErrors: {
    secrets: string | null;
    broker: string | null;
    tradeLedger: string | null;
    tradelocker: string | null;
  };
};

type UseStartupReadinessParams = {
  tradeLockerSavedConfig: {
    server?: string | null;
    email?: string | null;
    accountId?: number | string | null;
  } | null;
  refreshTradeLockerSavedConfig?: (() => void | Promise<void>) | null;
  appendLiveError: (input: {
    source: string;
    level?: 'error' | 'warn' | 'info';
    message: string;
    detail?: Record<string, any> | null;
  }) => void;
};

const INITIAL_STATUS: StartupStatus = {
  checkedAtMs: null,
  startupPhase: 'booting',
  bridgeState: null,
  bridgeError: null,
  bridgeMissingPaths: [],
  probeSkippedDueToBridge: false,
  requestedScopes: [],
  skippedScopes: [],
  activeScopes: [],
  blockedScopes: [],
  unknownScopes: [],
  permissionError: null,
  diagnosticWarning: null,
  openaiProbeSource: null,
  tradeLockerProbeSource: null,
  probeErrors: {
    secrets: null,
    broker: null,
    tradeLedger: null,
    tradelocker: null
  }
};

const READY_STATES: ReadinessState[] = ['ready', 'assumed_ready'];

function normalizeReadinessState(value: any, fallback: ReadinessState): ReadinessState {
  const state = String(value || '').trim().toLowerCase();
  if (state === 'ready') return 'ready';
  if (state === 'assumed_ready') return 'assumed_ready';
  if (state === 'missing') return 'missing';
  if (state === 'unknown') return 'unknown';
  return fallback;
}

function isReadyState(state: ReadinessState): boolean {
  return READY_STATES.includes(state);
}

function hasTradeLockerConfigShape(value: {
  server?: string | null;
  email?: string | null;
  accountId?: number | string | null;
} | null | undefined): boolean {
  if (!value || typeof value !== 'object') return false;
  const server = String(value.server || '').trim();
  const email = String(value.email || '').trim();
  const accountId = value.accountId;
  return !!server && !!email && accountId != null && String(accountId).trim() !== '';
}

export function useStartupReadiness(params: UseStartupReadinessParams) {
  const { tradeLockerSavedConfig, refreshTradeLockerSavedConfig, appendLiveError } = params;
  const [startupPhase, setStartupPhase] = React.useState<StartupPhase>('booting');
  const [openaiKeyStored, setOpenaiKeyStored] = React.useState(false);
  const [openaiReadinessState, setOpenaiReadinessState] = React.useState<ReadinessState>('unknown');
  const [openaiPermissionBlockedReason, setOpenaiPermissionBlockedReason] = React.useState<string | null>(null);
  const [tradeLockerReadyProbe, setTradeLockerReadyProbe] = React.useState(false);
  const [tradeLockerReadinessState, setTradeLockerReadinessState] = React.useState<ReadinessState>('unknown');
  const [tradeLockerPermissionBlockedReason, setTradeLockerPermissionBlockedReason] = React.useState<string | null>(null);
  const [startupStatus, setStartupStatus] = React.useState<StartupStatus>(INITIAL_STATUS);
  const [retryDelayMs, setRetryDelayMs] = React.useState(5000);
  const startupPermissionAuditLoggedRef = React.useRef(false);
  const lastKnownOpenAiReadyRef = React.useRef(false);
  const lastKnownTradeLockerReadyRef = React.useRef(false);
  const startupBootStartedAtRef = React.useRef<number>(Date.now());
  const startupSettledRef = React.useRef(false);
  const bootSequenceStartedRef = React.useRef(false);
  const restoreTicketRef = React.useRef(0);
  const tradeLockerSavedConfigRef = React.useRef(tradeLockerSavedConfig);
  const bridgeRetryDelayRef = React.useRef(3000);
  const bridgeRetryAtRef = React.useRef(0);
  const bridgeLogAtRef = React.useRef(0);

  React.useEffect(() => {
    tradeLockerSavedConfigRef.current = tradeLockerSavedConfig;
  }, [tradeLockerSavedConfig]);

  React.useEffect(() => {
    setStartupStatus((prev) => {
      if (prev.startupPhase === startupPhase) return prev;
      return { ...prev, startupPhase };
    });
  }, [startupPhase]);

  const refreshOpenAiKeyStatus = React.useCallback(async () => {
    let hasKey = false;
    let readinessState: ReadinessState = startupSettledRef.current ? 'missing' : 'unknown';
    let blockedReason: string | null = null;
    try {
      const secrets = (window as any)?.glass?.secrets;
      if (secrets?.getStatus) {
        const res = await secrets.getStatus();
        if (isPermissionDeniedResult(res)) {
          blockedReason = readResultError(res) || 'Permission denied (secrets).';
          readinessState = 'unknown';
        } else if (res?.ok && res?.openai?.hasKey) {
          hasKey = true;
          readinessState = 'ready';
          lastKnownOpenAiReadyRef.current = true;
        } else if (res?.ok) {
          readinessState = startupSettledRef.current ? 'missing' : 'unknown';
        } else {
          readinessState = 'unknown';
        }
      }
    } catch {
      readinessState = 'unknown';
    }

    if (!hasKey) {
      try {
        const local = localStorage.getItem('glass_openai_api_key');
        if (local && local.trim()) {
          hasKey = true;
          readinessState = 'assumed_ready';
        }
      } catch {
        // ignore
      }
    }

    if (!hasKey && lastKnownOpenAiReadyRef.current) {
      hasKey = true;
      readinessState = 'assumed_ready';
    }

    setOpenaiKeyStored(hasKey);
    setOpenaiReadinessState(readinessState);
    setOpenaiPermissionBlockedReason(blockedReason);
    return { hasKey, blockedReason, readinessState };
  }, []);

  const bootstrapPermissionsAndReadiness = React.useCallback(async (source = 'app_boot') => {
    const bridge = getBridgeState();
    const now = Date.now();
    if (!bridge.ready && bridgeRetryAtRef.current > now) {
      setStartupStatus((prev) => ({
        ...prev,
        checkedAtMs: now,
        startupPhase,
        bridgeState: 'failed',
        bridgeError: bridge.reason || 'Renderer bridge unavailable.',
        bridgeMissingPaths: Array.isArray(bridge.missingPaths) ? bridge.missingPaths.slice() : [],
        probeSkippedDueToBridge: true,
        diagnosticWarning: bridge.reason || 'Renderer bridge unavailable.'
      }));
      return {
        activeScopes: [] as string[],
        blockedScopes: [] as string[],
        unknownScopes: [] as string[],
        bridgeState: 'failed' as const,
        bridgeError: bridge.reason || 'Renderer bridge unavailable.',
        bridgeMissingPaths: Array.isArray(bridge.missingPaths) ? bridge.missingPaths.slice() : [],
        probeSkippedDueToBridge: true,
        probeErrors: {
          secrets: bridge.reason || 'Renderer bridge unavailable.',
          broker: bridge.reason || 'Renderer bridge unavailable.',
          tradeLedger: bridge.reason || 'Renderer bridge unavailable.',
          tradelocker: bridge.reason || 'Renderer bridge unavailable.'
        },
        openaiProbeSource: 'bridge_failed',
        tradeLockerProbeSource: 'bridge_failed'
      };
    }

    const result = await runStartupBootstrap((window as any)?.glass, {
      source,
      readLocalOpenAiKey: () => {
        try {
          const raw = localStorage.getItem('glass_openai_api_key');
          if (!raw || !raw.trim()) return null;
          return raw;
        } catch {
          return null;
        }
      },
      lastKnownOpenAiReady: lastKnownOpenAiReadyRef.current,
      lastKnownTradeLockerReady: lastKnownTradeLockerReadyRef.current,
      tradeLockerSavedConfig: tradeLockerSavedConfigRef.current
    });

    const openaiStateRaw = normalizeReadinessState(result.openaiReadinessState, result.openaiReady ? 'ready' : 'missing');
    const tradeLockerStateRaw = normalizeReadinessState(result.tradeLockerReadinessState, result.tradeLockerReady ? 'ready' : 'missing');
    const shouldSuppressMissing = !startupSettledRef.current;
    const openaiState: ReadinessState = shouldSuppressMissing && !result.openaiBlocked && openaiStateRaw === 'missing' ? 'unknown' : openaiStateRaw;
    const tradeLockerState: ReadinessState =
      shouldSuppressMissing && !result.tradeLockerBlocked && tradeLockerStateRaw === 'missing' ? 'unknown' : tradeLockerStateRaw;

    setStartupStatus({
      checkedAtMs: Date.now(),
      startupPhase,
      bridgeState: result.bridgeState === 'failed' ? 'failed' : 'ready',
      bridgeError: result.bridgeError || null,
      bridgeMissingPaths: Array.isArray(result.bridgeMissingPaths) ? result.bridgeMissingPaths.slice() : [],
      probeSkippedDueToBridge: result.probeSkippedDueToBridge === true,
      requestedScopes: Array.isArray(result.requestedScopes) ? result.requestedScopes.slice() : [],
      skippedScopes: Array.isArray(result.skippedScopes) ? result.skippedScopes.slice() : [],
      activeScopes: Array.isArray(result.activeScopes) ? result.activeScopes.slice() : [],
      blockedScopes: Array.isArray(result.blockedScopes) ? result.blockedScopes.slice() : [],
      unknownScopes: Array.isArray(result.unknownScopes) ? result.unknownScopes.slice() : [],
      permissionError: result.permissionError || null,
      diagnosticWarning: result.diagnosticWarning || null,
      openaiProbeSource: result.openaiProbeSource || result.openaiFallbackSource || null,
      tradeLockerProbeSource: result.tradeLockerProbeSource || result.tradeLockerFallbackSource || null,
      probeErrors: {
        secrets: result?.probeErrors?.secrets || null,
        broker: result?.probeErrors?.broker || null,
        tradeLedger: result?.probeErrors?.tradeLedger || null,
        tradelocker: result?.probeErrors?.tradelocker || null
      }
    });

    setOpenaiPermissionBlockedReason(result.openaiBlockedReason);
    setOpenaiKeyStored(result.openaiReady);
    setOpenaiReadinessState(openaiState);
    setTradeLockerPermissionBlockedReason(result.tradeLockerBlockedReason);
    setTradeLockerReadyProbe(result.tradeLockerProbeReady);
    setTradeLockerReadinessState(tradeLockerState);

    if (result.bridgeState === 'failed') {
      const nextDelay = Math.min(Math.max(bridgeRetryDelayRef.current, 3000) * 2, 30000);
      bridgeRetryDelayRef.current = nextDelay;
      bridgeRetryAtRef.current = Date.now() + bridgeRetryDelayRef.current;
    } else {
      bridgeRetryDelayRef.current = 3000;
      bridgeRetryAtRef.current = 0;
    }

    if (isReadyState(openaiState)) {
      lastKnownOpenAiReadyRef.current = true;
    }
    if (isReadyState(tradeLockerState)) {
      lastKnownTradeLockerReadyRef.current = true;
    }

    if (result.permissionError && !startupPermissionAuditLoggedRef.current) {
      appendLiveError({
        source: 'startup.permissions',
        level: 'error',
        message: result.permissionError
      });
    }

    if (result.bridgeState === 'failed') {
      const nowMs = Date.now();
      if (nowMs - bridgeLogAtRef.current > 15000) {
        bridgeLogAtRef.current = nowMs;
        appendLiveError({
          source: 'startup.bridge',
          level: 'error',
          message: result.bridgeError || 'Renderer bridge unavailable.',
          detail: {
            source,
            missingPaths: Array.isArray(result.bridgeMissingPaths) ? result.bridgeMissingPaths : []
          }
        });
      }
    }

    if (!startupPermissionAuditLoggedRef.current) {
      if (result.diagnosticWarning) {
        appendLiveError({
          source: 'startup.permissions',
          level: 'warn',
          message: result.diagnosticWarning,
          detail: {
            source,
            requestedScopes: result.requestedScopes,
            skippedScopes: result.skippedScopes,
            activeScopes: result.activeScopes,
            blockedScopes: result.blockedScopes,
            unknownScopes: result.unknownScopes,
          probeErrors: result?.probeErrors || null,
          bridgeState: result.bridgeState || null,
          bridgeError: result.bridgeError || null,
          bridgeMissingPaths: result.bridgeMissingPaths || null,
          probeSkippedDueToBridge: result.probeSkippedDueToBridge === true,
          openaiProbeSource: result.openaiProbeSource || result.openaiFallbackSource || null,
          tradeLockerProbeSource: result.tradeLockerProbeSource || result.tradeLockerFallbackSource || null
        }
        });
      }
      try {
        console.warn('[startup_permissions]', {
          source,
          requestedScopes: result.requestedScopes,
          skippedScopes: result.skippedScopes,
          activeScopes: result.activeScopes,
          blockedScopes: result.blockedScopes,
          unknownScopes: result.unknownScopes,
          probeErrors: result?.probeErrors || null,
          bridgeState: result.bridgeState || null,
          bridgeError: result.bridgeError || null,
          bridgeMissingPaths: result.bridgeMissingPaths || null,
          probeSkippedDueToBridge: result.probeSkippedDueToBridge === true,
          openaiProbeSource: result.openaiProbeSource || result.openaiFallbackSource || null,
          tradeLockerProbeSource: result.tradeLockerProbeSource || result.tradeLockerFallbackSource || null
        });
      } catch {
        // ignore console failures
      }
      startupPermissionAuditLoggedRef.current = true;
    }

    return {
      activeScopes: result.activeScopes,
      blockedScopes: result.blockedScopes,
      unknownScopes: result.unknownScopes,
      bridgeState: result.bridgeState || null,
      bridgeError: result.bridgeError || null,
      bridgeMissingPaths: result.bridgeMissingPaths || null,
      probeSkippedDueToBridge: result.probeSkippedDueToBridge === true,
      probeErrors: result?.probeErrors || null,
      openaiProbeSource: result.openaiProbeSource || result.openaiFallbackSource || null,
      tradeLockerProbeSource: result.tradeLockerProbeSource || result.tradeLockerFallbackSource || null
    };
  }, [appendLiveError, startupPhase]);

  const tradeLockerPersistedReady = hasTradeLockerConfigShape(tradeLockerSavedConfig);
  const tradeLockerReady = isReadyState(tradeLockerReadinessState) || tradeLockerPersistedReady;
  const openaiReady = isReadyState(openaiReadinessState) || openaiKeyStored;

  const onboardingOpen = startupPhase === 'settled' && (
    !!openaiPermissionBlockedReason ||
    !!tradeLockerPermissionBlockedReason ||
    openaiReadinessState === 'missing' ||
    (!tradeLockerPersistedReady && tradeLockerReadinessState === 'missing')
  );

  const refreshOnboardingStatus = React.useCallback(() => {
    void refreshTradeLockerSavedConfig?.();
    void bootstrapPermissionsAndReadiness('onboarding_recheck');
  }, [bootstrapPermissionsAndReadiness, refreshTradeLockerSavedConfig]);

  React.useEffect(() => {
    if (bootSequenceStartedRef.current) return;
    bootSequenceStartedRef.current = true;
    let cancelled = false;

    const runBoot = async () => {
      const ticket = restoreTicketRef.current + 1;
      restoreTicketRef.current = ticket;
      startupBootStartedAtRef.current = Date.now();
      startupSettledRef.current = false;
      setStartupPhase('booting');

      await bootstrapPermissionsAndReadiness('app_boot');
      if (cancelled || restoreTicketRef.current !== ticket) return;

      setStartupPhase('restoring');
      if (typeof refreshTradeLockerSavedConfig === 'function') {
        try {
          await Promise.resolve(refreshTradeLockerSavedConfig());
        } catch {
          // ignore restore refresh failures
        }
      }

      if (cancelled || restoreTicketRef.current !== ticket) return;
      await bootstrapPermissionsAndReadiness('app_boot_restore');
      if (cancelled || restoreTicketRef.current !== ticket) return;

      startupSettledRef.current = true;
      setStartupPhase('settled');
      await bootstrapPermissionsAndReadiness('app_boot_settled');
    };

    void runBoot();

    return () => {
      cancelled = true;
    };
  }, [bootstrapPermissionsAndReadiness, refreshTradeLockerSavedConfig]);

  React.useEffect(() => {
    if (startupPhase === 'settled') return;
    const elapsedMs = Date.now() - startupBootStartedAtRef.current;
    const remainingMs = Math.max(250, SETTLE_WINDOW_MS - elapsedMs);
    const id = window.setTimeout(() => {
      if (startupSettledRef.current) return;
      startupSettledRef.current = true;
      setStartupPhase('settled');
      void bootstrapPermissionsAndReadiness('startup_settle_timeout');
    }, remainingMs);
    return () => window.clearTimeout(id);
  }, [bootstrapPermissionsAndReadiness, startupPhase]);

  React.useEffect(() => {
    if (startupPhase !== 'settled' || !onboardingOpen) {
      setRetryDelayMs(5000);
      return;
    }
    const id = window.setTimeout(() => {
      void bootstrapPermissionsAndReadiness('startup_retry');
      setRetryDelayMs((prev) => Math.min(Math.max(prev, 5000) * 2, 30000));
    }, retryDelayMs);
    return () => window.clearTimeout(id);
  }, [bootstrapPermissionsAndReadiness, onboardingOpen, retryDelayMs, startupPhase]);

  React.useEffect(() => {
    const unsubscribe = onBridgeStateChange((state) => {
      if (state?.ready) {
        bridgeRetryDelayRef.current = 3000;
        bridgeRetryAtRef.current = 0;
      }
      void bootstrapPermissionsAndReadiness(state?.ready ? 'bridge_recovered' : 'bridge_changed');
    });
    return () => {
      try {
        unsubscribe?.();
      } catch {
        // ignore unsubscribe failures
      }
    };
  }, [bootstrapPermissionsAndReadiness]);

  return {
    startupPhase,
    startupBridgeState: startupStatus.bridgeState,
    startupBridgeError: startupStatus.bridgeError,
    startupBridgeReady: startupStatus.bridgeState === 'ready',
    openaiKeyStored,
    openaiReadinessState,
    openaiPermissionBlockedReason,
    tradeLockerPermissionBlockedReason,
    tradeLockerReadyProbe,
    tradeLockerReadinessState,
    tradeLockerReady,
    onboardingOpen,
    startupStatus,
    refreshOpenAiKeyStatus,
    refreshOnboardingStatus,
    bootstrapPermissionsAndReadiness
  };
}
