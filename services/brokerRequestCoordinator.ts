type RequestPriority = "critical" | "interactive" | "background";
type RequestSource = "scan" | "warmup" | "execution" | "calendar" | "manual" | "other";

export type BrokerRequestContext = {
  method: string;
  symbol?: string | null;
  timeframe?: string | null;
  maxAgeMs?: number | null;
  argsHash?: string | null;
  source?: RequestSource;
  priority?: RequestPriority;
};

export type BrokerRequestResult<T> = {
  value: T;
  fromCache: boolean;
  deduped: boolean;
};

type InFlightEntry = {
  promise: Promise<any>;
  startedAtMs: number;
};

type CacheEntry = {
  value: any;
  expiresAtMs: number;
  createdAtMs: number;
};

const PRIORITY_DELAY_MS: Record<RequestPriority, number> = {
  critical: 0,
  interactive: 10,
  background: 50
};

const DEFAULT_MAX_ENTRIES = 3000;
const DEFAULT_TTL_MS = 10_000;

const keyPart = (value: any) => String(value ?? "").trim().toLowerCase();

const buildKey = (ctx: BrokerRequestContext) => {
  const bucket = Number.isFinite(Number(ctx.maxAgeMs)) && Number(ctx.maxAgeMs) > 0
    ? Math.floor(Number(ctx.maxAgeMs) / 1000)
    : 0;
  return [
    keyPart(ctx.method),
    keyPart(ctx.symbol),
    keyPart(ctx.timeframe),
    String(bucket),
    keyPart(ctx.argsHash)
  ].join("|");
};

export class BrokerRequestCoordinator {
  private readonly inFlight = new Map<string, InFlightEntry>();
  private readonly cache = new Map<string, CacheEntry>();
  private maxEntries = DEFAULT_MAX_ENTRIES;

  configure(opts?: { maxEntries?: number }) {
    const next = Number(opts?.maxEntries);
    if (Number.isFinite(next) && next > 50) {
      this.maxEntries = Math.floor(next);
      this.prune();
    }
  }

  async run<T>(ctx: BrokerRequestContext, fn: () => Promise<T>): Promise<BrokerRequestResult<T>> {
    const key = buildKey(ctx);
    const now = Date.now();
    const ttlMs = Number.isFinite(Number(ctx.maxAgeMs)) && Number(ctx.maxAgeMs) > 0
      ? Number(ctx.maxAgeMs)
      : DEFAULT_TTL_MS;

    const cached = this.cache.get(key);
    if (cached && cached.expiresAtMs > now) {
      return {
        value: cached.value as T,
        fromCache: true,
        deduped: false
      };
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      const value = await existing.promise;
      return {
        value: value as T,
        fromCache: false,
        deduped: true
      };
    }

    const priority = ctx.priority || "interactive";
    const delayMs = PRIORITY_DELAY_MS[priority] ?? 10;
    const promise = (async () => {
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
      const value = await fn();
      this.cache.set(key, {
        value,
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + ttlMs
      });
      this.prune();
      return value;
    })();

    this.inFlight.set(key, {
      promise,
      startedAtMs: now
    });

    try {
      const value = await promise;
      return {
        value,
        fromCache: false,
        deduped: false
      };
    } finally {
      const active = this.inFlight.get(key);
      if (active?.promise === promise) {
        this.inFlight.delete(key);
      }
    }
  }

  clearExpired(now = Date.now()) {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAtMs <= now) this.cache.delete(key);
    }
  }

  getStats() {
    return {
      inFlight: this.inFlight.size,
      cacheEntries: this.cache.size,
      maxEntries: this.maxEntries
    };
  }

  private prune() {
    this.clearExpired();
    if (this.cache.size <= this.maxEntries) return;
    const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].createdAtMs - b[1].createdAtMs);
    for (const [key] of entries) {
      if (this.cache.size <= this.maxEntries) break;
      this.cache.delete(key);
    }
  }
}

let singleton: BrokerRequestCoordinator | null = null;

export const getBrokerRequestCoordinator = () => {
  if (!singleton) singleton = new BrokerRequestCoordinator();
  return singleton;
};

