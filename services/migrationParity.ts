export type MigrationParitySlice = 'chat' | 'signal' | 'tradeLocker';

export interface MigrationParitySnapshot {
  chatMismatches: number;
  signalMismatches: number;
  tradeLockerMismatches: number;
  lastMismatchAtMs: number | null;
}

export const createMigrationParitySnapshot = (): MigrationParitySnapshot => ({
  chatMismatches: 0,
  signalMismatches: 0,
  tradeLockerMismatches: 0,
  lastMismatchAtMs: null
});

const isRecord = (value: any): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const stableStringify = (value: any): string => {
  if (value == null) return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

export const parityValuesEqual = (legacyValue: any, storeValue: any): boolean => {
  if (Object.is(legacyValue, storeValue)) return true;
  return stableStringify(legacyValue) === stableStringify(storeValue);
};

export const buildParityMismatchKey = (
  slice: MigrationParitySlice,
  field: string,
  legacyValue: any,
  storeValue: any
) => `${slice}:${field}:${stableStringify(legacyValue)}=>${stableStringify(storeValue)}`;

export const recordParityMismatch = (
  prev: MigrationParitySnapshot,
  slice: MigrationParitySlice,
  atMs: number = Date.now()
): MigrationParitySnapshot => {
  const next: MigrationParitySnapshot = {
    ...prev,
    lastMismatchAtMs: atMs
  };
  if (slice === 'chat') next.chatMismatches = Number(next.chatMismatches || 0) + 1;
  else if (slice === 'signal') next.signalMismatches = Number(next.signalMismatches || 0) + 1;
  else if (slice === 'tradeLocker') next.tradeLockerMismatches = Number(next.tradeLockerMismatches || 0) + 1;
  return next;
};
