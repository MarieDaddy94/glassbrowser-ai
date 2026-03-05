import type { TradeLockerMarketSubscriptionState, TradeLockerQuote } from '../types';
import { getRuntimeScheduler } from './runtimeScheduler';
import { normalizeSymbolKey } from './symbols';

type QuoteFetchResult = {
  ok: boolean;
  quotes: TradeLockerQuote[];
  error?: string | null;
};

type Subscription = {
  consumerId: string;
  symbols: Set<string>;
  timeframes: Set<string>;
  onQuote?: (quote: TradeLockerQuote) => void;
};

export type TradeLockerMarketBusOptions = {
  schedulerIntervalMs?: number;
  fetchQuotes: (input: { symbols: string[]; maxAgeMs?: number }) => Promise<QuoteFetchResult>;
};

const normText = (value: unknown) => String(value || '').trim();

const normSymbols = (symbols: unknown): string[] => {
  if (!Array.isArray(symbols)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const symbol = normText(raw).toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out;
};

const shouldUpdateQuote = (prev: TradeLockerQuote | null | undefined, next: TradeLockerQuote): boolean => {
  if (!prev) return true;
  const keys: Array<keyof TradeLockerQuote> = [
    'bid',
    'ask',
    'last',
    'mid',
    'spread',
    'bidSize',
    'askSize',
    'timestampMs',
    'fetchedAtMs'
  ];
  for (const key of keys) {
    if ((prev as any)[key] !== (next as any)[key]) return true;
  }
  return false;
};

export const createTradeLockerMarketBus = (opts: TradeLockerMarketBusOptions) => {
  const scheduler = getRuntimeScheduler();
  const intervalMs = Math.max(500, Math.round(Number(opts.schedulerIntervalMs || 1500) || 1500));

  const subscriptions = new Map<string, Subscription>();
  const symbolsToSubscribers = new Map<string, Set<string>>();
  const lastQuotes = new Map<string, TradeLockerQuote>();
  const lastQuoteAt = new Map<string, number>();

  const telemetry = {
    fetchRuns: 0,
    fetchErrors: 0,
    fanoutEvents: 0,
    dedupedQuotes: 0,
    lastFetchAtMs: 0,
    lastFetchError: null as string | null
  };

  let started = false;
  let disposeTask: (() => void) | null = null;
  let inFlight = false;

  const rebuildIndex = () => {
    symbolsToSubscribers.clear();
    for (const sub of subscriptions.values()) {
      for (const symbol of sub.symbols.values()) {
        const bucket = symbolsToSubscribers.get(symbol) || new Set<string>();
        bucket.add(sub.consumerId);
        symbolsToSubscribers.set(symbol, bucket);
      }
    }
  };

  const fetchOnce = async () => {
    if (inFlight) return;
    if (symbolsToSubscribers.size === 0) return;
    inFlight = true;
    telemetry.fetchRuns += 1;
    telemetry.lastFetchAtMs = Date.now();
    try {
      const symbols = Array.from(symbolsToSubscribers.keys());
      const res = await opts.fetchQuotes({ symbols, maxAgeMs: 2_000 });
      if (!res?.ok) {
        telemetry.fetchErrors += 1;
        telemetry.lastFetchError = res?.error ? String(res.error) : 'market_bus_fetch_failed';
        return;
      }
      telemetry.lastFetchError = null;
      const quotes = Array.isArray(res?.quotes) ? res.quotes : [];
      for (const quote of quotes) {
        const symbolRaw = normText(quote?.symbol).toUpperCase();
        if (!symbolRaw) continue;
        const symbolKey = normalizeSymbolKey(symbolRaw) || symbolRaw;
        const prev = lastQuotes.get(symbolKey);
        if (!shouldUpdateQuote(prev, quote)) {
          telemetry.dedupedQuotes += 1;
          continue;
        }
        lastQuotes.set(symbolKey, { ...quote, symbol: symbolRaw });
        lastQuoteAt.set(symbolKey, Date.now());
        const consumers = symbolsToSubscribers.get(symbolRaw) || symbolsToSubscribers.get(symbolKey) || new Set<string>();
        for (const consumerId of consumers.values()) {
          const sub = subscriptions.get(consumerId);
          if (!sub?.onQuote) continue;
          telemetry.fanoutEvents += 1;
          try {
            sub.onQuote({ ...quote, symbol: symbolRaw });
          } catch {
            // ignore consumer handler failures
          }
        }
      }
    } finally {
      inFlight = false;
    }
  };

  const start = () => {
    if (started) return;
    started = true;
    disposeTask = scheduler.registerTask({
      id: 'tradelocker.marketbus.poll',
      groupId: 'broker',
      intervalMs,
      jitterPct: 0.1,
      visibilityMode: 'foreground',
      priority: 'high',
      run: async () => {
        await fetchOnce();
      }
    });
  };

  const stop = () => {
    started = false;
    try {
      disposeTask?.();
    } catch {
      // ignore dispose errors
    }
    disposeTask = null;
  };

  const setSubscription = (input: {
    consumerId: string;
    symbols: string[];
    timeframes?: string[];
    onQuote?: (quote: TradeLockerQuote) => void;
  }) => {
    const consumerId = normText(input.consumerId);
    if (!consumerId) return { ok: false as const, error: 'consumer_id_required' };
    const symbols = normSymbols(input.symbols);
    const timeframes = new Set<string>((Array.isArray(input.timeframes) ? input.timeframes : []).map((entry) => normText(entry)).filter(Boolean));
    if (symbols.length === 0) {
      subscriptions.delete(consumerId);
      rebuildIndex();
      return { ok: true as const, removed: true };
    }
    subscriptions.set(consumerId, {
      consumerId,
      symbols: new Set<string>(symbols),
      timeframes,
      onQuote: input.onQuote
    });
    rebuildIndex();
    start();
    return { ok: true as const, removed: false };
  };

  const removeSubscription = (consumerIdRaw: unknown) => {
    const consumerId = normText(consumerIdRaw);
    if (!consumerId) return false;
    const removed = subscriptions.delete(consumerId);
    rebuildIndex();
    return removed;
  };

  const getSubscriptionSnapshot = (): TradeLockerMarketSubscriptionState[] =>
    Array.from(symbolsToSubscribers.entries())
      .map(([symbol, subs]) => ({
        symbol,
        subscriberCount: subs.size,
        subscribers: Array.from(subs.values()).sort(),
        lastQuoteAtMs: lastQuoteAt.get(normalizeSymbolKey(symbol) || symbol) ?? null
      }))
      .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));

  const getTelemetry = () => ({
    ...telemetry,
    activeConsumers: subscriptions.size,
    activeSymbols: symbolsToSubscribers.size
  });

  return {
    start,
    stop,
    trigger: fetchOnce,
    setSubscription,
    removeSubscription,
    getSubscriptionSnapshot,
    getTelemetry
  };
};

export type TradeLockerMarketBus = ReturnType<typeof createTradeLockerMarketBus>;
