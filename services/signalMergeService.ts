import { resolveSignalIdentityCandidates } from './signalIdentity';

type MergeSignalEntry = {
  id: string;
  signalCanonicalId?: string | null;
  legacySignalId?: string | null;
  status?: string | null;
  createdAtMs?: number | null;
  executedAtMs?: number | null;
  resolvedAtMs?: number | null;
  quantTelemetry?: any;
  [key: string]: any;
};

const finalStatuses = new Set(['WIN', 'LOSS', 'EXPIRED', 'REJECTED', 'FAILED']);

const normalizeStatus = (value: any) => String(value || '').trim().toUpperCase();

const isFinalStatus = (value: any) => finalStatuses.has(normalizeStatus(value));

const signalSortTime = (entry: MergeSignalEntry | null | undefined) =>
  Number(entry?.resolvedAtMs ?? entry?.executedAtMs ?? entry?.createdAtMs ?? 0) || 0;

const signalCompletenessScore = (entry: MergeSignalEntry | null | undefined) => {
  if (!entry) return 0;
  let score = 0;
  if (String(entry.signalCanonicalId || '').trim()) score += 2;
  if (String(entry.reason || '').trim()) score += 1;
  if (String(entry.executionBroker || '').trim()) score += 1;
  if (String(entry.executionMode || '').trim()) score += 1;
  if (entry.quantTelemetry) score += 1;
  if (isFinalStatus(entry.status)) score += 2;
  if (Number.isFinite(Number(entry.resolvedAtMs))) score += 1;
  return score;
};

export const resolveSignalMergeKey = (entry: MergeSignalEntry | null | undefined) => {
  const candidates = resolveSignalIdentityCandidates({
    signalCanonicalId: entry?.signalCanonicalId,
    signalId: entry?.signalId,
    id: entry?.id,
    legacySignalId: entry?.legacySignalId
  });
  if (candidates.length === 0) return '';
  return candidates[0];
};

export const preferSignalEntry = (current: MergeSignalEntry, incoming: MergeSignalEntry) => {
  const currentFinal = isFinalStatus(current?.status);
  const incomingFinal = isFinalStatus(incoming?.status);
  if (incomingFinal && !currentFinal) return incoming;
  if (currentFinal && !incomingFinal) return current;

  const currentScore = signalCompletenessScore(current);
  const incomingScore = signalCompletenessScore(incoming);
  if (incomingScore > currentScore) return incoming;
  if (currentScore > incomingScore) return current;

  return signalSortTime(incoming) >= signalSortTime(current) ? incoming : current;
};

export const mergeSignalEntries = (
  previous: MergeSignalEntry[],
  incoming: MergeSignalEntry[]
): {
  merged: MergeSignalEntry[];
  addedCount: number;
  replacedCount: number;
  retainedCount: number;
  idCollisionPreventedCount: number;
} => {
  const mergedByKey = new Map<string, MergeSignalEntry>();
  const legacyIdToCanonical = new Map<string, string>();

  const seed = Array.isArray(previous) ? previous : [];
  for (const entry of seed) {
    if (!entry || typeof entry !== 'object') continue;
    const key = resolveSignalMergeKey(entry);
    if (!key) continue;
    mergedByKey.set(key, entry);
    const legacy = String(entry.legacySignalId || entry.id || '').trim();
    if (legacy && String(entry.signalCanonicalId || '').trim()) {
      legacyIdToCanonical.set(legacy, String(entry.signalCanonicalId).trim());
    }
  }

  let addedCount = 0;
  let replacedCount = 0;
  let idCollisionPreventedCount = 0;

  for (const entry of Array.isArray(incoming) ? incoming : []) {
    if (!entry || typeof entry !== 'object') continue;
    const key = resolveSignalMergeKey(entry);
    if (!key) continue;
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, entry);
      addedCount += 1;
    } else {
      const preferred = preferSignalEntry(existing, entry);
      if (preferred !== existing) {
        mergedByKey.set(key, preferred);
        replacedCount += 1;
      }
    }

    const legacy = String(entry.legacySignalId || entry.id || '').trim();
    const canonical = String(entry.signalCanonicalId || '').trim();
    if (legacy && canonical) {
      const seenCanonical = legacyIdToCanonical.get(legacy);
      if (seenCanonical && seenCanonical !== canonical) {
        idCollisionPreventedCount += 1;
      }
      legacyIdToCanonical.set(legacy, canonical);
    }
  }

  const merged = Array.from(mergedByKey.values()).sort((a, b) => signalSortTime(b) - signalSortTime(a));
  const retainedCount = Math.max(0, merged.length - addedCount);
  return { merged, addedCount, replacedCount, retainedCount, idCollisionPreventedCount };
};

