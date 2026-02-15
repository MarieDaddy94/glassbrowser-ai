import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, PlugZap, Plus, RefreshCw, Search, XCircle } from "lucide-react";
import { useMt5Bridge } from "../hooks/useMt5Bridge";
import NativeChartInterface, { NativeChartHandle } from "./NativeChartInterface";
import { normalizeSymbolKey } from "../services/symbols";
import { Position, TradeLockerOrder } from "../types";
import { createPanelActionRunner } from "../services/panelConnectivityEngine";
import { requestBrokerCoordinated } from "../services/brokerRequestBridge";
import { GLASS_EVENT } from "../services/glassEvents";
import type { SymbolMapEntry } from "../services/brokerLink";

interface MT5InterfaceProps {
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  defaultSymbol?: string | null;
  symbolMap?: SymbolMapEntry[];
}

type TicketSide = "BUY" | "SELL";
type TicketType = "market" | "limit" | "stop";

const ORDER_TYPE_LABELS: Record<number, string> = {
  0: "BUY",
  1: "SELL",
  2: "BUY LIMIT",
  3: "SELL LIMIT",
  4: "BUY STOP",
  5: "SELL STOP",
  6: "BUY STOP LIMIT",
  7: "SELL STOP LIMIT",
  8: "CLOSE BY"
};

const DEAL_TYPE_LABELS: Record<number, string> = {
  0: "BUY",
  1: "SELL",
  2: "BALANCE",
  3: "CREDIT",
  4: "CHARGE",
  5: "CORRECTION",
  6: "BONUS",
  7: "COMMISSION",
  8: "COMMISSION DAILY",
  9: "COMMISSION MONTHLY",
  10: "COMMISSION AGENT",
  11: "INTEREST",
  12: "BUY CANCELED",
  13: "SELL CANCELED",
  14: "DIVIDEND",
  15: "DIVIDEND FRANKED",
  16: "TAX"
};

const numberOrNull = (value: any): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatNumber = (value: any, decimals: number = 2) => {
  const num = numberOrNull(value);
  if (num == null) return "--";
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const formatVolume = (value: any) => {
  const num = numberOrNull(value);
  if (num == null) return "--";
  return num.toFixed(2).replace(/\.?0+$/, "");
};

const formatPrice = (value: any) => {
  const num = numberOrNull(value);
  if (num == null) return "--";
  const abs = Math.abs(num);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return num.toFixed(decimals).replace(/\.?0+$/, "");
};

const formatAge = (ms?: number | null) => {
  if (!ms || !Number.isFinite(ms)) return "--";
  const delta = Math.max(0, Date.now() - ms);
  const seconds = Math.max(0, Math.floor(delta / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const toEpochSeconds = (value: any) => {
  const num = numberOrNull(value);
  if (num == null) return null;
  return num > 1e12 ? num / 1000 : num;
};

const formatTimestamp = (value: any) => {
  const seconds = toEpochSeconds(value);
  if (seconds == null) return "--";
  const date = new Date(seconds * 1000);
  return date.toLocaleString("en-US");
};

const orderTypeLabel = (type?: number | null) => {
  const num = numberOrNull(type);
  if (num == null) return "--";
  return ORDER_TYPE_LABELS[num] || `TYPE ${num}`;
};

const dealTypeLabel = (type?: number | null) => {
  const num = numberOrNull(type);
  if (num == null) return "--";
  return DEAL_TYPE_LABELS[num] || `TYPE ${num}`;
};

const orderSideFromType = (type?: number | null) => {
  const num = numberOrNull(type);
  if (num == null) return null;
  if ([0, 2, 4, 6].includes(num)) return "BUY";
  if ([1, 3, 5, 7].includes(num)) return "SELL";
  return null;
};

const scoreSymbolCandidate = (query: string, candidate: string) => {
  const rawQuery = String(query || "").trim();
  const rawCandidate = String(candidate || "").trim();
  if (!rawQuery || !rawCandidate) return 0;
  const queryUpper = rawQuery.toUpperCase();
  const candidateUpper = rawCandidate.toUpperCase();
  const queryKey = normalizeSymbolKey(queryUpper);
  const candidateKey = normalizeSymbolKey(candidateUpper);

  let score = 0;
  if (candidateUpper === queryUpper) score += 1000;
  if (queryKey && candidateKey === queryKey) score += 900;
  if (queryKey && candidateKey.startsWith(queryKey)) score += 700;
  if (candidateKey && queryKey.startsWith(candidateKey)) score += 650;
  if (candidateUpper.startsWith(queryUpper)) score += 600;
  if (candidateUpper.includes(queryUpper)) score += 500;
  return score;
};

const pickBestSymbol = (query: string, candidates: string[]) => {
  let best: string | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = scoreSymbolCandidate(query, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = String(candidate || "").trim();
    }
  }
  return best;
};

const orderKindFromType = (type?: number | null): TicketType => {
  const num = numberOrNull(type);
  if (num == null) return "market";
  if ([2, 3].includes(num)) return "limit";
  if ([4, 5, 6, 7].includes(num)) return "stop";
  if ([0, 1].includes(num)) return "market";
  return "limit";
};

const parseNumber = (value: string) => {
  const cleaned = String(value || "").trim().replace(/,/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const inferPriceDecimals = (value: number | null | undefined) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const text = Math.abs(num).toString();
  if (text.includes("e-")) {
    const exp = Number(text.split("e-")[1]);
    return Number.isFinite(exp) ? Math.min(8, exp) : null;
  }
  const parts = text.split(".");
  if (parts.length < 2) return 0;
  return Math.min(8, parts[1].length);
};

const roundToPrecision = (raw: string, decimals: number | null) => {
  if (decimals == null) return raw;
  const num = parseNumber(raw);
  if (num == null) return raw;
  return num.toFixed(decimals);
};

const PANEL_STORAGE_KEY = "glass_panel_mt5_v1";
const PRESET_STORAGE_KEY = "glass_mt5_ticket_presets_v1";

type Mt5PanelState = {
  activeView?: "ticket" | "positions" | "orders" | "history" | "chart" | "blotter";
  ticketSymbol?: string;
  ticketType?: TicketType;
  ticketVolume?: string;
};

type Mt5TicketPreset = {
  id: string;
  label: string;
  accountKey?: string | null;
  symbol: string;
  side: TicketSide;
  type: TicketType;
  volume: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  deviation?: string;
  magic?: string;
  comment?: string;
};

const normalizeActiveView = (value: any): Mt5PanelState["activeView"] => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "ticket" || raw === "positions" || raw === "orders" || raw === "history" || raw === "chart" || raw === "blotter") {
    return raw as Mt5PanelState["activeView"];
  }
  return "ticket";
};

const normalizeTicketType = (value: any): TicketType => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "limit") return "limit";
  if (raw === "stop") return "stop";
  return "market";
};

const loadPanelState = (): Mt5PanelState => {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      activeView: normalizeActiveView(parsed?.activeView),
      ticketSymbol: typeof parsed?.ticketSymbol === "string" ? parsed.ticketSymbol : "",
      ticketType: normalizeTicketType(parsed?.ticketType),
      ticketVolume: typeof parsed?.ticketVolume === "string" ? parsed.ticketVolume : ""
    };
  } catch {
    return {};
  }
};

const persistPanelState = (state: Mt5PanelState) => {
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
};

const loadPresets = (): Mt5TicketPreset[] => {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        id: String(entry?.id || ""),
        label: String(entry?.label || ""),
        accountKey: entry?.accountKey != null ? String(entry.accountKey) : null,
        symbol: String(entry?.symbol || ""),
        side: String(entry?.side || "").toUpperCase() === "SELL" ? "SELL" : "BUY",
        type: normalizeTicketType(entry?.type),
        volume: String(entry?.volume || ""),
        price: entry?.price != null ? String(entry.price) : "",
        stopLoss: entry?.stopLoss != null ? String(entry.stopLoss) : "",
        takeProfit: entry?.takeProfit != null ? String(entry.takeProfit) : "",
        deviation: entry?.deviation != null ? String(entry.deviation) : "",
        magic: entry?.magic != null ? String(entry.magic) : "",
        comment: entry?.comment != null ? String(entry.comment) : ""
      }))
      .filter((entry) => entry.id && entry.label && entry.symbol);
  } catch {
    return [];
  }
};

const persistPresets = (presets: Mt5TicketPreset[]) => {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore storage failures
  }
};

const buildAccountKey = (account: Record<string, any> | null) => {
  if (!account) return "";
  const login = account?.login != null ? String(account.login) : "";
  const server = account?.server != null ? String(account.server) : "";
  return [login, server].filter(Boolean).join(":");
};

const MT5Interface: React.FC<MT5InterfaceProps> = ({ onRunActionCatalog, defaultSymbol, symbolMap }) => {
  const initialPanelState = useMemo(loadPanelState, []);
  const {
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
  } = useMt5Bridge();

  const [activeView, setActiveView] = useState<"ticket" | "positions" | "orders" | "history" | "chart" | "blotter">(
    initialPanelState.activeView ?? "ticket"
  );
  const [symbolSearch, setSymbolSearch] = useState("");
  const [ticketSymbol, setTicketSymbol] = useState(initialPanelState.ticketSymbol ?? "");
  const [ticketSide, setTicketSide] = useState<TicketSide>("BUY");
  const [ticketType, setTicketType] = useState<TicketType>(initialPanelState.ticketType ?? "market");
  const [ticketVolume, setTicketVolume] = useState(initialPanelState.ticketVolume || "0.1");
  const [ticketPrice, setTicketPrice] = useState("");
  const [ticketStopLoss, setTicketStopLoss] = useState("");
  const [ticketTakeProfit, setTicketTakeProfit] = useState("");
  const [ticketDeviation, setTicketDeviation] = useState("20");
  const [ticketMagic, setTicketMagic] = useState("");
  const [ticketComment, setTicketComment] = useState("");
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketFlash, setTicketFlash] = useState<string | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [historyDays, setHistoryDays] = useState(30);
  const [blotterQuery, setBlotterQuery] = useState("");
  const [blotterEntries, setBlotterEntries] = useState<any[]>([]);
  const [blotterLoading, setBlotterLoading] = useState(false);
  const [blotterError, setBlotterError] = useState<string | null>(null);
  const [blotterUpdatedAtMs, setBlotterUpdatedAtMs] = useState<number | null>(null);
  const [chartClickMode, setChartClickMode] = useState<"off" | "entry" | "sl" | "tp">("off");
  const [chartActionError, setChartActionError] = useState<string | null>(null);
  const [chartActionFlash, setChartActionFlash] = useState<string | null>(null);
  const [chartActionSubmitting, setChartActionSubmitting] = useState(false);

  const didAutoConnectRef = useRef(false);
  const didInitSymbolRef = useRef(false);
  const lastDefaultSymbolRef = useRef("");
  const symbolSearchTimerRef = useRef<number | null>(null);
  const blotterFetchAtRef = useRef(0);
  const chartRef = useRef<NativeChartHandle | null>(null);
  const symbolAliasRef = useRef<Record<string, string>>({});
  const [presets, setPresets] = useState<Mt5TicketPreset[]>(() => loadPresets());
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetLabel, setPresetLabel] = useState("");

  const accountKey = useMemo(() => buildAccountKey(account), [account]);
  const visiblePresets = useMemo(() => {
    if (!accountKey) return presets.filter((preset) => !preset.accountKey);
    return presets.filter((preset) => !preset.accountKey || preset.accountKey === accountKey);
  }, [accountKey, presets]);

  useEffect(() => {
    persistPresets(presets);
  }, [presets]);

  useEffect(() => {
    if (!selectedPresetId) {
      setPresetLabel("");
      return;
    }
    const preset = visiblePresets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      setSelectedPresetId("");
      setPresetLabel("");
      return;
    }
    setPresetLabel(preset.label);
  }, [selectedPresetId, visiblePresets]);

  useEffect(() => {
    persistPanelState({
      activeView,
      ticketSymbol,
      ticketType,
      ticketVolume
    });
  }, [activeView, ticketSymbol, ticketType, ticketVolume]);

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = visiblePresets.find((item) => item.id === presetId);
      if (!preset) return;
      setPresetLabel(preset.label);
      setTicketSymbol(preset.symbol);
      setTicketSide(preset.side);
      setTicketType(preset.type);
      setTicketVolume(preset.volume);
      setTicketPrice(preset.price || "");
      setTicketStopLoss(preset.stopLoss || "");
      setTicketTakeProfit(preset.takeProfit || "");
      setTicketDeviation(preset.deviation || "");
      setTicketMagic(preset.magic || "");
      setTicketComment(preset.comment || "");
    },
    [visiblePresets]
  );

  const handleSavePreset = useCallback(() => {
    const symbol = ticketSymbol.trim().toUpperCase();
    if (!symbol) {
      setTicketError("Preset requires a symbol.");
      return;
    }
    const label = presetLabel.trim() || `${symbol} ${ticketSide} ${ticketType}`;
    const id = `mt5_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const preset: Mt5TicketPreset = {
      id,
      label,
      accountKey: accountKey || null,
      symbol,
      side: ticketSide,
      type: ticketType,
      volume: ticketVolume,
      price: ticketPrice,
      stopLoss: ticketStopLoss,
      takeProfit: ticketTakeProfit,
      deviation: ticketDeviation,
      magic: ticketMagic,
      comment: ticketComment
    };
    setPresets((prev) => [preset, ...prev].slice(0, 50));
    setSelectedPresetId(id);
    setPresetLabel(label);
    setTicketFlash("Preset saved.");
  }, [
    accountKey,
    presetLabel,
    ticketComment,
    ticketDeviation,
    ticketMagic,
    ticketPrice,
    ticketSide,
    ticketStopLoss,
    ticketSymbol,
    ticketTakeProfit,
    ticketType,
    ticketVolume
  ]);

  const handleUpdatePreset = useCallback(() => {
    if (!selectedPresetId) return;
    const existing = visiblePresets.find((item) => item.id === selectedPresetId);
    if (!existing) return;
    const symbol = ticketSymbol.trim().toUpperCase();
    if (!symbol) {
      setTicketError("Preset requires a symbol.");
      return;
    }
    const label = presetLabel.trim() || existing.label || `${symbol} ${ticketSide} ${ticketType}`;
    const updated: Mt5TicketPreset = {
      ...existing,
      label,
      accountKey: accountKey || null,
      symbol,
      side: ticketSide,
      type: ticketType,
      volume: ticketVolume,
      price: ticketPrice,
      stopLoss: ticketStopLoss,
      takeProfit: ticketTakeProfit,
      deviation: ticketDeviation,
      magic: ticketMagic,
      comment: ticketComment
    };
    setPresets((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)].slice(0, 50));
    setSelectedPresetId(updated.id);
    setPresetLabel(label);
    setTicketFlash("Preset updated.");
  }, [
    accountKey,
    presetLabel,
    selectedPresetId,
    ticketComment,
    ticketDeviation,
    ticketMagic,
    ticketPrice,
    ticketSide,
    ticketStopLoss,
    ticketSymbol,
    ticketTakeProfit,
    ticketType,
    ticketVolume,
    visiblePresets
  ]);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPresetId) return;
    setPresets((prev) => prev.filter((item) => item.id !== selectedPresetId));
    setSelectedPresetId("");
    setPresetLabel("");
    setTicketFlash("Preset removed.");
  }, [selectedPresetId]);

  const runPanelAction = useMemo(
    () =>
      createPanelActionRunner({
        panel: "mt5",
        runActionCatalog: onRunActionCatalog,
        defaultSource: "catalog",
        defaultFallbackSource: "bridge"
      }),
    [onRunActionCatalog]
  );

  const runActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      return runPanelAction(actionId, payload, {
        fallback: async () => {
          fallback?.();
          return { ok: true, data: null };
        }
      });
    },
    [runPanelAction]
  );

  const httpBaseUrl = useMemo(() => {
    try {
      const parsed = new URL(wsUrl);
      const scheme = parsed.protocol === "wss:" ? "https:" : "http:";
      return `${scheme}//${parsed.host}`;
    } catch {
      return "http://127.0.0.1:8001";
    }
  }, [wsUrl]);

  const fetchMt5 = useCallback(async (path: string, init?: RequestInit) => {
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

  const requestMt5Broker = useCallback(
    async (
      method: string,
      args?: any,
      meta?: { symbol?: string | null; source?: string | null }
    ) => {
      const resolvedSymbol = String(args?.symbol || args?.instrument || args?.ticker || "").trim();
      const symbol = meta?.symbol ?? (resolvedSymbol || null);
      const res = await requestBrokerCoordinated(method, args, {
        brokerId: "mt5",
        symbol,
        source: meta?.source || "mt5.panel"
      });
      return res;
    },
    []
  );

  const resolveMappedMt5Symbol = useCallback((raw: string) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return null;
    const key = normalizeSymbolKey(trimmed);
    if (!key) return null;
    const entries = Array.isArray(symbolMap) ? symbolMap : [];
    for (const entry of entries) {
      const candidates = [entry?.mt5, entry?.canonical, entry?.tradelocker]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      if (candidates.length === 0) continue;
      const matched = candidates.some((candidate) => normalizeSymbolKey(candidate) === key);
      if (!matched) continue;
      const target = String(entry?.mt5 || entry?.canonical || entry?.tradelocker || "").trim();
      if (target) return target;
    }
    return null;
  }, [symbolMap]);

  const resolveMt5Symbol = useCallback(async (raw: string) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    const key = normalizeSymbolKey(trimmed);

    const mapped = resolveMappedMt5Symbol(trimmed);
    if (mapped) {
      if (key) symbolAliasRef.current[key] = mapped;
      return mapped;
    }

    if (key && symbolAliasRef.current[key]) return symbolAliasRef.current[key];

    const localCandidates = [...symbols, ...subscriptions, ...symbolResults];
    const localMatch = pickBestSymbol(trimmed, localCandidates);
    if (localMatch) {
      if (key) symbolAliasRef.current[key] = localMatch;
      return localMatch;
    }

    const coordinated = await requestMt5Broker(
      "searchInstruments",
      { query: trimmed, limit: 80 },
      { symbol: trimmed, source: "mt5.panel.symbol.resolve" }
    );
    const coordinatedCandidates = Array.isArray(coordinated?.results)
      ? coordinated.results.map((entry: any) =>
          String(entry?.symbol || entry?.instrument || entry?.name || "").trim()
        ).filter(Boolean)
      : Array.isArray(coordinated?.symbols)
        ? coordinated.symbols.map((entry: any) => String(entry || "").trim()).filter(Boolean)
        : [];
    if (coordinated?.ok && coordinatedCandidates.length > 0) {
      const remoteMatch = pickBestSymbol(trimmed, coordinatedCandidates);
      if (remoteMatch) {
        if (key) symbolAliasRef.current[key] = remoteMatch;
        return remoteMatch;
      }
    }

    const res = await fetchMt5(`/symbols?query=${encodeURIComponent(trimmed)}&limit=80`);
    if (res.ok && Array.isArray(res.data?.symbols)) {
      const remoteMatch = pickBestSymbol(trimmed, res.data.symbols);
      if (remoteMatch) {
        if (key) symbolAliasRef.current[key] = remoteMatch;
        return remoteMatch;
      }
    }

    return trimmed;
  }, [fetchMt5, requestMt5Broker, resolveMappedMt5Symbol, symbolResults, subscriptions, symbols]);

  useEffect(() => {
    const next = String(defaultSymbol || "").trim();
    if (!next) return;
    const upper = next.toUpperCase();
    if (lastDefaultSymbolRef.current === upper) return;
    lastDefaultSymbolRef.current = upper;
    let cancelled = false;
    const applyResolved = async () => {
      const resolved = await resolveMt5Symbol(upper);
      if (cancelled) return;
      setTicketSymbol((resolved || upper).toUpperCase());
    };
    void applyResolved();
    return () => {
      cancelled = true;
    };
  }, [defaultSymbol, resolveMt5Symbol]);

  const addSymbolToWatchlist = useCallback((symbolName: string) => {
    const cleaned = String(symbolName || "").trim();
    if (!cleaned) return;

    const existing = symbolsText
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter(Boolean);

    let updated = false;
    const lower = cleaned.toLowerCase();
    const next = existing.map((entry) => {
      if (entry.toLowerCase() === lower) {
        updated = true;
        return cleaned;
      }
      return entry;
    });

    if (!updated) next.push(cleaned);
    const nextText = next.join("\n");
    setSymbolsText(nextText);
    if (status === "connected") setAndApplySubscriptions(nextText);
  }, [setAndApplySubscriptions, setSymbolsText, status, symbolsText]);

  const fetchBlotter = useCallback(async (force: boolean = false) => {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.list) {
      setBlotterError("Trade ledger not available.");
      return;
    }
    if (!force) {
      const now = Date.now();
      if (now - blotterFetchAtRef.current < 5_000) return;
      blotterFetchAtRef.current = now;
    } else {
      blotterFetchAtRef.current = Date.now();
    }

    setBlotterLoading(true);
    setBlotterError(null);
    try {
      const res = await ledger.list({ limit: 400 });
      if (!res?.ok || !Array.isArray(res.entries)) {
        setBlotterError(res?.error ? String(res.error) : "Failed to load blotter.");
        return;
      }
      const filtered = (res.entries as any[])
        .filter((entry) => entry?.kind === "trade")
        .filter((entry) => String(entry?.broker || "").toLowerCase() === "mt5")
        .sort((a, b) => (Number(b?.updatedAtMs || b?.createdAtMs || 0) - Number(a?.updatedAtMs || a?.createdAtMs || 0)));
      setBlotterEntries(filtered);
      setBlotterUpdatedAtMs(Date.now());
    } catch (err: any) {
      setBlotterError(err?.message ? String(err.message) : "Failed to load blotter.");
    } finally {
      setBlotterLoading(false);
    }
  }, []);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([
      refreshAccount(),
      refreshPositions(),
      refreshOrders(),
      activeView === "history" ? refreshHistory({ days: historyDays }) : Promise.resolve(),
      activeView === "blotter" ? fetchBlotter(true) : Promise.resolve()
    ]);
    if (activeView === "chart") {
      chartRef.current?.refresh?.();
    }
    await refreshBridgeStatus();
  }, [activeView, fetchBlotter, historyDays, refreshAccount, refreshBridgeStatus, refreshHistory, refreshOrders, refreshPositions]);

  const handleSubmitTicket = useCallback(async () => {
    setTicketError(null);
    setTicketFlash(null);

    if (status !== "connected") {
      setTicketError("Bridge not connected.");
      return;
    }

    const symbol = ticketSymbol.trim();
    if (!symbol) {
      setTicketError("Symbol is required.");
      return;
    }

    const volume = parseNumber(ticketVolume);
    if (volume == null || volume <= 0) {
      setTicketError("Lot size is required.");
      return;
    }

    const price = parseNumber(ticketPrice);
    if (ticketType !== "market" && (price == null || price <= 0)) {
      setTicketError("Price is required for limit/stop orders.");
      return;
    }

    const sl = parseNumber(ticketStopLoss);
    const tp = parseNumber(ticketTakeProfit);
    const deviation = parseNumber(ticketDeviation);
    const magic = parseNumber(ticketMagic);

    setTicketSubmitting(true);
    try {
      const resolvedSymbol = await resolveMt5Symbol(symbol);
      const finalSymbol = resolvedSymbol || symbol;
      if (finalSymbol !== symbol) setTicketSymbol(finalSymbol);
      const res = await placeOrder({
        symbol: finalSymbol,
        side: ticketSide,
        type: ticketType,
        volume,
        price: ticketType === "market" ? undefined : price,
        sl: sl ?? undefined,
        tp: tp ?? undefined,
        deviation: deviation ?? undefined,
        magic: magic ?? undefined,
        comment: ticketComment.trim() || undefined
      });
      if (!res.ok) {
        setTicketError(res.error || "Order rejected.");
        return;
      }
      setTicketFlash("Order submitted.");
      await Promise.all([refreshPositions(), refreshOrders()]);
    } catch (err: any) {
      setTicketError(err?.message ? String(err.message) : "Order failed.");
    } finally {
      setTicketSubmitting(false);
    }
  }, [
    placeOrder,
    refreshOrders,
    refreshPositions,
    resolveMt5Symbol,
    status,
    ticketComment,
    ticketDeviation,
    ticketMagic,
    ticketPrice,
    ticketSide,
    ticketStopLoss,
    ticketSymbol,
    ticketTakeProfit,
    ticketType,
    ticketVolume
  ]);

  const handleClosePosition = useCallback(async (pos: any) => {
    const ticket = numberOrNull(pos?.ticket ?? pos?.position_id ?? pos?.id);
    if (ticket == null) return;
    const res = await closePosition({ position: ticket });
    if (res.ok) {
      await Promise.all([refreshPositions(), refreshHistory({ days: historyDays })]);
    }
  }, [closePosition, historyDays, refreshHistory, refreshPositions]);

  const handleCancelOrder = useCallback(async (order: any) => {
    const orderId = numberOrNull(order?.ticket ?? order?.order ?? order?.order_id);
    if (orderId == null) return;
    const res = await cancelOrder({ order: orderId });
    if (res.ok) {
      await refreshOrders();
    }
  }, [cancelOrder, refreshOrders]);

  const handleQuickMarketOrder = useCallback(async (side: TicketSide) => {
    setChartActionError(null);
    setChartActionFlash(null);
    setTicketSide(side);

    if (status !== "connected") {
      setChartActionError("Bridge not connected.");
      return;
    }

    const symbol = String(ticketSymbol || "").trim() || symbols[0] || "";
    if (!symbol) {
      setChartActionError("Select a symbol first.");
      return;
    }

    const volume = parseNumber(ticketVolume);
    if (volume == null || volume <= 0) {
      setChartActionError("Lot size is required.");
      return;
    }

    const sl = parseNumber(ticketStopLoss);
    const tp = parseNumber(ticketTakeProfit);
    const deviation = parseNumber(ticketDeviation);
    const magic = parseNumber(ticketMagic);

    setChartActionSubmitting(true);
    try {
      const resolvedSymbol = await resolveMt5Symbol(symbol);
      const finalSymbol = resolvedSymbol || symbol;
      if (finalSymbol !== symbol) setTicketSymbol(finalSymbol);
      const res = await placeOrder({
        symbol: finalSymbol,
        side,
        type: "market",
        volume,
        sl: sl ?? undefined,
        tp: tp ?? undefined,
        deviation: deviation ?? undefined,
        magic: magic ?? undefined,
        comment: ticketComment.trim() || undefined
      });
      if (!res.ok) {
        setChartActionError(res.error || "Order failed.");
        return;
      }
      setChartActionFlash(`${side} market order sent.`);
      await Promise.all([refreshPositions(), refreshOrders()]);
    } catch (err: any) {
      setChartActionError(err?.message ? String(err.message) : "Order failed.");
    } finally {
      setChartActionSubmitting(false);
    }
  }, [
    placeOrder,
    refreshOrders,
    refreshPositions,
    resolveMt5Symbol,
    status,
    symbols,
    ticketComment,
    ticketDeviation,
    ticketMagic,
    ticketStopLoss,
    ticketSymbol,
    ticketTakeProfit,
    ticketVolume
  ]);

  const handleChartPriceSelect = useCallback((event: { price: number; mode: "entry" | "sl" | "tp" }) => {
    const formatted = formatPrice(event.price);
    if (event.mode === "entry") {
      setTicketPrice(formatted);
    } else if (event.mode === "sl") {
      setTicketStopLoss(formatted);
    } else if (event.mode === "tp") {
      setTicketTakeProfit(formatted);
    }
  }, []);

  const handleChartLevelUpdate = useCallback(async (event: { price: number; meta?: Record<string, any> }) => {
    setChartActionError(null);
    setChartActionFlash(null);

    const price = Number(event.price);
    if (!Number.isFinite(price)) return;
    const meta = event.meta || {};
    const entity = String(meta.entity || "").toLowerCase();
    const field = String(meta.field || "").toLowerCase();
    const id = meta.id;
    if (!id) return;

    if (entity === "position") {
      if (field !== "sl" && field !== "tp") return;
      const payload: Record<string, any> = { position: id };
      if (field === "sl") payload.sl = price;
      if (field === "tp") payload.tp = price;
      const res = await fetchMt5("/position/modify", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!res.ok || res.data?.ok === false) {
        setChartActionError(res.data?.error || res.error || "Position update failed.");
        return;
      }
      setChartActionFlash("Position updated.");
      await refreshPositions();
      return;
    }

    if (entity === "order") {
      if (field !== "price" && field !== "sl" && field !== "tp") return;
      const payload: Record<string, any> = { order: id };
      if (field === "price") payload.price = price;
      if (field === "sl") payload.sl = price;
      if (field === "tp") payload.tp = price;
      const res = await fetchMt5("/order/modify", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!res.ok || res.data?.ok === false) {
        setChartActionError(res.data?.error || res.error || "Order update failed.");
        return;
      }
      setChartActionFlash("Order updated.");
      await refreshOrders();
    }
  }, [fetchMt5, refreshOrders, refreshPositions]);

  const scheduleSymbolSearch = useCallback((query: string) => {
    const trimmed = String(query || "").trim();
    if (!trimmed || status !== "connected") return;
    if (symbolSearchTimerRef.current) window.clearTimeout(symbolSearchTimerRef.current);
    symbolSearchTimerRef.current = window.setTimeout(() => {
      searchSymbols(trimmed, 80);
    }, 250);
  }, [searchSymbols, status]);

  useEffect(() => {
    if (didAutoConnectRef.current) return;
    didAutoConnectRef.current = true;
    connect();
  }, [connect]);

  useEffect(() => {
    void refreshBridgeStatus();
  }, [refreshBridgeStatus]);

  useEffect(() => {
    if (didInitSymbolRef.current) return;
    if (!ticketSymbol && symbols.length > 0) {
      setTicketSymbol(symbols[0]);
      didInitSymbolRef.current = true;
    }
  }, [symbols, ticketSymbol]);

  useEffect(() => {
    if (status !== "connected") return;
    void refreshAccount();
    void refreshPositions();
    void refreshOrders();
    if (activeView === "history") void refreshHistory({ days: historyDays });
    if (activeView === "blotter") void fetchBlotter(true);
  }, [activeView, fetchBlotter, historyDays, refreshAccount, refreshHistory, refreshOrders, refreshPositions, status]);

  useEffect(() => {
    if (!ticketSymbol.trim()) return;
    scheduleSymbolSearch(ticketSymbol);
  }, [scheduleSymbolSearch, ticketSymbol]);

  useEffect(() => {
    if (!symbolSearch.trim()) return;
    scheduleSymbolSearch(symbolSearch);
  }, [scheduleSymbolSearch, symbolSearch]);

  useEffect(() => {
    return () => {
      if (symbolSearchTimerRef.current) window.clearTimeout(symbolSearchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handler = (event: any) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const nextSymbolsText =
        detail.symbolsText != null ? String(detail.symbolsText) : symbolsText;
      if (detail.connect) connect();
      if (detail.disconnect) disconnect();
      if (detail.openLog) openBridgeLog();
      if (detail.wsUrl != null) setWsUrl(String(detail.wsUrl));
      if (detail.symbolsText != null) setSymbolsText(nextSymbolsText);
      if (detail.apply) setAndApplySubscriptions(nextSymbolsText);
      if (detail.search != null) searchSymbols(String(detail.search));
      if (detail.addSymbol != null) addSymbolToWatchlist(String(detail.addSymbol));
    };
    window.addEventListener(GLASS_EVENT.MT5_CONTROLS, handler as any);
    return () => window.removeEventListener(GLASS_EVENT.MT5_CONTROLS, handler as any);
  }, [
    addSymbolToWatchlist,
    connect,
    disconnect,
    openBridgeLog,
    searchSymbols,
    setAndApplySubscriptions,
    setSymbolsText,
    setWsUrl,
    symbolsText
  ]);

  useEffect(() => {
    const handleTicket = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== "object") return;
      if (detail.symbol != null) setTicketSymbol(String(detail.symbol));
      if (detail.side != null) {
        const sideRaw = String(detail.side).trim().toUpperCase();
        if (sideRaw === "SELL") setTicketSide("SELL");
        if (sideRaw === "BUY") setTicketSide("BUY");
      }
      if (detail.type != null) {
        const typeRaw = String(detail.type).trim().toLowerCase();
        if (typeRaw === "limit") setTicketType("limit");
        if (typeRaw === "stop") setTicketType("stop");
        if (typeRaw === "market") setTicketType("market");
      }
      const volume = detail.volume ?? detail.qty ?? detail.lot ?? null;
      if (volume != null) setTicketVolume(String(volume));
      if (detail.price != null) setTicketPrice(String(detail.price));
      if (detail.stopLoss != null) setTicketStopLoss(String(detail.stopLoss));
      if (detail.takeProfit != null) setTicketTakeProfit(String(detail.takeProfit));
      if (detail.deviation != null) setTicketDeviation(String(detail.deviation));
      if (detail.magic != null) setTicketMagic(String(detail.magic));
      if (detail.comment != null) setTicketComment(String(detail.comment));
      if (detail.open) setActiveView("ticket");
    };
    window.addEventListener(GLASS_EVENT.MT5_TICKET, handleTicket as any);
    return () => window.removeEventListener(GLASS_EVENT.MT5_TICKET, handleTicket as any);
  }, []);

  useEffect(() => {
    if (activeView !== "chart") return;
    const next = ticketSymbol.trim();
    if (!next) return;
    chartRef.current?.focusSymbol?.(next);
  }, [activeView, ticketSymbol]);

  const statusUi = useMemo(() => {
    if (status === "connected") return { dot: "bg-emerald-500", label: "CONNECTED" };
    if (status === "connecting") return { dot: "bg-yellow-500 animate-pulse", label: "CONNECTING" };
    if (status === "error") return { dot: "bg-red-500 animate-pulse", label: "ERROR" };
    return { dot: "bg-gray-600", label: "DISCONNECTED" };
  }, [status]);

  const bridgeLabel = bridgeHealthy === true ? "BRIDGE OK" : bridgeHealthy === false ? "BRIDGE DOWN" : "BRIDGE --";
  const bridgeBadgeClass =
    bridgeHealthy === true
      ? "bg-emerald-500/15 text-emerald-200"
      : bridgeHealthy === false
        ? "bg-red-500/15 text-red-200"
        : "bg-white/10 text-gray-300";
  const latencyLabel = latencyMs != null ? `${Math.round(latencyMs)}ms` : "--";

  const accountBalance = numberOrNull(account?.balance);
  const accountEquity = numberOrNull(account?.equity);
  const accountProfit = numberOrNull(account?.profit);
  const positionsPnL = useMemo(() => {
    const list = Array.isArray(positions) ? positions : [];
    return list.reduce((acc, pos) => {
      const profit = numberOrNull(pos?.profit) ?? 0;
      return acc + profit;
    }, 0);
  }, [positions]);

  const floatingPnL = accountProfit != null ? accountProfit : positionsPnL;
  const pnlColor = floatingPnL >= 0 ? "text-emerald-300" : "text-red-300";

  const margin = numberOrNull(account?.margin);
  const marginFree = numberOrNull(account?.margin_free);
  const marginLevel = numberOrNull(account?.margin_level);
  const marginLine =
    margin != null || marginFree != null || marginLevel != null
      ? `Margin ${formatNumber(margin, 2)} | Free ${formatNumber(marginFree, 2)} | Level ${formatNumber(marginLevel, 2)}%`
      : "";

  const accountLabel = [
    account?.login != null ? `#${account?.login}` : "",
    account?.name ? String(account.name) : "",
    account?.server ? String(account.server) : "",
    account?.company ? String(account.company) : ""
  ]
    .filter(Boolean)
    .join(" ");

  const accountUpdatedLabel = accountUpdatedAtMs ? formatAge(accountUpdatedAtMs) : "--";
  const positionsUpdatedLabel = positionsUpdatedAtMs ? formatAge(positionsUpdatedAtMs) : "--";
  const ordersUpdatedLabel = ordersUpdatedAtMs ? formatAge(ordersUpdatedAtMs) : "--";
  const historyUpdatedLabel = historyUpdatedAtMs ? formatAge(historyUpdatedAtMs) : "--";
  const blotterUpdatedLabel = blotterUpdatedAtMs ? formatAge(blotterUpdatedAtMs) : "--";

  const tickRows = useMemo(() => {
    return Object.values(ticksBySymbol)
      .filter((t) => t && t.symbol)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [ticksBySymbol]);

  const ticketSymbolTrimmed = ticketSymbol.trim();
  const ticketSymbolUpper = ticketSymbolTrimmed.toUpperCase();
  const ticketTick = ticksBySymbol[ticketSymbolTrimmed] || ticksBySymbol[ticketSymbolUpper] || null;
  const chartSymbolKey = normalizeSymbolKey(ticketSymbolTrimmed || "");
  const ticketPrecision = useMemo(() => {
    const candidate = [ticketTick?.bid, ticketTick?.ask, ticketTick?.last, ticketTick?.mid].find((value) => Number.isFinite(Number(value)));
    return inferPriceDecimals(candidate != null ? Number(candidate) : null);
  }, [ticketTick]);
  const ticketPrecisionLabel = ticketPrecision == null ? "Precision: --" : `Precision: ${ticketPrecision} dp`;

  const showTicketSuggestions = useMemo(() => {
    const query = ticketSymbolTrimmed.toLowerCase();
    const resultsQuery = String(symbolResultsQuery || "").trim().toLowerCase();
    if (!query || symbolResults.length === 0) return false;
    return resultsQuery === query || resultsQuery.startsWith(query) || query.startsWith(resultsQuery);
  }, [symbolResults.length, symbolResultsQuery, ticketSymbolTrimmed]);

  const applyPricePrecision = useCallback(() => {
    if (ticketPrecision == null) return;
    const normalizeValue = (value: string) => roundToPrecision(value, ticketPrecision);
    if (ticketType !== "market") setTicketPrice(normalizeValue(ticketPrice));
    setTicketStopLoss(normalizeValue(ticketStopLoss));
    setTicketTakeProfit(normalizeValue(ticketTakeProfit));
  }, [ticketPrecision, ticketPrice, ticketStopLoss, ticketTakeProfit, ticketType]);

  const sortedPositions = useMemo(() => {
    const list = Array.isArray(positions) ? [...positions] : [];
    return list.sort((a, b) => {
      const at = numberOrNull(a?.time_update ?? a?.time) ?? 0;
      const bt = numberOrNull(b?.time_update ?? b?.time) ?? 0;
      return bt - at;
    });
  }, [positions]);

  const sortedOrders = useMemo(() => {
    const list = Array.isArray(orders) ? [...orders] : [];
    return list.sort((a, b) => {
      const at = numberOrNull(a?.time_setup ?? a?.time) ?? 0;
      const bt = numberOrNull(b?.time_setup ?? b?.time) ?? 0;
      return bt - at;
    });
  }, [orders]);

  const chartPositionsForSymbol = useMemo(() => {
    if (!chartSymbolKey) return sortedPositions;
    return sortedPositions.filter((pos) => normalizeSymbolKey(pos?.symbol || "") === chartSymbolKey);
  }, [chartSymbolKey, sortedPositions]);

  const chartOrdersForSymbol = useMemo(() => {
    if (!chartSymbolKey) return sortedOrders;
    return sortedOrders.filter((order) => normalizeSymbolKey(order?.symbol || "") === chartSymbolKey);
  }, [chartSymbolKey, sortedOrders]);

  const sortedHistory = useMemo(() => {
    const list = Array.isArray(history) ? [...history] : [];
    return list.sort((a, b) => {
      const at = numberOrNull(a?.time) ?? 0;
      const bt = numberOrNull(b?.time) ?? 0;
      return bt - at;
    });
  }, [history]);

  const filteredBlotterEntries = useMemo(() => {
    const q = blotterQuery.trim().toLowerCase();
    if (!q) return blotterEntries;
    return blotterEntries.filter((entry) => String(entry?.symbol || "").toLowerCase().includes(q));
  }, [blotterEntries, blotterQuery]);

  const chartPositions = useMemo<Position[]>(() => {
    if (!Array.isArray(positions)) return [];
    return positions
      .filter((pos) => pos && pos.symbol)
      .map((pos) => {
        const ticket = numberOrNull(pos?.ticket ?? pos?.position_id ?? pos?.id);
        const symbol = String(pos?.symbol || "").trim();
        const side = numberOrNull(pos?.type) === 1 ? "SELL" : "BUY";
        const openedAt = toEpochSeconds(pos?.time ?? pos?.time_update);
        const fallbackId = `${symbol}_${pos?.time ?? pos?.time_update ?? 0}`;
        return {
          id: ticket != null ? String(ticket) : fallbackId,
          symbol,
          type: side,
          entryPrice: numberOrNull(pos?.price_open) ?? 0,
          size: numberOrNull(pos?.volume) ?? 0,
          stopLoss: numberOrNull(pos?.sl) ?? 0,
          takeProfit: numberOrNull(pos?.tp) ?? 0,
          openTime: openedAt != null ? new Date(openedAt * 1000) : new Date(),
          pnl: numberOrNull(pos?.profit) ?? 0,
          status: "OPEN"
        };
      });
  }, [positions]);

  const chartOrders = useMemo<TradeLockerOrder[]>(() => {
    if (!Array.isArray(orders)) return [];
    return orders
      .filter((order) => order && order.symbol)
      .map((order) => {
        const orderId = numberOrNull(order?.ticket ?? order?.order ?? order?.order_id);
        const symbol = String(order?.symbol || "").trim();
        const side = orderSideFromType(order?.type) || "BUY";
        const createdAt = toEpochSeconds(order?.time_setup ?? order?.time);
        const fallbackId = `${symbol}_${order?.time_setup ?? order?.time ?? 0}`;
        return {
          id: orderId != null ? String(orderId) : fallbackId,
          symbol,
          side,
          type: orderKindFromType(order?.type),
          qty: numberOrNull(order?.volume_current) ?? 0,
          price: numberOrNull(order?.price_open) ?? 0,
          stopLoss: numberOrNull(order?.sl) ?? 0,
          takeProfit: numberOrNull(order?.tp) ?? 0,
          status: order?.state != null ? `STATE ${order.state}` : "PENDING",
          createdAt: createdAt != null ? new Date(createdAt * 1000) : new Date()
        };
      });
  }, [orders]);

  const mt5QuotesBySymbol = useMemo(() => {
    const quotes: Record<string, any> = {};
    for (const tick of Object.values(ticksBySymbol)) {
      if (!tick?.symbol) continue;
      const key = normalizeSymbolKey(tick.symbol);
      if (!key) continue;
      const bid = numberOrNull(tick.bid);
      const ask = numberOrNull(tick.ask);
      const last = numberOrNull(tick.last);
      const spread = bid != null && ask != null ? ask - bid : numberOrNull(tick.spread);
      const ts = numberOrNull(tick.local_ts_ms);
      quotes[key] = {
        symbol: tick.symbol,
        bid,
        ask,
        last,
        spread,
        timestampMs: ts,
        fetchedAtMs: ts
      };
    }
    return quotes;
  }, [ticksBySymbol]);

  const formatHistoryError = useCallback((res: any) => {
    const base = res?.data?.error || res?.error || "History unavailable.";
    const lastError = res?.data?.last_error;
    if (!lastError) return base;
    if (typeof lastError === "string") return `${base} | mt5 ${lastError}`;
    if (typeof lastError === "object") {
      const code = lastError.code != null ? String(lastError.code) : "";
      const message = lastError.message != null ? String(lastError.message) : "";
      if (code && message) return `${base} | mt5 ${code}: ${message}`;
      if (code || message) return `${base} | mt5 ${code || message}`;
    }
    return `${base} | mt5 ${String(lastError)}`;
  }, []);

  const chartRequestBroker = useCallback(async (method: string, args?: any) => {
    if (method === "getHistorySeries") {
      const payload = {
        symbol: String(args?.symbol || ticketSymbolTrimmed || "").trim(),
        resolution: args?.resolution || args?.timeframe,
        from: args?.from,
        to: args?.to,
        limit: args?.limit
      };
      if (!payload.symbol) {
        return { ok: false, error: "Symbol is required." };
      }
      const resolvedSymbol = await resolveMt5Symbol(payload.symbol);
      payload.symbol = resolvedSymbol || payload.symbol;
      const coordinated = await requestMt5Broker(
        "getHistorySeries",
        {
          symbol: payload.symbol,
          resolution: payload.resolution,
          from: payload.from,
          to: payload.to,
          limit: payload.limit,
          aggregate: true,
          maxAgeMs: 15_000
        },
        { symbol: payload.symbol, source: "mt5.panel.chart.history" }
      );
      if (coordinated?.ok && Array.isArray(coordinated?.bars)) {
        return {
          ok: true,
          bars: coordinated.bars,
          fetchedAtMs: coordinated.fetchedAtMs || Date.now(),
          source: coordinated.source || coordinated.brokerId || "mt5",
          coverage: coordinated.coverage ?? null
        };
      }
      const res = await fetchMt5("/history/series", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (!res.ok || res.data?.ok === false) {
        return { ok: false, error: formatHistoryError(res) };
      }
      return {
        ok: true,
        bars: Array.isArray(res.data?.bars) ? res.data.bars : [],
        fetchedAtMs: res.data?.fetchedAtMs || Date.now(),
        source: res.data?.source || "mt5",
        coverage: res.data?.coverage ?? null
      };
    }
    if (method === "getInstrumentConstraints") {
      const symbol = String(args?.symbol || ticketSymbolTrimmed || "").trim();
      const coordinated = await requestMt5Broker(
        "getInstrumentConstraints",
        symbol ? { symbol } : {},
        { symbol, source: "mt5.panel.chart.constraints" }
      );
      if (coordinated?.ok && coordinated?.constraints) {
        return {
          ok: true,
          constraints: coordinated.constraints,
          fetchedAtMs: coordinated.fetchedAtMs || Date.now()
        };
      }
      return { ok: true, constraints: {}, fetchedAtMs: Date.now() };
    }
    return { ok: false, error: `${method} unsupported.` };
  }, [fetchMt5, formatHistoryError, requestMt5Broker, resolveMt5Symbol, ticketSymbolTrimmed]);

  const isChartView = activeView === "chart";

  return (
    <div className="flex flex-col h-full w-full text-gray-200 bg-[#0a0a0a]">
      <div className="px-4 py-4 border-b border-white/5 bg-gradient-to-r from-emerald-900/20 to-black">
        <div className="flex items-center gap-2 text-emerald-400 text-xs uppercase tracking-wider font-bold mb-4">
          <Activity size={14} />
          <span>MetaTrader 5</span>
          <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${bridgeBadgeClass}`}>
            {bridgeLabel}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-[10px] text-gray-500 font-mono">
              Acct {accountUpdatedLabel} | Pos {positionsUpdatedLabel} | Ord {ordersUpdatedLabel} | Hist {historyUpdatedLabel} | Ping {latencyLabel}
            </div>
            <button
              type="button"
              onClick={handleRefreshAll}
              className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Refresh MT5 snapshot"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Balance</span>
            <span className="text-xl font-mono text-white">{formatNumber(accountBalance, 2)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Equity</span>
            <span className={`text-xl font-mono ${floatingPnL >= 0 ? "text-white" : "text-red-200"}`}>
              {formatNumber(accountEquity, 2)}
            </span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-end">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Floating P&L</span>
          <span className={`text-lg font-mono font-bold ${pnlColor}`}>
            {floatingPnL >= 0 ? "+" : ""}{formatNumber(floatingPnL, 2)}
          </span>
        </div>

        {marginLine && (
          <div className="mt-2 text-[10px] text-gray-500 font-mono">
            {marginLine}
          </div>
        )}

        {accountLabel && (
          <div className="mt-2 text-[10px] text-gray-400 font-mono">
            {accountLabel}
          </div>
        )}

        {accountError && (
          <div className="mt-2 text-[10px] text-yellow-300/90 font-mono">
            Account error: {accountError}
          </div>
        )}

        {tradeError && (
          <div className="mt-2 text-[10px] text-red-300/90 font-mono">
            Trade error: {tradeError}
          </div>
        )}

        {lastError && (
          <div className="mt-2 text-[10px] text-yellow-300/90 font-mono">
            Bridge error: {lastError}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className={`p-4 grid gap-4 ${isChartView ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-[340px,1fr]"}`}>
          {!isChartView && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Bridge</div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
                  <span className={`w-2 h-2 rounded-full ${statusUi.dot}`}></span>
                  <span>{statusUi.label}</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-500">WS URL</label>
                <input
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                  placeholder="ws://127.0.0.1:8001/ws/ticks"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => runActionOr("mt5.connect", {}, () => connect())}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-100 transition-colors flex items-center gap-2 disabled:opacity-50"
                  disabled={status === "connecting" || status === "connected"}
                >
                  <PlugZap size={14} />
                  Connect
                </button>
                <button
                  type="button"
                  onClick={() => runActionOr("mt5.disconnect", {}, () => disconnect())}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors disabled:opacity-50"
                  disabled={status === "connecting" || status === "disconnected"}
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  onClick={() => runActionOr("mt5.log.open", {}, () => openBridgeLog())}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors"
                >
                  Log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void refreshBridgeStatus();
                    void startBridge();
                  }}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors"
                >
                  Ping
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Subscriptions</div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {subscriptions.length} active
                </div>
              </div>
              <textarea
                value={symbolsText}
                onChange={(e) => setSymbolsText(e.target.value)}
                rows={5}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                placeholder="EURUSD&#10;GBPUSD&#10;USDJPY"
              />
              <button
                type="button"
                onClick={() => setAndApplySubscriptions(symbolsText)}
                className="w-full px-3 py-2 rounded-lg text-[11px] font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-100 transition-colors"
                disabled={status !== "connected"}
              >
                Apply Watchlist
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Broker Symbols</div>
                <div className="text-[10px] text-gray-500 font-mono">
                  {symbolResultsQuery ? `Query: ${symbolResultsQuery}` : "Query: --"}
                </div>
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                <input
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                  placeholder="Search broker symbols"
                />
              </div>
              <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-2">
                {symbolResults.length === 0 && (
                  <div className="text-[11px] text-gray-500">No symbol suggestions yet.</div>
                )}
                {symbolResults.map((symbol) => (
                  <div
                    key={symbol}
                    className="flex items-center justify-between px-2 py-1 rounded-lg bg-black/30 border border-white/5 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => setTicketSymbol(symbol)}
                      className="text-emerald-200 hover:text-emerald-100 font-semibold"
                    >
                      {symbol}
                    </button>
                    <button
                      type="button"
                      onClick={() => addSymbolToWatchlist(symbol)}
                      className="px-2 py-1 rounded-md border border-white/10 text-[10px] text-gray-300 hover:text-white hover:bg-white/10"
                      title="Add to watchlist"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-gray-500 font-mono">
                Auto-suggest is powered by the connected broker symbols.
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Market Watch</div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-2">
                {tickRows.length === 0 && (
                  <div className="text-[11px] text-gray-500">No ticks yet. Connect to the bridge.</div>
                )}
                {tickRows.map((tick) => (
                  <button
                    key={tick.symbol}
                    type="button"
                    onClick={() => setTicketSymbol(tick.symbol)}
                    className="w-full text-left px-2 py-2 rounded-lg border border-white/5 bg-black/30 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-white">{tick.symbol}</span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {tick.local_ts_ms ? formatAge(tick.local_ts_ms) : "--"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400 font-mono">
                      <span>Bid {formatPrice(tick.bid)}</span>
                      <span>Ask {formatPrice(tick.ask)}</span>
                      <span>Spr {formatPrice(tick.spread)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            </div>
          </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden flex flex-col">
            <div className="sticky top-0 z-10 bg-[#0a0a0a]/90 backdrop-blur border-b border-white/5 px-3 py-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveView("ticket")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === "ticket" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
                }`}
              >
                Ticket
              </button>
              <button
                type="button"
                onClick={() => setActiveView("positions")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === "positions" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
                }`}
              >
                Positions
              </button>
              <button
                type="button"
                onClick={() => setActiveView("orders")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === "orders" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
                }`}
              >
                Orders
              </button>
              <button
                type="button"
                onClick={() => setActiveView("history")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === "history" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
                }`}
              >
                History
              </button>
              <button
                type="button"
                onClick={() => setActiveView("blotter")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === "blotter" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
                }`}
              >
                Blotter
              </button>
              <button
                type="button"
                onClick={() => setActiveView("chart")}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  activeView === "chart" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
                }`}
              >
                Chart
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshAll}
                  className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Refresh view"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              {activeView === "chart" ? (
                <div className="h-full min-h-[640px] flex flex-col">
                  <div className="px-4 py-3 border-b border-white/10 bg-black/40 space-y-2">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500">Chart Actions</span>
                      <div className="flex items-center gap-1">
                        {(["off", "entry", "sl", "tp"] as const).map((mode) => (
                          <button
                            key={`chart-mode-${mode}`}
                            type="button"
                            onClick={() => setChartClickMode(mode)}
                            className={`px-2 py-1 rounded border ${
                              chartClickMode === mode
                                ? "border-emerald-400/50 text-emerald-200"
                                : "border-white/10 text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {mode.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {chartClickMode === "off"
                          ? "Click mode off"
                          : `Click chart to set ${chartClickMode.toUpperCase()}`}
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">
                          {ticketSymbolTrimmed || symbols[0] || "--"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickMarketOrder("BUY")}
                          disabled={chartActionSubmitting || status !== "connected"}
                          className="px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                        >
                          Buy MKT
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickMarketOrder("SELL")}
                          disabled={chartActionSubmitting || status !== "connected"}
                          className="px-3 py-1.5 rounded border border-red-500/40 text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Sell MKT
                        </button>
                      </div>
                    </div>
                    {chartActionError && (
                      <div className="text-[11px] text-red-300 flex items-center gap-2">
                        <AlertCircle size={14} />
                        {chartActionError}
                      </div>
                    )}
                    {chartActionFlash && (
                      <div className="text-[11px] text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 size={14} />
                        {chartActionFlash}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-h-0">
                    <NativeChartInterface
                      ref={chartRef}
                      activeSymbol={ticketSymbolTrimmed || symbols[0] || ""}
                      brokerLabel="MT5"
                      supportsConstraints={false}
                      priceSelectMode={chartClickMode}
                      isConnected={status === "connected"}
                      positions={chartPositions}
                      orders={chartOrders}
                      quotesBySymbol={mt5QuotesBySymbol}
                      onSymbolChange={(symbol) => {
                        if (!symbol) return;
                        setTicketSymbol(symbol);
                      }}
                      resolveSymbol={resolveMt5Symbol}
                      onRunActionCatalog={onRunActionCatalog}
                      requestBroker={chartRequestBroker}
                      onPriceSelect={handleChartPriceSelect}
                      onLevelUpdate={handleChartLevelUpdate}
                    />
                  </div>
                  <div className="px-4 py-3 border-t border-white/10 bg-black/30">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Positions</div>
                        {chartPositionsForSymbol.length === 0 ? (
                          <div className="text-[11px] text-gray-500">No open positions.</div>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                            {chartPositionsForSymbol.map((pos) => {
                              const side = numberOrNull(pos?.type) === 1 ? "SELL" : "BUY";
                              const sideClass = side === "BUY" ? "text-emerald-300" : "text-red-300";
                              const ticketId = numberOrNull(pos?.ticket ?? pos?.position_id ?? pos?.id);
                              const profit = numberOrNull(pos?.profit) ?? 0;
                              return (
                                <div key={`chart-pos-${ticketId ?? pos?.time}`} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-200">{pos?.symbol || "--"}</span>
                                      <span className={sideClass}>{side}</span>
                                    </div>
                                    <div className="text-gray-500">
                                      Open {formatPrice(pos?.price_open)} | SL {formatPrice(pos?.sl)} | TP {formatPrice(pos?.tp)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={profit >= 0 ? "text-emerald-300" : "text-red-300"}>
                                      {profit >= 0 ? "+" : ""}{formatNumber(profit, 2)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleClosePosition(pos)}
                                      className="px-2 py-1 rounded border border-red-500/40 text-red-200 hover:bg-red-500/10"
                                    >
                                      Close
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Orders</div>
                        {chartOrdersForSymbol.length === 0 ? (
                          <div className="text-[11px] text-gray-500">No pending orders.</div>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                            {chartOrdersForSymbol.map((order) => {
                              const orderId = numberOrNull(order?.ticket ?? order?.order ?? order?.order_id);
                              const typeLabel = orderTypeLabel(order?.type);
                              const side = orderSideFromType(order?.type);
                              const sideClass = side === "BUY" ? "text-emerald-300" : side === "SELL" ? "text-red-300" : "text-gray-300";
                              return (
                                <div key={`chart-order-${orderId ?? order?.time_setup}`} className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-200">{order?.symbol || "--"}</span>
                                      <span className={sideClass}>{typeLabel}</span>
                                    </div>
                                    <div className="text-gray-500">
                                      Price {formatPrice(order?.price_open)} | SL {formatPrice(order?.sl)} | TP {formatPrice(order?.tp)}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelOrder(order)}
                                    className="px-2 py-1 rounded border border-white/10 text-gray-200 hover:bg-white/10"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="p-4 space-y-4">
                {activeView === "ticket" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] uppercase tracking-widest text-gray-400 font-semibold">Order Ticket</div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                        <span className={`w-2 h-2 rounded-full ${statusUi.dot}`}></span>
                        <span>{statusUi.label}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-gray-500">Preset</label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <select
                          value={selectedPresetId}
                          onChange={(e) => {
                            const next = e.target.value;
                            setSelectedPresetId(next);
                            if (next) handleApplyPreset(next);
                          }}
                          className="flex-1 min-w-[180px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                        >
                          <option value="">Select preset</option>
                          {visiblePresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={presetLabel}
                          onChange={(e) => setPresetLabel(e.target.value)}
                          className="flex-1 min-w-[180px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                          placeholder="Preset name (optional)"
                        />
                        <button
                          type="button"
                          onClick={handleSavePreset}
                          className="px-3 py-2 rounded-lg text-[11px] bg-white/10 border border-white/10 text-gray-200 hover:bg-white/20"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdatePreset}
                          disabled={!selectedPresetId}
                          className="px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 disabled:opacity-50"
                        >
                          Update
                        </button>
                        <button
                          type="button"
                          onClick={handleDeletePreset}
                          disabled={!selectedPresetId}
                          className="px-3 py-2 rounded-lg text-[11px] bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-gray-500">Symbol</label>
                      <input
                        value={ticketSymbol}
                        onChange={(e) => setTicketSymbol(e.target.value)}
                        className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                        placeholder="EURUSD"
                      />
                      {showTicketSuggestions && (
                        <div className="mt-2 border border-white/10 rounded-lg bg-black/40 p-2 space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                          {symbolResults.map((symbol) => (
                            <button
                              type="button"
                              key={`${symbol}-ticket`}
                              onClick={() => setTicketSymbol(symbol)}
                              className="w-full text-left px-2 py-1 rounded-md hover:bg-white/10 text-[11px] text-emerald-200"
                            >
                              {symbol}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Side</label>
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setTicketSide("BUY")}
                            className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                              ticketSide === "BUY"
                                ? "bg-emerald-600/30 border border-emerald-500/30 text-emerald-100"
                                : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
                            }`}
                          >
                            BUY
                          </button>
                          <button
                            type="button"
                            onClick={() => setTicketSide("SELL")}
                            className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                              ticketSide === "SELL"
                                ? "bg-red-600/30 border border-red-500/30 text-red-100"
                                : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
                            }`}
                          >
                            SELL
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Type</label>
                        <select
                          value={ticketType}
                          onChange={(e) => setTicketType(e.target.value as TicketType)}
                          className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                        >
                          <option value="market">Market</option>
                          <option value="limit">Limit</option>
                          <option value="stop">Stop</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Lot Size</label>
                        <input
                          value={ticketVolume}
                          onChange={(e) => setTicketVolume(e.target.value)}
                          className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                          placeholder="0.10"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Price</label>
                        <input
                          value={ticketPrice}
                          onChange={(e) => setTicketPrice(e.target.value)}
                          className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                          placeholder={ticketType === "market" ? "Market" : "0.00000"}
                          disabled={ticketType === "market"}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Stop Loss</label>
                        <input
                          value={ticketStopLoss}
                          onChange={(e) => setTicketStopLoss(e.target.value)}
                          className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                          placeholder="0.00000"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Take Profit</label>
                        <input
                          value={ticketTakeProfit}
                          onChange={(e) => setTicketTakeProfit(e.target.value)}
                          className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                          placeholder="0.00000"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-between text-[10px] text-gray-500 font-mono">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={applyPricePrecision}
                            disabled={ticketPrecision == null}
                            className="px-2 py-1 rounded border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-50"
                          >
                            Round prices
                          </button>
                          <span>{ticketPrecisionLabel}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Deviation</label>
                        <input
                          value={ticketDeviation}
                          onChange={(e) => setTicketDeviation(e.target.value)}
                          className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                          placeholder="20"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-gray-500">Magic</label>
                        <input
                          value={ticketMagic}
                          onChange={(e) => setTicketMagic(e.target.value)}
                          className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                          placeholder="Optional"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-gray-500">Comment</label>
                      <input
                        value={ticketComment}
                        onChange={(e) => setTicketComment(e.target.value)}
                        className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                        placeholder="Optional note"
                      />
                    </div>

                    {ticketError && (
                      <div className="text-[11px] text-red-300 flex items-center gap-2">
                        <AlertCircle size={14} />
                        {ticketError}
                      </div>
                    )}
                    {ticketFlash && (
                      <div className="text-[11px] text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 size={14} />
                        {ticketFlash}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSubmitTicket}
                        disabled={ticketSubmitting || status !== "connected"}
                        className="flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ticketSubmitting ? "Submitting..." : "Place Order"}
                      </button>
                      <button
                        type="button"
                        onClick={() => addSymbolToWatchlist(ticketSymbol)}
                        className="px-3 py-2 rounded-lg text-[12px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors"
                      >
                        Watch
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] uppercase tracking-widest text-gray-400 font-semibold">Symbol Snapshot</div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {ticketSymbolTrimmed ? ticketSymbolTrimmed : "--"}
                      </div>
                    </div>

                    {ticketTick ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-300 font-mono">
                          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                            <div className="text-[9px] uppercase text-gray-500">Bid</div>
                            <div className="text-[13px] text-white">{formatPrice(ticketTick.bid)}</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                            <div className="text-[9px] uppercase text-gray-500">Ask</div>
                            <div className="text-[13px] text-white">{formatPrice(ticketTick.ask)}</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                            <div className="text-[9px] uppercase text-gray-500">Spread</div>
                            <div className="text-[13px] text-white">{formatPrice(ticketTick.spread)}</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/40 p-3">
                            <div className="text-[9px] uppercase text-gray-500">Latency</div>
                            <div className="text-[13px] text-white">{latencyLabel}</div>
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          Last tick {ticketTick.local_ts_ms ? formatAge(ticketTick.local_ts_ms) : "--"} ago
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-500">
                        No tick data yet. Add the symbol to your watchlist.
                      </div>
                    )}

                    <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-gray-400 font-mono">
                      <div className="text-[9px] uppercase tracking-widest text-gray-500">Active Symbols</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {symbols.length === 0 && <span>--</span>}
                        {symbols.map((symbol) => (
                          <button
                            key={`${symbol}-chip`}
                            type="button"
                            onClick={() => setTicketSymbol(symbol)}
                            className="px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] text-gray-300"
                          >
                            {symbol}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

                {activeView === "positions" && (
                <div className="space-y-3">
                  {positionsError && (
                    <div className="text-[11px] text-red-300">Positions error: {positionsError}</div>
                  )}
                  {sortedPositions.length === 0 && (
                    <div className="text-[11px] text-gray-500">No open positions.</div>
                  )}
                  {sortedPositions.map((pos) => {
                    const side = numberOrNull(pos?.type) === 1 ? "SELL" : "BUY";
                    const sideClass = side === "BUY" ? "text-emerald-300" : "text-red-300";
                    const profit = numberOrNull(pos?.profit) ?? 0;
                    const ticketId = numberOrNull(pos?.ticket ?? pos?.position_id ?? pos?.id);
                    return (
                      <div
                        key={ticketId != null ? `pos-${ticketId}` : `${pos?.symbol}-${pos?.time}`}
                        className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setTicketSymbol(String(pos?.symbol || ""))}
                            className="text-[12px] font-semibold text-white"
                          >
                            {pos?.symbol || "--"}
                          </button>
                          <div className={`text-[11px] font-mono ${sideClass}`}>{side}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-400 font-mono">
                          <div>Volume {formatVolume(pos?.volume)}</div>
                          <div>Open {formatPrice(pos?.price_open)}</div>
                          <div>SL {formatPrice(pos?.sl)}</div>
                          <div>TP {formatPrice(pos?.tp)}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`text-[12px] font-mono ${profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {profit >= 0 ? "+" : ""}{formatNumber(profit, 2)}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClosePosition(pos)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-100 transition-colors"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

                {activeView === "orders" && (
                <div className="space-y-3">
                  {ordersError && (
                    <div className="text-[11px] text-red-300">Orders error: {ordersError}</div>
                  )}
                  {sortedOrders.length === 0 && (
                    <div className="text-[11px] text-gray-500">No pending orders.</div>
                  )}
                  {sortedOrders.map((order) => {
                    const orderId = numberOrNull(order?.ticket ?? order?.order ?? order?.order_id);
                    const typeLabel = orderTypeLabel(order?.type);
                    const side = orderSideFromType(order?.type);
                    const sideClass = side === "BUY" ? "text-emerald-300" : side === "SELL" ? "text-red-300" : "text-gray-300";
                    return (
                      <div
                        key={orderId != null ? `order-${orderId}` : `${order?.symbol}-${order?.time_setup}`}
                        className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setTicketSymbol(String(order?.symbol || ""))}
                            className="text-[12px] font-semibold text-white"
                          >
                            {order?.symbol || "--"}
                          </button>
                          <div className={`text-[11px] font-mono ${sideClass}`}>{typeLabel}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-400 font-mono">
                          <div>Volume {formatVolume(order?.volume_current)}</div>
                          <div>Price {formatPrice(order?.price_open)}</div>
                          <div>SL {formatPrice(order?.sl)}</div>
                          <div>TP {formatPrice(order?.tp)}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-gray-500 font-mono">
                            {formatTimestamp(order?.time_setup)}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(order)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors flex items-center gap-1"
                          >
                            <XCircle size={12} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

                {activeView === "blotter" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={blotterQuery}
                      onChange={(e) => setBlotterQuery(e.target.value)}
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                      placeholder="Filter blotter by symbol"
                    />
                    <div className="text-[10px] text-gray-500 font-mono">{filteredBlotterEntries.length}</div>
                    <button
                      type="button"
                      onClick={() => fetchBlotter(true)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors"
                      disabled={blotterLoading}
                    >
                      {blotterLoading ? "Loading..." : "Reload"}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Updated {blotterUpdatedLabel}. Trade ledger entries recorded by this app.
                  </div>
                  {blotterError && (
                    <div className="text-[11px] text-red-300">Blotter error: {blotterError}</div>
                  )}
                  {filteredBlotterEntries.length === 0 ? (
                    <div className="text-[11px] text-gray-500">No blotter entries yet.</div>
                  ) : (
                    filteredBlotterEntries.map((entry, idx) => {
                      const symbol = String(entry?.symbol || "--");
                      const sideRaw = String(entry?.action || entry?.side || "").toUpperCase();
                      const side = sideRaw === "SELL" ? "SELL" : sideRaw === "BUY" ? "BUY" : "--";
                      const status = String(entry?.status || "--").toUpperCase();
                      const qty =
                        numberOrNull(entry?.qtyNormalized) ??
                        numberOrNull(entry?.brokerQty) ??
                        numberOrNull(entry?.qty);
                      const entryPrice =
                        numberOrNull(entry?.brokerEntryPrice) ??
                        numberOrNull(entry?.entryPrice);
                      const stopLoss =
                        numberOrNull(entry?.brokerStopLoss) ??
                        numberOrNull(entry?.stopLoss);
                      const takeProfit =
                        numberOrNull(entry?.brokerTakeProfit) ??
                        numberOrNull(entry?.takeProfit);
                      const createdAt = numberOrNull(entry?.updatedAtMs ?? entry?.createdAtMs);
                      return (
                        <div
                          key={String(entry?.id || `${symbol}-${idx}`)}
                          className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-[12px] font-semibold text-white">
                              {side} {symbol}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">{status}</div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-400 font-mono">
                            <div>Qty {qty != null ? formatVolume(qty) : "--"}</div>
                            <div>Entry {formatPrice(entryPrice)}</div>
                            <div>SL {formatPrice(stopLoss)}</div>
                            <div>TP {formatPrice(takeProfit)}</div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
                            <span>{entry?.executionMode ? `Mode ${entry.executionMode}` : ""}</span>
                            <span>{createdAt != null ? formatAge(createdAt) : "--"}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

                {activeView === "history" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500">Days</div>
                    <input
                      type="number"
                      value={historyDays}
                      onChange={(e) => setHistoryDays(Number(e.target.value) || 1)}
                      min={1}
                      max={365}
                      className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-100 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => refreshHistory({ days: historyDays })}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors"
                    >
                      Load
                    </button>
                  </div>
                  {historyError && (
                    <div className="text-[11px] text-red-300">History error: {historyError}</div>
                  )}
                  {sortedHistory.length === 0 && (
                    <div className="text-[11px] text-gray-500">No history results.</div>
                  )}
                  {sortedHistory.map((deal, idx) => {
                    const profit = numberOrNull(deal?.profit) ?? 0;
                    return (
                      <div
                        key={`${deal?.ticket || deal?.order || idx}-history`}
                        className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-white">{deal?.symbol || "--"}</span>
                          <span className="text-[11px] font-mono text-gray-300">{dealTypeLabel(deal?.type)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-400 font-mono">
                          <div>Volume {formatVolume(deal?.volume)}</div>
                          <div>Price {formatPrice(deal?.price)}</div>
                          <div>Entry {deal?.entry != null ? deal?.entry : "--"}</div>
                          <div>Order {deal?.order != null ? deal?.order : "--"}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`text-[12px] font-mono ${profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {profit >= 0 ? "+" : ""}{formatNumber(profit, 2)}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono">
                            {formatTimestamp(deal?.time)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MT5Interface;
