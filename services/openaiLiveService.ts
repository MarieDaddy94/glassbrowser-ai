import { Agent } from "../types";
import { OPENAI_LIVE_FUNCTION_TOOLS, toRealtimeTools } from "./toolSchemas";

const isAllowedLiveModel = (value: string): boolean => {
  const model = String(value || "").trim().toLowerCase();
  return model.startsWith("gpt-5.2");
};

const getLiveModel = () => {
  try {
    const stored = localStorage.getItem("glass_openai_live_model");
    if (stored && isAllowedLiveModel(stored)) return stored;
  } catch { /* ignore */ }
  const candidate = process.env.OPENAI_LIVE_MODEL || "gpt-5.2";
  return isAllowedLiveModel(candidate) ? candidate : "gpt-5.2";
};

// --- TOOLS DEFINITION (shared) ---

export const connectToOpenAILive = async (
  activeAgent: Agent,
  allAgents: Agent[],
  callbacks: {
    onOpen: () => void;
    onMessage: (message: any) => void;
    onClose: () => void;
    onError: (error: Error) => void;
  }
) => {
  const bridge = (window as any).glass?.live;
  if (!bridge) {
    throw new Error("OpenAI Live bridge not available (preload not loaded).");
  }

  // Construct the "War Room" System Prompt
  const teamRoster = allAgents
    .map(a => `- ${a.name} (${a.voice || "Default Voice"}): ${a.systemInstruction}`)
    .join("\n");

  const systemInstruction = `
You are the voice of a High-Performance Trading Team.

THE TEAM ROSTER:
${teamRoster}

CURRENT ACTIVE SPEAKER: ${activeAgent.name}

INSTRUCTIONS:
1. You are primarily acting as ${activeAgent.name}, but you are aware of the other agents.
2. If the user asks a question relevant to another agent's expertise (e.g., asking "Risk Manager" about position sizing), you should seamlessly pivot to that persona and answer.
3. Keep responses conversational, professional, and concise (ideal for voice).
4. You have access to TOOLS. Use 'updateRiskSettings' for risk changes, 'proposeTrade' for new setups, and 'refreshBrokerSnapshot' to refresh broker data. You may suggest 'closePosition', 'cancelOrder', 'modifyOrder', or 'modifyPosition' but these require user confirmation. If the user gives a $ SL/TP target, use stopLossUsd/takeProfitUsd. Use modifyOrder for pending orders and modifyPosition for filled positions.
  5. Use 'run_action_catalog' for action task tree control (including UI navigation). For multi-step trade sessions (watch chart, analyze, backtest, optimize, trade), call 'run_action_catalog' with actionId 'playbook.run' and payload { playbookId: 'playbook.trade_session_mtf.v1', symbol } (override symbol/timeframe/strategy as needed). For ad-hoc multi-step sequences, pass steps/sequence to 'run_action_catalog' to queue a playbook. For repeatable workflows, call 'run_action_catalog' with actionId 'action_flow.list' to see learned sequences, then 'action_flow.run' with payload { intentKey } (or payload.intent to auto-select). For UI navigation use actionId 'ui.panel.open' or 'ui.sidebar.setMode', and for tabs use 'ui.tab.open'/'ui.tab.switch'/'ui.tab.close'/'ui.tab.pin'/'ui.tab.watch'. Use 'getSystemState' for a full system snapshot (broker + autopilot + watchers + chart + backtester + tabs). Use 'getAppSnapshot' for app UI visuals. Use 'getNativeChartSnapshot' for native chart visuals; if chart context matters for choosing a strategy or parameters, call it before backtests/optimizations. Use 'getBacktestSummary' or 'getBacktestTrainingPack' for backtest data, 'run_backtest_optimization' for headless grid search research, and 'start_backtest_optimizer' + 'get_backtest_optimizer_status/results' for multi-objective train/test optimization. If the user describes a custom strategy or asks you to infer one, set strategy to AUTO/CUSTOM and include strategyDescription; include params when explicit values are provided. Use 'get_optimizer_winner_params' to fetch exact best params. If the user asks to save, create watchers, write setups, or promote optimizer winners, always call 'get_optimizer_winner_params' first (do not ask the user to paste params). Use 'save_optimizer_winner_as_preset' to persist winners for reuse. Use 'propose_backtest_optimization_refinement' or 'run_backtest_optimization_chain' for refinement/chained optimization. If the user asks for a "second pass", "refine", or "run it again for better win rate/drawdown", use 'run_backtest_optimization_chain' (not 'start_backtest_optimizer'). For multi-experiment research autopilot, use 'start_research_autopilot' and check progress with 'get_research_autopilot_status/results' (stop with 'stop_research_autopilot'). Use 'getBrokerQuote' for analysis/confirmation (not required before proposeTrade; execution will fetch quotes). If the user requests a backtest for a specific symbol/timeframe, use 'run_backtest_optimization' with explicit symbol/timeframe (do not rely on the Backtester panel unless they ask for current panel stats). Use 'getAgentMemory'/'listAgentMemory' for stored context and chart snapshot library access (listAgentMemory kind 'chart_snapshot', then getAgentMemory for imageDataUrl/savedPath), 'listSetupLibrary'/'createWatcherFromLibrary' for setup library access, and 'listSetupWatchers'/'createSetupWatcher'/'updateSetupWatcher'/'deleteSetupWatcher'/'getSetupSignals'/'explainSetupSignal' for live setup monitoring.
6. For batch optimization, provide 'symbols' and/or 'timeframes'. You can reuse saved grids with 'presetKey' or 'usePreset'.
7. You may receive live vision frames (screen/camera) as images. Treat them as current visual context and reference them when useful.`;

  bridge.connect({
    model: getLiveModel(),
    systemInstruction,
    tools: toRealtimeTools(OPENAI_LIVE_FUNCTION_TOOLS)
  });

  const unsubOpen = bridge.on("open", callbacks.onOpen);
  const unsubClose = bridge.on("close", callbacks.onClose);
  const unsubError = bridge.on("error", (e: any) =>
    callbacks.onError(new Error(e?.message || String(e)))
  );
  const unsubMsg = bridge.on("message", (raw: string) => {
    try {
      callbacks.onMessage(JSON.parse(raw));
    } catch {
      callbacks.onMessage(raw);
    }
  });

  return {
    sendRealtimeInput: (payload: any) => {
      const media = payload?.media;
      if (!media) return;
      if (String(media.mimeType || "").startsWith("audio")) {
        bridge.sendAudio(media.data);
      } else {
        bridge.sendImage({ mimeType: media.mimeType, data: media.data, text: payload?.text });
      }
    },
    sendToolResponse: (payload: any) => {
      const fr = payload?.functionResponses;
      if (!fr) return;
      bridge.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: fr.id,
          output: JSON.stringify(fr.response || {})
        }
      });
      bridge.sendEvent({ type: "response.create" });
    },
    close: () => {
      unsubOpen?.();
      unsubClose?.();
      unsubError?.();
      unsubMsg?.();
      bridge.close();
    }
  };
};
