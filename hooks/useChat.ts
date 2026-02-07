import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Message,
  Agent,
  TradeProposal,
  AutoPilotConfig,
  AutoPilotMode,
  AutoPilotExecutionMode,
  BrokerAction,
  Memory,
  AgentToolAction,
  AgentToolResult,
  ActionFlowRecommendation
} from '../types';
import { DEFAULT_MODE_POLICIES, normalizeAutoPilotMode, normalizeModePolicies, resolveAutoPilotPolicy } from '../services/autoPilotPolicy';
import { sendMessageToOpenAI, sendPlainTextToOpenAI, generateImageWithOpenAI } from '../services/openaiService';
import { connectToOpenAILive } from '../services/openaiLiveService';
import { decodeAudio, decodeAudioData, encodeAudio, synthesizeSpeech } from '../services/geminiService';
import { getTradingViewContext } from '../services/tradingView';
import { hashStringSampled } from '../services/stringHash';
import { formatMistakeTagsForPrompt, normalizeMistakeTags } from '../services/reviewTaxonomy';
import { appendNoteToStorage, buildPostTradeReviewNote } from '../services/notesStorage';
import { DEFAULT_AGENT_CAPABILITIES, normalizeAgentCapabilities } from '../services/agentCapabilities';
import type { WorkflowIntent } from '../services/chatWorkflowIntent';

const AGENT_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-green-600',
  'bg-orange-600',
  'bg-pink-600',
  'bg-teal-600',
  'bg-cyan-600',
  'bg-rose-600'
];

const MEMORY_STORAGE_KEY = 'glass_trade_memories_v1';
const AUTOPILOT_STORAGE_KEY = 'glass_autopilot_config_v1';
const AGENTS_STORAGE_KEY = 'glass_agents_v1';
const MAX_MEMORIES_IN_STATE = 200;
const MAX_MEMORIES_IN_PROMPT = 30;
const MAX_MESSAGES_IN_STATE = 300;
const MAX_DATAURL_IMAGES_IN_STATE = 12;

type ChatWorkflowIntentModule = typeof import('../services/chatWorkflowIntent');
type ChatPromptBuildersModule = typeof import('../services/chatPromptBuilders');
type ChatToolCallRouterModule = typeof import('../services/chatToolCallRouter');

let chatWorkflowIntentModulePromise: Promise<ChatWorkflowIntentModule> | null = null;
const loadChatWorkflowIntentModule = () => {
  if (!chatWorkflowIntentModulePromise) chatWorkflowIntentModulePromise = import('../services/chatWorkflowIntent');
  return chatWorkflowIntentModulePromise;
};

let chatPromptBuildersModulePromise: Promise<ChatPromptBuildersModule> | null = null;
const loadChatPromptBuildersModule = () => {
  if (!chatPromptBuildersModulePromise) chatPromptBuildersModulePromise = import('../services/chatPromptBuilders');
  return chatPromptBuildersModulePromise;
};

let chatToolCallRouterModulePromise: Promise<ChatToolCallRouterModule> | null = null;
const loadChatToolCallRouterModule = () => {
  if (!chatToolCallRouterModulePromise) chatToolCallRouterModulePromise = import('../services/chatToolCallRouter');
  return chatToolCallRouterModulePromise;
};

const createCorrelationId = (seed?: number) =>
  `corr_${Number.isFinite(Number(seed)) ? Number(seed) : Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'The Technician',
    color: 'bg-blue-600',
    type: 'openai',
    profile: 'trading',
    systemInstruction: 'You are a Price Action specialist. You analyze charts for market structure, liquidity sweeps, and FVG entries. You ignore news. You are precise and technical.',
    voice: 'Puck',
    capabilities: { ...DEFAULT_AGENT_CAPABILITIES }
  },
  {
    id: 'agent-2',
    name: 'The Macro',
    color: 'bg-purple-600',
    type: 'openai',
    profile: 'trading',
    systemInstruction: 'You are a Global Macro Strategist. You monitor economic calendars (CPI, NFP), interest rates, and geopolitics. You warn about high-impact news events.',
    voice: 'Kore',
    capabilities: { ...DEFAULT_AGENT_CAPABILITIES }
  },
  {
    id: 'agent-3',
    name: 'Risk Manager',
    color: 'bg-orange-600',
    type: 'openai',
    profile: 'trading',
    systemInstruction: 'You are a strict Risk Manager. You verify stop losses, calculate lot sizes based on 1% risk, and prevent over-leveraging. You are the brakes of the operation.',
    voice: 'Fenrir',
    capabilities: { ...DEFAULT_AGENT_CAPABILITIES }
  },
  {
    id: 'agent-4',
    name: 'Tech Agent',
    color: 'bg-teal-600',
    type: 'openai',
    profile: 'tech',
    systemInstruction: 'You are a live technical agent for GlassBrowser AI. You answer questions about the app codebase, architecture, and data flows. Stay grounded in code by using file_search and the codebase tools (codebase_search, codebase_read_file, codebase_trace_dataflow, codebase_list_files). Use web_search for external docs. If you are unsure, ask a clarifying question. When asked, you can also propose or execute trades using broker tools while following the non-negotiable rules.',
    voice: 'Kore',
    capabilities: { ...DEFAULT_AGENT_CAPABILITIES }
  }
];

const enforceTradingCapabilities = (agent: Agent, fallback?: Agent): Agent => {
  const caps = normalizeAgentCapabilities(agent.capabilities || fallback?.capabilities);
  if (!caps.trade || !caps.broker || !caps.autoExecute || !caps.tools) {
    return { ...agent, capabilities: { ...DEFAULT_AGENT_CAPABILITIES } };
  }
  return { ...agent, capabilities: caps };
};

const normalizeAgent = (raw: any, fallback?: Agent): Agent => {
  const base = fallback || DEFAULT_AGENTS[0];
  const agent = raw && typeof raw === 'object' ? { ...raw } : {};
  const normalized: Agent = {
    id: String(agent.id || base.id),
    name: String(agent.name || base.name),
    color: String(agent.color || base.color),
    type: agent.type === 'gemini' ? 'gemini' : 'openai',
    profile: agent.profile != null ? String(agent.profile) : base.profile,
    systemInstruction: agent.systemInstruction != null ? String(agent.systemInstruction) : base.systemInstruction,
    voice: agent.voice != null ? String(agent.voice) : base.voice,
    capabilities: normalizeAgentCapabilities(agent.capabilities || base.capabilities)
  };
  return enforceTradingCapabilities(normalized, base);
};

const loadAgents = (): Agent[] => {
  try {
    const raw = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (!raw) return DEFAULT_AGENTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_AGENTS;
    const normalized = parsed.map((agent, idx) => normalizeAgent(agent, DEFAULT_AGENTS[idx]));
    const hasTechAgent = normalized.some((agent) => {
      const profile = String(agent.profile || '').trim().toLowerCase();
      if (profile === 'tech') return true;
      return String(agent.name || '').toLowerCase().includes('tech');
    });
    if (!hasTechAgent) {
      const techDefault = DEFAULT_AGENTS.find((agent) => agent.profile === 'tech');
      if (techDefault) normalized.push(techDefault);
    }
    return normalized.length > 0 ? normalized : DEFAULT_AGENTS;
  } catch {
    return DEFAULT_AGENTS;
  }
};

const buildDefaultAutoPilotConfig = (): AutoPilotConfig => ({
  enabled: false,
  killSwitch: false,
  maxDailyLoss: 2000,
  riskPerTrade: 0.5,
  mode: 'custom',
  executionMode: 'live',
  decisionMode: 'deterministic',
  decisionAgentId: '',
  decisionReasoningEffort: 'medium',
  maxAgentCommandsPerMinute: 6,
  modePolicies: normalizeModePolicies(null, DEFAULT_MODE_POLICIES),
  spreadLimitModel: 'percent',
  spreadLimitPct: 0.2,
  spreadLimitAtrMult: 0.3,
  stopModel: 'percent',
  stopPercent: 0.2,
  stopAtrMult: 1,
  defaultRR: 2,
  lotSize: 0.01,
  maxOpenPositions: 3,
  perSymbolMaxPositions: 0,
  perSymbolMaxLot: 0,
  symbolCapsRaw: '',
  maxConsecutiveLosses: 0,
  symbolGroupMapRaw: '',
  groupCapsRaw: '',
  driftActionWarn: 'paper',
  driftActionPoor: 'suggest',
  driftActionCooldownHours: 6,
  driftAutoRetest: true,
  driftRetestCooldownHours: 12,
  driftRetestRangeDays: 90,
  driftRetestMaxCombos: 1,
  requireConfirmation: true,
  telegram: {
    botToken: '',
    chatId: '',
    connected: false
  }
});

const normalizeAutoPilotConfig = (raw: any, defaults: AutoPilotConfig): AutoPilotConfig => {
  if (!raw || typeof raw !== 'object') return defaults;
  const numOr = (value: any, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const boolOr = (value: any, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  const textOr = (value: any, fallback: string) => (typeof value === 'string' ? value : fallback);
  const normalizeDriftAction = (value: any, fallback: AutoPilotConfig['driftActionWarn'] = 'none') => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw.includes('paper')) return 'paper';
    if (raw.includes('suggest')) return 'suggest';
    if (raw.includes('disable') || raw.includes('off')) return 'disable';
    if (raw.includes('none') || raw.includes('no')) return 'none';
    return fallback;
  };
  const normalizeExecutionMode = (value: any, fallback: AutoPilotExecutionMode = 'live') => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw.includes('shadow')) return 'shadow';
    if (raw.includes('paper') || raw.includes('sim')) return 'paper';
    if (raw.includes('live')) return 'live';
    return fallback;
  };
  const normalizeDecisionMode = (value: any, fallback: AutoPilotConfig['decisionMode'] = 'deterministic') => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw.includes('agent')) return 'agent';
    if (raw.includes('deterministic') || raw.includes('rule')) return 'deterministic';
    return fallback;
  };
  const normalizeReasoningEffort = (value: any, fallback: AutoPilotConfig['decisionReasoningEffort'] = 'medium') => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === 'none' || raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'xhigh') return raw;
    return fallback;
  };
  const telegramRaw = raw.telegram && typeof raw.telegram === 'object' ? raw.telegram : {};
  const mode = normalizeAutoPilotMode(raw.mode, defaults.mode ?? 'custom');
  const modePolicies = normalizeModePolicies(raw.modePolicies, DEFAULT_MODE_POLICIES);
  let spreadLimitModel = String(raw.spreadLimitModel ?? defaults.spreadLimitModel ?? 'none').toLowerCase();
  if (!['none', 'percent', 'atr'].includes(spreadLimitModel)) {
    spreadLimitModel = defaults.spreadLimitModel || 'none';
  }
  let stopModel = String(raw.stopModel ?? defaults.stopModel ?? 'percent').toLowerCase();
  if (!['percent', 'atr'].includes(stopModel)) {
    stopModel = defaults.stopModel || 'percent';
  }
  return {
    ...defaults,
    ...raw,
    mode,
    modePolicies,
    executionMode: normalizeExecutionMode(raw.executionMode, defaults.executionMode ?? 'live'),
    decisionMode: normalizeDecisionMode(raw.decisionMode, defaults.decisionMode ?? 'deterministic'),
    decisionAgentId: textOr(raw.decisionAgentId, defaults.decisionAgentId || ''),
    decisionReasoningEffort: normalizeReasoningEffort(raw.decisionReasoningEffort, defaults.decisionReasoningEffort ?? 'medium'),
    maxAgentCommandsPerMinute: numOr(raw.maxAgentCommandsPerMinute, defaults.maxAgentCommandsPerMinute ?? 0),
    enabled: boolOr(raw.enabled, defaults.enabled),
    killSwitch: boolOr(raw.killSwitch, defaults.killSwitch || false),
    maxDailyLoss: numOr(raw.maxDailyLoss, defaults.maxDailyLoss),
    riskPerTrade: numOr(raw.riskPerTrade, defaults.riskPerTrade),
    spreadLimitModel,
    spreadLimitPct: numOr(raw.spreadLimitPct, defaults.spreadLimitPct ?? 0),
    spreadLimitAtrMult: numOr(raw.spreadLimitAtrMult, defaults.spreadLimitAtrMult ?? 0),
    stopModel,
    stopPercent: numOr(raw.stopPercent, defaults.stopPercent ?? 0),
    stopAtrMult: numOr(raw.stopAtrMult, defaults.stopAtrMult ?? 0),
    defaultRR: numOr(raw.defaultRR, defaults.defaultRR ?? 0),
    lotSize: numOr(raw.lotSize, defaults.lotSize),
    maxOpenPositions: numOr(raw.maxOpenPositions, defaults.maxOpenPositions),
    perSymbolMaxPositions: numOr(raw.perSymbolMaxPositions, defaults.perSymbolMaxPositions ?? 0),
    perSymbolMaxLot: numOr(raw.perSymbolMaxLot, defaults.perSymbolMaxLot ?? 0),
    symbolCapsRaw: textOr(raw.symbolCapsRaw, defaults.symbolCapsRaw || ''),
    maxConsecutiveLosses: numOr(raw.maxConsecutiveLosses, defaults.maxConsecutiveLosses ?? 0),
    symbolGroupMapRaw: textOr(raw.symbolGroupMapRaw, defaults.symbolGroupMapRaw || ''),
    groupCapsRaw: textOr(raw.groupCapsRaw, defaults.groupCapsRaw || ''),
    driftActionWarn: normalizeDriftAction(raw.driftActionWarn, defaults.driftActionWarn || 'none'),
    driftActionPoor: normalizeDriftAction(raw.driftActionPoor, defaults.driftActionPoor || 'none'),
    driftActionCooldownHours: numOr(raw.driftActionCooldownHours, defaults.driftActionCooldownHours ?? 0),
    driftAutoRetest: boolOr(raw.driftAutoRetest, defaults.driftAutoRetest ?? false),
    driftRetestCooldownHours: numOr(raw.driftRetestCooldownHours, defaults.driftRetestCooldownHours ?? 0),
    driftRetestRangeDays: numOr(raw.driftRetestRangeDays, defaults.driftRetestRangeDays ?? 0),
    driftRetestMaxCombos: numOr(raw.driftRetestMaxCombos, defaults.driftRetestMaxCombos ?? 0),
    requireConfirmation: boolOr(raw.requireConfirmation, defaults.requireConfirmation),
    telegram: {
      botToken: textOr(telegramRaw.botToken, defaults.telegram.botToken),
      chatId: textOr(telegramRaw.chatId, defaults.telegram.chatId),
      connected: boolOr(telegramRaw.connected, defaults.telegram.connected)
    }
  };
};

const loadAutoPilotConfig = (): AutoPilotConfig => {
  const defaults = buildDefaultAutoPilotConfig();
  try {
    const raw = localStorage.getItem(AUTOPILOT_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return normalizeAutoPilotConfig(parsed, defaults);
  } catch {
    return defaults;
  }
};

type ReplyMode = 'single' | 'team';

type ChartWatchMode = 'signals' | 'digest' | 'live';

type TradeExecutionSource = 'manual' | 'autopilot';
type TradeExecutionResult =
  | { ok: true; broker: 'tradelocker' | 'sim' | 'shadow' | 'mt5' }
  | { ok: false; error: string; broker?: 'tradelocker' | 'sim' | 'shadow' | 'mt5' };

type ExecuteTradeHandler = (proposal: TradeProposal, source: TradeExecutionSource) => Promise<TradeExecutionResult> | TradeExecutionResult;
type BrokerActionResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string; code?: string };
type ExecuteBrokerActionHandler = (action: BrokerAction) => Promise<BrokerActionResult> | BrokerActionResult;
type AgentToolProgressUpdate = Pick<AgentToolAction, 'progressPct' | 'progressDone' | 'progressTotal' | 'progressLabel'>;
type ExecuteAgentToolHandler = (
  action: AgentToolAction,
  onProgress?: (update: AgentToolProgressUpdate) => void
) => Promise<AgentToolResult> | AgentToolResult;
type CancelAgentToolHandler = (messageId: string, action: AgentToolAction) => void;

type AgentRequestEvent = {
  phase: 'build' | 'send' | 'response' | 'error';
  correlationId: string;
  meta?: Record<string, any>;
  error?: string;
};

type UseChatOptions = {
  getExternalContext?: () => string;
  systemContextPrefix?: string;
  disableChartWatch?: boolean;
  onExecuteBrokerAction?: ExecuteBrokerActionHandler;
  onExecuteAgentTool?: ExecuteAgentToolHandler;
  onCancelAgentTool?: CancelAgentToolHandler;
  onAgentRequest?: (event: AgentRequestEvent) => void;
  defaultActionSource?: string;
  resolveActionFlowIntent?: (text: string) => ActionFlowRecommendation | null;
};

const detectElectron = () => {
  try {
    return Boolean((window as any).glass?.isElectron) || navigator.userAgent.toLowerCase().includes('electron');
  } catch {
    return false;
  }
};

const isDataUrl = (value: any) => typeof value === 'string' && value.startsWith('data:');

const filePathToFileUrl = (filePath: string) => {
  const raw = String(filePath || '').trim();
  if (!raw) return '';

  // Already a URL scheme (file:, http:, https:, blob:, data:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw;

  // UNC paths: \\server\share\file.png
  if (/^\\\\/.test(raw)) {
    const unc = raw.replace(/^\\\\/, '').replace(/\\/g, '/');
    return `file:////${encodeURI(unc)}`;
  }

  const normalized = raw.replace(/\\/g, '/');

  // Windows drive paths: C:\path\file.jpg -> file:///C:/path/file.jpg
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }

  // Posix-ish absolute paths: /home/me/file.png
  if (normalized.startsWith('/')) {
    return `file://${encodeURI(normalized)}`;
  }

  return `file:///${encodeURI(normalized)}`;
};

const persistImageDataUrlForChat = async (args: { dataUrl: string; subdir: string; prefix: string }) => {
  const raw = String(args?.dataUrl || '').trim();
  if (!raw) return { ok: false as const, src: '', path: '' };
  if (!isDataUrl(raw)) return { ok: true as const, src: raw, path: '' };

  const saver = (window as any)?.glass?.saveUserFile;
  if (typeof saver !== 'function') return { ok: false as const, src: raw, path: '' };

  const res = await saver({ dataUrl: raw, subdir: args.subdir, prefix: args.prefix });
  if (res?.ok && res.path) {
    return { ok: true as const, src: filePathToFileUrl(String(res.path)), path: String(res.path) };
  }
  return { ok: false as const, src: raw, path: '' };
};

const CHART_WATCH_MODE_KEY = 'glass_chat_chart_watch_mode';
const CHART_WATCH_SNOOZE_UNTIL_KEY = 'glass_chat_chart_watch_snooze_until_ms';
const CHART_WATCH_LEAD_AGENT_KEY = 'glass_chat_chart_watch_lead_agent_id';
const CHART_WATCH_DIGEST_MESSAGE_ID = 'chartwatch_digest';
const POST_TRADE_REVIEW_ENABLED_KEY = 'glass_post_trade_review_enabled';
const POST_TRADE_REVIEW_AGENT_KEY = 'glass_post_trade_review_agent_id';

const normalizeMemory = (raw: any): Memory | null => {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : String(raw.text ?? '').trim();
  if (!text) return null;
  const type = String(raw.type || '').toUpperCase() === 'LOSS' ? 'LOSS' : 'WIN';
  const createdAtMs = Number.isFinite(Number(raw.createdAtMs))
    ? Number(raw.createdAtMs)
    : Number.isFinite(Number(raw.timestamp))
      ? Number(raw.timestamp)
      : typeof raw.timestamp === 'string'
        ? (Number.isFinite(Date.parse(raw.timestamp)) ? Date.parse(raw.timestamp) : Date.now())
      : raw.timestamp instanceof Date
        ? raw.timestamp.getTime()
        : Date.now();

  const id = raw.id != null ? String(raw.id) : `mem_${createdAtMs}_${Math.random().toString(16).slice(2)}`;
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined;

  return {
    id,
    type,
    text,
    timestamp: new Date(createdAtMs),
    meta
  };
};

const serializeMemory = (m: Memory) => ({
  id: m.id,
  type: m.type,
  text: m.text,
  createdAtMs: m.timestamp instanceof Date ? m.timestamp.getTime() : Date.now(),
  meta: m.meta
});

export const useChat = (
    onExecuteTrade?: ExecuteTradeHandler,
    options?: UseChatOptions
) => {
  // --- Agent State (Pre-configured Trading Team) ---
  const [agents, setAgents] = useState<Agent[]>(() => loadAgents());
  const [activeAgentId, setActiveAgentId] = useState<string>('agent-1');

  // --- AutoPilot & Memory State ---
  const [autoPilotConfig, setAutoPilotConfig] = useState<AutoPilotConfig>(() => loadAutoPilotConfig());

  const [memories, setMemories] = useState<Memory[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTOPILOT_STORAGE_KEY, JSON.stringify(autoPilotConfig));
    } catch {
      // ignore
    }
  }, [autoPilotConfig]);

  // Load persisted trade memories (best-effort).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ledger = (window as any)?.glass?.tradeLedger;
      if (ledger?.listMemories) {
        try {
          const res = await ledger.listMemories({ limit: MAX_MEMORIES_IN_STATE });
          if (cancelled) return;
          if (res?.ok && Array.isArray(res.memories)) {
            const loaded = res.memories.map(normalizeMemory).filter(Boolean) as Memory[];
            const deduped = Array.from(new Map(loaded.map(m => [m.id, m])).values());
            setMemories(deduped.slice(0, MAX_MEMORIES_IN_STATE));
            return;
          }
        } catch {
          // fall through to localStorage
        }
      }

      try {
        const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const loaded = parsed.map(normalizeMemory).filter(Boolean) as Memory[];
        const deduped = Array.from(new Map(loaded.map(m => [m.id, m])).values());
        setMemories(deduped.slice(0, MAX_MEMORIES_IN_STATE));
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // --- Message State ---
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "Trading Desk initialized. The Technician, Macro Strategist, and Risk Manager are online. \n\nPlease set a Session Bias (e.g., 'Bullish USD') to align the team.",
      timestamp: new Date(),
      agentId: 'agent-1',
      agentName: 'System',
      agentColor: 'bg-gray-600'
    }
  ]);

  // Keep chat performant: cap total message count and avoid retaining too many base64 images.
  useEffect(() => {
    setMessages((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      let changed = false;
      let next = prev;

      // Cap overall message count but preserve the welcome message if present.
      if (next.length > MAX_MESSAGES_IN_STATE) {
        const welcome = next.find((m) => m?.id === 'welcome') || null;
        const tail = next.slice(Math.max(0, next.length - MAX_MESSAGES_IN_STATE));
        if (welcome && !tail.some((m) => m?.id === 'welcome')) {
          next = [welcome, ...tail.slice(1)];
        } else {
          next = tail;
        }
        changed = true;
      }

      // Prune old base64 images to reduce memory pressure (keep most recent N).
      let kept = 0;
      const out: Message[] = new Array(next.length);
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i];
        if (!m) {
          out[i] = m as any;
          continue;
        }
        const img = (m as any).image;
        if (isDataUrl(img)) {
          if (kept < MAX_DATAURL_IMAGES_IN_STATE) {
            kept += 1;
            out[i] = m;
          } else {
            changed = true;
            const { image: _drop, ...rest } = m as any;
            out[i] = rest as Message;
          }
        } else {
          out[i] = m;
        }
      }

      return changed ? out : prev;
    });
  }, [messages.length]);

  const [sessionBias, setSessionBias] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);
  const disableChartWatchInitial = options?.disableChartWatch === true;
  const externalContextRef = useRef<UseChatOptions['getExternalContext']>(null);
  const systemContextPrefixRef = useRef<string>('');
  const disableChartWatchRef = useRef<boolean>(disableChartWatchInitial);
  const brokerActionHandlerRef = useRef<ExecuteBrokerActionHandler | null>(options?.onExecuteBrokerAction || null);
  const agentToolHandlerRef = useRef<ExecuteAgentToolHandler | null>(options?.onExecuteAgentTool || null);
  const agentToolCancelHandlerRef = useRef<CancelAgentToolHandler | null>(options?.onCancelAgentTool || null);
  const agentRequestHandlerRef = useRef<UseChatOptions['onAgentRequest']>(options?.onAgentRequest || null);
  const defaultActionSourceRef = useRef<string>(
    options?.defaultActionSource ? String(options.defaultActionSource).trim() : ''
  );
  const resolveActionFlowIntentRef = useRef<UseChatOptions['resolveActionFlowIntent']>(options?.resolveActionFlowIntent || null);
  const lastUserIntentRef = useRef<string>('');

  useEffect(() => {
    externalContextRef.current = options?.getExternalContext || null;
    systemContextPrefixRef.current = options?.systemContextPrefix ? String(options.systemContextPrefix).trim() : '';
    disableChartWatchRef.current = options?.disableChartWatch === true;
    brokerActionHandlerRef.current = options?.onExecuteBrokerAction || null;
    agentToolHandlerRef.current = options?.onExecuteAgentTool || null;
    agentToolCancelHandlerRef.current = options?.onCancelAgentTool || null;
    agentRequestHandlerRef.current = options?.onAgentRequest || null;
    defaultActionSourceRef.current = options?.defaultActionSource
      ? String(options.defaultActionSource).trim()
      : '';
    resolveActionFlowIntentRef.current = options?.resolveActionFlowIntent || null;
  }, [
    options?.getExternalContext,
    options?.systemContextPrefix,
    options?.disableChartWatch,
    options?.onExecuteBrokerAction,
    options?.onExecuteAgentTool,
    options?.onCancelAgentTool,
    options?.onAgentRequest,
    options?.defaultActionSource,
    options?.resolveActionFlowIntent
  ]);

  // --- Chat Preferences ---
  const [replyMode, setReplyMode] = useState<ReplyMode>(() => {
    try {
      const stored = localStorage.getItem('glass_chat_reply_mode');
      if (stored === 'single' || stored === 'team') return stored;
    } catch { /* ignore */ }
    return 'single';
  });

  const [autoTabVisionEnabled, setAutoTabVisionEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('glass_chat_auto_tab_vision');
      if (stored === '1' || stored === 'true') return true;
      if (stored === '0' || stored === 'false') return false;
    } catch { /* ignore */ }
    return detectElectron();
  });

  const [chartWatchEnabled, setChartWatchEnabled] = useState<boolean>(() => {
    if (disableChartWatchInitial) return false;
    try {
      const stored = localStorage.getItem('glass_chat_chart_watch');
      if (stored === '1' || stored === 'true') return true;
      if (stored === '0' || stored === 'false') return false;
    } catch { /* ignore */ }
    return false;
  });

  const [chartWatchMode, setChartWatchMode] = useState<ChartWatchMode>(() => {
    try {
      const stored = String(localStorage.getItem(CHART_WATCH_MODE_KEY) || '').trim().toLowerCase();
      if (stored === 'signals' || stored === 'digest' || stored === 'live') return stored as ChartWatchMode;
    } catch { /* ignore */ }
    return 'signals';
  });

  const [chartWatchSnoozedUntilMs, setChartWatchSnoozedUntilMs] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(CHART_WATCH_SNOOZE_UNTIL_KEY) || 0);
      return Number.isFinite(stored) && stored > Date.now() ? stored : 0;
    } catch { /* ignore */ }
    return 0;
  });

  const [chartWatchLeadAgentId, setChartWatchLeadAgentId] = useState<string>(() => {
    try {
      const stored = String(localStorage.getItem(CHART_WATCH_LEAD_AGENT_KEY) || '').trim();
      if (stored) return stored;
    } catch { /* ignore */ }
    return 'agent-1';
  });

  useEffect(() => {
    if (!options?.disableChartWatch) return;
    if (chartWatchEnabled) setChartWatchEnabled(false);
  }, [chartWatchEnabled, options?.disableChartWatch]);

  const [postTradeReviewEnabled, setPostTradeReviewEnabled] = useState<boolean>(() => {
    try {
      const stored = String(localStorage.getItem(POST_TRADE_REVIEW_ENABLED_KEY) || '').trim().toLowerCase();
      if (stored === '1' || stored === 'true') return true;
      if (stored === '0' || stored === 'false') return false;
    } catch { /* ignore */ }
    return true;
  });

  const [postTradeReviewAgentId, setPostTradeReviewAgentId] = useState<string>(() => {
    try {
      const stored = String(localStorage.getItem(POST_TRADE_REVIEW_AGENT_KEY) || '').trim();
      if (stored) return stored;
    } catch { /* ignore */ }
    return 'agent-3';
  });

  useEffect(() => {
    try { localStorage.setItem('glass_chat_reply_mode', replyMode); } catch { /* ignore */ }
  }, [replyMode]);

  useEffect(() => {
    try { localStorage.setItem('glass_chat_auto_tab_vision', autoTabVisionEnabled ? '1' : '0'); } catch { /* ignore */ }
  }, [autoTabVisionEnabled]);

  useEffect(() => {
    if (disableChartWatchRef.current) return;
    try { localStorage.setItem('glass_chat_chart_watch', chartWatchEnabled ? '1' : '0'); } catch { /* ignore */ }
  }, [chartWatchEnabled]);

  useEffect(() => {
    if (disableChartWatchRef.current) return;
    try { localStorage.setItem(CHART_WATCH_MODE_KEY, chartWatchMode); } catch { /* ignore */ }
  }, [chartWatchMode]);

  useEffect(() => {
    if (disableChartWatchRef.current) return;
    try {
      if (chartWatchSnoozedUntilMs && chartWatchSnoozedUntilMs > Date.now()) {
        localStorage.setItem(CHART_WATCH_SNOOZE_UNTIL_KEY, String(chartWatchSnoozedUntilMs));
      } else {
        localStorage.removeItem(CHART_WATCH_SNOOZE_UNTIL_KEY);
      }
    } catch { /* ignore */ }
  }, [chartWatchSnoozedUntilMs]);

  useEffect(() => {
    if (disableChartWatchRef.current) return;
    try { localStorage.setItem(CHART_WATCH_LEAD_AGENT_KEY, chartWatchLeadAgentId); } catch { /* ignore */ }
  }, [chartWatchLeadAgentId]);

  useEffect(() => {
    try { localStorage.setItem(POST_TRADE_REVIEW_ENABLED_KEY, postTradeReviewEnabled ? '1' : '0'); } catch { /* ignore */ }
  }, [postTradeReviewEnabled]);

  useEffect(() => {
    try { localStorage.setItem(POST_TRADE_REVIEW_AGENT_KEY, String(postTradeReviewAgentId || '').trim()); } catch { /* ignore */ }
  }, [postTradeReviewAgentId]);

  // --- LIVE API STATE ---
  const [isLive, setIsLive] = useState(false);
  const [liveMode, setLiveMode] = useState<'camera' | 'screen' | 'audio' | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  
  const activeSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const videoIntervalRef = useRef<number | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveFunctionArgsRef = useRef<Record<string, { name: string; args: string }>>({});
  const lastVideoFrameSentRef = useRef<Record<string, number>>({});
  const lastVideoFrameHashSentRef = useRef<Record<string, string>>({});

  // --- TTS State ---
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // --- Refs for background features (Chart Watch) ---
  const messagesRef = useRef<Message[]>(messages);
  const agentsRef = useRef<Agent[]>(agents);
  const memoriesRef = useRef<Memory[]>(memories);
  const sessionBiasRef = useRef<string>(sessionBias);
  const autoPilotConfigRef = useRef<AutoPilotConfig>(autoPilotConfig);
  const postTradeReviewEnabledRef = useRef<boolean>(postTradeReviewEnabled);
  const postTradeReviewAgentIdRef = useRef<string>(postTradeReviewAgentId);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);
  useEffect(() => {
    try {
      localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
    } catch {
      // ignore
    }
  }, [agents]);
  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);
  useEffect(() => {
    sessionBiasRef.current = sessionBias;
  }, [sessionBias]);
  useEffect(() => {
    autoPilotConfigRef.current = autoPilotConfig;
  }, [autoPilotConfig]);
  useEffect(() => {
    postTradeReviewEnabledRef.current = postTradeReviewEnabled;
  }, [postTradeReviewEnabled]);
  useEffect(() => {
    postTradeReviewAgentIdRef.current = postTradeReviewAgentId;
  }, [postTradeReviewAgentId]);

  const chartWatchModeRef = useRef<ChartWatchMode>(chartWatchMode);
  useEffect(() => {
    chartWatchModeRef.current = chartWatchMode;
  }, [chartWatchMode]);

  const chartWatchSnoozedUntilMsRef = useRef<number>(chartWatchSnoozedUntilMs);
  useEffect(() => {
    chartWatchSnoozedUntilMsRef.current = chartWatchSnoozedUntilMs;
  }, [chartWatchSnoozedUntilMs]);

  const chartWatchLeadAgentIdRef = useRef<string>(chartWatchLeadAgentId);
  useEffect(() => {
    chartWatchLeadAgentIdRef.current = chartWatchLeadAgentId;
  }, [chartWatchLeadAgentId]);

  const chartWatchAgentCursorRef = useRef(0);
  const chartWatchInFlightRef = useRef(false);
  const chartWatchLastSummaryByUrlRef = useRef<Record<string, string>>({});
  const chartWatchLastTitleByUrlRef = useRef<Record<string, string>>({});
  const chartWatchLastUpdatedAtByUrlRef = useRef<Record<string, number>>({});
  const chartWatchLastSignalAtByUrlRef = useRef<Record<string, number>>({});
  const chartWatchRateLimitStepRef = useRef<number>(0);
  const tradeExecutionInFlightRef = useRef<Set<string>>(new Set());

  // --- Helpers ---
  const resolveAgentForMessage = useCallback((messageId: string) => {
    const msg = messagesRef.current.find((m) => m.id === messageId);
    const agentId = msg?.agentId ? String(msg.agentId) : '';
    const list = agentsRef.current || [];
    if (!list.length) return null;
    if (agentId) return list.find((a) => a.id === agentId) || list[0];
    return list[0];
  }, []);

  const getAgentCaps = useCallback((agent?: Agent | null) => {
    return normalizeAgentCapabilities(agent?.capabilities || null);
  }, []);

  const applyAgentCapabilitiesToActions = useCallback(
    (agent: Agent, actions: { tradeProposal?: TradeProposal | null; brokerAction?: BrokerAction | null; agentToolAction?: AgentToolAction | null }) => {
      const caps = getAgentCaps(agent);
      const blocked: string[] = [];
      let tradeProposal = actions.tradeProposal || null;
      let brokerAction = actions.brokerAction || null;
      let agentToolAction = actions.agentToolAction || null;

      if (tradeProposal && !caps.trade) {
        tradeProposal = null;
        blocked.push('trade proposals');
      }
      if (brokerAction && !caps.broker) {
        brokerAction = null;
        blocked.push('broker actions');
      }
      if (agentToolAction && !caps.tools) {
        agentToolAction = null;
        blocked.push('tool calls');
      }

      return { tradeProposal, brokerAction, agentToolAction, blocked };
    },
    [getAgentCaps]
  );

  const ensureToolActionSource = useCallback((action?: AgentToolAction | null) => {
    if (!action || action.type !== 'RUN_ACTION_CATALOG') return action;
    const fallbackSource = defaultActionSourceRef.current;
    if (!fallbackSource) return action;
    const existingSource = String(action.source || '').trim();
    const payload = action.payload && typeof action.payload === 'object' ? { ...action.payload } : {};
    const payloadSource = String(payload.source || '').trim();
    const intentRaw = String(payload.intent || '').trim();
    const intentKeyRaw = String(payload.intentKey || '').trim();
    if (!intentRaw && !intentKeyRaw) {
      const lastUserIntent = String(lastUserIntentRef.current || '').trim();
      if (lastUserIntent) {
        payload.intent = lastUserIntent.length > 140 ? `${lastUserIntent.slice(0, 136)}...` : lastUserIntent;
      }
    }
    if (existingSource || payloadSource) return { ...action, payload };
    payload.source = fallbackSource;
    return { ...action, source: fallbackSource, payload };
  }, []);
  const executeTradeProposal = useCallback(async (messageId: string, proposal: TradeProposal, source: TradeExecutionSource) => {
    if (!onExecuteTrade) return;
    if (!proposal || proposal.status !== 'PENDING') return;

    const inFlight = tradeExecutionInFlightRef.current;
    if (inFlight.has(messageId)) return;
    inFlight.add(messageId);

    const agent = resolveAgentForMessage(messageId);
    const caps = getAgentCaps(agent);
    if (source === 'autopilot') {
      const cfg = autoPilotConfigRef.current;
      const autoBlockReason = !cfg?.enabled
        ? 'AutoPilot is disabled.'
        : cfg?.killSwitch
          ? 'AutoPilot kill switch is ON.'
          : cfg?.requireConfirmation
            ? 'AutoPilot requires confirmation.'
            : '';
      if (autoBlockReason) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId || !m.tradeProposal) return m;
            if (m.tradeProposal.status !== 'PENDING') return m;
            return {
              ...m,
              tradeProposal: {
                ...m.tradeProposal,
                status: 'REJECTED',
                executionError: autoBlockReason,
                executedAtMs: Date.now()
              }
            };
          })
        );
        inFlight.delete(messageId);
        return;
      }
    }
    if (!caps.trade || (source === 'autopilot' && !caps.autoExecute)) {
      const reason = !caps.trade
        ? 'Agent capability blocks trade execution.'
        : 'Agent capability blocks auto-execution.';
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.tradeProposal) return m;
          if (m.tradeProposal.status !== 'PENDING') return m;
          return {
            ...m,
            tradeProposal: {
              ...m.tradeProposal,
              status: 'REJECTED',
              executionError: reason,
              executedAtMs: Date.now()
            }
          };
        })
      );
      inFlight.delete(messageId);
      return;
    }

    const enrichedProposal: TradeProposal = {
      ...proposal,
      messageId
    };

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.tradeProposal) return m;
        if (m.tradeProposal.status !== 'PENDING') return m;
        return {
          ...m,
          tradeProposal: {
            ...m.tradeProposal,
            status: 'SUBMITTING',
            executionSource: source,
            executionError: undefined,
            messageId
          }
        };
      })
    );

    let result: TradeExecutionResult;
    try {
      result = await Promise.resolve(onExecuteTrade(enrichedProposal, source));
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Trade execution failed.';
      result = { ok: false, error: msg };
    }

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.tradeProposal) return m;
        if (m.tradeProposal.status !== 'SUBMITTING') return m;

        const nextBase = {
          ...m.tradeProposal,
          executionBroker: result.ok ? result.broker : result.broker,
          executedAtMs: Date.now(),
          messageId
        } as TradeProposal;

        if (result.ok) {
          return { ...m, tradeProposal: { ...nextBase, status: 'EXECUTED', executionError: undefined } };
        }

        return { ...m, tradeProposal: { ...nextBase, status: 'REJECTED', executionError: result.error } };
      })
    );

    inFlight.delete(messageId);
  }, [onExecuteTrade]);

  const rejectTradeProposal = useCallback((messageId: string, reason: string = 'Rejected') => {
    const msg = messagesRef.current.find((m) => m.id === messageId);
    const proposal = msg?.tradeProposal;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.tradeProposal) return m;
        if (m.tradeProposal.status !== 'PENDING') return m;
        return {
          ...m,
          tradeProposal: {
            ...m.tradeProposal,
            status: 'REJECTED',
            executionError: reason,
            executedAtMs: Date.now()
          }
        };
      })
    );
  }, []);

  const executeBrokerAction = useCallback(async (messageId: string, action: BrokerAction) => {
    const handler = brokerActionHandlerRef.current;
    if (!handler) return;
    if (!action || action.status !== 'PENDING') return;

    const agent = resolveAgentForMessage(messageId);
    const caps = getAgentCaps(agent);
    if (!caps.broker) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.brokerAction) return m;
          if (m.brokerAction.status !== 'PENDING') return m;
          return {
            ...m,
            brokerAction: {
              ...m.brokerAction,
              status: 'REJECTED',
              executionError: 'Agent capability blocks broker actions.',
              executedAtMs: Date.now()
            }
          };
        })
      );
      return;
    }

    const enrichedAction: BrokerAction = {
      ...action,
      messageId
    };

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.brokerAction) return m;
        if (m.brokerAction.status !== 'PENDING') return m;
        return {
          ...m,
          brokerAction: {
            ...m.brokerAction,
            status: 'SUBMITTING',
            executionError: undefined,
            messageId
          }
        };
      })
    );

    let result: BrokerActionResult;
    try {
      result = await Promise.resolve(handler(enrichedAction));
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Broker action failed.';
      result = { ok: false, error: msg };
    }

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.brokerAction) return m;
        if (m.brokerAction.status !== 'SUBMITTING') return m;

        const nextBase = {
          ...m.brokerAction,
          executedAtMs: Date.now(),
          messageId
        } as BrokerAction;

        if (result.ok) {
          return { ...m, brokerAction: { ...nextBase, status: 'EXECUTED', executionError: undefined } };
        }

        return {
          ...m,
          brokerAction: {
            ...nextBase,
            status: 'REJECTED',
            executionError: result.error,
            executionCode: result.code
          }
        };
      })
    );
  }, []);

  const executeAgentTool = useCallback(async (messageId: string, action: AgentToolAction) => {
    const handler = agentToolHandlerRef.current;
    if (!handler) return;
    if (!action || action.status !== 'PENDING') return;

    const agent = resolveAgentForMessage(messageId);
    const caps = getAgentCaps(agent);
    if (!caps.tools) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.agentToolAction) return m;
          if (m.agentToolAction.status !== 'PENDING') return m;
          return {
            ...m,
            agentToolAction: {
              ...m.agentToolAction,
              status: 'FAILED',
              error: 'Agent capability blocks tool execution.'
            }
          };
        })
      );
      return;
    }

    const enrichedAction: AgentToolAction = {
      ...action,
      messageId
    };

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.agentToolAction) return m;
        if (m.agentToolAction.status !== 'PENDING') return m;
        return {
          ...m,
          agentToolAction: {
            ...m.agentToolAction,
            messageId
          }
        };
      })
    );

    const reportProgress = (update: AgentToolProgressUpdate) => {
      if (!update) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId || !m.agentToolAction) return m;
          if (m.agentToolAction.status !== 'PENDING') return m;
          return {
            ...m,
            agentToolAction: {
              ...m.agentToolAction,
              ...update
            }
          };
        })
      );
    };

    let result: AgentToolResult;
    try {
      result = await Promise.resolve(handler(enrichedAction, reportProgress));
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Agent tool failed.';
      result = { ok: false, text: msg };
    }

    const executedAtMs = Date.now();
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.agentToolAction) return m;
        if (m.agentToolAction.status !== 'PENDING') return m;
        return {
          ...m,
          agentToolAction: {
            ...m.agentToolAction,
            status: result.ok ? 'EXECUTED' : 'FAILED',
            error: result.ok ? undefined : result.text,
            executedAtMs,
            messageId
          }
        };
      })
    );

    const toolText = String(result?.text || '').trim();
    const toolImage = result?.imageDataUrl ? String(result.imageDataUrl) : '';
    if (toolText || toolImage) {
      let imageForChat: string | undefined;
      if (toolImage) {
        const isData = toolImage.startsWith('data:');
        if (isData) {
          imageForChat = toolImage;
          try {
            await persistImageDataUrlForChat({
              dataUrl: toolImage,
              subdir: 'chat-images',
              prefix: 'tool_snapshot'
            });
          } catch {
            // ignore persistence errors; keep data URL for model vision
          }
        } else {
          try {
            const saved = await persistImageDataUrlForChat({
              dataUrl: toolImage,
              subdir: 'chat-images',
              prefix: 'tool_snapshot'
            });
            imageForChat = saved?.src ? String(saved.src) : toolImage;
          } catch {
            imageForChat = toolImage;
          }
        }
      }

      const toolMessage: Message = {
        id: `${executedAtMs}_tool`,
        role: 'system',
        text: toolText || (result.ok ? 'Tool result ready.' : 'Tool failed.'),
        timestamp: new Date(),
        isError: !result.ok,
        image: imageForChat
      };
      setMessages((prev) => [...prev, toolMessage]);
    }
  }, []);

  const cancelAgentTool = useCallback((messageId: string, reason: string = 'Cancel requested') => {
    const msg = (messagesRef.current || []).find((m) => m.id === messageId);
    const action = msg?.agentToolAction;
    if (!action || action.status !== 'PENDING') return;

    try {
      agentToolCancelHandlerRef.current?.(messageId, action);
    } catch {
      // ignore
    }

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.agentToolAction) return m;
        if (m.agentToolAction.status !== 'PENDING') return m;
        return {
          ...m,
          agentToolAction: {
            ...m.agentToolAction,
            progressLabel: reason
          }
        };
      })
    );
  }, []);

  const rejectBrokerAction = useCallback((messageId: string, reason: string = 'Rejected') => {
    const msg = messagesRef.current.find((m) => m.id === messageId);
    const action = msg?.brokerAction;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.brokerAction) return m;
        if (m.brokerAction.status !== 'PENDING') return m;
        return {
          ...m,
          brokerAction: {
            ...m.brokerAction,
            status: 'REJECTED',
            executionError: reason,
            executedAtMs: Date.now()
          }
        };
      })
    );
  }, []);

  const maybeAutoExecuteProposal = useCallback((messageId: string, proposal: TradeProposal) => {
    const cfg = autoPilotConfigRef.current;
    if (cfg?.killSwitch) return;
    if (!cfg?.enabled || cfg.requireConfirmation) return;
    if (!onExecuteTrade) return;
    const agent = resolveAgentForMessage(messageId);
    const caps = getAgentCaps(agent);
    if (!caps.autoExecute) return;
    void executeTradeProposal(messageId, proposal, 'autopilot');
  }, [executeTradeProposal, getAgentCaps, onExecuteTrade, resolveAgentForMessage]);

  const formatAutoPilotStatus = useCallback((cfg: AutoPilotConfig) => {
    const { mode, policy, effective } = resolveAutoPilotPolicy(cfg);
    const perSymbolPos = Number(cfg?.perSymbolMaxPositions);
    const perSymbolLot = Number(cfg?.perSymbolMaxLot);
    const perSymbolPosLabel = Number.isFinite(perSymbolPos) && perSymbolPos > 0 ? String(perSymbolPos) : 'OFF';
    const perSymbolLotLabel = Number.isFinite(perSymbolLot) && perSymbolLot > 0 ? perSymbolLot.toFixed(2) : 'OFF';
    const spreadModel = (effective?.spreadLimitModel || 'none').toLowerCase();
    const spreadPct = Number(effective?.spreadLimitPct);
    const spreadAtr = Number(effective?.spreadLimitAtrMult);
    const spreadLabel =
      spreadModel === 'percent' && Number.isFinite(spreadPct) && spreadPct > 0
        ? `${spreadPct}%`
        : spreadModel === 'atr' && Number.isFinite(spreadAtr) && spreadAtr > 0
          ? `${spreadAtr}x ATR`
          : 'OFF';
    const stopModel = String(effective?.stopModel || 'percent').toLowerCase();
    const stopPct = Number(effective?.stopPercent);
    const stopAtr = Number(effective?.stopAtrMult);
    const stopLabel =
      stopModel === 'atr' && Number.isFinite(stopAtr) && stopAtr > 0
        ? `${stopAtr}x ATR`
        : Number.isFinite(stopPct) && stopPct > 0
          ? `${stopPct}%`
          : 'OFF';
    const defaultRR = Number(effective?.defaultRR);
    const rrLabel = Number.isFinite(defaultRR) && defaultRR > 0 ? defaultRR.toFixed(2) : '2.00';
    const rawCaps = String(cfg?.symbolCapsRaw || '').trim();
    const capLines = rawCaps
      ? rawCaps.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).length
      : 0;
    const rawGroupCaps = String(cfg?.groupCapsRaw || '').trim();
    const groupCapLines = rawGroupCaps
      ? rawGroupCaps.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).length
      : 0;
    const rawGroupMap = String(cfg?.symbolGroupMapRaw || '').trim();
    const groupMapLines = rawGroupMap
      ? rawGroupMap.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).length
      : 0;
    const lossStreakLimit = Number(cfg?.maxConsecutiveLosses);
    const lossStreakLabel = Number.isFinite(lossStreakLimit) && lossStreakLimit > 0 ? String(lossStreakLimit) : 'OFF';
    const modeLabel = mode === 'custom' ? 'CUSTOM' : String(mode || 'custom').toUpperCase();
    const executionMode = String(cfg?.executionMode || 'live').toUpperCase();
    const modeFilters: string[] = [];
    if (policy.allowedStrategies && policy.allowedStrategies.length > 0) {
      modeFilters.push(`Strategies ${policy.allowedStrategies.join('/')}`);
    }
    if (policy.allowedTimeframes && policy.allowedTimeframes.length > 0) {
      modeFilters.push(`Timeframes ${policy.allowedTimeframes.join('/')}`);
    }
    const modeFiltersLine = modeFilters.length > 0 ? `\n        MODE FILTERS: ${modeFilters.join(' | ')}` : '';

    const driftWarn = cfg?.driftActionWarn || 'none';
    const driftPoor = cfg?.driftActionPoor || 'none';
    const driftCooldown = Number(cfg?.driftActionCooldownHours);
    const driftCooldownLabel = Number.isFinite(driftCooldown) && driftCooldown > 0 ? `${driftCooldown}h` : '0h';
    const driftRetest = cfg?.driftAutoRetest ? 'ON' : 'OFF';
    const driftRetestCooldown = Number(cfg?.driftRetestCooldownHours);
    const driftRetestCooldownLabel = Number.isFinite(driftRetestCooldown) && driftRetestCooldown > 0 ? `${driftRetestCooldown}h` : '--';
    const driftRange = Number(cfg?.driftRetestRangeDays);
    const driftRangeLabel = Number.isFinite(driftRange) && driftRange > 0 ? `${driftRange}d` : '--';
    const driftCombos = Number(cfg?.driftRetestMaxCombos);
    const driftCombosLabel = Number.isFinite(driftCombos) && driftCombos > 0 ? String(driftCombos) : '--';

    return `
        AUTOPILOT STATUS: ${cfg.enabled ? 'ENABLED' : 'DISABLED'} | MODE ${modeLabel}
        KILL SWITCH: ${cfg.killSwitch ? 'ON' : 'OFF'} | EXECUTION MODE: ${executionMode}
        RISK SETTINGS: Max Daily Loss $${effective.maxDailyLoss}, Risk Per Trade ${effective.riskPerTrade}%, Spread Limit ${spreadLabel}, Default Stop ${stopLabel} RR ${rrLabel}, Default Lot Size ${cfg.lotSize} lots, Max Open Positions ${effective.maxOpenPositions}
        SYMBOL CAPS: Per-Symbol Positions ${perSymbolPosLabel}, Per-Symbol Lot ${perSymbolLotLabel}, Overrides ${capLines}
        GROUP CAPS: Group Limits ${groupCapLines}, Group Map ${groupMapLines}, Max Loss Streak ${lossStreakLabel}
        DRIFT CONTROLS: Warn -> ${String(driftWarn).toUpperCase()}, Poor -> ${String(driftPoor).toUpperCase()}, Cooldown ${driftCooldownLabel}, Auto Retest ${driftRetest} (${driftRangeLabel}, ${driftRetestCooldownLabel}, max ${driftCombosLabel})
        BROKER TOOLS: Use refreshBrokerSnapshot only if the broker snapshot is missing the needed position/order details or quotes; otherwise reuse the latest snapshot (stream updates are authoritative). If asked to close/cancel/modify, include the exact positionId/orderId shown in the broker snapshot; otherwise provide the symbol. Use modifyPosition with explicit SL/TP levels (or clear flags) and only include trailingOffset if the user asks for a trailing stop.
        DOLLAR RISK: If the broker snapshot shows VPP ($ per 1.0 price unit), use stopLossUsd/takeProfitUsd in modifyPosition and let the app convert to price with risk / VPP from entry based on side.
        PRICE SOURCE: Use broker quotes from the Broker Snapshot for all numeric price calculations (entry/SL/TP/adjustments). TradingView is visual only unless the user explicitly says to use TradingView price.
        NATIVE CHART: getNativeChartSnapshot is optional. If unavailable, proceed using broker quotes/bars and mention that chart visuals are missing.
        TRADE MODIFICATIONS: For widen/tighten SL/TP, move to BE, or trailing updates, do NOT request a native chart snapshot. Use broker snapshot/quotes only.
        TRADE ENTRIES: For "open trade" requests, do not block on native chart snapshot; use broker quotes/constraints and proceed (or explain why broker data is missing).
        SYMBOL PRIORITY: If the user explicitly names a symbol, you must use that symbol (resolve to broker format if needed). Do not substitute the active chart/TV symbol.
        AGENT TOOLS: Use getSystemState for a full system snapshot, getNativeChartSnapshot for native chart visuals (call it before backtests/optimizations if chart context matters for strategy selection), getBacktestSummary/getBacktestTrainingPack for backtest data, run_backtest_optimization for headless grid search, run_backtest_optimization_chain for second-pass/refinement requests, start_backtest_optimizer + get_backtest_optimizer_status/results for train/test optimization (use strategy AUTO/CUSTOM with strategyDescription when needed; include params for explicit values), getBrokerQuote for exact prices, getAgentMemory/listAgentMemory for stored context (chart snapshot library uses listAgentMemory kind 'chart_snapshot' then getAgentMemory for imageDataUrl/savedPath), and listSetupWatchers/createSetupWatcher/updateSetupWatcher/deleteSetupWatcher/getSetupSignals/explainSetupSignal for live setup monitoring.${modeFiltersLine}
      `;
  }, []);

  const normalizeRiskUpdate = useCallback((update: any) => {
    if (!update || typeof update !== 'object') return null;
    const patch: Record<string, any> = {};
    const modePoliciesPatch: Partial<Record<AutoPilotMode, Record<string, any>>> = {};
    const normalizeNum = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    };
    const normalizeBool = (value: any) => (typeof value === 'boolean' ? value : undefined);
    const normalizeDriftAction = (value: any) => {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return undefined;
      if (raw.includes('paper')) return 'paper';
      if (raw.includes('suggest')) return 'suggest';
      if (raw.includes('disable') || raw.includes('off')) return 'disable';
      if (raw.includes('none') || raw.includes('no')) return 'none';
      return undefined;
    };
    const normalizeExecutionMode = (value: any) => {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return undefined;
      if (raw.includes('shadow')) return 'shadow';
      if (raw.includes('paper') || raw.includes('sim')) return 'paper';
      if (raw.includes('live')) return 'live';
      return undefined;
    };
    const setModeRisk = (mode: AutoPilotMode, value: any) => {
      const normalized = normalizeNum(value);
      if (normalized == null) return;
      modePoliciesPatch[mode] = { ...(modePoliciesPatch[mode] || {}), riskPerTrade: normalized };
    };
    if (update.mode != null) {
      patch.mode = normalizeAutoPilotMode(update.mode, 'custom');
    }
    if (update.executionMode != null) {
      const value = normalizeExecutionMode(update.executionMode);
      if (value) patch.executionMode = value;
    }
    if (update.spreadLimitModel != null) {
      const raw = String(update.spreadLimitModel || '').toLowerCase();
      if (raw.includes('atr')) patch.spreadLimitModel = 'atr';
      else if (raw.includes('percent') || raw.includes('pct') || raw.includes('%')) patch.spreadLimitModel = 'percent';
      else if (raw.includes('none') || raw.includes('off') || raw.includes('disable')) patch.spreadLimitModel = 'none';
    }
    if (update.spreadLimitPct != null) {
      const value = normalizeNum(update.spreadLimitPct);
      if (value != null) patch.spreadLimitPct = value;
    }
    if (update.spreadLimitAtrMult != null) {
      const value = normalizeNum(update.spreadLimitAtrMult);
      if (value != null) patch.spreadLimitAtrMult = value;
    }
    if (update.stopModel != null) {
      const raw = String(update.stopModel || '').toLowerCase();
      if (raw.includes('atr')) patch.stopModel = 'atr';
      else if (raw.includes('percent') || raw.includes('pct') || raw.includes('%')) patch.stopModel = 'percent';
    }
    if (update.stopPercent != null) {
      const value = normalizeNum(update.stopPercent);
      if (value != null) patch.stopPercent = value;
    }
    if (update.stopAtrMult != null) {
      const value = normalizeNum(update.stopAtrMult);
      if (value != null) patch.stopAtrMult = value;
    }
    if (update.defaultRR != null) {
      const value = normalizeNum(update.defaultRR);
      if (value != null) patch.defaultRR = value;
    }
    if (update.maxDailyLoss != null) {
      const value = normalizeNum(update.maxDailyLoss);
      if (value != null) patch.maxDailyLoss = value;
    }
    if (update.riskPerTrade != null) {
      const value = normalizeNum(update.riskPerTrade);
      if (value != null) patch.riskPerTrade = value;
    }
    if (update.lotSize != null) {
      const value = normalizeNum(update.lotSize);
      if (value != null) patch.lotSize = value;
    }
    if (update.maxOpenPositions != null) {
      const value = normalizeNum(update.maxOpenPositions);
      if (value != null) patch.maxOpenPositions = value;
    }
    if (update.perSymbolMaxPositions != null) {
      const value = normalizeNum(update.perSymbolMaxPositions);
      if (value != null) patch.perSymbolMaxPositions = value;
    }
    if (update.perSymbolMaxLot != null) {
      const value = normalizeNum(update.perSymbolMaxLot);
      if (value != null) patch.perSymbolMaxLot = value;
    }
    if (update.maxConsecutiveLosses != null) {
      const value = normalizeNum(update.maxConsecutiveLosses);
      if (value != null) patch.maxConsecutiveLosses = value;
    }
    if (update.symbolGroupMapRaw != null) {
      patch.symbolGroupMapRaw = String(update.symbolGroupMapRaw || '');
    }
    if (update.groupCapsRaw != null) {
      patch.groupCapsRaw = String(update.groupCapsRaw || '');
    }
    if (update.driftActionWarn != null) {
      const value = normalizeDriftAction(update.driftActionWarn);
      if (value != null) patch.driftActionWarn = value;
    }
    if (update.driftActionPoor != null) {
      const value = normalizeDriftAction(update.driftActionPoor);
      if (value != null) patch.driftActionPoor = value;
    }
    if (update.driftActionCooldownHours != null) {
      const value = normalizeNum(update.driftActionCooldownHours);
      if (value != null) patch.driftActionCooldownHours = value;
    }
    if (update.driftAutoRetest != null) {
      const value = normalizeBool(update.driftAutoRetest);
      if (value != null) patch.driftAutoRetest = value;
    }
    if (update.driftRetestCooldownHours != null) {
      const value = normalizeNum(update.driftRetestCooldownHours);
      if (value != null) patch.driftRetestCooldownHours = value;
    }
    if (update.driftRetestRangeDays != null) {
      const value = normalizeNum(update.driftRetestRangeDays);
      if (value != null) patch.driftRetestRangeDays = value;
    }
    if (update.driftRetestMaxCombos != null) {
      const value = normalizeNum(update.driftRetestMaxCombos);
      if (value != null) patch.driftRetestMaxCombos = value;
    }
    if (update.enabled != null) {
      const value = normalizeBool(update.enabled);
      if (value != null) patch.enabled = value;
    }
    if (update.killSwitch != null) {
      const value = normalizeBool(update.killSwitch);
      if (value != null) patch.killSwitch = value;
    }
    if (update.scalperRiskPerTrade != null) setModeRisk('scalper', update.scalperRiskPerTrade);
    if (update.dayRiskPerTrade != null) setModeRisk('day', update.dayRiskPerTrade);
    if (update.trendRiskPerTrade != null) setModeRisk('trend', update.trendRiskPerTrade);
    if (update.swingRiskPerTrade != null) setModeRisk('swing', update.swingRiskPerTrade);
    if (update.customRiskPerTrade != null) {
      setModeRisk('custom', update.customRiskPerTrade);
      const value = normalizeNum(update.customRiskPerTrade);
      if (value != null) patch.riskPerTrade = value;
    }
    const hasModePatch = Object.keys(modePoliciesPatch).length > 0;
    return {
      patch,
      modePoliciesPatch: hasModePatch ? modePoliciesPatch : null
    };
  }, []);

  const applyAutoPilotUpdate = useCallback((prev: AutoPilotConfig, update: any) => {
    const normalized = normalizeRiskUpdate(update);
    if (!normalized) return prev;
    const next: AutoPilotConfig = { ...prev, ...(normalized.patch || {}) };
    if (normalized.modePoliciesPatch) {
      const basePolicies = normalizeModePolicies(prev.modePolicies, DEFAULT_MODE_POLICIES);
      const merged = { ...basePolicies } as Record<AutoPilotMode, any>;
      for (const [modeKey, policyPatch] of Object.entries(normalized.modePoliciesPatch)) {
        const key = modeKey as AutoPilotMode;
        merged[key] = { ...(merged[key] || {}), ...(policyPatch || {}) };
      }
      next.modePolicies = merged;
    }
    return normalizeAutoPilotConfig(next, buildDefaultAutoPilotConfig());
  }, [normalizeRiskUpdate]);

  const appendExternalContext = useCallback((base: string) => {
    const prefix = systemContextPrefixRef.current;
    const baseWithPrefix = prefix ? `${prefix}\n\n${base}` : base;
    const extra = externalContextRef.current ? externalContextRef.current() : '';
    const trimmed = String(extra || '').trim();
    if (!trimmed) return baseWithPrefix;
    return `${baseWithPrefix}\n\nCONTEXT PACK:\n${trimmed}`;
  }, []);

  const addTradeMemory = useCallback((symbol: string, pnl: number, meta: Record<string, any> = {}) => {
    const type: Memory['type'] = pnl >= 0 ? 'WIN' : 'LOSS';
    const abs = Math.abs(pnl);
    const amount = `${pnl >= 0 ? '+' : '-'}${abs.toFixed(2)}`;

    const hintParts: string[] = [];
    if (meta?.action) hintParts.push(String(meta.action).toUpperCase());
    hintParts.push(String(symbol || 'UNKNOWN').toUpperCase());
    const hint = hintParts.join(' ');

    const fmt = (value: any) => {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return null;
      const absN = Math.abs(n);
      const decimals = absN >= 1000 ? 2 : absN >= 1 ? 4 : 6;
      return n.toFixed(decimals).replace(/\.?0+$/, '');
    };

    const reason = meta?.reason != null ? String(meta.reason).replace(/\s+/g, ' ').trim() : '';
    const entry = fmt(meta?.entryPrice);
    const sl = fmt(meta?.stopLoss);
    const tp = fmt(meta?.takeProfit);
    const close = fmt(meta?.closePrice);
    const qty = meta?.qty != null && Number.isFinite(Number(meta.qty)) ? String(Number(meta.qty)) : '';

    const rr = (() => {
      const e = typeof meta?.entryPrice === 'number' ? meta.entryPrice : Number(meta?.entryPrice);
      const s = typeof meta?.stopLoss === 'number' ? meta.stopLoss : Number(meta?.stopLoss);
      const t = typeof meta?.takeProfit === 'number' ? meta.takeProfit : Number(meta?.takeProfit);
      if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(t)) return null;
      const risk = Math.abs(e - s);
      const reward = Math.abs(t - e);
      if (!Number.isFinite(risk) || risk <= 0) return null;
      const r = reward / risk;
      return Number.isFinite(r) ? r : null;
    })();

    const details: string[] = [];
    if (entry && sl && tp) {
      details.push(`E ${entry} SL ${sl} TP ${tp}${rr != null ? ` RR ${rr.toFixed(2)}` : ''}`);
    }
    if (qty) details.push(`Qty ${qty}`);
    if (close) details.push(`Close ${close}`);
    const dur = meta?.durationSec;
    if (dur != null && Number.isFinite(Number(dur)) && Number(dur) > 0) details.push(`Dur ${Math.round(Number(dur))}s`);

    const setupLine = reason ? `Setup: ${reason}` : '';
    const detailsLine = details.length > 0 ? `Details: ${details.join(' | ')}` : '';
    const lessonLine =
      type === 'WIN'
        ? 'Lesson: repeat what worked; keep risk consistent.'
        : 'Lesson: respect invalidation; avoid repeating the same mistake.';

    const parts = [`${hint} (${amount})`];
    if (setupLine) parts.push(setupLine);
    if (detailsLine) parts.push(detailsLine);
    parts.push(lessonLine);

    const text = parts.join('  •  ');

    const createdAtMs = Date.now();
    const id = meta?.memoryId ? String(meta.memoryId) : `mem_${createdAtMs}_${Math.random().toString(16).slice(2)}`;
    const dedupeKey = meta?.dedupeKey != null ? String(meta.dedupeKey) : null;

    const newMemory: Memory = {
      id,
      type,
      text,
      timestamp: new Date(createdAtMs),
      meta: {
        ...meta,
        symbol,
        pnl,
        dedupeKey: dedupeKey || undefined
      }
    };

    setMemories((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      if (dedupeKey && prev.some((m) => String(m.meta?.dedupeKey || '') === dedupeKey)) return prev;
      const next = [newMemory, ...prev];
      return next.slice(0, MAX_MEMORIES_IN_STATE);
    });

    // Persist best-effort (Electron ledger preferred, localStorage fallback).
    try {
      const ledger = (window as any)?.glass?.tradeLedger;
      if (ledger?.addMemory) {
        void ledger.addMemory({
          id,
          type,
          text,
          createdAtMs,
          meta: newMemory.meta
        });
      } else {
        const next = [newMemory, ...memoriesRef.current].slice(0, MAX_MEMORIES_IN_STATE).map(serializeMemory);
        localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // ignore persistence errors
    }
  }, []);

  const persistMemoriesLocal = useCallback((next: Memory[]) => {
    try {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(next.slice(0, MAX_MEMORIES_IN_STATE).map(serializeMemory)));
    } catch {
      // ignore
    }
  }, []);

  const addManualMemory = useCallback(async (args: { type: Memory['type']; text: string; meta?: Record<string, any> }) => {
    const createdAtMs = Date.now();
    const rawText = String(args?.text || '').replace(/\s+/g, ' ').trim();
    if (!rawText) return { ok: false as const, error: 'Memory text is required.' };

    const type: Memory['type'] = String(args?.type || '').toUpperCase() === 'LOSS' ? 'LOSS' : 'WIN';
    const id = `mem_manual_${createdAtMs}_${Math.random().toString(16).slice(2)}`;
    const meta = args?.meta && typeof args.meta === 'object' ? args.meta : {};

    const newMemory: Memory = {
      id,
      type,
      text: rawText,
      timestamp: new Date(createdAtMs),
      meta: { ...meta, manual: true }
    };

    setMemories((prev) => {
      const next = [newMemory, ...prev].slice(0, MAX_MEMORIES_IN_STATE);
      return next;
    });

    try {
      const ledger = (window as any)?.glass?.tradeLedger;
      if (ledger?.addMemory) {
        await ledger.addMemory({
          id,
          type,
          text: rawText,
          createdAtMs,
          meta: newMemory.meta
        });
      } else {
        const next = [newMemory, ...memoriesRef.current].slice(0, MAX_MEMORIES_IN_STATE);
        persistMemoriesLocal(next);
      }
      return { ok: true as const, memory: newMemory };
    } catch (e: any) {
      // fall back to localStorage on persistence failure
      try {
        const next = [newMemory, ...memoriesRef.current].slice(0, MAX_MEMORIES_IN_STATE);
        persistMemoriesLocal(next);
      } catch { /* ignore */ }
      return { ok: false as const, error: e?.message ? String(e.message) : 'Failed to persist memory.' };
    }
  }, [persistMemoriesLocal]);

  const updateMemory = useCallback(async (id: string, patch: { type?: Memory['type']; text?: string; meta?: Record<string, any> }) => {
    const key = String(id || '').trim();
    if (!key) return { ok: false as const, error: 'id is required.' };

    const nextText = patch?.text != null ? String(patch.text).replace(/\s+/g, ' ').trim() : null;
    const nextType = patch?.type != null ? (String(patch.type).toUpperCase() === 'LOSS' ? 'LOSS' : 'WIN') : null;
    const nextMeta = patch?.meta && typeof patch.meta === 'object' ? patch.meta : undefined;

    if (nextText != null && !nextText) return { ok: false as const, error: 'Memory text is required.' };

    const base = Array.isArray(memoriesRef.current) ? memoriesRef.current : [];
    const editedAtMs = Date.now();
    const next = base.map((m) => {
      if (m.id !== key) return m;
      const mergedMeta = nextMeta != null ? nextMeta : m.meta;
      return {
        ...m,
        type: nextType != null ? nextType : m.type,
        text: nextText != null ? nextText : m.text,
        meta:
          mergedMeta != null
            ? { ...(mergedMeta || {}), lastEditedAtMs: editedAtMs }
            : { lastEditedAtMs: editedAtMs }
      };
    });
    setMemories(next);

    try {
      const ledger = (window as any)?.glass?.tradeLedger;
      if (ledger?.updateMemory) {
        const ledgerPatch: any = {};
        if (nextText != null) ledgerPatch.text = nextText;
        if (nextType != null) ledgerPatch.type = nextType;
        if (nextMeta != null) ledgerPatch.meta = nextMeta;
        await ledger.updateMemory({ id: key, patch: ledgerPatch });
      } else {
        persistMemoriesLocal(next);
      }
      return { ok: true as const };
    } catch (e: any) {
      try { persistMemoriesLocal(next); } catch { /* ignore */ }
      return { ok: false as const, error: e?.message ? String(e.message) : 'Failed to update memory.' };
    }
  }, [persistMemoriesLocal]);

  const deleteMemory = useCallback(async (id: string) => {
    const key = String(id || '').trim();
    if (!key) return { ok: false as const, error: 'id is required.' };

    const base = Array.isArray(memoriesRef.current) ? memoriesRef.current : [];
    const next = base.filter((m) => m.id !== key);
    setMemories(next);

    try {
      const ledger = (window as any)?.glass?.tradeLedger;
      if (ledger?.deleteMemory) {
        await ledger.deleteMemory({ id: key });
      } else {
        persistMemoriesLocal(next);
      }
      return { ok: true as const };
    } catch (e: any) {
      try { persistMemoriesLocal(next); } catch { /* ignore */ }
      return { ok: false as const, error: e?.message ? String(e.message) : 'Failed to delete memory.' };
    }
  }, [persistMemoriesLocal]);

  const clearMemories = useCallback(async () => {
    setMemories([]);
    try {
      const ledger = (window as any)?.glass?.tradeLedger;
      if (ledger?.clearMemories) {
        await ledger.clearMemories();
      } else {
        try { localStorage.removeItem(MEMORY_STORAGE_KEY); } catch { /* ignore */ }
      }
      return { ok: true as const };
    } catch (e: any) {
      try { localStorage.removeItem(MEMORY_STORAGE_KEY); } catch { /* ignore */ }
      return { ok: false as const, error: e?.message ? String(e.message) : 'Failed to clear memories.' };
    }
  }, []);

  type PostTradeReviewJob = {
    ledgerId: string;
    broker?: string;
    symbol: string;
    action?: string | null;
    entryPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    qty?: number | null;
    closePrice?: number | null;
    realizedPnl?: number | null;
    durationSec?: number | null;
    reason?: string | null;
    closedAtMs?: number | null;
    chartSnapshotDataUrl?: string | null;
    chartSnapshotPath?: string | null;
    chartSnapshotUrl?: string | null;
    chartSnapshotTitle?: string | null;
    chartSnapshotTimeframe?: string | null;
    chartSnapshotCapturedAtMs?: number | null;
    account?: any;
    force?: boolean;
  };

  const postTradeReviewQueueRef = useRef<PostTradeReviewJob[]>([]);
  const postTradeReviewQueuedKeysRef = useRef<Set<string>>(new Set());
  const postTradeReviewInFlightRef = useRef(false);

  const hasMemoryDedupeKey = useCallback((dedupeKey: string) => {
    const key = String(dedupeKey || '').trim();
    if (!key) return false;
    return (memoriesRef.current || []).some((m) => String(m?.meta?.dedupeKey || '') === key);
  }, []);

  const enqueuePostTradeReview = useCallback((job: PostTradeReviewJob) => {
    const ledgerId = String(job?.ledgerId || '').trim();
    if (!ledgerId) return;

    const dedupeKey = `review:${ledgerId}`;
    if (!job.force) {
      if (postTradeReviewQueuedKeysRef.current.has(dedupeKey)) return;
      if (hasMemoryDedupeKey(dedupeKey)) return;
    }

    postTradeReviewQueuedKeysRef.current.add(dedupeKey);
    postTradeReviewQueueRef.current.push({ ...job, ledgerId });

    // Kick the processor (best-effort, non-blocking)
    void (async () => {
      if (postTradeReviewInFlightRef.current) return;
      postTradeReviewInFlightRef.current = true;
      try {
        while (postTradeReviewQueueRef.current.length > 0) {
          const next = postTradeReviewQueueRef.current.shift();
          if (!next) continue;

          const enabled = !!postTradeReviewEnabledRef.current;
          const force = !!next.force;
          if (!enabled && !force) {
            postTradeReviewQueuedKeysRef.current.delete(`review:${next.ledgerId}`);
            continue;
          }

          const dedupe = `review:${next.ledgerId}`;
          if (!force && hasMemoryDedupeKey(dedupe)) {
            postTradeReviewQueuedKeysRef.current.delete(dedupe);
            continue;
          }

          const allAgents = agentsRef.current || [];
          const reviewerId = String(postTradeReviewAgentIdRef.current || '').trim();
          const reviewer =
            allAgents.find((a) => a?.id === reviewerId) ||
            allAgents.find((a) => String(a?.name || '').toLowerCase().includes('risk')) ||
            allAgents[0];

          const fmt = (value: any) => {
            const n = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(n)) return null;
            const abs = Math.abs(n);
            const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
            return n.toFixed(decimals).replace(/\.?0+$/, '');
          };

          const symbol = String(next.symbol || 'UNKNOWN').toUpperCase();
          const action = String(next.action || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
          const entry = fmt(next.entryPrice);
          const sl = fmt(next.stopLoss);
          const tp = fmt(next.takeProfit);
          const close = fmt(next.closePrice);
          const qty = next.qty != null && Number.isFinite(Number(next.qty)) ? String(Number(next.qty)) : null;
          const pnl = next.realizedPnl != null && Number.isFinite(Number(next.realizedPnl)) ? Number(next.realizedPnl) : 0;
          const dur = next.durationSec != null && Number.isFinite(Number(next.durationSec)) ? Math.round(Number(next.durationSec)) : null;
          const reason = next.reason != null ? String(next.reason).replace(/\s+/g, ' ').trim() : '';

          const rules = (memoriesRef.current || [])
            .filter((m) => {
              const meta: any = (m as any)?.meta;
              return !!(meta && typeof meta === 'object' && (meta.isRule || meta.rule === true || meta.pinned === true || meta.hardRule === true));
            })
            .slice(0, 12)
            .map((m) => `- ${String(m.text || '').trim()}`)
            .filter(Boolean)
            .join('\n');

          const sys = `You are ${reviewer?.name || 'Post-Trade Reviewer'}.\n${reviewer?.systemInstruction ? `ROLE: ${reviewer.systemInstruction}\n` : ''}
You write post-trade reviews and extract durable lessons.\n
NON-NEGOTIABLE RULES (hard constraints for future trades):
${rules || '- None.'}\n
OUTPUT FORMAT (plain text, no markdown):
REVIEW: 3-6 short lines max.
MEMORY: one line max 220 chars (a durable lesson to remember).
RULE_CANDIDATE: one line max 220 chars OR the word NONE.
MISTAKES: comma-separated list of tags from the allowed list or the word NONE.
ALLOWED_MISTAKES: ${formatMistakeTagsForPrompt()}
          Do not propose new trades. Do not output prices for a new setup.`.trim();

          const snapUrl = next.chartSnapshotUrl != null ? String(next.chartSnapshotUrl).trim() : '';
          const snapTf = next.chartSnapshotTimeframe != null ? String(next.chartSnapshotTimeframe).trim() : '';
          const snapTitle = next.chartSnapshotTitle != null ? String(next.chartSnapshotTitle).trim() : '';
          const hasSnap = !!(next.chartSnapshotDataUrl && String(next.chartSnapshotDataUrl).startsWith('data:'));

          const chartContextLine =
            snapUrl || snapTitle || hasSnap
              ? `Chart Snapshot: ${snapTitle ? snapTitle : snapUrl ? snapUrl : 'attached'}${snapTf ? ` (tf ${snapTf})` : ''}${snapUrl ? `\nChart URL: ${snapUrl}` : ''}`
              : '';

          const user = `POST-TRADE REVIEW REQUEST
Trade: ${action} ${symbol}${qty ? ` (qty ${qty})` : ''}
Entry: ${entry || '--'}  SL: ${sl || '--'}  TP: ${tp || '--'}
Close: ${close || '--'}  Realized P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
Duration: ${dur != null ? `${dur}s` : '--'}
Setup Reason: ${reason || '--'}
${chartContextLine ? `\n${chartContextLine}\n` : ''}

Write a concise review focused on process and rule adherence. If a chart snapshot is attached, use it to ground your critique (structure, invalidation, execution timing), but do not invent indicators you cannot see.`.trim();

          let outText = '';
          try {
            const attachment = hasSnap ? [{ dataUrl: String(next.chartSnapshotDataUrl), label: snapTf ? `Chart ${snapTf}` : 'Chart' }] : null;
            outText = await sendPlainTextToOpenAI({ system: sys, user, temperature: 0.2, maxOutputTokens: 500, imageAttachment: attachment });
          } catch (e: any) {
            outText = `REVIEW: Error generating review (${e?.message ? String(e.message) : 'unknown'}).\nMEMORY: Respect process and review manually.\nRULE_CANDIDATE: NONE`;
          }

          const lines = String(outText || '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);

          const pickLine = (prefix: string) => {
            const re = new RegExp(`^${prefix}\\s*:\\s*(.*)$`, 'i');
            const hit = lines.find((l) => re.test(l));
            if (!hit) return null;
            const m = hit.match(re);
            const v = m && m[1] != null ? String(m[1]).trim() : '';
            return v || null;
          };

          const memoryLine = pickLine('MEMORY') || null;
          const ruleCandidateRaw = pickLine('RULE_CANDIDATE') || null;
          const ruleCandidate = ruleCandidateRaw && ruleCandidateRaw.toUpperCase() !== 'NONE' ? ruleCandidateRaw : null;
          const mistakeLine = pickLine('MISTAKES') || null;
          const mistakeTags = mistakeLine && mistakeLine.toUpperCase() !== 'NONE'
            ? normalizeMistakeTags(mistakeLine)
            : [];

          const reviewLines = lines
            .filter((l) => !/^MEMORY\s*:/i.test(l))
            .filter((l) => !/^RULE_CANDIDATE\s*:/i.test(l))
            .filter((l) => !/^POST-TRADE/i.test(l));
          const reviewText = reviewLines.join('\n').trim();

          const messageId = `posttrade_review_${next.ledgerId}_${Date.now()}`;
          if (reviewText) {
            let imageForChat: string | undefined = undefined;
            const snapPath = next.chartSnapshotPath != null ? String(next.chartSnapshotPath).trim() : '';
            if (snapPath) {
              imageForChat = filePathToFileUrl(snapPath);
            } else if (hasSnap) {
              try {
                const saved = await persistImageDataUrlForChat({
                  dataUrl: String(next.chartSnapshotDataUrl),
                  subdir: 'review-snapshots',
                  prefix: `review_${symbol}`
                });
                if (saved?.ok && saved.src) imageForChat = String(saved.src);
              } catch {
                // ignore
              }
            }
            setMessages((prev) => [
              ...prev,
              {
                id: messageId,
                role: 'model',
                text: `[Post-Trade Review] ${reviewText}${ruleCandidate ? `\nRule candidate: ${ruleCandidate}` : ''}`,
                image: imageForChat,
                timestamp: new Date(),
                agentId: reviewer?.id || 'agent-3',
                agentName: reviewer?.name || 'Post-Trade Reviewer',
                agentColor: reviewer?.color || 'bg-orange-600'
              }
            ]);
          }

          const createdAtMs = Date.now();
          const memoryId = `mem_review_${next.ledgerId}`;
          const finalMemoryText = (memoryLine || reviewText.split('\n')[0] || '').trim();
          if (finalMemoryText) {
            const type: Memory['type'] = pnl >= 0 ? 'WIN' : 'LOSS';
            const meta: Record<string, any> = {
              broker: next.broker || 'tradelocker',
              ledgerId: next.ledgerId,
              symbol,
              action,
              entryPrice: next.entryPrice ?? null,
              stopLoss: next.stopLoss ?? null,
              takeProfit: next.takeProfit ?? null,
              closePrice: next.closePrice ?? null,
              qty: next.qty ?? null,
              realizedPnl: pnl,
              durationSec: dur,
              reason,
              mistakeTags,
              ruleCandidate: ruleCandidate || undefined,
              reviewerAgentId: reviewer?.id || undefined,
              reviewerAgentName: reviewer?.name || undefined,
              chartSnapshotPath: next.chartSnapshotPath || undefined,
              chartSnapshotUrl: snapUrl || undefined,
              chartSnapshotTitle: snapTitle || undefined,
              chartSnapshotTimeframe: snapTf || undefined,
              chartSnapshotCapturedAtMs: next.chartSnapshotCapturedAtMs || undefined,
              isReview: true,
              dedupeKey: dedupe
            };

            const existing = (memoriesRef.current || []).find((m) => m?.id === memoryId || String(m?.meta?.dedupeKey || '') === dedupe) || null;
            if (existing && force) {
              try {
                await updateMemory(existing.id, { text: finalMemoryText, type, meta: { ...(existing.meta || {}), ...meta, regeneratedAtMs: createdAtMs } });
              } catch {
                // ignore; best-effort
              }
            } else if (!existing) {
              const newMemory: Memory = {
                id: memoryId,
                type,
                text: finalMemoryText,
                timestamp: new Date(createdAtMs),
                meta
              };

              setMemories((prev) => {
                const nextList = [newMemory, ...prev.filter((m) => m.id !== newMemory.id)];
                return nextList.slice(0, MAX_MEMORIES_IN_STATE);
              });

              try {
                const ledger = (window as any)?.glass?.tradeLedger;
                if (ledger?.addMemory) {
                  await ledger.addMemory({ id: memoryId, type, text: finalMemoryText, createdAtMs, meta });
                } else {
                  persistMemoriesLocal([newMemory, ...(memoriesRef.current || [])]);
                }
              } catch {
                // ignore persistence errors
              }
            }

            try {
              const ledger = (window as any)?.glass?.tradeLedger;
              if (ledger?.update) {
                await ledger.update({
                  id: next.ledgerId,
                  patch: {
                    postTradeReviewRecordedAtMs: createdAtMs,
                    postTradeReviewAgentId: reviewer?.id || null,
                    postTradeReviewMemoryId: memoryId,
                    postTradeReviewRuleCandidate: ruleCandidate || null,
                    postTradeReviewMistakeTags: mistakeTags,
                    postTradeReviewText: reviewText || null,
                    postTradeReviewSnapshotPath: next.chartSnapshotPath || null,
                    postTradeReviewSnapshotUrl: snapUrl || null,
                    postTradeReviewSnapshotTimeframe: snapTf || null,
                    postTradeReviewSnapshotCapturedAtMs: next.chartSnapshotCapturedAtMs || null
                  }
                });
              }
            } catch {
              // ignore ledger patch failures
            }

            try {
              if (reviewText) {
                const snapshotForNote = next.chartSnapshotPath
                  ? filePathToFileUrl(String(next.chartSnapshotPath))
                  : (next.chartSnapshotDataUrl ? String(next.chartSnapshotDataUrl) : '');
                const tradeLink = {
                  ledgerId: next.ledgerId,
                  broker: next.broker || 'tradelocker',
                  symbol,
                  action,
                  entryPrice: next.entryPrice ?? null,
                  closePrice: next.closePrice ?? null,
                  stopLoss: next.stopLoss ?? null,
                  takeProfit: next.takeProfit ?? null,
                  qty: next.qty ?? null,
                  realizedPnl: pnl,
                  closedAtMs: next.closedAtMs ?? null
                };
                const note = buildPostTradeReviewNote({
                  ledgerId: next.ledgerId,
                  symbol,
                  action,
                  entry: entry || null,
                  stop: sl || null,
                  takeProfit: tp || null,
                  close: close || null,
                  pnl: Number.isFinite(pnl) ? pnl.toFixed(2) : null,
                  timeframe: snapTf || null,
                  reviewText,
                  lesson: memoryLine || ruleCandidate || reviewText.split('\n')[0] || '',
                  tags: mistakeTags,
                  snapshotUrl: snapshotForNote || null,
                  chartUrl: snapUrl || null,
                  snapshotTitle: snapTitle || null,
                  snapshotTimeframe: snapTf || null,
                  snapshotCapturedAtMs: next.chartSnapshotCapturedAtMs || null,
                  tradeLink
                });
                appendNoteToStorage(note);
              }
            } catch {
              // ignore note failures
            }
          }

          postTradeReviewQueuedKeysRef.current.delete(dedupe);
          // Small delay to avoid burst rate limits.
          await new Promise((r) => setTimeout(r, 250));
        }
      } finally {
        postTradeReviewInFlightRef.current = false;
      }
    })();
  }, [hasMemoryDedupeKey, persistMemoriesLocal, updateMemory]);

  const reviewLastClosedTrade = useCallback(async (opts?: { force?: boolean }) => {
    try {
      const ledger = (window as any)?.glass?.tradeLedger;
      if (!ledger?.list) return { ok: false as const, error: 'Trade ledger not available.' };
      const res = await ledger.list({ limit: 250 });
      if (!res?.ok || !Array.isArray(res.entries)) return { ok: false as const, error: res?.error ? String(res.error) : 'Failed to load ledger.' };

      const isClosed = (e: any) => {
        const status = String(e?.status || '').toUpperCase();
        const posStatus = String(e?.positionStatus || '').toUpperCase();
        const closedAt = Number(e?.positionClosedAtMs || 0);
        return status === 'CLOSED' || posStatus === 'CLOSED' || closedAt > 0;
      };

      const closed = (res.entries as any[])
        .filter((e) => e?.broker === 'tradelocker' && isClosed(e) && e?.id)
        .sort((a, b) => {
          const aAt = Number(a?.positionClosedAtMs || 0) || Number(a?.updatedAtMs || 0) || Number(a?.createdAtMs || 0);
          const bAt = Number(b?.positionClosedAtMs || 0) || Number(b?.updatedAtMs || 0) || Number(b?.createdAtMs || 0);
          return bAt - aAt;
        });

      const entry = closed[0];
      if (!entry) return { ok: false as const, error: 'No closed TradeLocker trades found yet.' };

      const existingReview = entry?.postTradeReviewText ? String(entry.postTradeReviewText).trim() : '';
      if (existingReview && !opts?.force) {
        const allAgents = agentsRef.current || [];
        const reviewerId = String(postTradeReviewAgentIdRef.current || '').trim();
        const reviewer =
          allAgents.find((a) => a?.id === reviewerId) ||
          allAgents.find((a) => String(a?.name || '').toLowerCase().includes('risk')) ||
          allAgents[0];

        setMessages((prev) => [
          ...prev,
          {
            id: `posttrade_review_replay_${String(entry.id)}_${Date.now()}`,
            role: 'model',
            text: `[Post-Trade Review] ${existingReview}`,
            timestamp: new Date(),
            agentId: reviewer?.id || 'agent-3',
            agentName: reviewer?.name || 'Post-Trade Reviewer',
            agentColor: reviewer?.color || 'bg-orange-600'
          }
        ]);
        return { ok: true as const, replayed: true as const };
      }

      const pnl =
        Number.isFinite(Number(entry?.realizedPnl)) ? Number(entry.realizedPnl)
        : Number.isFinite(Number(entry?.positionClosedPnl)) ? Number(entry.positionClosedPnl)
        : Number.isFinite(Number(entry?.positionClosedPnlEstimate)) ? Number(entry.positionClosedPnlEstimate)
        : 0;

      enqueuePostTradeReview({
        ledgerId: String(entry.id),
        broker: 'tradelocker',
        symbol: String(entry?.symbol || 'UNKNOWN'),
        action: entry?.action ? String(entry.action) : null,
        entryPrice: entry?.brokerEntryPrice != null ? Number(entry.brokerEntryPrice) : (entry?.entryPrice != null ? Number(entry.entryPrice) : null),
        stopLoss: entry?.stopLoss != null ? Number(entry.stopLoss) : null,
        takeProfit: entry?.takeProfit != null ? Number(entry.takeProfit) : null,
        qty: entry?.qtyNormalized != null ? Number(entry.qtyNormalized) : (entry?.brokerQty != null ? Number(entry.brokerQty) : (entry?.qty != null ? Number(entry.qty) : null)),
        closePrice: entry?.brokerClosePrice != null ? Number(entry.brokerClosePrice) : (entry?.closePrice != null ? Number(entry.closePrice) : null),
        realizedPnl: pnl,
        durationSec: entry?.durationSec != null ? Number(entry.durationSec) : null,
        reason: entry?.reason != null ? String(entry.reason) : null,
        closedAtMs: entry?.positionClosedAtMs != null ? Number(entry.positionClosedAtMs) : null,
        account: entry?.account || null,
        force: true
      });

      return { ok: true as const, queued: true as const };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ? String(e.message) : 'Failed to enqueue review.' };
    }
  }, [enqueuePostTradeReview]);


  // --- Live Actions ---
  
  const startLiveSession = useCallback(async (type: 'camera' | 'screen' | 'audio') => {
    try {
      const currentAgent = agents.find(a => a.id === activeAgentId) || agents[0];
      setLiveMode(type);
      
      let stream: MediaStream;
      if (type === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: { 
                // @ts-ignore
                preferCurrentTab: true 
            }, 
            audio: true 
        });
      } else if (type === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      setLiveStream(stream);
      setIsLive(true);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 }); 
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });

      inputAudioContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      
      const source = inputCtx.createMediaStreamSource(stream);
      const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (e) => {
         if (!activeSessionRef.current) return;
         const inputData = e.inputBuffer.getChannelData(0);
         const l = inputData.length;
         const int16 = new Int16Array(l);
         for (let i = 0; i < l; i++) {
            int16[i] = inputData[i] * 32768;
         }
         const b64Data = encodeAudio(new Uint8Array(int16.buffer));
         activeSessionRef.current.sendRealtimeInput({
            media: { mimeType: 'audio/pcm;rate=16000', data: b64Data }
         });
      };
      
      source.connect(scriptProcessor);
      scriptProcessor.connect(inputCtx.destination);

      const session = await connectToOpenAILive(currentAgent, agents, {
        onOpen: () => console.log("Live Session Connected"),
        onMessage: async (evt: any) => {
             const parseArgs = (value: any) => {
                if (!value) return {};
                if (typeof value === 'object') return value;
                try { return JSON.parse(value); } catch { return {}; }
             };

             // Audio Output Handling (OpenAI Realtime)
             const audioData = evt?.delta || evt?.audio || evt?.chunk;
             const audioType = evt?.type || '';
             if ((audioType === 'response.audio.delta' || audioType === 'response.output_audio.delta') && audioData && audioContextRef.current) {
                 const ctx = audioContextRef.current;
                 const decoded = decodeAudio(audioData);
                 const audioBuffer = await decodeAudioData(decoded, ctx, 24000, 1);
                 const sourceNode = ctx.createBufferSource();
                 sourceNode.buffer = audioBuffer;
                 sourceNode.connect(ctx.destination);
                 const currentTime = ctx.currentTime;
                 const startTime = Math.max(currentTime, nextStartTimeRef.current);
                 sourceNode.start(startTime);
                 nextStartTimeRef.current = startTime + audioBuffer.duration;
                 sourcesRef.current.add(sourceNode);
                 sourceNode.onended = () => sourcesRef.current.delete(sourceNode);
             }
             
             if (audioType === 'response.interrupted' || audioType === 'response.cancelled') {
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
             }

             // Tool Handling (Voice) — OpenAI function calls
             if (audioType === 'response.function_call_arguments.delta') {
                const id = evt.call_id || evt.id;
                if (!id) return;
                const existing = liveFunctionArgsRef.current[id] || { name: evt.name, args: '' };
                existing.name = evt.name || existing.name;
                existing.args += evt.delta || '';
                liveFunctionArgsRef.current[id] = existing;
                return;
             }

              const handleFunctionCall = async (name: string, id: string, argsValue: any) => {
                 let toolResult = "Function executed.";
                 const caps = getAgentCaps(currentAgent);
                 const pushBlockedMessage = (text: string) => {
                   const msg: Message = {
                     id: Date.now().toString(),
                     role: 'system',
                     text: `[Voice Command]: ${text}`,
                     timestamp: new Date(),
                     agentId: currentAgent.id,
                     agentName: currentAgent.name,
                     agentColor: currentAgent.color
                   };
                   setMessages(prev => [...prev, msg]);
                 };
                 const normalizeToolString = (value: any) => {
                   const raw = String(value || '').trim();
                   return raw || undefined;
                 };
                 const normalizeToolNumber = (value: any) => {
                   const num = Number(value);
                   return Number.isFinite(num) ? num : undefined;
                 };
                 const normalizeToolStringList = (value: any) => {
                   if (Array.isArray(value)) {
                     const cleaned = value.map((item) => String(item ?? '').trim()).filter(Boolean);
                     return cleaned.length > 0 ? cleaned : undefined;
                   }
                   const raw = String(value || '').trim();
                   if (!raw) return undefined;
                   const cleaned = raw.split(',').map((part) => part.trim()).filter(Boolean);
                   return cleaned.length > 0 ? cleaned : undefined;
                 };
                 const normalizeToolBoolean = (value: any) => {
                   if (typeof value === 'boolean') return value;
                   const raw = String(value ?? '').trim().toLowerCase();
                   if (!raw) return undefined;
                   if (['true', '1', 'yes', 'y'].includes(raw)) return true;
                   if (['false', '0', 'no', 'n'].includes(raw)) return false;
                   return undefined;
                 };
                 const normalizeToolMode = (value: any) => {
                   const raw = String(value || '').trim().toLowerCase();
                   if (!raw) return undefined;
                   if (raw === 'suggest' || raw === 'paper' || raw === 'live') return raw;
                   return undefined;
                 };
                 const normalizeToolRegime = (value: any) => {
                   const raw = String(value || '').trim().toLowerCase();
                   if (!raw) return undefined;
                   if (raw === 'trend' || raw === 'range' || raw === 'breakout') return raw;
                   if (raw.includes('any') || raw.includes('all') || raw.includes('none')) return 'any';
                   return undefined;
                 };
                 const normalizeToolTier = (value: any) => {
                   const raw = String(value || '').trim().toUpperCase();
                   if (['S', 'A', 'B', 'C', 'D'].includes(raw)) return raw;
                   return undefined;
                 };
                 const normalizeToolWinRateTier = (value: any) => {
                   const raw = String(value || '').trim().toUpperCase();
                   if (['WR70', 'WR60', 'WR50', 'WR40', 'WR30'].includes(raw)) return raw;
                   return undefined;
                 };
                 if (name === 'proposeTrade') {
                         if (!caps.trade) {
                           pushBlockedMessage('Trade proposal blocked by agent capability.');
                           toolResult = "Trade proposal blocked.";
                           return;
                         }
                         const args = parseArgs(argsValue) as any;
                         const risk = Math.abs(args.entryPrice - args.stopLoss);
                         const reward = Math.abs(args.takeProfit - args.entryPrice);
                         const rr = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
                         
                         let proposal: TradeProposal = {
                             symbol: args.symbol,
                             action: args.action.toUpperCase(),
                             entryPrice: args.entryPrice,
                             stopLoss: args.stopLoss,
                             takeProfit: args.takeProfit,
                             riskRewardRatio: rr,
                             status: 'PENDING',
                             agentId: currentAgent.id,
                             reason: args.reason || "Voice commanded trade"
                         };

                         const autoShouldExecute =
                           !!autoPilotConfigRef.current?.enabled &&
                           !autoPilotConfigRef.current?.requireConfirmation &&
                           !autoPilotConfigRef.current?.killSwitch &&
                           !!onExecuteTrade;
 
                         const tradeMsg: Message = {
                             id: Date.now().toString(),
                             role: 'model',
                             text: `[Voice Command]: I've identified a setup on ${args.symbol}.`,
                             timestamp: new Date(),
                             agentId: currentAgent.id,
                             agentName: currentAgent.name,
                             agentColor: currentAgent.color,
                             tradeProposal: proposal
                         };
                         setMessages(prev => [...prev, tradeMsg]);

                         if (autoShouldExecute) {
                           maybeAutoExecuteProposal(tradeMsg.id, proposal);
                         }

                         toolResult = autoShouldExecute ? "Trade sent to AutoPilot." : "Trade ticket created.";

                     } else if (name === 'updateRiskSettings') {
                        // Handle Risk Update from Voice
                        const args = parseArgs(argsValue) as any;
                        setAutoPilotConfig(prev => applyAutoPilotUpdate(prev, args));
                        
                        const updateMsg: Message = {
                             id: Date.now().toString(),
                             role: 'system',
                             text: `AutoPilot Configuration updated via Voice.`,
                             timestamp: new Date()
                        };
                        setMessages(prev => [...prev, updateMsg]);
                        toolResult = "Risk settings updated.";
                     } else if (name === 'refreshBrokerSnapshot') {
                        if (!caps.broker) {
                          pushBlockedMessage('Broker action blocked by agent capability.');
                          toolResult = "Broker action blocked.";
                          return;
                        }
                        const args = parseArgs(argsValue) as any;
                        const action: BrokerAction = {
                          type: 'REFRESH_BROKER',
                          status: 'PENDING',
                          scope: args.scope || 'all',
                          reason: args.reason,
                          agentId: currentAgent.id
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Refresh broker snapshot requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          brokerAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeBrokerAction(msg.id, action);
                        toolResult = "Broker snapshot refresh requested.";
                     } else if (name === 'closePosition') {
                        if (!caps.broker) {
                          pushBlockedMessage('Broker action blocked by agent capability.');
                          toolResult = "Broker action blocked.";
                          return;
                        }
                        const args = parseArgs(argsValue) as any;
                        const action: BrokerAction = {
                          type: 'CLOSE_POSITION',
                          status: 'PENDING',
                          positionId: args.positionId,
                          qty: args.qty,
                          symbol: args.symbol,
                          reason: args.reason,
                          agentId: currentAgent.id
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Request to close position ${args.positionId}.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          brokerAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        toolResult = "Close position request created.";
                     } else if (name === 'cancelOrder') {
                        if (!caps.broker) {
                          pushBlockedMessage('Broker action blocked by agent capability.');
                          toolResult = "Broker action blocked.";
                          return;
                        }
                        const args = parseArgs(argsValue) as any;
                        const action: BrokerAction = {
                          type: 'CANCEL_ORDER',
                          status: 'PENDING',
                          orderId: args.orderId,
                          symbol: args.symbol,
                          reason: args.reason,
                          agentId: currentAgent.id
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Request to cancel order ${args.orderId}.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          brokerAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        toolResult = "Cancel order request created.";
                     } else if (name === 'modifyPosition') {
                        if (!caps.broker) {
                          pushBlockedMessage('Broker action blocked by agent capability.');
                          toolResult = "Broker action blocked.";
                          return;
                        }
                        const args = parseArgs(argsValue) as any;
                        const action: BrokerAction = {
                          type: 'MODIFY_POSITION',
                          status: 'PENDING',
                          positionId: args.positionId,
                          symbol: args.symbol,
                          stopLoss: args.stopLoss,
                          takeProfit: args.takeProfit,
                          trailingOffset: args.trailingOffset,
                          clearStopLoss: args.clearStopLoss,
                          clearTakeProfit: args.clearTakeProfit,
                          reason: args.reason,
                          agentId: currentAgent.id
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Request to modify position ${args.positionId}.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          brokerAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        toolResult = "Modify position request created.";
                     } else if (name === 'modifyOrder') {
                        if (!caps.broker) {
                          pushBlockedMessage('Broker action blocked by agent capability.');
                          toolResult = "Broker action blocked.";
                          return;
                        }
                        const args = parseArgs(argsValue) as any;
                        const action: BrokerAction = {
                          type: 'MODIFY_ORDER',
                          status: 'PENDING',
                          orderId: args.orderId,
                          symbol: args.symbol,
                          price: args.price,
                          qty: args.qty,
                          stopLoss: args.stopLoss,
                          takeProfit: args.takeProfit,
                          clearStopLoss: args.clearStopLoss,
                          clearTakeProfit: args.clearTakeProfit,
                          reason: args.reason,
                          agentId: currentAgent.id
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Request to modify order ${args.orderId}.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          brokerAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        toolResult = "Modify order request created.";
                     } else if (name === 'getSystemState') {
                        const args = parseArgs(argsValue) as any;
                        const detailRaw = normalizeToolString(args.detail);
                        const detail = detailRaw === 'full' ? 'full' : detailRaw === 'summary' ? 'summary' : undefined;
                        const action: AgentToolAction = {
                          type: 'GET_SYSTEM_STATE',
                          status: 'PENDING',
                          detail,
                          maxItems: normalizeToolNumber(args.maxItems),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: System state snapshot requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "System state snapshot requested.";
                     } else if (name === 'run_action_catalog') {
                        if (!caps.tools) {
                          pushBlockedMessage('Action catalog blocked by agent capability.');
                          toolResult = "Action catalog blocked.";
                          return;
                        }
                        const args = parseArgs(argsValue) as any;
                        const routerModule = await loadChatToolCallRouterModule();
                        const buildRes = routerModule.buildRunActionCatalogToolAction({
                          args,
                          parseArgs,
                          agentId: currentAgent.id
                        });
                        if (!buildRes.action) {
                          toolResult = buildRes.error || "Action catalog request missing actionId.";
                          return;
                        }
                          const action: AgentToolAction = buildRes.action;
                          const finalAction = ensureToolActionSource(action) || action;

                          const msg: Message = {
                            id: Date.now().toString(),
                            role: 'model',
                            text: `[Voice Command]: Action catalog request queued.`,
                            timestamp: new Date(),
                            agentId: currentAgent.id,
                            agentName: currentAgent.name,
                            agentColor: currentAgent.color,
                            agentToolAction: finalAction
                          };
                          setMessages(prev => [...prev, msg]);
                          executeAgentTool(msg.id, finalAction);
                        toolResult = "Action queued via task tree.";
                     } else if (name === 'getNativeChartSnapshot') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_NATIVE_CHART_SNAPSHOT',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Native chart snapshot requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Native chart snapshot requested.";
                     } else if (name === 'getBacktestSummary') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_BACKTEST_SUMMARY',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Backtest summary requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Backtest summary requested.";
                     } else if (name === 'getBacktestTrainingPack') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_BACKTEST_TRAINING_PACK',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          maxEpisodes: normalizeToolNumber(args.maxEpisodes),
                          offset: normalizeToolNumber(args.offset),
                          limit: normalizeToolNumber(args.limit),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Backtest training pack requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Backtest training pack requested.";
                      } else if (name === 'run_backtest_optimization') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'RUN_BACKTEST_OPTIMIZATION',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          symbols: normalizeToolStringList(args.symbols),
                          timeframe: normalizeToolString(args.timeframe),
                          timeframes: normalizeToolStringList(args.timeframes),
                          strategy: normalizeToolString(args.strategy),
                          strategyDescription: normalizeToolString(args.strategyDescription),
                          rangeDays: normalizeToolNumber(args.rangeDays),
                          maxCombos: normalizeToolNumber(args.maxCombos),
                          timeFilter: args.timeFilter && typeof args.timeFilter === 'object' ? args.timeFilter : undefined,
                          params: args.params && typeof args.params === 'object' ? args.params : undefined,
                          paramGrid: args.paramGrid && typeof args.paramGrid === 'object' ? args.paramGrid : undefined,
                          presetKey: normalizeToolString(args.presetKey),
                          usePreset: typeof args.usePreset === 'boolean' ? args.usePreset : undefined,
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Backtest optimization requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Backtest optimization requested.";
                      } else if (name === 'start_backtest_optimizer') {
                        const args = parseArgs(argsValue) as any;
                        const reason = normalizeToolString(args.reason);
                        const wantsChain = reason
                          ? /second pass|second-pass|2nd pass|second round|round 2|round two|refine|refinement/i.test(reason)
                          : false;
                        const action: AgentToolAction = wantsChain
                          ? {
                              type: 'RUN_BACKTEST_OPTIMIZATION_CHAIN',
                              status: 'PENDING',
                              baselineRunId: normalizeToolString(args.baselineRunId),
                              symbol: normalizeToolString(args.symbol),
                              timeframe: normalizeToolString(args.timeframe),
                              strategy: normalizeToolString(args.strategy),
                              strategyDescription: normalizeToolString(args.strategyDescription),
                              rangeDays: normalizeToolNumber(args.rangeDays),
                              maxCombos: normalizeToolNumber(args.maxCombos),
                              params: args.params && typeof args.params === 'object' ? args.params : undefined,
                              paramGrid: args.paramGrid && typeof args.paramGrid === 'object' ? args.paramGrid : undefined,
                              searchSpacePreset: normalizeToolString(args.searchSpacePreset),
                              objectivePreset: normalizeToolString(args.objectivePreset),
                              objective: args.objective && typeof args.objective === 'object' ? args.objective : undefined,
                              validation: args.validation && typeof args.validation === 'object' ? args.validation : undefined,
                              rounds: 2,
                              hypothesis: normalizeToolString(args.hypothesis),
                              reason
                            }
                          : {
                              type: 'START_BACKTEST_OPTIMIZER',
                              status: 'PENDING',
                              baselineRunId: normalizeToolString(args.baselineRunId),
                              symbol: normalizeToolString(args.symbol),
                              timeframe: normalizeToolString(args.timeframe),
                              strategy: normalizeToolString(args.strategy),
                              strategyDescription: normalizeToolString(args.strategyDescription),
                              rangeDays: normalizeToolNumber(args.rangeDays),
                              maxCombos: normalizeToolNumber(args.maxCombos),
                              params: args.params && typeof args.params === 'object' ? args.params : undefined,
                              paramGrid: args.paramGrid && typeof args.paramGrid === 'object' ? args.paramGrid : undefined,
                              searchSpacePreset: normalizeToolString(args.searchSpacePreset),
                              objectivePreset: normalizeToolString(args.objectivePreset),
                              objective: args.objective && typeof args.objective === 'object' ? args.objective : undefined,
                              validation: args.validation && typeof args.validation === 'object' ? args.validation : undefined,
                              budget: normalizeToolNumber(args.budget),
                              parallelism: normalizeToolNumber(args.parallelism),
                              reason
                            };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: wantsChain
                            ? `[Voice Command]: Optimization chain requested.`
                            : `[Voice Command]: Backtest optimizer requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = wantsChain
                          ? "Optimization chain requested."
                          : "Backtest optimizer requested.";
                      } else if (name === 'get_backtest_optimizer_status') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_BACKTEST_OPTIMIZER_STATUS',
                          status: 'PENDING',
                          sessionId: normalizeToolString(args.sessionId),
                          baselineRunId: normalizeToolString(args.baselineRunId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Optimizer status requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Backtest optimizer status requested.";
                      } else if (name === 'get_backtest_optimizer_results') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_BACKTEST_OPTIMIZER_RESULTS',
                          status: 'PENDING',
                          sessionId: normalizeToolString(args.sessionId),
                          baselineRunId: normalizeToolString(args.baselineRunId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Optimizer results requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Backtest optimizer results requested.";
                      } else if (name === 'propose_backtest_optimization_refinement') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'PROPOSE_BACKTEST_OPTIMIZATION_REFINEMENT',
                          status: 'PENDING',
                          sessionId: normalizeToolString(args.sessionId),
                          baselineRunId: normalizeToolString(args.baselineRunId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Optimization refinement requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Optimization refinement requested.";
                      } else if (name === 'run_backtest_optimization_chain') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'RUN_BACKTEST_OPTIMIZATION_CHAIN',
                          status: 'PENDING',
                          baselineRunId: normalizeToolString(args.baselineRunId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          strategy: normalizeToolString(args.strategy),
                          strategyDescription: normalizeToolString(args.strategyDescription),
                          rangeDays: normalizeToolNumber(args.rangeDays),
                          maxCombos: normalizeToolNumber(args.maxCombos),
                          params: args.params && typeof args.params === 'object' ? args.params : undefined,
                          paramGrid: args.paramGrid && typeof args.paramGrid === 'object' ? args.paramGrid : undefined,
                          searchSpacePreset: normalizeToolString(args.searchSpacePreset),
                          objectivePreset: normalizeToolString(args.objectivePreset),
                          objective: args.objective && typeof args.objective === 'object' ? args.objective : undefined,
                          validation: args.validation && typeof args.validation === 'object' ? args.validation : undefined,
                          rounds: normalizeToolNumber(args.rounds),
                          hypothesis: normalizeToolString(args.hypothesis),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Optimization chain requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Optimization chain requested.";
                      } else if (name === 'start_research_autopilot') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'START_RESEARCH_AUTOPILOT',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          strategy: normalizeToolString(args.strategy),
                          strategyDescription: normalizeToolString(args.strategyDescription),
                          rangeDays: normalizeToolNumber(args.rangeDays),
                          maxCombos: normalizeToolNumber(args.maxCombos),
                          maxExperiments: normalizeToolNumber(args.maxExperiments),
                          maxRuntimeSec: normalizeToolNumber(args.maxRuntimeSec),
                          plateauLimit: normalizeToolNumber(args.plateauLimit),
                          params: args.params && typeof args.params === 'object' ? args.params : undefined,
                          paramGrid: args.paramGrid && typeof args.paramGrid === 'object' ? args.paramGrid : undefined,
                          searchSpacePreset: normalizeToolString(args.searchSpacePreset),
                          objectivePreset: normalizeToolString(args.objectivePreset),
                          objective: args.objective && typeof args.objective === 'object' ? args.objective : undefined,
                          validation: args.validation && typeof args.validation === 'object' ? args.validation : undefined,
                          robustness: args.robustness && typeof args.robustness === 'object' ? args.robustness : undefined,
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Research autopilot started.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Research autopilot started.";
                      } else if (name === 'get_research_autopilot_status') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_RESEARCH_AUTOPILOT_STATUS',
                          status: 'PENDING',
                          sessionId: normalizeToolString(args.sessionId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Research autopilot status requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Research autopilot status requested.";
                      } else if (name === 'get_research_autopilot_results') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_RESEARCH_AUTOPILOT_RESULTS',
                          status: 'PENDING',
                          sessionId: normalizeToolString(args.sessionId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Research autopilot results requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Research autopilot results requested.";
                      } else if (name === 'stop_research_autopilot') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'STOP_RESEARCH_AUTOPILOT',
                          status: 'PENDING',
                          sessionId: normalizeToolString(args.sessionId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Research autopilot stopped.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Research autopilot stopped.";
                      } else if (name === 'getBrokerQuote') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_BROKER_QUOTE',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Broker quote requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Broker quote requested.";
                     } else if (name === 'getAgentMemory') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_AGENT_MEMORY',
                          status: 'PENDING',
                          memoryKey: normalizeToolString(args.key),
                          memoryId: normalizeToolString(args.id),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          kind: normalizeToolString(args.kind),
                          tags: normalizeToolStringList(args.tags),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Agent memory requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Agent memory requested.";
                     } else if (name === 'listAgentMemory') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'LIST_AGENT_MEMORY',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          kind: normalizeToolString(args.kind),
                          tags: normalizeToolStringList(args.tags),
                          limit: normalizeToolNumber(args.limit),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Agent memory list requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Agent memory list requested.";
                     } else if (name === 'listSetupWatchers') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'LIST_SETUP_WATCHERS',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          strategy: normalizeToolString(args.strategy),
                          mode: normalizeToolMode(args.mode),
                          enabled: normalizeToolBoolean(args.enabled),
                          limit: normalizeToolNumber(args.limit),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Setup watchers list requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup watcher list requested.";
                     } else if (name === 'createSetupWatcher') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'CREATE_SETUP_WATCHER',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                         strategy: normalizeToolString(args.strategy),
                         params: args.params && typeof args.params === 'object' ? args.params : undefined,
                          regime: normalizeToolRegime(args.regime),
                         mode: normalizeToolMode(args.mode),
                         enabled: normalizeToolBoolean(args.enabled),
                         reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Create setup watcher requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup watcher requested.";
                     } else if (name === 'updateSetupWatcher') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'UPDATE_SETUP_WATCHER',
                          status: 'PENDING',
                          watcherId: normalizeToolString(args.watcherId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                         strategy: normalizeToolString(args.strategy),
                         params: args.params && typeof args.params === 'object' ? args.params : undefined,
                          regime: normalizeToolRegime(args.regime),
                         mode: normalizeToolMode(args.mode),
                         enabled: normalizeToolBoolean(args.enabled),
                         reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Update setup watcher requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup watcher update requested.";
                     } else if (name === 'deleteSetupWatcher') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'DELETE_SETUP_WATCHER',
                          status: 'PENDING',
                          watcherId: normalizeToolString(args.watcherId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          strategy: normalizeToolString(args.strategy),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Delete setup watcher requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup watcher deletion requested.";
                     } else if (name === 'getSetupSignals') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'GET_SETUP_SIGNALS',
                          status: 'PENDING',
                          watcherId: normalizeToolString(args.watcherId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          strategy: normalizeToolString(args.strategy),
                          sinceMs: normalizeToolNumber(args.sinceMs),
                          limit: normalizeToolNumber(args.limit),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Setup signals requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup signals requested.";
                      } else if (name === 'explainSetupSignal') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'EXPLAIN_SETUP_SIGNAL',
                          status: 'PENDING',
                          profileId: normalizeToolString(args.profileId),
                          watcherId: normalizeToolString(args.watcherId),
                          signalId: normalizeToolString(args.signalId),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          includeSnapshot: normalizeToolBoolean(args.includeSnapshot),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Setup signal explanation requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup signal explanation requested.";
                     } else if (name === 'listSetupLibrary') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'LIST_SETUP_LIBRARY',
                          status: 'PENDING',
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                          strategy: normalizeToolString(args.strategy),
                          libraryTier: normalizeToolTier(args.tier),
                          winRateTier: normalizeToolWinRateTier(args.winRateTier),
                          limit: normalizeToolNumber(args.limit),
                          reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Setup library requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup library requested.";
                     } else if (name === 'createWatcherFromLibrary') {
                        const args = parseArgs(argsValue) as any;
                        const action: AgentToolAction = {
                          type: 'CREATE_WATCHER_FROM_LIBRARY',
                          status: 'PENDING',
                          libraryKey: normalizeToolString(args.key || args.libraryKey || args.configKey),
                          symbol: normalizeToolString(args.symbol),
                          timeframe: normalizeToolString(args.timeframe),
                         strategy: normalizeToolString(args.strategy),
                         libraryTier: normalizeToolTier(args.tier),
                         winRateTier: normalizeToolWinRateTier(args.winRateTier),
                          regime: normalizeToolRegime(args.regime),
                         mode: normalizeToolMode(args.mode),
                         enabled: normalizeToolBoolean(args.enabled),
                         reason: normalizeToolString(args.reason)
                        };

                        const msg: Message = {
                          id: Date.now().toString(),
                          role: 'model',
                          text: `[Voice Command]: Create watcher from setup library requested.`,
                          timestamp: new Date(),
                          agentId: currentAgent.id,
                          agentName: currentAgent.name,
                          agentColor: currentAgent.color,
                          agentToolAction: action
                        };
                        setMessages(prev => [...prev, msg]);
                        executeAgentTool(msg.id, action);
                        toolResult = "Setup library watcher requested.";
                     }

                activeSessionRef.current?.sendToolResponse({
                  functionResponses: { name, id, response: { result: toolResult } }
                });
             };

             if (audioType === 'response.function_call_arguments.done') {
                const id = evt.call_id || evt.id;
                const name = evt.name || liveFunctionArgsRef.current[id]?.name;
                const argsStr = evt.arguments || liveFunctionArgsRef.current[id]?.args;
                if (id && name) {
                  void handleFunctionCall(name, id, argsStr);
                  delete liveFunctionArgsRef.current[id];
                }
                return;
             }

             if (audioType === 'response.output_item.added' && evt.item?.type === 'function_call') {
                const id = evt.item.call_id || evt.item.id;
                const name = evt.item.name;
                const argsStr = evt.item.arguments;
                if (id && name) void handleFunctionCall(name, id, argsStr);
                return;
             }
        },
        onClose: () => stopLiveSession(),
        onError: () => stopLiveSession()
      });
      
      activeSessionRef.current = session;

    } catch (err) {
      console.error("Failed to start live session:", err);
      stopLiveSession();
    }
  }, [activeAgentId, agents, executeAgentTool, executeBrokerAction, getAgentCaps, maybeAutoExecuteProposal, onExecuteTrade]);

  const stopLiveSession = useCallback(() => {
    if (activeSessionRef.current) activeSessionRef.current = null;
    if (liveStream) {
        liveStream.getTracks().forEach(t => t.stop());
        setLiveStream(null);
    }
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (videoIntervalRef.current) window.clearInterval(videoIntervalRef.current);

    setIsLive(false);
    setLiveMode(null);
  }, [liveStream]);

  // Helper to push video frames
  const sendVideoFrame = useCallback((base64Data: string, mimeType: string = 'image/jpeg', text?: string, throttleKey: string = 'vision') => {
      const now = Date.now();
      // Throttle per source key to control cost/latency.
      const last = lastVideoFrameSentRef.current[throttleKey] || 0;
      if (now - last < 1000) return;

      const signature = `${mimeType}:${hashStringSampled(base64Data)}`;
      const lastSig = lastVideoFrameHashSentRef.current[throttleKey];
      if (lastSig && lastSig === signature) return;
      lastVideoFrameHashSentRef.current[throttleKey] = signature;
      lastVideoFrameSentRef.current[throttleKey] = now;

      if (activeSessionRef.current) {
          activeSessionRef.current.sendRealtimeInput({
              media: { mimeType, data: base64Data },
              text
          });
      }
  }, []);

  // --- TTS Actions ---
  const speakMessage = useCallback(async (messageId: string, text: string, agentName?: string) => {
    if (ttsSourceRef.current) {
        ttsSourceRef.current.stop();
        ttsSourceRef.current = null;
        setSpeakingMessageId(null);
        if (speakingMessageId === messageId) return;
    }
    const agent = agents.find(a => a.name === agentName);
    const voiceName = agent?.voice || 'Kore';
    setSpeakingMessageId(messageId);
    try {
        const audioBuffer = await synthesizeSpeech(text, voiceName);
        const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setSpeakingMessageId(null);
        source.start();
        ttsSourceRef.current = source;
    } catch (error) {
        console.error("Failed to speak message:", error);
        setSpeakingMessageId(null);
    }
  }, [agents, speakingMessageId]);


  // --- Standard Chat Actions ---

  const addAgent = useCallback(() => {
    setAgents(prev => {
      const usedColors = new Set(prev.map(a => a.color));
      const color =
        AGENT_COLORS.find(c => !usedColors.has(c)) ||
        AGENT_COLORS[prev.length % AGENT_COLORS.length] ||
        'bg-blue-600';

      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `agent-${crypto.randomUUID()}`
          : `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const newAgent: Agent = {
        id,
        name: `Agent ${prev.length + 1}`,
        color,
        type: 'openai',
        profile: 'trading',
        systemInstruction: 'You are a helpful trading assistant.',
        capabilities: { ...DEFAULT_AGENT_CAPABILITIES }
      };

      setActiveAgentId(newAgent.id);
      return [...prev, newAgent];
    });
  }, []);
  const updateAgent = useCallback((updatedAgent: Agent) => {
    const normalized = {
      ...updatedAgent,
      capabilities: normalizeAgentCapabilities(updatedAgent.capabilities)
    };
    setAgents(prev => prev.map(a => a.id === updatedAgent.id ? enforceTradingCapabilities(normalized, a) : a));
  }, []);
  const deleteAgent = useCallback((id: string) => {
      setAgents(prev => {
        if (prev.length <= 1) return prev;
        const next = prev.filter(a => a.id !== id);
        setActiveAgentId(current => (current === id ? next[0]?.id ?? current : current));
        return next;
      });
  }, []);
  const switchAgent = useCallback((id: string) => setActiveAgentId(id), []);
  const clearChat = useCallback(() => setMessages([]), []);

  const snoozeChartWatch = useCallback((durationMs: number) => {
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms <= 0) return;
    setChartWatchSnoozedUntilMs(Date.now() + Math.floor(ms));
  }, []);

  const clearChartWatchSnooze = useCallback(() => setChartWatchSnoozedUntilMs(0), []);

  const runChartWatchUpdate = useCallback(async (opts: {
    url: string;
    title?: string;
    imageDataUrl?: string;
    frames?: Array<{
      label?: string;
      timeframe?: string;
      url?: string;
      title?: string;
      imageDataUrl: string;
    }>;
    monitoredUrls?: string[];
    mode?: ChartWatchMode;
  }): Promise<{ rateLimitedUntilMs: number } | void> => {
    if (disableChartWatchRef.current) return;
    const url = String(opts?.url || "").trim();
    const title = opts?.title ? String(opts.title) : undefined;
    const imageDataUrl = opts?.imageDataUrl ? String(opts.imageDataUrl).trim() : "";
    const framesRaw = Array.isArray(opts?.frames) ? opts.frames : [];
    const monitoredUrls = Array.isArray(opts?.monitoredUrls) ? opts.monitoredUrls : [];

    const now = Date.now();
    const snoozeUntil = Number(chartWatchSnoozedUntilMsRef.current) || 0;
    if (snoozeUntil && now < snoozeUntil) return;

    const normalizeMode = (value: any): ChartWatchMode => {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'signals' || raw === 'digest' || raw === 'live') return raw as ChartWatchMode;
      return 'signals';
    };

    const mode: ChartWatchMode = normalizeMode(opts?.mode ?? chartWatchModeRef.current);

    const frames = framesRaw
      .map((f) => ({
        label: String(f?.label || f?.timeframe || "").trim(),
        timeframe: String(f?.timeframe || "").trim(),
        url: f?.url ? String(f.url).trim() : "",
        title: f?.title ? String(f.title).trim() : "",
        imageDataUrl: String(f?.imageDataUrl || "").trim()
      }))
      .filter((f) => !!f.imageDataUrl);

    if (!url) return;
    if (!imageDataUrl && frames.length === 0) return;
    if (chartWatchInFlightRef.current) return;
    chartWatchInFlightRef.current = true;

    const allAgents = agentsRef.current || [];
    if (allAgents.length === 0) {
      chartWatchInFlightRef.current = false;
      return;
    }

    const leadId = String(chartWatchLeadAgentIdRef.current || '').trim();
    const agent = allAgents.find((a) => a?.id === leadId) || allAgents[0];
    if (!agent) {
      chartWatchInFlightRef.current = false;
      return;
    }

    const assistantMessageId = `chartwatch_${now}_${Math.random().toString(16).slice(2)}`;

    if (mode === 'live') {
      const placeholder: Message = {
      id: assistantMessageId,
      role: "model",
      text: "[Chart Watch] …",
      timestamp: new Date(),
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      isStreaming: true
      };

      setMessages((prev) => [...prev, placeholder]);
    }

    let streamed = "";
    let flushTimer: number | null = null;

    const clearFlushTimer = () => {
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const scheduleFlush = () => {
      if (flushTimer != null) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, text: `[Chart Watch] ${streamed}` } : m))
        );
      }, 60);
    };

    try {
      const autoPilot = autoPilotConfigRef.current;
      const autoPilotStatus = formatAutoPilotStatus(autoPilot || ({} as AutoPilotConfig));

      const pageLabel = title ? `${title} (${url})` : url;
      const chartPackContext =
        frames.length > 0
          ? `CHART PACK SOURCES:\n${frames
              .map((f) => {
                const head = f.label ? `[${f.label}]` : "[Chart]";
                const suffix = f.url ? ` (${f.url})` : "";
                const t = f.title ? ` ${f.title}` : "";
                return `- ${head}${t}${suffix}`.trim();
              })
              .join("\n")}`
          : "";

      const tradingViewContext =
        frames.length > 0
          ? frames
              .map((f) => {
                if (!f.url) return "";
                const ctx = getTradingViewContext(f.url, f.title || undefined);
                if (!ctx) return "";
                const head = f.label ? `[${f.label}] ` : "";
                return `${head}${ctx.replace(/^TRADINGVIEW CONTEXT:\s*/i, "TRADINGVIEW CONTEXT: ")}`;
              })
              .filter(Boolean)
              .join("\n")
          : getTradingViewContext(url, title);
      const lastSummary = chartWatchLastSummaryByUrlRef.current[url] || "";

      const systemContext = appendExternalContext(`
        You are ${agent.name}.
        YOUR DEFINED ROLE/CONTEXT: ${agent.systemInstruction || "You are a helpful, general-purpose assistant."}

        CURRENT SESSION BIAS: ${sessionBiasRef.current || "No specific bias set."}
        CHART WATCH MODE: ${mode.toUpperCase()}.
        Chart: ${pageLabel}.
        ${chartPackContext}
        ${tradingViewContext}
        ${autoPilotStatus}
      `);

      const promptBuilders = await loadChatPromptBuildersModule();
      const prompt = promptBuilders.buildChartWatchPrompt(mode, lastSummary);

      const history = (messagesRef.current || []).slice(-24);
      // Signals mode can be noisy/costly; keep a per-tab cooldown.
      if (mode === 'signals') {
        const readSignalCooldownMs = () => {
          try {
            const raw = localStorage.getItem("glass_chart_watch_interval_ms");
            const ms = raw ? Number(raw) : NaN;
            if (Number.isFinite(ms)) return Math.min(600_000, Math.max(5_000, Math.floor(ms)));
          } catch { /* ignore */ }
          return 60_000;
        };

        const cooldownMs = readSignalCooldownMs();
        const lastSignalAt = Number(chartWatchLastSignalAtByUrlRef.current[url] || 0);
        if (lastSignalAt > 0 && now - lastSignalAt < cooldownMs) {
          return;
        }
      }

      const imageAttachmentArg =
        frames.length > 0
          ? frames.map((f) => ({
              dataUrl: f.imageDataUrl,
              label: f.label ? `[${f.label}]` : "[Chart]"
            }))
          : imageDataUrl;

      const { text: responseText, tradeProposal } = await sendMessageToOpenAI(
        history,
        prompt,
        systemContext,
        imageAttachmentArg as any,
        allAgents,
        memoriesRef.current || [],
        monitoredUrls,
        mode === 'live'
          ? {
              agent,
              onDelta: (delta) => {
                streamed += delta;
                scheduleFlush();
              }
            }
          : { agent }
      );

      chartWatchRateLimitStepRef.current = 0;
      clearFlushTimer();

      const trimmed = String(responseText || "").trim();
      const normalized = trimmed.replace(/\s+/g, " ").trim().toUpperCase();
      const isNoUpdate = !trimmed || normalized.startsWith("NO_UPDATE");

      if (mode === 'signals') {
        const hasProposal = !!tradeProposal;
        const finalProposal = tradeProposal ? { ...tradeProposal, agentId: agent.id } : null;
        const scoped = hasProposal
          ? applyAgentCapabilitiesToActions(agent, { tradeProposal: finalProposal })
          : { tradeProposal: finalProposal, blocked: [] as string[] };
        if (!hasProposal || isNoUpdate) return;

        chartWatchLastSignalAtByUrlRef.current[url] = now;
        chartWatchLastSummaryByUrlRef.current[url] = trimmed || lastSummary || "Signal";
        chartWatchLastUpdatedAtByUrlRef.current[url] = now;
        chartWatchLastTitleByUrlRef.current[url] = pageLabel;

        const textOut = trimmed && !isNoUpdate ? trimmed : `Signal detected on ${pageLabel}.`;
        const blockedLine = scoped.blocked.length > 0 ? `[Capability blocked: ${scoped.blocked.join(', ')}]` : '';
        const finalText = blockedLine ? `${textOut}\n${blockedLine}` : textOut;
        const msg: Message = {
          id: assistantMessageId,
          role: "model",
          text: `[Chart Watch] ${finalText}`,
          timestamp: new Date(),
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          tradeProposal: scoped.tradeProposal || undefined
        };
        setMessages((prev) => [...prev, msg]);
        if (scoped.tradeProposal) {
          maybeAutoExecuteProposal(assistantMessageId, scoped.tradeProposal);
        }
        return;
      }

      if (isNoUpdate) {
        if (mode === 'live') {
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        }
        return;
      }

      chartWatchLastSummaryByUrlRef.current[url] = trimmed;
      chartWatchLastUpdatedAtByUrlRef.current[url] = now;
      chartWatchLastTitleByUrlRef.current[url] = pageLabel;

      const hasProposal = !!tradeProposal;
      const finalProposal = tradeProposal ? { ...tradeProposal, agentId: agent.id } : null;
      const scoped = hasProposal
        ? applyAgentCapabilitiesToActions(agent, { tradeProposal: finalProposal })
        : { tradeProposal: finalProposal, blocked: [] as string[] };
      const blockedLine = scoped.blocked.length > 0 ? `[Capability blocked: ${scoped.blocked.join(', ')}]` : '';

      if (mode === 'digest') {
        const titles = chartWatchLastTitleByUrlRef.current || {};
        const summaries = chartWatchLastSummaryByUrlRef.current || {};
        const updatedAt = chartWatchLastUpdatedAtByUrlRef.current || {};
        const entries = Object.keys(summaries)
          .map((u) => ({ url: u, title: titles[u] || u, summary: summaries[u] || "", at: Number(updatedAt[u] || 0) }))
          .filter((e) => e.summary.trim())
          .sort((a, b) => (b.at || 0) - (a.at || 0))
          .slice(0, 3);

        const header = `[Chart Digest] Updated ${new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        const body = entries.map((e) => `${e.title}\n${e.summary}`).join("\n\n");
        const digestBase = `${header}\n\n${body}`.trim();
        const digestText = blockedLine ? `${digestBase}\n${blockedLine}` : digestBase;

        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === CHART_WATCH_DIGEST_MESSAGE_ID);
          const nextMsg: Message = {
            id: CHART_WATCH_DIGEST_MESSAGE_ID,
            role: "model",
            text: digestText,
            timestamp: new Date(),
            agentId: agent.id,
            agentName: agent.name,
            agentColor: agent.color,
            tradeProposal: scoped.tradeProposal || undefined
          };
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...nextMsg };
            return copy;
          }
          return [...prev, nextMsg];
        });

        if (scoped.tradeProposal) maybeAutoExecuteProposal(CHART_WATCH_DIGEST_MESSAGE_ID, scoped.tradeProposal);
        return;
      }

      // Live mode: update the placeholder message.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                text: `[Chart Watch] ${blockedLine ? `${trimmed}\n${blockedLine}` : trimmed}`,
                isStreaming: false,
                tradeProposal: scoped.tradeProposal || undefined
              }
            : m
        )
      );

      if (scoped.tradeProposal) {
        maybeAutoExecuteProposal(assistantMessageId, scoped.tradeProposal);
      }
    } catch (error) {
      clearFlushTimer();
      const raw = (error as any)?.message ? String((error as any).message) : String(error || "");
      const msg = raw.trim() ? raw.trim() : "Unknown error.";
      const short = msg.length > 400 ? `${msg.slice(0, 400)}.` : msg;
      agentRequestHandlerRef.current?.({
        phase: 'error',
        correlationId,
        meta: { ...requestMeta, agentId: currentAgent.id, mode: replyMode },
        error: short
      });

      const status =
        Number((error as any)?.status) ||
        Number((error as any)?.response?.status) ||
        Number((error as any)?.cause?.status) ||
        0;
      const lower = msg.toLowerCase();
      const isRateLimited =
        status === 429 ||
        lower.includes(" 429") ||
        lower.includes("429 ") ||
        lower.includes("too many requests") ||
        lower.includes("rate limit");

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, text: `[Chart Watch] Error: ${short}`, isError: true, isStreaming: false }
            : m
        )
      );

      if (isRateLimited) {
        const prevStep = Number(chartWatchRateLimitStepRef.current) || 0;
        const step = Math.min(6, prevStep + 1);
        chartWatchRateLimitStepRef.current = step;
        const backoffMs = Math.min(10 * 60_000, 60_000 * Math.pow(2, step - 1));
        return { rateLimitedUntilMs: Date.now() + backoffMs };
      }
    } finally {
      clearFlushTimer();
      chartWatchInFlightRef.current = false;
    }
  }, [appendExternalContext, applyAgentCapabilitiesToActions, formatAutoPilotStatus, maybeAutoExecuteProposal]);

  const sendMessage = useCallback(async (
    text: string,
    context: {
      url: string;
      title?: string;
      captureScreenshot?: () => Promise<string | null>;
      captureScreenshots?: () => Promise<Array<{ dataUrl?: string; label?: string; meta?: any }> | null>;
    },
    monitoredUrls: string[],
    imageAttachment?: string | Array<{ dataUrl?: string; label?: string; meta?: any }> | null,
    meta?: { correlationId?: string; [key: string]: any }
  ) => {
    if ((!text.trim() && !imageAttachment) || isThinking) return;

    const currentAgent = agents.find(a => a.id === activeAgentId) || agents[0];
    const isImageCommand = text.trim().toLowerCase().startsWith('/image');
    const now = Date.now();
    const requestMeta = meta && typeof meta === 'object' ? meta : {};
    const correlationId = typeof requestMeta.correlationId === 'string' && requestMeta.correlationId.trim()
      ? requestMeta.correlationId
      : createCorrelationId(now);
    const assistantMessageId = (now + 1).toString();

    const imageAttachmentStr = typeof imageAttachment === 'string' ? imageAttachment.trim() : '';
    const imageAttachmentList = Array.isArray(imageAttachment) ? imageAttachment : null;
    let userImageForChat: string | undefined = undefined;
    if (imageAttachmentStr) {
      try {
        const saved = await persistImageDataUrlForChat({
          dataUrl: imageAttachmentStr,
          subdir: 'chat-images',
          prefix: 'chat_user'
        });
        userImageForChat = saved?.src ? String(saved.src) : imageAttachmentStr;
      } catch {
        userImageForChat = imageAttachmentStr;
      }
    }

    const userMessage: Message = {
      id: now.toString(),
      role: 'user',
      text,
      image: userImageForChat,
      timestamp: new Date(),
      correlationId
    };
    lastUserIntentRef.current = String(text || '').trim();

    const historySnapshot = messages;

    if (!isImageCommand) {
      const workflowModule = await loadChatWorkflowIntentModule();
      const workflowIntent = workflowModule.detectWorkflowIntent(text);
      if (workflowIntent && agentToolHandlerRef.current) {
        const assistantMessageId = `${now}_workflow`;
        const autoModeAllowed = autoPilotConfig.enabled === true && !autoPilotConfig.requireConfirmation;
        const desiredMode =
          workflowIntent.mode ||
          (autoModeAllowed ? 'autopilot' : 'coordinate');
        const payload: Record<string, any> = {
          playbookId: workflowIntent.playbookId,
          source: 'chat',
          reason: workflowIntent.reason
        };
        if (workflowIntent.symbol) payload.symbol = workflowIntent.symbol;
        if (workflowIntent.timeframes) payload.timeframes = workflowIntent.timeframes;
        if (workflowIntent.strategy) payload.strategy = workflowIntent.strategy;
        if (desiredMode) payload.mode = desiredMode;

        const toolAction: AgentToolAction = {
          type: 'RUN_ACTION_CATALOG',
          status: 'PENDING',
          correlationId,
          actionId: 'playbook.run',
          payload,
          symbol: workflowIntent.symbol,
          timeframes: workflowIntent.timeframes,
          strategy: workflowIntent.strategy,
          mode: desiredMode,
          reason: workflowIntent.reason
        };
        const finalToolAction = ensureToolActionSource(toolAction) || toolAction;

        const toolMessage: Message = {
          id: assistantMessageId,
          role: 'model',
          text: `Starting workflow: ${workflowIntent.playbookId}${workflowIntent.symbol ? ` for ${workflowIntent.symbol}` : ''}.`,
          timestamp: new Date(),
          correlationId,
          agentId: currentAgent.id,
          agentName: currentAgent.name,
          agentColor: currentAgent.color,
          agentToolAction: finalToolAction
        };

        setMessages((prev) => [...prev, userMessage, toolMessage]);
        setIsThinking(false);
        void executeAgentTool(assistantMessageId, finalToolAction);
        return;
      }
    }

    if (!isImageCommand) {
      const flowResolver = resolveActionFlowIntentRef.current;
      if (flowResolver && agentToolHandlerRef.current) {
        const learnedFlow = flowResolver(text);
        if (learnedFlow) {
          const workflowModule = await loadChatWorkflowIntentModule();
          const desiredMode: WorkflowIntent['mode'] = workflowModule.inferWorkflowMode(text);
          const autoModeAllowed = autoPilotConfig.enabled === true && !autoPilotConfig.requireConfirmation;
          const mode = desiredMode || (autoModeAllowed ? 'autopilot' : 'coordinate');
          const inferredSymbol = workflowModule.extractSymbolFromText(text) || learnedFlow.symbol || undefined;
          const inferredFrames = workflowModule.extractTimeframesFromText(text);
          const payload: Record<string, any> = {
            intentKey: learnedFlow.intentKey,
            preferFlow: true,
            reason: `Learned flow: ${learnedFlow.intentLabel || learnedFlow.intentKey}`
          };
          if (inferredSymbol) payload.symbol = inferredSymbol;
          if (inferredFrames.length > 0) payload.timeframes = inferredFrames;
          if (learnedFlow.timeframe && !payload.timeframe) payload.timeframe = learnedFlow.timeframe;
          const toolAction: AgentToolAction = {
            type: 'RUN_ACTION_CATALOG',
            status: 'PENDING',
            correlationId,
            actionId: 'action_flow.run',
            payload,
            symbol: inferredSymbol,
            timeframe: payload.timeframe,
            mode,
            reason: payload.reason
          };
          const finalToolAction = ensureToolActionSource(toolAction) || toolAction;
          const toolMessage: Message = {
            id: `${now}_flow`,
            role: 'model',
            text: `Running learned flow: ${learnedFlow.intentLabel || learnedFlow.intentKey}.`,
            timestamp: new Date(),
            correlationId,
            agentId: currentAgent.id,
            agentName: currentAgent.name,
            agentColor: currentAgent.color,
            agentToolAction: finalToolAction
          };
          setMessages((prev) => [...prev, userMessage, toolMessage]);
          setIsThinking(false);
          void executeAgentTool(toolMessage.id, finalToolAction);
          return;
        }
      }
    }

    // --- Team (Roundtable) Mode: every agent replies ---
    if (!isImageCommand && replyMode === 'team') {
      const leadAgentId = currentAgent.id;
      const targetAgents = [currentAgent, ...agents.filter(a => a.id !== leadAgentId)];
      const roundResponses: Array<{ agentId: string; agentName: string; text: string }> = [];

      const summarizeTeamResponse = (text: string) => {
        const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) return '';
        return cleaned.length > 280 ? `${cleaned.slice(0, 280)}...` : cleaned;
      };

      const buildTeamContextBlock = () => {
        if (roundResponses.length === 0) return 'TEAM RESPONSES SO FAR: none';
        const lines = roundResponses
          .map((entry, idx) => {
            const summary = summarizeTeamResponse(entry.text);
            return summary ? `${idx + 1}. ${entry.agentName}: ${summary}` : null;
          })
          .filter(Boolean)
          .join('\n');
        return `TEAM RESPONSES SO FAR:\n${lines || 'none'}`;
      };

      const placeholderMessages: Message[] = targetAgents.map((agent, idx) => ({
        id: (now + idx + 1).toString(),
        role: 'model',
        text: '',
        timestamp: new Date(),
        correlationId,
        agentId: agent.id,
        agentName: agent.name,
        agentColor: agent.color,
        isStreaming: true
      }));

      setMessages(prev => [...prev, userMessage, ...placeholderMessages]);
      setIsThinking(true);

      const autoPilotStatus = formatAutoPilotStatus(autoPilotConfig);

      const pageLabel = context?.title
        ? `${context.title} (${context.url})`
        : (context?.url || 'Unknown');
      const tradingViewContext = context?.url ? getTradingViewContext(context.url, context?.title) : '';

      let contextImage: string | null = null;
      let contextImages: Array<{ dataUrl?: string; label?: string; meta?: any }> | null =
        imageAttachmentList && imageAttachmentList.length > 0 ? imageAttachmentList : null;

      const shouldCaptureContextImage =
        !imageAttachmentStr &&
        (!imageAttachmentList || imageAttachmentList.length === 0) &&
        (typeof context?.captureScreenshots === 'function' || typeof context?.captureScreenshot === 'function') &&
        (autoTabVisionEnabled || (isLive && liveMode !== 'audio'));

      if (shouldCaptureContextImage) {
        try {
          if (typeof context?.captureScreenshots === 'function') {
            contextImages = await context.captureScreenshots();
          }

          if ((!contextImages || contextImages.length === 0) && typeof context?.captureScreenshot === 'function') {
            contextImage = await context.captureScreenshot();
          }
        } catch {
          contextImages = null;
          contextImage = null;
        }
      }

      const requestImageAttachment =
        (imageAttachmentList && imageAttachmentList.length > 0)
          ? imageAttachmentList
          : imageAttachmentStr ||
            (contextImages && contextImages.length > 0 ? contextImages : contextImage);

      if (contextImages && contextImages.length > 0) {
        const contextTabs = contextImages
          .map((img) => {
            const meta = img?.meta || {};
            const label = String(meta.label || img.label || '').trim();
            if (!label) return null;
            return {
              label,
              url: meta.url ? String(meta.url) : undefined,
              capturedAtMs: Number.isFinite(Number(meta.capturedAtMs)) ? Number(meta.capturedAtMs) : undefined,
              changed: typeof meta.changed === 'boolean' ? meta.changed : undefined,
              source: meta.source ? String(meta.source) : undefined
            };
          })
          .filter(Boolean) as Message['contextTabs'];

        if (contextTabs.length > 0) {
          setMessages(prev => prev.map(m => m.id === userMessage.id ? { ...m, contextTabs } : m));
        }
      }

      const runAgent = async (agent: Agent, assistantMessageId: string, history: Message[]) => {
        let streamed = '';
        let flushTimer: number | null = null;

        const clearFlushTimer = () => {
          if (flushTimer != null) {
            window.clearTimeout(flushTimer);
            flushTimer = null;
          }
        };

        const scheduleFlush = () => {
          if (flushTimer != null) return;
          flushTimer = window.setTimeout(() => {
            flushTimer = null;
            setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, text: streamed } : m));
          }, 40);
        };

        try {
          const systemContext = appendExternalContext(`
            You are ${agent.name}.
            YOUR DEFINED ROLE/CONTEXT: ${agent.systemInstruction || 'You are a helpful, general-purpose assistant.'}
            
             CURRENT SESSION BIAS: ${sessionBias || "No specific bias set."}
             User is currently browsing: ${pageLabel}.
             ${tradingViewContext}
             ${autoPilotStatus}
             ${buildTeamContextBlock()}
             TEAM MODE PROTOCOL:
             - Read TEAM RESPONSES SO FAR before writing.
             - Do not repeat points already made by other agents.
             - If you agree with a prior point, say "Agree with <agent>" and add a new detail.
             - Provide at most 3 concise bullets labeled "New:" with unique insights.
             - If you have no new insight, ask one clarifying question instead of repeating.
           `);

          agentRequestHandlerRef.current?.({
            phase: 'send',
            correlationId,
            meta: { ...requestMeta, agentId: agent.id, mode: 'team' }
          });

          const { text: responseText, tradeProposal, riskUpdate, brokerAction, agentToolAction } = await sendMessageToOpenAI(
            history,
            text,
            systemContext,
            requestImageAttachment,
            agents,
            memories,
            monitoredUrls,
            {
              agent,
              onDelta: (delta) => {
                streamed += delta;
                scheduleFlush();
              }
            }
          );

          agentRequestHandlerRef.current?.({
            phase: 'response',
            correlationId,
            meta: { ...requestMeta, agentId: agent.id, mode: 'team' }
          });

          clearFlushTimer();

          // Only the lead agent can apply risk updates automatically in Team mode.
          if (riskUpdate && agent.id === leadAgentId) {
            setAutoPilotConfig(prev => applyAutoPilotUpdate(prev, riskUpdate));
          }

          let finalProposal = tradeProposal;
          if (finalProposal) {
            finalProposal = { ...finalProposal, agentId: agent.id };
          }

          let finalBrokerAction = brokerAction;
          if (finalBrokerAction) {
            finalBrokerAction = { ...finalBrokerAction, agentId: agent.id };
          }

            const finalToolAction = agentToolAction ? ensureToolActionSource({ ...agentToolAction, correlationId }) : undefined;
            const scoped = applyAgentCapabilitiesToActions(agent, {
              tradeProposal: finalProposal,
              brokerAction: finalBrokerAction,
              agentToolAction: finalToolAction
            });
          const blockedLine = scoped.blocked.length > 0 ? `[Capability blocked: ${scoped.blocked.join(', ')}]` : '';
          const responseWithCaps = blockedLine ? `${responseText}\n${blockedLine}` : responseText;

          setMessages(prev => prev.map(m => {
            if (m.id !== assistantMessageId) return m;
            return {
              ...m,
              text: responseWithCaps,
              isStreaming: false,
              tradeProposal: scoped.tradeProposal || undefined,
              brokerAction: scoped.brokerAction || undefined,
              agentToolAction: scoped.agentToolAction || undefined
            };
          }));

          if (scoped.tradeProposal) {
            maybeAutoExecuteProposal(assistantMessageId, scoped.tradeProposal);
          }

          if (scoped.brokerAction && scoped.brokerAction.type === 'REFRESH_BROKER') {
            executeBrokerAction(assistantMessageId, scoped.brokerAction);
          }

          if (scoped.agentToolAction) {
            executeAgentTool(assistantMessageId, scoped.agentToolAction);
          }

          return { responseText: responseWithCaps, tradeProposal: scoped.tradeProposal || undefined, brokerAction: scoped.brokerAction || undefined, agentToolAction: scoped.agentToolAction || undefined };
        } catch (error) {
          clearFlushTimer();
          const raw = (error as any)?.message ? String((error as any).message) : String(error || "");
          const msg = raw.trim() ? raw.trim() : "Unknown error.";
          const short = msg.length > 400 ? `${msg.slice(0, 400)}.` : msg;
          agentRequestHandlerRef.current?.({
            phase: 'error',
            correlationId,
            meta: { ...requestMeta, agentId: agent.id, mode: 'team' },
            error: short
          });
          setMessages(prev => prev.map(m => {
            if (m.id !== assistantMessageId) return m;
            return { ...m, text: `Error: ${short}`, isError: true, isStreaming: false };
          }));
          return null;
        } finally {
          clearFlushTimer();
        }
      };

      try {
        let historyForAgents: Message[] = historySnapshot;

        for (let i = 0; i < targetAgents.length; i++) {
          const agent = targetAgents[i];
          const assistantMessageId = (now + i + 1).toString();
          const res = await runAgent(agent, assistantMessageId, historyForAgents);
          if (res?.responseText) {
            historyForAgents = [...historyForAgents, {
              id: assistantMessageId,
              role: 'model',
              text: res.responseText,
              timestamp: new Date(),
              correlationId,
              agentId: agent.id,
              agentName: agent.name,
              agentColor: agent.color,
              tradeProposal: res.tradeProposal,
              brokerAction: res.brokerAction,
              agentToolAction: res.agentToolAction
            }];
            roundResponses.push({
              agentId: agent.id,
              agentName: agent.name,
              text: res.responseText
            });
          }
        }
      } catch (error) {
        const raw = (error as any)?.message ? String((error as any).message) : String(error || "");
        const msg = raw.trim() ? raw.trim() : "Unknown error.";
        const short = msg.length > 400 ? `${msg.slice(0, 400)}.` : msg;
        const ids = new Set(placeholderMessages.map(m => m.id));
        setMessages(prev => prev.map(m => {
          if (!ids.has(m.id)) return m;
          return { ...m, text: `Error: ${short}`, isError: true, isStreaming: false };
        }));
      } finally {
        setIsThinking(false);
      }

      return;
    }

    const placeholderMessage: Message | null = isImageCommand ? null : {
      id: assistantMessageId,
      role: 'model',
      text: '',
      timestamp: new Date(),
      correlationId,
      agentId: currentAgent.id,
      agentName: currentAgent.name,
      agentColor: currentAgent.color,
      isStreaming: true
    };

    setMessages(prev => placeholderMessage ? [...prev, userMessage, placeholderMessage] : [...prev, userMessage]);
    setIsThinking(true);

    let streamed = '';
    let flushTimer: number | null = null;
    const clearFlushTimer = () => {
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const scheduleFlush = () => {
      if (flushTimer != null) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, text: streamed } : m));
      }, 40);
    };

    try {
      if (isImageCommand) {
        const prompt = text.replace(/^\/image\s*/i, '').trim();
        const base64Image = await generateImageWithOpenAI(prompt || 'chart pattern');
        let imageForChat = base64Image;
        try {
          const saved = await persistImageDataUrlForChat({
            dataUrl: base64Image,
            subdir: 'chat-images',
            prefix: 'chat_ai_image'
          });
          if (saved?.ok && saved.src) imageForChat = String(saved.src);
        } catch {
          // ignore
        }
        const imageMessage: Message = {
          id: assistantMessageId,
          role: 'model',
          text: `Here is your generated image for: "${prompt}"`,
          image: imageForChat,
          timestamp: new Date(),
          correlationId,
          agentId: currentAgent.id,
          agentName: currentAgent.name,
          agentColor: currentAgent.color
        };
        setMessages(prev => [...prev, imageMessage]);
      } 
      else {
        // Include AutoPilot status in context
        const autoPilotStatus = formatAutoPilotStatus(autoPilotConfig);

        let contextImage: string | null = null;
        let contextImages: Array<{ dataUrl?: string; label?: string; meta?: any }> | null =
          imageAttachmentList && imageAttachmentList.length > 0 ? imageAttachmentList : null;
        if (
          !imageAttachmentStr &&
          (!imageAttachmentList || imageAttachmentList.length === 0) &&
          (typeof context?.captureScreenshots === 'function' || typeof context?.captureScreenshot === 'function') &&
          (autoTabVisionEnabled || (isLive && liveMode !== 'audio'))
        ) {
          try {
            if (typeof context?.captureScreenshots === 'function') {
              contextImages = await context.captureScreenshots();
            }

            if ((!contextImages || contextImages.length === 0) && typeof context?.captureScreenshot === 'function') {
              contextImage = await context.captureScreenshot();
            }
          } catch {
            contextImages = null;
            contextImage = null;
          }
        }
        const requestImageAttachment =
          (imageAttachmentList && imageAttachmentList.length > 0)
            ? imageAttachmentList
            : imageAttachmentStr ||
              (contextImages && contextImages.length > 0 ? contextImages : contextImage);

        if (contextImages && contextImages.length > 0) {
          const contextTabs = contextImages
            .map((img) => {
              const meta = img?.meta || {};
              const label = String(meta.label || img.label || '').trim();
              if (!label) return null;
              return {
                label,
                url: meta.url ? String(meta.url) : undefined,
                capturedAtMs: Number.isFinite(Number(meta.capturedAtMs)) ? Number(meta.capturedAtMs) : undefined,
                changed: typeof meta.changed === 'boolean' ? meta.changed : undefined,
                source: meta.source ? String(meta.source) : undefined
              };
            })
            .filter(Boolean) as Message['contextTabs'];

          if (contextTabs.length > 0) {
            setMessages(prev => prev.map(m => m.id === userMessage.id ? { ...m, contextTabs } : m));
          }
        }

        const pageLabel = context?.title
          ? `${context.title} (${context.url})`
          : (context?.url || 'Unknown');
        const tradingViewContext = context?.url ? getTradingViewContext(context.url, context?.title) : '';

        const systemContext = appendExternalContext(`
          You are ${currentAgent.name}.
          YOUR DEFINED ROLE/CONTEXT: ${currentAgent.systemInstruction || 'You are a helpful, general-purpose assistant.'}
          
          CURRENT SESSION BIAS: ${sessionBias || "No specific bias set."}
          User is currently browsing: ${pageLabel}.
          ${tradingViewContext}
          ${autoPilotStatus}
        `);
        
        agentRequestHandlerRef.current?.({
          phase: 'send',
          correlationId,
          meta: { ...requestMeta, agentId: currentAgent.id, mode: replyMode }
        });

        // Pass memories and monitored URLs to service
        const { text: responseText, tradeProposal, riskUpdate, brokerAction, agentToolAction } = await sendMessageToOpenAI(
            messages, 
            text, 
            systemContext, 
            requestImageAttachment, 
            agents,
            memories,
            monitoredUrls,
            {
              agent: currentAgent,
              onDelta: (delta) => {
                streamed += delta;
                scheduleFlush();
              }
            }
        );

        agentRequestHandlerRef.current?.({
          phase: 'response',
          correlationId,
          meta: { ...requestMeta, agentId: currentAgent.id, mode: replyMode }
        });

        clearFlushTimer();
        
        // Handle Risk Updates via Text Tool
        if (riskUpdate) {
             setAutoPilotConfig(prev => applyAutoPilotUpdate(prev, riskUpdate));
        }

        let finalProposal = tradeProposal;
        if (finalProposal) {
          finalProposal = { ...finalProposal, agentId: currentAgent.id };
        }

        let finalBrokerAction = brokerAction;
        if (finalBrokerAction) {
          finalBrokerAction = { ...finalBrokerAction, agentId: currentAgent.id };
        }

        const finalToolAction = agentToolAction ? ensureToolActionSource({ ...agentToolAction, correlationId }) : undefined;
        const scoped = applyAgentCapabilitiesToActions(currentAgent, {
          tradeProposal: finalProposal,
          brokerAction: finalBrokerAction,
          agentToolAction: finalToolAction
        });
        const blockedLine = scoped.blocked.length > 0 ? `[Capability blocked: ${scoped.blocked.join(', ')}]` : '';
        const responseWithCaps = blockedLine ? `${responseText}\n${blockedLine}` : responseText;

        setMessages(prev => prev.map(m => {
          if (m.id !== assistantMessageId) return m;
          return {
            ...m,
            text: responseWithCaps,
            isStreaming: false,
            tradeProposal: scoped.tradeProposal || undefined,
            brokerAction: scoped.brokerAction || undefined,
            agentToolAction: scoped.agentToolAction || undefined
          };
        }));

        if (scoped.tradeProposal) {
          maybeAutoExecuteProposal(assistantMessageId, scoped.tradeProposal);
        }

        if (scoped.brokerAction && scoped.brokerAction.type === 'REFRESH_BROKER') {
          executeBrokerAction(assistantMessageId, scoped.brokerAction);
        }

        if (scoped.agentToolAction) {
          executeAgentTool(assistantMessageId, scoped.agentToolAction);
        }
      }
    } catch (error) {
      clearFlushTimer();
      const raw = (error as any)?.message ? String((error as any).message) : String(error || "");
      const msg = raw.trim() ? raw.trim() : "Unknown error.";
      const short = msg.length > 400 ? `${msg.slice(0, 400)}…` : msg;
      agentRequestHandlerRef.current?.({
        phase: 'error',
        correlationId,
        meta: { ...requestMeta, agentId: currentAgent.id, mode: replyMode },
        error: short
      });
      if (placeholderMessage) {
        setMessages(prev => prev.map(m => {
          if (m.id !== assistantMessageId) return m;
          return { ...m, text: `Error: ${short}`, isError: true, isStreaming: false };
        }));
      } else {
        const errorMessage: Message = {
          id: assistantMessageId,
          role: 'model',
          text: `Error: ${short}`,
          timestamp: new Date(),
          isError: true,
          agentId: currentAgent.id,
          agentName: currentAgent.name,
          agentColor: currentAgent.color
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } finally {
      clearFlushTimer();
      setIsThinking(false);
    }
  }, [activeAgentId, agents, isThinking, messages, replyMode, autoTabVisionEnabled, sessionBias, autoPilotConfig, formatAutoPilotStatus, appendExternalContext, maybeAutoExecuteProposal, memories, executeAgentTool, executeBrokerAction, isLive, liveMode, applyAutoPilotUpdate, applyAgentCapabilitiesToActions]);

  return {
    messages,
    sendMessage,
    clearChat,
    isThinking,
    // Preferences
    replyMode,
    setReplyMode,
    autoTabVisionEnabled,
    setAutoTabVisionEnabled,
    chartWatchEnabled,
    setChartWatchEnabled,
    chartWatchMode,
    setChartWatchMode,
    chartWatchSnoozedUntilMs,
    snoozeChartWatch,
    clearChartWatchSnooze,
    chartWatchLeadAgentId,
    setChartWatchLeadAgentId,
    postTradeReviewEnabled,
    setPostTradeReviewEnabled,
    postTradeReviewAgentId,
    setPostTradeReviewAgentId,
    enqueuePostTradeReview,
    reviewLastClosedTrade,
    agents,
    activeAgentId,
    addAgent,
    updateAgent,
    deleteAgent,
    switchAgent,
    runChartWatchUpdate,
    // Live Props
    isLive,
    liveMode,
    liveStream,
    startLiveSession,
    stopLiveSession,
    sendVideoFrame,
    // TTS Props
    speakMessage,
    speakingMessageId,
    // Session Props
    sessionBias,
    setSessionBias,
    // AutoPilot
    autoPilotConfig,
    setAutoPilotConfig,
    // Memory
    memories,
    addTradeMemory,
    addManualMemory,
    updateMemory,
    deleteMemory,
    clearMemories,
    // Trading actions
    executeTradeProposal,
    rejectTradeProposal,
    executeBrokerAction,
    rejectBrokerAction,
    cancelAgentTool
  };
};
