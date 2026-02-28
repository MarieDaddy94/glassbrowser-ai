import type { UnifiedSnapshotStatus } from '../types';

const asText = (value: any) => String(value || '').trim();

const normalizeTimeframe = (value: any) => asText(value).toLowerCase();

export const UNIFIED_SNAPSHOT_READY_LABEL = 'NATIVE SNAPSHOT READY';
export const UNIFIED_SNAPSHOT_MISSING_LABEL = 'No snapshot yet.';
export const UNIFIED_SNAPSHOT_WARMING_LABEL = 'Warming up...';

export const buildSnapshotScopeKey = (symbol: any, timeframes: any): string | null => {
  const symbolKey = asText(symbol).toUpperCase();
  if (!symbolKey) return null;
  const list = Array.isArray(timeframes) ? timeframes : [];
  const normalized = Array.from(
    new Set(
      list
        .map((item) => normalizeTimeframe(item))
        .filter(Boolean)
    )
  ).sort();
  return `${symbolKey}|${normalized.join(',')}`;
};

export const isCoverageDelayCode = (reasonCode: any) => {
  const code = asText(reasonCode).toUpperCase();
  return code === 'SNAPSHOT_TIMEOUT' || code === 'WARMUP_TIMEOUT' || code === 'WARMUP_PENDING';
};

export const classifyUnifiedSnapshotStatus = (
  status: UnifiedSnapshotStatus | null | undefined
): UnifiedSnapshotStatus | null => {
  if (!status) return null;
  const missingCount = Array.isArray(status.missingFrames) ? status.missingFrames.length : 0;
  const shortCount = Array.isArray(status.shortFrames) ? status.shortFrames.length : 0;
  const hasCoverageGap = missingCount > 0 || shortCount > 0;
  const reasonCode = asText(status.reasonCode).toUpperCase();

  let state: UnifiedSnapshotStatus['state'] = 'failed';
  if (reasonCode === 'WARMUP_PENDING') {
    state = 'warming';
  } else if (isCoverageDelayCode(reasonCode) || hasCoverageGap) {
    state = 'coverage_delayed';
  } else if (status.ok === true && !reasonCode) {
    state = 'ready';
  } else if (!reasonCode && !hasCoverageGap) {
    state = 'ready';
  } else {
    state = 'failed';
  }

  return {
    ...status,
    reasonCode: reasonCode || null,
    state,
    ok: state === 'ready'
  };
};

export const formatUnifiedSnapshotStatusLabel = (
  status: UnifiedSnapshotStatus | null | undefined,
  options?: {
    readyLabel?: string;
    missingLabel?: string;
    failureLabel?: string;
    warmingLabel?: string;
  }
) => {
  if (!status) return options?.missingLabel || UNIFIED_SNAPSHOT_MISSING_LABEL;
  const normalized = classifyUnifiedSnapshotStatus(status);
  if (!normalized) return options?.missingLabel || UNIFIED_SNAPSHOT_MISSING_LABEL;
  if (normalized.state === 'warming') return options?.warmingLabel || UNIFIED_SNAPSHOT_WARMING_LABEL;
  if (normalized.state === 'coverage_delayed') {
    return `Snapshot coverage delayed${normalized.reasonCode ? ` (${normalized.reasonCode})` : ''}`;
  }
  if (normalized.state === 'ready') return options?.readyLabel || UNIFIED_SNAPSHOT_READY_LABEL;
  return options?.failureLabel || `Snapshot capture failed${normalized.reasonCode ? ` (${normalized.reasonCode})` : ''}`;
};
