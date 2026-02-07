import type { TradeLockerQuote } from '../types';
import type { ChartEngine, ChartQuote } from './chartEngine';
import { buildSymbolKeyVariants } from './symbols';
import { getCacheBudgetManager } from './cacheBudgetManager';

export type MarketDataQuote = TradeLockerQuote & {
  symbol: string;
  fetchedAtMs?: number | null;
  timestampMs?: number | null;
};

export type MarketDataHealth = {
  quotesUpdatedAtMs: number | null;
  streamStatus: string | null;
  streamUpdatedAtMs: number | null;
  lastQuoteAgeMs: number | null;
  quoteCount: number;
  cacheTelemetry?: {
    evictions: number;
    ttlExpired: number;
    hitRate: number;
    maxEntries: number;
  };
};

export type MarketDataService = {
  ingestQuote: (quote: MarketDataQuote) => void;
  getQuote: (symbol: string) => MarketDataQuote | null;
  fetchQuote: (symbol: string, opts?: { maxAgeMs?: number }) => Promise<{
    quote: MarketDataQuote | null;
    quoteAgeMs: number | null;
    fromCache: boolean;
    error?: string | null;
  }>;
  updateStreamHealth: (input: {
    streamStatus?: string | null;
    streamUpdatedAtMs?: number | null;
    quotesUpdatedAtMs?: number | null;
  }) => void;
  getHealth: () => MarketDataHealth;
};

const MAX_QUOTE_KEYS = 2000;
const QUOTE_TTL_MS = 10 * 60 * 1000;

type MarketDataOptions = {
  requestQuote: (symbol: string, opts?: { maxAgeMs?: number }) => Promise<any>;
  chartEngine?: ChartEngine | null;
  symbolVariants?: (symbol: string) => string[];
  nowMs?: () => number;
};

const toNumber = (value: any) => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const toChartQuote = (quote: MarketDataQuote): ChartQuote => ({
  symbol: quote.symbol,
  bid: toNumber(quote.bid),
  ask: toNumber(quote.ask),
  mid: toNumber(quote.mid),
  last: toNumber(quote.last),
  spread: toNumber(quote.spread),
  timestampMs: quote.timestampMs ?? null,
  fetchedAtMs: quote.fetchedAtMs ?? null
});

export const createMarketDataService = (options: MarketDataOptions): MarketDataService => {
  const now = options.nowMs || (() => Date.now());
  const variantsFor = options.symbolVariants || buildSymbolKeyVariants;
  const budgetManager = getCacheBudgetManager();
  budgetManager.register({
    name: 'marketData.quotes',
    maxEntries: MAX_QUOTE_KEYS,
    maxAgeMs: QUOTE_TTL_MS
  });
  const quotesByKey = new Map<string, MarketDataQuote>();
  const quoteLastAccess = new Map<string, number>();
  let quotesUpdatedAtMs: number | null = null;
  let streamStatus: string | null = null;
  let streamUpdatedAtMs: number | null = null;

  const pruneQuotes = () => {
    const nowMs = now();
    for (const [key, lastAccess] of quoteLastAccess.entries()) {
      if (nowMs - lastAccess > QUOTE_TTL_MS) {
        quoteLastAccess.delete(key);
        quotesByKey.delete(key);
      }
    }
    budgetManager.apply('marketData.quotes', quotesByKey, (entry) => Number(entry?.fetchedAtMs || entry?.timestampMs || 0) || null);
  };

  const ingestQuote = (raw: MarketDataQuote) => {
    if (!raw || typeof raw !== 'object') return;
    const symbol = String(raw.symbol || '').trim();
    if (!symbol) return;
    const ts = Number(raw.fetchedAtMs ?? raw.timestampMs ?? 0) || now();
    const quote: MarketDataQuote = {
      ...raw,
      symbol,
      fetchedAtMs: raw.fetchedAtMs ?? ts,
      timestampMs: raw.timestampMs ?? null
    };
    const keys = variantsFor(symbol).map((k) => String(k || '').toLowerCase()).filter(Boolean);
    for (const key of keys) {
      quotesByKey.set(key, quote);
      quoteLastAccess.set(key, ts);
      budgetManager.noteSet('marketData.quotes', key);
    }
    if (!quotesUpdatedAtMs || ts > quotesUpdatedAtMs) quotesUpdatedAtMs = ts;
    pruneQuotes();
    if (options.chartEngine) {
      options.chartEngine.ingestQuote(symbol, toChartQuote(quote));
    }
  };

  const getQuote = (symbol: string) => {
    const keys = variantsFor(symbol).map((k) => String(k || '').toLowerCase()).filter(Boolean);
    for (const key of keys) {
      const quote = quotesByKey.get(key);
      if (quote) {
        quoteLastAccess.set(key, now());
        budgetManager.noteGet('marketData.quotes', key, true);
        return quote;
      }
      budgetManager.noteGet('marketData.quotes', key, false);
    }
    return null;
  };

  const fetchQuote = async (symbol: string, opts?: { maxAgeMs?: number }) => {
    const maxAgeMs = Number.isFinite(Number(opts?.maxAgeMs)) ? Number(opts?.maxAgeMs) : 30_000;
    const cached = getQuote(symbol);
    const cachedTs = Number(cached?.fetchedAtMs ?? cached?.timestampMs ?? 0);
    const cachedAge = cachedTs > 0 ? now() - cachedTs : null;
    if (cached && cachedAge != null && cachedAge <= maxAgeMs) {
      return { quote: cached, quoteAgeMs: cachedAge, fromCache: true as const };
    }

    const res = await options.requestQuote(symbol, { maxAgeMs: 0 });
    const q = res?.quote || res?.result?.quote || null;
    if (res?.ok && q && typeof q === 'object') {
      const fetchedAtMs = Number(res?.fetchedAtMs ?? res?.timestampMs ?? q?.timestampMs ?? now());
      const quote: MarketDataQuote = {
        symbol: String(res?.symbol || symbol),
        tradableInstrumentId: Number.isFinite(Number(res?.tradableInstrumentId)) ? Number(res.tradableInstrumentId) : null,
        routeId: Number.isFinite(Number(res?.routeId)) ? Number(res.routeId) : null,
        bid: q.bid ?? null,
        ask: q.ask ?? null,
        last: q.last ?? null,
        mid: q.mid ?? null,
        bidSize: q.bidSize ?? null,
        askSize: q.askSize ?? null,
        spread: q.spread ?? null,
        timestampMs: q.timestampMs ?? null,
        fetchedAtMs
      };
      ingestQuote(quote);
      return { quote, quoteAgeMs: now() - fetchedAtMs, fromCache: false as const };
    }

    return {
      quote: null,
      quoteAgeMs: null,
      fromCache: false as const,
      error: res?.error ? String(res.error) : null
    };
  };

  const updateStreamHealth = (input: {
    streamStatus?: string | null;
    streamUpdatedAtMs?: number | null;
    quotesUpdatedAtMs?: number | null;
  }) => {
    if (input.streamStatus !== undefined) {
      streamStatus = input.streamStatus ? String(input.streamStatus) : null;
    }
    if (input.streamUpdatedAtMs != null && Number.isFinite(Number(input.streamUpdatedAtMs))) {
      streamUpdatedAtMs = Number(input.streamUpdatedAtMs);
    }
    if (input.quotesUpdatedAtMs != null && Number.isFinite(Number(input.quotesUpdatedAtMs))) {
      quotesUpdatedAtMs = Number(input.quotesUpdatedAtMs);
    }
  };

  const getHealth = () => {
    const lastQuoteAtMs = quotesUpdatedAtMs;
    const lastQuoteAgeMs = lastQuoteAtMs ? Math.max(0, now() - lastQuoteAtMs) : null;
    const telemetry = budgetManager.getTelemetry().find((entry) => entry.name === 'marketData.quotes');
    return {
      quotesUpdatedAtMs: lastQuoteAtMs ?? null,
      streamStatus,
      streamUpdatedAtMs,
      lastQuoteAgeMs,
      quoteCount: quotesByKey.size,
      cacheTelemetry: telemetry
        ? {
            evictions: telemetry.evictions,
            ttlExpired: telemetry.ttlExpired,
            hitRate: telemetry.hitRate,
            maxEntries: telemetry.maxEntries
          }
        : undefined
    };
  };

  return {
    ingestQuote,
    getQuote,
    fetchQuote,
    updateStreamHealth,
    getHealth
  };
};
