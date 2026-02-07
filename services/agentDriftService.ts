import type { AgentDriftReport, RankFreshnessState } from '../types';

export type DriftObservation = {
  agentId: string;
  symbol?: string | null;
  timeframe?: string | null;
  session?: string | null;
  regime?: string | null;
  resolvedAtMs: number;
  outcome?: 'WIN' | 'LOSS' | 'EXPIRED' | 'REJECTED' | 'FAILED' | 'UNKNOWN' | null;
  score?: number | null;
};

export type DriftReportInput = {
  observations: DriftObservation[];
  baselineSamples?: number;
  liveSamples?: number;
  minSamples?: number;
};

const toNum = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const avg = (values: number[]) => {
  if (values.length === 0) return null;
  const total = values.reduce((acc, item) => acc + item, 0);
  return total / values.length;
};

const winRate = (values: DriftObservation[]) => {
  if (values.length === 0) return null;
  let wins = 0;
  let total = 0;
  for (const row of values) {
    const outcome = String(row.outcome || '').toUpperCase();
    if (outcome !== 'WIN' && outcome !== 'LOSS') continue;
    total += 1;
    if (outcome === 'WIN') wins += 1;
  }
  return total > 0 ? wins / total : null;
};

const scoreAvg = (values: DriftObservation[]) => {
  const scores: number[] = [];
  for (const row of values) {
    const score = toNum(row.score);
    if (score == null) continue;
    scores.push(score);
  }
  return avg(scores);
};

const segmentKeyOf = (row: DriftObservation) => {
  const symbol = String(row.symbol || 'all').trim() || 'all';
  const timeframe = String(row.timeframe || 'all').trim() || 'all';
  const session = String(row.session || 'all').trim() || 'all';
  const regime = String(row.regime || 'all').trim() || 'all';
  return `${symbol}|${timeframe}|${session}|${regime}`;
};

const pickSeverity = (deltaWinRate: number | null, deltaScore: number | null): AgentDriftReport['severity'] => {
  const warnWin = deltaWinRate != null && deltaWinRate <= -0.1;
  const poorWin = deltaWinRate != null && deltaWinRate <= -0.2;
  const warnScore = deltaScore != null && deltaScore <= -0.25;
  const poorScore = deltaScore != null && deltaScore <= -0.5;
  if (poorWin || poorScore) return 'poor';
  if (warnWin || warnScore) return 'warn';
  return 'ok';
};

export const computeAgentDriftReports = (input: DriftReportInput): AgentDriftReport[] => {
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const baselineSamples = Number.isFinite(Number(input.baselineSamples)) ? Math.max(10, Math.floor(Number(input.baselineSamples))) : 80;
  const liveSamples = Number.isFinite(Number(input.liveSamples)) ? Math.max(8, Math.floor(Number(input.liveSamples))) : 30;
  const minSamples = Number.isFinite(Number(input.minSamples)) ? Math.max(8, Math.floor(Number(input.minSamples))) : 24;
  const byAgentSegment = new Map<string, DriftObservation[]>();
  for (const row of observations) {
    const agentId = String(row?.agentId || '').trim();
    if (!agentId) continue;
    const key = `${agentId}::${segmentKeyOf(row)}`;
    const bucket = byAgentSegment.get(key) || [];
    bucket.push(row);
    byAgentSegment.set(key, bucket);
  }

  const now = Date.now();
  const reports: AgentDriftReport[] = [];
  for (const [key, rows] of byAgentSegment.entries()) {
    if (rows.length < minSamples) continue;
    rows.sort((a, b) => Number(a.resolvedAtMs || 0) - Number(b.resolvedAtMs || 0));
    const live = rows.slice(-liveSamples);
    const baselinePool = rows.slice(0, Math.max(0, rows.length - live.length));
    const baseline = baselinePool.slice(-baselineSamples);
    if (baseline.length < Math.max(8, Math.floor(minSamples / 2)) || live.length < Math.max(6, Math.floor(minSamples / 3))) {
      continue;
    }

    const [agentId, segment] = key.split('::');
    const baseWin = winRate(baseline);
    const liveWin = winRate(live);
    const baseScore = scoreAvg(baseline);
    const liveScore = scoreAvg(live);
    const deltaWin = baseWin != null && liveWin != null ? (liveWin - baseWin) : null;
    const deltaScore = baseScore != null && liveScore != null ? (liveScore - baseScore) : null;
    const severity = pickSeverity(deltaWin, deltaScore);
    reports.push({
      agentId,
      segment,
      baselineWindow: {
        samples: baseline.length,
        winRate: baseWin,
        avgScore: baseScore
      },
      liveWindow: {
        samples: live.length,
        winRate: liveWin,
        avgScore: liveScore
      },
      delta: {
        winRate: deltaWin,
        avgScore: deltaScore
      },
      severity,
      triggeredAt: now
    });
  }

  reports.sort((a, b) => {
    const rank = (value: AgentDriftReport['severity']) => (value === 'poor' ? 3 : value === 'warn' ? 2 : 1);
    const diff = rank(b.severity) - rank(a.severity);
    if (diff !== 0) return diff;
    return a.segment.localeCompare(b.segment);
  });
  return reports;
};

export const buildRankFreshnessState = (input: {
  updatedAtMs?: number | null;
  persistenceOk?: boolean | null;
  rankDomainOk?: boolean | null;
  driftReports?: AgentDriftReport[] | null;
  staleAfterMs?: number;
}): RankFreshnessState => {
  const updatedAtMs = toNum(input.updatedAtMs);
  const staleAfterMs = Number.isFinite(Number(input.staleAfterMs)) ? Math.max(60_000, Math.floor(Number(input.staleAfterMs))) : 10 * 60_000;
  const now = Date.now();
  const stale = !(updatedAtMs && now - updatedAtMs <= staleAfterMs);
  const persistenceDown = input.persistenceOk === false || input.rankDomainOk === false;
  const reports = Array.isArray(input.driftReports) ? input.driftReports : [];
  const poor = reports.some((row) => row.severity === 'poor');
  const warn = reports.some((row) => row.severity === 'warn');
  const degraded = persistenceDown || poor || warn;
  let reason: string | null = null;
  if (persistenceDown) reason = 'persistence_degraded';
  else if (poor) reason = 'agent_drift_poor';
  else if (warn) reason = 'agent_drift_warn';
  else if (stale) reason = 'stale';
  return {
    degraded,
    stale,
    updatedAtMs,
    reason
  };
};
