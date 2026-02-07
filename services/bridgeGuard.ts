type BridgePath = string[];

export type BridgeState = {
  ready: boolean;
  reason?: string;
  missingPaths?: string[];
};

export type BridgeDomainReadiness = {
  ready: boolean;
  reason?: string;
  missingPaths?: string[];
};

const REQUIRED_PATHS: BridgePath[] = [
  ['secrets', 'getStatus'],
  ['broker', 'getActive'],
  ['broker', 'request'],
  ['tradeLedger', 'stats'],
  ['tradelocker', 'getSavedConfig']
];

const DOMAIN_REQUIREMENTS: Record<'locker' | 'mt5' | 'signal' | 'snapshot' | 'tradeLedger', BridgePath[]> = {
  locker: [
    ['tradelocker', 'getSavedConfig'],
    ['tradelocker', 'getStatus']
  ],
  mt5: [
    ['broker', 'request'],
    ['broker', 'getActive']
  ],
  signal: [
    ['broker', 'request'],
    ['tradeLedger', 'upsertAgentMemory']
  ],
  snapshot: [
    ['broker', 'request'],
    ['broker', 'getActive']
  ],
  tradeLedger: [
    ['tradeLedger', 'stats'],
    ['tradeLedger', 'upsertAgentMemory'],
    ['tradeLedger', 'listAgentMemory']
  ]
};

const listeners = new Set<(state: BridgeState) => void>();
let lastState: BridgeState = { ready: true };

const readPath = (root: any, pathParts: BridgePath) => {
  let node = root;
  for (const part of pathParts) {
    if (node == null) return null;
    node = node[part];
  }
  return node;
};

const nextState = (): BridgeState => {
  const glass = (window as any)?.glass;
  if (!glass || typeof glass !== 'object') {
    return {
      ready: false,
      reason: 'Renderer bridge unavailable (window.glass missing).',
      missingPaths: ['glass']
    };
  }

  const missing: string[] = [];
  for (const pathParts of REQUIRED_PATHS) {
    const value = readPath(glass, pathParts);
    if (typeof value !== 'function') {
      missing.push(pathParts.join('.'));
    }
  }

  if (missing.length > 0) {
    return {
      ready: false,
      reason: `Renderer bridge missing API: ${missing.join(', ')}`,
      missingPaths: missing
    };
  }

  return { ready: true };
};

const statesEqual = (a: BridgeState, b: BridgeState) => {
  if (a.ready !== b.ready) return false;
  if ((a.reason || '') !== (b.reason || '')) return false;
  const aMissing = Array.isArray(a.missingPaths) ? a.missingPaths.join('|') : '';
  const bMissing = Array.isArray(b.missingPaths) ? b.missingPaths.join('|') : '';
  return aMissing === bMissing;
};

const emitIfChanged = (state: BridgeState) => {
  if (statesEqual(lastState, state)) return;
  lastState = state;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // Ignore listener failures to avoid affecting runtime bridge checks.
    }
  }
};

const evaluateDomain = (root: any, domain: keyof typeof DOMAIN_REQUIREMENTS): BridgeDomainReadiness => {
  if (!root || typeof root !== 'object') {
    return {
      ready: false,
      reason: 'Renderer bridge unavailable (window.glass missing).',
      missingPaths: ['glass']
    };
  }
  const missing: string[] = [];
  for (const pathParts of DOMAIN_REQUIREMENTS[domain]) {
    const value = readPath(root, pathParts);
    if (typeof value !== 'function') {
      missing.push(pathParts.join('.'));
    }
  }
  if (missing.length > 0) {
    return {
      ready: false,
      reason: `${domain} bridge APIs missing: ${missing.join(', ')}`,
      missingPaths: missing
    };
  }
  return { ready: true };
};

export const getBridgeState = (): BridgeState => {
  const state = nextState();
  emitIfChanged(state);
  return state;
};

export const getDomainReadiness = () => {
  const glass = (window as any)?.glass;
  return {
    locker: evaluateDomain(glass, 'locker'),
    mt5: evaluateDomain(glass, 'mt5'),
    signal: evaluateDomain(glass, 'signal'),
    snapshot: evaluateDomain(glass, 'snapshot'),
    tradeLedger: evaluateDomain(glass, 'tradeLedger')
  } as Record<keyof typeof DOMAIN_REQUIREMENTS, BridgeDomainReadiness>;
};

export const requireBridge = (domain: string): { ok: true } | { ok: false; error: string } => {
  const state = getBridgeState();
  if (state.ready) return { ok: true };
  const detail = state.reason || 'Renderer bridge unavailable.';
  const prefix = domain ? `${String(domain).trim()}: ` : '';
  return { ok: false, error: `${prefix}${detail}` };
};

export const onBridgeStateChange = (listener: (state: BridgeState) => void) => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  try {
    listener(lastState);
  } catch {
    // ignore
  }
  return () => {
    listeners.delete(listener);
  };
};
