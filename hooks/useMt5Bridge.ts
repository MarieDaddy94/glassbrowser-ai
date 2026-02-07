import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRuntimeScheduler } from "../services/runtimeScheduler";

export type Mt5BridgeConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface Mt5Tick {
  symbol: string;
  time?: number | null;
  time_msc?: number | null;
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  last?: number | null;
  volume?: number | null;
  volume_real?: number | null;
  flags?: number | null;
  spread?: number | null;
  local_ts_ms?: number | null;
}

export interface Mt5Position {
  ticket?: number | null;
  symbol?: string | null;
  type?: number | null;
  volume?: number | null;
  price_open?: number | null;
  sl?: number | null;
  tp?: number | null;
  profit?: number | null;
  time?: number | null;
  time_update?: number | null;
  comment?: string | null;
  magic?: number | null;
  [key: string]: any;
}

export interface Mt5Order {
  ticket?: number | null;
  symbol?: string | null;
  type?: number | null;
  volume_current?: number | null;
  price_open?: number | null;
  sl?: number | null;
  tp?: number | null;
  state?: number | null;
  time_setup?: number | null;
  time_expiration?: number | null;
  comment?: string | null;
  magic?: number | null;
  [key: string]: any;
}

export interface Mt5Deal {
  ticket?: number | null;
  order?: number | null;
  position_id?: number | null;
  symbol?: string | null;
  type?: number | null;
  entry?: number | null;
  volume?: number | null;
  price?: number | null;
  profit?: number | null;
  time?: number | null;
  comment?: string | null;
  [key: string]: any;
}

const STORAGE = {
  wsUrl: "glass_mt5_bridge_ws_url",
  symbolsText: "glass_mt5_symbols_text"
};

const DEFAULT_WS_URL = "ws://127.0.0.1:8001/ws/ticks";
const DEFAULT_SYMBOLS = "EURUSD\nGBPUSD\nUSDJPY";
const DEFAULT_HISTORY_DAYS = 30;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function parseSymbols(text: string): string[] {
  return text
    .split(/[\s,]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function formatMt5TradeError(res: { data?: any; error?: string }, fallback: string) {
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
}

export function useMt5Bridge() {
  const [wsUrl, setWsUrl] = useState(() => safeGet(STORAGE.wsUrl) || DEFAULT_WS_URL);
  const [symbolsText, setSymbolsText] = useState(() => safeGet(STORAGE.symbolsText) || DEFAULT_SYMBOLS);
  const [status, setStatus] = useState<Mt5BridgeConnectionStatus>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [ticksBySymbol, setTicksBySymbol] = useState<Record<string, Mt5Tick>>({});
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [bridgeHealthy, setBridgeHealthy] = useState<boolean | null>(null);
  const [symbolResults, setSymbolResults] = useState<string[]>([]);
  const [symbolResultsQuery, setSymbolResultsQuery] = useState<string>("");
  const [account, setAccount] = useState<Record<string, any> | null>(null);
  const [accountUpdatedAtMs, setAccountUpdatedAtMs] = useState<number | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Mt5Position[]>([]);
  const [positionsUpdatedAtMs, setPositionsUpdatedAtMs] = useState<number | null>(null);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Mt5Order[]>([]);
  const [ordersUpdatedAtMs, setOrdersUpdatedAtMs] = useState<number | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [history, setHistory] = useState<Mt5Deal[]>([]);
  const [historyUpdatedAtMs, setHistoryUpdatedAtMs] = useState<number | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const symbolSearchRequestIdRef = useRef<string | null>(null);

  const pingTaskDisposeRef = useRef<(() => void) | null>(null);
  const pendingPingAtRef = useRef<number | null>(null);

  const symbols = useMemo(() => parseSymbols(symbolsText), [symbolsText]);
  const symbolsRef = useRef<string[]>(symbols);
  useEffect(() => {
    symbolsRef.current = symbols;
  }, [symbols]);

  const httpBaseUrl = useMemo(() => {
    try {
      const parsed = new URL(wsUrl);
      const scheme = parsed.protocol === "wss:" ? "https:" : "http:";
      return `${scheme}//${parsed.host}`;
    } catch {
      return "http://127.0.0.1:8001";
    }
  }, [wsUrl]);

  useEffect(() => {
    safeSet(STORAGE.wsUrl, wsUrl);
  }, [wsUrl]);

  useEffect(() => {
    safeSet(STORAGE.symbolsText, symbolsText);
  }, [symbolsText]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTaskDisposeRef.current) {
      pingTaskDisposeRef.current();
      pingTaskDisposeRef.current = null;
    }
    pendingPingAtRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    clearTimers();
    const ws = wsRef.current;
    wsRef.current = null;
    try {
      ws?.close();
    } catch {
      // ignore
    }
    setStatus("disconnected");
  }, [clearTimers]);

  const send = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }, []);

  const applySubscriptions = useCallback((nextSymbols: string[]) => {
    send({ type: "set_subscriptions", symbols: nextSymbols });
  }, [send]);

  const searchSymbols = useCallback((query: string, limit: number = 80) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLastError("Connect to the bridge to search symbols");
      return;
    }
    const request_id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    symbolSearchRequestIdRef.current = request_id;
    setSymbolResults([]);
    setSymbolResultsQuery(query);
    send({ type: "list_symbols", query, limit, request_id });
  }, [send]);

  const fetchJson = useCallback(async (path: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${httpBaseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {})
        },
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    } catch (err: any) {
      return { ok: false, error: err?.message ? String(err.message) : "Request failed" };
    } finally {
      window.clearTimeout(timeout);
    }
  }, [httpBaseUrl]);

  const refreshAccount = useCallback(async () => {
    setAccountError(null);
    const res = await fetchJson("/account");
    if (!res.ok) {
      setAccountError(res.data?.error || res.error || "Account unavailable");
      return { ok: false as const, error: res.data?.error || res.error || "Account unavailable" };
    }
    setAccount(res.data?.account ?? null);
    setAccountUpdatedAtMs(Date.now());
    return { ok: true as const, data: res.data };
  }, [fetchJson]);

  const refreshPositions = useCallback(async () => {
    setPositionsError(null);
    const res = await fetchJson("/positions");
    if (!res.ok) {
      setPositionsError(res.data?.error || res.error || "Positions unavailable");
      return { ok: false as const, error: res.data?.error || res.error || "Positions unavailable" };
    }
    const list = Array.isArray(res.data?.positions) ? res.data.positions : [];
    setPositions(list as Mt5Position[]);
    setPositionsUpdatedAtMs(Date.now());
    return { ok: true as const, data: res.data };
  }, [fetchJson]);

  const refreshOrders = useCallback(async () => {
    setOrdersError(null);
    const res = await fetchJson("/orders");
    if (!res.ok) {
      setOrdersError(res.data?.error || res.error || "Orders unavailable");
      return { ok: false as const, error: res.data?.error || res.error || "Orders unavailable" };
    }
    const list = Array.isArray(res.data?.orders) ? res.data.orders : [];
    setOrders(list as Mt5Order[]);
    setOrdersUpdatedAtMs(Date.now());
    return { ok: true as const, data: res.data };
  }, [fetchJson]);

  const refreshHistory = useCallback(async (opts?: { days?: number; limit?: number }) => {
    setHistoryError(null);
    const days = Number.isFinite(Number(opts?.days)) ? Number(opts?.days) : DEFAULT_HISTORY_DAYS;
    const limit = Number.isFinite(Number(opts?.limit)) ? Number(opts?.limit) : 400;
    const res = await fetchJson(`/history?days=${days}&limit=${limit}`);
    if (!res.ok) {
      setHistoryError(res.data?.error || res.error || "History unavailable");
      return { ok: false as const, error: res.data?.error || res.error || "History unavailable" };
    }
    const list = Array.isArray(res.data?.deals) ? res.data.deals : [];
    setHistory(list as Mt5Deal[]);
    setHistoryUpdatedAtMs(Date.now());
    return { ok: true as const, data: res.data };
  }, [fetchJson]);

  const placeOrder = useCallback(async (payload: Record<string, any>) => {
    setTradeError(null);
    const res = await fetchJson("/order", {
      method: "POST",
      body: JSON.stringify(payload || {})
    });
    if (!res.ok || res.data?.ok === false) {
      const err = formatMt5TradeError(res, "Order failed");
      setTradeError(err);
      return { ok: false as const, error: err, data: res.data };
    }
    return { ok: true as const, data: res.data };
  }, [fetchJson]);

  const cancelOrder = useCallback(async (payload: Record<string, any>) => {
    setTradeError(null);
    const res = await fetchJson("/order/cancel", {
      method: "POST",
      body: JSON.stringify(payload || {})
    });
    if (!res.ok || res.data?.ok === false) {
      const err = formatMt5TradeError(res, "Cancel failed");
      setTradeError(err);
      return { ok: false as const, error: err, data: res.data };
    }
    return { ok: true as const, data: res.data };
  }, [fetchJson]);

  const closePosition = useCallback(async (payload: Record<string, any>) => {
    setTradeError(null);
    const res = await fetchJson("/position/close", {
      method: "POST",
      body: JSON.stringify(payload || {})
    });
    if (!res.ok || res.data?.ok === false) {
      const err = formatMt5TradeError(res, "Close failed");
      setTradeError(err);
      return { ok: false as const, error: err, data: res.data };
    }
    return { ok: true as const, data: res.data };
  }, [fetchJson]);

  const refreshBridgeStatus = useCallback(async () => {
    const api = window.glass?.mt5;
    if (!api?.getBridgeStatus) return null;
    try {
      const res = await api.getBridgeStatus();
      if (typeof res?.healthy === "boolean") setBridgeHealthy(res.healthy);
      return res;
    } catch {
      setBridgeHealthy(false);
      return null;
    }
  }, []);

  const startBridge = useCallback(async () => {
    const api = window.glass?.mt5;
    if (!api?.startBridge) return null;
    try {
      const res = await api.startBridge();
      await refreshBridgeStatus();
      if (res && res.ok === false) {
        setBridgeHealthy(false);
        setLastError(res.error ? String(res.error) : "Failed to start bridge");
      }
      return res;
    } catch (e: any) {
      setBridgeHealthy(false);
      setLastError(e?.message ? String(e.message) : "Failed to start bridge");
      return null;
    }
  }, [refreshBridgeStatus]);

  const openBridgeLog = useCallback(async () => {
    const api = window.glass?.mt5;
    if (!api?.openBridgeLog) return;
    try {
      await api.openBridgeLog();
    } catch {
      // ignore
    }
  }, []);

  const scheduleReconnect = useCallback((url: string) => {
    if (manualCloseRef.current) return;
    if (reconnectTimerRef.current) return;

    const attempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = attempt;
    const delayMs = Math.min(10_000, 500 * Math.pow(1.6, attempt));
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connect(url);
    }, delayMs);
  }, []);

  const connect = useCallback(async (url?: string) => {
    let nextUrl = (url || wsUrl).trim();
    if (!nextUrl) return;

    manualCloseRef.current = false;
    clearTimers();
    setLastError(null);
    setLatencyMs(null);
    setStatus("connecting");

    if (typeof window !== "undefined") {
      const isLocal = /^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/ws\/ticks/i.test(nextUrl);
      if (isLocal) {
        const res = await startBridge();
        if (res && res.ok === false) {
          setStatus("error");
          return;
        }
        if (res && typeof res.port === "number" && Number.isFinite(res.port)) {
          const normalized = `ws://127.0.0.1:${res.port}/ws/ticks`;
          if (/^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/ws\/ticks/i.test(nextUrl) && normalized !== nextUrl) {
            setWsUrl(normalized);
            nextUrl = normalized;
          }
        }
      }
    }

    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }

    const ws = new WebSocket(nextUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      setStatus("connected");
      applySubscriptions(symbolsRef.current);

      const scheduler = getRuntimeScheduler();
      pingTaskDisposeRef.current = scheduler.registerTask({
        id: "mt5-bridge.ping",
        groupId: "execution",
        intervalMs: 5_000,
        jitterPct: 0.08,
        visibilityMode: "always",
        priority: "high",
        run: async () => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          pendingPingAtRef.current = Date.now();
          send({ type: "ping" });
        }
      });
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      const type = (msg?.type || "").toString();
      if (type === "tick" && msg?.symbol) {
        const symbol = msg.symbol.toString();
        const tick: Mt5Tick = { ...msg, symbol };
        setTicksBySymbol(prev => ({ ...prev, [symbol]: tick }));
        return;
      }

      if (type === "subscriptions" && Array.isArray(msg?.symbols)) {
        setSubscriptions(msg.symbols.map((s: any) => String(s)));
        return;
      }

      if (type === "symbols" && Array.isArray(msg?.symbols)) {
        const reqId = msg?.request_id ? String(msg.request_id) : null;
        if (reqId && symbolSearchRequestIdRef.current && reqId !== symbolSearchRequestIdRef.current) return;
        setSymbolResults(msg.symbols.map((s: any) => String(s)));
        setSymbolResultsQuery(msg?.query ? String(msg.query) : "");
        return;
      }

      if (type === "pong") {
        const sentAt = pendingPingAtRef.current;
        if (sentAt) setLatencyMs(Date.now() - sentAt);
        pendingPingAtRef.current = null;
        return;
      }

      if (type === "symbol_error") {
        const code = msg?.last_error?.code;
        const codeText = typeof code === "number" ? ` (code ${code})` : "";
        const lastErrMsg = msg?.last_error?.message ? String(msg.last_error.message) : "";
        const suffix = lastErrMsg ? ` - ${lastErrMsg}` : "";
        setLastError(`${msg.symbol || ""} ${msg.message || "symbol error"}${codeText}${suffix}`.trim());
        if (Array.isArray(msg?.suggestions) && msg.suggestions.length > 0) {
          setSymbolResults(msg.suggestions.map((s: any) => String(s)));
          setSymbolResultsQuery(msg?.symbol ? String(msg.symbol) : "");
        }
        return;
      }

      if (type === "symbol_resolved" && msg?.requested && msg?.symbol) {
        const requested = String(msg.requested).trim();
        const actual = String(msg.symbol).trim();
        if (requested && actual) {
          const requestedLower = requested.toLowerCase();
          setSymbolsText(prev => {
            const parts = parseSymbols(prev);
            let changed = false;
            const next: string[] = [];

            for (const part of parts) {
              const updated = part.toLowerCase() === requestedLower ? actual : part;
              if (updated !== part) changed = true;
              if (!next.includes(updated)) next.push(updated);
            }

            return changed ? next.join("\n") : prev;
          });
        }
        return;
      }

      if (type === "error") {
        setLastError(msg.message ? String(msg.message) : "Bridge error");
        setStatus("error");
        return;
      }
    };

    ws.onerror = () => {
      setLastError("WebSocket error");
      setStatus("error");
    };

    ws.onclose = (event) => {
      clearTimers();
      wsRef.current = null;
      if (manualCloseRef.current) {
        setStatus("disconnected");
        return;
      }
      setLastError(`WebSocket closed (code ${event.code})`);
      setStatus("error");
      scheduleReconnect(nextUrl);
    };
  }, [applySubscriptions, clearTimers, scheduleReconnect, send, startBridge, wsUrl, setWsUrl]);

  const setAndApplySubscriptions = useCallback((text: string) => {
    setSymbolsText(text);
    const nextSymbols = parseSymbols(text);
    setSubscriptions(nextSymbols);
    applySubscriptions(nextSymbols);
  }, [applySubscriptions]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    wsUrl,
    setWsUrl,
    symbolsText,
    setSymbolsText,
    symbols,
    status,
    lastError,
    latencyMs,
    bridgeHealthy,
    symbolResults,
    symbolResultsQuery,
    ticksBySymbol,
    subscriptions,
    account,
    accountUpdatedAtMs,
    accountError,
    positions,
    positionsUpdatedAtMs,
    positionsError,
    orders,
    ordersUpdatedAtMs,
    ordersError,
    history,
    historyUpdatedAtMs,
    historyError,
    tradeError,
    connect,
    disconnect,
    setAndApplySubscriptions,
    searchSymbols,
    refreshBridgeStatus,
    startBridge,
    openBridgeLog,
    refreshAccount,
    refreshPositions,
    refreshOrders,
    refreshHistory,
    placeOrder,
    cancelOrder,
    closePosition
  };
}
