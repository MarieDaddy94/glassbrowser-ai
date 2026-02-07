export type CacheBudgetConfig = {
  name: string;
  maxEntries: number;
  maxAgeMs?: number;
};

export type CacheBudgetTelemetry = {
  name: string;
  size: number;
  entries: number;
  maxEntries: number;
  evictions: number;
  ttlExpired: number;
  ttlEvictions: number;
  hitRate: number;
};

type CacheState = {
  config: CacheBudgetConfig;
  touch: Map<string, number>;
  hits: number;
  misses: number;
  evictions: number;
  ttlExpired: number;
};

const normalizeMaxEntries = (value: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 500;
  return Math.max(10, Math.floor(num));
};

export class CacheBudgetManager {
  private readonly states = new Map<string, CacheState>();
  private readonly sizeOverrides = new Map<string, number>();

  register(config: CacheBudgetConfig) {
    const name = String(config.name || "").trim();
    if (!name) throw new Error("cacheBudgetManager: name is required");
    const next: CacheBudgetConfig = {
      ...config,
      maxEntries: normalizeMaxEntries(config.maxEntries),
      maxAgeMs: Number.isFinite(Number(config.maxAgeMs)) ? Math.max(500, Number(config.maxAgeMs)) : undefined
    };
    const current = this.states.get(name);
    if (current) {
      current.config = next;
      return;
    }
    this.states.set(name, {
      config: next,
      touch: new Map(),
      hits: 0,
      misses: 0,
      evictions: 0,
      ttlExpired: 0
    });
  }

  noteGet(name: string, key: string, hit: boolean) {
    const state = this.states.get(String(name || ""));
    if (!state) return;
    if (hit) {
      state.hits += 1;
      state.touch.set(String(key), Date.now());
    } else {
      state.misses += 1;
    }
  }

  noteSet(name: string, key: string) {
    const state = this.states.get(String(name || ""));
    if (!state) return;
    state.touch.set(String(key), Date.now());
  }

  setSize(name: string, size: number) {
    const state = this.states.get(String(name || ""));
    if (!state) return;
    const next = Number.isFinite(Number(size)) ? Math.max(0, Math.floor(Number(size))) : 0;
    this.sizeOverrides.set(String(name || ""), next);
  }

  noteEviction(name: string, count = 1, reason: "lru" | "ttl" = "lru") {
    const state = this.states.get(String(name || ""));
    if (!state) return;
    const amount = Number.isFinite(Number(count)) ? Math.max(1, Math.floor(Number(count))) : 1;
    if (reason === "ttl") {
      state.ttlExpired += amount;
    } else {
      state.evictions += amount;
    }
  }

  apply<T>(name: string, cache: Map<string, T>, getCreatedAtMs?: (value: T) => number | null) {
    const state = this.states.get(String(name || ""));
    if (!state) return;
    const now = Date.now();
    if (Number.isFinite(Number(state.config.maxAgeMs)) && state.config.maxAgeMs && getCreatedAtMs) {
      for (const [key, value] of cache.entries()) {
        const createdAtMs = Number(getCreatedAtMs(value));
        if (Number.isFinite(createdAtMs) && now - createdAtMs > Number(state.config.maxAgeMs)) {
          cache.delete(key);
          state.touch.delete(key);
          state.ttlExpired += 1;
        }
      }
    }
    if (cache.size <= state.config.maxEntries) return;
    const ordered = Array.from(state.touch.entries()).sort((a, b) => a[1] - b[1]);
    for (const [key] of ordered) {
      if (cache.size <= state.config.maxEntries) break;
      if (!cache.has(key)) continue;
      cache.delete(key);
      state.touch.delete(key);
      state.evictions += 1;
    }
  }

  getTelemetry(): CacheBudgetTelemetry[] {
    const out: CacheBudgetTelemetry[] = [];
    for (const [name, state] of this.states.entries()) {
      const requests = state.hits + state.misses;
      const hitRate = requests > 0 ? state.hits / requests : 0;
      const size = this.sizeOverrides.has(name)
        ? Number(this.sizeOverrides.get(name) || 0)
        : state.touch.size;
      out.push({
        name,
        size,
        entries: size,
        maxEntries: state.config.maxEntries,
        evictions: state.evictions,
        ttlExpired: state.ttlExpired,
        ttlEvictions: state.ttlExpired,
        hitRate
      });
    }
    return out;
  }
}

let singleton: CacheBudgetManager | null = null;

export const getCacheBudgetManager = () => {
  if (!singleton) singleton = new CacheBudgetManager();
  return singleton;
};
