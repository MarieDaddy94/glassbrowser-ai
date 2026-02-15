const ACADEMY_SYNC_CURSOR_KEY = 'glass_academy_sync_cursor_v1';

export type AcademySyncCursorState = {
  casesUpdatedAfterMs?: number | null;
  lessonsUpdatedAfterMs?: number | null;
  symbolLearningsUpdatedAfterMs?: number | null;
};

const toSafeMs = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
};

export const readAcademySyncCursor = (): AcademySyncCursorState => {
  try {
    const raw = localStorage.getItem(ACADEMY_SYNC_CURSOR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      casesUpdatedAfterMs: toSafeMs(parsed?.casesUpdatedAfterMs),
      lessonsUpdatedAfterMs: toSafeMs(parsed?.lessonsUpdatedAfterMs),
      symbolLearningsUpdatedAfterMs: toSafeMs(parsed?.symbolLearningsUpdatedAfterMs)
    };
  } catch {
    return {};
  }
};

export const writeAcademySyncCursor = (state: AcademySyncCursorState) => {
  try {
    localStorage.setItem(ACADEMY_SYNC_CURSOR_KEY, JSON.stringify({
      casesUpdatedAfterMs: toSafeMs(state?.casesUpdatedAfterMs),
      lessonsUpdatedAfterMs: toSafeMs(state?.lessonsUpdatedAfterMs),
      symbolLearningsUpdatedAfterMs: toSafeMs(state?.symbolLearningsUpdatedAfterMs)
    }));
  } catch {
    // ignore persistence failures
  }
};

export const nextCursorFromItems = (
  previousMs: number | null | undefined,
  items: any[],
  timeResolver: (item: any) => number | null
) => {
  let next = toSafeMs(previousMs) || 0;
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const ts = toSafeMs(timeResolver(item));
    if (!ts) continue;
    if (ts > next) next = ts;
  }
  return next > 0 ? next : null;
};

export const buildIncrementalListOptions = (
  limit: number,
  updatedAfterMs?: number | null,
  includeArchived = true
) => {
  const options: Record<string, any> = {
    limit,
    includeArchived: includeArchived === true
  };
  const updatedAfter = toSafeMs(updatedAfterMs);
  if (updatedAfter) options.updatedAfterMs = updatedAfter;
  return options;
};

