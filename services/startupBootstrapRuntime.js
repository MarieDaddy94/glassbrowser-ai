export const APP_BOOT_PERMISSION_SCOPES = Object.freeze([
  'bridge',
  'clipboard',
  'capture',
  'file',
  'mt5',
  'window',
  'news',
  'calendar',
  'telegram',
  'broker',
  'tradelocker',
  'tradeLedger',
  'codebase',
  'agentRunner',
  'secrets',
  'diagnostics',
  'openai',
  'gemini',
  'live'
]);

const BRIDGE_REQUIRED_PATHS = [
  ['secrets', 'getStatus'],
  ['broker', 'getActive'],
  ['tradeLedger', 'stats'],
  ['tradelocker', 'getSavedConfig']
];

export const isPermissionDeniedResult = (value) => {
  if (!value || typeof value !== 'object') return false;
  const code = String(value?.code || '').toLowerCase();
  if (code === 'permission_denied') return true;
  const error = String(value?.error || value?.message || '').toLowerCase();
  return error.includes('permission denied');
};

export const readResultError = (value) => {
  if (!value || typeof value !== 'object') return '';
  return String(value?.error || value?.message || '').trim();
};

const getBridgePathValue = (root, pathParts) => {
  let current = root;
  for (const part of pathParts) {
    if (current == null) return null;
    current = current[part];
  }
  return current;
};

const detectBridgeFailure = (api) => {
  if (!api || typeof api !== 'object') {
    return {
      bridgeState: 'failed',
      bridgeError: 'Renderer bridge unavailable (window.glass missing).',
      missingPaths: ['glass']
    };
  }
  const missing = [];
  for (const pathParts of BRIDGE_REQUIRED_PATHS) {
    const value = getBridgePathValue(api, pathParts);
    if (typeof value !== 'function') {
      missing.push(pathParts.join('.'));
    }
  }
  if (missing.length > 0) {
    return {
      bridgeState: 'failed',
      bridgeError: `Renderer bridge missing required API: ${missing.join(', ')}`,
      missingPaths: missing
    };
  }
  return {
    bridgeState: 'ready',
    bridgeError: null,
    missingPaths: []
  };
};

const safeProbe = async (probeFn, fallbackError) => {
  if (typeof probeFn !== 'function') {
    return { ok: false, error: fallbackError };
  }
  try {
    return await Promise.resolve(probeFn());
  } catch {
    return { ok: false, error: fallbackError };
  }
};

const safeReadAllowedScopes = async (permissions) => {
  if (!permissions || typeof permissions.allowedScopes !== 'function') return null;
  try {
    const res = await Promise.resolve(permissions.allowedScopes());
    if (res && res.ok && Array.isArray(res.scopes)) {
      return Array.from(new Set(res.scopes.map((scope) => String(scope || '').trim()).filter(Boolean)));
    }
  } catch {
    // ignore diagnostics-only call failures
  }
  return null;
};

const hasTradeLockerConfigShape = (value) => {
  if (!value || typeof value !== 'object') return false;
  const server = String(value?.server || '').trim();
  const email = String(value?.email || '').trim();
  const accountId = value?.accountId;
  return !!server && !!email && accountId != null && String(accountId).trim() !== '';
};

export async function runStartupBootstrap(api, options) {
  const source = String(options?.source || 'app_boot');
  const bridge = detectBridgeFailure(api);
  const permissions = api?.permissions;
  let requestedScopes = APP_BOOT_PERMISSION_SCOPES.slice();
  let skippedScopes = [];
  const probeSkippedDueToBridge = bridge.bridgeState !== 'ready';

  if (probeSkippedDueToBridge) {
    const tradeLockerPersistedReady = hasTradeLockerConfigShape(options?.tradeLockerSavedConfig);
    const lastKnownOpenAiReady = !!options?.lastKnownOpenAiReady;
    const lastKnownTradeLockerReady = !!options?.lastKnownTradeLockerReady;

    let localKeyReady = false;
    if (typeof options?.readLocalOpenAiKey === 'function') {
      const local = options.readLocalOpenAiKey();
      localKeyReady = !!(local && String(local).trim());
    }

    const openaiReadinessState = localKeyReady || lastKnownOpenAiReady ? 'assumed_ready' : 'unknown';
    const tradeLockerReadinessState = tradeLockerPersistedReady || lastKnownTradeLockerReady ? 'assumed_ready' : 'unknown';

    return {
      requestedScopes,
      skippedScopes,
      activeScopes: [],
      blockedScopes: [],
      unknownScopes: [],
      openaiReady: openaiReadinessState === 'ready' || openaiReadinessState === 'assumed_ready',
      openaiBlocked: false,
      openaiBlockedReason: null,
      openaiReadinessState,
      openaiFallbackSource: openaiReadinessState === 'assumed_ready'
        ? (localKeyReady ? 'local_cache' : 'last_known')
        : 'bridge_failed',
      openaiProbeSource: 'bridge_failed',
      tradeLockerProbeReady: false,
      tradeLockerReady: tradeLockerReadinessState === 'ready' || tradeLockerReadinessState === 'assumed_ready',
      tradeLockerBlocked: false,
      tradeLockerBlockedReason: null,
      tradeLockerReadinessState,
      tradeLockerFallbackSource: tradeLockerReadinessState === 'assumed_ready'
        ? (tradeLockerPersistedReady ? 'renderer_saved_config' : 'last_known')
        : 'bridge_failed',
      tradeLockerProbeSource: 'bridge_failed',
      probeErrors: {
        secrets: bridge.bridgeError || 'Bridge unavailable.',
        broker: bridge.bridgeError || 'Bridge unavailable.',
        tradeLedger: bridge.bridgeError || 'Bridge unavailable.',
        tradelocker: bridge.bridgeError || 'Bridge unavailable.'
      },
      probeSkippedDueToBridge: true,
      bridgeState: bridge.bridgeState,
      bridgeError: bridge.bridgeError,
      bridgeMissingPaths: bridge.missingPaths,
      diagnosticWarning: bridge.bridgeError || 'Bridge unavailable.',
      permissionResult: null,
      permissionError: null
    };
  }

  const allowedScopes = await safeReadAllowedScopes(permissions);
  if (Array.isArray(allowedScopes) && allowedScopes.length > 0) {
    const allowedSet = new Set(allowedScopes);
    requestedScopes = APP_BOOT_PERMISSION_SCOPES.filter((scope) => allowedSet.has(scope));
    skippedScopes = APP_BOOT_PERMISSION_SCOPES.filter((scope) => !allowedSet.has(scope));
  }
  let appliedScopes = requestedScopes.slice();
  let permissionResult = null;
  let permissionError = null;

  if (permissions?.set) {
    try {
      permissionResult = await Promise.resolve(
        permissions.set({
          source,
          scopes: requestedScopes
        })
      );
    } catch (err) {
      permissionError = err?.message ? String(err.message) : 'Permission bootstrap failed.';
    }
  }

  if (
    permissionResult &&
    permissionResult.ok === false &&
    Array.isArray(permissionResult.unknownScopes) &&
    permissionResult.unknownScopes.length > 0 &&
    permissions?.set
  ) {
    const accepted = Array.isArray(permissionResult.acceptedScopes) && permissionResult.acceptedScopes.length > 0
      ? permissionResult.acceptedScopes
      : requestedScopes.filter((scope) => !permissionResult.unknownScopes.includes(scope));
    appliedScopes = accepted;
    try {
      permissionResult = await Promise.resolve(
        permissions.set({
          source: `${source}:filtered_retry`,
          scopes: accepted
        })
      );
    } catch {
      // ignore retry failures; probe checks surface this path.
    }
  } else if (permissionResult?.ok && Array.isArray(permissionResult.scopes)) {
    appliedScopes = permissionResult.scopes.slice();
  }

  let activeScopes = appliedScopes.slice();
  if (permissions?.get) {
    try {
      const current = await Promise.resolve(permissions.get());
      if (current?.ok && Array.isArray(current.scopes)) {
        activeScopes = current.scopes.slice();
      }
    } catch {
      // ignore diagnostics-only call failures
    }
  }

  const [secretsProbe, brokerProbe, ledgerProbe, tlSavedConfigProbe] = await Promise.all([
    safeProbe(() => api?.secrets?.getStatus?.(), 'Secrets probe failed.'),
    safeProbe(() => api?.broker?.getActive?.(), 'Broker probe failed.'),
    safeProbe(() => api?.tradeLedger?.stats?.(), 'Trade ledger probe failed.'),
    safeProbe(() => api?.tradelocker?.getSavedConfig?.(), 'TradeLocker saved config probe failed.')
  ]);

  const probeErrors = {
    secrets: !secretsProbe?.ok ? (readResultError(secretsProbe) || 'Secrets probe failed.') : null,
    broker: !brokerProbe?.ok ? (readResultError(brokerProbe) || 'Broker probe failed.') : null,
    tradeLedger: !ledgerProbe?.ok ? (readResultError(ledgerProbe) || 'Trade ledger probe failed.') : null,
    tradelocker: !tlSavedConfigProbe?.ok ? (readResultError(tlSavedConfigProbe) || 'TradeLocker saved config probe failed.') : null
  };

  const blockedScopes = [];
  if (isPermissionDeniedResult(secretsProbe)) blockedScopes.push('secrets');
  if (isPermissionDeniedResult(brokerProbe)) blockedScopes.push('broker');
  if (isPermissionDeniedResult(ledgerProbe)) blockedScopes.push('tradeLedger');
  if (isPermissionDeniedResult(tlSavedConfigProbe)) blockedScopes.push('tradelocker');

  const openaiBlocked = isPermissionDeniedResult(secretsProbe);
  const openaiBlockedReason = openaiBlocked ? (readResultError(secretsProbe) || 'OpenAI check blocked by permissions.') : null;
  const lastKnownOpenAiReady = !!options?.lastKnownOpenAiReady;
  let openaiFallbackSource = null;
  let openaiProbeSource = 'none';
  let openaiReadinessState = 'unknown';
  let openaiReady = !openaiBlocked && !!(secretsProbe?.ok && secretsProbe?.openai?.hasKey);
  if (openaiReady) {
    openaiProbeSource = 'secrets_probe';
    openaiReadinessState = 'ready';
  } else {
    let hasLocalFallback = false;
    if (typeof options?.readLocalOpenAiKey === 'function') {
      const local = options.readLocalOpenAiKey();
      hasLocalFallback = !!(local && String(local).trim());
    }
    if (hasLocalFallback) {
      openaiFallbackSource = 'local_cache';
      openaiProbeSource = 'local_cache';
      openaiReadinessState = 'assumed_ready';
    } else if (lastKnownOpenAiReady) {
      openaiFallbackSource = 'last_known';
      openaiProbeSource = 'last_known';
      openaiReadinessState = 'assumed_ready';
    } else if (openaiBlocked) {
      openaiFallbackSource = 'probe_blocked';
      openaiProbeSource = 'probe_blocked';
      openaiReadinessState = 'unknown';
    } else if (secretsProbe?.ok) {
      openaiProbeSource = 'secrets_probe';
      openaiReadinessState = 'missing';
    } else {
      openaiProbeSource = 'probe_failed';
      openaiReadinessState = 'unknown';
    }
    openaiReady = openaiReadinessState === 'ready' || openaiReadinessState === 'assumed_ready';
  }

  const tradeLockerBlocked = isPermissionDeniedResult(tlSavedConfigProbe);
  const tradeLockerBlockedReason = tradeLockerBlocked
    ? (readResultError(tlSavedConfigProbe) || 'TradeLocker check blocked by permissions.')
    : null;
  const tradeLockerProbeReady = !tradeLockerBlocked && !!(tlSavedConfigProbe?.ok && hasTradeLockerConfigShape(tlSavedConfigProbe));
  const tradeLockerPersistedReady = hasTradeLockerConfigShape(options?.tradeLockerSavedConfig);
  const tradeLockerBrokerReady = !!(brokerProbe?.ok && String(brokerProbe?.activeId || '').toLowerCase() === 'tradelocker');
  const lastKnownTradeLockerReady = !!options?.lastKnownTradeLockerReady;
  let tradeLockerFallbackSource = null;
  let tradeLockerProbeSource = 'none';
  let tradeLockerReadinessState = 'unknown';
  if (tradeLockerProbeReady) {
    tradeLockerProbeSource = 'saved_config_probe';
    tradeLockerReadinessState = 'ready';
  } else if (tradeLockerPersistedReady) {
    tradeLockerFallbackSource = 'renderer_saved_config';
    tradeLockerProbeSource = 'renderer_saved_config';
    tradeLockerReadinessState = 'assumed_ready';
  } else if (tradeLockerBrokerReady) {
    tradeLockerFallbackSource = 'active_broker';
    tradeLockerProbeSource = 'active_broker';
    tradeLockerReadinessState = 'assumed_ready';
  } else if (lastKnownTradeLockerReady) {
    tradeLockerFallbackSource = 'last_known';
    tradeLockerProbeSource = 'last_known';
    tradeLockerReadinessState = 'assumed_ready';
  } else if (tradeLockerBlocked) {
    tradeLockerFallbackSource = 'probe_blocked';
    tradeLockerProbeSource = 'probe_blocked';
    tradeLockerReadinessState = 'unknown';
  } else if (tlSavedConfigProbe?.ok) {
    tradeLockerProbeSource = 'saved_config_probe';
    tradeLockerReadinessState = 'missing';
  } else {
    tradeLockerProbeSource = 'probe_failed';
    tradeLockerReadinessState = 'unknown';
  }
  const tradeLockerReady = tradeLockerReadinessState === 'ready' || tradeLockerReadinessState === 'assumed_ready';

  const unknownScopes = Array.isArray(permissionResult?.unknownScopes) ? permissionResult.unknownScopes : [];
  const diagnosticWarning = blockedScopes.length > 0
    ? `Startup permission probe blocked scopes: ${blockedScopes.join(', ')}.`
    : permissionResult?.ok === false
      ? (readResultError(permissionResult) || 'Permission bootstrap returned not-ok.')
      : permissionError;

  return {
    requestedScopes,
    skippedScopes,
    activeScopes,
    blockedScopes,
    unknownScopes,
    openaiReady,
    openaiBlocked,
    openaiBlockedReason,
    openaiReadinessState,
    openaiFallbackSource,
    openaiProbeSource,
    tradeLockerProbeReady,
    tradeLockerReady,
    tradeLockerBlocked,
    tradeLockerBlockedReason,
    tradeLockerReadinessState,
    tradeLockerFallbackSource,
    tradeLockerProbeSource,
    probeErrors,
    probeSkippedDueToBridge: false,
    bridgeState: bridge.bridgeState,
    bridgeError: bridge.bridgeError,
    bridgeMissingPaths: bridge.missingPaths,
    diagnosticWarning,
    permissionResult,
    permissionError
  };
}
