const SIGNAL_RESOLUTION_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1H': 60 * 60_000,
  '4H': 4 * 60 * 60_000,
  '1D': 24 * 60 * 60_000
};

export const normalizeSignalTimeframeKey = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d+)\s*([a-zA-Z]+)$/);
  if (!match) return raw;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  if (unit === 'h' || unit === 'd') return `${amount}${unit.toUpperCase()}`;
  if (unit === 'm') return `${amount}m`;
  return raw;
};

export const toSignalEpochMs = (value: any, fallback: number = 0): number => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num > 1e11 ? Math.floor(num) : Math.floor(num * 1000);
};

export const getSetupSignalBucketTime = (timeframe: string, signalBarTimeMs: number): number => {
  const ts = toSignalEpochMs(signalBarTimeMs, 0);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  const key = normalizeSignalTimeframeKey(timeframe || '');
  const resMs = SIGNAL_RESOLUTION_MS[key] || 0;
  if (!resMs) return ts;
  return Math.floor(ts / resMs) * resMs;
};

export const getSetupSignalResolutionMs = (timeframe: string): number => {
  const key = normalizeSignalTimeframeKey(timeframe || '');
  return SIGNAL_RESOLUTION_MS[key] || 0;
};

export const buildSetupSignalBucketId = (
  profileKey: string,
  timeframe: string,
  signalBarTimeMs: number
): string => {
  const bucket = getSetupSignalBucketTime(timeframe, signalBarTimeMs);
  return `${String(profileKey || 'na').trim() || 'na'}:${bucket || 0}`;
};

export const buildSetupSignalDedupeId = (
  profileKey: string,
  signalType: string,
  timeframe: string,
  signalBarTimeMs: number
): string => {
  const base = buildSetupSignalBucketId(profileKey, timeframe, signalBarTimeMs);
  const type = String(signalType || 'na').trim() || 'na';
  return `${base}:${type}`;
};
