import type {
  CalendarRule,
  SetupLibraryEntry,
  SignalHistoryEntry,
  SignalIntent,
  SignalIntentChatTurn,
  SignalIntentRun
} from '../types';

export type MergeNoShrinkStats = {
  incomingCount: number;
  addedCount: number;
  replacedCount: number;
  retainedCount: number;
};

type MergeNoShrinkOptions<T> = {
  getKey: (entry: T) => string;
  shouldReplace: (existing: T, incoming: T) => boolean;
  sort: (a: T, b: T) => number;
};

const mergeNoShrinkByKey = <T>(
  previous: T[] | null | undefined,
  incoming: T[] | null | undefined,
  options: MergeNoShrinkOptions<T>
): { merged: T[]; stats: MergeNoShrinkStats } => {
  const previousList = Array.isArray(previous) ? previous : [];
  const incomingList = Array.isArray(incoming) ? incoming : [];

  const map = new Map<string, T>();
  for (const entry of previousList) {
    const key = options.getKey(entry);
    if (!key) continue;
    map.set(key, entry);
  }
  const snapshotKeys = new Set<string>();

  let addedCount = 0;
  let replacedCount = 0;
  for (const entry of incomingList) {
    const key = options.getKey(entry);
    if (!key) continue;
    snapshotKeys.add(key);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, entry);
      addedCount += 1;
      continue;
    }
    if (options.shouldReplace(existing, entry)) {
      map.set(key, entry);
      replacedCount += 1;
    }
  }

  let retainedCount = 0;
  for (const entry of previousList) {
    const key = options.getKey(entry);
    if (!key) continue;
    if (!snapshotKeys.has(key)) retainedCount += 1;
  }

  const merged = Array.from(map.values()).sort(options.sort);
  return {
    merged,
    stats: {
      incomingCount: incomingList.length,
      addedCount,
      replacedCount,
      retainedCount
    }
  };
};

const historyTime = (entry: SignalHistoryEntry | null | undefined) =>
  Number(entry?.resolvedAtMs ?? entry?.executedAtMs ?? 0) || 0;

const historyRichness = (entry: SignalHistoryEntry | null | undefined) => {
  if (!entry) return 0;
  let score = 0;
  if (entry.outcome) score += 2;
  if (entry.status) score += 1;
  if (Number.isFinite(Number(entry.score))) score += 1;
  if (entry.attribution && typeof entry.attribution === 'object') score += 2;
  if (entry.resolvedOutcomeEnvelope && typeof entry.resolvedOutcomeEnvelope === 'object') score += 2;
  if (entry.newsSnapshot) score += 1;
  return score;
};

export const mergeSignalHistoryEntries = (
  previous: SignalHistoryEntry[] | null | undefined,
  incoming: SignalHistoryEntry[] | null | undefined
) => mergeNoShrinkByKey<SignalHistoryEntry>(previous, incoming, {
  getKey: (entry) => String(entry?.signalId || entry?.id || '').trim(),
  shouldReplace: (existing, next) => {
    const nextRichness = historyRichness(next);
    const existingRichness = historyRichness(existing);
    if (nextRichness !== existingRichness) return nextRichness > existingRichness;
    return historyTime(next) >= historyTime(existing);
  },
  sort: (a, b) => historyTime(b) - historyTime(a)
});

type AgentScorecardLike = {
  agentId?: string | null;
  agentName?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  updatedAtMs?: number | null;
  createdAtMs?: number | null;
};

const scorecardKey = (entry: AgentScorecardLike | null | undefined) => {
  if (!entry) return '';
  const agent = String(entry.agentId || entry.agentName || '').trim().toLowerCase();
  if (!agent) return '';
  const symbol = String(entry.symbol || '').trim().toLowerCase();
  const timeframe = String(entry.timeframe || '').trim().toLowerCase();
  return [agent, symbol, timeframe].join('|');
};

const scorecardTime = (entry: AgentScorecardLike | null | undefined) =>
  Number(entry?.updatedAtMs ?? entry?.createdAtMs ?? 0) || 0;

export const mergeAgentScorecards = <T extends AgentScorecardLike>(
  previous: T[] | null | undefined,
  incoming: T[] | null | undefined
) => mergeNoShrinkByKey<T>(previous, incoming, {
  getKey: (entry) => scorecardKey(entry),
  shouldReplace: (existing, next) => scorecardTime(next) >= scorecardTime(existing),
  sort: (a, b) => scorecardTime(b) - scorecardTime(a)
});

const setupRichness = (entry: SetupLibraryEntry | null | undefined) => {
  if (!entry) return 0;
  let score = 0;
  if (entry.evidence) score += 2;
  if (entry.stats && typeof entry.stats === 'object') score += 1;
  if (entry.performance && typeof entry.performance === 'object') score += 1;
  if (Number.isFinite(Number(entry.score))) score += 1;
  if (entry.params && typeof entry.params === 'object') score += 1;
  return score;
};

const setupTime = (entry: SetupLibraryEntry | null | undefined) =>
  Number(entry?.updatedAtMs ?? entry?.createdAtMs ?? 0) || 0;

export const mergeSetupLibraryEntries = (
  previous: SetupLibraryEntry[] | null | undefined,
  incoming: SetupLibraryEntry[] | null | undefined
) => mergeNoShrinkByKey<SetupLibraryEntry>(previous, incoming, {
  getKey: (entry) => String(entry?.key || '').trim(),
  shouldReplace: (existing, next) => {
    const nextRichness = setupRichness(next);
    const existingRichness = setupRichness(existing);
    if (nextRichness !== existingRichness) return nextRichness > existingRichness;
    return setupTime(next) >= setupTime(existing);
  },
  sort: (a, b) => {
    const scoreDelta = Number(b?.score || 0) - Number(a?.score || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return setupTime(b) - setupTime(a);
  }
});

const calendarTime = (entry: CalendarRule | null | undefined) =>
  Number(entry?.updatedAtMs ?? entry?.createdAtMs ?? 0) || 0;

export const mergeCalendarRules = (
  previous: CalendarRule[] | null | undefined,
  incoming: CalendarRule[] | null | undefined
) => mergeNoShrinkByKey<CalendarRule>(previous, incoming, {
  getKey: (entry) => String(entry?.id || '').trim(),
  shouldReplace: (existing, next) => calendarTime(next) >= calendarTime(existing),
  sort: (a, b) => calendarTime(b) - calendarTime(a)
});

const intentTime = (entry: SignalIntent | null | undefined) =>
  Number(entry?.updatedAtMs ?? entry?.createdAtMs ?? 0) || 0;

export const mergeSignalIntents = (
  previous: SignalIntent[] | null | undefined,
  incoming: SignalIntent[] | null | undefined
) => mergeNoShrinkByKey<SignalIntent>(previous, incoming, {
  getKey: (entry) => String(entry?.id || '').trim(),
  shouldReplace: (existing, next) => intentTime(next) >= intentTime(existing),
  sort: (a, b) => intentTime(b) - intentTime(a)
});

const intentRunTime = (entry: SignalIntentRun | null | undefined) =>
  Number(entry?.triggerAtMs || 0) || 0;

export const mergeSignalIntentRuns = (
  previous: SignalIntentRun[] | null | undefined,
  incoming: SignalIntentRun[] | null | undefined
) => mergeNoShrinkByKey<SignalIntentRun>(previous, incoming, {
  getKey: (entry) => String(entry?.runId || '').trim(),
  shouldReplace: (existing, next) => intentRunTime(next) >= intentRunTime(existing),
  sort: (a, b) => intentRunTime(b) - intentRunTime(a)
});

const intentChatTime = (entry: SignalIntentChatTurn | null | undefined) =>
  Number(entry?.atMs || 0) || 0;

export const mergeSignalIntentChatTurns = (
  previous: SignalIntentChatTurn[] | null | undefined,
  incoming: SignalIntentChatTurn[] | null | undefined
) => mergeNoShrinkByKey<SignalIntentChatTurn>(previous, incoming, {
  getKey: (entry) => String(entry?.id || '').trim(),
  shouldReplace: (existing, next) => intentChatTime(next) >= intentChatTime(existing),
  sort: (a, b) => intentChatTime(a) - intentChatTime(b)
});

