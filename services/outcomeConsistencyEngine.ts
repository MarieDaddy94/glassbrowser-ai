import type {
  OutcomeFeedConsistencyState,
  OutcomeFeedCursor,
  PanelFreshnessState,
  ResolvedOutcomeEnvelope,
  SignalHistoryEntry
} from '../types';
import { hashStringSampled } from './stringHash';

const EXPECTED_PANELS = ['leaderboard', 'academy', 'audit', 'changes'];
const DEFAULT_STALE_AFTER_MS = 3 * 60_000;

type PanelReadState = {
  panel: string;
  checksum: string | null;
  lastSyncAt: number;
};

const normalizeString = (value: any) => {
  const text = String(value || '').trim();
  return text ? text : null;
};

const toMs = (...values: any[]) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
};

const mapOutcomeToDecision = (outcome: any): ResolvedOutcomeEnvelope['decisionOutcome'] => {
  const key = String(outcome || '').trim().toUpperCase();
  if (key === 'WIN' || key === 'LOSS' || key === 'EXPIRED' || key === 'REJECTED' || key === 'FAILED') return key;
  return 'UNKNOWN';
};

const mapOutcomeToExecution = (outcome: any): ResolvedOutcomeEnvelope['executionOutcome'] => {
  const key = String(outcome || '').trim().toUpperCase();
  if (key === 'REJECTED') return 'REJECTED';
  if (key === 'EXPIRED') return 'EXPIRED';
  if (key === 'FAILED') return 'MISSED';
  if (key === 'LOSS') return 'SLIPPAGE_EXIT';
  if (key === 'WIN') return 'FILLED';
  return 'UNKNOWN';
};

const mapOutcomeToLifecycle = (outcome: any): ResolvedOutcomeEnvelope['lifecycleState'] => {
  const key = String(outcome || '').trim().toUpperCase();
  if (key === 'WIN') return 'tp_exit';
  if (key === 'LOSS') return 'sl_exit';
  if (key === 'EXPIRED') return 'expired';
  if (key === 'REJECTED') return 'rejected';
  if (key === 'FAILED') return 'failed';
  return 'filled';
};

const normalizeEnvelopeFromEntry = (entry: SignalHistoryEntry): ResolvedOutcomeEnvelope | null => {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.resolvedOutcomeEnvelope && typeof entry.resolvedOutcomeEnvelope === 'object') {
    const envelope = entry.resolvedOutcomeEnvelope;
    const signalId = normalizeString(envelope.signalId || entry.signalId || entry.id);
    if (!signalId) return null;
    return {
      signalId,
      lifecycleState: envelope.lifecycleState || mapOutcomeToLifecycle(entry.outcome),
      timestamps: {
        proposedAtMs: toMs(envelope.timestamps?.proposedAtMs, entry.createdAtMs),
        submittedAtMs: toMs(envelope.timestamps?.submittedAtMs, entry.executedAtMs),
        executedAtMs: toMs(envelope.timestamps?.executedAtMs, entry.executedAtMs),
        resolvedAtMs: toMs(envelope.timestamps?.resolvedAtMs, entry.resolvedAtMs, entry.executedAtMs)
      },
      decisionOutcome: envelope.decisionOutcome || mapOutcomeToDecision(entry.outcome),
      executionOutcome: envelope.executionOutcome || mapOutcomeToExecution(entry.outcome),
      source: envelope.source || 'unknown'
    };
  }

  const signalId = normalizeString(entry.signalId || entry.id);
  if (!signalId) return null;
  const decisionOutcome = mapOutcomeToDecision(entry.outcome);
  if (decisionOutcome === 'UNKNOWN') return null;
  return {
    signalId,
    lifecycleState: mapOutcomeToLifecycle(entry.outcome),
    timestamps: {
      proposedAtMs: toMs(entry.executedAtMs, entry.resolvedAtMs),
      submittedAtMs: toMs(entry.executedAtMs),
      executedAtMs: toMs(entry.executedAtMs),
      resolvedAtMs: toMs(entry.resolvedAtMs, entry.executedAtMs)
    },
    decisionOutcome,
    executionOutcome: mapOutcomeToExecution(entry.outcome),
    source: (normalizeString(entry.outcomeSource) as ResolvedOutcomeEnvelope['source']) || 'unknown'
  };
};

const compareEnvelope = (a: ResolvedOutcomeEnvelope, b: ResolvedOutcomeEnvelope) => {
  const aTs = Number(a.timestamps?.resolvedAtMs || a.timestamps?.executedAtMs || 0);
  const bTs = Number(b.timestamps?.resolvedAtMs || b.timestamps?.executedAtMs || 0);
  if (bTs !== aTs) return bTs - aTs;
  return String(a.signalId || '').localeCompare(String(b.signalId || ''));
};

const buildCursorInternal = (envelopes: ResolvedOutcomeEnvelope[], version: number): OutcomeFeedCursor => {
  const lastResolvedAtMs = envelopes.reduce((acc, envelope) => {
    const ts = Number(envelope?.timestamps?.resolvedAtMs || envelope?.timestamps?.executedAtMs || 0);
    if (Number.isFinite(ts) && ts > acc) return ts;
    return acc;
  }, 0);
  const checksumPayload = envelopes
    .slice(0, 1200)
    .map((envelope) => [
      envelope.signalId,
      envelope.lifecycleState,
      envelope.decisionOutcome,
      envelope.executionOutcome,
      envelope.source,
      envelope.timestamps?.resolvedAtMs || envelope.timestamps?.executedAtMs || 0
    ].join('|'))
    .join('\n');
  return {
    version: Math.max(1, Math.floor(version || 1)),
    total: envelopes.length,
    lastResolvedAtMs: lastResolvedAtMs > 0 ? lastResolvedAtMs : null,
    checksum: hashStringSampled(checksumPayload || `${version}:${envelopes.length}`),
    generatedAtMs: Date.now()
  };
};

export const buildOutcomeFeedCursorFromHistory = (entries: SignalHistoryEntry[] = []): OutcomeFeedCursor => {
  const envelopes = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeEnvelopeFromEntry(entry))
    .filter(Boolean) as ResolvedOutcomeEnvelope[];
  envelopes.sort(compareEnvelope);
  return buildCursorInternal(envelopes, 1);
};

class OutcomeConsistencyEngine {
  private envelopes: ResolvedOutcomeEnvelope[] = [];
  private cursor: OutcomeFeedCursor = {
    version: 1,
    total: 0,
    lastResolvedAtMs: null,
    checksum: '0',
    generatedAtMs: Date.now()
  };
  private version = 1;
  private panelReads = new Map<string, PanelReadState>();

  ingestSignalHistory(entries: SignalHistoryEntry[]) {
    const envelopes = (Array.isArray(entries) ? entries : [])
      .map((entry) => normalizeEnvelopeFromEntry(entry))
      .filter(Boolean) as ResolvedOutcomeEnvelope[];
    envelopes.sort(compareEnvelope);
    this.version += 1;
    this.envelopes = envelopes;
    this.cursor = buildCursorInternal(envelopes, this.version);
    return {
      cursor: this.getCursor(),
      consistency: this.getConsistencyState(),
      panelFreshness: this.getPanelFreshness()
    };
  }

  getFeed(limit: number = 500) {
    const max = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : 500;
    return this.envelopes.slice(0, max);
  }

  getCursor() {
    return { ...this.cursor };
  }

  markPanelRead(panel: string, cursor?: OutcomeFeedCursor | null) {
    const name = String(panel || '').trim().toLowerCase();
    if (!name) return;
    const reference = cursor && typeof cursor === 'object' ? cursor : this.cursor;
    this.panelReads.set(name, {
      panel: name,
      checksum: normalizeString(reference?.checksum),
      lastSyncAt: Date.now()
    });
  }

  getPanelFreshness(now: number = Date.now(), staleAfterMs: number = DEFAULT_STALE_AFTER_MS): PanelFreshnessState[] {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const staleAfter = Number.isFinite(Number(staleAfterMs)) ? Math.max(10_000, Math.floor(Number(staleAfterMs))) : DEFAULT_STALE_AFTER_MS;
    const names = new Set<string>(EXPECTED_PANELS);
    for (const panel of this.panelReads.keys()) names.add(panel);
    const rows: PanelFreshnessState[] = [];
    for (const panel of Array.from(names.values())) {
      const read = this.panelReads.get(panel);
      if (!read) {
        rows.push({
          panel,
          state: 'unknown',
          lastSyncAt: null,
          reason: 'never_synced'
        });
        continue;
      }
      const age = ts - read.lastSyncAt;
      if (age > staleAfter) {
        rows.push({
          panel,
          state: 'stale',
          lastSyncAt: read.lastSyncAt,
          reason: `stale_${Math.floor(age / 1000)}s`
        });
        continue;
      }
      if (read.checksum && read.checksum !== this.cursor.checksum) {
        rows.push({
          panel,
          state: 'degraded',
          lastSyncAt: read.lastSyncAt,
          reason: 'checksum_mismatch'
        });
        continue;
      }
      rows.push({
        panel,
        state: 'fresh',
        lastSyncAt: read.lastSyncAt,
        reason: null
      });
    }
    rows.sort((a, b) => String(a.panel).localeCompare(String(b.panel)));
    return rows;
  }

  getConsistencyState(now: number = Date.now(), staleAfterMs: number = DEFAULT_STALE_AFTER_MS): OutcomeFeedConsistencyState {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const staleAfter = Number.isFinite(Number(staleAfterMs)) ? Math.max(10_000, Math.floor(Number(staleAfterMs))) : DEFAULT_STALE_AFTER_MS;
    const freshness = this.getPanelFreshness(ts, staleAfter);
    const desyncedPanels = freshness
      .filter((row) => row.state === 'degraded')
      .map((row) => row.panel);
    const stalePanels = freshness
      .filter((row) => row.state === 'stale')
      .map((row) => row.panel);
    const cursorAge = ts - Number(this.cursor.generatedAtMs || 0);
    const cursorStale = !this.cursor.generatedAtMs || cursorAge > staleAfter;
    const degraded = desyncedPanels.length > 0;
    const stale = cursorStale || stalePanels.length > 0;
    let reason: string | null = null;
    if (desyncedPanels.length > 0) {
      reason = `desync:${desyncedPanels.join(',')}`;
    } else if (stalePanels.length > 0) {
      reason = `stale_panels:${stalePanels.join(',')}`;
    } else if (cursorStale) {
      reason = 'cursor_stale';
    }
    return {
      degraded,
      stale,
      desyncedPanels,
      reason,
      updatedAtMs: ts
    };
  }
}

let singleton: OutcomeConsistencyEngine | null = null;

export const getOutcomeConsistencyEngine = () => {
  if (!singleton) singleton = new OutcomeConsistencyEngine();
  return singleton;
};
