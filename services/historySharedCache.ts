import { getCacheBudgetManager } from "./cacheBudgetManager";

type HistoryCacheEntry<T = any> = {
  value: T;
  fetchedAtMs: number;
  bars: number;
  source: "cache" | "broker" | "mixed";
};

type HistoryCacheKeyInput = {
  symbol: string;
  timeframe: string;
  rangeKey?: string | null;
};

const MAX_HISTORY_CACHE_ENTRIES = 1200;
const HISTORY_TTL_MS = 20 * 60 * 1000;
const HISTORY_CACHE_BUDGET_NAME = "snapshot.historySharedCache";
const cacheBudgetManager = getCacheBudgetManager();
cacheBudgetManager.register({
  name: HISTORY_CACHE_BUDGET_NAME,
  maxEntries: MAX_HISTORY_CACHE_ENTRIES,
  maxAgeMs: HISTORY_TTL_MS
});

const buildKey = (input: HistoryCacheKeyInput) => {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const timeframe = String(input.timeframe || "").trim().toLowerCase();
  const range = String(input.rangeKey || "").trim().toLowerCase();
  return `${symbol}|${timeframe}|${range}`;
};

export class HistorySharedCache {
  private readonly entries = new Map<string, HistoryCacheEntry>();
  private readonly touch = new Map<string, number>();
  private syncSize() {
    cacheBudgetManager.setSize(HISTORY_CACHE_BUDGET_NAME, this.entries.size);
  }

  get<T = any>(input: HistoryCacheKeyInput, maxAgeMs = HISTORY_TTL_MS): HistoryCacheEntry<T> | null {
    const key = buildKey(input);
    const entry = this.entries.get(key);
    if (!entry) {
      cacheBudgetManager.noteGet(HISTORY_CACHE_BUDGET_NAME, key, false);
      this.syncSize();
      return null;
    }
    const ageMs = Date.now() - Number(entry.fetchedAtMs || 0);
    if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
      this.entries.delete(key);
      this.touch.delete(key);
      cacheBudgetManager.noteGet(HISTORY_CACHE_BUDGET_NAME, key, false);
      cacheBudgetManager.noteEviction(HISTORY_CACHE_BUDGET_NAME, 1, "ttl");
      this.syncSize();
      return null;
    }
    this.touch.set(key, Date.now());
    cacheBudgetManager.noteGet(HISTORY_CACHE_BUDGET_NAME, key, true);
    this.syncSize();
    return entry as HistoryCacheEntry<T>;
  }

  set<T = any>(input: HistoryCacheKeyInput, entry: HistoryCacheEntry<T>) {
    const key = buildKey(input);
    this.entries.set(key, {
      ...entry,
      fetchedAtMs: Number(entry.fetchedAtMs || Date.now()),
      bars: Math.max(0, Math.floor(Number(entry.bars || 0))),
      source: entry.source || "broker"
    });
    this.touch.set(key, Date.now());
    cacheBudgetManager.noteSet(HISTORY_CACHE_BUDGET_NAME, key);
    this.prune();
    this.syncSize();
  }

  clearExpired(maxAgeMs = HISTORY_TTL_MS) {
    const now = Date.now();
    let evicted = 0;
    for (const [key, value] of this.entries.entries()) {
      const ageMs = now - Number(value.fetchedAtMs || 0);
      if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
        this.entries.delete(key);
        this.touch.delete(key);
        evicted += 1;
      }
    }
    if (evicted > 0) {
      cacheBudgetManager.noteEviction(HISTORY_CACHE_BUDGET_NAME, evicted, "ttl");
      this.syncSize();
    }
  }

  stats() {
    return {
      size: this.entries.size,
      max: MAX_HISTORY_CACHE_ENTRIES
    };
  }

  private prune() {
    this.clearExpired();
    if (this.entries.size <= MAX_HISTORY_CACHE_ENTRIES) return;
    const order = Array.from(this.touch.entries()).sort((a, b) => a[1] - b[1]);
    let evicted = 0;
    for (const [key] of order) {
      if (this.entries.size <= MAX_HISTORY_CACHE_ENTRIES) break;
      this.entries.delete(key);
      this.touch.delete(key);
      evicted += 1;
    }
    if (evicted > 0) {
      cacheBudgetManager.noteEviction(HISTORY_CACHE_BUDGET_NAME, evicted, "lru");
    }
    this.syncSize();
  }
}

let singleton: HistorySharedCache | null = null;

export const getHistorySharedCache = () => {
  if (!singleton) singleton = new HistorySharedCache();
  return singleton;
};
