export const ENTERPRISE_FEATURE_FLAGS_STORAGE_KEY = 'glass_enterprise_upgrade_flags_v1';

export interface EnterpriseFeatureFlags {
  securityAuditV1: boolean;
  mt5BridgeAuthV1: boolean;
  zustandMigrationV1: boolean;
  zustandChatSliceV1: boolean;
  zustandSignalSliceV1: boolean;
  zustandTradeLockerSliceV1: boolean;
  phase4ParityAuditV1: boolean;
  uiVirtualizationV1: boolean;
  electronE2EV1: boolean;
}

export const DEFAULT_ENTERPRISE_FEATURE_FLAGS: EnterpriseFeatureFlags = Object.freeze({
  securityAuditV1: true,
  mt5BridgeAuthV1: true,
  zustandMigrationV1: true,
  zustandChatSliceV1: true,
  zustandSignalSliceV1: false,
  zustandTradeLockerSliceV1: false,
  phase4ParityAuditV1: true,
  uiVirtualizationV1: false,
  electronE2EV1: true
});

const normalizeFlags = (input: any): EnterpriseFeatureFlags => {
  const base: EnterpriseFeatureFlags = { ...DEFAULT_ENTERPRISE_FEATURE_FLAGS };
  if (!input || typeof input !== 'object') return base;
  for (const key of Object.keys(base) as Array<keyof EnterpriseFeatureFlags>) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      base[key] = input[key] === true;
    }
  }
  return base;
};

export const getEnterpriseFeatureFlags = (): EnterpriseFeatureFlags => {
  try {
    const envRaw = String((import.meta as any)?.env?.VITE_GLASS_ENTERPRISE_FLAGS_JSON || '').trim();
    if (envRaw) {
      return normalizeFlags(JSON.parse(envRaw));
    }
  } catch {
    // ignore malformed env payload
  }
  try {
    const raw = localStorage.getItem(ENTERPRISE_FEATURE_FLAGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ENTERPRISE_FEATURE_FLAGS };
    return normalizeFlags(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ENTERPRISE_FEATURE_FLAGS };
  }
};

export const setEnterpriseFeatureFlags = (flags: Partial<EnterpriseFeatureFlags>) => {
  const next = normalizeFlags({ ...getEnterpriseFeatureFlags(), ...(flags || {}) });
  try {
    localStorage.setItem(ENTERPRISE_FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  return next;
};
