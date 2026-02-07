import type { LivePolicySnapshot, PromotionDecision } from '../types';

type PromotionHistoryRecord = {
  fromChampionId: string | null;
  toChampionId: string | null;
  decision: PromotionDecision;
  action: 'promote' | 'demote' | 'rollback';
  atMs: number;
};

export class LivePolicyService {
  private snapshot: LivePolicySnapshot = {
    activeChampionId: null,
    previousChampionId: null,
    demotedAtMs: null,
    demotionReason: null,
    updatedAtMs: Date.now()
  };

  private readonly history: PromotionHistoryRecord[] = [];

  getSnapshot(): LivePolicySnapshot {
    return { ...this.snapshot };
  }

  getHistory(limit = 30): PromotionHistoryRecord[] {
    const max = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Math.floor(Number(limit)))) : 30;
    return this.history.slice(0, max).map((entry) => ({ ...entry, decision: { ...entry.decision, reasons: [...entry.decision.reasons] } }));
  }

  promote(input: { experimentId: string; decision: PromotionDecision }) {
    const experimentId = String(input.experimentId || '').trim();
    if (!experimentId || !input.decision?.pass) return this.getSnapshot();
    const prev = this.snapshot.activeChampionId || null;
    this.snapshot = {
      ...this.snapshot,
      previousChampionId: prev,
      activeChampionId: experimentId,
      demotedAtMs: null,
      demotionReason: null,
      updatedAtMs: Date.now()
    };
    this.history.unshift({
      fromChampionId: prev,
      toChampionId: experimentId,
      decision: input.decision,
      action: 'promote',
      atMs: Date.now()
    });
    this.pruneHistory();
    return this.getSnapshot();
  }

  demote(input: { reason: string; decision: PromotionDecision }) {
    const prev = this.snapshot.activeChampionId || null;
    if (!prev) return this.getSnapshot();
    const rollbackTarget = this.snapshot.previousChampionId || null;
    this.snapshot = {
      ...this.snapshot,
      activeChampionId: rollbackTarget,
      previousChampionId: prev,
      demotedAtMs: Date.now(),
      demotionReason: String(input.reason || 'policy'),
      updatedAtMs: Date.now()
    };
    this.history.unshift({
      fromChampionId: prev,
      toChampionId: rollbackTarget,
      decision: input.decision,
      action: rollbackTarget ? 'rollback' : 'demote',
      atMs: Date.now()
    });
    this.pruneHistory();
    return this.getSnapshot();
  }

  private pruneHistory() {
    if (this.history.length > 200) this.history.length = 200;
  }
}

let singleton: LivePolicyService | null = null;

export const getLivePolicyService = () => {
  if (!singleton) singleton = new LivePolicyService();
  return singleton;
};
