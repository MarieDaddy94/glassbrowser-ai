import { BrokerAdapter, TradeIntent } from "./brokerRouter";
import { BrokerAccountSpec, BrokerId, BrokerQuote } from "./brokerLink";
import { fetchMt5, fetchMt5AccountSpec, fetchMt5Quote, resolveMt5SymbolBestEffort } from "./mt5Client";

type TradeLockerApi = {
  placeOrder?: (payload: any) => Promise<any>;
  getAccountMetrics?: () => Promise<any>;
  getQuotes?: (payload: any) => Promise<any>;
  searchInstruments?: (payload: any) => Promise<any>;
};

const formatMt5OrderError = (res: { data?: any; error?: string }, fallback: string) => {
  const data = res?.data || {};
  const base = data?.error || res?.error || fallback;
  const result = data?.result || {};
  const retcode = result?.retcode;
  const comment = result?.comment ? String(result.comment) : "";
  const lastError = data?.last_error;
  const lastErrorText = (() => {
    if (!lastError) return "";
    if (typeof lastError === "string") return lastError;
    if (typeof lastError === "object") {
      const code = lastError.code != null ? String(lastError.code) : "";
      const message = lastError.message != null ? String(lastError.message) : "";
      if (code && message) return `code ${code}: ${message}`;
      return code || message;
    }
    return String(lastError);
  })();
  const parts = [base];
  if (retcode != null) parts.push(`retcode ${retcode}`);
  if (comment) parts.push(`comment ${comment}`);
  if (lastErrorText) parts.push(`mt5 ${lastErrorText}`);
  return parts.filter(Boolean).join(" | ");
};

const formatTradeLockerSpec = async (api?: TradeLockerApi | null): Promise<BrokerAccountSpec | null> => {
  if (!api?.getAccountMetrics) return null;
  try {
    const res = await api.getAccountMetrics();
    if (!res?.ok) return null;
    const metrics = res.metrics || res.account || {};
    return {
      brokerId: "tradelocker",
      accountKey: metrics?.accountId != null ? String(metrics.accountId) : "tradelocker",
      currency: metrics?.currency ?? null,
      equity: Number(metrics?.equity),
      balance: Number(metrics?.balance),
      netting: null
    };
  } catch {
    return null;
  }
};

const fetchTradeLockerQuote = async (api?: TradeLockerApi | null, symbol?: string): Promise<BrokerQuote | null> => {
  if (!api?.getQuotes || !symbol) return null;
  try {
    const res = await api.getQuotes({ symbols: [symbol] });
    const quote = res?.quotes?.[symbol] || res?.quotes?.[0] || null;
    if (!quote) return null;
    return {
      symbol: quote.symbol || symbol,
      bid: quote.bid ?? null,
      ask: quote.ask ?? null,
      mid: quote.mid ?? null,
      timestampMs: quote.timestampMs ?? null,
      fetchedAtMs: quote.fetchedAtMs ?? null
    };
  } catch {
    return null;
  }
};

export const createMt5Adapter = (opts?: { brokerId?: BrokerId }): BrokerAdapter => {
  const brokerId = opts?.brokerId === "tradelocker" ? "tradelocker" : "mt5";
  return {
    id: brokerId,
    resolveSymbol: resolveMt5SymbolBestEffort,
    getQuote: (symbol: string) => fetchMt5Quote(symbol),
    getAccountSpec: async () => {
      const spec = await fetchMt5AccountSpec();
      if (!spec) return null;
      return {
        brokerId: "mt5",
        accountKey: spec.accountKey,
        currency: spec.currency,
        equity: Number.isFinite(spec.equity) ? spec.equity : null,
        balance: Number.isFinite(spec.balance) ? spec.balance : null,
        netting: spec.netting
      };
    },
    placeOrder: async (intent: TradeIntent) => {
      const payload: Record<string, any> = {
        symbol: intent.symbol,
        side: intent.side,
        type: intent.type,
        volume: intent.qty,
        price: intent.type === "market" ? undefined : intent.entryPrice,
        sl: intent.stopLoss ?? undefined,
        tp: intent.takeProfit ?? undefined,
        comment: intent.comment ?? undefined
      };
      const res = await fetchMt5("/order", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!res.ok || res.data?.ok === false) {
        return { ok: false, error: formatMt5OrderError(res, "MT5 order failed.") };
      }
      const result = res.data?.result || {};
      return {
        ok: true,
        orderId: result?.order != null ? String(result.order) : null,
        positionId: result?.position != null ? String(result.position) : null
      };
    }
  };
};

export const createTradeLockerAdapter = (opts: {
  api?: TradeLockerApi | null;
  resolveSymbol?: (symbol: string) => Promise<string>;
}): BrokerAdapter => {
  const api = opts.api;
  return {
    id: "tradelocker",
    resolveSymbol: opts.resolveSymbol,
    getAccountSpec: () => formatTradeLockerSpec(api),
    getQuote: (symbol: string) => fetchTradeLockerQuote(api, symbol),
    placeOrder: async (intent: TradeIntent) => {
      if (!api?.placeOrder) return { ok: false, error: "TradeLocker API unavailable." };
      const strategyId = intent.meta?.strategyId || intent.correlationId || intent.comment || undefined;
      const res = await api.placeOrder({
        symbol: intent.symbol,
        side: intent.side,
        qty: intent.qty,
        type: intent.type,
        price: intent.entryPrice,
        stopPrice: intent.type === "stop" ? intent.entryPrice : undefined,
        stopLoss: intent.stopLoss ?? undefined,
        takeProfit: intent.takeProfit ?? undefined,
        strategyId
      });
      if (!res?.ok) {
        return { ok: false, error: res?.error ? String(res.error) : "TradeLocker order failed." };
      }
      return {
        ok: true,
        orderId: res?.orderId != null ? String(res.orderId) : null,
        positionId: res?.positionId != null ? String(res.positionId) : null
      };
    }
  };
};
