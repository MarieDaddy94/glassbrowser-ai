import { GoogleGenAI, GenerateContentResponse, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { Message, Agent, TradeProposal, BrokerAction, Memory, AgentToolAction } from "../types";
import { buildEvidenceCardFromProposal } from "./evidenceCard";
import { formatAgentCapabilities } from "./agentCapabilities";
import { OPENAI_TRADING_FUNCTION_TOOLS } from "./toolSchemas";

// LAYER: Service Safety Net
const detectElectron = () => {
  try {
    return Boolean((window as any)?.glass?.isElectron) || navigator.userAgent.toLowerCase().includes('electron');
  } catch {
    return false;
  }
};

const getClient = (): GoogleGenAI | null => {
  try {
    if (detectElectron()) return null;
    let apiKey: string | null = null;
    try {
      apiKey = localStorage.getItem("glass_gemini_api_key");
    } catch { /* ignore */ }
    apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.error("API_KEY is missing in environment variables.");
      return null;
    }
    return new GoogleGenAI({ apiKey });
  } catch (error) {
    console.error("Failed to initialize GoogleGenAI client:", error);
    return null;
  }
};

// Use the latest Gemini 3 models
const TEXT_MODEL = "gemini-3-pro-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";
const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-09-2025"; 
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

// --- TOOLS DEFINITION (shared) ---

const mapSchemaType = (value: any) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const type = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (type === 'string') return Type.STRING;
  if (type === 'number' || type === 'integer') return Type.NUMBER;
  if (type === 'boolean') return Type.BOOLEAN;
  if (type === 'array') return Type.ARRAY;
  return Type.OBJECT;
};

const toGeminiSchema = (schema: any): any => {
  if (!schema || typeof schema !== 'object') return { type: Type.OBJECT };
  const outType = mapSchemaType(schema.type);
  const out: any = { type: outType };
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (outType === Type.ARRAY) {
    out.items = toGeminiSchema(schema.items || {});
  }
  if (outType === Type.OBJECT) {
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const nextProps: Record<string, any> = {};
    for (const [key, value] of Object.entries(props)) {
      nextProps[key] = toGeminiSchema(value);
    }
    if (Object.keys(nextProps).length > 0) out.properties = nextProps;
    if (Array.isArray(schema.required)) out.required = schema.required;
  }
  return out;
};

const toGeminiFunction = (tool: any): FunctionDeclaration => ({
  name: tool.name,
  description: tool.description,
  parameters: toGeminiSchema(tool.parameters || { type: 'object' })
});

const GEMINI_TRADING_FUNCTIONS: FunctionDeclaration[] = OPENAI_TRADING_FUNCTION_TOOLS.map(toGeminiFunction);

// --- LIVE API HELPERS ---

export const connectToLive = async (
  activeAgent: Agent,
  allAgents: Agent[],
  callbacks: {
    onOpen: () => void;
    onMessage: (message: LiveServerMessage) => void;
    onClose: () => void;
    onError: (error: Error) => void;
  }
) => {
  const client = getClient();
  if (!client) {
    throw new Error("Gemini API Client not initialized.");
  }

  // Construct the "War Room" System Prompt
  const teamRoster = allAgents.map(a => {
    const caps = formatAgentCapabilities(a.capabilities);
    return `- ${a.name} (${a.voice || 'Default Voice'}): ${a.systemInstruction} [caps: ${caps}]`;
  }).join('\n');

  const systemInstruction = `
    You are the voice of a High-Performance Trading Team.
    
    THE TEAM ROSTER:
    ${teamRoster}
    
    CURRENT ACTIVE SPEAKER: ${activeAgent.name}
    
    INSTRUCTIONS:
    1. You are primarily acting as ${activeAgent.name}, but you are aware of the other agents.
    2. If the user asks a question relevant to another agent's expertise (e.g., asking "Risk Manager" about position sizing), you should seamlessly pivot to that persona and answer.
    3. Keep responses conversational, professional, and concise (ideal for voice).
    4. You have access to TOOLS. If asked to update risk settings, use 'updateRiskSettings'. If you see a trade, use 'proposeTrade'. You may suggest 'refreshBrokerSnapshot', 'closePosition', 'cancelOrder', 'modifyOrder', or 'modifyPosition' when the user asks for broker actions.
    5. Use 'getSystemState' for a full system snapshot (broker + autopilot + watchers + chart + backtester + tabs). If you need to execute a catalog action through the task tree, call 'run_action_catalog' with actionId + payload. UI navigation is optional and uses actionId 'ui.panel.open' or 'ui.sidebar.setMode'; tab navigation uses 'ui.tab.open'/'ui.tab.switch'/'ui.tab.close'/'ui.tab.pin'/'ui.tab.watch'. For repeatable workflows, call 'run_action_catalog' with actionId 'action_flow.list' to see learned sequences, then 'action_flow.run' with payload { intentKey } (or payload.intent to auto-select). Use 'getAppSnapshot' for app UI visuals. Use 'getNativeChartSnapshot' for native chart visuals; if chart context matters for choosing a strategy or parameters, call it before backtests/optimizations. Use 'getBacktestSummary' or 'getBacktestTrainingPack' for backtest data, 'run_backtest_optimization' for headless grid search research, and 'start_backtest_optimizer' + 'get_backtest_optimizer_status/results' for multi-objective train/test optimization. If the user describes a custom strategy or asks you to infer one, set strategy to AUTO/CUSTOM and include strategyDescription; include params when explicit values are provided. Use 'get_optimizer_winner_params' to fetch exact best params. If the user asks to save, create watchers, write setups, or promote optimizer winners, always call 'get_optimizer_winner_params' first (do not ask the user to paste params). Use 'save_optimizer_winner_as_preset' to persist winners for reuse. Use 'propose_backtest_optimization_refinement' or 'run_backtest_optimization_chain' for refinement/chained optimization. If the user asks for a "second pass", "refine", or "run it again for better win rate/drawdown", use 'run_backtest_optimization_chain' (not 'start_backtest_optimizer'). For multi-experiment research autopilot, use 'start_research_autopilot' and check progress with 'get_research_autopilot_status/results' (stop with 'stop_research_autopilot'). Use 'getBrokerQuote' for broker prices when doing analysis/confirmation (not required before proposeTrade; execution will fetch quotes). If the user requests a backtest for a specific symbol/timeframe, use 'run_backtest_optimization' with explicit symbol/timeframe (do not rely on the Backtester panel unless they ask for current panel stats). Use 'getAgentMemory'/'listAgentMemory' for stored context and chart snapshot library access (listAgentMemory kind 'chart_snapshot', then getAgentMemory for imageDataUrl/savedPath), 'listSetupLibrary'/'createWatcherFromLibrary' for setup library access, and 'listSetupWatchers'/'createSetupWatcher'/'updateSetupWatcher'/'deleteSetupWatcher'/'getSetupSignals'/'explainSetupSignal' for live setup monitoring.
    6. For batch optimization, provide 'symbols' and/or 'timeframes'. You can reuse saved grids with 'presetKey' or 'usePreset'.
    7. If the user asks to change agent permissions, use 'updateAgentCapabilities'.
  `;

  const session = await client.live.connect({
    model: LIVE_MODEL,
    callbacks: {
      onopen: callbacks.onOpen,
      onmessage: callbacks.onMessage,
      onclose: callbacks.onClose,
      onerror: (e) => callbacks.onError(new Error(e.type)),
    },
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemInstruction,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: activeAgent.voice || 'Kore' } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: [{ functionDeclarations: GEMINI_TRADING_FUNCTIONS }], // Enable tools in Live!
    },
  });

  return session;
};


// --- AUDIO UTILS ---

export function decodeAudio(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encodeAudio(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


// --- TTS METHODS ---

export const synthesizeSpeech = async (text: string, voiceName: string = 'Kore'): Promise<AudioBuffer> => {
    const bridge = (window as any)?.glass?.gemini;
    if (bridge?.tts) {
        const res = await bridge.tts({ text, voiceName });
        if (!res?.ok || !res?.data) {
            throw new Error(res?.error ? String(res.error) : "Gemini TTS failed.");
        }
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const decodedBytes = decodeAudio(String(res.data));
        return await decodeAudioData(decodedBytes, ctx, 24000, 1);
    }

    const client = getClient();
    if (!client) throw new Error("Client not initialized");

    try {
        const response = await client.models.generateContent({
            model: TTS_MODEL,
            contents: { parts: [{ text }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName }
                    }
                }
            }
        });

        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!audioData) {
            throw new Error("No audio data returned from TTS model");
        }

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const decodedBytes = decodeAudio(audioData);
        return await decodeAudioData(decodedBytes, ctx, 24000, 1);
    } catch (error) {
        console.error("TTS Error:", error);
        throw error;
    }
};


// --- TEXT/IMAGE METHODS ---

export const sendMessageToGemini = async (
  history: Message[],
  newMessage: string,
  systemContext: string = "",
  imageAttachment: string | null = null,
  allAgents: Agent[] = [],
  memories: Memory[] = [],
  monitoredUrls: string[] = [] // New: Pass monitored URLs
): Promise<{ text: string, tradeProposal?: TradeProposal, riskUpdate?: any, brokerAction?: BrokerAction, agentToolAction?: AgentToolAction }> => {
  const client = getClient();
  if (!client) {
    throw new Error("Gemini API Client not initialized. Check API Key.");
  }

  try {
    const validHistory = history.filter(msg => !msg.isError && msg.id !== 'welcome');

    const contents: any[] = [];

    validHistory.forEach(msg => {
      // 1. Handle Images in History
      if (msg.image && String(msg.image).startsWith('data:')) {
        try {
          const [mimeMetadata, base64Data] = msg.image.split(',');
          const mimeType = mimeMetadata.match(/:(.*?);/)?.[1] || 'image/png';
          contents.push({
            role: 'user',
            parts: [
               { inlineData: { mimeType, data: base64Data } },
               { text: `[System]: The following image was shared/generated by ${msg.role === 'model' ? (msg.agentName || 'an agent') : 'the user'}.` }
            ]
          });
        } catch (e) { /* Ignore malformed images */ }
      }

      // 2. Handle Text in History
      if (msg.text) {
        let textContent = msg.text;
        if (msg.role === 'model' && msg.agentName) {
          textContent = `[${msg.agentName}]: ${textContent}`;
        }
        // If message had a trade proposal, append context about it
        if (msg.tradeProposal) {
            textContent += `\n[System]: I proposed a trade: ${msg.tradeProposal.action} ${msg.tradeProposal.symbol} @ ${msg.tradeProposal.entryPrice}`;
        }
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: textContent }]
        });
      }
    });

    // 3. Current Message
    const currentParts: any[] = [];
    if (imageAttachment && String(imageAttachment).startsWith('data:')) {
        const [mimeMetadata, base64Data] = imageAttachment.split(',');
        const mimeType = mimeMetadata.match(/:(.*?);/)?.[1] || 'image/png';
        currentParts.push({
            inlineData: { mimeType: mimeType, data: base64Data }
        });
    }
    currentParts.push({ text: newMessage });
    contents.push({ role: 'user', parts: currentParts });

    // 4. Roster & Instructions & Memories
    const agentRoster = allAgents.map(a => {
        const roleDesc = a.systemInstruction ? `(Role: ${a.systemInstruction})` : '(Role: General Assistant)';
        const caps = formatAgentCapabilities(a.capabilities);
        return `- ${a.name} ${roleDesc} [caps: ${caps}]`;
    }).join('\n');

    const memoryLog = memories.length > 0 
        ? `PAST PERFORMANCE MEMORY (LEARN FROM THIS):\n${memories.map(m => `- [${m.type}] ${m.text}`).join('\n')}` 
        : "PAST PERFORMANCE MEMORY: None yet.";

    const monitoredContext = monitoredUrls.length > 0
        ? `BACKGROUND MONITORED FEEDS (WATCH THESE URLs CLOSELY EVEN IF USER IS ELSEWHERE):\n${monitoredUrls.map(url => `- ${url}`).join('\n')}`
        : "BACKGROUND MONITORED FEEDS: None.";

    const response: GenerateContentResponse = await client.models.generateContent({
      model: TEXT_MODEL,
      contents: contents,
      config: {
        tools: [{ functionDeclarations: GEMINI_TRADING_FUNCTIONS }],
        systemInstruction: `You are an intelligent agent in a High-Performance Trading Team.
        
        YOUR IDENTITY:
        ${systemContext}
        
        THE TEAM:
        ${agentRoster}

        ${memoryLog}
        
        ${monitoredContext}

        CAPABILITIES:
        - You share a "Visual Context" (Live Vision).
        - You are monitoring the BACKGROUND FEEDS listed above. Even if the user is browsing YouTube, you must pay attention to the TradingView tabs if listed there.
        - If you see a good trade setup based on your role, call the 'proposeTrade' tool. YOU MUST PROVIDE A 'reason' argument.
        - Use the PAST PERFORMANCE MEMORY to avoid repeating losses and replicate winning patterns.
        - If the user asks to change risk settings (e.g. "set daily loss to 500" or "set spread limit to 0.2%"), call 'updateRiskSettings'.
        - If you need a full system snapshot (broker + autopilot + watchers + chart + backtester + tabs), call 'getSystemState'.
        - If you need a visual of the app UI, call 'getAppSnapshot'.
        - For multi-step trade sessions (watch chart, analyze, backtest, optimize, trade), call 'run_action_catalog' with actionId 'playbook.run' and payload { playbookId: 'playbook.trade_session_mtf.v1', symbol } (override symbol/timeframe/strategy as needed). For ad-hoc multi-step sequences, pass steps/sequence to 'run_action_catalog' to queue a playbook.
        - For repeatable workflows, call 'run_action_catalog' with actionId 'action_flow.list' to see learned sequences, then 'action_flow.run' with payload { intentKey } (or payload.intent to auto-select).
        - If the user asks to navigate UI panels, use 'run_action_catalog' with actionId 'ui.panel.open' or 'ui.sidebar.setMode' (payload { panel: 'backtester' | 'chart' | 'autopilot' | ... }). UI navigation is optional; headless actions still work.
        - If the user asks to open/switch/close tabs, use 'run_action_catalog' with actionId 'ui.tab.open' | 'ui.tab.switch' | 'ui.tab.close' | 'ui.tab.pin' | 'ui.tab.watch'.
        - If you need broker-accurate prices for analysis/confirmation, call 'getBrokerQuote'. If the user explicitly requests a trade execution, proceed with 'proposeTrade' (execution will fetch quotes). If you need app UI visuals, call 'getAppSnapshot'. If you need native chart visuals, call 'getNativeChartSnapshot'. If chart context matters for strategy selection, call it before backtests/optimizations.
        - If you need backtest stats or training data, call 'getBacktestSummary' or 'getBacktestTrainingPack'.
        - If you need headless grid search optimization, call 'run_backtest_optimization'.
        - If you need multi-objective train/test optimization, call 'start_backtest_optimizer' and then 'get_backtest_optimizer_status' / 'get_backtest_optimizer_results'. Use 'get_optimizer_winner_params' to fetch exact winner params. If the user asks to save, create watchers, write setups, or promote winners, call 'get_optimizer_winner_params' first (do not ask the user to paste params). Use 'save_optimizer_winner_as_preset' to persist winners for reuse. Use 'propose_backtest_optimization_refinement' or 'run_backtest_optimization_chain' for refinement/chained optimization. If the user asks for a "second pass", "refine", or "run it again for better win rate/drawdown", use 'run_backtest_optimization_chain' (not 'start_backtest_optimizer'). If the user describes a custom strategy or asks you to infer one, set strategy to AUTO/CUSTOM and include strategyDescription; include params when explicit values are provided.
        - For multi-experiment research autopilot sessions, call 'start_research_autopilot' and check progress with 'get_research_autopilot_status' / 'get_research_autopilot_results' (stop with 'stop_research_autopilot').
        - To manage live setups, call 'listSetupWatchers', 'createSetupWatcher', 'updateSetupWatcher', 'deleteSetupWatcher', 'getSetupSignals', or 'explainSetupSignal'.
        - To browse library-ranked setups, call 'listSetupLibrary' or 'createWatcherFromLibrary'.
        - For batch optimization, provide 'symbols' and/or 'timeframes'. You can reuse saved grids with 'presetKey' or 'usePreset'.
        - If the user asks to change agent permissions, call 'updateAgentCapabilities'.
        - If you need stored context, call 'getAgentMemory' or 'listAgentMemory'. For chart snapshot library access, use listAgentMemory with kind 'chart_snapshot', then getAgentMemory for imageDataUrl/savedPath.
        - You can call 'refreshBrokerSnapshot' to request a fresh broker pull. You may suggest 'closePosition', 'cancelOrder', 'modifyOrder', or 'modifyPosition', but these require user confirmation. If the user gives a $ SL/TP target, use stopLossUsd/takeProfitUsd. Use modifyOrder for pending orders and modifyPosition for filled positions.
        - Be precise with numbers. 
        - Communicate concisely.
        `,
      },
    });

    // 5. Parse Response & Function Calls
    let responseText = response.text || "";
    let tradeProposal: TradeProposal | undefined;
    let riskUpdate: any | undefined;
    let brokerAction: BrokerAction | undefined;
    let agentToolAction: AgentToolAction | undefined;

    // Check for function calls
    const candidates = response.candidates || [];
    if (candidates.length > 0) {
        const parts = candidates[0].content?.parts || [];
          const normalizeToolString = (value: any) => {
              const raw = String(value || '').trim();
              return raw || undefined;
          };
          const normalizeToolNumber = (value: any) => {
              const num = Number(value);
              return Number.isFinite(num) ? num : undefined;
          };
          const normalizeToolBoolean = (value: any) => {
              if (typeof value === 'boolean') return value;
              const raw = String(value || '').trim().toLowerCase();
              if (!raw) return undefined;
              if (['true', '1', 'yes', 'on'].includes(raw)) return true;
              if (['false', '0', 'no', 'off'].includes(raw)) return false;
              return undefined;
          };
          const normalizeToolMode = (value: any) => {
              const raw = String(value || '').trim().toLowerCase();
              if (raw === 'suggest' || raw === 'paper' || raw === 'live') return raw;
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
        const normalizeToolCaps = (value: any, fallback?: any) => {
            const source = value && typeof value === 'object' ? value : (fallback && typeof fallback === 'object' ? fallback : {});
            const next: any = {};
            const tools = normalizeToolBoolean(source.tools);
            const broker = normalizeToolBoolean(source.broker);
            const trade = normalizeToolBoolean(source.trade);
            const autoExecute = normalizeToolBoolean(source.autoExecute);
            if (typeof tools === 'boolean') next.tools = tools;
            if (typeof broker === 'boolean') next.broker = broker;
            if (typeof trade === 'boolean') next.trade = trade;
            if (typeof autoExecute === 'boolean') next.autoExecute = autoExecute;
            return Object.keys(next).length > 0 ? next : undefined;
        };

        for (const part of parts) {
            if (part.functionCall) {
                const fc = part.functionCall;
                if (fc.name === 'proposeTrade') {
                    const args = fc.args as any;
                    const risk = Math.abs(args.entryPrice - args.stopLoss);
                    const reward = Math.abs(args.takeProfit - args.entryPrice);
                    const rr = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 0;

                    tradeProposal = {
                        symbol: args.symbol,
                        action: args.action.toUpperCase(),
                        entryPrice: args.entryPrice,
                        stopLoss: args.stopLoss,
                        takeProfit: args.takeProfit,
                        riskRewardRatio: rr,
                        status: 'PENDING',
                        reason: args.reason || "Technical Setup"
                    };
                    tradeProposal.evidence = buildEvidenceCardFromProposal(tradeProposal);
                    if (!responseText) {
                        responseText = `I've identified a setup on ${args.symbol}. Reason: ${args.reason}`;
                    }
                } else if (fc.name === 'updateRiskSettings') {
                    riskUpdate = fc.args;
                    if (!responseText) {
                         responseText = `Updating AutoPilot parameters...`;
                    }
                } else if (fc.name === 'refreshBrokerSnapshot') {
                    brokerAction = {
                        type: 'REFRESH_BROKER',
                        status: 'PENDING',
                        scope: (fc.args as any)?.scope || 'all',
                        reason: (fc.args as any)?.reason
                    };
                    if (!responseText) responseText = 'Requesting a fresh broker snapshot...';
                } else if (fc.name === 'closePosition') {
                    brokerAction = {
                        type: 'CLOSE_POSITION',
                        status: 'PENDING',
                        positionId: (fc.args as any)?.positionId,
                        qty: (fc.args as any)?.qty,
                        symbol: (fc.args as any)?.symbol,
                        reason: (fc.args as any)?.reason
                    };
                    if (!responseText) responseText = `Requesting to close position ${(fc.args as any)?.positionId}.`;
                } else if (fc.name === 'cancelOrder') {
                    brokerAction = {
                        type: 'CANCEL_ORDER',
                        status: 'PENDING',
                        orderId: (fc.args as any)?.orderId,
                        symbol: (fc.args as any)?.symbol,
                        reason: (fc.args as any)?.reason
                    };
                    if (!responseText) responseText = `Requesting to cancel order ${(fc.args as any)?.orderId}.`;
                } else if (fc.name === 'modifyPosition') {
                    brokerAction = {
                        type: 'MODIFY_POSITION',
                        status: 'PENDING',
                        positionId: (fc.args as any)?.positionId,
                        symbol: (fc.args as any)?.symbol,
                        stopLoss: (fc.args as any)?.stopLoss,
                        takeProfit: (fc.args as any)?.takeProfit,
                        stopLossUsd: (fc.args as any)?.stopLossUsd,
                        takeProfitUsd: (fc.args as any)?.takeProfitUsd,
                        trailingOffset: (fc.args as any)?.trailingOffset,
                        clearStopLoss: (fc.args as any)?.clearStopLoss,
                        clearTakeProfit: (fc.args as any)?.clearTakeProfit,
                        reason: (fc.args as any)?.reason
                    };
                    if (!responseText) responseText = `Requesting to modify position ${(fc.args as any)?.positionId}.`;
                } else if (fc.name === 'modifyOrder') {
                    brokerAction = {
                        type: 'MODIFY_ORDER',
                        status: 'PENDING',
                        orderId: (fc.args as any)?.orderId,
                        symbol: (fc.args as any)?.symbol,
                        price: (fc.args as any)?.price,
                        qty: (fc.args as any)?.qty,
                        stopLoss: (fc.args as any)?.stopLoss,
                        takeProfit: (fc.args as any)?.takeProfit,
                        clearStopLoss: (fc.args as any)?.clearStopLoss,
                        clearTakeProfit: (fc.args as any)?.clearTakeProfit,
                        reason: (fc.args as any)?.reason
                    };
                    if (!responseText) responseText = `Requesting to modify order ${(fc.args as any)?.orderId}.`;
                } else if (fc.name === 'run_action_catalog') {
                    if (!agentToolAction) {
                        const args = (fc.args as any) || {};
                        const payload = args.payload && typeof args.payload === 'object' ? { ...args.payload } : {};
                        if (Array.isArray(args.steps)) payload.steps = args.steps;
                        if (Array.isArray(args.sequence)) payload.sequence = args.sequence;
                        if (Array.isArray(args.actions)) payload.actions = args.actions;
                        if (args.intent && payload.intent == null) payload.intent = args.intent;
                        if (args.intentKey && payload.intentKey == null) payload.intentKey = args.intentKey;
                        if (typeof args.preferFlow === 'boolean') payload.preferFlow = args.preferFlow;
                        if (typeof args.forceAction === 'boolean') payload.forceAction = args.forceAction;
                        agentToolAction = {
                            type: 'RUN_ACTION_CATALOG',
                            status: 'PENDING',
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
                    if (!responseText) responseText = 'Queueing action task...';
                } else if (fc.name === 'getSystemState') {
                    if (!agentToolAction) {
                        const detailRaw = normalizeToolString((fc.args as any)?.detail);
                        const detail = detailRaw === 'full' ? 'full' : detailRaw === 'summary' ? 'summary' : undefined;
                        agentToolAction = {
                            type: 'GET_SYSTEM_STATE',
                            status: 'PENDING',
                            detail,
                            maxItems: normalizeToolNumber((fc.args as any)?.maxItems),
                            reason: normalizeToolString((fc.args as any)?.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching system state snapshot...';
                } else if (fc.name === 'getAppSnapshot') {
                    if (!agentToolAction) {
                        const formatRaw = normalizeToolString((fc.args as any)?.format);
                        const format = formatRaw === 'png' ? 'png' : formatRaw === 'jpeg' ? 'jpeg' : undefined;
                        agentToolAction = {
                            type: 'GET_APP_SNAPSHOT',
                            status: 'PENDING',
                            format,
                            quality: normalizeToolNumber((fc.args as any)?.quality),
                            width: normalizeToolNumber((fc.args as any)?.width),
                            height: normalizeToolNumber((fc.args as any)?.height),
                            save: normalizeToolBoolean((fc.args as any)?.save),
                            label: normalizeToolString((fc.args as any)?.label),
                            reason: normalizeToolString((fc.args as any)?.reason)
                        };
                    }
                    if (!responseText) responseText = 'Capturing app snapshot...';
                } else if (fc.name === 'getNativeChartSnapshot') {
                    if (!agentToolAction) {
                        agentToolAction = {
                            type: 'GET_NATIVE_CHART_SNAPSHOT',
                            status: 'PENDING',
                            symbol: normalizeToolString((fc.args as any)?.symbol),
                            timeframe: normalizeToolString((fc.args as any)?.timeframe),
                            reason: normalizeToolString((fc.args as any)?.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching native chart snapshot...';
                } else if (fc.name === 'getBacktestSummary') {
                    if (!agentToolAction) {
                        agentToolAction = {
                            type: 'GET_BACKTEST_SUMMARY',
                            status: 'PENDING',
                            symbol: normalizeToolString((fc.args as any)?.symbol),
                            timeframe: normalizeToolString((fc.args as any)?.timeframe),
                            reason: normalizeToolString((fc.args as any)?.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching backtest summary...';
                } else if (fc.name === 'getBacktestTrainingPack') {
                    if (!agentToolAction) {
                        agentToolAction = {
                            type: 'GET_BACKTEST_TRAINING_PACK',
                            status: 'PENDING',
                            symbol: normalizeToolString((fc.args as any)?.symbol),
                            timeframe: normalizeToolString((fc.args as any)?.timeframe),
                            maxEpisodes: normalizeToolNumber((fc.args as any)?.maxEpisodes),
                            offset: normalizeToolNumber((fc.args as any)?.offset),
                            limit: normalizeToolNumber((fc.args as any)?.limit),
                            reason: normalizeToolString((fc.args as any)?.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching backtest training pack...';
                } else if (fc.name === 'run_backtest_optimization') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'RUN_BACKTEST_OPTIMIZATION',
                            status: 'PENDING',
                            symbol: normalizeToolString(rawArgs.symbol),
                            symbols: normalizeToolStringList(rawArgs.symbols),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            timeframes: normalizeToolStringList(rawArgs.timeframes),
                            strategy: normalizeToolString(rawArgs.strategy),
                            strategyDescription: normalizeToolString(rawArgs.strategyDescription),
                            rangeDays: normalizeToolNumber(rawArgs.rangeDays),
                            maxCombos: normalizeToolNumber(rawArgs.maxCombos),
                            timeFilter: rawArgs.timeFilter && typeof rawArgs.timeFilter === 'object' ? rawArgs.timeFilter : undefined,
                            params: rawArgs.params && typeof rawArgs.params === 'object' ? rawArgs.params : undefined,
                            paramGrid: rawArgs.paramGrid && typeof rawArgs.paramGrid === 'object' ? rawArgs.paramGrid : undefined,
                            presetKey: normalizeToolString(rawArgs.presetKey),
                            usePreset: typeof rawArgs.usePreset === 'boolean' ? rawArgs.usePreset : undefined,
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Running backtest optimization...';
                } else if (fc.name === 'start_backtest_optimizer') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'START_BACKTEST_OPTIMIZER',
                            status: 'PENDING',
                            baselineRunId: normalizeToolString(rawArgs.baselineRunId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            strategy: normalizeToolString(rawArgs.strategy),
                            strategyDescription: normalizeToolString(rawArgs.strategyDescription),
                            rangeDays: normalizeToolNumber(rawArgs.rangeDays),
                            maxCombos: normalizeToolNumber(rawArgs.maxCombos),
                            params: rawArgs.params && typeof rawArgs.params === 'object' ? rawArgs.params : undefined,
                            paramGrid: rawArgs.paramGrid && typeof rawArgs.paramGrid === 'object' ? rawArgs.paramGrid : undefined,
                            searchSpacePreset: normalizeToolString(rawArgs.searchSpacePreset),
                            objectivePreset: normalizeToolString(rawArgs.objectivePreset),
                            objective: rawArgs.objective && typeof rawArgs.objective === 'object' ? rawArgs.objective : undefined,
                            validation: rawArgs.validation && typeof rawArgs.validation === 'object' ? rawArgs.validation : undefined,
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Starting backtest optimizer...';
                } else if (fc.name === 'get_backtest_optimizer_status') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'GET_BACKTEST_OPTIMIZER_STATUS',
                            status: 'PENDING',
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            baselineRunId: normalizeToolString(rawArgs.baselineRunId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching optimizer status...';
                } else if (fc.name === 'get_backtest_optimizer_results') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'GET_BACKTEST_OPTIMIZER_RESULTS',
                            status: 'PENDING',
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            baselineRunId: normalizeToolString(rawArgs.baselineRunId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching optimizer results...';
                } else if (fc.name === 'get_optimizer_winner_params') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'GET_OPTIMIZER_WINNER_PARAMS',
                            status: 'PENDING',
                            winnerId: normalizeToolString(rawArgs.winnerId),
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            round: normalizeToolNumber(rawArgs.round),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            strategy: normalizeToolString(rawArgs.strategy),
                            includeHumanReadable: typeof rawArgs.includeHumanReadable === 'boolean' ? rawArgs.includeHumanReadable : undefined,
                            limit: normalizeToolNumber(rawArgs.limit),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching optimizer winner params...';
                } else if (fc.name === 'save_optimizer_winner_as_preset') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'SAVE_OPTIMIZER_WINNER_PRESET',
                            status: 'PENDING',
                            winnerId: normalizeToolString(rawArgs.winnerId),
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            round: normalizeToolNumber(rawArgs.round),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            strategy: normalizeToolString(rawArgs.strategy),
                            params: rawArgs.params && typeof rawArgs.params === 'object' ? rawArgs.params : undefined,
                            presetName: normalizeToolString(rawArgs.presetName),
                            presetKey: normalizeToolString(rawArgs.presetKey),
                            tags: normalizeToolStringList(rawArgs.tags),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Saving optimizer winner preset...';
                } else if (fc.name === 'propose_backtest_optimization_refinement') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'PROPOSE_BACKTEST_OPTIMIZATION_REFINEMENT',
                            status: 'PENDING',
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            baselineRunId: normalizeToolString(rawArgs.baselineRunId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Proposing optimization refinement...';
                } else if (fc.name === 'run_backtest_optimization_chain') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'RUN_BACKTEST_OPTIMIZATION_CHAIN',
                            status: 'PENDING',
                            baselineRunId: normalizeToolString(rawArgs.baselineRunId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            strategy: normalizeToolString(rawArgs.strategy),
                            strategyDescription: normalizeToolString(rawArgs.strategyDescription),
                            rangeDays: normalizeToolNumber(rawArgs.rangeDays),
                            maxCombos: normalizeToolNumber(rawArgs.maxCombos),
                            params: rawArgs.params && typeof rawArgs.params === 'object' ? rawArgs.params : undefined,
                            paramGrid: rawArgs.paramGrid && typeof rawArgs.paramGrid === 'object' ? rawArgs.paramGrid : undefined,
                            searchSpacePreset: normalizeToolString(rawArgs.searchSpacePreset),
                            objectivePreset: normalizeToolString(rawArgs.objectivePreset),
                            objective: rawArgs.objective && typeof rawArgs.objective === 'object' ? rawArgs.objective : undefined,
                            validation: rawArgs.validation && typeof rawArgs.validation === 'object' ? rawArgs.validation : undefined,
                            rounds: normalizeToolNumber(rawArgs.rounds),
                            hypothesis: normalizeToolString(rawArgs.hypothesis),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Running optimization chain...';
                } else if (fc.name === 'start_research_autopilot') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'START_RESEARCH_AUTOPILOT',
                            status: 'PENDING',
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            strategy: normalizeToolString(rawArgs.strategy),
                            strategyDescription: normalizeToolString(rawArgs.strategyDescription),
                            rangeDays: normalizeToolNumber(rawArgs.rangeDays),
                            maxCombos: normalizeToolNumber(rawArgs.maxCombos),
                            maxExperiments: normalizeToolNumber(rawArgs.maxExperiments),
                            maxRuntimeSec: normalizeToolNumber(rawArgs.maxRuntimeSec),
                            plateauLimit: normalizeToolNumber(rawArgs.plateauLimit),
                            params: rawArgs.params && typeof rawArgs.params === 'object' ? rawArgs.params : undefined,
                            paramGrid: rawArgs.paramGrid && typeof rawArgs.paramGrid === 'object' ? rawArgs.paramGrid : undefined,
                            searchSpacePreset: normalizeToolString(rawArgs.searchSpacePreset),
                            objectivePreset: normalizeToolString(rawArgs.objectivePreset),
                            objective: rawArgs.objective && typeof rawArgs.objective === 'object' ? rawArgs.objective : undefined,
                            validation: rawArgs.validation && typeof rawArgs.validation === 'object' ? rawArgs.validation : undefined,
                            robustness: rawArgs.robustness && typeof rawArgs.robustness === 'object' ? rawArgs.robustness : undefined,
                            targetRegimeKey: normalizeToolString(rawArgs.targetRegimeKey),
                            minTargetRegimeSamples: normalizeToolNumber(rawArgs.minTargetRegimeSamples),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Starting research autopilot...';
                } else if (fc.name === 'get_research_autopilot_status') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'GET_RESEARCH_AUTOPILOT_STATUS',
                            status: 'PENDING',
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching research autopilot status...';
                } else if (fc.name === 'get_research_autopilot_results') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'GET_RESEARCH_AUTOPILOT_RESULTS',
                            status: 'PENDING',
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching research autopilot results...';
                } else if (fc.name === 'stop_research_autopilot') {
                    if (!agentToolAction) {
                        const rawArgs = (fc.args as any) || {};
                        agentToolAction = {
                            type: 'STOP_RESEARCH_AUTOPILOT',
                            status: 'PENDING',
                            sessionId: normalizeToolString(rawArgs.sessionId),
                            symbol: normalizeToolString(rawArgs.symbol),
                            timeframe: normalizeToolString(rawArgs.timeframe),
                            reason: normalizeToolString(rawArgs.reason)
                        };
                    }
                    if (!responseText) responseText = 'Stopping research autopilot...';
                } else if (fc.name === 'getBrokerQuote') {
                    if (!agentToolAction) {
                        agentToolAction = {
                            type: 'GET_BROKER_QUOTE',
                            status: 'PENDING',
                            symbol: normalizeToolString((fc.args as any)?.symbol),
                            reason: normalizeToolString((fc.args as any)?.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching broker quote...';
                } else if (fc.name === 'getAgentMemory') {
                    if (!agentToolAction) {
                        agentToolAction = {
                            type: 'GET_AGENT_MEMORY',
                            status: 'PENDING',
                            memoryKey: normalizeToolString((fc.args as any)?.key),
                            memoryId: normalizeToolString((fc.args as any)?.id),
                            symbol: normalizeToolString((fc.args as any)?.symbol),
                            timeframe: normalizeToolString((fc.args as any)?.timeframe),
                            kind: normalizeToolString((fc.args as any)?.kind),
                            tags: normalizeToolStringList((fc.args as any)?.tags),
                            reason: normalizeToolString((fc.args as any)?.reason)
                        };
                    }
                    if (!responseText) responseText = 'Fetching agent memory...';
                  } else if (fc.name === 'listAgentMemory') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'LIST_AGENT_MEMORY',
                              status: 'PENDING',
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              kind: normalizeToolString((fc.args as any)?.kind),
                              tags: normalizeToolStringList((fc.args as any)?.tags),
                              limit: normalizeToolNumber((fc.args as any)?.limit),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Listing agent memories...';
                  } else if (fc.name === 'listSetupWatchers') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'LIST_SETUP_WATCHERS',
                              status: 'PENDING',
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              strategy: normalizeToolString((fc.args as any)?.strategy),
                              mode: normalizeToolMode((fc.args as any)?.mode),
                              enabled: normalizeToolBoolean((fc.args as any)?.enabled),
                              limit: normalizeToolNumber((fc.args as any)?.limit),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Listing setup watchers...';
                  } else if (fc.name === 'createSetupWatcher') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'CREATE_SETUP_WATCHER',
                              status: 'PENDING',
                              winnerId: normalizeToolString((fc.args as any)?.winnerId),
                              sessionId: normalizeToolString((fc.args as any)?.sessionId),
                              round: normalizeToolNumber((fc.args as any)?.round),
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              strategy: normalizeToolString((fc.args as any)?.strategy),
                              params: (fc.args as any)?.params && typeof (fc.args as any)?.params === 'object'
                                  ? (fc.args as any)?.params
                                  : undefined,
                              playbook: (fc.args as any)?.playbook && typeof (fc.args as any)?.playbook === 'object'
                                  ? (fc.args as any)?.playbook
                                  : undefined,
                              mode: normalizeToolMode((fc.args as any)?.mode),
                              enabled: normalizeToolBoolean((fc.args as any)?.enabled),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Creating setup watcher...';
                  } else if (fc.name === 'updateSetupWatcher') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'UPDATE_SETUP_WATCHER',
                              status: 'PENDING',
                              watcherId: normalizeToolString((fc.args as any)?.watcherId),
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              strategy: normalizeToolString((fc.args as any)?.strategy),
                              params: (fc.args as any)?.params && typeof (fc.args as any)?.params === 'object'
                                  ? (fc.args as any)?.params
                                  : undefined,
                              playbook: (fc.args as any)?.playbook && typeof (fc.args as any)?.playbook === 'object'
                                  ? (fc.args as any)?.playbook
                                  : undefined,
                              mode: normalizeToolMode((fc.args as any)?.mode),
                              enabled: normalizeToolBoolean((fc.args as any)?.enabled),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Updating setup watcher...';
                  } else if (fc.name === 'deleteSetupWatcher') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'DELETE_SETUP_WATCHER',
                              status: 'PENDING',
                              watcherId: normalizeToolString((fc.args as any)?.watcherId),
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              strategy: normalizeToolString((fc.args as any)?.strategy),
                              mode: normalizeToolMode((fc.args as any)?.mode),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Deleting setup watcher...';
                  } else if (fc.name === 'getSetupSignals') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'GET_SETUP_SIGNALS',
                              status: 'PENDING',
                              watcherId: normalizeToolString((fc.args as any)?.watcherId),
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              strategy: normalizeToolString((fc.args as any)?.strategy),
                              sinceMs: normalizeToolNumber((fc.args as any)?.sinceMs),
                              limit: normalizeToolNumber((fc.args as any)?.limit),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Fetching setup signals...';
                  } else if (fc.name === 'explainSetupSignal') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'EXPLAIN_SETUP_SIGNAL',
                              status: 'PENDING',
                              profileId: normalizeToolString((fc.args as any)?.profileId),
                              watcherId: normalizeToolString((fc.args as any)?.watcherId),
                              signalId: normalizeToolString((fc.args as any)?.signalId),
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              includeSnapshot: normalizeToolBoolean((fc.args as any)?.includeSnapshot),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Explaining setup signal...';
                  } else if (fc.name === 'listSetupLibrary') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'LIST_SETUP_LIBRARY',
                              status: 'PENDING',
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              strategy: normalizeToolString((fc.args as any)?.strategy),
                              libraryTier: normalizeToolTier((fc.args as any)?.tier),
                              winRateTier: normalizeToolWinRateTier((fc.args as any)?.winRateTier),
                              limit: normalizeToolNumber((fc.args as any)?.limit),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Listing setup library...';
                  } else if (fc.name === 'createWatcherFromLibrary') {
                      if (!agentToolAction) {
                          agentToolAction = {
                              type: 'CREATE_WATCHER_FROM_LIBRARY',
                              status: 'PENDING',
                              libraryKey: normalizeToolString((fc.args as any)?.key || (fc.args as any)?.libraryKey || (fc.args as any)?.configKey),
                              symbol: normalizeToolString((fc.args as any)?.symbol),
                              timeframe: normalizeToolString((fc.args as any)?.timeframe),
                              strategy: normalizeToolString((fc.args as any)?.strategy),
                              libraryTier: normalizeToolTier((fc.args as any)?.tier),
                              winRateTier: normalizeToolWinRateTier((fc.args as any)?.winRateTier),
                              mode: normalizeToolMode((fc.args as any)?.mode),
                              enabled: normalizeToolBoolean((fc.args as any)?.enabled),
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Creating watcher from setup library...';
                  } else if (fc.name === 'updateAgentCapabilities') {
                      if (!agentToolAction) {
                          const capsFromObj = normalizeToolCaps((fc.args as any)?.capabilities);
                          const capsFromFlags = normalizeToolCaps({
                              tools: (fc.args as any)?.tools,
                              broker: (fc.args as any)?.broker,
                              trade: (fc.args as any)?.trade,
                              autoExecute: (fc.args as any)?.autoExecute
                          });
                          agentToolAction = {
                              type: 'UPDATE_AGENT_CAPABILITIES',
                              status: 'PENDING',
                              agentId: normalizeToolString((fc.args as any)?.agentId),
                              agentName: normalizeToolString((fc.args as any)?.agentName),
                              capabilities: capsFromObj || capsFromFlags,
                              reason: normalizeToolString((fc.args as any)?.reason)
                          };
                      }
                      if (!responseText) responseText = 'Updating agent capabilities...';
                  }
            }
        }
    }

    return { text: responseText, tradeProposal, riskUpdate, brokerAction, agentToolAction };
  } catch (error) {
    console.error("Gemini API Error (Text/Vision):", error);
    throw error;
  }
};

export const generateImageWithGemini = async (prompt: string): Promise<string> => {
  const client = getClient();
  if (!client) {
    throw new Error("Gemini API Client not initialized.");
  }

  try {
    const response = await client.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part?.inlineData?.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("No image data found");
  } catch (error) {
    console.error("Gemini API Error (Image):", error);
    throw error;
  }
};
