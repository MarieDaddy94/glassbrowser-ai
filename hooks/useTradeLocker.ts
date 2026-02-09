import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position, TradeLockerAccountMetrics, TradeLockerOrder, TradeLockerOrderHistory, TradeLockerQuote } from "../types";
import { normalizeSymbolKey, normalizeSymbolLoose } from "../services/symbols";
import { getRuntimeScheduler } from "../services/runtimeScheduler";
import { requireBridge } from "../services/bridgeGuard";
import { GLASS_EVENT } from "../services/glassEvents";

export type TradeLockerConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface TradeLockerAccount {
  id: number;
  name: string;
  accNum?: number;
  currency?: string;
  status?: string;
}

export interface TradeLockerSavedConfig {
  env: "demo" | "live";
  server: string;
  email: string;
  autoConnect?: boolean;
  accountId: number | null;
  accNum: number | null;
  tradingEnabled: boolean;
  autoPilotEnabled: boolean;
  defaultOrderQty: number;
  defaultOrderType: "market" | "limit" | "stop";
  streamingEnabled?: boolean;
  streamingUrl?: string;
  streamingAutoReconnect?: boolean;
  streamingSubscribe?: string;
  debug?: {
    enabled?: boolean;
    maxBytes?: number;
    maxFiles?: number;
    textLimit?: number;
  };
  hasSavedPassword: boolean;
  hasSavedDeveloperApiKey: boolean;
  encryptionAvailable: boolean;
}

export interface TradeLockerInstrumentSuggestion {
  tradableInstrumentId: number | null;
  symbol: string;
  displayName: string | null;
}

function toNumber(value: any, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStreamStatus(value: any): string {
  return String(value || "").trim().toUpperCase();
}

function isStreamConnectedStatus(value: any): boolean {
  const s = normalizeStreamStatus(value);
  return s === "LIVE" || s === "SYNCING" || s === "CONNECTED" || s === "SUBSCRIBING";
}

function toDate(value: any): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toDateOrNull(value: any): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toOrderType(value: any): TradeLockerOrder["type"] {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "limit") return "limit";
  if (raw === "stop") return "stop";
  return "market";
}

function readNumber(value: any): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeSide(value: any): "BUY" | "SELL" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "SELL" || raw === "SHORT" || raw === "S") return "SELL";
  return "BUY";
}

function normalizeStatus(value: any): string {
  return String(value || "").trim().toUpperCase();
}

function isTerminalOrderStatus(value: any): boolean {
  const status = normalizeStatus(value);
  if (!status) return false;
  return (
    status.includes("CANCEL") ||
    status.includes("EXPIRE") ||
    status.includes("REJECT") ||
    status.includes("FILLED") ||
    status.includes("DONE")
  );
}

function isClosedPositionStatus(value: any): boolean {
  const status = normalizeStatus(value);
  if (!status) return false;
  return status.includes("CLOSE") || status.includes("LIQ");
}

function normalizeStopValue(value: any): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

function deriveStopsFromOrders(pos: Position, orders: TradeLockerOrder[]): { stopLoss?: number; takeProfit?: number } {
  if (!pos || !Array.isArray(orders) || orders.length === 0) return {};
  const symbol = String(pos.symbol || "");
  if (!symbol) return {};
  const entry = Number(pos.entryPrice);
  if (!Number.isFinite(entry) || entry <= 0) return {};
  const side = String(pos.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const key = normalizeSymbolLoose(symbol);
  if (!key) return {};

  const candidates = orders.filter((o) => {
    if (!o || !o.symbol) return false;
    if (isTerminalOrderStatus(o.status)) return false;
    const oSide = String(o.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    if (oSide === side) return false;
    return normalizeSymbolLoose(o.symbol) === key;
  });
  if (!candidates.length) return {};

  const prices = candidates.map((o) => Number(o.price)).filter((p) => Number.isFinite(p) && p > 0);
  if (!prices.length) return {};

  let derivedSL: number | null = null;
  let derivedTP: number | null = null;

  if (side === "BUY") {
    const above = prices.filter((p) => p > entry).sort((a, b) => a - b);
    const below = prices.filter((p) => p < entry).sort((a, b) => b - a);
    if (above.length > 0) derivedTP = above[0];
    if (below.length > 0) derivedSL = below[0];
  } else {
    const below = prices.filter((p) => p < entry).sort((a, b) => b - a);
    const above = prices.filter((p) => p > entry).sort((a, b) => a - b);
    if (below.length > 0) derivedTP = below[0];
    if (above.length > 0) derivedSL = above[0];
  }

  const out: { stopLoss?: number; takeProfit?: number } = {};
  if (derivedSL != null && Number.isFinite(derivedSL) && derivedSL > 0) out.stopLoss = derivedSL;
  if (derivedTP != null && Number.isFinite(derivedTP) && derivedTP > 0) out.takeProfit = derivedTP;
  return out;
}

function pickFirstValue(raw: any, keys: string[]) {
  if (!raw || typeof raw !== "object") return undefined;
  for (const key of keys) {
    const value = (raw as any)[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function getStreamPositionId(raw: any): string | null {
  const value = pickFirstValue(raw, ["positionId", "id", "positionID", "posId", "posID"]);
  const id = value != null ? String(value).trim() : "";
  return id || null;
}

function getStreamOrderId(raw: any): string | null {
  const value = pickFirstValue(raw, ["orderId", "id", "orderID", "clientOrderId", "clientOrderID"]);
  const id = value != null ? String(value).trim() : "";
  return id || null;
}

function mapStreamPosition(raw: any, prev?: Position | null): Position | null {
  if (!raw && !prev) return null;
  const idRaw = getStreamPositionId(raw) ?? prev?.id ?? "";
  const id = String(idRaw || "").trim();
  if (!id) return null;

  const symbolRaw = pickFirstValue(raw, [
    "symbol",
    "instrument",
    "instrumentName",
    "tradableInstrumentName",
    "name",
    "localizedName"
  ]);
  const symbol = String(symbolRaw ?? prev?.symbol ?? "UNKNOWN");

  const sideRaw = pickFirstValue(raw, ["side", "type", "direction", "positionSide", "buySell"]);
  const type = sideRaw != null ? normalizeSide(sideRaw) : (prev?.type ?? "BUY");

  const entryPrice =
    readNumber(pickFirstValue(raw, ["entryPrice", "openPrice", "price", "avgPrice", "averagePrice"])) ??
    prev?.entryPrice ??
    0;

  const sizeRaw = readNumber(pickFirstValue(raw, ["size", "qty", "quantity", "volume", "lots"]));
  const size = sizeRaw != null ? sizeRaw : (prev?.size ?? 0);

  const stopLoss = readNumber(pickFirstValue(raw, ["stopLoss", "sl", "slPrice", "stop", "stopPrice"])) ?? prev?.stopLoss ?? 0;
  const takeProfit = readNumber(pickFirstValue(raw, ["takeProfit", "tp", "tpPrice", "take", "takePrice"])) ?? prev?.takeProfit ?? 0;

  const openTime =
    toDateOrNull(pickFirstValue(raw, ["openTime", "openDate", "createdAt", "created", "openTimestamp", "time"])) ??
    prev?.openTime ??
    new Date();

  const closeTime =
    toDateOrNull(pickFirstValue(raw, ["closeTime", "closedAt", "closeDate", "closeTimestamp", "closedTime"])) ??
    prev?.closeTime ??
    null;

  const closePrice = readNumber(pickFirstValue(raw, ["closePrice", "close", "closeLevel", "exitPrice"])) ?? prev?.closePrice ?? null;

  const pnl =
    readNumber(
      pickFirstValue(raw, [
        "pnl",
        "profit",
        "profitLoss",
        "floatingPnl",
        "floatingProfit",
        "unrealizedPnl",
        "unrealizedProfit"
      ])
    ) ?? prev?.pnl ?? 0;

  const statusRaw = pickFirstValue(raw, ["status", "state", "positionStatus"]);
  const status = statusRaw != null
    ? (isClosedPositionStatus(statusRaw) ? "CLOSED" : "OPEN")
    : (prev?.status ?? "OPEN");

  const strategyIdRaw = pickFirstValue(raw, ["strategyId", "strategyID", "strategy", "tag", "clientTag"]) ?? prev?.strategyId;
  const strategyId = strategyIdRaw != null && String(strategyIdRaw).trim()
    ? String(strategyIdRaw).slice(0, 64)
    : (prev?.strategyId ?? null);

  return {
    id,
    symbol: symbol || "UNKNOWN",
    type,
    entryPrice,
    size,
    stopLoss,
    takeProfit,
    openTime,
    closeTime: closeTime ?? undefined,
    closePrice: closePrice ?? undefined,
    pnl,
    status,
    strategyId
  };
}

function mapStreamOrder(raw: any, prev?: TradeLockerOrder | null): TradeLockerOrder | null {
  if (!raw && !prev) return null;
  const idRaw = getStreamOrderId(raw) ?? prev?.id ?? "";
  const id = String(idRaw || "").trim();
  if (!id) return null;

  const symbolRaw = pickFirstValue(raw, [
    "symbol",
    "instrument",
    "instrumentName",
    "tradableInstrumentName",
    "name",
    "localizedName"
  ]);
  const symbol = String(symbolRaw ?? prev?.symbol ?? "UNKNOWN");

  const sideRaw = pickFirstValue(raw, ["side", "direction", "action", "buySell"]);
  const side = sideRaw != null ? normalizeSide(sideRaw) : (prev?.side ?? "BUY");

  const typeRaw = pickFirstValue(raw, ["type", "orderType", "kind", "orderKind"]) ?? prev?.type ?? "market";
  const type = toOrderType(typeRaw);

  const qty = readNumber(pickFirstValue(raw, ["qty", "quantity", "volume", "lots", "size"])) ?? prev?.qty ?? 0;
  const price =
    readNumber(
      pickFirstValue(raw, [
        "price",
        "limitPrice",
        "orderPrice",
        "stopPrice",
        "stopLevel",
        "triggerPrice",
        "triggerLevel",
        "activationPrice"
      ])
    ) ?? prev?.price ?? 0;
  const stopLoss = readNumber(pickFirstValue(raw, ["stopLoss", "sl", "slPrice", "stop", "stopPrice"])) ?? prev?.stopLoss ?? 0;
  const takeProfit = readNumber(pickFirstValue(raw, ["takeProfit", "tp", "tpPrice", "take", "takePrice"])) ?? prev?.takeProfit ?? 0;
  const statusRaw = pickFirstValue(raw, ["status", "state", "orderStatus"]);
  const status = statusRaw != null ? String(statusRaw || "").trim() : (prev?.status ?? "OPEN");
  const createdAt =
    toDateOrNull(pickFirstValue(raw, ["createdAt", "created", "createTime", "time", "openTime", "timestamp"])) ??
    prev?.createdAt ??
    new Date();
  const filledQty =
    readNumber(pickFirstValue(raw, ["filledQty", "filledQuantity", "filled", "executedQty", "filledSize"])) ??
    prev?.filledQty ??
    null;
  const remainingQty =
    readNumber(pickFirstValue(raw, ["remainingQty", "remainingQuantity", "remaining", "leavesQty"])) ??
    prev?.remainingQty ??
    null;
  const strategyIdRaw = pickFirstValue(raw, ["strategyId", "strategyID", "strategy", "tag", "clientTag"]) ?? prev?.strategyId;
  const strategyId = strategyIdRaw != null && String(strategyIdRaw).trim()
    ? String(strategyIdRaw).slice(0, 64)
    : (prev?.strategyId ?? null);

  return {
    id,
    symbol: symbol || "UNKNOWN",
    side,
    type,
    qty,
    price,
    stopLoss,
    takeProfit,
    status,
    createdAt,
    strategyId,
    filledQty,
    remainingQty
  };
}

function mergePositionsFromStream(prev: Position[], rawList: any[], replace: boolean): Position[] {
  const list = Array.isArray(rawList) ? rawList : [];
  const prevById = new Map(prev.map((p) => [p.id, p]));

  if (replace) {
    const next: Position[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const id = getStreamPositionId(raw);
      const mapped = mapStreamPosition(raw, id ? prevById.get(id) : null);
      if (!mapped) continue;
      const sizeZero = Number.isFinite(Number(mapped.size)) && Math.abs(Number(mapped.size)) <= 1e-9;
      if (mapped.status === "CLOSED" || sizeZero) continue;
      if (seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      next.push(mapped);
    }
    return next;
  }

  const byId = new Map(prev.map((p) => [p.id, p]));
  for (const raw of list) {
    const id = getStreamPositionId(raw);
    const mapped = mapStreamPosition(raw, id ? prevById.get(id) : null);
    if (!mapped) continue;
    const sizeZero = Number.isFinite(Number(mapped.size)) && Math.abs(Number(mapped.size)) <= 1e-9;
    if (mapped.status === "CLOSED" || sizeZero) {
      if (mapped.id) byId.delete(mapped.id);
      continue;
    }
    byId.set(mapped.id, mapped);
  }
  return Array.from(byId.values());
}

function mergeOrdersFromStream(prev: TradeLockerOrder[], rawList: any[], replace: boolean): TradeLockerOrder[] {
  const list = Array.isArray(rawList) ? rawList : [];
  const prevById = new Map(prev.map((o) => [o.id, o]));

  if (replace) {
    const next: TradeLockerOrder[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const id = getStreamOrderId(raw);
      const mapped = mapStreamOrder(raw, id ? prevById.get(id) : null);
      if (!mapped) continue;
      if (isTerminalOrderStatus(mapped.status)) continue;
      if (seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      next.push(mapped);
    }
    return next;
  }

  const byId = new Map(prev.map((o) => [o.id, o]));
  for (const raw of list) {
    const id = getStreamOrderId(raw);
    const mapped = mapStreamOrder(raw, id ? prevById.get(id) : null);
    if (!mapped) continue;
    if (isTerminalOrderStatus(mapped.status)) {
      if (mapped.id) byId.delete(mapped.id);
      continue;
    }
    byId.set(mapped.id, mapped);
  }
  return Array.from(byId.values());
}

function mapStreamAccountMetrics(raw: any, prev: TradeLockerAccountMetrics | null, atMs: number): TradeLockerAccountMetrics | null {
  if (!raw && !prev) return null;

  const accountId = readNumber(pickFirstValue(raw, ["accountId", "id"])) ?? prev?.accountId ?? null;
  const accNum = readNumber(pickFirstValue(raw, ["accNum", "accountNumber"])) ?? prev?.accNum ?? null;
  const currency = pickFirstValue(raw, ["currency", "accountCurrency", "baseCurrency"]) ?? prev?.currency ?? null;

  const balance = readNumber(pickFirstValue(raw, ["balance", "accountBalance", "cash", "cashBalance"])) ?? prev?.balance ?? 0;
  const equity =
    readNumber(pickFirstValue(raw, ["equity", "accountEquity", "netAssetValue", "nav"])) ??
    prev?.equity ??
    balance ??
    0;

  const openGrossPnl =
    readNumber(
      pickFirstValue(raw, [
        "openGrossPnl",
        "openGrossPnL",
        "openPnl",
        "openPnL",
        "floatingPnl",
        "floatingProfit",
        "unrealizedPnl",
        "unrealizedProfit"
      ])
    ) ?? prev?.openGrossPnl ?? null;

  const openNetPnl =
    readNumber(
      pickFirstValue(raw, [
        "openNetPnl",
        "openNetPnL",
        "openNetPL",
        "openNetPl"
      ])
    ) ?? prev?.openNetPnl ?? null;

  const marginUsed =
    readNumber(
      pickFirstValue(raw, [
        "marginUsed",
        "margin",
        "usedMargin",
        "utilizedMargin"
      ])
    ) ?? prev?.marginUsed ?? null;

  const marginFree =
    readNumber(
      pickFirstValue(raw, [
        "marginFree",
        "freeMargin",
        "availableMargin",
        "remainingMargin"
      ])
    ) ?? prev?.marginFree ?? null;

  const marginLevelRaw =
    readNumber(
      pickFirstValue(raw, [
        "marginLevel",
        "marginRatio",
        "marginLevelPercent",
        "marginLevelPct"
      ])
    ) ?? prev?.marginLevel ?? null;

  const computedMarginLevel =
    marginLevelRaw == null &&
    marginUsed != null &&
    Number.isFinite(Number(marginUsed)) &&
    Number(marginUsed) > 0 &&
    equity != null &&
    Number.isFinite(Number(equity));

  const marginLevel = computedMarginLevel
    ? (Number(equity) / Number(marginUsed)) * 100
    : marginLevelRaw;

  const computedMarginLevelFlag = computedMarginLevel
    ? true
    : (marginLevelRaw == null ? (prev?.computedMarginLevel ?? false) : false);

  return {
    accountId,
    accNum,
    currency: currency != null ? String(currency) : null,
    balance,
    equity,
    openGrossPnl,
    openNetPnl,
    marginUsed,
    marginFree,
    marginLevel,
    computedMarginLevel: computedMarginLevelFlag,
    updatedAtMs: atMs || Date.now()
  };
}

export function useTradeLocker(
  isActive: boolean,
  opts?: {
    watchSymbols?: string[];
    suppressRateLimitUntilMs?: number;
    onQuote?: (quote: TradeLockerQuote) => void;
    withAccountLock?: <T>(fn: () => Promise<T>) => Promise<T>;
    accountBusyRef?: React.MutableRefObject<boolean>;
    startupPhase?: 'booting' | 'restoring' | 'settled';
    startupBridgeReady?: boolean;
  }
) {
  const api = window.glass?.tradelocker;

  const [status, setStatus] = useState<TradeLockerConnectionStatus>("disconnected");
  const [statusMeta, setStatusMeta] = useState<{
    requestQueueDepth?: number | null;
    requestQueueMaxDepth?: number | null;
    requestQueueMaxWaitMs?: number | null;
    requestInFlight?: number | null;
    requestConcurrency?: number | null;
    minRequestIntervalMs?: number | null;
  } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [savedConfig, setSavedConfig] = useState<TradeLockerSavedConfig | null>(null);
  const [accounts, setAccounts] = useState<TradeLockerAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [balance, setBalance] = useState(0);
  const [equity, setEquity] = useState(0);
  const [positionsRaw, setPositionsRaw] = useState<Position[]>([]);
  const [orders, setOrders] = useState<TradeLockerOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersHistory, setOrdersHistory] = useState<TradeLockerOrderHistory[]>([]);
  const [ordersHistoryError, setOrdersHistoryError] = useState<string | null>(null);
  const [accountMetrics, setAccountMetrics] = useState<TradeLockerAccountMetrics | null>(null);
  const [accountMetricsError, setAccountMetricsError] = useState<string | null>(null);
  const [snapshotUpdatedAtMs, setSnapshotUpdatedAtMs] = useState<number | null>(null);
  const [rateLimitedUntilMs, setRateLimitedUntilMs] = useState(0);
  const [upstreamBlockedUntilMs, setUpstreamBlockedUntilMs] = useState(0);
  const [upstreamLastError, setUpstreamLastError] = useState<string | null>(null);
  const [upstreamLastStatus, setUpstreamLastStatus] = useState<number | null>(null);
  const [quotesBySymbol, setQuotesBySymbol] = useState<Record<string, TradeLockerQuote>>({});
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [quotesUpdatedAtMs, setQuotesUpdatedAtMs] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>("DISCONNECTED");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamReason, setStreamReason] = useState<string | null>(null);
  const [streamUpdatedAtMs, setStreamUpdatedAtMs] = useState<number | null>(null);
  const [streamLastMessageAtMs, setStreamLastMessageAtMs] = useState<number | null>(null);
  const [startupAutoRestore, setStartupAutoRestore] = useState<{
    attempted: boolean;
    success: boolean;
    error: string | null;
    atMs: number | null;
  }>({
    attempted: false,
    success: false,
    error: null,
    atMs: null
  });

  const withAccountLock = opts?.withAccountLock;
  const accountBusyRef = opts?.accountBusyRef;
  const runWithLock = useCallback(async <T,>(fn: () => Promise<T>, skipIfBusy = false) => {
    if (skipIfBusy && accountBusyRef?.current) {
      return null as T;
    }
    if (!withAccountLock) return fn();
    return withAccountLock(fn);
  }, [accountBusyRef, withAccountLock]);

  const pollTimerRef = useRef<(() => void) | null>(null);
  const savedConfigTimerRef = useRef<(() => void) | null>(null);
  const statusTimerRef = useRef<(() => void) | null>(null);
  const streamStatusTimerRef = useRef<(() => void) | null>(null);
  const snapshotInFlightRef = useRef(false);
  const ordersTimerRef = useRef<(() => void) | null>(null);
  const ordersInFlightRef = useRef(false);
  const ordersHistoryTimerRef = useRef<(() => void) | null>(null);
  const ordersHistoryInFlightRef = useRef(false);
  const ordersHistoryBackoffRef = useRef<{ untilMs: number; failures: number; lastError: string | null }>({
    untilMs: 0,
    failures: 0,
    lastError: null
  });
  const metricsTimerRef = useRef<(() => void) | null>(null);
  const metricsInFlightRef = useRef(false);
  const quotesTimerRef = useRef<(() => void) | null>(null);
  const quotesInFlightRef = useRef(false);
  const quotesFlushTimerRef = useRef<number | null>(null);
  const quotesDirtyRef = useRef(false);
  const quotesRef = useRef<Record<string, TradeLockerQuote>>({});
  const onQuoteRef = useRef<((quote: TradeLockerQuote) => void) | null>(null);
  const autoConnectAttemptedRef = useRef(false);
  const watchSymbolsRef = useRef<string[]>([]);
  const streamRefreshAtRef = useRef(0);
  const burstRefreshRef = useRef<{
    timer: number | null;
    inFlight: boolean;
    pending: boolean;
    snapshot: boolean;
    orders: boolean;
    metrics: boolean;
  }>({
    timer: null,
    inFlight: false,
    pending: false,
    snapshot: true,
    orders: true,
    metrics: true
  });
  const streamConfigKeyRef = useRef<string>("");
  const streamRevisionRef = useRef<number>(0);
  const accountSwitchRefreshAtRef = useRef<number>(0);
  const suppressRateLimitUntilRef = useRef(0);
  const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);

  const watchSymbols = useMemo(() => {
    const raw = Array.isArray(opts?.watchSymbols) ? opts?.watchSymbols : [];
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const sym of raw) {
      const s = String(sym || '').trim();
      if (!s) continue;
      const key = normalizeSymbolKey(s);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      normalized.push(s);
    }
    return normalized;
  }, [opts?.watchSymbols]);
  const startupPhase = opts?.startupPhase || 'booting';
  const startupBridgeReady = opts?.startupBridgeReady === true;
  const tradeLockerBridgeState = requireBridge('tradelocker.runtime');
  const startupBridgeOperational = startupBridgeReady && tradeLockerBridgeState.ok;

  useEffect(() => {
    if (startupPhase !== 'settled') return;
    if (tradeLockerBridgeState.ok) return;
    setStatus('error');
    setLastError(tradeLockerBridgeState.error || 'Renderer bridge unavailable.');
    setStreamStatus('DISCONNECTED');
    setStreamError(tradeLockerBridgeState.error || 'Renderer bridge unavailable.');
  }, [startupPhase, tradeLockerBridgeState.error, tradeLockerBridgeState.ok]);

  useEffect(() => {
    watchSymbolsRef.current = watchSymbols;
  }, [watchSymbols]);

  useEffect(() => {
    const next = Number(opts?.suppressRateLimitUntilMs || 0);
    suppressRateLimitUntilRef.current = Number.isFinite(next) ? next : 0;
  }, [opts?.suppressRateLimitUntilMs]);

  useEffect(() => {
    onQuoteRef.current = typeof opts?.onQuote === "function" ? opts.onQuote : null;
  }, [opts?.onQuote]);

  const flushQuotes = useCallback(() => {
    if (!quotesDirtyRef.current) return;
    quotesDirtyRef.current = false;
    const snapshot = { ...quotesRef.current };
    setQuotesBySymbol(snapshot);
  }, []);

  const scheduleQuoteFlush = useCallback((delayMs: number) => {
    if (quotesFlushTimerRef.current) return;
    quotesFlushTimerRef.current = window.setTimeout(() => {
      quotesFlushTimerRef.current = null;
      flushQuotes();
    }, delayMs);
  }, [flushQuotes]);

  useEffect(() => {
    return () => {
      if (quotesFlushTimerRef.current) {
        window.clearTimeout(quotesFlushTimerRef.current);
        quotesFlushTimerRef.current = null;
      }
    };
  }, []);

  const shouldUpdateQuote = useCallback((prev: TradeLockerQuote | undefined, next: TradeLockerQuote) => {
    if (!prev) return true;
    return (
      prev.bid !== next.bid ||
      prev.ask !== next.ask ||
      prev.last !== next.last ||
      prev.mid !== next.mid ||
      prev.spread !== next.spread ||
      prev.timestampMs !== next.timestampMs ||
      prev.fetchedAtMs !== next.fetchedAtMs
    );
  }, []);

  const shouldSuppressRateLimit = useCallback(() => {
    const until = suppressRateLimitUntilRef.current || 0;
    return Number.isFinite(until) && until > Date.now();
  }, []);

  const streamConfigKey = useMemo(() => {
    if (!savedConfig) return "";
    const enabled = savedConfig.streamingEnabled ? "1" : "0";
    const url = String(savedConfig.streamingUrl || "");
    const autoReconnect = savedConfig.streamingAutoReconnect === false ? "0" : "1";
    const subscribe = String(savedConfig.streamingSubscribe || "");
    const accountId = savedConfig.accountId ?? "";
    const accNum = savedConfig.accNum ?? "";
    return [enabled, url, autoReconnect, subscribe, accountId, accNum].join("|");
  }, [
    savedConfig?.streamingEnabled,
    savedConfig?.streamingUrl,
    savedConfig?.streamingAutoReconnect,
    savedConfig?.streamingSubscribe,
    savedConfig?.accountId,
    savedConfig?.accNum
  ]);

  const noteRateLimit = useCallback((retryAtMs: any) => {
    const at = retryAtMs != null ? toNumber(retryAtMs, 0) : 0;
    const fallback = Date.now() + 15_000;
    const next = at > 0 ? at : fallback;
    setRateLimitedUntilMs((prev) => Math.max(prev || 0, next));
  }, []);

  const noteOrdersHistoryBackoff = useCallback((reason: string, retryAtMs?: any) => {
    const now = Date.now();
    const retryAt = toNumber(retryAtMs, 0);
    const current = ordersHistoryBackoffRef.current;
    const nextFailures = Math.min(6, (current?.failures || 0) + 1);
    const baseDelay = 30_000;
    const computed = now + Math.min(600_000, baseDelay * Math.pow(2, nextFailures - 1));
    const untilMs = retryAt > now ? retryAt : computed;
    ordersHistoryBackoffRef.current = {
      untilMs,
      failures: nextFailures,
      lastError: reason || current?.lastError || null
    };
    const waitSec = Math.max(1, Math.ceil((untilMs - now) / 1000));
    setOrdersHistoryError(`Trade history backoff (${waitSec}s). ${reason}`);
  }, []);

  const clearOrdersHistoryBackoff = useCallback(() => {
    ordersHistoryBackoffRef.current = { untilMs: 0, failures: 0, lastError: null };
  }, []);

  const positions = useMemo(() => {
    if (!positionsRaw.length) return positionsRaw;
    const withQuotes = positionsRaw.map((p) => {
      const quote = quotesBySymbol[normalizeSymbolKey(p.symbol)];
      if (!quote) return p;
      return {
        ...p,
        brokerBid: quote.bid ?? null,
        brokerAsk: quote.ask ?? null,
        brokerMid: quote.mid ?? null,
        brokerSpread: quote.spread ?? null,
        brokerUpdatedAtMs: quote.fetchedAtMs ?? quote.timestampMs ?? null
      };
    });
    if (!orders.length) return withQuotes;
    return withQuotes.map((p) => {
      const sl = normalizeStopValue(p.stopLoss);
      const tp = normalizeStopValue(p.takeProfit);
      if (sl != null && tp != null) return p;
      const derived = deriveStopsFromOrders(p, orders);
      if (derived.stopLoss == null && derived.takeProfit == null) return p;
      return {
        ...p,
        stopLoss: sl != null ? sl : (derived.stopLoss ?? p.stopLoss),
        takeProfit: tp != null ? tp : (derived.takeProfit ?? p.takeProfit)
      };
    });
  }, [orders, positionsRaw, quotesBySymbol]);

  const formatRetryIn = useCallback((retryAtMs: any) => {
    const at = retryAtMs != null ? toNumber(retryAtMs, 0) : 0;
    if (!at || at <= 0) return "soon";
    const seconds = Math.max(1, Math.ceil((at - Date.now()) / 1000));
    return `${seconds}s`;
  }, []);

  useEffect(() => {
    if (!rateLimitedUntilMs) return;
    const now = Date.now();
    if (now >= rateLimitedUntilMs) {
      setRateLimitedUntilMs(0);
      return;
    }
    const t = window.setTimeout(() => setRateLimitedUntilMs(0), Math.max(250, rateLimitedUntilMs - now + 250));
    return () => window.clearTimeout(t);
  }, [rateLimitedUntilMs]);

  useEffect(() => {
    if (!upstreamBlockedUntilMs) return;
    const now = Date.now();
    if (now >= upstreamBlockedUntilMs) {
      setUpstreamBlockedUntilMs(0);
      return;
    }
    const t = window.setTimeout(() => setUpstreamBlockedUntilMs(0), Math.max(250, upstreamBlockedUntilMs - now + 250));
    return () => window.clearTimeout(t);
  }, [upstreamBlockedUntilMs]);

  const refreshSavedConfig = useCallback(async () => {
    const bridge = requireBridge('tradelocker.saved_config');
    if (!bridge.ok) return;
    if (!api?.getSavedConfig) return;
    try {
      const res = await api.getSavedConfig();
      if (res?.ok) {
        setSavedConfig(res);
      }
    } catch {
      // ignore
    }
  }, [api, upstreamBlockedUntilMs]);

  const refreshStatus = useCallback(async () => {
    const bridge = requireBridge('tradelocker.status');
    if (!bridge.ok) {
      if (startupPhase === 'settled') {
        setStatus("error");
        setLastError(bridge.error);
      }
      return null;
    }
    if (!api?.getStatus) return;
    return runWithLock(async () => {
      try {
        const res = await api.getStatus();
        const connected = !!res?.connected;
        setStatus(connected ? "connected" : "disconnected");
        setLastError(res?.lastError ? String(res.lastError) : null);
        setUpstreamLastError(res?.upstreamLastError ? String(res.upstreamLastError) : null);
        const upstreamStatus = toNumber(res?.upstreamLastStatus, NaN);
        setUpstreamLastStatus(Number.isFinite(upstreamStatus) ? upstreamStatus : null);
        const rl = toNumber(res?.rateLimitedUntilMs, 0);
        if (rl > 0) setRateLimitedUntilMs((prev) => Math.max(prev || 0, rl));
        const upstreamUntil = toNumber(res?.upstreamBackoffUntilMs, 0);
        if (upstreamUntil > 0) {
          setUpstreamBlockedUntilMs((prev) => Math.max(prev || 0, upstreamUntil));
        } else if (upstreamBlockedUntilMs) {
          setUpstreamBlockedUntilMs(0);
        }
        setStatusMeta({
          requestQueueDepth: readNumber(res?.requestQueueDepth),
          requestQueueMaxDepth: readNumber(res?.requestQueueMaxDepth),
          requestQueueMaxWaitMs: readNumber(res?.requestQueueMaxWaitMs),
          requestInFlight: readNumber(res?.requestInFlight),
          requestConcurrency: readNumber(res?.requestConcurrency),
          minRequestIntervalMs: readNumber(res?.minRequestIntervalMs)
        });
        return res;
      } catch (e: any) {
        setStatus("error");
        setLastError(e?.message ? String(e.message) : "TradeLocker status error");
        return null;
      }
    }, true);
  }, [api, runWithLock, startupPhase, upstreamBlockedUntilMs]);

  const refreshStreamStatus = useCallback(async () => {
    const bridge = requireBridge('tradelocker.stream_status');
    if (!bridge.ok) {
      if (startupPhase === 'settled') {
        setStreamError(bridge.error);
      }
      return null;
    }
    if (!api?.getStreamStatus) return null;
    return runWithLock(async () => {
      try {
        const res = await api.getStreamStatus();
        if (!res?.ok) return res;
        if (res?.status != null) setStreamStatus(normalizeStreamStatus(res.status));
        setStreamReason(res?.reason != null ? String(res.reason) : null);
        const detail = res?.detail != null ? String(res.detail) : (res?.lastError ? String(res.lastError) : null);
        setStreamError(detail || (res?.reason ? String(res.reason) : null));
        const lastMessageAt = toNumber(res?.lastMessageAtMs, 0);
        if (lastMessageAt > 0) {
          setStreamUpdatedAtMs(lastMessageAt);
          setStreamLastMessageAtMs(lastMessageAt);
        }
        return res;
      } catch (e: any) {
        setStreamError(e?.message ? String(e.message) : "Stream status error");
        return null;
      }
    }, true);
  }, [api, runWithLock, startupPhase]);

  const refreshAccounts = useCallback(async () => {
    if (!api?.getAccounts) return { ok: false, accounts: [] as TradeLockerAccount[] };
    return runWithLock(async () => {
      try {
        const res = await api.getAccounts();
        if (res?.ok && Array.isArray(res.accounts)) {
          setAccounts(res.accounts as TradeLockerAccount[]);
          setAccountsError(null);
          return { ok: true, accounts: res.accounts as TradeLockerAccount[] };
        }
        const err = res?.error ? String(res.error) : "Failed to fetch accounts";
        setLastError(err);
        setAccountsError(err);
        return { ok: false, accounts: [] as TradeLockerAccount[], error: err };
      } catch (e: any) {
        const err = e?.message ? String(e.message) : "Failed to fetch accounts";
        setLastError(err);
        setAccountsError(err);
        return { ok: false, accounts: [] as TradeLockerAccount[], error: err };
      }
    });
  }, [api, runWithLock]);

  const applySnapshotBase = useCallback((res: any) => {
    setBalance(toNumber(res?.balance, 0));
    setEquity(toNumber(res?.equity, 0));

    const rawPositions = Array.isArray(res?.positions) ? res.positions : [];
    const mapped: Position[] = rawPositions.map((p: any) => ({
      id: String(p?.id || ""),
      symbol: String(p?.symbol || "UNKNOWN"),
      type: (String(p?.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
      entryPrice: toNumber(p?.entryPrice, 0),
      size: toNumber(p?.size, 0),
      stopLoss: toNumber(p?.stopLoss, 0),
      takeProfit: toNumber(p?.takeProfit, 0),
      openTime: toDate(p?.openTime),
      strategyId: p?.strategyId == null ? null : String(p.strategyId),
      pnl: toNumber(p?.pnl, 0),
      status: "OPEN"
    }));

    setPositionsRaw(mapped);
    setSnapshotUpdatedAtMs(Date.now());
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!api?.getSnapshot) return;
    if (accountBusyRef?.current) return;
    if (snapshotInFlightRef.current) return;
    snapshotInFlightRef.current = true;
    try {
      const res = await runWithLock(() => api.getSnapshot({ includeOrders: false }));
      if (!res?.ok) {
        if (res?.rateLimited) noteRateLimit(res?.retryAtMs);
        if (res?.rateLimited && !shouldSuppressRateLimit()) {
          const rateMsg = `TradeLocker rate limited. Retrying in ${formatRetryIn(res?.retryAtMs)}.`;
          setLastError(rateMsg);
        }
        else if (res?.error) setLastError(String(res.error));
        return;
      }

      if (res?.rateLimited) noteRateLimit(res?.retryAtMs);
      applySnapshotBase(res);
      setLastError(null);
    } catch (e: any) {
      setLastError(e?.message ? String(e.message) : "Failed to fetch snapshot");
    } finally {
      snapshotInFlightRef.current = false;
    }
  }, [api, accountBusyRef, applySnapshotBase, noteRateLimit, runWithLock, shouldSuppressRateLimit, formatRetryIn]);

  const refreshOrders = useCallback(async () => {
    if (!api?.getOrders && !api?.getSnapshot) return;
    if (accountBusyRef?.current) return;
    if (ordersInFlightRef.current) return;
    ordersInFlightRef.current = true;
    try {
      const res = api.getOrders
        ? await runWithLock(() => api.getOrders())
        : await runWithLock(() => api.getSnapshot({ includeOrders: true }));
      if (!res?.ok) {
        if (res?.rateLimited) noteRateLimit(res?.retryAtMs);
        if (res?.rateLimited && !shouldSuppressRateLimit()) {
          const rateMsg = `Rate limited. Retrying in ${formatRetryIn(res?.retryAtMs)}.`;
          setOrdersError(rateMsg);
        }
        else if (res?.error) setOrdersError(String(res.error));
        return;
      }

      if (res?.rateLimited) noteRateLimit(res?.retryAtMs);

      const rawOrders = Array.isArray(res.orders) ? res.orders : [];
      const mappedOrders: TradeLockerOrder[] = rawOrders.map((o: any) => ({
        id: String(o?.id || ""),
        symbol: String(o?.symbol || "UNKNOWN"),
        side: (String(o?.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
        type: toOrderType(o?.type),
        qty: toNumber(o?.qty, 0),
        price: toNumber(o?.price, 0),
        stopLoss: toNumber(o?.stopLoss, 0),
        takeProfit: toNumber(o?.takeProfit, 0),
        status: String(o?.status || "OPEN"),
        createdAt: toDate(o?.createdAt),
        strategyId: o?.strategyId == null ? null : String(o.strategyId),
        filledQty: o?.filledQty == null ? null : toNumber(o?.filledQty, 0),
        remainingQty: o?.remainingQty == null ? null : toNumber(o?.remainingQty, 0)
      }));

      setOrders(mappedOrders.filter(o => o.id));
      setOrdersError(null);
      setLastError(null);
    } catch (e: any) {
      setOrdersError(e?.message ? String(e.message) : "Failed to fetch orders");
    } finally {
      ordersInFlightRef.current = false;
    }
  }, [api, accountBusyRef, formatRetryIn, noteRateLimit, runWithLock, shouldSuppressRateLimit]);

  const refreshOrdersHistory = useCallback(async () => {
    if (!api?.getOrdersHistory) return;
    if (accountBusyRef?.current) return;
    if (ordersHistoryInFlightRef.current) return;
    const backoff = ordersHistoryBackoffRef.current;
    if (backoff?.untilMs && backoff.untilMs > Date.now()) {
      const waitSec = Math.max(1, Math.ceil((backoff.untilMs - Date.now()) / 1000));
      setOrdersHistoryError(`Trade history backoff (${waitSec}s). ${backoff.lastError || "Waiting to retry."}`);
      return;
    }
    ordersHistoryInFlightRef.current = true;
    try {
      const res = await runWithLock(() => api.getOrdersHistory());
      if (!res?.ok) {
        if (res?.rateLimited) noteRateLimit(res?.retryAtMs);
        const errText = res?.error ? String(res.error) : "";
        const lower = errText.toLowerCase();
        const looksRateLimited =
          res?.rateLimited === true ||
          lower.includes("429") ||
          lower.includes("too many requests") ||
          lower.includes("rate limit") ||
          lower.includes("cloudflare") ||
          lower.includes("access denied");
        if (looksRateLimited && !shouldSuppressRateLimit()) {
          const reason = errText || "Rate limited";
          noteOrdersHistoryBackoff(reason, res?.retryAtMs);
        } else if (res?.rateLimited && !shouldSuppressRateLimit()) {
          const rateMsg = `Rate limited. Retrying in ${formatRetryIn(res?.retryAtMs)}.`;
          setOrdersHistoryError(rateMsg);
        } else if (errText) {
          setOrdersHistoryError(errText);
        }
        return;
      }

      if (res?.rateLimited) noteRateLimit(res?.retryAtMs);
      clearOrdersHistoryBackoff();

      const rawOrders = Array.isArray(res.orders) ? res.orders : [];
      const mappedOrders: TradeLockerOrderHistory[] = rawOrders.map((o: any) => ({
        id: String(o?.id || ""),
        symbol: String(o?.symbol || "UNKNOWN"),
        side: (String(o?.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
        type: toOrderType(o?.type),
        qty: toNumber(o?.qty, 0),
        price: toNumber(o?.price, 0),
        stopPrice: o?.stopPrice == null ? null : toNumber(o?.stopPrice, 0),
        stopLoss: toNumber(o?.stopLoss, 0),
        takeProfit: toNumber(o?.takeProfit, 0),
        status: String(o?.status || "CLOSED"),
        createdAt: toDate(o?.createdAt),
        filledAt: toDateOrNull(o?.filledAt),
        closedAt: toDateOrNull(o?.closedAt),
        strategyId: o?.strategyId == null ? null : String(o.strategyId),
        filledQty: o?.filledQty == null ? null : toNumber(o?.filledQty, 0),
        remainingQty: o?.remainingQty == null ? null : toNumber(o?.remainingQty, 0)
      }));

      setOrdersHistory(mappedOrders.filter((o) => o.id));
      setOrdersHistoryError(null);
      setLastError(null);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch orders history";
      const lower = message.toLowerCase();
      const looksRateLimited =
        lower.includes("429") ||
        lower.includes("too many requests") ||
        lower.includes("rate limit") ||
        lower.includes("cloudflare") ||
        lower.includes("access denied");
      if (looksRateLimited) {
        noteOrdersHistoryBackoff(message);
      } else {
        setOrdersHistoryError(message);
      }
    } finally {
      ordersHistoryInFlightRef.current = false;
    }
  }, [api, accountBusyRef, clearOrdersHistoryBackoff, formatRetryIn, noteOrdersHistoryBackoff, noteRateLimit, runWithLock, shouldSuppressRateLimit]);

  const refreshQuotes = useCallback(async (opts?: { symbols?: string[]; maxAgeMs?: number }) => {
    if (!api?.getQuotes && !api?.getQuote) return;
    if (accountBusyRef?.current) return;
    if (quotesInFlightRef.current) return;
    quotesInFlightRef.current = true;

    try {
      const isRl = rateLimitedUntilMs > Date.now();
      const defaultMaxAge = isActive && !isRl ? 1500 : 10_000;
      const maxAgeMs = opts?.maxAgeMs != null ? toNumber(opts.maxAgeMs, defaultMaxAge) : defaultMaxAge;

      const targets = Array.isArray(opts?.symbols) && opts?.symbols?.length
        ? opts.symbols
        : [
            ...positionsRaw.map((p) => p.symbol),
            ...orders.map((o) => o.symbol),
            ...watchSymbolsRef.current
          ];

      const unique = Array.from(new Set(targets.map((s) => String(s || '').trim()).filter(Boolean)));
      if (unique.length === 0) return;

      let res: any = null;
      if (api.getQuotes) {
        res = await runWithLock(() => api.getQuotes({ symbols: unique, maxAgeMs }));
      } else if (api.getQuote) {
        const quotes: any[] = [];
        for (const sym of unique) {
          const single = await runWithLock(() => api.getQuote({ symbol: sym, maxAgeMs }));
          if (single?.ok) quotes.push(single);
        }
        res = { ok: quotes.length > 0, quotes };
      }

      if (!res?.ok) {
        if (res?.rateLimited) noteRateLimit(res?.retryAtMs);
        setQuotesError(res?.error ? String(res.error) : "Failed to fetch broker quotes");
        return;
      }

      if (res?.rateLimited) noteRateLimit(res?.retryAtMs);

      const nextQuotes: Record<string, TradeLockerQuote> = {};
      const list = Array.isArray(res?.quotes) ? res.quotes : [];
      for (const item of list) {
        const sym = String(item?.symbol || '').trim();
        if (!sym) continue;
        const quote = item?.quote || {};
        nextQuotes[normalizeSymbolKey(sym)] = {
          symbol: sym,
          tradableInstrumentId: Number.isFinite(Number(item?.tradableInstrumentId)) ? Number(item.tradableInstrumentId) : null,
          routeId: Number.isFinite(Number(item?.routeId)) ? Number(item.routeId) : null,
          bid: quote?.bid ?? null,
          ask: quote?.ask ?? null,
          last: quote?.last ?? null,
          mid: quote?.mid ?? null,
          bidSize: quote?.bidSize ?? null,
          askSize: quote?.askSize ?? null,
          spread: quote?.spread ?? null,
          timestampMs: quote?.timestampMs ?? null,
          fetchedAtMs: item?.fetchedAtMs ?? null
        };
      }

      if (Object.keys(nextQuotes).length > 0) {
        const prevQuotes = quotesRef.current;
        const merged: Record<string, TradeLockerQuote> = { ...prevQuotes, ...nextQuotes };
        const allowExact = new Set(unique.map(normalizeSymbolKey));
        const allowLoose = new Set(unique.map(normalizeSymbolLoose).filter(Boolean));
        for (const key of Object.keys(merged)) {
          if (allowExact.has(key)) continue;
          if (allowLoose.size > 0) {
            const looseKey = normalizeSymbolLoose(merged[key]?.symbol || key);
            if (looseKey && allowLoose.has(looseKey)) continue;
          }
          delete merged[key];
        }
        quotesRef.current = merged;
        let didUpdate = Object.keys(merged).length !== Object.keys(prevQuotes).length;
        for (const [key, quote] of Object.entries(nextQuotes)) {
          const prev = prevQuotes[key];
          if (!shouldUpdateQuote(prev, quote)) continue;
          didUpdate = true;
          onQuoteRef.current?.(quote);
        }
        if (didUpdate) {
          quotesDirtyRef.current = true;
          scheduleQuoteFlush(200);
          setQuotesUpdatedAtMs(Date.now());
        }
      }
      setQuotesError(null);
    } catch (e: any) {
      setQuotesError(e?.message ? String(e.message) : "Failed to fetch broker quotes");
    } finally {
      quotesInFlightRef.current = false;
    }
  }, [api, accountBusyRef, isActive, noteRateLimit, orders, positionsRaw, rateLimitedUntilMs, runWithLock, scheduleQuoteFlush, shouldUpdateQuote]);

  const refreshAccountMetrics = useCallback(async () => {
    if (!api?.getAccountMetrics) return;
    if (accountBusyRef?.current) return;
    if (metricsInFlightRef.current) return;
    metricsInFlightRef.current = true;
    try {
      const isRl = rateLimitedUntilMs > Date.now();
      const res = await runWithLock(() => api.getAccountMetrics({ maxAgeMs: isActive && !isRl ? 1500 : 10_000 }));
      if (!res?.ok) {
        if (res?.rateLimited) noteRateLimit(res?.retryAtMs);
        if (res?.rateLimited && !shouldSuppressRateLimit()) {
          const rateMsg = `Rate limited. Retrying in ${formatRetryIn(res?.retryAtMs)}.`;
          setAccountMetricsError(rateMsg);
        }
        else if (res?.error) setAccountMetricsError(String(res.error));
        return;
      }
      if (res?.rateLimited) noteRateLimit(res?.retryAtMs);

      const next: TradeLockerAccountMetrics = {
        accountId: res.accountId != null ? toNumber(res.accountId, 0) : null,
        accNum: res.accNum != null ? toNumber(res.accNum, 0) : null,
        currency: res.currency != null ? String(res.currency) : null,
        balance: toNumber(res.balance, 0),
        equity: toNumber(res.equity, 0),
        openGrossPnl: res.openGrossPnl == null ? null : toNumber(res.openGrossPnl, 0),
        openNetPnl: res.openNetPnl == null ? null : toNumber(res.openNetPnl, 0),
        marginUsed: res.marginUsed == null ? null : toNumber(res.marginUsed, 0),
        marginFree: res.marginFree == null ? null : toNumber(res.marginFree, 0),
        marginLevel: res.marginLevel == null ? null : toNumber(res.marginLevel, 0),
        computedMarginLevel: !!res.computedMarginLevel,
        updatedAtMs: res.updatedAtMs != null ? toNumber(res.updatedAtMs, Date.now()) : Date.now()
      };

      setAccountMetrics(next);
      setAccountMetricsError(null);
    } catch (e: any) {
      setAccountMetricsError(e?.message ? String(e.message) : "Failed to fetch account metrics");
    } finally {
      metricsInFlightRef.current = false;
    }
  }, [api, accountBusyRef, formatRetryIn, isActive, noteRateLimit, rateLimitedUntilMs, runWithLock, shouldSuppressRateLimit]);

  const scheduleBurstRefresh = useCallback((opts?: { snapshot?: boolean; orders?: boolean; metrics?: boolean }) => {
    const state = burstRefreshRef.current;
    if (opts?.snapshot === true) state.snapshot = true;
    if (opts?.orders === true) state.orders = true;
    if (opts?.metrics === true) state.metrics = true;
    state.pending = true;
    if (state.timer || state.inFlight) return;
    state.timer = window.setTimeout(async () => {
      state.timer = null;
      if (!state.pending) return;
      const runSnapshot = state.snapshot;
      const runOrders = state.orders;
      const runMetrics = state.metrics;
      state.pending = false;
      state.snapshot = true;
      state.orders = true;
      state.metrics = true;
      state.inFlight = true;
      try {
        if (runSnapshot) await refreshSnapshot();
        if (runOrders) await refreshOrders();
        if (runMetrics) await refreshAccountMetrics();
      } finally {
        state.inFlight = false;
        if (state.pending) scheduleBurstRefresh();
      }
    }, 150);
  }, [refreshAccountMetrics, refreshOrders, refreshSnapshot]);

  const connect = useCallback(async (opts: any) => {
    const bridge = requireBridge('tradelocker.connect');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.connect) return { ok: false, error: "TradeLocker API not available" };
    setStatus("connecting");
    try {
      const res = await api.connect(opts);
      if (!res?.ok) {
        const err = res?.error ? String(res.error) : "Failed to connect";
        setStatus("error");
        setLastError(err);
        return { ok: false, error: err };
      }
      setLastError(null);
      await refreshStatus();
      await refreshSavedConfig();
      return { ok: true };
    } catch (e: any) {
      const err = e?.message ? String(e.message) : "Failed to connect";
      setStatus("error");
      setLastError(err);
      return { ok: false, error: err };
    }
  }, [api, refreshSavedConfig, refreshStatus]);

  const disconnect = useCallback(async () => {
    const bridge = requireBridge('tradelocker.disconnect');
    if (!bridge.ok) return;
    if (!api?.disconnect) return;
    try {
      if (api?.stopStream) {
        try { await api.stopStream(); } catch { /* ignore */ }
      }
      await api.disconnect();
    } catch {
      // ignore
    }
    setStatus("disconnected");
    quotesRef.current = {};
    quotesDirtyRef.current = false;
    if (quotesFlushTimerRef.current) {
      window.clearTimeout(quotesFlushTimerRef.current);
      quotesFlushTimerRef.current = null;
    }
    setQuotesBySymbol({});
    setQuotesError(null);
    setQuotesUpdatedAtMs(null);
    setStreamStatus("DISCONNECTED");
    setStreamError(null);
    setStreamReason(null);
    setStreamUpdatedAtMs(null);
    setStreamLastMessageAtMs(null);
  }, [api]);

  const setActiveAccount = useCallback(async (accountId: number, accNum: number) => {
    const bridge = requireBridge('tradelocker.set_active_account');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.setActiveAccount) return { ok: false };
    try {
      const res = await api.setActiveAccount({ accountId, accNum });
      await refreshSavedConfig();
      return res;
    } catch {
      return { ok: false };
    }
  }, [api, refreshSavedConfig]);

  const setTradingOptions = useCallback(async (options: any) => {
    const bridge = requireBridge('tradelocker.set_trading_options');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.setTradingOptions) return { ok: false, error: "TradeLocker API not available" };
    try {
      const res = await api.setTradingOptions(options);
      await refreshSavedConfig();
      return res;
    } catch (e: any) {
      return { ok: false, error: e?.message ? String(e.message) : "Failed to save TradeLocker options" };
    }
  }, [api, refreshSavedConfig]);

  const closePosition = useCallback(async (positionId: string, qty: number = 0) => {
    const bridge = requireBridge('tradelocker.close_position');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.closePosition) return { ok: false, error: "TradeLocker API not available" };
    const safeQty = toNumber(qty, 0);
    const res = await api.closePosition({ positionId, qty: safeQty });
    if (!res?.ok) {
      const err = res?.error ? String(res.error) : "Failed to close position";
      setLastError(err);
    } else {
      setLastError(null);
      refreshSnapshot();
      refreshOrders();
    }
    return res;
  }, [api, refreshOrders, refreshSnapshot]);

  const modifyPosition = useCallback(async (args: { positionId: string; stopLoss?: number | null; takeProfit?: number | null; trailingOffset?: number | null; strategyId?: string | number | null }) => {
    const bridge = requireBridge('tradelocker.modify_position');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.modifyPosition) return { ok: false, error: "TradeLocker API not available" };
    const res = await api.modifyPosition(args);
    if (!res?.ok) {
      const err = res?.error ? String(res.error) : "Failed to modify position";
      setLastError(err);
    } else {
      setLastError(null);
      refreshSnapshot();
      refreshOrders();
    }
    return res;
  }, [api, refreshOrders, refreshSnapshot]);

  const modifyOrder = useCallback(async (args: { orderId: string; price?: number | null; qty?: number | null; stopLoss?: number | null; takeProfit?: number | null; strategyId?: string | number | null }) => {
    const bridge = requireBridge('tradelocker.modify_order');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.modifyOrder) return { ok: false, error: "TradeLocker API not available" };
    const res = await api.modifyOrder(args);
    if (!res?.ok) {
      const err = res?.error ? String(res.error) : "Failed to modify order";
      setLastError(err);
    } else {
      setLastError(null);
      refreshSnapshot();
      refreshOrders();
    }
    return res;
  }, [api, refreshOrders, refreshSnapshot]);

  const cancelOrder = useCallback(async (orderId: string) => {
    const bridge = requireBridge('tradelocker.cancel_order');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.cancelOrder) return { ok: false, error: "TradeLocker API not available" };
    const res = await api.cancelOrder({ orderId });
    if (!res?.ok) {
      const err = res?.error ? String(res.error) : "Failed to cancel order";
      setLastError(err);
    } else {
      setLastError(null);
      refreshSnapshot();
      refreshOrders();
    }
    return res;
  }, [api, refreshOrders, refreshSnapshot]);

  const placeOrder = useCallback(async (args: any) => {
    const bridge = requireBridge('tradelocker.place_order');
    if (!bridge.ok) return { ok: false, error: bridge.error };
    if (!api?.placeOrder) return { ok: false, error: "TradeLocker API not available" };
    const res = await api.placeOrder(args);
    if (!res?.ok) {
      const err = res?.error ? String(res.error) : "Failed to place order";
      setLastError(err);
    } else {
      setLastError(null);
      refreshSnapshot();
      refreshOrders();
    }
    return res;
  }, [api, refreshOrders, refreshSnapshot]);

  const searchInstruments = useCallback(async (query: string, limit: number = 12): Promise<TradeLockerInstrumentSuggestion[]> => {
    const bridge = requireBridge('tradelocker.search_instruments');
    if (!bridge.ok) return [];
    if (!api?.searchInstruments) return [];
    const q = String(query || "").trim();
    if (!q) return [];
    try {
      const res = await api.searchInstruments({ query: q, limit });
      if (res?.ok && Array.isArray(res.results)) return res.results as TradeLockerInstrumentSuggestion[];
      return [];
    } catch {
      return [];
    }
  }, [api]);

  const connectionMeta = useMemo(() => {
    if (status === "connected") return { dot: "bg-green-500", label: "CONNECTED" };
    if (status === "connecting") return { dot: "bg-yellow-500 animate-pulse", label: "CONNECTING..." };
    if (status === "error") return { dot: "bg-red-500 animate-pulse", label: "ERROR" };
    return { dot: "bg-gray-600", label: "DISCONNECTED" };
  }, [status]);

  useEffect(() => {
    if (!startupBridgeOperational) return;
    refreshSavedConfig();
    refreshStatus();
  }, [refreshSavedConfig, refreshStatus, startupBridgeOperational]);

  useEffect(() => {
    if (savedConfigTimerRef.current) {
      savedConfigTimerRef.current();
      savedConfigTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    savedConfigTimerRef.current = runtimeScheduler.registerTask({
      id: "tradelocker.saved_config.refresh",
      groupId: "broker",
      intervalMs: 20_000,
      jitterPct: 0.1,
      visibilityMode: "always",
      priority: "low",
      run: async () => {
        await refreshSavedConfig();
      }
    });
    return () => {
      if (savedConfigTimerRef.current) savedConfigTimerRef.current();
      savedConfigTimerRef.current = null;
    };
  }, [refreshSavedConfig, runtimeScheduler, startupBridgeOperational]);

  useEffect(() => {
    if (autoConnectAttemptedRef.current) return;
    if (!startupBridgeReady) return;
    if (startupPhase === "booting") return;
    if (status === "connected" || status === "connecting") return;
    if (!savedConfig?.hasSavedPassword) return;

    const server = String(savedConfig?.server || "").trim();
    const email = String(savedConfig?.email || "").trim();
    if (!server || !email || savedConfig?.accountId == null) return;

    autoConnectAttemptedRef.current = true;
    setStartupAutoRestore({
      attempted: true,
      success: false,
      error: null,
      atMs: Date.now()
    });
    void connect({
      env: savedConfig.env,
      server,
      email,
      password: "",
      rememberPassword: false,
      rememberDeveloperApiKey: false
    }).then((res) => {
      setStartupAutoRestore((prev) => ({
        attempted: true,
        success: !!res?.ok,
        error: res?.ok ? null : String(res?.error || "TradeLocker auto-restore failed."),
        atMs: prev.atMs || Date.now()
      }));
    });
  }, [connect, savedConfig, startupBridgeReady, startupPhase, status]);

  useEffect(() => {
    if (statusTimerRef.current) {
      statusTimerRef.current();
      statusTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    statusTimerRef.current = runtimeScheduler.registerTask({
      id: "tradelocker.status.refresh",
      groupId: "broker",
      intervalMs: 10_000,
      jitterPct: 0.1,
      visibilityMode: "always",
      priority: "normal",
      run: async () => {
        await refreshStatus();
      }
    });
    return () => {
      if (statusTimerRef.current) statusTimerRef.current();
      statusTimerRef.current = null;
    };
  }, [refreshStatus, runtimeScheduler, startupBridgeOperational]);

  useEffect(() => {
    if (!startupBridgeOperational) return;
    if (!api?.startStream || !api?.stopStream) return;
    if (status !== "connected") {
      api.stopStream().catch(() => {});
      setStreamStatus("DISCONNECTED");
      setStreamError(null);
      setStreamReason(null);
      return;
    }
    if (!savedConfig) return;

    const enabled = !!savedConfig.streamingEnabled && isActive;
    const shouldRestart = streamConfigKeyRef.current && streamConfigKeyRef.current !== streamConfigKey;
    streamConfigKeyRef.current = streamConfigKey;

    const run = async () => {
      if (!enabled) {
        const res = await api.stopStream().catch((err: any) => ({ ok: false, error: err?.message }));
        if (res && res.ok === false && res.error) {
          setStreamStatus("ERROR");
          setStreamError(String(res.error));
        }
        await refreshStreamStatus();
        return;
      }

      if (shouldRestart) {
        await api.stopStream().catch(() => {});
      }
      const res = await api.startStream().catch((err: any) => ({ ok: false, error: err?.message }));
      if (res && res.ok === false && res.error) {
        setStreamStatus("ERROR");
        setStreamError(String(res.error));
      }
      await refreshStreamStatus();
    };

    run();
  }, [api, isActive, refreshStreamStatus, savedConfig, startupBridgeOperational, status, streamConfigKey]);

  useEffect(() => {
    if (streamStatusTimerRef.current) {
      streamStatusTimerRef.current();
      streamStatusTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    if (status !== "connected") return;
    if (!api?.getStreamStatus) return;
    const kickoff = window.setTimeout(() => {
      refreshStreamStatus();
      streamStatusTimerRef.current = runtimeScheduler.registerTask({
        id: "tradelocker.stream.status.refresh",
        groupId: "broker",
        intervalMs: 12_000,
        jitterPct: 0.1,
        visibilityMode: "always",
        priority: "normal",
        run: async () => {
          await refreshStreamStatus();
        }
      });
    }, 1500);
    return () => {
      if (streamStatusTimerRef.current) streamStatusTimerRef.current();
      streamStatusTimerRef.current = null;
      window.clearTimeout(kickoff);
    };
  }, [api, refreshStreamStatus, runtimeScheduler, startupBridgeOperational, status]);

  useEffect(() => {
    if (pollTimerRef.current) {
      pollTimerRef.current();
      pollTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    if (status !== "connected") return;
    if (!isActive) return;

    const hasOpenPositions = positions.length > 0;
    const isRl = rateLimitedUntilMs > Date.now();
    const streamConnected = isStreamConnectedStatus(streamStatus);
    const interval = streamConnected
      ? 15000
      : isRl
        ? 15000
        : hasOpenPositions
          ? 2500
          : 12000;
    pollTimerRef.current = runtimeScheduler.registerTask({
      id: "tradelocker.snapshot.refresh",
      groupId: "broker",
      intervalMs: interval,
      jitterPct: 0.12,
      visibilityMode: "foreground",
      priority: "high",
      run: async () => {
        await refreshSnapshot();
      }
    });
    refreshSnapshot();
    return () => {
      if (pollTimerRef.current) pollTimerRef.current();
      pollTimerRef.current = null;
    };
  }, [isActive, positions.length, rateLimitedUntilMs, refreshSnapshot, runtimeScheduler, startupBridgeOperational, status, streamStatus]);

  useEffect(() => {
    if (ordersTimerRef.current) {
      ordersTimerRef.current();
      ordersTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    if (status !== "connected") return;
    if (!isActive) return;

    const isRl = rateLimitedUntilMs > Date.now();
    const streamConnected = isStreamConnectedStatus(streamStatus);
    const interval = streamConnected ? (isRl ? 60_000 : 45_000) : (isRl ? 45_000 : 30_000);
    const kickoff = window.setTimeout(() => {
      refreshOrders();
      ordersTimerRef.current = runtimeScheduler.registerTask({
        id: "tradelocker.orders.refresh",
        groupId: "broker",
        intervalMs: interval,
        jitterPct: 0.12,
        visibilityMode: "foreground",
        priority: "normal",
        run: async () => {
          await refreshOrders();
        }
      });
    }, streamConnected ? (isRl ? 8_000 : 4_000) : (isRl ? 6_000 : 2_500));
    return () => {
      if (ordersTimerRef.current) ordersTimerRef.current();
      ordersTimerRef.current = null;
      window.clearTimeout(kickoff);
    };
  }, [isActive, rateLimitedUntilMs, refreshOrders, runtimeScheduler, startupBridgeOperational, status, streamStatus]);

  useEffect(() => {
    if (ordersHistoryTimerRef.current) {
      ordersHistoryTimerRef.current();
      ordersHistoryTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    if (status !== "connected") return;
    if (!isActive) return;
    if (!api?.getOrdersHistory) return;

    const isRl = rateLimitedUntilMs > Date.now();
    const streamConnected = isStreamConnectedStatus(streamStatus);
    const interval = streamConnected ? (isRl ? 120_000 : 60_000) : (isRl ? 90_000 : 45_000);
    const kickoff = window.setTimeout(() => {
      refreshOrdersHistory();
      ordersHistoryTimerRef.current = runtimeScheduler.registerTask({
        id: "tradelocker.orders-history.refresh",
        groupId: "broker",
        intervalMs: interval,
        jitterPct: 0.12,
        visibilityMode: "foreground",
        priority: "low",
        run: async () => {
          await refreshOrdersHistory();
        }
      });
    }, streamConnected ? (isRl ? 12_000 : 6_000) : (isRl ? 9_000 : 4_000));
    return () => {
      if (ordersHistoryTimerRef.current) ordersHistoryTimerRef.current();
      ordersHistoryTimerRef.current = null;
      window.clearTimeout(kickoff);
    };
  }, [api, isActive, rateLimitedUntilMs, refreshOrdersHistory, runtimeScheduler, startupBridgeOperational, status, streamStatus]);

  useEffect(() => {
    if (metricsTimerRef.current) {
      metricsTimerRef.current();
      metricsTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    if (status !== "connected") return;
    if (!isActive) return;

    const hasOpenPositions = positions.length > 0;
    const isRl = rateLimitedUntilMs > Date.now();
    const streamConnected = isStreamConnectedStatus(streamStatus);
    const interval = streamConnected
      ? (isRl ? 45_000 : 30_000)
      : (isRl ? 20_000 : hasOpenPositions ? 12_000 : 15_000);
    const kickoff = window.setTimeout(() => {
      refreshAccountMetrics();
      metricsTimerRef.current = runtimeScheduler.registerTask({
        id: "tradelocker.metrics.refresh",
        groupId: "broker",
        intervalMs: interval,
        jitterPct: 0.12,
        visibilityMode: "foreground",
        priority: "normal",
        run: async () => {
          await refreshAccountMetrics();
        }
      });
    }, streamConnected ? (isRl ? 6_000 : 3_000) : (isRl ? 4_000 : 1_200));
    return () => {
      if (metricsTimerRef.current) metricsTimerRef.current();
      metricsTimerRef.current = null;
      window.clearTimeout(kickoff);
    };
  }, [isActive, positions.length, rateLimitedUntilMs, refreshAccountMetrics, runtimeScheduler, startupBridgeOperational, status, streamStatus]);

  useEffect(() => {
    if (quotesTimerRef.current) {
      quotesTimerRef.current();
      quotesTimerRef.current = null;
    }
    if (!startupBridgeOperational) return;
    if (status !== "connected") return;
    if (!isActive) return;

    const hasTargets = positionsRaw.length > 0 || orders.length > 0 || watchSymbols.length > 0;
    const isRl = rateLimitedUntilMs > Date.now();
    const streamConnected = isStreamConnectedStatus(streamStatus);
    const interval = streamConnected
      ? (isRl ? 20_000 : hasTargets ? 12_000 : 15_000)
      : (isRl ? 15000 : hasTargets ? 2500 : 10_000);
    const kickoff = window.setTimeout(() => {
      refreshQuotes();
      quotesTimerRef.current = runtimeScheduler.registerTask({
        id: "tradelocker.quotes.refresh",
        groupId: "broker",
        intervalMs: interval,
        jitterPct: 0.12,
        visibilityMode: "foreground",
        priority: hasTargets ? "high" : "normal",
        run: async () => {
          await refreshQuotes();
        }
      });
    }, streamConnected ? (isRl ? 6_000 : 3_000) : (isRl ? 5_000 : 1_500));

    return () => {
      if (quotesTimerRef.current) quotesTimerRef.current();
      quotesTimerRef.current = null;
      window.clearTimeout(kickoff);
    };
  }, [isActive, orders.length, positionsRaw.length, rateLimitedUntilMs, refreshQuotes, runtimeScheduler, startupBridgeOperational, status, watchSymbols.length, streamStatus]);

  useEffect(() => {
    if (!startupBridgeOperational) return;
    if (status !== "connected") return;
    if (!isActive) return;
    if (watchSymbols.length === 0) return;
    refreshQuotes({ symbols: watchSymbols, maxAgeMs: 0 });
  }, [isActive, refreshQuotes, startupBridgeOperational, status, watchSymbols]);

  useEffect(() => {
    if (!startupBridgeOperational) return;
    if (!api?.onStreamEvent) return;
    if (status !== "connected") {
      setStreamStatus("DISCONNECTED");
      setStreamError(null);
      setStreamReason(null);
      return;
    }

    const requestRefresh = () => {
      const now = Date.now();
      if (now - streamRefreshAtRef.current < 2000) return;
      streamRefreshAtRef.current = now;
      scheduleBurstRefresh({ snapshot: true, orders: true, metrics: true });
    };

    const unsubscribe = api.onStreamEvent((evt: any) => {
      if (!evt) return;
      const type = String(evt?.type || "").toLowerCase();
      const atMs = Number(evt?.atMs) || Date.now();
      const revision = Number(evt?.streamSyncRevision);
      if (Number.isFinite(revision) && revision > 0) {
        if (revision < streamRevisionRef.current) return;
        if (revision > streamRevisionRef.current) streamRevisionRef.current = revision;
      }
      const lastMessageAt = toNumber(evt?.lastMessageAtMs, 0);
      if (lastMessageAt > 0) setStreamLastMessageAtMs(lastMessageAt);
      if (type === "stream_status") {
        const next = normalizeStreamStatus(evt?.status || "connected");
        const reason = evt?.reason != null ? String(evt.reason) : null;
        const detail = evt?.detail != null ? String(evt.detail) : null;
        setStreamStatus(next);
        setStreamReason(reason);
        if (detail) setStreamError(detail);
        else if (reason) setStreamError(reason);
        else if (next !== "ERROR") setStreamError(null);
        setStreamUpdatedAtMs(atMs);
        return;
      }
      if (type === "stream_error") {
        const reason = evt?.reason != null ? String(evt.reason) : null;
        const message = evt?.message != null ? String(evt.message) : (evt?.error ? String(evt.error) : null);
        setStreamStatus("ERROR");
        setStreamReason(reason);
        setStreamError(message || reason || "Stream error");
        setStreamUpdatedAtMs(atMs);
        return;
      }
      if (type === "quote") {
        const sym = String(evt?.symbol || evt?.quote?.symbol || "").trim();
        if (!sym) return;
        const quote = evt?.quote || {};
        const fetchedAtMs = atMs;
        const key = normalizeSymbolKey(sym);
        if (!key) return;
        const nextQuote: TradeLockerQuote = {
          symbol: sym,
          bid: quote?.bid ?? null,
          ask: quote?.ask ?? null,
          last: quote?.last ?? null,
          mid: quote?.mid ?? null,
          bidSize: quote?.bidSize ?? null,
          askSize: quote?.askSize ?? null,
          spread: quote?.spread ?? null,
          timestampMs: quote?.timestampMs ?? null,
          fetchedAtMs
        };
        const prev = quotesRef.current[key];
        if (!shouldUpdateQuote(prev, nextQuote)) return;
        quotesRef.current[key] = nextQuote;
        quotesDirtyRef.current = true;
        scheduleQuoteFlush(150);
        onQuoteRef.current?.(nextQuote);
        setQuotesUpdatedAtMs(Date.now());
        setQuotesError(null);
        setStreamError(null);
        setStreamReason(null);
        setStreamUpdatedAtMs(atMs);
        return;
      }

      if (type === "positions") {
        const list = Array.isArray(evt?.positions) ? evt.positions : [];
        const hasId = list.some((item) => !!getStreamPositionId(item));
        if (list.length > 0 && !hasId) {
          requestRefresh();
          setStreamUpdatedAtMs(atMs);
          return;
        }
        if (list.some((item) => !getStreamPositionId(item))) requestRefresh();
        setPositionsRaw((prev) => mergePositionsFromStream(prev, list, true));
        setSnapshotUpdatedAtMs(atMs);
        setLastError(null);
        setStreamError(null);
        setStreamReason(null);
        setStreamUpdatedAtMs(atMs);
        return;
      }

      if (type === "position") {
        const raw = evt?.position || evt?.data || evt;
        if (!getStreamPositionId(raw)) {
          requestRefresh();
          setStreamUpdatedAtMs(atMs);
          return;
        }
        setPositionsRaw((prev) => mergePositionsFromStream(prev, [raw], false));
        setSnapshotUpdatedAtMs(atMs);
        setLastError(null);
        setStreamError(null);
        setStreamReason(null);
        setStreamUpdatedAtMs(atMs);
        return;
      }

      if (type === "orders") {
        const list = Array.isArray(evt?.orders) ? evt.orders : [];
        const hasId = list.some((item) => !!getStreamOrderId(item));
        if (list.length > 0 && !hasId) {
          requestRefresh();
          setStreamUpdatedAtMs(atMs);
          return;
        }
        if (list.some((item) => !getStreamOrderId(item))) requestRefresh();
        setOrders((prev) => mergeOrdersFromStream(prev, list, true));
        setOrdersError(null);
        setLastError(null);
        setStreamError(null);
        setStreamReason(null);
        setStreamUpdatedAtMs(atMs);
        return;
      }

      if (type === "order") {
        const raw = evt?.order || evt?.data || evt;
        if (!getStreamOrderId(raw)) {
          requestRefresh();
          setStreamUpdatedAtMs(atMs);
          return;
        }
        setOrders((prev) => mergeOrdersFromStream(prev, [raw], false));
        setOrdersError(null);
        setLastError(null);
        setStreamError(null);
        setStreamReason(null);
        setStreamUpdatedAtMs(atMs);
        return;
      }

      if (type === "account") {
        const raw = evt?.account || evt?.data || evt;
        setAccountMetrics((prev) => {
          const next = mapStreamAccountMetrics(raw, prev, atMs);
          if (!next) return prev;
          setBalance(next.balance ?? 0);
          setEquity(next.equity ?? 0);
          return next;
        });
        setAccountMetricsError(null);
        setLastError(null);
        setStreamError(null);
        setStreamReason(null);
        setStreamUpdatedAtMs(atMs);
        return;
      }
    });

    return () => {
      try { unsubscribe?.(); } catch { /* ignore */ }
    };
  }, [api, refreshAccountMetrics, refreshOrders, refreshSnapshot, scheduleBurstRefresh, scheduleQuoteFlush, shouldUpdateQuote, startupBridgeOperational, status]);

  useEffect(() => {
    if (!startupBridgeOperational) return;
    const eventName = GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED;
    const onAccountChanged = (evt: Event) => {
      const custom = evt as CustomEvent<any>;
      const detail = custom?.detail && typeof custom.detail === 'object' ? custom.detail : {};
      const accountId = Number(detail?.accountId);
      const accNum = Number(detail?.accNum);
      if (Number.isFinite(accountId) && Number.isFinite(accNum)) {
        setSavedConfig((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            accountId,
            accNum
          };
        });
      }
      const now = Date.now();
      if (now - accountSwitchRefreshAtRef.current < 400) return;
      accountSwitchRefreshAtRef.current = now;
      void (async () => {
        await refreshSavedConfig();
        await refreshAccounts();
        if (status === "connected") {
          await refreshSnapshot();
          await refreshOrders();
          await refreshAccountMetrics();
          await refreshQuotes();
        }
      })();
    };
    window.addEventListener(eventName, onAccountChanged as EventListener);
    return () => {
      window.removeEventListener(eventName, onAccountChanged as EventListener);
    };
  }, [
    refreshAccountMetrics,
    refreshAccounts,
    refreshOrders,
    refreshQuotes,
    refreshSavedConfig,
    refreshSnapshot,
    startupBridgeOperational,
    status
  ]);

  return {
    status,
    connectionMeta,
    lastError,
    savedConfig,
    accounts,
    accountsError,
    balance,
    equity,
    positions,
    orders,
    ordersError,
    ordersHistory,
    ordersHistoryError,
    accountMetrics,
    accountMetricsError,
    snapshotUpdatedAtMs,
    upstreamBlockedUntilMs,
    upstreamLastError,
    upstreamLastStatus,
    statusMeta,
    quotesBySymbol,
    quotesError,
    quotesUpdatedAtMs,
    streamStatus,
    streamError,
    streamUpdatedAtMs,
    streamReason,
    streamLastMessageAtMs,
    startupAutoRestore,
    refreshStatus,
    refreshStreamStatus,
    refreshSavedConfig,
    refreshAccounts,
    refreshSnapshot,
    refreshAccountMetrics,
    connect,
    disconnect,
    setActiveAccount,
    setTradingOptions,
    closePosition,
    modifyPosition,
    modifyOrder,
    cancelOrder,
    placeOrder,
    refreshOrders,
    refreshOrdersHistory,
    refreshQuotes,
    searchInstruments
  };
}
