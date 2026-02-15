type MergeAcademyCase = {
  id?: string | null;
  caseId?: string | null;
  signalId?: string | null;
  signalCanonicalId?: string | null;
  legacySignalId?: string | null;
  outcome?: string | null;
  status?: string | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  createdAtMs?: number | null;
  executedAtMs?: number | null;
  resolvedAtMs?: number | null;
  updatedAtMs?: number | null;
  resolvedOutcomeEnvelope?: any;
  attribution?: any;
  dataQualityScore?: number | null;
  dataQualityFlags?: string[] | null;
  materializedBy?: string | null;
  lastRepairedAtMs?: number | null;
  [key: string]: any;
};

const normalizeText = (value: any) => String(value || '').trim();

const hasValue = (value: any) => value !== null && value !== undefined && value !== '';

const caseSortTime = (entry: MergeAcademyCase | null | undefined) =>
  Number(entry?.resolvedAtMs ?? entry?.executedAtMs ?? entry?.updatedAtMs ?? entry?.createdAtMs ?? 0) || 0;

const asText = (value: any) => String(value || '').trim();

const SOURCE_QUALITY = Object.freeze({
  signal_panel: 5,
  academy_analyst: 5,
  academy: 4,
  system_repair: 3,
  academy_repair: 2,
  legacy_repair: 1
} as Record<string, number>);

const sourceQuality = (entry: MergeAcademyCase | null | undefined) => {
  const source = asText(entry?.source).toLowerCase();
  if (!source) return 0;
  return Number(SOURCE_QUALITY[source] || 0);
};

const payloadDepthScore = (entry: MergeAcademyCase | null | undefined) => {
  if (!entry) return 0;
  let score = 0;
  const analysisReport = entry.analysis && typeof entry.analysis === 'object'
    ? (entry.analysis.report || entry.analysis.caseReport || null)
    : null;
  if (analysisReport && typeof analysisReport === 'object') {
    const reportText = [
      asText((analysisReport as any).summary),
      asText((analysisReport as any).rootCause),
      asText((analysisReport as any).improvement)
    ].filter(Boolean).join(' ');
    if (reportText) score += 6;
  } else if (entry.analysis && typeof entry.analysis === 'object') {
    score += 3;
  }

  if (Array.isArray(entry.telemetry) && entry.telemetry.length > 0) {
    score += Math.min(4, entry.telemetry.length);
  }

  const snapshotFrames = Array.isArray(entry.snapshot?.frames) ? entry.snapshot.frames.length : 0;
  if (snapshotFrames > 0) score += 2;
  if (entry.resolvedOutcomeEnvelope && typeof entry.resolvedOutcomeEnvelope === 'object') score += 2;
  if (entry.attribution && typeof entry.attribution === 'object') score += 2;

  const lessonHints = [
    Array.isArray(entry.analysis?.lessons) ? entry.analysis.lessons.length : 0,
    Array.isArray(entry.analysis?.lessonIds) ? entry.analysis.lessonIds.length : 0,
    Array.isArray(entry.analysis?.report?.lessonIds) ? entry.analysis.report.lessonIds.length : 0
  ];
  if (Math.max(...lessonHints, 0) > 0) score += 2;

  return score;
};

const isSparseComparedTo = (candidate: MergeAcademyCase, baseline: MergeAcademyCase) => {
  const candidateHasAnalysis = !!(candidate.analysis && typeof candidate.analysis === 'object');
  const baselineHasAnalysis = !!(baseline.analysis && typeof baseline.analysis === 'object');
  if (!candidateHasAnalysis && baselineHasAnalysis) return true;

  const candidateTelemetry = Array.isArray(candidate.telemetry) ? candidate.telemetry.length : 0;
  const baselineTelemetry = Array.isArray(baseline.telemetry) ? baseline.telemetry.length : 0;
  if (candidateTelemetry === 0 && baselineTelemetry > 0) return true;

  const candidateSnapshotFrames = Array.isArray(candidate.snapshot?.frames) ? candidate.snapshot.frames.length : 0;
  const baselineSnapshotFrames = Array.isArray(baseline.snapshot?.frames) ? baseline.snapshot.frames.length : 0;
  if (candidateSnapshotFrames === 0 && baselineSnapshotFrames > 0) return true;

  return false;
};

export const buildAcademyCaseDataQuality = (entry: MergeAcademyCase | null | undefined) => {
  const flags: string[] = [];
  if (!entry) {
    flags.push('missing_entry');
    return { score: 0, flags };
  }
  if (!hasValue(entry.signalCanonicalId) && !hasValue(entry.signalId) && !hasValue(entry.id)) flags.push('missing_identity');
  if (!hasValue(entry.action)) flags.push('missing_action');
  if (!(Number.isFinite(Number(entry.entryPrice)) && Number(entry.entryPrice) > 0)) flags.push('missing_entry_price');
  if (!(Number.isFinite(Number(entry.stopLoss)) && Number(entry.stopLoss) > 0)) flags.push('missing_stop_loss');
  if (!(Number.isFinite(Number(entry.takeProfit)) && Number(entry.takeProfit) > 0)) flags.push('missing_take_profit');
  if (!(entry.analysis && typeof entry.analysis === 'object')) flags.push('missing_analysis');
  if (!(Array.isArray(entry.telemetry) && entry.telemetry.length > 0)) flags.push('missing_telemetry');
  if (!(entry.snapshot && Array.isArray(entry.snapshot?.frames) && entry.snapshot.frames.length > 0)) flags.push('missing_snapshot');
  if (!(entry.attribution && typeof entry.attribution === 'object')) flags.push('missing_attribution');
  return {
    score: scoreAcademyCaseRichness(entry),
    flags
  };
};

export const resolveAcademyCaseMergeKey = (entry: MergeAcademyCase | null | undefined, fallbackKey?: any) => {
  const keys = [
    normalizeText(entry?.signalCanonicalId),
    normalizeText(entry?.signalId),
    normalizeText(entry?.caseId),
    normalizeText(entry?.id),
    normalizeText(fallbackKey)
  ].filter(Boolean);
  if (keys.length === 0) return '';
  return keys[0];
};

export const scoreAcademyCaseRichness = (entry: MergeAcademyCase | null | undefined) => {
  if (!entry) return 0;
  let score = 0;
  if (hasValue(entry.signalCanonicalId)) score += 3;
  if (hasValue(entry.signalId)) score += 2;
  if (hasValue(entry.action)) score += 1;
  if (Number.isFinite(Number(entry.entryPrice)) && Number(entry.entryPrice) > 0) score += 1;
  if (Number.isFinite(Number(entry.stopLoss)) && Number(entry.stopLoss) > 0) score += 1;
  if (Number.isFinite(Number(entry.takeProfit)) && Number(entry.takeProfit) > 0) score += 1;
  if (hasValue(entry.status) || hasValue(entry.outcome)) score += 1;
  if (entry.resolvedOutcomeEnvelope) score += 2;
  if (entry.attribution) score += 2;
  if (Number.isFinite(Number(entry.resolvedAtMs))) score += 1;
  score += payloadDepthScore(entry);
  score += sourceQuality(entry);
  return score;
};

export const pickPreferredAcademyCase = (current: MergeAcademyCase, incoming: MergeAcademyCase) => {
  if (isSparseComparedTo(incoming, current)) return current;
  const currentScore = scoreAcademyCaseRichness(current);
  const incomingScore = scoreAcademyCaseRichness(incoming);
  if (incomingScore > currentScore) return incoming;
  if (currentScore > incomingScore) return current;
  const currentSource = sourceQuality(current);
  const incomingSource = sourceQuality(incoming);
  if (incomingSource > currentSource) return incoming;
  if (currentSource > incomingSource) return current;
  return caseSortTime(incoming) > caseSortTime(current) ? incoming : current;
};

export const mergeAcademyCasesMergeOnly = (
  previous: MergeAcademyCase[],
  incoming: Array<{ entry: MergeAcademyCase; key?: string | null }>,
  mergeVersion = 2
): {
  merged: MergeAcademyCase[];
  addedCount: number;
  replacedCount: number;
  retainedCount: number;
} => {
  const mergedByKey = new Map<string, MergeAcademyCase>();
  const now = Date.now();

  for (const entry of Array.isArray(previous) ? previous : []) {
    if (!entry || typeof entry !== 'object') continue;
    const key = resolveAcademyCaseMergeKey(entry);
    if (!key) continue;
    mergedByKey.set(key, {
      ...entry,
      academyMergeVersion: Number(entry.academyMergeVersion || mergeVersion),
      academyLastSeenAtMs: Number(entry.academyLastSeenAtMs || now)
    });
  }

  let addedCount = 0;
  let replacedCount = 0;

  for (const item of Array.isArray(incoming) ? incoming : []) {
    const entry = item?.entry;
    if (!entry || typeof entry !== 'object') continue;
    const key = resolveAcademyCaseMergeKey(entry, item?.key);
    if (!key) continue;
    const dataQuality = buildAcademyCaseDataQuality(entry);
    const next = {
      ...entry,
      academyMergeVersion: mergeVersion,
      academyLastSeenAtMs: now,
      dataQualityScore: Number.isFinite(Number(entry?.dataQualityScore)) ? Number(entry.dataQualityScore) : dataQuality.score,
      dataQualityFlags: Array.isArray(entry?.dataQualityFlags) ? entry.dataQualityFlags : dataQuality.flags
    };
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, next);
      addedCount += 1;
      continue;
    }
    const preferred = pickPreferredAcademyCase(existing, next);
    if (preferred !== existing) {
      mergedByKey.set(key, preferred);
      replacedCount += 1;
    } else {
      mergedByKey.set(key, {
        ...existing,
        academyLastSeenAtMs: now,
        academyMergeVersion: mergeVersion
      });
    }
  }

  const merged = Array.from(mergedByKey.values()).sort((a, b) => caseSortTime(b) - caseSortTime(a));
  const retainedCount = Math.max(0, merged.length - addedCount);
  return { merged, addedCount, replacedCount, retainedCount };
};
