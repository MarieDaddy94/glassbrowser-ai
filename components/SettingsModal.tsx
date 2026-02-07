import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X, KeyRound } from "lucide-react";
import TechAgentConsole from "./TechAgentConsole";
import type { AgentToolAction, AgentToolResult, HealthSnapshot } from "../types";
import type { SignalEntryStatus } from "./SignalInterface";
import { DEFAULT_BROKER_LINK_CONFIG, type BrokerLinkConfig, type SymbolMapEntry } from "../services/brokerLink";
import { requestBrokerCoordinated } from "../services/brokerRequestBridge";
import { getRuntimeScheduler } from "../services/runtimeScheduler";
import { requireBridge } from "../services/bridgeGuard";
import { recordLedgerQueueDepth } from "../services/persistenceHealth";
const AiKeysSection = React.lazy(() => import("./settings/AiKeysSection"));
const SignalAndWarmupSection = React.lazy(() => import("./settings/SignalAndWarmupSection"));
const PerformanceAndDebugSection = React.lazy(() => import("./settings/PerformanceAndDebugSection"));
const BrokerAdapterSection = React.lazy(() => import("./settings/BrokerAdapterSection"));
const TelemetrySection = React.lazy(() => import("./settings/TelemetrySection"));

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  onExecuteAgentTool?: (
    action: AgentToolAction,
    onProgress?: (update: Partial<AgentToolAction>) => void
  ) => Promise<AgentToolResult> | AgentToolResult;
  liveErrors?: Array<{
    id: string;
    ts: number;
    level?: string;
    source?: string;
    message: string;
    stack?: string | null;
    detail?: any;
    count?: number;
  }>;
  onClearLiveErrors?: () => void;
  healthSnapshot?: HealthSnapshot | null;
  performance?: {
    keepWatchedTabsMounted?: boolean;
    keepWatchedTabsMountedRequested?: boolean;
    isLive?: boolean;
    liveMode?: string | null;
    chatOpen?: boolean;
    sidebarMode?: string | null;
    chartWatchEnabled?: boolean;
    watchedTabs?: { total: number; manual: number; auto: number };
    chartSessions?: { total: number; watchEnabled: number; assignedViews: number };
  };
  brokerLinkConfig?: BrokerLinkConfig;
  onBrokerLinkChange?: (config: BrokerLinkConfig) => void;
  signalTelegramConfig?: SignalTelegramConfig;
  signalTelegramStatusOptions?: SignalEntryStatus[];
  onSignalTelegramChange?: (patch: Partial<SignalTelegramConfig>) => void;
  signalSnapshotWarmupConfig?: SignalSnapshotWarmupConfig;
  onSignalSnapshotWarmupChange?: (patch: Partial<SignalSnapshotWarmupConfig>) => void;
}

const STORAGE = {
  openaiKey: "glass_openai_api_key",
  geminiKey: "glass_gemini_api_key",
  textModel: "glass_openai_text_model",
  visionModel: "glass_openai_vision_model",
  visionDetail: "glass_openai_vision_detail",
  liveModel: "glass_openai_live_model",
  vectorStoreIds: "glass_openai_vector_store_ids",
  techReasoningEffort: "glass_openai_tech_reasoning_effort",
  activeVisionIntervalMs: "glass_vision_active_interval_ms",
  watchedVisionIntervalMs: "glass_vision_watched_interval_ms",
  chartWatchIntervalMs: "glass_chart_watch_interval_ms",
  autoWatchTradingView: "glass_auto_watch_tradingview",
  chatTabContextMode: "glass_chat_tab_context_mode",
  chatTabContextMaxTabs: "glass_chat_tab_context_max_tabs",
  chatTabContextChangeOnly: "glass_chat_tab_context_change_only",
  chatTabContextRoi: "glass_chat_tab_context_roi",
  chatTabContextRedaction: "glass_chat_tab_context_redaction",
  actionFlowDebug: "glass_action_flow_debug"
};

const TL_PROFILES_KEY = "glass_tradelocker_profiles_v1";
const TL_ACTIVE_PROFILE_KEY = "glass_tradelocker_active_profile_v1";

type TradeLockerProfile = {
  id: string;
  label: string;
  env: "demo" | "live";
  server: string;
  email: string;
  rememberPassword?: boolean;
  rememberDeveloperKey?: boolean;
};

type ChatTabContextMode = "active" | "active_watched" | "tradingview_all";
type ChatTabContextRoi = "full" | "center" | "chart_focus";
type ChatTabContextRedaction = "none" | "top_left" | "top_right" | "top_corners" | "top_bar";
type SettingsSectionKey = "ai" | "signal" | "performance" | "broker" | "telemetry";

type SignalTelegramConfig = {
  enabled: boolean;
  botToken: string;
  chatId: string;
  sendOn: SignalEntryStatus[];
  commandsEnabled?: boolean;
  commandMode?: 'read' | 'manage';
  commandPassphrase?: string;
  allowChart?: boolean;
  allowStatus?: boolean;
  allowManage?: boolean;
  alertsEnabled?: boolean;
  alertTrades?: boolean;
  alertTpSl?: boolean;
  alertDrawdown?: boolean;
  alertAgentConfidence?: boolean;
  alertConfidenceDrop?: number;
  alertDrawdownPct?: number;
  inlineActionsEnabled?: boolean;
  confirmationsEnabled?: boolean;
  confirmationTimeoutSec?: number;
  digestDailyEnabled?: boolean;
  digestWeeklyEnabled?: boolean;
  digestHourLocal?: number;
  digestWeeklyDay?: number;
};

type SignalSnapshotWarmupConfig = {
  barsDefault?: number;
  bars1d?: number;
  bars1w?: number;
  timeoutMs?: number;
};

const loadTradeLockerProfiles = (): TradeLockerProfile[] => {
  try {
    const raw = localStorage.getItem(TL_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        id: String(entry?.id || ""),
        label: String(entry?.label || ""),
        env: entry?.env === "live" ? "live" : "demo",
        server: String(entry?.server || ""),
        email: String(entry?.email || ""),
        rememberPassword: entry?.rememberPassword === true,
        rememberDeveloperKey: entry?.rememberDeveloperKey === true
      }))
      .filter((entry) => entry.id && entry.server && entry.email);
  } catch {
    return [];
  }
};

const persistTradeLockerProfiles = (profiles: TradeLockerProfile[]) => {
  try {
    localStorage.setItem(TL_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore storage failures
  }
};

const DEFAULT_SIGNAL_TELEGRAM_STATUS_OPTIONS: SignalEntryStatus[] = [
  "PROPOSED",
  "SUBMITTING",
  "PENDING",
  "EXECUTED",
  "REJECTED",
  "EXPIRED",
  "WIN",
  "LOSS",
  "FAILED"
];

const DEFAULT_SIGNAL_TELEGRAM_SETTINGS = {
  alertsEnabled: true,
  alertTrades: true,
  alertTpSl: true,
  alertDrawdown: true,
  alertAgentConfidence: true,
  alertConfidenceDrop: 15,
  alertDrawdownPct: 80,
  inlineActionsEnabled: true,
  confirmationsEnabled: true,
  confirmationTimeoutSec: 45,
  digestDailyEnabled: false,
  digestWeeklyEnabled: false,
  digestHourLocal: 9,
  digestWeeklyDay: 1
};

const DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS = {
  barsDefault: 320,
  bars1d: 60,
  bars1w: 8,
  timeoutMs: 90_000
};

const OPENAI_TEXT_MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "Auto (recommended)" },
  { value: "gpt-5.2", label: "gpt-5.2" }
];

const OPENAI_LIVE_MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "Default (recommended)" },
  { value: "gpt-5.2", label: "gpt-5.2" }
];

const OPENAI_VISION_MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "Auto (recommended)" },
  { value: "gpt-5.2", label: "gpt-5.2" }
];

const OPENAI_VISION_DETAIL_PRESETS: Array<{ value: "auto" | "low" | "high"; label: string }> = [
  { value: "auto", label: "auto (recommended)" },
  { value: "low", label: "low (faster/cheaper)" },
  { value: "high", label: "high (best small text)" }
];

const OPENAI_TECH_REASONING_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "Auto (medium)" },
  { value: "none", label: "none" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" }
];

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onRunActionCatalog,
  onExecuteAgentTool,
  liveErrors,
  onClearLiveErrors,
  performance,
  brokerLinkConfig,
  onBrokerLinkChange,
  signalTelegramConfig,
  signalTelegramStatusOptions,
  onSignalTelegramChange,
  signalSnapshotWarmupConfig,
  onSignalSnapshotWarmupChange,
  healthSnapshot
}) => {
  const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [textModel, setTextModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [visionDetail, setVisionDetail] = useState<"auto" | "low" | "high">("auto");
  const [liveModel, setLiveModel] = useState("");
  const [vectorStoreIds, setVectorStoreIds] = useState("");
  const [techReasoningEffort, setTechReasoningEffort] = useState("");
  const [activeVisionIntervalMs, setActiveVisionIntervalMs] = useState("2000");
  const [watchedVisionIntervalMs, setWatchedVisionIntervalMs] = useState("7000");
  const [chartWatchIntervalMs, setChartWatchIntervalMs] = useState("60000");
  const [autoWatchTradingView, setAutoWatchTradingView] = useState(true);
  const [chatTabContextMode, setChatTabContextMode] = useState<ChatTabContextMode>("tradingview_all");
  const [chatTabContextMaxTabs, setChatTabContextMaxTabs] = useState("3");
  const [chatTabContextChangeOnly, setChatTabContextChangeOnly] = useState(true);
  const [chatTabContextRoi, setChatTabContextRoi] = useState<ChatTabContextRoi>("full");
  const [chatTabContextRedaction, setChatTabContextRedaction] = useState<ChatTabContextRedaction>("none");
  const [actionFlowDebugEnabled, setActionFlowDebugEnabled] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("ai");

  const normalizeBrokerLinkConfig = (input?: BrokerLinkConfig | null): BrokerLinkConfig => {
    const base = DEFAULT_BROKER_LINK_CONFIG;
    const safe = input && typeof input === "object" ? input : {};
    return {
      ...base,
      ...safe,
      signalDefaults: {
        ...base.signalDefaults,
        ...(safe as BrokerLinkConfig).signalDefaults
      },
      slippageGuard: {
        ...base.slippageGuard,
        ...(safe as BrokerLinkConfig).slippageGuard
      },
      symbolMap: Array.isArray((safe as BrokerLinkConfig).symbolMap) ? (safe as BrokerLinkConfig).symbolMap : base.symbolMap
    };
  };

  const formatSymbolMapText = (entries: SymbolMapEntry[]) => {
    if (!Array.isArray(entries) || entries.length === 0) return "";
    return entries
      .map((entry) => {
        if (!entry || !entry.canonical) return "";
        const mt5 = entry.mt5 ? String(entry.mt5) : "";
        const tl = entry.tradelocker ? String(entry.tradelocker) : "";
        return [entry.canonical, mt5, tl].join(" | ");
      })
      .filter(Boolean)
      .join("\n");
  };

  const parseSymbolMapText = (text: string): SymbolMapEntry[] => {
    const lines = String(text || "").split(/\r?\n/g);
    const entries: SymbolMapEntry[] = [];
    for (const line of lines) {
      const raw = String(line || "").trim();
      if (!raw) continue;
      const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      const [canonical, mt5, tradelocker] = parts;
      if (!canonical) continue;
      entries.push({
        canonical,
        mt5: mt5 || null,
        tradelocker: tradelocker || null
      });
    }
    return entries;
  };

  const parseNumberInput = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  const toggleList = <T extends string>(list: T[], value: T) => {
    return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  };

  const [brokerLinkDraft, setBrokerLinkDraft] = useState<BrokerLinkConfig>(() => normalizeBrokerLinkConfig(brokerLinkConfig));
  const [brokerLinkSymbolMapText, setBrokerLinkSymbolMapText] = useState(() => formatSymbolMapText(brokerLinkDraft.symbolMap));

  useEffect(() => {
    if (!isOpen) return;
    const normalized = normalizeBrokerLinkConfig(brokerLinkConfig);
    setBrokerLinkDraft(normalized);
    setBrokerLinkSymbolMapText(formatSymbolMapText(normalized.symbolMap));
  }, [brokerLinkConfig, isOpen]);
  const [showLiveErrorLog, setShowLiveErrorLog] = useState(false);
  const [showDiagnosticsConsole, setShowDiagnosticsConsole] = useState(false);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<string | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsUpdatedAtMs, setDiagnosticsUpdatedAtMs] = useState<number | null>(null);
  const [diagnosticsAuditEntries, setDiagnosticsAuditEntries] = useState<any[]>([]);
  const [diagnosticsAuditError, setDiagnosticsAuditError] = useState<string | null>(null);
  const [diagnosticsMainLog, setDiagnosticsMainLog] = useState<string>("");
  const [diagnosticsMeta, setDiagnosticsMeta] = useState<any | null>(null);
  const [diagnosticsReleases, setDiagnosticsReleases] = useState<any[]>([]);
  const [showTechAgentConsole, setShowTechAgentConsole] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGemini, setShowGemini] = useState(false);
  const [openaiKeyStored, setOpenaiKeyStored] = useState(false);
  const [geminiKeyStored, setGeminiKeyStored] = useState(false);
  const [secretsAvailable, setSecretsAvailable] = useState(true);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [brokerList, setBrokerList] = useState<any[]>([]);
  const [brokerActiveId, setBrokerActiveId] = useState("");
  const [brokerStatus, setBrokerStatus] = useState<any | null>(null);
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const healthPerf = healthSnapshot?.perf || null;

  const readClipboardText = useCallback(async () => {
    try {
      const fn = window.glass?.clipboard?.readText;
      if (fn) {
        const v: any = fn();
        if (v && typeof v.then === "function") return String(await v);
        return String(v ?? "");
      }
    } catch {
      // ignore
    }

    try {
      if (navigator?.clipboard?.readText) return await navigator.clipboard.readText();
    } catch {
      // ignore
    }

    return "";
  }, []);

  const writeClipboardText = useCallback(async (text: string) => {
    try {
      const fn = window.glass?.clipboard?.writeText;
      if (fn) {
        const v: any = fn(text);
        if (v && typeof v.then === "function") await v;
        return true;
      }
    } catch {
      // ignore
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // ignore
    }

    return false;
  }, []);

  const formatTimestamp = (value?: number | null) => {
    const ts = Number(value || 0);
    if (!Number.isFinite(ts) || ts <= 0) return "--";
    return new Date(ts).toLocaleString();
  };

  const formatAgeShort = (value?: number | null) => {
    const ts = Number(value || 0);
    if (!Number.isFinite(ts) || ts <= 0) return "--";
    const delta = Date.now() - ts;
    if (delta < 0) return "0s";
    const sec = Math.floor(delta / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    return `${day}d`;
  };

  const compareVersions = (left: string, right: string) => {
    const leftParts = String(left || "").split(".").map((part) => parseInt(part, 10));
    const rightParts = String(right || "").split(".").map((part) => parseInt(part, 10));
    const max = Math.max(leftParts.length, rightParts.length);
    for (let i = 0; i < max; i += 1) {
      const a = Number.isFinite(leftParts[i]) ? leftParts[i] : 0;
      const b = Number.isFinite(rightParts[i]) ? rightParts[i] : 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  };

  const updateStatus = useMemo(() => {
    const current = diagnosticsMeta?.version ? String(diagnosticsMeta.version) : "";
    const latest = diagnosticsReleases.find((r: any) => r?.version)?.version || "";
    if (!current || !latest) return null;
    return compareVersions(latest, current) > 0
      ? `Update available: ${latest}`
      : "Up to date";
  }, [diagnosticsMeta?.version, diagnosticsReleases]);

  const refreshDiagnosticsAudit = useCallback(async (limit = 120) => {
    if (!onRunActionCatalog) {
      setDiagnosticsAuditError("Audit list unavailable.");
      return;
    }
    setDiagnosticsAuditError(null);
    try {
      const res = await onRunActionCatalog({ actionId: "audit.list", payload: { limit } });
      if (!res?.ok) {
        setDiagnosticsAuditError(res?.error || "Failed to load audit events.");
        return;
      }
      const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];
      setDiagnosticsAuditEntries(entries);
    } catch (err: any) {
      setDiagnosticsAuditError(err?.message ? String(err.message) : "Failed to load audit events.");
    }
  }, [onRunActionCatalog]);

  const refreshDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsStatus(null);
    try {
      const api = window.glass?.diagnostics;
      if (api?.getAppMeta) {
        const res = await api.getAppMeta();
        setDiagnosticsMeta(res?.ok ? res.meta || null : null);
      } else {
        setDiagnosticsMeta(null);
      }
      if (api?.getMainLog) {
        const res = await api.getMainLog({ maxLines: 200, maxBytes: 40_000 });
        setDiagnosticsMainLog(res?.ok && res.text ? String(res.text) : res?.error ? String(res.error) : "");
      } else {
        setDiagnosticsMainLog("");
      }
      if (api?.listReleases) {
        const res = await api.listReleases({ includeHashes: false, maxFiles: 40 });
        setDiagnosticsReleases(res?.ok && Array.isArray(res.releases) ? res.releases : []);
      } else {
        setDiagnosticsReleases([]);
      }
      await refreshDiagnosticsAudit();
      setDiagnosticsUpdatedAtMs(Date.now());
    } catch (err: any) {
      setDiagnosticsStatus(err?.message ? String(err.message) : "Diagnostics refresh failed.");
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [refreshDiagnosticsAudit]);

  const refreshReleaseHashes = useCallback(async () => {
    const api = window.glass?.diagnostics;
    if (!api?.listReleases) {
      setDiagnosticsStatus("Release listing unavailable.");
      return;
    }
    setDiagnosticsStatus("Validating release hashes...");
    try {
      const res = await api.listReleases({ includeHashes: true, maxFiles: 20 });
      if (!res?.ok) {
        setDiagnosticsStatus(res?.error || "Release validation failed.");
        return;
      }
      setDiagnosticsReleases(Array.isArray(res.releases) ? res.releases : []);
      setDiagnosticsStatus("Release hashes updated.");
      setDiagnosticsUpdatedAtMs(Date.now());
    } catch (err: any) {
      setDiagnosticsStatus(err?.message ? String(err.message) : "Release validation failed.");
    }
  }, []);

  const handleDiagnosticsExport = useCallback(async (mode: "download" | "clipboard") => {
    if (!onRunActionCatalog) {
      setDiagnosticsStatus("Diagnostics export unavailable.");
      return;
    }
    setDiagnosticsStatus("Exporting diagnostics...");
    try {
      const res = await onRunActionCatalog({
        actionId: "diagnostics.export",
        payload: { mode, detail: "full" }
      });
      if (!res?.ok) {
        setDiagnosticsStatus(res?.error || "Diagnostics export failed.");
        return;
      }
      setDiagnosticsStatus(mode === "clipboard" ? "Diagnostics copied." : "Diagnostics saved.");
    } catch (err: any) {
      setDiagnosticsStatus(err?.message ? String(err.message) : "Diagnostics export failed.");
    }
  }, [onRunActionCatalog]);

  useEffect(() => {
    if (!showDiagnosticsConsole) return;
    refreshDiagnostics();
  }, [refreshDiagnostics, showDiagnosticsConsole]);

  const signalTelegramResolved: SignalTelegramConfig = useMemo(() => {
    const base = signalTelegramConfig || ({} as SignalTelegramConfig);
    const confidenceDropRaw = Number(base.alertConfidenceDrop);
    const drawdownRaw = Number(base.alertDrawdownPct);
    const confirmTimeoutRaw = Number(base.confirmationTimeoutSec);
    const digestHourRaw = Number(base.digestHourLocal);
    const digestDayRaw = Number(base.digestWeeklyDay);
    const alertConfidenceDrop = Number.isFinite(confidenceDropRaw)
      ? Math.max(1, Math.min(100, Math.round(confidenceDropRaw)))
      : DEFAULT_SIGNAL_TELEGRAM_SETTINGS.alertConfidenceDrop;
    const alertDrawdownPct = Number.isFinite(drawdownRaw)
      ? Math.max(1, Math.min(100, Math.round(drawdownRaw)))
      : DEFAULT_SIGNAL_TELEGRAM_SETTINGS.alertDrawdownPct;
    const confirmationTimeoutSec = Number.isFinite(confirmTimeoutRaw)
      ? Math.max(10, Math.min(600, Math.floor(confirmTimeoutRaw)))
      : DEFAULT_SIGNAL_TELEGRAM_SETTINGS.confirmationTimeoutSec;
    const digestHourLocal = Number.isFinite(digestHourRaw)
      ? Math.max(0, Math.min(23, Math.floor(digestHourRaw)))
      : DEFAULT_SIGNAL_TELEGRAM_SETTINGS.digestHourLocal;
    const digestWeeklyDay = Number.isFinite(digestDayRaw)
      ? Math.max(0, Math.min(6, Math.floor(digestDayRaw)))
      : DEFAULT_SIGNAL_TELEGRAM_SETTINGS.digestWeeklyDay;
    return {
      enabled: !!base.enabled,
      botToken: String(base.botToken || ""),
      chatId: String(base.chatId || ""),
      sendOn: Array.isArray(base.sendOn) ? base.sendOn : [],
      commandsEnabled: !!base.commandsEnabled,
      commandMode: base.commandMode === "manage" ? "manage" : "read",
      commandPassphrase: String(base.commandPassphrase || ""),
      allowChart: base.allowChart !== false,
      allowStatus: base.allowStatus !== false,
      allowManage: base.allowManage === true,
      alertsEnabled: base.alertsEnabled === true,
      alertTrades: base.alertTrades !== false,
      alertTpSl: base.alertTpSl !== false,
      alertDrawdown: base.alertDrawdown === true,
      alertAgentConfidence: base.alertAgentConfidence === true,
      alertConfidenceDrop,
      alertDrawdownPct,
      inlineActionsEnabled: base.inlineActionsEnabled !== false,
      confirmationsEnabled: base.confirmationsEnabled !== false,
      confirmationTimeoutSec,
      digestDailyEnabled: base.digestDailyEnabled === true,
      digestWeeklyEnabled: base.digestWeeklyEnabled === true,
      digestHourLocal,
      digestWeeklyDay
    };
  }, [signalTelegramConfig]);

  const signalSnapshotWarmupResolved = useMemo(() => {
    const base = signalSnapshotWarmupConfig || {};
    return {
      barsDefault: base.barsDefault ?? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.barsDefault,
      bars1d: base.bars1d ?? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.bars1d,
      bars1w: base.bars1w ?? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.bars1w,
      timeoutMs: base.timeoutMs ?? DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.timeoutMs
    };
  }, [signalSnapshotWarmupConfig]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection("ai");
  }, [isOpen]);

  const signalTelegramStatuses = useMemo(() => {
    return Array.isArray(signalTelegramStatusOptions) && signalTelegramStatusOptions.length > 0
      ? signalTelegramStatusOptions
      : DEFAULT_SIGNAL_TELEGRAM_STATUS_OPTIONS;
  }, [signalTelegramStatusOptions]);

  const signalTelegramMissing =
    signalTelegramResolved.enabled && (!signalTelegramResolved.botToken || !signalTelegramResolved.chatId);
  const signalSnapshotWarmupTimeoutSec = Number.isFinite(Number(signalSnapshotWarmupResolved.timeoutMs))
    ? Math.max(5, Math.round(Number(signalSnapshotWarmupResolved.timeoutMs) / 1000))
    : Math.round(DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS.timeoutMs / 1000);

  const handleSignalTelegramPaste = useCallback(
    async (field: "botToken" | "chatId") => {
      if (!onSignalTelegramChange) return;
      const text = String(await readClipboardText()).trim();
      if (!text) return;
      if (field === "botToken") {
        onSignalTelegramChange({ botToken: text });
      } else {
        onSignalTelegramChange({ chatId: text });
      }
    },
    [onSignalTelegramChange, readClipboardText]
  );

  const buildLiveErrorExport = useCallback(() => {
    const items = Array.isArray(liveErrors) ? liveErrors : [];
    return JSON.stringify(items, null, 2);
  }, [liveErrors]);

  const downloadLiveErrors = useCallback(() => {
    try {
      const payload = buildLiveErrorExport();
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `glass-live-errors-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } catch {
      // ignore
    }
  }, [buildLiveErrorExport]);

  const refreshSecretsStatus = useCallback(async () => {
    try {
      const secrets = (window as any)?.glass?.secrets;
      if (!secrets?.getStatus) {
        setSecretsAvailable(false);
        setOpenaiKeyStored(false);
        setGeminiKeyStored(false);
        setSecretsError("Secure storage unavailable.");
        return;
      }
      const res = await secrets.getStatus();
      if (!res?.ok) {
        setSecretsAvailable(false);
        setOpenaiKeyStored(false);
        setGeminiKeyStored(false);
        setSecretsError(res?.error ? String(res.error) : "Secure storage unavailable.");
        return;
      }
      setSecretsAvailable(res.encryptionAvailable !== false);
      setOpenaiKeyStored(!!res?.openai?.hasKey);
      setGeminiKeyStored(!!res?.gemini?.hasKey);
      setSecretsError(null);
    } catch (e: any) {
      setSecretsAvailable(false);
      setOpenaiKeyStored(false);
      setGeminiKeyStored(false);
      setSecretsError(e?.message ? String(e.message) : "Secure storage unavailable.");
    }
  }, []);

  const refreshBrokerInfo = useCallback(async () => {
    const broker = (window as any)?.glass?.broker;
    if (!broker?.list) {
      setBrokerList([]);
      setBrokerActiveId("");
      setBrokerStatus(null);
      setBrokerError("Broker registry unavailable.");
      return;
    }
    setBrokerLoading(true);
    try {
      const [listRes, activeRes] = await Promise.all([
        broker.list(),
        broker.getActive ? broker.getActive() : Promise.resolve(null)
      ]);
      if (listRes?.ok) {
        setBrokerList(Array.isArray(listRes.brokers) ? listRes.brokers : []);
        setBrokerError(null);
      } else {
        setBrokerList([]);
        setBrokerError(listRes?.error ? String(listRes.error) : "Failed to load brokers.");
      }
      if (activeRes?.ok) {
        setBrokerActiveId(activeRes.activeId != null ? String(activeRes.activeId) : "");
      } else if (listRes?.ok && Array.isArray(listRes.brokers)) {
        const active = listRes.brokers.find((b: any) => b?.active);
        setBrokerActiveId(active?.id ? String(active.id) : "");
      }
      const statusRes = await requestBrokerCoordinated("getStatus", undefined, { source: "settings" });
      setBrokerStatus(statusRes || null);
    } catch (e: any) {
      setBrokerList([]);
      setBrokerStatus(null);
      setBrokerError(e?.message ? String(e.message) : "Failed to load broker status.");
    } finally {
      setBrokerLoading(false);
    }
  }, []);

  // --- Performance ---
  const [ledgerStats, setLedgerStats] = useState<any | null>(null);
  const [ledgerStatsError, setLedgerStatsError] = useState<string | null>(null);
  const ledgerStatsInFlightRef = React.useRef(false);

  const refreshLedgerStats = useCallback(async () => {
    if (ledgerStatsInFlightRef.current) return;
    ledgerStatsInFlightRef.current = true;
    try {
      const bridge = requireBridge("settings.ledger_stats");
      if (!bridge.ok) {
        setLedgerStats(null);
        setLedgerStatsError(bridge.error);
        recordLedgerQueueDepth("app", 0);
        return;
      }
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.stats) {
        setLedgerStats(null);
        setLedgerStatsError("Trade ledger stats unavailable.");
        recordLedgerQueueDepth("app", 0);
        return;
      }
      const res = await ledger.stats();
      if (!res?.ok) {
        setLedgerStats(null);
        setLedgerStatsError(res?.error ? String(res.error) : "Failed to read trade ledger stats.");
        recordLedgerQueueDepth("app", 0);
        return;
      }
      setLedgerStats(res);
      setLedgerStatsError(null);
      const pendingWrites = Number(res?.pendingWrites || 0);
      recordLedgerQueueDepth("app", Number.isFinite(pendingWrites) ? pendingWrites : 0);
    } catch (e: any) {
      setLedgerStats(null);
      setLedgerStatsError(e?.message ? String(e.message) : "Failed to read trade ledger stats.");
      recordLedgerQueueDepth("app", 0);
    } finally {
      ledgerStatsInFlightRef.current = false;
    }
  }, []);

  const flushLedgerNow = useCallback(async () => {
    try {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.flush) return;
      await ledger.flush();
    } catch {
      // ignore
    } finally {
      void refreshLedgerStats();
    }
  }, [refreshLedgerStats]);

  // --- TradeLocker ---
  const [tlEnv, setTlEnv] = useState<"demo" | "live">("demo");
  const [tlServer, setTlServer] = useState("");
  const [tlEmail, setTlEmail] = useState("");
  const [tlPassword, setTlPassword] = useState("");
  const [tlDeveloperKey, setTlDeveloperKey] = useState("");
  const [tlShowPassword, setTlShowPassword] = useState(false);
  const [tlShowDeveloperKey, setTlShowDeveloperKey] = useState(false);
  const [tlRememberPassword, setTlRememberPassword] = useState(true);
  const [tlRememberDeveloperKey, setTlRememberDeveloperKey] = useState(false);
  const [tlProfiles, setTlProfiles] = useState<TradeLockerProfile[]>(() => loadTradeLockerProfiles());
  const [tlActiveProfileId, setTlActiveProfileId] = useState(() => {
    try {
      return localStorage.getItem(TL_ACTIVE_PROFILE_KEY) || "";
    } catch {
      return "";
    }
  });

  const [tlConnected, setTlConnected] = useState(false);
  const [tlConnecting, setTlConnecting] = useState(false);
  const [tlLastError, setTlLastError] = useState<string | null>(null);

  const [tlEncryptionAvailable, setTlEncryptionAvailable] = useState(true);
  const [tlHasSavedPassword, setTlHasSavedPassword] = useState(false);
  const [tlHasSavedDeveloperKey, setTlHasSavedDeveloperKey] = useState(false);

  const [tlAccounts, setTlAccounts] = useState<any[]>([]);
  const [tlSelectedAccountId, setTlSelectedAccountId] = useState<string>("");
  const [tlSelectedAccNum, setTlSelectedAccNum] = useState<string>("");

  const [tlTradingEnabled, setTlTradingEnabled] = useState(false);
  const [tlAutoPilotEnabled, setTlAutoPilotEnabled] = useState(false);
  const [tlAutoConnect, setTlAutoConnect] = useState(false);
  const [tlDefaultOrderQty, setTlDefaultOrderQty] = useState("0.01");
  const [tlDefaultOrderType, setTlDefaultOrderType] = useState<"market" | "limit" | "stop">("market");
  const [tlStreamingEnabled, setTlStreamingEnabled] = useState(false);
  const [tlStreamingUrl, setTlStreamingUrl] = useState("");
  const [tlStreamingAutoReconnect, setTlStreamingAutoReconnect] = useState(true);
  const [tlStreamingSubscribe, setTlStreamingSubscribe] = useState("");
  const [tlDebugEnabled, setTlDebugEnabled] = useState(true);
  const [tlDebugMaxBytesMb, setTlDebugMaxBytesMb] = useState("2");
  const [tlDebugMaxFiles, setTlDebugMaxFiles] = useState("3");
  const [tlDebugTextLimit, setTlDebugTextLimit] = useState("6000");

  const tlStatusMeta = useMemo(() => {
    if (tlConnected) return { dot: "bg-green-500", label: "CONNECTED" };
    if (tlConnecting) return { dot: "bg-yellow-500 animate-pulse", label: "CONNECTING..." };
    if (tlLastError) return { dot: "bg-red-500 animate-pulse", label: "ERROR" };
    return { dot: "bg-gray-600", label: "DISCONNECTED" };
  }, [tlConnected, tlConnecting, tlLastError]);

  useEffect(() => {
    persistTradeLockerProfiles(tlProfiles);
  }, [tlProfiles]);

  useEffect(() => {
    try {
      if (tlActiveProfileId) {
        localStorage.setItem(TL_ACTIVE_PROFILE_KEY, tlActiveProfileId);
      } else {
        localStorage.removeItem(TL_ACTIVE_PROFILE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, [tlActiveProfileId]);

  const activeBroker = useMemo(() => {
    if (!brokerList || brokerList.length === 0) return null;
    const byId = brokerActiveId ? brokerList.find((b: any) => String(b?.id || "") === brokerActiveId) : null;
    if (byId) return byId;
    return brokerList.find((b: any) => b?.active) || brokerList[0] || null;
  }, [brokerList, brokerActiveId]);

  const brokerCaps = useMemo(() => {
    const caps = activeBroker?.capabilities && typeof activeBroker.capabilities === "object"
      ? activeBroker.capabilities
      : {};
    return Object.entries(caps)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
  }, [activeBroker]);

  const brokerStatusMeta = useMemo(() => {
    if (brokerLoading) return { dot: "bg-yellow-500 animate-pulse", label: "LOADING..." };
    if (brokerError) return { dot: "bg-red-500 animate-pulse", label: "ERROR" };
    if (brokerStatus?.connected) return { dot: "bg-green-500", label: "CONNECTED" };
    return { dot: "bg-gray-600", label: "UNKNOWN" };
  }, [brokerLoading, brokerError, brokerStatus]);

  const tlBridgeAvailable = !!window.glass?.tradelocker?.connect;
  const electronBridgeAvailable = !!window.glass?.isElectron;

  useEffect(() => {
    if (!isOpen) return;
    try {
      setOpenaiKey("");
      setGeminiKey("");
      setTextModel(localStorage.getItem(STORAGE.textModel) || "");
      setVisionModel(localStorage.getItem(STORAGE.visionModel) || "");
      const rawDetail = (localStorage.getItem(STORAGE.visionDetail) || "auto").trim().toLowerCase();
      setVisionDetail(rawDetail === "low" || rawDetail === "high" ? rawDetail : "auto");
      setLiveModel(localStorage.getItem(STORAGE.liveModel) || "");
      setVectorStoreIds(localStorage.getItem(STORAGE.vectorStoreIds) || "");
      setTechReasoningEffort(localStorage.getItem(STORAGE.techReasoningEffort) || "");
      setActiveVisionIntervalMs(localStorage.getItem(STORAGE.activeVisionIntervalMs) || "2000");
      setWatchedVisionIntervalMs(localStorage.getItem(STORAGE.watchedVisionIntervalMs) || "7000");
      setChartWatchIntervalMs(localStorage.getItem(STORAGE.chartWatchIntervalMs) || "60000");
      const rawAutoTv = localStorage.getItem(STORAGE.autoWatchTradingView);
      if (rawAutoTv == null) setAutoWatchTradingView(true);
      else setAutoWatchTradingView(!(rawAutoTv === "0" || rawAutoTv === "false"));

      const rawCtxMode = (localStorage.getItem(STORAGE.chatTabContextMode) || "tradingview_all").trim().toLowerCase();
      setChatTabContextMode(
        rawCtxMode === "active" || rawCtxMode === "active_watched" || rawCtxMode === "tradingview_all"
          ? (rawCtxMode as ChatTabContextMode)
          : "tradingview_all"
      );

      const rawMaxTabs = localStorage.getItem(STORAGE.chatTabContextMaxTabs);
      const maxTabs = rawMaxTabs ? Number(rawMaxTabs) : NaN;
      if (Number.isFinite(maxTabs)) setChatTabContextMaxTabs(String(Math.min(6, Math.max(1, Math.floor(maxTabs)))));
      else setChatTabContextMaxTabs("3");

      const rawChangeOnly = localStorage.getItem(STORAGE.chatTabContextChangeOnly);
      if (rawChangeOnly == null) setChatTabContextChangeOnly(true);
      else setChatTabContextChangeOnly(!(rawChangeOnly === "0" || rawChangeOnly === "false"));

      const rawRoi = String(localStorage.getItem(STORAGE.chatTabContextRoi) || "").trim().toLowerCase();
      setChatTabContextRoi(rawRoi === "center" || rawRoi === "chart_focus" ? (rawRoi as ChatTabContextRoi) : "full");

      const rawRedaction = String(localStorage.getItem(STORAGE.chatTabContextRedaction) || "").trim().toLowerCase();
      if (rawRedaction === "top_left" || rawRedaction === "top_right" || rawRedaction === "top_corners" || rawRedaction === "top_bar") {
        setChatTabContextRedaction(rawRedaction as ChatTabContextRedaction);
      } else {
        setChatTabContextRedaction("none");
      }
      const rawActionFlowDebug = String(localStorage.getItem(STORAGE.actionFlowDebug) || "").trim().toLowerCase();
      setActionFlowDebugEnabled(rawActionFlowDebug === "1" || rawActionFlowDebug === "true");
    } catch {
      // ignore storage access issues
    }

    void refreshSecretsStatus();
    void refreshBrokerInfo();

    // Load TradeLocker config from main (no secrets returned)
    const tl = window.glass?.tradelocker;
    if (!tl?.getSavedConfig || !tl?.getStatus) return;
    (async () => {
      try {
        const [cfg, stat] = await Promise.all([tl.getSavedConfig(), tl.getStatus()]);
        if (cfg?.ok) {
          setTlEnv(cfg.env);
          setTlServer(cfg.server || "");
          setTlEmail(cfg.email || "");
          setTlAutoConnect(!!cfg.autoConnect);
          setTlTradingEnabled(!!cfg.tradingEnabled);
          setTlAutoPilotEnabled(!!cfg.autoPilotEnabled);
          setTlDefaultOrderQty(String(cfg.defaultOrderQty ?? "0.01"));
          setTlDefaultOrderType(
            cfg.defaultOrderType === "limit"
              ? "limit"
              : cfg.defaultOrderType === "stop"
                ? "stop"
                : "market"
          );
          setTlStreamingEnabled(!!cfg.streamingEnabled);
          setTlStreamingUrl(cfg.streamingUrl ? String(cfg.streamingUrl) : "");
          setTlStreamingAutoReconnect(cfg.streamingAutoReconnect !== false);
          setTlStreamingSubscribe(cfg.streamingSubscribe ? String(cfg.streamingSubscribe) : "");
          setTlSelectedAccountId(cfg.accountId != null ? String(cfg.accountId) : "");
          setTlSelectedAccNum(cfg.accNum != null ? String(cfg.accNum) : "");
          setTlHasSavedPassword(!!cfg.hasSavedPassword);
          setTlHasSavedDeveloperKey(!!cfg.hasSavedDeveloperApiKey);
          setTlEncryptionAvailable(!!cfg.encryptionAvailable);
          const debug = cfg.debug || {};
          setTlDebugEnabled(debug.enabled !== false);
          const maxBytes = Number(debug.maxBytes);
          const maxMb = Number.isFinite(maxBytes) && maxBytes > 0 ? Math.max(1, Math.round(maxBytes / (1024 * 1024))) : 2;
          setTlDebugMaxBytesMb(String(maxMb));
          const maxFiles = Number(debug.maxFiles);
          setTlDebugMaxFiles(String(Number.isFinite(maxFiles) && maxFiles > 0 ? Math.min(20, Math.floor(maxFiles)) : 3));
          const textLimit = Number(debug.textLimit);
          setTlDebugTextLimit(String(Number.isFinite(textLimit) && textLimit > 0 ? Math.min(20000, Math.floor(textLimit)) : 6000));
        }
        if (stat?.ok) {
          setTlConnected(!!stat.connected);
          setTlLastError(stat.lastError ? String(stat.lastError) : null);
        }
        if (stat?.ok && stat.connected && tl.getAccounts) {
          const accountsRes = await tl.getAccounts();
          if (accountsRes?.ok && Array.isArray(accountsRes.accounts)) setTlAccounts(accountsRes.accounts);
        }
      } catch {
        // ignore
      }
    })();
  }, [isOpen, refreshSecretsStatus, refreshBrokerInfo]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshLedgerStats();
    const dispose = runtimeScheduler.registerTask({
      id: 'settings.ledger.stats',
      groupId: 'settings',
      intervalMs: 1000,
      jitterPct: 0.05,
      visibilityMode: 'foreground',
      priority: 'low',
      run: async () => {
        await refreshLedgerStats();
      }
    });
    return () => dispose();
  }, [isOpen, refreshLedgerStats, runtimeScheduler]);

  if (!isOpen) return null;

  const persist = (key: string, value: string) => {
    try {
      const trimmed = value.trim();
      if (trimmed) localStorage.setItem(key, trimmed);
      else localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };

  const buildTradeLockerProfileId = useCallback((env: string, server: string, email: string) => {
    return `${String(env || "").trim().toLowerCase()}:${String(server || "").trim().toLowerCase()}:${String(email || "").trim().toLowerCase()}`;
  }, []);

  const buildTradeLockerProfileLabel = useCallback((env: string, server: string, email: string) => {
    const cleanEmail = String(email || "").trim() || "unknown";
    const cleanServer = String(server || "").trim() || "server";
    const cleanEnv = env === "live" ? "live" : "demo";
    return `${cleanEmail} @ ${cleanServer} (${cleanEnv})`;
  }, []);

  const upsertTradeLockerProfile = useCallback((opts?: { setActive?: boolean }) => {
    const server = String(tlServer || "").trim();
    const email = String(tlEmail || "").trim();
    const env = tlEnv === "live" ? "live" : "demo";
    if (!server || !email) {
      setTlLastError("Set TradeLocker server + email before saving a login.");
      return false;
    }
    const id = buildTradeLockerProfileId(env, server, email);
    const label = buildTradeLockerProfileLabel(env, server, email);
    const next: TradeLockerProfile[] = [
      ...tlProfiles.filter((profile) => profile.id !== id),
      {
        id,
        label,
        env,
        server,
        email,
        rememberPassword: tlRememberPassword,
        rememberDeveloperKey: tlRememberDeveloperKey
      }
    ].sort((a, b) => a.label.localeCompare(b.label));
    setTlProfiles(next);
    if (opts?.setActive) setTlActiveProfileId(id);
    return true;
  }, [buildTradeLockerProfileId, buildTradeLockerProfileLabel, tlEmail, tlEnv, tlProfiles, tlRememberDeveloperKey, tlRememberPassword, tlServer]);

  const handleTradeLockerProfileSelect = useCallback((profileId: string) => {
    if (!profileId) {
      setTlActiveProfileId("");
      return;
    }
    const profile = tlProfiles.find((entry) => entry.id === profileId);
    if (!profile) return;
    setTlActiveProfileId(profileId);
    setTlEnv(profile.env);
    setTlServer(profile.server);
    setTlEmail(profile.email);
    setTlRememberPassword(profile.rememberPassword !== false);
    setTlRememberDeveloperKey(profile.rememberDeveloperKey === true);
    setTlLastError(null);
  }, [tlProfiles]);

  const handleTradeLockerProfileRemove = useCallback((profileId: string) => {
    if (!profileId) return;
    setTlProfiles((prev) => prev.filter((entry) => entry.id !== profileId));
    if (tlActiveProfileId === profileId) setTlActiveProfileId("");
  }, [tlActiveProfileId]);

  const handleBrokerSelect = useCallback(async (nextId: string) => {
    setBrokerActiveId(nextId);
    if (onRunActionCatalog) {
      try {
        const res = await onRunActionCatalog({ actionId: 'settings.broker.set_active', payload: { brokerId: nextId } });
        if (!res?.ok) {
          setBrokerError(res?.error ? String(res.error) : "Failed to set active broker.");
        } else {
          setBrokerError(null);
        }
      } catch (e: any) {
        setBrokerError(e?.message ? String(e.message) : "Failed to set active broker.");
      } finally {
        void refreshBrokerInfo();
      }
      return;
    }
    const broker = (window as any)?.glass?.broker;
    if (!broker?.setActive) return;
    try {
      const res = await broker.setActive(nextId);
      if (!res?.ok) {
        setBrokerError(res?.error ? String(res.error) : "Failed to set active broker.");
      } else {
        setBrokerError(null);
      }
    } catch (e: any) {
      setBrokerError(e?.message ? String(e.message) : "Failed to set active broker.");
    } finally {
      void refreshBrokerInfo();
    }
  }, [onRunActionCatalog, refreshBrokerInfo]);

  const handleSave = async () => {
    if (onRunActionCatalog) {
      await onRunActionCatalog({ actionId: "settings.model.text.set", payload: { model: textModel } });
      await onRunActionCatalog({ actionId: "settings.model.vision.set", payload: { model: visionModel } });
      await onRunActionCatalog({ actionId: "settings.model.vision_detail.set", payload: { detail: visionDetail } });
      await onRunActionCatalog({ actionId: "settings.model.live.set", payload: { model: liveModel } });
      await onRunActionCatalog({ actionId: "settings.openai.vector_store.set", payload: { ids: vectorStoreIds } });
      await onRunActionCatalog({ actionId: "settings.openai.reasoning_effort.set", payload: { effort: techReasoningEffort } });
      await onRunActionCatalog({
        actionId: "settings.vision_interval.active.set",
        payload: { ms: Number(activeVisionIntervalMs) }
      });
      await onRunActionCatalog({
        actionId: "settings.vision_interval.watched.set",
        payload: { ms: Number(watchedVisionIntervalMs) }
      });
      await onRunActionCatalog({
        actionId: "settings.chart_watch_interval.set",
        payload: { ms: Number(chartWatchIntervalMs) }
      });
      await onRunActionCatalog({
        actionId: "settings.auto_watch_tradingview.set",
        payload: { enabled: autoWatchTradingView }
      });
      await onRunActionCatalog({
        actionId: "settings.chat_context.mode.set",
        payload: { mode: chatTabContextMode }
      });
      await onRunActionCatalog({
        actionId: "settings.chat_context.max_tabs.set",
        payload: { count: Number(chatTabContextMaxTabs) }
      });
      await onRunActionCatalog({
        actionId: "settings.chat_context.change_only.set",
        payload: { enabled: chatTabContextChangeOnly }
      });
      await onRunActionCatalog({
        actionId: "settings.chat_context.roi.set",
        payload: { roi: chatTabContextRoi }
      });
      await onRunActionCatalog({
        actionId: "settings.chat_context.redaction.set",
        payload: { redaction: chatTabContextRedaction }
      });
      persist(STORAGE.actionFlowDebug, actionFlowDebugEnabled ? "1" : "0");

      try {
        localStorage.removeItem(STORAGE.openaiKey);
        localStorage.removeItem(STORAGE.geminiKey);
      } catch {
        // ignore
      }

      if (openaiKey.trim()) {
        const res = await onRunActionCatalog({ actionId: "settings.openai.key.set", payload: { key: openaiKey.trim() } });
        if (!res?.ok) setSecretsError(res?.error ? String(res.error) : "Failed to save OpenAI key.");
        else setOpenaiKey("");
      }
      if (geminiKey.trim()) {
        const res = await onRunActionCatalog({ actionId: "settings.gemini.key.set", payload: { key: geminiKey.trim() } });
        if (!res?.ok) setSecretsError(res?.error ? String(res.error) : "Failed to save Gemini key.");
        else setGeminiKey("");
      }
      await refreshSecretsStatus();
    } else {
      persist(STORAGE.textModel, textModel);
      persist(STORAGE.visionModel, visionModel);
      persist(STORAGE.visionDetail, visionDetail === "auto" ? "" : visionDetail);
      persist(STORAGE.liveModel, liveModel);
      persist(STORAGE.vectorStoreIds, vectorStoreIds);
      persist(STORAGE.techReasoningEffort, techReasoningEffort);
      persist(STORAGE.activeVisionIntervalMs, activeVisionIntervalMs);
      persist(STORAGE.watchedVisionIntervalMs, watchedVisionIntervalMs);
      persist(STORAGE.chartWatchIntervalMs, chartWatchIntervalMs);
      persist(STORAGE.autoWatchTradingView, autoWatchTradingView ? "1" : "0");
      persist(STORAGE.chatTabContextMode, chatTabContextMode);
      persist(STORAGE.chatTabContextMaxTabs, chatTabContextMaxTabs);
      persist(STORAGE.chatTabContextChangeOnly, chatTabContextChangeOnly ? "1" : "0");
      persist(STORAGE.chatTabContextRoi, chatTabContextRoi);
      persist(STORAGE.chatTabContextRedaction, chatTabContextRedaction);
      persist(STORAGE.actionFlowDebug, actionFlowDebugEnabled ? "1" : "0");

      try {
        localStorage.removeItem(STORAGE.openaiKey);
        localStorage.removeItem(STORAGE.geminiKey);
      } catch {
        // ignore
      }

      const secrets = (window as any)?.glass?.secrets;
      if (secrets?.setOpenAIKey && openaiKey.trim()) {
        const res = await secrets.setOpenAIKey({ key: openaiKey.trim() });
        if (!res?.ok) setSecretsError(res?.error ? String(res.error) : "Failed to save OpenAI key.");
        else setOpenaiKey("");
      }
      if (secrets?.setGeminiKey && geminiKey.trim()) {
        const res = await secrets.setGeminiKey({ key: geminiKey.trim() });
        if (!res?.ok) setSecretsError(res?.error ? String(res.error) : "Failed to save Gemini key.");
        else setGeminiKey("");
      }
      await refreshSecretsStatus();
    }

    // Persist TradeLocker non-secret config
    const tl = window.glass?.tradelocker;
    const maxMbNum = Number(tlDebugMaxBytesMb);
    const maxBytes = Number.isFinite(maxMbNum) && maxMbNum > 0 ? Math.floor(maxMbNum * 1024 * 1024) : 2 * 1024 * 1024;
    const maxFilesNum = Number(tlDebugMaxFiles);
    const maxFiles = Number.isFinite(maxFilesNum) && maxFilesNum > 0 ? Math.min(50, Math.floor(maxFilesNum)) : 3;
    const textLimitNum = Number(tlDebugTextLimit);
    const textLimit = Number.isFinite(textLimitNum) && textLimitNum > 0 ? Math.min(50000, Math.floor(textLimitNum)) : 6000;
    const configPatch = {
      env: tlEnv,
      server: tlServer.trim(),
      email: tlEmail.trim(),
      autoConnect: tlAutoConnect,
      streamingEnabled: tlStreamingEnabled,
      streamingUrl: tlStreamingUrl.trim(),
      streamingAutoReconnect: tlStreamingAutoReconnect,
      streamingSubscribe: tlStreamingSubscribe.trim(),
      debug: {
        enabled: tlDebugEnabled,
        maxBytes,
        maxFiles,
        textLimit
      }
    };
    if (onRunActionCatalog) {
      await onRunActionCatalog({ actionId: "tradelocker.config.update", payload: configPatch });
      await onRunActionCatalog({
        actionId: "tradelocker.trading_options.set",
        payload: {
          options: {
            tradingEnabled: tlTradingEnabled,
            autoPilotEnabled: tlAutoPilotEnabled,
            defaultOrderQty: tlDefaultOrderQty,
            defaultOrderType: tlDefaultOrderType
          }
        }
      });
      if (tlStreamingEnabled) {
        await onRunActionCatalog({ actionId: "tradelocker.stream.start", payload: {} });
      } else {
        await onRunActionCatalog({ actionId: "tradelocker.stream.stop", payload: {} });
      }
      if (tlSelectedAccountId && tlSelectedAccNum) {
        await onRunActionCatalog({
          actionId: "tradelocker.set_active_account",
          payload: {
            accountId: Number(tlSelectedAccountId),
            accNum: Number(tlSelectedAccNum)
          }
        });
      }
    } else {
      if (tl?.updateSavedConfig) {
        try {
          await tl.updateSavedConfig(configPatch);
        } catch {
          // ignore
        }
      }
      if (tl?.setTradingOptions) {
        try {
          await tl.setTradingOptions({
            tradingEnabled: tlTradingEnabled,
            autoPilotEnabled: tlAutoPilotEnabled,
            defaultOrderQty: tlDefaultOrderQty,
            defaultOrderType: tlDefaultOrderType
          });
        } catch {
          // ignore
        }
      }
      if (tl?.startStream && tl?.stopStream) {
        try {
          if (tlStreamingEnabled) await tl.startStream();
          else await tl.stopStream();
        } catch {
          // ignore
        }
      }
      if (tl?.setActiveAccount && tlSelectedAccountId && tlSelectedAccNum) {
        try {
          await tl.setActiveAccount({
            accountId: Number(tlSelectedAccountId),
            accNum: Number(tlSelectedAccNum)
          });
        } catch {
          // ignore
        }
      }
    }

    if (onBrokerLinkChange) {
      const normalized = normalizeBrokerLinkConfig(brokerLinkDraft);
      onBrokerLinkChange({
        ...normalized,
        symbolMap: parseSymbolMapText(brokerLinkSymbolMapText)
      });
    }

    onSave?.();
    onClose();
  };

  const handleTradeLockerConnect = async () => {
    const tl = window.glass?.tradelocker;
    setTlConnecting(true);
    setTlLastError(null);
    if (!tl?.connect && !onRunActionCatalog) {
      setTlConnecting(false);
      setTlLastError("TradeLocker bridge is not available. Please fully restart the app (or reinstall the latest build).");
      return;
    }
    try {
      let res: any = null;
      if (onRunActionCatalog) {
        res = await onRunActionCatalog({
          actionId: "tradelocker.connect",
          payload: {
            env: tlEnv,
            server: tlServer.trim(),
            email: tlEmail.trim(),
            password: tlPassword,
            developerApiKey: tlDeveloperKey,
            rememberPassword: tlRememberPassword,
            rememberDeveloperApiKey: tlRememberDeveloperKey
          }
        });
      } else if (tl?.connect) {
        res = await tl.connect({
          env: tlEnv,
          server: tlServer.trim(),
          email: tlEmail.trim(),
          password: tlPassword,
          developerApiKey: tlDeveloperKey,
          rememberPassword: tlRememberPassword,
          rememberDeveloperApiKey: tlRememberDeveloperKey
        });
      }
      if (res && !res.ok) {
        setTlConnected(false);
        setTlLastError(res?.error ? String(res.error) : "Failed to connect");
        return;
      }
      setTlConnected(true);
      setTlPassword("");
      setTlDeveloperKey("");

      const stat = await tl?.getStatus?.();
      if (stat?.ok) setTlLastError(stat.lastError ? String(stat.lastError) : null);

      const cfg = await tl?.getSavedConfig?.();
      if (cfg?.ok) {
        setTlHasSavedPassword(!!cfg.hasSavedPassword);
        setTlHasSavedDeveloperKey(!!cfg.hasSavedDeveloperApiKey);
        setTlEncryptionAvailable(!!cfg.encryptionAvailable);
      }

      const accountsRes = await tl?.getAccounts?.();
      if (accountsRes?.ok && Array.isArray(accountsRes.accounts)) setTlAccounts(accountsRes.accounts);

      upsertTradeLockerProfile({ setActive: true });
    } catch (e: any) {
      setTlConnected(false);
      setTlLastError(e?.message ? String(e.message) : "Failed to connect");
    } finally {
      setTlConnecting(false);
    }
  };

  const handleTradeLockerDisconnect = async () => {
    const tl = window.glass?.tradelocker;
    if (!tl?.disconnect && !onRunActionCatalog) return;
    try {
      if (onRunActionCatalog) {
        await onRunActionCatalog({ actionId: "tradelocker.disconnect", payload: {} });
      } else {
        await tl.disconnect();
      }
    } catch {
      // ignore
    }
    setTlConnected(false);
  };

  const handleTradeLockerRefreshAccounts = async () => {
    const tl = window.glass?.tradelocker;
    if (!tl?.getAccounts && !onRunActionCatalog) return;
    try {
      if (onRunActionCatalog) {
        const actionRes = await onRunActionCatalog({ actionId: "tradelocker.refresh_accounts", payload: {} });
        if (!actionRes?.ok) {
          setTlLastError(actionRes?.error ? String(actionRes.error) : "Failed to fetch accounts");
        }
      }
      const res = await tl?.getAccounts?.();
      if (res?.ok && Array.isArray(res.accounts)) {
        setTlAccounts(res.accounts);
        setTlLastError(null);
      } else if (res && !res.ok) {
        setTlLastError(res?.error ? String(res.error) : "Failed to fetch accounts");
      }
    } catch (err: any) {
      setTlLastError(err?.message ? String(err.message) : "Failed to fetch accounts");
    }
  };

  const handleTradeLockerClearSecrets = async () => {
    const tl = window.glass?.tradelocker;
    if (!tl?.clearSavedSecrets && !onRunActionCatalog) return;
    try {
      let res: any = null;
      if (onRunActionCatalog) {
        res = await onRunActionCatalog({ actionId: "tradelocker.clear_secrets", payload: {} });
      } else if (tl?.clearSavedSecrets) {
        res = await tl.clearSavedSecrets();
      }
      if (res?.ok === false) {
        setTlLastError(res?.error ? String(res.error) : "Failed to clear saved secrets");
        return;
      }
      setTlHasSavedPassword(false);
      setTlHasSavedDeveloperKey(false);
      setTlLastError(null);
    } catch (err: any) {
      setTlLastError(err?.message ? String(err.message) : "Failed to clear saved secrets");
    }
  };

  const handleTradeLockerAccountSelected = async (accountIdText: string) => {
    setTlSelectedAccountId(accountIdText);
    const selected = tlAccounts.find(a => String(a?.id) === String(accountIdText));
    const accNum = selected?.accNum != null ? String(selected.accNum) : "";
    setTlSelectedAccNum(accNum);
    if (!accountIdText || !accNum) return;
    const tl = window.glass?.tradelocker;
    if (!tl?.setActiveAccount && !onRunActionCatalog) return;
    try {
      if (onRunActionCatalog) {
        await onRunActionCatalog({
          actionId: "tradelocker.set_active_account",
          payload: { accountId: Number(accountIdText), accNum: Number(accNum) }
        });
      } else {
        await tl.setActiveAccount({ accountId: Number(accountIdText), accNum: Number(accNum) });
      }
    } catch {
      // ignore
    }
  };

  const textModelIsPreset = OPENAI_TEXT_MODEL_PRESETS.some(p => p.value === textModel);
  const textModelSelectValue = textModelIsPreset ? textModel : "__custom__";

  const visionModelIsPreset = OPENAI_VISION_MODEL_PRESETS.some(p => p.value === visionModel);
  const visionModelSelectValue = visionModelIsPreset ? visionModel : "__custom__";

  const liveModelIsPreset = OPENAI_LIVE_MODEL_PRESETS.some(p => p.value === liveModel);
  const liveModelSelectValue = liveModelIsPreset ? liveModel : "__custom__";

  const perf = performance || {};
  const formatAgo = (ms: any) => {
    const t = Number(ms || 0);
    if (!Number.isFinite(t) || t <= 0) return "--";
    const delta = Date.now() - t;
    if (!Number.isFinite(delta) || delta < 0) return "just now";
    const s = Math.floor(delta / 1000);
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  const ledgerPath = ledgerStats?.path != null ? String(ledgerStats.path) : "";
  const ledgerPending = Number.isFinite(Number(ledgerStats?.pendingWrites)) ? Number(ledgerStats.pendingWrites) : 0;
  const ledgerInFlight = !!ledgerStats?.inFlight;
  const ledgerLastPersistAtMs = ledgerStats?.lastPersistAtMs != null ? Number(ledgerStats.lastPersistAtMs) : 0;
  const ledgerLastDirtyAtMs = ledgerStats?.lastDirtyAtMs != null ? Number(ledgerStats.lastDirtyAtMs) : 0;
  const ledgerPersistDelayMs = ledgerStats?.persistDelayMs != null ? Number(ledgerStats.persistDelayMs) : null;
  const confirmEnable = (label: string) => {
    return window.confirm(`Enable ${label}? This allows live execution from the app.`);
  };

  const handleTradingToggle = (checked: boolean) => {
    if (checked && !tlTradingEnabled) {
      if (!confirmEnable("TradeLocker trading")) return;
    }
    setTlTradingEnabled(checked);
  };

  const handleAutoPilotToggle = (checked: boolean) => {
    if (checked && !tlAutoPilotEnabled) {
      if (!confirmEnable("AutoPilot execution")) return;
    }
    setTlAutoPilotEnabled(checked);
  };

  const liveErrorItems = Array.isArray(liveErrors) ? liveErrors : [];
  const liveErrorCount = liveErrorItems.length;
  const settingsSections: Array<{ key: SettingsSectionKey; label: string }> = [
    { key: "ai", label: "AI + Vision" },
    { key: "signal", label: "Signal + Warmup" },
    { key: "performance", label: "Performance + Debug" },
    { key: "broker", label: "Broker + TradeLocker" },
    { key: "telemetry", label: "Telemetry" }
  ];

  const aiSectionCtx = {
    showOpenai,
    setShowOpenai,
    openaiKey,
    setOpenaiKey,
    openaiKeyStored,
    secretsAvailable,
    readClipboardText,
    onRunActionCatalog,
    refreshSecretsStatus,
    showGemini,
    setShowGemini,
    geminiKey,
    setGeminiKey,
    geminiKeyStored,
    textModelSelectValue,
    setTextModel,
    textModelIsPreset,
    textModel,
    visionModelSelectValue,
    setVisionModel,
    visionModelIsPreset,
    visionModel,
    visionDetail,
    setVisionDetail,
    liveModelSelectValue,
    setLiveModel,
    liveModelIsPreset,
    liveModel,
    vectorStoreIds,
    setVectorStoreIds,
    techReasoningEffort,
    setTechReasoningEffort,
    activeVisionIntervalMs,
    setActiveVisionIntervalMs,
    watchedVisionIntervalMs,
    setWatchedVisionIntervalMs,
    chartWatchIntervalMs,
    setChartWatchIntervalMs,
    autoWatchTradingView,
    setAutoWatchTradingView,
    chatTabContextMode,
    setChatTabContextMode,
    chatTabContextMaxTabs,
    setChatTabContextMaxTabs,
    chatTabContextRoi,
    setChatTabContextRoi,
    chatTabContextRedaction,
    setChatTabContextRedaction,
    chatTabContextChangeOnly,
    setChatTabContextChangeOnly,
    OPENAI_TEXT_MODEL_PRESETS,
    OPENAI_VISION_MODEL_PRESETS,
    OPENAI_VISION_DETAIL_PRESETS,
    OPENAI_LIVE_MODEL_PRESETS,
    OPENAI_TECH_REASONING_PRESETS
  };

  const signalWarmupSectionCtx = {
    onSignalTelegramChange,
    signalTelegramResolved,
    signalTelegramMissing,
    handleSignalTelegramPaste,
    signalTelegramStatuses,
    toggleList,
    parseNumberInput,
    DEFAULT_SIGNAL_TELEGRAM_SETTINGS,
    onSignalSnapshotWarmupChange,
    signalSnapshotWarmupResolved,
    signalSnapshotWarmupTimeoutSec,
    DEFAULT_SIGNAL_SNAPSHOT_WARMUP_SETTINGS,
    secretsError
  };

  const performanceDebugSectionCtx = {
    performance: perf,
    refreshLedgerStats,
    flushLedgerNow,
    ledgerStatsError,
    ledgerPending,
    ledgerInFlight,
    ledgerLastPersistAtMs,
    ledgerLastDirtyAtMs,
    ledgerPersistDelayMs,
    ledgerStats,
    ledgerPath,
    formatAgo,
    writeClipboardText,
    actionFlowDebugEnabled,
    setActionFlowDebugEnabled
  };

  const brokerAdapterSectionCtx = {
    brokerStatusMeta,
    brokerError,
    brokerActiveId,
    activeBroker,
    brokerList,
    handleBrokerSelect,
    brokerCaps,
    refreshBrokerInfo,
    brokerStatus,
    tlStatusMeta,
    electronBridgeAvailable,
    tlBridgeAvailable,
    tlEncryptionAvailable,
    tlLastError,
    tlActiveProfileId,
    handleTradeLockerProfileSelect,
    tlProfiles,
    upsertTradeLockerProfile,
    handleTradeLockerProfileRemove,
    tlEnv,
    setTlEnv,
    tlServer,
    setTlServer,
    tlEmail,
    setTlEmail,
    tlHasSavedPassword,
    tlShowPassword,
    setTlShowPassword,
    tlPassword,
    setTlPassword,
    tlHasSavedDeveloperKey,
    tlShowDeveloperKey,
    setTlShowDeveloperKey,
    tlDeveloperKey,
    setTlDeveloperKey,
    tlRememberPassword,
    setTlRememberPassword,
    tlRememberDeveloperKey,
    setTlRememberDeveloperKey,
    tlAutoConnect,
    setTlAutoConnect,
    tlConnected,
    tlConnecting,
    handleTradeLockerConnect,
    handleTradeLockerDisconnect,
    handleTradeLockerRefreshAccounts,
    handleTradeLockerClearSecrets,
    tlSelectedAccountId,
    handleTradeLockerAccountSelected,
    tlAccounts,
    tlSelectedAccNum,
    tlDefaultOrderQty,
    setTlDefaultOrderQty,
    tlDefaultOrderType,
    setTlDefaultOrderType,
    tlTradingEnabled,
    handleTradingToggle,
    tlAutoPilotEnabled,
    handleAutoPilotToggle,
    tlStreamingEnabled,
    setTlStreamingEnabled,
    tlStreamingUrl,
    setTlStreamingUrl,
    tlStreamingAutoReconnect,
    setTlStreamingAutoReconnect,
    tlStreamingSubscribe,
    setTlStreamingSubscribe,
    tlDebugEnabled,
    setTlDebugEnabled,
    tlDebugMaxBytesMb,
    setTlDebugMaxBytesMb,
    tlDebugMaxFiles,
    setTlDebugMaxFiles,
    tlDebugTextLimit,
    setTlDebugTextLimit,
    brokerLinkDraft,
    setBrokerLinkDraft,
    brokerLinkSymbolMapText,
    setBrokerLinkSymbolMapText,
    parseNumberInput
  };

  const telemetrySectionCtx = {
    setShowLiveErrorLog,
    liveErrors,
    setShowDiagnosticsConsole,
    setShowTechAgentConsole,
    healthSnapshot
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="min-h-full w-full flex items-start justify-center px-4 py-8">
      <div
        className="w-[520px] max-w-full bg-[#121212] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scaleIn text-gray-200"
        style={{ maxHeight: "calc(100vh - 64px)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2 text-gray-100">
            <KeyRound size={16} />
            <span className="font-semibold text-sm">Settings</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-5 overflow-y-auto custom-scrollbar" style={{ overscrollBehavior: "contain" as any }}>
          <div className="flex flex-wrap gap-2 border-b border-white/5 pb-3">
            {settingsSections.map((section) => {
              const active = activeSection === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                    active
                      ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {section.label}
                </button>
              );
            })}
          </div>

          {activeSection === "ai" && (
            <React.Suspense fallback={<div className="text-[11px] text-gray-500">Loading AI settings...</div>}>
              <AiKeysSection ctx={aiSectionCtx} />
            </React.Suspense>
          )}

          {activeSection === "signal" && (
            <React.Suspense fallback={<div className="text-[11px] text-gray-500">Loading signal settings...</div>}>
              <SignalAndWarmupSection ctx={signalWarmupSectionCtx} />
            </React.Suspense>
          )}

          {activeSection === "performance" && (
            <React.Suspense fallback={<div className="text-[11px] text-gray-500">Loading performance settings...</div>}>
              <PerformanceAndDebugSection ctx={performanceDebugSectionCtx} />
            </React.Suspense>
          )}

          {activeSection === "broker" && (
            <React.Suspense fallback={<div className="text-[11px] text-gray-500">Loading broker settings...</div>}>
              <BrokerAdapterSection ctx={brokerAdapterSectionCtx} />
            </React.Suspense>
          )}

          {activeSection === "telemetry" && (
            <React.Suspense fallback={<div className="text-[11px] text-gray-500">Loading telemetry...</div>}>
              <TelemetrySection ctx={telemetrySectionCtx} />
            </React.Suspense>
          )}
        </div>

        <div className="p-4 border-t border-white/5 bg-white/5 flex justify-end gap-2"> 
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-900/20 transition-all"
          >
            Save
          </button>
        </div>
      </div>
      </div>
      {showLiveErrorLog && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-6">
          <div className="w-[720px] max-w-full bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
              <div className="text-sm font-semibold text-gray-100">Live Error Log</div>
              <div className="text-[11px] text-gray-500 font-mono">{liveErrorCount} entries</div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2">
              {liveErrorItems.length === 0 ? (
                <div className="text-[11px] text-gray-500">No errors captured yet.</div>
              ) : (
                liveErrorItems.slice().reverse().map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                      <div className="font-mono">
                        {entry.level || "error"} | {entry.source || "app"}
                        {entry.count && entry.count > 1 ? `  x${entry.count}` : ""}
                      </div>
                      <div>{new Date(entry.ts).toLocaleTimeString()}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-200 font-mono break-words">
                      {entry.message}
                    </div>
                    {entry.stack ? (
                      <div className="mt-2 text-[10px] text-gray-500 font-mono whitespace-pre-wrap">
                        {entry.stack}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-white/5 bg-white/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] text-gray-500">Streaming runtime errors in real time.</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = liveErrorItems
                      .map((e) => {
                        const at = new Date(e.ts).toISOString();
                        const count = e.count && e.count > 1 ? ` x${e.count}` : "";
                        return `[${at}] ${e.level || "error"} ${e.source || "app"}${count}: ${e.message}${e.stack ? `\n${e.stack}` : ""}`;
                      })
                      .join("\n\n");
                    void writeClipboardText(text || "");
                  }}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => downloadLiveErrors()}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => onClearLiveErrors?.()}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setShowLiveErrorLog(false)}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showDiagnosticsConsole && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-6">
          <div className="w-[980px] max-w-full max-h-[90vh] bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
              <div>
                <div className="text-sm font-semibold text-gray-100">Diagnostics Console</div>
                <div className="text-[10px] text-gray-500">
                  {diagnosticsUpdatedAtMs ? `Updated ${formatAgeShort(diagnosticsUpdatedAtMs)} ago` : "Not loaded yet"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshDiagnostics()}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                >
                  {diagnosticsLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDiagnosticsExport("download")}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => handleDiagnosticsExport("clipboard")}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                >
                  Copy Bundle
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiagnosticsConsole(false)}
                  className="px-2 py-1 rounded-md text-[10px] font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            {diagnosticsStatus ? (
              <div className="px-4 py-2 text-[10px] text-yellow-300/90 bg-yellow-500/10 border-b border-yellow-400/20">
                {diagnosticsStatus}
              </div>
            ) : null}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">App Meta</div>
                    <div className="text-[11px] text-gray-300">Name: {diagnosticsMeta?.name || "--"}</div>
                    <div className="text-[11px] text-gray-300">Version: {diagnosticsMeta?.version || "--"}</div>
                    <div className="text-[11px] text-gray-300">
                      Latest Release: {diagnosticsReleases?.[0]?.version || diagnosticsReleases?.[0]?.name || "--"}
                    </div>
                    <div className="text-[11px] text-gray-300">Update: {updateStatus || "--"}</div>
                    <div className="text-[11px] text-gray-300">Packaged: {diagnosticsMeta?.isPackaged ? "yes" : "no"}</div>
                    <div className="text-[11px] text-gray-500 font-mono truncate" title={diagnosticsMeta?.userDataPath || ""}>
                      Data: {diagnosticsMeta?.userDataPath || "--"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Migration: {diagnosticsMeta?.migrationAttempted ? (diagnosticsMeta?.migrationApplied ? "applied" : "checked") : "not checked"}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono truncate" title={diagnosticsMeta?.migrationSource || ""}>
                      Migration Source: {diagnosticsMeta?.migrationSource || "--"}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono truncate" title={diagnosticsMeta?.migrationReason || ""}>
                      Migration Reason: {diagnosticsMeta?.migrationReason || "--"}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Health Snapshot</div>
                    <div className="text-[11px] text-gray-300">
                      Startup: {formatAgeShort(healthSnapshot?.startupCheckedAtMs)}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Startup phase: {healthSnapshot?.startupPhase || "--"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Bridge: {healthSnapshot?.startupBridgeState || "--"}{healthSnapshot?.startupBridgeError ? ` (${healthSnapshot.startupBridgeError})` : ""}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      OpenAI readiness: {healthSnapshot?.startupOpenaiState || "--"} {healthSnapshot?.startupOpenaiProbeSource ? `(${healthSnapshot.startupOpenaiProbeSource})` : ""}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      TradeLocker readiness: {healthSnapshot?.startupTradeLockerState || "--"} {healthSnapshot?.startupTradeLockerProbeSource ? `(${healthSnapshot.startupTradeLockerProbeSource})` : ""}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Probe skipped due to bridge: {healthSnapshot?.startupProbeSkippedDueToBridge ? "yes" : "no"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Setup check reason: {healthSnapshot?.startupBridgeState === 'failed'
                        ? `bridge_failed: ${healthSnapshot?.startupBridgeError || 'Renderer bridge unavailable.'}`
                        : (healthSnapshot?.startupProbeErrors?.secrets || healthSnapshot?.startupProbeErrors?.tradelocker || healthSnapshot?.startupProbeErrors?.broker || healthSnapshot?.startupProbeErrors?.tradeLedger)
                        ? (healthSnapshot?.startupProbeErrors?.secrets || healthSnapshot?.startupProbeErrors?.tradelocker || healthSnapshot?.startupProbeErrors?.broker || healthSnapshot?.startupProbeErrors?.tradeLedger)
                        : (healthSnapshot?.startupOpenaiState === 'missing' || healthSnapshot?.startupTradeLockerState === 'missing')
                          ? `missing ${[
                            healthSnapshot?.startupOpenaiState === 'missing' ? 'OpenAI' : null,
                            healthSnapshot?.startupTradeLockerState === 'missing' ? 'TradeLocker' : null
                          ].filter(Boolean).join(', ')}`
                          : "not shown"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      TradeLocker auto-restore: {healthSnapshot?.startupTradeLockerAutoRestoreAttempted ? (healthSnapshot?.startupTradeLockerAutoRestoreSuccess ? "success" : "failed") : "not attempted"}
                      {healthSnapshot?.startupTradeLockerAutoRestoreAtMs ? ` @ ${new Date(healthSnapshot.startupTradeLockerAutoRestoreAtMs).toLocaleTimeString()}` : ""}
                    </div>
                    {healthSnapshot?.startupTradeLockerAutoRestoreError ? (
                      <div className="text-[11px] text-amber-300 break-words">
                        Auto-restore error: {healthSnapshot.startupTradeLockerAutoRestoreError}
                      </div>
                    ) : null}
                    <div className="text-[11px] text-gray-300">
                      Startup scopes: {Array.isArray(healthSnapshot?.startupActiveScopes) ? healthSnapshot.startupActiveScopes.length : "--"}
                      {Array.isArray(healthSnapshot?.startupBlockedScopes) && healthSnapshot.startupBlockedScopes.length > 0
                        ? ` | blocked: ${healthSnapshot.startupBlockedScopes.join(", ")}`
                        : ""}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Startup requested: {Array.isArray(healthSnapshot?.startupRequestedScopes) && healthSnapshot.startupRequestedScopes.length > 0
                        ? healthSnapshot.startupRequestedScopes.join(", ")
                        : "--"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Startup skipped: {Array.isArray(healthSnapshot?.startupSkippedScopes) && healthSnapshot.startupSkippedScopes.length > 0
                        ? healthSnapshot.startupSkippedScopes.join(", ")
                        : "--"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Startup unknown scopes: {Array.isArray(healthSnapshot?.startupUnknownScopes) && healthSnapshot.startupUnknownScopes.length > 0
                        ? healthSnapshot.startupUnknownScopes.join(", ")
                        : "--"}
                    </div>
                    {(healthSnapshot?.startupPermissionError || healthSnapshot?.startupDiagnosticWarning) ? (
                      <div className="text-[11px] text-amber-300 break-words">
                        {healthSnapshot?.startupPermissionError || healthSnapshot?.startupDiagnosticWarning}
                      </div>
                    ) : null}
                    <div className="text-[11px] text-gray-300">Broker: {healthSnapshot?.brokerStatus || "--"}</div>
                    <div className="text-[11px] text-gray-300">
                      Stream: {healthSnapshot?.brokerStreamStatus || "--"} | {formatAgeShort(healthSnapshot?.brokerStreamUpdatedAtMs)}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Quotes: {formatAgeShort(healthSnapshot?.brokerQuotesUpdatedAtMs)} | Snapshot: {formatAgeShort(healthSnapshot?.brokerSnapshotUpdatedAtMs)}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Chart: {healthSnapshot?.nativeChartSymbol || "--"} | {formatAgeShort(healthSnapshot?.nativeChartUpdatedAtMs)}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Watchers: {healthSnapshot?.setupWatcherEnabledCount ?? "--"} / {healthSnapshot?.setupWatcherCount ?? "--"}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Rate Limit</div>
                    <div className="text-[11px] text-gray-300">
                      Last: {formatTimestamp(healthSnapshot?.brokerRateLimitLastAtMs)}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Suppress Until: {formatTimestamp(healthSnapshot?.brokerRateLimitSuppressUntilMs)}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono break-words">
                      {healthSnapshot?.brokerRateLimitLastMessage || "--"}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Queue / Perf</div>
                    <div className="text-[11px] text-gray-300">
                      Queue: {healthSnapshot?.tradelockerRequestQueueDepth ?? "--"} (max {healthSnapshot?.tradelockerRequestQueueMaxDepth ?? "--"})
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Max wait: {healthSnapshot?.tradelockerRequestQueueMaxWaitMs ?? "--"} ms | In flight: {healthSnapshot?.tradelockerRequestInFlight ?? "--"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Broker req/res: {healthPerf?.brokerRequests ?? "--"} / {healthPerf?.brokerResponses ?? "--"} | Timeouts: {healthPerf?.brokerTimeouts ?? "--"}
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Rate limits: {healthPerf?.brokerRateLimits ?? "--"} | Audit: {healthPerf?.auditEvents ?? "--"}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">Audit Tail</div>
                      <button
                        type="button"
                        onClick={() => refreshDiagnosticsAudit()}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                      >
                        Refresh
                      </button>
                    </div>
                    {diagnosticsAuditError ? (
                      <div className="text-[10px] text-red-400/90">{diagnosticsAuditError}</div>
                    ) : (
                      <div className="max-h-[180px] overflow-y-auto custom-scrollbar space-y-1">
                        {(diagnosticsAuditEntries || []).slice(0, 60).map((entry: any) => (
                          <div key={entry?.id || entry?.createdAtMs || Math.random()} className="text-[10px] text-gray-300 font-mono">
                            <span className="text-gray-500">{new Date(entry?.createdAtMs || 0).toLocaleTimeString()}</span>{" "}
                            {entry?.eventType || "event"} {entry?.symbol ? `(${entry.symbol})` : ""} {entry?.level ? `[${entry.level}]` : ""}
                          </div>
                        ))}
                        {diagnosticsAuditEntries.length === 0 && (
                          <div className="text-[10px] text-gray-500">No audit entries.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">Main Log</div>
                      <button
                        type="button"
                        onClick={() => void writeClipboardText(diagnosticsMainLog || "")}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="max-h-[180px] overflow-y-auto custom-scrollbar text-[10px] text-gray-300 font-mono whitespace-pre-wrap">
                      {diagnosticsMainLog || "Main log empty or unavailable."}
                    </pre>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">Release Artifacts</div>
                      <button
                        type="button"
                        onClick={() => refreshReleaseHashes()}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-gray-100 transition-colors"
                      >
                        Verify
                      </button>
                    </div>
                    {diagnosticsReleases.length === 0 ? (
                      <div className="text-[10px] text-gray-500">No release artifacts found.</div>
                    ) : (
                      <div className="max-h-[160px] overflow-y-auto custom-scrollbar space-y-2">
                        {diagnosticsReleases.map((release: any) => {
                          const files = Array.isArray(release?.files) ? release.files : [];
                          const label = release?.version
                            ? `${release?.name || "release"} (${release.version})`
                            : release?.name || "release";
                          return (
                            <div key={release?.name || release?.path || Math.random()} className="text-[10px] text-gray-300">
                              <div className="font-mono">{label}</div>
                              <div className="text-gray-500">
                                {files.length} file(s) | {formatTimestamp(release?.updatedAtMs)}
                              </div>
                              {files.slice(0, 4).map((file: any) => (
                                <div key={`${release?.name}-${file?.name}`} className="text-gray-500 font-mono truncate">
                                  {file?.name} {file?.size ? `(${Math.round(file.size / 1024)}kb)` : ""} {file?.sha256 ? `| ${String(file.sha256).slice(0, 12)}` : ""}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <TechAgentConsole
        isOpen={showTechAgentConsole}
        onClose={() => setShowTechAgentConsole(false)}
        onExecuteAgentTool={onExecuteAgentTool}
      />
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-scaleIn { animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default SettingsModal;

