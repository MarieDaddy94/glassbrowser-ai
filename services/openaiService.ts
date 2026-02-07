import { Message, Agent, TradeProposal, BrokerAction, Memory, AgentToolAction } from "../types";
import { buildEvidenceCardFromProposal } from "./evidenceCard";
import { formatAgentCapabilities } from "./agentCapabilities";
import { OPENAI_TECH_FUNCTION_TOOLS, OPENAI_TRADING_FUNCTION_TOOLS } from "./toolSchemas";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-5.2";
const DEFAULT_VISION_MODEL = "gpt-5.2";
const FALLBACK_TEXT_MODELS = ["gpt-5.2"];
const FALLBACK_VISION_MODELS = ["gpt-5.2"];
const IMAGE_MODEL = "gpt-image-1";

const MAX_MEMORIES_IN_PROMPT = 30;
const MAX_RULES_IN_PROMPT = 12;

type VisionDetail = "low" | "high" | "auto";
type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

type StreamOptions = {
  onDelta?: (delta: string) => void;
  imageDetail?: VisionDetail;
  agent?: Agent;
  reasoningEffort?: ReasoningEffort;
};

type LabeledImage = { dataUrl?: string; label?: string };
type ImageAttachment =
  | string
  | { image: string; label?: string }
  | { dataUrl: string; label?: string }
  | { image_url: string; label?: string };
type ImageAttachments = ImageAttachment | ImageAttachment[] | null | undefined;

const detectElectron = () => {
  try {
    return Boolean((window as any)?.glass?.isElectron) || navigator.userAgent.toLowerCase().includes('electron');
  } catch {
    return false;
  }
};

const getApiKey = (): string | null => {
  try {
    const bridge = (window as any)?.glass?.openai;
    if (bridge) return null;
  } catch {
    // ignore
  }
  if (detectElectron()) return null;
  try {
    const stored = localStorage.getItem("glass_openai_api_key");
    if (stored) return stored;
  } catch {
    // ignore
  }
  const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is missing in environment variables.");
    return null;
  }
  return apiKey;
};

const isAllowedModel = (value: string): boolean => {
  const model = String(value || "").trim().toLowerCase();
  return model.startsWith("gpt-5.2");
};

const getTextModel = (): string => {
  try {
    const stored = localStorage.getItem("glass_openai_text_model");
    if (stored && stored.trim() && isAllowedModel(stored)) return stored.trim();
  } catch {
    // ignore
  }
  const candidate = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_MODEL || DEFAULT_TEXT_MODEL;
  return isAllowedModel(candidate) ? candidate : DEFAULT_TEXT_MODEL;
};

const isVisionCapableModel = (value: string): boolean => {
  return isAllowedModel(value);
};

const coerceVisionModel = (value?: string): string => {
  const candidate = String(value || "").trim();
  if (!candidate) return DEFAULT_VISION_MODEL;
  return isVisionCapableModel(candidate) ? candidate : DEFAULT_VISION_MODEL;
};

const getVisionModel = (): string => {
  try {
    const stored = localStorage.getItem("glass_openai_vision_model");
    if (stored && stored.trim()) {
      const candidate = stored.trim();
      if (isAllowedModel(candidate)) return candidate;
    }
  } catch {
    // ignore
  }
  const candidate = process.env.OPENAI_VISION_MODEL || DEFAULT_VISION_MODEL;
  return isAllowedModel(candidate) ? candidate : DEFAULT_VISION_MODEL;
};

const getVisionDetail = (): VisionDetail => {
  try {
    const stored = localStorage.getItem("glass_openai_vision_detail");
    const v = stored ? stored.trim().toLowerCase() : "";
    if (v === "low" || v === "high" || v === "auto") return v;
  } catch {
    // ignore
  }
  const env = String(process.env.OPENAI_VISION_DETAIL || "").trim().toLowerCase();
  if (env === "low" || env === "high" || env === "auto") return env;
  return "auto";
};

const normalizeReasoningEffort = (value: any): ReasoningEffort | null => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "none" || raw === "low" || raw === "medium" || raw === "high" || raw === "xhigh") {
    return raw as ReasoningEffort;
  }
  return null;
};

const parseDelimitedList = (raw: string): string[] => {
  return String(raw || "")
    .split(/[,;\n\r]/g)
    .map((part) => part.trim())
    .filter(Boolean);
};

const getVectorStoreIds = (): string[] => {
  let raw = "";
  try {
    raw = localStorage.getItem("glass_openai_vector_store_ids") || localStorage.getItem("glass_openai_vector_store_id") || "";
  } catch {
    // ignore
  }
  if (!raw) raw = process.env.OPENAI_VECTOR_STORE_IDS || process.env.OPENAI_VECTOR_STORE_ID || "";
  return parseDelimitedList(raw);
};

const getTechReasoningEffort = (): ReasoningEffort => {
  let raw = "";
  try {
    raw =
      localStorage.getItem("glass_openai_tech_reasoning_effort") ||
      localStorage.getItem("glass_openai_reasoning_effort") ||
      "";
  } catch {
    // ignore
  }
  if (!raw) raw = process.env.OPENAI_TECH_REASONING_EFFORT || process.env.OPENAI_REASONING_EFFORT || "";
  return normalizeReasoningEffort(raw) || "medium";
};

const webSearchTool = { type: "web_search" };

const buildFileSearchTool = (vectorStoreIds: string[]) => {
  if (!Array.isArray(vectorStoreIds) || vectorStoreIds.length === 0) return null;
  return {
    type: "file_search",
    vector_store_ids: vectorStoreIds,
    max_num_results: 8
  };
};

const isLikelyModelAccessError = (message: string) => {
  const m = String(message || "").toLowerCase();
  if (!m) return false;
  if (!m.includes("model")) return false;
  if (m.includes("does not exist") || m.includes("doesn't exist")) return true;
  if (m.includes("model_not_found")) return true;
  if (m.includes("do not have access") || m.includes("you do not have access")) return true;
  if (m.includes("not found")) return true;
  return false;
};

const isLikelyVisionUnsupportedError = (message: string) => {
  const m = String(message || "").toLowerCase();
  if (!m) return false;
  if (m.includes("input_image")) return true;
  if (m.includes("image_url")) return true;
  if (m.includes("vision") && m.includes("support")) return true;
  if (m.includes("does not support") && (m.includes("image") || m.includes("vision"))) return true;
  if (m.includes("unsupported") && (m.includes("image") || m.includes("vision"))) return true;
  if (m.includes("invalid") && (m.includes("input_image") || m.includes("image_url"))) return true;
  return false;
};

// --- TOOLS DEFINITION (shared) ---

const safeJsonParse = (value: any) => {
  if (value == null) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
};

const isRuleMemory = (m: Memory) => {
  const meta: any = (m as any)?.meta;
  if (!meta || typeof meta !== "object") return false;
  return !!(meta.isRule || meta.rule === true || meta.pinned === true || meta.hardRule === true);
};

const selectMemoriesForPrompt = (memories: Memory[], maxTotal: number = MAX_MEMORIES_IN_PROMPT) => {
  const list = Array.isArray(memories) ? memories : [];
  const seen = new Set<string>();
  const deduped: Memory[] = [];

  for (const m of list) {
    if (!m) continue;
    const id = String((m as any).id || "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(m);
  }

  const rules = deduped.filter(isRuleMemory);
  const perf = deduped.filter((m) => !isRuleMemory(m));

  const selectedRules = rules.slice(0, Math.max(0, Math.min(MAX_RULES_IN_PROMPT, maxTotal)));
  const remaining = Math.max(0, maxTotal - selectedRules.length);
  const selectedPerf = perf.slice(0, remaining);

  return { rules: selectedRules, perf: selectedPerf };
};

export const sendMessageToOpenAI = async (
  history: Message[],
  newMessage: string,
  systemContext: string = "",
  imageAttachment: ImageAttachments = null,
  allAgents: Agent[] = [],
  memories: Memory[] = [],
  monitoredUrls: string[] = [],
  options: StreamOptions = {}
): Promise<{ text: string; tradeProposal?: TradeProposal; riskUpdate?: any; brokerAction?: BrokerAction; agentToolAction?: AgentToolAction }> => {
  const bridge = (window as any).glass?.openai;
  const apiKey = bridge ? null : getApiKey();
  if (!bridge && !apiKey) {
    throw new Error("OpenAI API key missing.");
  }

  const startedAtMs = Date.now();
  const requestId = `openai_${startedAtMs}_${Math.random().toString(16).slice(2, 8)}`;
  const emitOpenAiAudit = (detail: Record<string, any>) => {
    try {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent("glass_openai_audit", { detail }));
    } catch {
      // ignore audit failures
    }
  };

  const normalizeImages = (value: ImageAttachments): LabeledImage[] => {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    const out: LabeledImage[] = [];

    for (const item of arr) {
      if (!item) continue;
      if (typeof item === "string") {
        const s = item.trim();
        if (s) out.push({ dataUrl: s });
        continue;
      }
      if (typeof item === "object") {
        const raw = (item as any).dataUrl ?? (item as any).image ?? (item as any).image_url ?? null;
        const s = raw != null ? String(raw).trim() : "";
        const labelRaw = (item as any).label;
        const label = labelRaw != null ? String(labelRaw).trim() : "";
        if (!s && label) {
          out.push({ label });
          continue;
        }
        if (!s) continue;
        out.push(label ? { dataUrl: s, label } : { dataUrl: s });
      }
    }

    return out;
  };

  const normalizedImages = normalizeImages(imageAttachment);

  const validHistory = history.filter(msg => !msg.isError && msg.id !== "welcome");
  const isSendableImageUrl = (value: any) =>
    typeof value === "string" &&
    (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://"));

  const hasAnyImage = normalizedImages.some((img) => !!img.dataUrl) || validHistory.some(m => isSendableImageUrl((m as any).image));
  const imageDetail: VisionDetail = options?.imageDetail || getVisionDetail();

  const agentRoster = allAgents.map(a => {
    const roleDesc = a.systemInstruction ? `(Role: ${a.systemInstruction})` : "(Role: General Assistant)";
    const caps = formatAgentCapabilities(a.capabilities);
    return `- ${a.name} ${roleDesc} [caps: ${caps}]`;
  }).join("\n");

  const selected = selectMemoriesForPrompt(memories, MAX_MEMORIES_IN_PROMPT);

  const rulesLog = selected.rules.length > 0
    ? `NON-NEGOTIABLE RULES (MUST FOLLOW):\n${selected.rules.map(m => `- ${m.text}`).join("\n")}`
    : "NON-NEGOTIABLE RULES: None.";

  const memoryLog = selected.perf.length > 0
    ? `PAST PERFORMANCE MEMORY (LEARN FROM THIS):\n${selected.perf.map(m => `- [${m.type}] ${m.text}`).join("\n")}`
    : "PAST PERFORMANCE MEMORY: None yet.";

  const monitoredContext = monitoredUrls.length > 0
    ? `BACKGROUND MONITORED FEEDS (WATCH THESE URLs CLOSELY EVEN IF USER IS ELSEWHERE):\n${monitoredUrls.map(url => `- ${url}`).join("\n")}`
    : "BACKGROUND MONITORED FEEDS: None.";

  const agentProfile = String(options?.agent?.profile || "").trim().toLowerCase();
  const agentName = String(options?.agent?.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const isTechAgent = agentProfile === "tech" || agentName === "tech agent" || agentName === "tech-agent";
  const vectorStoreIds = getVectorStoreIds();
  const hasFileSearch = vectorStoreIds.length > 0;

  const tradingSystemInstruction = `You are an intelligent agent in a High-Performance Trading Team.

YOUR IDENTITY:
${systemContext}

THE TEAM:
${agentRoster}

${rulesLog}

${memoryLog}

${monitoredContext}

CAPABILITIES:
- You are monitoring the BACKGROUND FEEDS listed above.
- The NON-NEGOTIABLE RULES are hard constraints. Do not propose trades that violate them.
- If you see a good trade setup based on your role, call the 'proposeTrade' tool. YOU MUST PROVIDE A 'reason' argument.
- Use the PAST PERFORMANCE MEMORY to avoid repeating losses and replicate winning patterns.
- If the user asks to change risk settings (e.g. "set daily loss to 500" or "set spread limit to 0.2%"), call 'updateRiskSettings'.
- If you need broker-accurate prices for analysis or confirmation, call 'getBrokerQuote'. If the user explicitly requests a trade execution, proceed with 'proposeTrade' (the execution layer fetches broker quotes).
- If you need a full system snapshot (broker + autopilot + watchers + chart + backtester + tabs), call 'getSystemState'.
- If you need a visual of the app UI, call 'getAppSnapshot'.
- If you need native chart visuals, call 'getNativeChartSnapshot'.
- If you need to infer a strategy or tune parameters from the chart, call 'getNativeChartSnapshot' before launching backtests or optimizations.
- For multi-step trade sessions (watch chart, analyze, backtest, optimize, trade), call 'run_action_catalog' with actionId 'playbook.run' and payload { playbookId: 'playbook.trade_session_mtf.v1', symbol } (override symbol/timeframe/strategy as needed). For ad-hoc multi-step sequences, pass steps/sequence to 'run_action_catalog' to queue a playbook.
- If a workflow is repeatable, call 'run_action_catalog' with actionId 'action_flow.list' to see learned sequences, then run 'action_flow.run' with payload { intentKey } (or include payload.intent to auto-select).
- If the user asks to navigate UI panels, use 'run_action_catalog' with actionId 'ui.panel.open' or 'ui.sidebar.setMode' (payload { panel: 'backtester' | 'chart' | 'autopilot' | ... }). UI navigation is optional; headless actions still work.
- If the user asks to open/switch/close tabs, use 'run_action_catalog' with actionId 'ui.tab.open' | 'ui.tab.switch' | 'ui.tab.close' | 'ui.tab.pin' | 'ui.tab.watch'.
- If you need backtest stats or training data, call 'getBacktestSummary' or 'getBacktestTrainingPack'.
- If you need headless grid search optimization, call 'run_backtest_optimization'.
- If you need multi-objective optimization with train/test validation, call 'start_backtest_optimizer' and then 'get_backtest_optimizer_status' / 'get_backtest_optimizer_results'.
- If the user describes a custom strategy or asks you to infer one, set strategy to AUTO or CUSTOM and include strategyDescription; include params when the user provides explicit parameter values.
- If you need exact optimizer winner params, call 'get_optimizer_winner_params' (use sessionId+round or winnerId).
- If the user asks to save, create watchers, write setups, or promote optimizer winners, always call 'get_optimizer_winner_params' first, then act on the returned params (do not ask the user to paste params).
- To save a winner for reuse, call 'save_optimizer_winner_as_preset'.
  - If you need a refinement proposal or a two-round optimizer chain, call 'propose_backtest_optimization_refinement' or 'run_backtest_optimization_chain'.
  - If the user asks for a "second pass", "refine", or "run it again for better win rate/drawdown", use 'run_backtest_optimization_chain' (not 'start_backtest_optimizer').
- For multi-experiment research autopilot sessions, call 'start_research_autopilot' and check progress with 'get_research_autopilot_status' / 'get_research_autopilot_results' (stop with 'stop_research_autopilot').
- If the user requests a backtest for a specific symbol/timeframe, use 'run_backtest_optimization' with explicit symbol/timeframe (do not rely on the Backtester panel unless they ask for current panel stats).
- To manage live setups, call 'listSetupWatchers', 'createSetupWatcher', 'updateSetupWatcher', 'deleteSetupWatcher', 'getSetupSignals', or 'explainSetupSignal'.
- For batch optimization, provide 'symbols' and/or 'timeframes'. You can reuse saved grids with 'presetKey' or 'usePreset'.
- If the user asks to change agent permissions, call 'updateAgentCapabilities'.
- For chart snapshot library access, use 'listAgentMemory' with kind 'chart_snapshot' (tags include 'library'), then 'getAgentMemory' for a specific key to retrieve imageDataUrl/savedPath.
- If the user gives $ SL/TP targets, use stopLossUsd/takeProfitUsd in modifyPosition.
- If the user wants to edit a pending order (price/qty/SL/TP), call modifyOrder (positions use modifyPosition).
- Be precise with numbers.
- Communicate concisely.`;

  const techSystemInstruction = `You are a live technical agent for GlassBrowser AI.

YOUR IDENTITY:
${systemContext}

THE TEAM:
${agentRoster}

${rulesLog}

${memoryLog}

${monitoredContext}

CAPABILITIES:
- Use web_search for external docs and up-to-date information.
- ${hasFileSearch ? 'Use file_search to retrieve grounded codebase context from the vector store.' : 'File_search is not configured; use codebase tools instead.'}
- Use codebase_list_files, codebase_search, codebase_read_file, and codebase_trace_dataflow to inspect local code and data flows.
- If you need runtime app state (panels, config, live status), call getSystemState or run_action_catalog.
- For chart snapshot library access, use listAgentMemory with kind 'chart_snapshot' (tags include 'library'), then getAgentMemory for a specific key to retrieve imageDataUrl/savedPath.
- Cite files/functions when possible and stay grounded in evidence.
- If you are unsure or need more context, ask a clarifying question.
- When the user asks for trading actions, you may propose or execute trades using broker tools while following non-negotiable rules.

RESPONSE STYLE:
- Concise, technical, and actionable.
- Prefer verified code references over guesses.`;

  const systemInstruction = isTechAgent ? techSystemInstruction : tradingSystemInstruction;

  const requestedTextModel = getTextModel();
  const visionModel = getVisionModel();
  const includeImages = hasAnyImage && isVisionCapableModel(visionModel);
  const imageOmittedNote = "Image attachment omitted because the selected model does not support vision inputs.";

  const buildInput = (includeImages: boolean) => {
    const input: any[] = [{ role: "system", content: systemInstruction }];

    for (const msg of validHistory) {
      const role =
        msg.role === "user" ? "user" :
        msg.role === "system" ? "system" :
        "assistant";

      let textContent = msg.text || "";
      if (msg.role === "model" && msg.agentName) {
        textContent = `[${msg.agentName}]: ${textContent}`;
      }
      if (msg.tradeProposal) {
        textContent += `\n[System]: I proposed a trade: ${msg.tradeProposal.action} ${msg.tradeProposal.symbol} @ ${msg.tradeProposal.entryPrice}`;
      }

      const historyImage = (msg as any).image;
      if (includeImages && isSendableImageUrl(historyImage)) {
        const parts: any[] = [{ type: "input_image", image_url: historyImage, detail: imageDetail }];
        if (textContent) parts.push({ type: "input_text", text: textContent });
        input.push({ role, content: parts });
      } else if (textContent) {
        input.push({ role, content: textContent });
      } else if (!includeImages && isSendableImageUrl(historyImage)) {
        input.push({ role, content: imageOmittedNote });
      }
    }

    const currentParts: any[] = [];
    let notedImageOmission = false;
    for (const img of normalizedImages) {
      if (img.label) currentParts.push({ type: "input_text", text: img.label });
      if (includeImages && img.dataUrl) {
        currentParts.push({ type: "input_image", image_url: img.dataUrl, detail: imageDetail });
      } else if (!includeImages && img.dataUrl && !notedImageOmission) {
        currentParts.push({ type: "input_text", text: imageOmittedNote });
        notedImageOmission = true;
      }
    }
    currentParts.push({ type: "input_text", text: newMessage });
    input.push({ role: "user", content: currentParts });
    return input;
  };

  const inputWithImages = includeImages ? buildInput(true) : null;
  const inputWithoutImages = buildInput(false);
  const requestedModel = includeImages ? visionModel : requestedTextModel;

  emitOpenAiAudit({
    phase: "start",
    requestId,
    model: requestedModel,
    hasImages: includeImages,
    historyCount: validHistory.length,
    messageChars: newMessage.length,
    systemChars: systemContext.length,
    agentId: options?.agent?.id || null,
    agentName: options?.agent?.name || null,
    agentProfile: options?.agent?.profile || null,
    reasoningEffort: options?.reasoningEffort || null
  });

  const fileSearchTool = buildFileSearchTool(vectorStoreIds);
  const techTools = [webSearchTool, fileSearchTool, ...OPENAI_TECH_FUNCTION_TOOLS].filter(Boolean) as any[];
  const tradingTools = OPENAI_TRADING_FUNCTION_TOOLS;

  const defaultInput = includeImages && inputWithImages ? inputWithImages : inputWithoutImages;

  const makeBody = (model: string, inputOverride?: any[]) => {
    const body: any = {
      model,
      input: inputOverride || defaultInput,
      tools: isTechAgent ? techTools : tradingTools,
      tool_choice: "auto"
    };
    const effortOverride = normalizeReasoningEffort(options?.reasoningEffort);
    const effort = effortOverride || (isTechAgent ? getTechReasoningEffort() : null);
    if (effort && String(model || "").toLowerCase().startsWith("gpt-5")) {
      body.reasoning = { effort };
    }
    return body;
  };

  const doRequest = async (model: string, inputOverride?: any[]) => {
    const body = makeBody(model, inputOverride);

    if (options?.onDelta && bridge?.responsesStream && bridge?.onStreamEvent) {
      const streamId = `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const onDelta = options.onDelta;
      const unsub = bridge.onStreamEvent((payload: any) => {
        if (!payload || payload.streamId !== streamId) return;
        const evt = payload.event;
        const type = String(evt?.type || "");
        if (type === "response.output_text.delta" && typeof evt?.delta === "string") {
          try { onDelta(evt.delta); } catch { /* ignore */ }
        }
      });

      try {
        const res = await bridge.responsesStream({ body, streamId });
        if (!res?.ok) {
          const status = typeof res?.status === "number" ? res.status : null;
          const suffix = res?.requestId ? ` (request_id=${String(res.requestId)})` : "";
          throw new Error(
            `${res?.error ? String(res.error) : `OpenAI request failed${status ? ` (HTTP ${status})` : ""}`}${suffix}`
          );
        }
        return res.data;
      } finally {
        try { unsub?.(); } catch { /* ignore */ }
      }
    }

    if (bridge?.responses) {
      const res = await bridge.responses({ body });
      if (!res?.ok) {
        const status = typeof res?.status === "number" ? res.status : null;
        const suffix = res?.requestId ? ` (request_id=${String(res.requestId)})` : "";
        throw new Error(
          `${res?.error ? String(res.error) : `OpenAI request failed${status ? ` (HTTP ${status})` : ""}`}${suffix}`
        );
      }
      return res.data;
    }

    const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `OpenAI request failed: ${res.status}`);
    }

    return await res.json();
  };

  let data: any = null;
  let usedModel = requestedModel;
  try {
    data = await doRequest(requestedModel, defaultInput);
    usedModel = requestedModel;
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    const shouldTryFallback = includeImages
      ? (isLikelyModelAccessError(msg) || isLikelyVisionUnsupportedError(msg))
      : isLikelyModelAccessError(msg);

    if (!shouldTryFallback) {
      emitOpenAiAudit({
        phase: "error",
        requestId,
        model: usedModel,
        durationMs: Date.now() - startedAtMs,
        error: msg
      });
      throw e;
    }

    if (includeImages && inputWithImages) {
      const candidates = FALLBACK_VISION_MODELS.filter((candidate) => candidate && isVisionCapableModel(candidate));
      for (const candidate of candidates) {
        if (candidate === requestedModel) continue;
        try {
          data = await doRequest(candidate, inputWithImages);
          usedModel = candidate;
          break;
        } catch (nextErr: any) {
          const nextMsg = nextErr?.message ? String(nextErr.message) : String(nextErr);
          const nextShouldTryFallback = isLikelyModelAccessError(nextMsg) || isLikelyVisionUnsupportedError(nextMsg);
          if (!nextShouldTryFallback) throw nextErr;
        }
      }
    }

    if (data == null && includeImages) {
      const textCandidates = [requestedTextModel, ...FALLBACK_TEXT_MODELS];
      const tried = new Set<string>();
      for (const candidate of textCandidates) {
        if (!candidate || tried.has(candidate)) continue;
        tried.add(candidate);
        try {
          data = await doRequest(candidate, inputWithoutImages);
          usedModel = candidate;
          break;
        } catch (nextErr: any) {
          const nextMsg = nextErr?.message ? String(nextErr.message) : String(nextErr);
          if (!isLikelyModelAccessError(nextMsg)) throw nextErr;
        }
      }
    } else if (data == null && !includeImages) {
      for (const candidate of FALLBACK_TEXT_MODELS) {
        if (!candidate || candidate === requestedModel) continue;
        try {
          data = await doRequest(candidate, inputWithoutImages);
          usedModel = candidate;
          break;
        } catch (nextErr: any) {
          const nextMsg = nextErr?.message ? String(nextErr.message) : String(nextErr);
          if (!isLikelyModelAccessError(nextMsg)) throw nextErr;
        }
      }
    }

    if (data == null) {
      emitOpenAiAudit({
        phase: "error",
        requestId,
        model: usedModel,
        durationMs: Date.now() - startedAtMs,
        error: msg
      });
      throw e;
    }
  }

  let responseText: string = data.output_text || "";
  let tradeProposal: TradeProposal | undefined;
  let riskUpdate: any | undefined;
  let brokerAction: BrokerAction | undefined;
  let agentToolAction: AgentToolAction | undefined;

  const outputItems: any[] = Array.isArray(data.output) ? data.output : [];

  if (!responseText) {
    const msgItem = outputItems.find(o => o.type === "message" && o.role === "assistant");
    if (msgItem?.content) {
      if (typeof msgItem.content === "string") {
        responseText = msgItem.content;
      } else if (Array.isArray(msgItem.content)) {
        responseText = msgItem.content
          .filter((p: any) => p.type?.includes("text"))
          .map((p: any) => p.text || p.output_text || "")
          .join("");
      }
    }
  }

    const normalizeToolString = (value: any) => {
      const raw = String(value || "").trim();
      return raw || undefined;
    };
    const normalizeToolNumber = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    };
    const normalizeToolBoolean = (value: any) => {
      if (typeof value === "boolean") return value;
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return undefined;
      if (["true", "1", "yes", "on"].includes(raw)) return true;
      if (["false", "0", "no", "off"].includes(raw)) return false;
      return undefined;
    };
    const normalizeToolMode = (value: any) => {
      const raw = String(value || "").trim().toLowerCase();
      if (raw === "suggest" || raw === "paper" || raw === "live") return raw;
      return undefined;
    };
    const normalizeToolTier = (value: any) => {
      const raw = String(value || "").trim().toUpperCase();
      if (["S", "A", "B", "C", "D"].includes(raw)) return raw;
      return undefined;
    };
    const normalizeToolWinRateTier = (value: any) => {
      const raw = String(value || "").trim().toUpperCase();
      if (["WR70", "WR60", "WR50", "WR40", "WR30"].includes(raw)) return raw;
      return undefined;
    };
  const normalizeToolStringList = (value: any) => {
    if (Array.isArray(value)) {
      const cleaned = value.map((item) => String(item ?? "").trim()).filter(Boolean);
      return cleaned.length > 0 ? cleaned : undefined;
    }
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    const cleaned = raw.split(",").map((part) => part.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  };
  const normalizeToolCaps = (value: any, fallback?: any) => {
    const source = value && typeof value === "object" ? value : (fallback && typeof fallback === "object" ? fallback : {});
    const next: any = {};
    const tools = normalizeToolBoolean(source.tools);
    const broker = normalizeToolBoolean(source.broker);
    const trade = normalizeToolBoolean(source.trade);
    const autoExecute = normalizeToolBoolean(source.autoExecute);
    if (typeof tools === "boolean") next.tools = tools;
    if (typeof broker === "boolean") next.broker = broker;
    if (typeof trade === "boolean") next.trade = trade;
    if (typeof autoExecute === "boolean") next.autoExecute = autoExecute;
    return Object.keys(next).length > 0 ? next : undefined;
  };

  for (const item of outputItems) {
    const type = item.type;
    if (type === "function_call" || type === "tool_call") {
      const name = item.name || item.function?.name;
      const args = safeJsonParse(item.arguments || item.args || item.function?.arguments);

       if (name === "proposeTrade") {
        const actionRaw = String(args.action || "").toUpperCase();
        const action = actionRaw === "SELL" ? "SELL" : "BUY";
        const risk = Math.abs(args.entryPrice - args.stopLoss);
        const reward = Math.abs(args.takeProfit - args.entryPrice);
        const rr = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;
        tradeProposal = {
          symbol: args.symbol,
          action,
          entryPrice: args.entryPrice,
          stopLoss: args.stopLoss,
          takeProfit: args.takeProfit,
          riskRewardRatio: rr,
          status: "PENDING",
          reason: args.reason || "Technical Setup"
        };
        tradeProposal.evidence = buildEvidenceCardFromProposal(tradeProposal);
        if (!responseText) {
          responseText = `I've identified a setup on ${args.symbol}. Reason: ${args.reason}`;
        }
      } else if (name === "updateRiskSettings") {
        riskUpdate = args;
        if (!responseText) responseText = "Updating AutoPilot parameters...";
      } else if (name === "refreshBrokerSnapshot") {
        brokerAction = {
          type: "REFRESH_BROKER",
          status: "PENDING",
          scope: args.scope || "all",
          reason: args.reason
        };
        if (!responseText) responseText = "Requesting a fresh broker snapshot...";
      } else if (name === "closePosition") {
        brokerAction = {
          type: "CLOSE_POSITION",
          status: "PENDING",
          positionId: args.positionId,
          qty: args.qty,
          symbol: args.symbol,
          reason: args.reason
        };
        if (!responseText) responseText = `Requesting to close position ${args.positionId}.`;
      } else if (name === "cancelOrder") {
        brokerAction = {
          type: "CANCEL_ORDER",
          status: "PENDING",
          orderId: args.orderId,
          symbol: args.symbol,
          reason: args.reason
        };
        if (!responseText) responseText = `Requesting to cancel order ${args.orderId}.`;
      } else if (name === "modifyPosition") {
        brokerAction = {
          type: "MODIFY_POSITION",
          status: "PENDING",
          positionId: args.positionId,
          symbol: args.symbol,
          stopLoss: args.stopLoss,
          takeProfit: args.takeProfit,
          stopLossUsd: args.stopLossUsd,
          takeProfitUsd: args.takeProfitUsd,
          trailingOffset: args.trailingOffset,
          clearStopLoss: args.clearStopLoss,
          clearTakeProfit: args.clearTakeProfit,
          reason: args.reason
        };
        if (!responseText) responseText = `Requesting to modify position ${args.positionId}.`;
      } else if (name === "modifyOrder") {
        brokerAction = {
          type: "MODIFY_ORDER",
          status: "PENDING",
          orderId: args.orderId,
          symbol: args.symbol,
          price: args.price,
          qty: args.qty,
          stopLoss: args.stopLoss,
          takeProfit: args.takeProfit,
          clearStopLoss: args.clearStopLoss,
          clearTakeProfit: args.clearTakeProfit,
          reason: args.reason
        };
        if (!responseText) responseText = `Requesting to modify order ${args.orderId}.`;
      } else if (name === "run_action_catalog") {
        if (!agentToolAction) {
          const payload = args.payload && typeof args.payload === "object" ? { ...args.payload } : {};
          if (Array.isArray(args.steps)) payload.steps = args.steps;
          if (Array.isArray(args.sequence)) payload.sequence = args.sequence;
          if (Array.isArray(args.actions)) payload.actions = args.actions;
          if (args.intent && payload.intent == null) payload.intent = args.intent;
          if (args.intentKey && payload.intentKey == null) payload.intentKey = args.intentKey;
          if (typeof args.preferFlow === "boolean") payload.preferFlow = args.preferFlow;
          if (typeof args.forceAction === "boolean") payload.forceAction = args.forceAction;
          agentToolAction = {
            type: "RUN_ACTION_CATALOG",
            status: "PENDING",
            actionId: normalizeToolString(args.actionId),
            payload: Object.keys(payload).length > 0 ? payload : undefined,
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            strategy: normalizeToolString(args.strategy),
            mode: normalizeToolMode(args.mode),
            dedupeKey: normalizeToolString(args.dedupeKey),
            source: normalizeToolString(args.source),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Queueing action task...";
      } else if (name === "getSystemState") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_SYSTEM_STATE",
            status: "PENDING",
            detail: args.detail === "full" ? "full" : "summary",
            maxItems: normalizeToolNumber(args.maxItems),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching system state snapshot...";
      } else if (name === "getAppSnapshot") {
        if (!agentToolAction) {
          const formatRaw = normalizeToolString(args.format);
          const format = formatRaw === "png" ? "png" : formatRaw === "jpeg" ? "jpeg" : undefined;
          agentToolAction = {
            type: "GET_APP_SNAPSHOT",
            status: "PENDING",
            format,
            quality: normalizeToolNumber(args.quality),
            width: normalizeToolNumber(args.width),
            height: normalizeToolNumber(args.height),
            save: normalizeToolBoolean(args.save),
            label: normalizeToolString(args.label),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Capturing app snapshot...";
      } else if (name === "getNativeChartSnapshot") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_NATIVE_CHART_SNAPSHOT",
            status: "PENDING",
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching native chart snapshot...";
      } else if (name === "getBacktestSummary") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_BACKTEST_SUMMARY",
            status: "PENDING",
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching backtest summary...";
      } else if (name === "getBacktestTrainingPack") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_BACKTEST_TRAINING_PACK",
            status: "PENDING",
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            maxEpisodes: normalizeToolNumber(args.maxEpisodes),
            offset: normalizeToolNumber(args.offset),
            limit: normalizeToolNumber(args.limit),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching backtest training pack...";
      } else if (name === "run_backtest_optimization") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "RUN_BACKTEST_OPTIMIZATION",
            status: "PENDING",
            symbol: normalizeToolString(args.symbol),
            symbols: normalizeToolStringList(args.symbols),
            timeframe: normalizeToolString(args.timeframe),
            timeframes: normalizeToolStringList(args.timeframes),
            strategy: normalizeToolString(args.strategy),
            strategyDescription: normalizeToolString(args.strategyDescription),
            rangeDays: normalizeToolNumber(args.rangeDays),
            maxCombos: normalizeToolNumber(args.maxCombos),
            timeFilter: args.timeFilter && typeof args.timeFilter === "object" ? args.timeFilter : undefined,
            params: args.params && typeof args.params === "object" ? args.params : undefined,
            paramGrid: args.paramGrid && typeof args.paramGrid === "object" ? args.paramGrid : undefined,
            presetKey: normalizeToolString(args.presetKey),
            usePreset: typeof args.usePreset === "boolean" ? args.usePreset : undefined,
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Running backtest optimization...";
      } else if (name === "start_backtest_optimizer") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "START_BACKTEST_OPTIMIZER",
            status: "PENDING",
            baselineRunId: normalizeToolString(args.baselineRunId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            strategy: normalizeToolString(args.strategy),
            strategyDescription: normalizeToolString(args.strategyDescription),
            rangeDays: normalizeToolNumber(args.rangeDays),
            maxCombos: normalizeToolNumber(args.maxCombos),
            params: args.params && typeof args.params === "object" ? args.params : undefined,
            paramGrid: args.paramGrid && typeof args.paramGrid === "object" ? args.paramGrid : undefined,
            searchSpacePreset: normalizeToolString(args.searchSpacePreset),
            objectivePreset: normalizeToolString(args.objectivePreset),
            objective: args.objective && typeof args.objective === "object" ? args.objective : undefined,
            validation: args.validation && typeof args.validation === "object" ? args.validation : undefined,
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Starting backtest optimizer...";
      } else if (name === "get_backtest_optimizer_status") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_BACKTEST_OPTIMIZER_STATUS",
            status: "PENDING",
            sessionId: normalizeToolString(args.sessionId),
            baselineRunId: normalizeToolString(args.baselineRunId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching optimizer status...";
      } else if (name === "get_backtest_optimizer_results") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_BACKTEST_OPTIMIZER_RESULTS",
            status: "PENDING",
            sessionId: normalizeToolString(args.sessionId),
            baselineRunId: normalizeToolString(args.baselineRunId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching optimizer results...";
      } else if (name === "get_optimizer_winner_params") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_OPTIMIZER_WINNER_PARAMS",
            status: "PENDING",
            winnerId: normalizeToolString(args.winnerId),
            sessionId: normalizeToolString(args.sessionId),
            round: normalizeToolNumber(args.round),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            strategy: normalizeToolString(args.strategy),
            includeHumanReadable: typeof args.includeHumanReadable === "boolean" ? args.includeHumanReadable : undefined,
            limit: normalizeToolNumber(args.limit),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching optimizer winner params...";
      } else if (name === "save_optimizer_winner_as_preset") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "SAVE_OPTIMIZER_WINNER_PRESET",
            status: "PENDING",
            winnerId: normalizeToolString(args.winnerId),
            sessionId: normalizeToolString(args.sessionId),
            round: normalizeToolNumber(args.round),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            strategy: normalizeToolString(args.strategy),
            params: args.params && typeof args.params === "object" ? args.params : undefined,
            presetName: normalizeToolString(args.presetName),
            presetKey: normalizeToolString(args.presetKey),
            tags: normalizeToolStringList(args.tags),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Saving optimizer winner preset...";
      } else if (name === "propose_backtest_optimization_refinement") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "PROPOSE_BACKTEST_OPTIMIZATION_REFINEMENT",
            status: "PENDING",
            sessionId: normalizeToolString(args.sessionId),
            baselineRunId: normalizeToolString(args.baselineRunId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Proposing optimization refinement...";
      } else if (name === "run_backtest_optimization_chain") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "RUN_BACKTEST_OPTIMIZATION_CHAIN",
            status: "PENDING",
            baselineRunId: normalizeToolString(args.baselineRunId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            strategy: normalizeToolString(args.strategy),
            strategyDescription: normalizeToolString(args.strategyDescription),
            rangeDays: normalizeToolNumber(args.rangeDays),
            maxCombos: normalizeToolNumber(args.maxCombos),
            params: args.params && typeof args.params === "object" ? args.params : undefined,
            paramGrid: args.paramGrid && typeof args.paramGrid === "object" ? args.paramGrid : undefined,
            searchSpacePreset: normalizeToolString(args.searchSpacePreset),
            objectivePreset: normalizeToolString(args.objectivePreset),
            objective: args.objective && typeof args.objective === "object" ? args.objective : undefined,
            validation: args.validation && typeof args.validation === "object" ? args.validation : undefined,
            rounds: normalizeToolNumber(args.rounds),
            hypothesis: normalizeToolString(args.hypothesis),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Running optimization chain...";
      } else if (name === "start_research_autopilot") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "START_RESEARCH_AUTOPILOT",
            status: "PENDING",
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            strategy: normalizeToolString(args.strategy),
            strategyDescription: normalizeToolString(args.strategyDescription),
            rangeDays: normalizeToolNumber(args.rangeDays),
            maxCombos: normalizeToolNumber(args.maxCombos),
            maxExperiments: normalizeToolNumber(args.maxExperiments),
            maxRuntimeSec: normalizeToolNumber(args.maxRuntimeSec),
            plateauLimit: normalizeToolNumber(args.plateauLimit),
            params: args.params && typeof args.params === "object" ? args.params : undefined,
            paramGrid: args.paramGrid && typeof args.paramGrid === "object" ? args.paramGrid : undefined,
            searchSpacePreset: normalizeToolString(args.searchSpacePreset),
            objectivePreset: normalizeToolString(args.objectivePreset),
            objective: args.objective && typeof args.objective === "object" ? args.objective : undefined,
            validation: args.validation && typeof args.validation === "object" ? args.validation : undefined,
            robustness: args.robustness && typeof args.robustness === "object" ? args.robustness : undefined,
            targetRegimeKey: normalizeToolString(args.targetRegimeKey),
            minTargetRegimeSamples: normalizeToolNumber(args.minTargetRegimeSamples),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Starting research autopilot...";
      } else if (name === "get_research_autopilot_status") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_RESEARCH_AUTOPILOT_STATUS",
            status: "PENDING",
            sessionId: normalizeToolString(args.sessionId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching research autopilot status...";
      } else if (name === "get_research_autopilot_results") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_RESEARCH_AUTOPILOT_RESULTS",
            status: "PENDING",
            sessionId: normalizeToolString(args.sessionId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching research autopilot results...";
      } else if (name === "stop_research_autopilot") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "STOP_RESEARCH_AUTOPILOT",
            status: "PENDING",
            sessionId: normalizeToolString(args.sessionId),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Stopping research autopilot...";
      } else if (name === "getBrokerQuote") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_BROKER_QUOTE",
            status: "PENDING",
            symbol: normalizeToolString(args.symbol),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching broker quote...";
      } else if (name === "getAgentMemory") {
        if (!agentToolAction) {
          agentToolAction = {
            type: "GET_AGENT_MEMORY",
            status: "PENDING",
            memoryKey: normalizeToolString(args.key),
            memoryId: normalizeToolString(args.id),
            symbol: normalizeToolString(args.symbol),
            timeframe: normalizeToolString(args.timeframe),
            kind: normalizeToolString(args.kind),
            tags: normalizeToolStringList(args.tags),
            reason: normalizeToolString(args.reason)
          };
        }
        if (!responseText) responseText = "Fetching agent memory...";
        } else if (name === "listAgentMemory") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "LIST_AGENT_MEMORY",
              status: "PENDING",
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              kind: normalizeToolString(args.kind),
              tags: normalizeToolStringList(args.tags),
              limit: normalizeToolNumber(args.limit),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Listing agent memories...";
        } else if (name === "listSetupWatchers") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "LIST_SETUP_WATCHERS",
              status: "PENDING",
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              strategy: normalizeToolString(args.strategy),
              mode: normalizeToolMode(args.mode),
              enabled: normalizeToolBoolean(args.enabled),
              limit: normalizeToolNumber(args.limit),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Listing setup watchers...";
        } else if (name === "createSetupWatcher") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "CREATE_SETUP_WATCHER",
              status: "PENDING",
              winnerId: normalizeToolString(args.winnerId),
              sessionId: normalizeToolString(args.sessionId),
              round: normalizeToolNumber(args.round),
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              strategy: normalizeToolString(args.strategy),
              params: args.params && typeof args.params === "object" ? args.params : undefined,
              playbook: args.playbook && typeof args.playbook === "object" ? args.playbook : undefined,
              mode: normalizeToolMode(args.mode),
              enabled: normalizeToolBoolean(args.enabled),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Creating setup watcher...";
        } else if (name === "updateSetupWatcher") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "UPDATE_SETUP_WATCHER",
              status: "PENDING",
              watcherId: normalizeToolString(args.watcherId),
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              strategy: normalizeToolString(args.strategy),
              params: args.params && typeof args.params === "object" ? args.params : undefined,
              playbook: args.playbook && typeof args.playbook === "object" ? args.playbook : undefined,
              mode: normalizeToolMode(args.mode),
              enabled: normalizeToolBoolean(args.enabled),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Updating setup watcher...";
        } else if (name === "deleteSetupWatcher") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "DELETE_SETUP_WATCHER",
              status: "PENDING",
              watcherId: normalizeToolString(args.watcherId),
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              strategy: normalizeToolString(args.strategy),
              mode: normalizeToolMode(args.mode),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Deleting setup watcher...";
        } else if (name === "getSetupSignals") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "GET_SETUP_SIGNALS",
              status: "PENDING",
              watcherId: normalizeToolString(args.watcherId),
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              strategy: normalizeToolString(args.strategy),
              sinceMs: normalizeToolNumber(args.sinceMs),
              limit: normalizeToolNumber(args.limit),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Fetching setup signals...";
        } else if (name === "explainSetupSignal") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "EXPLAIN_SETUP_SIGNAL",
              status: "PENDING",
              profileId: normalizeToolString(args.profileId),
              watcherId: normalizeToolString(args.watcherId),
              signalId: normalizeToolString(args.signalId),
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              includeSnapshot: normalizeToolBoolean(args.includeSnapshot),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Explaining setup signal...";
        } else if (name === "listSetupLibrary") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "LIST_SETUP_LIBRARY",
              status: "PENDING",
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              strategy: normalizeToolString(args.strategy),
              libraryTier: normalizeToolTier(args.tier),
              winRateTier: normalizeToolWinRateTier(args.winRateTier),
              limit: normalizeToolNumber(args.limit),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Listing setup library...";
        } else if (name === "createWatcherFromLibrary") {
          if (!agentToolAction) {
            agentToolAction = {
              type: "CREATE_WATCHER_FROM_LIBRARY",
              status: "PENDING",
              libraryKey: normalizeToolString(args.key || args.libraryKey || args.configKey),
              symbol: normalizeToolString(args.symbol),
              timeframe: normalizeToolString(args.timeframe),
              strategy: normalizeToolString(args.strategy),
              libraryTier: normalizeToolTier(args.tier),
              winRateTier: normalizeToolWinRateTier(args.winRateTier),
              mode: normalizeToolMode(args.mode),
              enabled: normalizeToolBoolean(args.enabled),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Creating watcher from setup library...";
        } else if (name === "updateAgentCapabilities") {
          if (!agentToolAction) {
            const capsFromObj = normalizeToolCaps(args.capabilities);
            const capsFromFlags = normalizeToolCaps({
              tools: args.tools,
              broker: args.broker,
              trade: args.trade,
              autoExecute: args.autoExecute
            });
            agentToolAction = {
              type: "UPDATE_AGENT_CAPABILITIES",
              status: "PENDING",
              agentId: normalizeToolString(args.agentId),
              agentName: normalizeToolString(args.agentName),
              capabilities: capsFromObj || capsFromFlags,
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Updating agent capabilities...";
        } else if (name === "codebase_list_files") {
          if (!agentToolAction) {
            const includeAll = normalizeToolBoolean(args.includeAll ?? args.includeAllDirs ?? args.includeSkipped);
            agentToolAction = {
              type: "CODEBASE_LIST_FILES",
              status: "PENDING",
              root: normalizeToolString(args.root) || ".",
              extensions: normalizeToolStringList(args.extensions),
              includeAll: includeAll !== false,
              maxResults: normalizeToolNumber(args.maxResults || args.limit),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Listing codebase files...";
        } else if (name === "codebase_search") {
          if (!agentToolAction) {
            const includeAll = normalizeToolBoolean(args.includeAll ?? args.includeAllDirs ?? args.includeSkipped);
            agentToolAction = {
              type: "CODEBASE_SEARCH",
              status: "PENDING",
              query: normalizeToolString(args.query || args.q),
              regex: normalizeToolBoolean(args.regex),
              caseSensitive: normalizeToolBoolean(args.caseSensitive),
              contextLines: normalizeToolNumber(args.contextLines),
              maxResults: normalizeToolNumber(args.maxResults || args.limit),
              root: normalizeToolString(args.root) || ".",
              extensions: normalizeToolStringList(args.extensions),
              includeAll: includeAll !== false,
              maxFileBytes: normalizeToolNumber(args.maxFileBytes || args.maxBytes),
              maxFileResults: normalizeToolNumber(args.maxFileResults),
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Searching the codebase...";
        } else if (name === "codebase_read_file") {
          if (!agentToolAction) {
            const maxLinesValue = normalizeToolNumber(args.maxLines || args.maxResults || args.limit);
            const fullFile = normalizeToolBoolean(args.fullFile);
            agentToolAction = {
              type: "CODEBASE_READ_FILE",
              status: "PENDING",
              path: normalizeToolString(args.path || args.file),
              startLine: normalizeToolNumber(args.startLine),
              endLine: normalizeToolNumber(args.endLine),
              maxResults: maxLinesValue,
              maxLines: maxLinesValue,
              fullFile: fullFile === true || maxLinesValue === 0,
              root: normalizeToolString(args.root) || ".",
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Reading codebase file...";
        } else if (name === "codebase_trace_dataflow") {
          if (!agentToolAction) {
            const includeAll = normalizeToolBoolean(args.includeAll ?? args.includeAllDirs ?? args.includeSkipped);
            agentToolAction = {
              type: "CODEBASE_TRACE_DATAFLOW",
              status: "PENDING",
              flowSource: normalizeToolString(args.source || args.from),
              flowSink: normalizeToolString(args.sink || args.to),
              maxResults: normalizeToolNumber(args.maxResults || args.limit),
              root: normalizeToolString(args.root) || ".",
              extensions: normalizeToolStringList(args.extensions),
              includeAll: includeAll !== false,
              reason: normalizeToolString(args.reason)
            };
          }
          if (!responseText) responseText = "Tracing data flow in codebase...";
        }
      }
    }

  const toolCalls = outputItems.filter((item) => item?.type === "function_call" || item?.type === "tool_call").length;
  const result = { text: responseText, tradeProposal, riskUpdate, brokerAction, agentToolAction };
  emitOpenAiAudit({
    phase: "complete",
    requestId,
    model: usedModel,
    requestedModel,
    fallbackUsed: usedModel !== requestedModel,
    durationMs: Date.now() - startedAtMs,
    responseChars: responseText.length,
    toolCalls
  });
  return result;
};

export const sendPlainTextToOpenAI = async (args: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  imageAttachment?: ImageAttachments;
  imageDetail?: VisionDetail;
}): Promise<string> => {
  const bridge = (window as any).glass?.openai;
  const apiKey = bridge ? null : getApiKey();
  if (!bridge && !apiKey) throw new Error("OpenAI API key missing.");

  const system = String(args?.system || "");
  const user = String(args?.user || "");
  const normalizeImages = (value: ImageAttachments): LabeledImage[] => {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    const out: LabeledImage[] = [];

    for (const item of arr) {
      if (!item) continue;
      if (typeof item === "string") {
        const s = item.trim();
        if (s) out.push({ dataUrl: s });
        continue;
      }
      if (typeof item === "object") {
        const raw = (item as any).dataUrl ?? (item as any).image ?? (item as any).image_url ?? null;
        const s = raw != null ? String(raw).trim() : "";
        const labelRaw = (item as any).label;
        const label = labelRaw != null ? String(labelRaw).trim() : "";
        if (!s && label) {
          out.push({ label });
          continue;
        }
        if (!s) continue;
        out.push(label ? { dataUrl: s, label } : { dataUrl: s });
      }
    }

    return out;
  };

  const normalizedImages = normalizeImages(args?.imageAttachment);
  const hasImages = normalizedImages.some((img) => !!img.dataUrl);
  const baseModel = args?.model ? String(args.model).trim() : (hasImages ? getVisionModel() : getTextModel());
  const model = hasImages ? coerceVisionModel(baseModel) : baseModel;
  const temperature = typeof args?.temperature === "number" && Number.isFinite(args.temperature) ? args.temperature : 0.2;
  const maxOutputTokens =
    typeof args?.maxOutputTokens === "number" && Number.isFinite(args.maxOutputTokens) ? Math.floor(args.maxOutputTokens) : 600;
  const imageDetail: VisionDetail = args?.imageDetail || getVisionDetail();

  const userContent: any = hasImages
    ? (() => {
        const parts: any[] = [{ type: "input_text", text: user }];
        for (const img of normalizedImages) {
          if (img.label) parts.push({ type: "input_text", text: img.label });
          if (img.dataUrl) parts.push({ type: "input_image", image_url: img.dataUrl, detail: imageDetail });
        }
        return parts;
      })()
    : user;

  const body: any = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: userContent }
    ],
    temperature,
    max_output_tokens: maxOutputTokens
  };

  let data: any = null;

  if (bridge?.responses) {
    const res = await bridge.responses({ body });
    if (!res?.ok) {
      const status = typeof res?.status === "number" ? res.status : null;
      const suffix = res?.requestId ? ` (request_id=${String(res.requestId)})` : "";
      throw new Error(`${res?.error ? String(res.error) : `OpenAI request failed${status ? ` (HTTP ${status})` : ""}`}${suffix}`);
    }
    data = res.data;
  } else {
    const res = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `OpenAI request failed: ${res.status}`);
    }

    data = await res.json();
  }

  let responseText: string = data?.output_text || "";
  if (!responseText) {
    const outputItems: any[] = Array.isArray(data?.output) ? data.output : [];
    const msgItem = outputItems.find((o) => o?.type === "message" && o?.role === "assistant");
    if (msgItem?.content) {
      if (typeof msgItem.content === "string") {
        responseText = msgItem.content;
      } else if (Array.isArray(msgItem.content)) {
        responseText = msgItem.content
          .filter((p: any) => String(p?.type || "").includes("text"))
          .map((p: any) => p.text || p.output_text || "")
          .join("");
      }
    }
  }

  return String(responseText || "").trim();
};

export const generateImageWithOpenAI = async (prompt: string): Promise<string> => {
  const bridge = (window as any).glass?.openai;
  const apiKey = bridge ? null : getApiKey();
  if (!bridge && !apiKey) throw new Error("OpenAI API key missing.");

  const body = {
    model: IMAGE_MODEL,
    prompt,
    size: "1024x1024",
    response_format: "b64_json"
  };

  let data: any = null;

  if (bridge?.images) {
    const res = await bridge.images({ body });
    if (!res?.ok) {
      const status = typeof res?.status === "number" ? res.status : null;
      const suffix = res?.requestId ? ` (request_id=${String(res.requestId)})` : "";
      throw new Error(`${res?.error ? String(res.error) : `OpenAI image request failed${status ? ` (HTTP ${status})` : ""}`}${suffix}`);
    }
    data = res.data;
  } else {
    const res = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `OpenAI image request failed: ${res.status}`);
    }

    data = await res.json();
  }
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from OpenAI.");
  return `data:image/png;base64,${b64}`;
};
