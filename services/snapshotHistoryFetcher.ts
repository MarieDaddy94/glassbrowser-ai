import { getHistorySharedCache, type HistorySharedCache } from './historySharedCache';
import { normalizeSymbolKey, normalizeTimeframeKey } from './symbols';

export type SnapshotHistoryRequest = {
  symbol: string;
  resolution: string;
  from: number;
  to: number;
  aggregate?: boolean;
  maxAgeMs?: number;
};

export type SnapshotHistoryFetcher = (args: SnapshotHistoryRequest) => Promise<any>;

type SnapshotHistoryFetcherOptions = {
  fetcher: SnapshotHistoryFetcher;
  cache?: HistorySharedCache;
  nowMs?: () => number;
  resolvePartition?: () => string | null | undefined;
};

type CachedHistoryEnvelope = {
  response: any;
  from: number;
  to: number;
};

const toFiniteNumber = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizePartition = (value: any) => {
  const raw = String(value || '').trim().toLowerCase();
  return raw || 'default';
};

const normalizeMaxAgeMs = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1_000, Math.min(120_000, Math.floor(n)));
};

const buildRangeKey = (args: SnapshotHistoryRequest, partition: string) => {
  const mode = args?.aggregate === false ? 'raw' : 'agg';
  return `${partition}|${mode}`;
};

const cacheCoversRequest = (
  cachedFrom: number,
  cachedTo: number,
  requestFrom: number,
  requestTo: number,
  maxAgeMs: number
) => {
  if (!Number.isFinite(cachedFrom) || !Number.isFinite(cachedTo)) return false;
  if (cachedFrom > requestFrom) return false;
  return cachedTo + Math.max(0, maxAgeMs) >= requestTo;
};

export const createSnapshotHistoryFetcher = (options: SnapshotHistoryFetcherOptions): SnapshotHistoryFetcher => {
  const fetcher = options.fetcher;
  const cache = options.cache || getHistorySharedCache();
  const nowMs = options.nowMs || (() => Date.now());

  return async (args: SnapshotHistoryRequest) => {
    const symbol = normalizeSymbolKey(args?.symbol || '');
    const timeframe = normalizeTimeframeKey(args?.resolution || '');
    const from = toFiniteNumber(args?.from, 0);
    const to = toFiniteNumber(args?.to, nowMs());
    const maxAgeMs = normalizeMaxAgeMs(args?.maxAgeMs);
    const partition = normalizePartition(options.resolvePartition ? options.resolvePartition() : null);
    const rangeKey = buildRangeKey(args, partition);

    if (symbol && timeframe && maxAgeMs > 0) {
      const cached = cache.get<CachedHistoryEnvelope>({ symbol, timeframe, rangeKey }, maxAgeMs);
      const cachedValue = cached?.value;
      if (
        cachedValue &&
        cachedValue.response &&
        cacheCoversRequest(
          toFiniteNumber(cachedValue.from, Number.POSITIVE_INFINITY),
          toFiniteNumber(cachedValue.to, Number.NEGATIVE_INFINITY),
          from,
          to,
          maxAgeMs
        )
      ) {
        const response = cachedValue.response;
        return {
          ...response,
          fetchedAtMs: toFiniteNumber(response?.fetchedAtMs, toFiniteNumber(cached?.fetchedAtMs, nowMs())),
          cacheHit: true
        };
      }
    }

    const res = await fetcher(args);
    if (symbol && timeframe && maxAgeMs > 0 && res?.ok && Array.isArray(res?.bars)) {
      const fetchedAtMs = toFiniteNumber(res?.fetchedAtMs, nowMs());
      cache.set(
        { symbol, timeframe, rangeKey },
        {
          value: {
            response: res,
            from,
            to
          },
          fetchedAtMs,
          bars: res.bars.length,
          source: 'broker'
        }
      );
    }
    return res;
  };
};

