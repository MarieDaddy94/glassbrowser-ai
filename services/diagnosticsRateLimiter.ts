export type DiagnosticsRateClass = "critical" | "error" | "warn" | "info";

export type DiagnosticsEvent = {
  source: string;
  message: string;
  detailKey?: string | null;
  level?: DiagnosticsRateClass;
  atMs?: number;
};

export type DiagnosticsAggregation = {
  key: string;
  source: string;
  message: string;
  level: DiagnosticsRateClass;
  count: number;
  windowMs: number;
  firstAtMs: number;
  lastAtMs: number;
};

const WINDOW_BY_LEVEL: Record<DiagnosticsRateClass, number> = {
  critical: 0,
  error: 5_000,
  warn: 30_000,
  info: 120_000
};

type Bucket = {
  firstAtMs: number;
  lastAtMs: number;
  count: number;
  source: string;
  message: string;
  level: DiagnosticsRateClass;
  windowMs: number;
};

const toKey = (evt: DiagnosticsEvent, level: DiagnosticsRateClass) => {
  const src = String(evt.source || "unknown").trim().toLowerCase();
  const msg = String(evt.message || "").trim().toLowerCase();
  const detail = String(evt.detailKey || "").trim().toLowerCase();
  return `${level}|${src}|${msg}|${detail}`;
};

export class DiagnosticsRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly aggregated: DiagnosticsAggregation[] = [];

  shouldEmit(evt: DiagnosticsEvent) {
    const level = (evt.level || "warn") as DiagnosticsRateClass;
    const windowMs = WINDOW_BY_LEVEL[level] ?? 30_000;
    if (windowMs <= 0) return true;
    const now = Number(evt.atMs || Date.now());
    const key = toKey(evt, level);
    const bucket = this.buckets.get(key);
    if (!bucket) {
      this.buckets.set(key, {
        firstAtMs: now,
        lastAtMs: now,
        count: 1,
        source: evt.source,
        message: evt.message,
        level,
        windowMs
      });
      return true;
    }
    bucket.lastAtMs = now;
    bucket.count += 1;
    if (now - bucket.firstAtMs <= windowMs) {
      return false;
    }
    this.flushBucket(key, bucket);
    this.buckets.set(key, {
      firstAtMs: now,
      lastAtMs: now,
      count: 1,
      source: evt.source,
      message: evt.message,
      level,
      windowMs
    });
    return true;
  }

  flush(now = Date.now()) {
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.firstAtMs >= bucket.windowMs) {
        this.flushBucket(key, bucket);
        this.buckets.delete(key);
      }
    }
  }

  drainAggregated() {
    this.flush();
    const list = this.aggregated.slice();
    this.aggregated.length = 0;
    return list;
  }

  getStats() {
    return {
      activeBuckets: this.buckets.size,
      aggregatedPending: this.aggregated.length
    };
  }

  private flushBucket(key: string, bucket: Bucket) {
    if (bucket.count <= 1) return;
    this.aggregated.push({
      key,
      source: bucket.source,
      message: bucket.message,
      level: bucket.level,
      count: bucket.count,
      windowMs: bucket.windowMs,
      firstAtMs: bucket.firstAtMs,
      lastAtMs: bucket.lastAtMs
    });
  }
}

let singleton: DiagnosticsRateLimiter | null = null;

export const getDiagnosticsRateLimiter = () => {
  if (!singleton) singleton = new DiagnosticsRateLimiter();
  return singleton;
};

