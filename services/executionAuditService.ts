type ExecutionAuditRecord = {
  signalId: string | null;
  dedupeKey: string;
  ledgerId: string | null;
  submittedAt: number | null;
  ackAt: number | null;
  brokerOrderId: string | null;
  retryCount: number;
  broker: string | null;
  source: string | null;
  mismatches: string[];
  updatedAtMs: number;
};

export type ExecutionAuditSnapshot = {
  updatedAtMs: number;
  records: ExecutionAuditRecord[];
  mismatches: Array<{
    dedupeKey: string;
    signalId: string | null;
    reasons: string[];
  }>;
};

type SubmittedInput = {
  signalId?: string | null;
  dedupeKey: string;
  ledgerId?: string | null;
  submittedAt?: number | null;
  retryCount?: number | null;
  broker?: string | null;
  source?: string | null;
};

type AckInput = {
  signalId?: string | null;
  dedupeKey: string;
  ackAt?: number | null;
  brokerOrderId?: string | null;
  retryCount?: number | null;
  broker?: string | null;
};

const MAX_RECORDS = 800;

const toTs = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
};

const toId = (value: any) => {
  const raw = String(value || '').trim();
  return raw ? raw : null;
};

const toRetry = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
};

export class ExecutionAuditService {
  private readonly records = new Map<string, ExecutionAuditRecord>();
  private readonly brokerOrderIdsBySignal = new Map<string, Set<string>>();
  private updatedAtMs = Date.now();

  noteSubmitted(input: SubmittedInput) {
    const dedupeKey = String(input?.dedupeKey || '').trim();
    if (!dedupeKey) return;
    const now = Date.now();
    const existing = this.records.get(dedupeKey);
    const next: ExecutionAuditRecord = existing || {
      signalId: null,
      dedupeKey,
      ledgerId: null,
      submittedAt: null,
      ackAt: null,
      brokerOrderId: null,
      retryCount: 0,
      broker: null,
      source: null,
      mismatches: [],
      updatedAtMs: now
    };
    next.signalId = toId(input?.signalId) || next.signalId;
    next.ledgerId = toId(input?.ledgerId) || next.ledgerId;
    next.submittedAt = toTs(input?.submittedAt) || now;
    next.retryCount = Math.max(next.retryCount, toRetry(input?.retryCount));
    next.broker = toId(input?.broker) || next.broker;
    next.source = toId(input?.source) || next.source;
    next.updatedAtMs = now;
    this.records.set(dedupeKey, next);
    this.recomputeMismatches(next);
    this.prune();
  }

  noteAck(input: AckInput) {
    const dedupeKey = String(input?.dedupeKey || '').trim();
    if (!dedupeKey) return;
    const now = Date.now();
    const existing = this.records.get(dedupeKey);
    const next: ExecutionAuditRecord = existing || {
      signalId: null,
      dedupeKey,
      ledgerId: null,
      submittedAt: null,
      ackAt: null,
      brokerOrderId: null,
      retryCount: 0,
      broker: null,
      source: null,
      mismatches: [],
      updatedAtMs: now
    };
    next.signalId = toId(input?.signalId) || next.signalId;
    next.ackAt = toTs(input?.ackAt) || now;
    const orderId = toId(input?.brokerOrderId);
    if (orderId) next.brokerOrderId = orderId;
    next.retryCount = Math.max(next.retryCount, toRetry(input?.retryCount));
    next.broker = toId(input?.broker) || next.broker;
    next.updatedAtMs = now;
    this.records.set(dedupeKey, next);

    if (next.signalId && next.brokerOrderId) {
      const bucket = this.brokerOrderIdsBySignal.get(next.signalId) || new Set<string>();
      bucket.add(next.brokerOrderId);
      this.brokerOrderIdsBySignal.set(next.signalId, bucket);
    }

    this.recomputeMismatches(next);
    this.prune();
  }

  getSnapshot(): ExecutionAuditSnapshot {
    const records = Array.from(this.records.values())
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .map((entry) => ({ ...entry, mismatches: [...entry.mismatches] }));
    const mismatches = records
      .filter((entry) => entry.mismatches.length > 0)
      .map((entry) => ({
        dedupeKey: entry.dedupeKey,
        signalId: entry.signalId,
        reasons: [...entry.mismatches]
      }));
    return {
      updatedAtMs: this.updatedAtMs,
      records,
      mismatches
    };
  }

  private recomputeMismatches(record: ExecutionAuditRecord) {
    const reasons: string[] = [];
    if (!record.signalId) reasons.push('missing_signal_id');
    if (record.ackAt != null && record.submittedAt != null && record.ackAt < record.submittedAt) {
      reasons.push('ack_before_submit');
    }
    const broker = String(record.broker || '').toLowerCase();
    const requiresOrderId = broker === 'tradelocker' || broker === 'mt5' || broker === '';
    if (requiresOrderId && record.ackAt != null && !record.brokerOrderId) {
      reasons.push('missing_broker_order_id');
    }
    if (record.signalId) {
      const known = this.brokerOrderIdsBySignal.get(record.signalId);
      if (known && known.size > 1) {
        reasons.push('multiple_order_ids_for_signal');
      }
    }
    record.mismatches = reasons;
    this.updatedAtMs = Date.now();
  }

  private prune() {
    if (this.records.size <= MAX_RECORDS) return;
    const list = Array.from(this.records.values()).sort((a, b) => a.updatedAtMs - b.updatedAtMs);
    const over = this.records.size - MAX_RECORDS;
    for (let i = 0; i < over; i += 1) {
      const key = list[i]?.dedupeKey;
      if (!key) continue;
      this.records.delete(key);
    }
  }
}

let singleton: ExecutionAuditService | null = null;

export const getExecutionAuditService = () => {
  if (!singleton) singleton = new ExecutionAuditService();
  return singleton;
};
