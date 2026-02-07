export type BrokerCircuitKey = {
  method: string;
  source: string;
};

export type BrokerCircuitDecision = {
  blocked: boolean;
  retryAfterMs: number;
  reason: string | null;
};

export type BrokerCircuitEntrySnapshot = {
  method: string;
  source: string;
  state: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  open: boolean;
  failureCount: number;
  consecutiveFailures: number;
  successCount: number;
  openedAtMs: number | null;
  openUntilMs: number | null;
  lastFailureAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastError: string | null;
};

export type BrokerCircuitSnapshot = {
  updatedAtMs: number;
  entries: BrokerCircuitEntrySnapshot[];
};

export type BrokerCircuitSourceSnapshot = {
  source: string;
  state: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  failureCount: number;
  openedAtMs: number | null;
  retryAfterMs: number;
  lastError: string | null;
};

type BrokerCircuitEntry = BrokerCircuitEntrySnapshot;

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_BACKOFF_MS = 8_000;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 12_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const FAILURE_WINDOW_MS = 90_000;

const toKeyPart = (value: any) => String(value || '').trim().toLowerCase() || 'unknown';
const toKey = (input: BrokerCircuitKey) => `${toKeyPart(input.method)}|${toKeyPart(input.source)}`;

const clampBackoff = (value: number, fallback = DEFAULT_BACKOFF_MS) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(DEFAULT_MAX_BACKOFF_MS, Math.max(1_000, Math.floor(num)));
};

const parseRetryAfterMs = (error: string | null) => {
  if (!error) return null;
  const message = String(error);
  const retryIn = message.match(/retry\s+in\s+(\d+)\s*s/i);
  if (retryIn && Number.isFinite(Number(retryIn[1]))) {
    return Math.max(1_000, Number(retryIn[1]) * 1000);
  }
  const retryAfter = message.match(/retry[-_\s]?after[:\s]+(\d+)\s*(ms|s|sec|seconds)?/i);
  if (retryAfter && Number.isFinite(Number(retryAfter[1]))) {
    const unit = String(retryAfter[2] || 'ms').toLowerCase();
    const base = Number(retryAfter[1]);
    if (unit.startsWith('s')) return Math.max(1_000, base * 1000);
    return Math.max(1_000, base);
  }
  return null;
};

const isRateLimitedError = (error: string | null) => /429|rate limit|too many requests/i.test(String(error || ''));

export class BrokerCircuitBreaker {
  private readonly entries = new Map<string, BrokerCircuitEntry>();
  private readonly failureThreshold = DEFAULT_FAILURE_THRESHOLD;

  shouldBlock(input: BrokerCircuitKey, now = Date.now()): BrokerCircuitDecision {
    const key = toKey(input);
    const entry = this.entries.get(key);
    if (!entry) return { blocked: false, retryAfterMs: 0, reason: null };
    if (entry.state !== 'OPEN' || !entry.openUntilMs || entry.openUntilMs <= now) {
      if (entry.state === 'OPEN' && entry.openUntilMs && entry.openUntilMs <= now) {
        entry.open = false;
        entry.state = 'HALF_OPEN';
        entry.openUntilMs = null;
      }
      return { blocked: false, retryAfterMs: 0, reason: null };
    }
    return {
      blocked: true,
      retryAfterMs: Math.max(0, entry.openUntilMs - now),
      reason: entry.lastError || 'Broker circuit is cooling down.'
    };
  }

  noteSuccess(input: BrokerCircuitKey, now = Date.now()) {
    const key = toKey(input);
    const entry = this.entries.get(key) || this.createEntry(input);
    entry.successCount += 1;
    entry.lastSuccessAtMs = now;
    entry.consecutiveFailures = 0;
    if (entry.open || entry.state !== 'CLOSED') {
      entry.open = false;
      entry.state = 'CLOSED';
      entry.openedAtMs = null;
      entry.openUntilMs = null;
    }
    this.entries.set(key, entry);
  }

  noteFailure(
    input: BrokerCircuitKey,
    failure: { error?: string | null; rateLimited?: boolean; retryAfterMs?: number | null },
    now = Date.now()
  ) {
    const key = toKey(input);
    const entry = this.entries.get(key) || this.createEntry(input);
    const stale = entry.lastFailureAtMs != null && now - entry.lastFailureAtMs > FAILURE_WINDOW_MS;
    entry.failureCount = stale ? 1 : entry.failureCount + 1;
    entry.consecutiveFailures = entry.state === 'HALF_OPEN' ? this.failureThreshold : (stale ? 1 : entry.consecutiveFailures + 1);
    entry.lastFailureAtMs = now;
    entry.lastError = failure?.error ? String(failure.error) : null;

    const explicitRetry = Number.isFinite(Number(failure?.retryAfterMs)) && Number(failure?.retryAfterMs) > 0
      ? clampBackoff(Number(failure?.retryAfterMs), 0)
      : 0;
    const parsedRetry = parseRetryAfterMs(entry.lastError);
    const rateLimited = failure?.rateLimited === true || isRateLimitedError(entry.lastError);
    const shouldOpen = rateLimited || entry.consecutiveFailures >= this.failureThreshold;
    if (shouldOpen) {
      const exponential = DEFAULT_BACKOFF_MS * Math.max(1, Math.pow(2, Math.max(0, entry.consecutiveFailures - this.failureThreshold)));
      const backoff = Math.max(
        rateLimited ? DEFAULT_RATE_LIMIT_BACKOFF_MS : DEFAULT_BACKOFF_MS,
        explicitRetry,
        parsedRetry || 0,
        exponential
      );
      entry.open = true;
      entry.state = 'OPEN';
      entry.openedAtMs = entry.openedAtMs || now;
      entry.openUntilMs = now + clampBackoff(backoff, DEFAULT_BACKOFF_MS);
    } else {
      if (!entry.open) entry.state = entry.consecutiveFailures > 0 ? 'HALF_OPEN' : 'CLOSED';
    }
    this.entries.set(key, entry);
  }

  getSnapshot(now = Date.now()): BrokerCircuitSnapshot {
    const entries: BrokerCircuitEntrySnapshot[] = [];
    for (const entry of this.entries.values()) {
      const open = !!(entry.open && entry.openUntilMs && entry.openUntilMs > now);
      const state = open
        ? 'OPEN'
        : (entry.state === 'HALF_OPEN' ? 'HALF_OPEN' : 'CLOSED');
      const normalized: BrokerCircuitEntrySnapshot = {
        ...entry,
        state,
        open
      };
      entries.push(normalized);
    }
    return {
      updatedAtMs: now,
      entries
    };
  }

  getSourceSnapshot(now = Date.now()): BrokerCircuitSourceSnapshot[] {
    const bySource = new Map<string, BrokerCircuitSourceSnapshot>();
    const snapshot = this.getSnapshot(now);
    for (const entry of snapshot.entries) {
      const key = entry.source || 'unknown';
      const retryAfterMs = entry.open && entry.openUntilMs ? Math.max(0, entry.openUntilMs - now) : 0;
      const existing = bySource.get(key);
      const severityRank = (state: BrokerCircuitSourceSnapshot['state']) => {
        if (state === 'OPEN') return 3;
        if (state === 'HALF_OPEN') return 2;
        return 1;
      };
      if (!existing) {
        bySource.set(key, {
          source: key,
          state: entry.state,
          failureCount: entry.failureCount,
          openedAtMs: entry.openedAtMs ?? null,
          retryAfterMs,
          lastError: entry.lastError || null
        });
        continue;
      }
      if (severityRank(entry.state) > severityRank(existing.state)) {
        existing.state = entry.state;
      }
      existing.failureCount = Math.max(existing.failureCount, entry.failureCount);
      existing.openedAtMs = Math.max(Number(existing.openedAtMs || 0), Number(entry.openedAtMs || 0)) || existing.openedAtMs;
      existing.retryAfterMs = Math.max(existing.retryAfterMs, retryAfterMs);
      if (!existing.lastError && entry.lastError) existing.lastError = entry.lastError;
    }
    return Array.from(bySource.values()).sort((a, b) => {
      const rank = (state: BrokerCircuitSourceSnapshot['state']) => state === 'OPEN' ? 3 : state === 'HALF_OPEN' ? 2 : 1;
      const diff = rank(b.state) - rank(a.state);
      if (diff !== 0) return diff;
      return a.source.localeCompare(b.source);
    });
  }

  private createEntry(input: BrokerCircuitKey): BrokerCircuitEntry {
    return {
      method: toKeyPart(input.method),
      source: toKeyPart(input.source),
      state: 'CLOSED',
      open: false,
      failureCount: 0,
      consecutiveFailures: 0,
      successCount: 0,
      openedAtMs: null,
      openUntilMs: null,
      lastFailureAtMs: null,
      lastSuccessAtMs: null,
      lastError: null
    };
  }
}

let singleton: BrokerCircuitBreaker | null = null;

export const getBrokerCircuitBreaker = () => {
  if (!singleton) singleton = new BrokerCircuitBreaker();
  return singleton;
};
