import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Send, Trash2, ImageIcon, Camera, X, Paperclip, Plus, Users, Sparkles, Video, Mic, StopCircle, Monitor, Settings, Zap, Volume2, VolumeX, Headphones, Activity, ChevronDown, Clock } from 'lucide-react';
import { Message, Agent, TradeProposal, BrokerAction, ChartChatSnapshotStatus, ChartSession, ChartTimeframe, AgentToolAction, TaskPlaybook, TaskTreeResumeEntry, TaskTreeRunEntry, ActionFlowRecommendation, CrossPanelContext, SymbolScope } from '../types';
import { computeBrokerActionIdempotencyKey } from '../services/tradeIdentity';
import type { TaskTreeRunSummary } from '../services/taskTreeService';
import AgentConfigModal from './AgentConfigModal';
import TradeTicket from './TradeTicket';

const MAX_RENDER_MESSAGES = 200;

interface ChatInterfaceProps {
  channel?: 'chat' | 'chart';
  messages: Message[];
  onSendMessage: (text: string, image?: string | Array<{ dataUrl?: string; label?: string; meta?: any }> | null) => void;
  onClearChat: () => void;
  isThinking: boolean;
  isTeamMode: boolean;
  onToggleTeamMode: () => void;
  autoTabVisionEnabled: boolean;
  onToggleAutoTabVision: () => void;
  chartWatchEnabled: boolean;
  onToggleChartWatch: () => void;
  chartWatchMode: 'signals' | 'digest' | 'live';
  onSetChartWatchMode: (mode: 'signals' | 'digest' | 'live') => void;
  chartWatchSnoozedUntilMs: number;
  onSnoozeChartWatch: (durationMs: number) => void;
  onClearChartWatchSnooze: () => void;
  chartWatchLeadAgentId: string;
  onSetChartWatchLeadAgentId: (id: string) => void;
  chartSessions?: ChartSession[];
  chartSnapshotStatus?: ChartChatSnapshotStatus | null;
  activeTabId?: string;
  getTabTitle?: (tabId: string) => string;
  onCreateChartSessionFromActiveTab?: () => void;
  onAssignActiveTabToChartSession?: (sessionId: string, timeframe: ChartTimeframe) => void;
  onClearChartSessionTimeframe?: (sessionId: string, timeframe: ChartTimeframe) => void;
  onToggleChartSessionWatch?: (sessionId: string) => void;
  onRemoveChartSession?: (sessionId: string) => void;
  captureActiveTabScreenshot?: () => Promise<string | null>;
  captureContextScreenshots?: () => Promise<Array<{ dataUrl?: string; label?: string; meta?: any }> | null>;
  agents: Agent[];
  activeAgentId: string;
  onAddAgent: () => void;
  onSwitchAgent: (id: string) => void;
  onUpdateAgent: (agent: Agent) => void;
  onDeleteAgent: (id: string) => void;
  actionQueueDepth?: number;
  actionTaskActiveConfig?: {
    runId?: string | null;
    actionId?: string | null;
    maxRetries?: number | null;
    retryDelayMs?: number | null;
    timeoutMs?: number | null;
  } | null;
  // Live Props
  isLive: boolean;
  liveMode: 'camera' | 'screen' | 'audio' | null;
  liveStream: MediaStream | null;
  startLiveSession: (type: 'camera' | 'screen' | 'audio') => void;
  stopLiveSession: () => void;
  sendVideoFrame: (base64: string) => void;
  // TTS Props
  speakMessage: (id: string, text: string, agentName?: string) => void;
  speakingMessageId: string | null;
  // Session Props
  sessionBias: string;
  onUpdateSessionBias: (bias: string) => void;
  // Execution Props
  onExecuteTrade: (messageId: string, proposal: TradeProposal) => void;
  onRejectTrade: (messageId: string, reason?: string) => void;
  onExecuteBrokerAction?: (messageId: string, action: BrokerAction) => void;
  onRejectBrokerAction?: (messageId: string, reason?: string) => void;
  onCancelAgentTool?: (messageId: string) => void;
  contextPackText?: string;
  onCaptureContextPack?: (opts?: { copy?: boolean; save?: boolean }) => void;
  playbooks?: TaskPlaybook[];
  onResumePlaybookRun?: (
    runId: string,
    opts?: {
      action?: 'resume' | 'approve' | 'skip' | 'abort';
      stepId?: string | null;
      actionId?: string | null;
      overrides?: {
        symbol?: string;
        timeframe?: string;
        strategy?: string;
        timeframes?: string[];
        data?: Record<string, any>;
      };
    }
  ) => void;
  activePlaybookRun?: {
    runId: string;
    playbookId: string;
    playbookName?: string | null;
    status: string;
    mode?: string | null;
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    startedAtMs?: number;
    finishedAtMs?: number | null;
    currentStepIndex?: number | null;
    currentStepId?: string | null;
    error?: string | null;
    steps?: Array<{
      id: string;
      label?: string | null;
      actionId: string;
      status: string;
      startedAtMs?: number | null;
      finishedAtMs?: number | null;
      note?: string | null;
      error?: string | null;
    }> | null;
    context?: Record<string, any> | null;
  } | null;
  recentPlaybookRuns?: Array<{
    runId: string;
    playbookId: string;
    playbookName?: string | null;
    status: string;
    mode?: string | null;
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    startedAtMs?: number;
    finishedAtMs?: number | null;
    currentStepIndex?: number | null;
    currentStepId?: string | null;
    error?: string | null;
    steps?: Array<{
      id: string;
      label?: string | null;
      actionId: string;
      status: string;
      startedAtMs?: number | null;
      finishedAtMs?: number | null;
      note?: string | null;
      error?: string | null;
    }> | null;
    context?: Record<string, any> | null;
  }> | null;
  taskTreeResumeEntries?: TaskTreeResumeEntry[] | null;
  onResumeTaskTreeRun?: (input: {
    taskType: 'signal' | 'action';
    runId: string;
    action?: 'resume' | 'abort' | 'approve' | 'skip';
  }) => void;
  taskTreeRuns?: TaskTreeRunEntry[] | null;
  actionTaskTreeRuns?: TaskTreeRunEntry[] | null;
  onReplayTaskTree?: (summary: TaskTreeRunSummary) => void;
  recommendedFlows?: ActionFlowRecommendation[] | null;
  onRunActionFlow?: (flow: ActionFlowRecommendation, opts?: { symbol?: string | null; timeframe?: string | null }) => void;
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
  symbolScope?: SymbolScope | null;
  crossPanelContext?: CrossPanelContext | null;
  onUpdateSymbolScope?: (symbol: string, opts?: { timeframes?: string[]; source?: string }) => void;
  onClearSymbolScope?: () => void;
  onSearchSymbols?: (query: string) => Promise<Array<{ symbol: string; label?: string; raw?: any }>> | Array<{ symbol: string; label?: string; raw?: any }>;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  channel,
  messages, 
  onSendMessage, 
  onClearChat,
  isThinking,
  isTeamMode,
  onToggleTeamMode,
  autoTabVisionEnabled,
  onToggleAutoTabVision,
  chartWatchEnabled,
  onToggleChartWatch,
  chartWatchMode,
  onSetChartWatchMode,
  chartWatchSnoozedUntilMs,
  onSnoozeChartWatch,
  onClearChartWatchSnooze,
  chartWatchLeadAgentId,
  onSetChartWatchLeadAgentId,
  chartSessions = [],
  chartSnapshotStatus = null,
  activeTabId,
  getTabTitle,
  onCreateChartSessionFromActiveTab,
  onAssignActiveTabToChartSession,
  onClearChartSessionTimeframe,
  onToggleChartSessionWatch,
  onRemoveChartSession,
  captureActiveTabScreenshot,
  captureContextScreenshots,
  agents,
  activeAgentId,
  onAddAgent,
  onSwitchAgent,
  onUpdateAgent,
  onDeleteAgent,
  actionQueueDepth,
  actionTaskActiveConfig,
  isLive,
  liveMode,
  liveStream,
  startLiveSession,
  stopLiveSession,
  sendVideoFrame,
  speakMessage,
  speakingMessageId,
  sessionBias,
  onUpdateSessionBias,
  onExecuteTrade,
  onRejectTrade,
  onExecuteBrokerAction,
  onRejectBrokerAction,
  onCancelAgentTool,
  taskTreeResumeEntries = null,
  onResumeTaskTreeRun,
  contextPackText,
  onCaptureContextPack,
  playbooks,
  onResumePlaybookRun,
  activePlaybookRun = null,
  recentPlaybookRuns = null,
  taskTreeRuns = null,
  actionTaskTreeRuns = null,
  onReplayTaskTree,
  recommendedFlows = null,
  onRunActionFlow,
  onRunActionCatalog,
  symbolScope = null,
  crossPanelContext = null,
  onUpdateSymbolScope,
  onClearSymbolScope,
  onSearchSymbols
}) => {
  const normalizedChannel: 'chat' | 'chart' = channel === 'chart' ? 'chart' : 'chat';
  const runChatActionOr = useCallback(
    (actionId: string, payload: Record<string, any>, fallback?: () => void) => {
      if (onRunActionCatalog) {
        void onRunActionCatalog({ actionId, payload: { ...payload, channel: normalizedChannel } });
        return;
      }
      fallback?.();
    },
    [onRunActionCatalog, normalizedChannel]
  );
  const sendMessageViaAction = useCallback(
    (
      text: string,
      image?: string | Array<{ dataUrl?: string; label?: string; meta?: any }> | null
    ) => {
      runChatActionOr('chat.send', { text, image }, () => onSendMessage(text, image));
    },
    [onSendMessage, runChatActionOr]
  );
  const [input, setInput] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [symbolInputFocused, setSymbolInputFocused] = useState(false);
  const [symbolSuggestions, setSymbolSuggestions] = useState<Array<{ symbol: string; label?: string; raw?: any }>>([]);
  const [symbolSuggestionsOpen, setSymbolSuggestionsOpen] = useState(false);
  const [symbolSuggestionsLoading, setSymbolSuggestionsLoading] = useState(false);
  const [symbolSuggestionsError, setSymbolSuggestionsError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const [showLiveMenu, setShowLiveMenu] = useState(false);
  const [showWatchMenu, setShowWatchMenu] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showBiasInput, setShowBiasInput] = useState(false);
  const crossPanelSymbol = String(crossPanelContext?.symbol || '').trim();
  const symbolScopeSymbol = String(symbolScope?.symbol || '').trim() || crossPanelSymbol;
  const symbolScopeTimeframes = Array.isArray(symbolScope?.timeframes) && symbolScope.timeframes.length > 0
    ? symbolScope.timeframes
    : (crossPanelContext?.timeframe ? [String(crossPanelContext.timeframe)] : ['4h', '1h', '15m']);
  const symbolScopeTimeframesLabel = symbolScopeTimeframes
    .map((tf) => String(tf || '').toUpperCase())
    .filter(Boolean)
    .join('/');
  const [resumeOverrides, setResumeOverrides] = useState<Record<string, {
    symbol: string;
    timeframe: string;
    strategy: string;
    timeframes: string;
    dataJson: string;
  }>>({});
  const [resumeOverrideErrors, setResumeOverrideErrors] = useState<Record<string, string>>({});
  const [selectedTaskTreeRunId, setSelectedTaskTreeRunId] = useState('');
  const [selectedActionTaskTreeRunId, setSelectedActionTaskTreeRunId] = useState('');
  const [truthEvents, setTruthEvents] = useState<any[]>([]);
  const [truthEventsError, setTruthEventsError] = useState<string | null>(null);
  const [truthEventsUpdatedAtMs, setTruthEventsUpdatedAtMs] = useState<number | null>(null);
  const [flowSymbolFilter, setFlowSymbolFilter] = useState('');
  const [flowTimeframeFilter, setFlowTimeframeFilter] = useState('');
  const [truthEventFilter, setTruthEventFilter] = useState<'all' | 'trade' | 'broker' | 'playbook' | 'task' | 'setup' | 'chart' | 'agent'>(() => {
    try {
      const saved = localStorage.getItem('glass_truth_event_filter');
      if (saved === 'trade' || saved === 'broker' || saved === 'playbook' || saved === 'task' || saved === 'setup' || saved === 'chart' || saved === 'agent') return saved;
    } catch {
      // ignore
    }
    return 'all';
  });
  const [taskTruthRunId, setTaskTruthRunId] = useState<string>('');
  const [taskTruthEvents, setTaskTruthEvents] = useState<any[]>([]);
  const [taskTruthError, setTaskTruthError] = useState<string | null>(null);
  const [taskTruthUpdatedAtMs, setTaskTruthUpdatedAtMs] = useState<number | null>(null);
  const defaultPlaybookId = 'playbook.trade_session_mtf.v1';
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('glass_chat_playbook_default');
      return stored ? String(stored) : defaultPlaybookId;
    } catch {
      return defaultPlaybookId;
    }
  });

  useEffect(() => {
    const matchesChannel = (detail: any) => {
      const raw = String(detail?.channel || detail?.scope || detail?.target || detail?.chat || '').trim().toLowerCase();
      if (!raw) return normalizedChannel === 'chat';
      if (raw === 'chart' || raw === 'chartchat' || raw === 'chart_chat') return normalizedChannel === 'chart';
      return normalizedChannel === 'chat';
    };

    const handler = (event: any) => {
      const detail = event?.detail;
      if (!detail || typeof detail !== 'object') return;
      if (!matchesChannel(detail)) return;
      const playbookId = String(detail.playbookId || detail.id || '').trim();
      if (!playbookId) return;
      setSelectedPlaybookId(playbookId);
    };
    window.addEventListener('glass_chat_playbook_default', handler as any);
    return () => window.removeEventListener('glass_chat_playbook_default', handler as any);
  }, [normalizedChannel]);

  useEffect(() => {
    if (!symbolScopeSymbol) return;
    if (symbolInputFocused) return;
    setSymbolInput(symbolScopeSymbol);
  }, [symbolInputFocused, symbolScopeSymbol]);

  useEffect(() => {
    if (!onSearchSymbols) return;
    const query = symbolInput.trim();
    if (!query) {
      setSymbolSuggestions([]);
      setSymbolSuggestionsOpen(false);
      setSymbolSuggestionsError(null);
      setSymbolSuggestionsLoading(false);
      return;
    }
    const token = symbolSearchTokenRef.current + 1;
    symbolSearchTokenRef.current = token;
    setSymbolSuggestionsLoading(true);
    setSymbolSuggestionsError(null);
    const timer = window.setTimeout(async () => {
      try {
        const res = await onSearchSymbols(query);
        if (symbolSearchTokenRef.current !== token) return;
        const list = Array.isArray(res) ? res : [];
        setSymbolSuggestions(list);
        setSymbolSuggestionsOpen(symbolInputFocused && list.length > 0);
      } catch {
        if (symbolSearchTokenRef.current !== token) return;
        setSymbolSuggestions([]);
        setSymbolSuggestionsOpen(false);
        setSymbolSuggestionsError('Unable to search symbols.');
      } finally {
        if (symbolSearchTokenRef.current === token) {
          setSymbolSuggestionsLoading(false);
        }
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [onSearchSymbols, symbolInput, symbolInputFocused]);

  const [unreadCount, setUnreadCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastMessageCountRef = useRef<number>(messages.length);
  const symbolSearchTokenRef = useRef(0);
  const renderMessages = messages.length > MAX_RENDER_MESSAGES ? messages.slice(messages.length - MAX_RENDER_MESSAGES) : messages;
  const trimmedCount = Math.max(0, messages.length - renderMessages.length);
  const nowMs = Date.now();
  const playbookOptions = Array.isArray(playbooks) && playbooks.length > 0
    ? playbooks
    : [{ id: 'playbook.trade_session_mtf.v1', name: 'MTF Trade Session', symbol: 'BTCUSD', timeframes: ['4h', '1h', '15m', '5m'], strategy: 'MEAN_REVERSION' } as TaskPlaybook];
  const selectedPlaybook = playbookOptions.find((p) => p.id === selectedPlaybookId) || playbookOptions[0];

  const formatAge = (capturedAtMs?: number) => {
    if (!capturedAtMs || !Number.isFinite(capturedAtMs)) return "";
    const deltaSec = Math.max(0, Math.round((nowMs - capturedAtMs) / 1000));
    if (deltaSec < 60) return `${deltaSec}s`;
    const min = Math.round(deltaSec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.round(min / 60);
    return `${hr}h`;
  };

  const handleSymbolSubmit = (value?: string) => {
    if (!onUpdateSymbolScope) return;
    const next = String(value != null ? value : symbolInput || '').trim();
    if (!next) return;
    onUpdateSymbolScope(next, { source: normalizedChannel });
    setSymbolSuggestionsOpen(false);
  };

  const handleSymbolSelect = (symbol: string) => {
    setSymbolInput(symbol);
    handleSymbolSubmit(symbol);
  };

  const getResumeDraft = (runId: string) => {
    return resumeOverrides[runId] || { symbol: '', timeframe: '', strategy: '', timeframes: '', dataJson: '' };
  };

  const updateResumeDraft = (runId: string, patch: Partial<{ symbol: string; timeframe: string; strategy: string; timeframes: string; dataJson: string }>) => {
    setResumeOverrides((prev) => ({
      ...prev,
      [runId]: { ...getResumeDraft(runId), ...patch }
    }));
    setResumeOverrideErrors((prev) => {
      if (!prev[runId]) return prev;
      const next = { ...prev };
      delete next[runId];
      return next;
    });
  };

  const buildResumeOverrides = (runId: string) => {
    const draft = getResumeDraft(runId);
    const symbol = String(draft.symbol || '').trim();
    const timeframe = String(draft.timeframe || '').trim();
    const strategy = String(draft.strategy || '').trim();
    const timeframes = String(draft.timeframes || '').trim();
    let parsedTimeframes: string[] | undefined;
    if (timeframes) {
      parsedTimeframes = timeframes
        .split(/[,\s]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (parsedTimeframes.length === 0) parsedTimeframes = undefined;
    }
    let data: Record<string, any> | undefined;
    const rawJson = String(draft.dataJson || '').trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object') data = parsed as Record<string, any>;
      } catch {
        return { overrides: null, error: 'Invalid JSON overrides.' };
      }
    }
    const overrides = {
      symbol: symbol || undefined,
      timeframe: timeframe || undefined,
      strategy: strategy || undefined,
      timeframes: parsedTimeframes,
      data
    };
    return { overrides };
  };

  const renderBrokerAction = (messageId: string, action: BrokerAction) => {
    const typeLabel =
      action.type === 'REFRESH_BROKER'
        ? 'Refresh Broker Snapshot'
        : action.type === 'CLOSE_POSITION'
          ? 'Close Position'
          : action.type === 'CANCEL_ORDER'
            ? 'Cancel Order'
            : action.type === 'MODIFY_ORDER'
              ? 'Modify Order'
              : 'Modify Position';
    const targetLabel =
      action.type === 'CLOSE_POSITION'
        ? (action.positionId ? `Position ID ${action.positionId}` : 'Position')
        : action.type === 'CANCEL_ORDER'
          ? (action.orderId ? `Order ID ${action.orderId}` : 'Order')
          : action.type === 'MODIFY_ORDER'
            ? (action.orderId ? `Order ID ${action.orderId}` : 'Order')
            : action.type === 'MODIFY_POSITION'
              ? (action.positionId ? `Position ID ${action.positionId}` : 'Position')
              : 'Broker Snapshot';
    const symbolLabel = action.symbol ? `Symbol ${action.symbol}` : '';
    const qtyLabel = action.qty != null ? `Qty ${action.qty}` : '';
    const priceLabel = action.price != null ? `Price ${action.price}` : '';
    const slLabel = action.stopLoss != null ? `SL ${action.stopLoss}` : action.clearStopLoss ? 'SL clear' : '';
    const tpLabel = action.takeProfit != null ? `TP ${action.takeProfit}` : action.clearTakeProfit ? 'TP clear' : '';
    const trailLabel =
      Number.isFinite(Number(action.trailingOffset)) && Number(action.trailingOffset) > 0
        ? `Trail ${action.trailingOffset}`
        : '';
    const metaLine = [targetLabel, symbolLabel, qtyLabel, priceLabel, slLabel, tpLabel, trailLabel].filter(Boolean).join(' · ');
    const idempotencyKey =
      (action as any).idempotencyKey || computeBrokerActionIdempotencyKey(action as any);
    const idLabel = idempotencyKey ? `Idempotency ${String(idempotencyKey).slice(-10)}` : '';
    const blockedByKillSwitch =
      action.executionCode === 'autopilot_killswitch' ||
      (action.executionError && action.executionError.toLowerCase().includes('kill switch'));

    const isPending = action.status === 'PENDING';
    const isSubmitting = action.status === 'SUBMITTING';
    const isExecuted = action.status === 'EXECUTED';
    const isRejected = action.status === 'REJECTED';
    const needsConfirm = action.type !== 'REFRESH_BROKER';

    return (
      <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-gray-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-gray-100 uppercase tracking-wider">{typeLabel}</div>
          <div
            className={`px-2 py-0.5 rounded-full text-[10px] border ${
              isExecuted
                ? 'bg-green-500/10 border-green-500/30 text-green-200'
                : isRejected
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : isSubmitting
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                    : 'bg-white/5 border-white/10 text-gray-300'
            }`}
          >
            {action.status}
          </div>
        </div>
        {metaLine && <div className="text-[10px] text-gray-400">{metaLine}</div>}
        {idLabel && (
          <div className="text-[10px] text-gray-500">
            {idLabel}
          </div>
        )}
        {action.reason && (
          <div className="text-[10px] text-gray-400">
            Reason: {action.reason}
          </div>
        )}
        {action.executionError && (
          <div className="text-[10px] text-red-300">
            Error: {action.executionError}
          </div>
        )}
        {blockedByKillSwitch && (
          <div className="text-[10px] text-amber-300">
            Blocked: AutoPilot kill switch
          </div>
        )}

        {isPending && needsConfirm && (
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onExecuteBrokerAction && onExecuteBrokerAction(messageId, action)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-[10px] font-semibold hover:bg-emerald-500/30 transition-colors"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onRejectBrokerAction && onRejectBrokerAction(messageId, 'Rejected by user')}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-200 text-[10px] font-semibold hover:bg-red-500/20 hover:text-red-200 transition-colors"
            >
              Reject
            </button>
            <span className="text-[10px] text-gray-500">
              Requires confirmation.
            </span>
          </div>
        )}
        {isPending && !needsConfirm && (
          <div className="text-[10px] text-gray-500">Processing refresh request…</div>
        )}
      </div>
    );
  };

  const renderAgentToolAction = (action: AgentToolAction) => {
    const isCatalogAction = action.type === 'RUN_ACTION_CATALOG';
    const actionIdLabel = action.actionId ? `Action ${action.actionId}` : '';
    const typeLabel =
      action.type === 'RUN_ACTION_CATALOG'
        ? (action.actionId === 'playbook.run' ? 'Playbook Run' : 'Action Catalog')
        : action.type === 'GET_SYSTEM_STATE'
        ? 'System State'
        : action.type === 'GET_NATIVE_CHART_SNAPSHOT'
        ? 'Native Chart Snapshot'
        : action.type === 'GET_BACKTEST_SUMMARY'
          ? 'Backtest Summary'
          : action.type === 'GET_BACKTEST_TRAINING_PACK'
            ? 'Backtest Training Pack'
          : action.type === 'RUN_BACKTEST_OPTIMIZATION'
            ? 'Backtest Optimization'
            : action.type === 'START_BACKTEST_OPTIMIZER'
              ? 'Backtest Optimizer'
              : action.type === 'GET_BACKTEST_OPTIMIZER_STATUS'
                ? 'Optimizer Status'
                : action.type === 'GET_BACKTEST_OPTIMIZER_RESULTS'
                  ? 'Optimizer Results'
                  : action.type === 'GET_OPTIMIZER_WINNER_PARAMS'
                    ? 'Optimizer Winner Params'
                    : action.type === 'SAVE_OPTIMIZER_WINNER_PRESET'
                      ? 'Save Optimizer Preset'
          : action.type === 'GET_BROKER_QUOTE'
            ? 'Broker Quote'
            : action.type === 'GET_AGENT_MEMORY'
                ? 'Agent Memory'
                : action.type === 'LIST_AGENT_MEMORY'
                  ? 'Agent Memory List'
                  : action.type === 'LIST_SETUP_WATCHERS'
                    ? 'Setup Watchers'
                    : action.type === 'LIST_SETUP_LIBRARY'
                      ? 'Setup Library'
                    : action.type === 'CREATE_SETUP_WATCHER'
                      ? 'Create Setup Watcher'
                      : action.type === 'CREATE_WATCHER_FROM_LIBRARY'
                        ? 'Create Watcher From Library'
                      : action.type === 'UPDATE_SETUP_WATCHER'
                        ? 'Update Setup Watcher'
                        : action.type === 'DELETE_SETUP_WATCHER'
                          ? 'Delete Setup Watcher'
                          : 'Setup Signals';
    const timeFilterLabel =
      action.timeFilter && (action.timeFilter.startHour != null || action.timeFilter.endHour != null)
        ? `Session ${action.timeFilter.startHour ?? '--'}-${action.timeFilter.endHour ?? '--'} ${action.timeFilter.timezone || 'utc'}`
        : '';
    const symbolsLabel =
      Array.isArray(action.symbols) && action.symbols.length > 0
        ? `Symbols ${action.symbols.slice(0, 4).join(', ')}${action.symbols.length > 4 ? '...' : ''}`
        : '';
    const timeframesLabel =
      Array.isArray(action.timeframes) && action.timeframes.length > 0
        ? `TFs ${action.timeframes.slice(0, 4).join(', ')}${action.timeframes.length > 4 ? '...' : ''}`
        : '';
    const presetLabel = action.presetKey
      ? `Preset ${action.presetKey}`
      : action.usePreset
        ? 'Preset auto'
        : '';
    const metaParts = [
      isCatalogAction ? actionIdLabel : '',
      action.symbol ? `Symbol ${action.symbol}` : '',
      symbolsLabel,
        action.timeframe ? `TF ${action.timeframe}` : '',
        timeframesLabel,
        action.strategy ? `Strategy ${action.strategy}` : '',
        action.sessionId ? `Session ${action.sessionId}` : '',
        action.baselineRunId ? `Run ${action.baselineRunId}` : '',
        action.objectivePreset ? `Objective ${action.objectivePreset}` : '',
        action.searchSpacePreset ? `Grid ${action.searchSpacePreset}` : '',
        Number.isFinite(Number(action.budget)) ? `Budget ${Number(action.budget)}` : '',
        Number.isFinite(Number(action.parallelism)) ? `Parallel ${Number(action.parallelism)}` : '',
        action.watcherId ? `Watcher ${action.watcherId}` : '',
        action.mode ? `Mode ${action.mode}` : '',
        typeof action.enabled === 'boolean' ? `Enabled ${action.enabled ? 'yes' : 'no'}` : '',
      Number.isFinite(Number(action.rangeDays)) ? `Range ${Number(action.rangeDays)}d` : '',
      Number.isFinite(Number(action.maxCombos)) ? `Max ${Number(action.maxCombos)}` : '',
      timeFilterLabel,
      presetLabel,
      action.memoryKey ? `Key ${action.memoryKey}` : '',
      action.memoryId ? `ID ${action.memoryId}` : '',
      action.kind ? `Kind ${action.kind}` : '',
      action.tags && action.tags.length > 0 ? `Tags ${action.tags.join(',')}` : '',
      Number.isFinite(Number(action.maxEpisodes)) ? `Max ${Number(action.maxEpisodes)}` : '',
      Number.isFinite(Number(action.offset)) ? `Offset ${Number(action.offset)}` : '',
      Number.isFinite(Number(action.limit)) ? `Limit ${Number(action.limit)}` : ''
    ].filter(Boolean);
    const metaLine = metaParts.join(' | ');

    const isPending = action.status === 'PENDING';
    const isExecuted = action.status === 'EXECUTED';
    const isFailed = action.status === 'FAILED';
    const progressPct = Number.isFinite(Number(action.progressPct))
      ? Math.min(100, Math.max(0, Number(action.progressPct)))
      : null;
    const progressLabel = action.progressLabel ? String(action.progressLabel) : '';

    return (
      <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] text-gray-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-gray-100 uppercase tracking-wider">{typeLabel}</div>
          <div
            className={`px-2 py-0.5 rounded-full text-[10px] border ${
              isExecuted
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : isFailed
                  ? 'bg-red-500/10 border-red-500/30 text-red-200'
                  : 'bg-white/5 border-white/10 text-gray-300'
            }`}
          >
            {action.status}
          </div>
        </div>
        {metaLine && <div className="text-[10px] text-gray-400">{metaLine}</div>}
        {action.reason && (
          <div className="text-[10px] text-gray-400">
            Reason: {action.reason}
          </div>
        )}
        {(progressLabel || progressPct != null) && (
          <div className="space-y-1">
            {progressLabel && <div className="text-[10px] text-gray-400">{progressLabel}</div>}
            {progressPct != null && (
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-400/70"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        )}
        {action.error && (
          <div className="text-[10px] text-red-300">
            Error: {action.error}
          </div>
        )}
        {isPending && action.type === 'RUN_BACKTEST_OPTIMIZATION' && onCancelAgentTool && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onCancelAgentTool(action.messageId || '')}
              className="px-2 py-1 rounded-md text-[10px] bg-white/5 border border-white/10 text-gray-200 hover:bg-red-500/20 hover:text-red-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
          {isPending && (
            <div className="text-[10px] text-gray-500">
              {action.type === 'RUN_BACKTEST_OPTIMIZATION'
                ? 'Researching parameter grid...'
                : action.type === 'START_BACKTEST_OPTIMIZER'
                  ? 'Starting optimizer session...'
                  : 'Processing tool request.'}
            </div>
          )}
      </div>
    );
  };

  const [chartWatchIntervalSec, setChartWatchIntervalSec] = useState<string>(() => {
    try {
      const raw = localStorage.getItem("glass_chart_watch_interval_ms");
      const ms = raw ? Number(raw) : NaN;
      const safeMs = Number.isFinite(ms) ? Math.min(600_000, Math.max(5_000, Math.floor(ms))) : 60_000;
      return String(Math.round(safeMs / 1000));
    } catch {
      return "60";
    }
  });

  useEffect(() => {
    if (!showWatchMenu) return;
    try {
      const raw = localStorage.getItem("glass_chart_watch_interval_ms");
      const ms = raw ? Number(raw) : NaN;
      const safeMs = Number.isFinite(ms) ? Math.min(600_000, Math.max(5_000, Math.floor(ms))) : 60_000;
      setChartWatchIntervalSec(String(Math.round(safeMs / 1000)));
    } catch {
      // ignore
    }
  }, [showWatchMenu]);

  useEffect(() => {
    try {
      localStorage.setItem('glass_chat_playbook_default', selectedPlaybookId);
    } catch {
      // ignore
    }
  }, [selectedPlaybookId]);

  useEffect(() => {
    if (!selectedPlaybookId || !playbookOptions.find((p) => p.id === selectedPlaybookId)) {
      if (playbookOptions[0]?.id) {
        setSelectedPlaybookId(playbookOptions[0].id);
      }
    }
  }, [playbookOptions, selectedPlaybookId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const isScrolledToBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const threshold = 80;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  const handleScroll = () => {
    const atBottom = isScrolledToBottom();
    setIsAtBottom(atBottom);
    if (atBottom) setUnreadCount(0);
  };

  // Auto-scroll only if the user is already at the bottom; otherwise show a "new messages" affordance.
  useEffect(() => {
    const prevCount = lastMessageCountRef.current;
    const nextCount = messages.length;
    if (nextCount === prevCount) return;
    lastMessageCountRef.current = nextCount;

    if (nextCount < prevCount) {
      // Chat was cleared/trimmed; reset unread counter.
      setUnreadCount(0);
      return;
    }

    if (isScrolledToBottom()) scrollToBottom();
    else setUnreadCount((c) => c + (nextCount - prevCount));
  }, [messages.length]);

  // Keep the viewport pinned while live/typing only if already at bottom.
  useEffect(() => {
    if (isScrolledToBottom()) scrollToBottom();
  }, [isThinking, isLive]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const applyChartWatchIntervalSec = (rawSeconds: string) => {
    const secRaw = Number(rawSeconds);
    if (!Number.isFinite(secRaw)) return;
    const sec = Math.min(600, Math.max(5, Math.floor(secRaw)));
    setChartWatchIntervalSec(String(sec));
    try {
      localStorage.setItem("glass_chart_watch_interval_ms", String(sec * 1000));
    } catch {
      // ignore
    }
  };

  // Handle Live Video Streaming (Only if Camera/Screen mode)
  useEffect(() => {
    if (isLive && liveStream && liveMode !== 'audio' && videoRef.current) {
        videoRef.current.srcObject = liveStream;
        videoRef.current.play();
        
        // Start streaming frames
        const interval = setInterval(() => {
            if (videoRef.current && canvasRef.current) {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');
                if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
                    const maxW = 1280;
                    const vw = video.videoWidth;
                    const vh = video.videoHeight;
                    const targetW = vw > maxW ? maxW : vw;
                    const scale = vw > 0 ? (targetW / vw) : 1;
                    const targetH = Math.max(1, Math.round(vh * scale));

                    canvas.width = targetW;
                    canvas.height = targetH;
                    ctx.drawImage(video, 0, 0, targetW, targetH);
                    
                    const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                    sendVideoFrame(base64);
                }
            }
        }, 1000); // 1 FPS (sendVideoFrame is also throttled)
        
        return () => clearInterval(interval);
    }
  }, [isLive, liveStream, liveMode, sendVideoFrame]);

  // Handle Paste Events
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
        if (e.clipboardData?.items) {
            for (let i = 0; i < e.clipboardData.items.length; i++) {
                const item = e.clipboardData.items[i];
                if (item.type.indexOf("image") !== -1) {
                    const blob = item.getAsFile();
                    if (blob) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            if (typeof event.target?.result === 'string') {
                                setAttachment(event.target.result);
                            }
                        };
                        reader.readAsDataURL(blob);
                        e.preventDefault();
                    }
                }
            }
        }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleSubmit = () => {
    if ((!input.trim() && !attachment) || isThinking) return;
    sendMessageViaAction(input, attachment);
    setInput('');
    setAttachment(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (typeof event.target?.result === 'string') {
                setAttachment(event.target.result);
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const captureSnapshot = async (): Promise<string | null> => {
    try {
      if (typeof captureActiveTabScreenshot === 'function') {
        const img = await captureActiveTabScreenshot();
        if (img) return img;
      }
    } catch {
      // ignore
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
              // @ts-ignore
              preferCurrentTab: true 
          }
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      await new Promise(r => setTimeout(r, 100));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      stream.getTracks().forEach(track => track.stop());

      return dataUrl;
    } catch {
      return null;
    }
  };

  const handleCaptureScreen = async () => {
    try {
        if (isCapturingSnapshot) return;
        setIsCapturingSnapshot(true);
        const img = await captureSnapshot();
        if (!img) {
          const details = window.glass?.getLastCaptureError?.();
          const suffix = details ? `\n\nDetails: ${details}` : "";
          alert(`Could not capture tab/screen.${suffix}`);
          return;
        }
        setAttachment(img);
    } catch (err) {
        console.error("Screen capture failed:", err);
        const details = window.glass?.getLastCaptureError?.();
        const suffix = details ? `\n\nDetails: ${details}` : "";
        alert(`Could not capture tab/screen.${suffix}`);
    } finally {
        setIsCapturingSnapshot(false);
    }
  };

  const handleSendSnapshot = async () => {
    if (isThinking || isLive) return;
    if (isCapturingSnapshot) return;
    setIsCapturingSnapshot(true);
    try {
      if (typeof captureContextScreenshots === 'function') {
        const contextShots = await captureContextScreenshots();
        if (contextShots && contextShots.length > 0) {
          const text = input.trim()
            ? input
            : "Analyze these tab snapshots. Provide bias/trend, key levels, and what to watch next.";
          sendMessageViaAction(text, contextShots);
          setInput('');
          setAttachment(null);
          return;
        }
      }

      const img = await captureSnapshot();
      if (!img) {
        const details = window.glass?.getLastCaptureError?.();
        const suffix = details ? `\n\nDetails: ${details}` : "";
        alert(`Could not capture tab/screen.${suffix}`);
        return;
      }

      const text = input.trim()
        ? input
        : "Analyze this browser snapshot. Provide bias/trend, key levels, and what to watch next.";

      sendMessageViaAction(text, img);
      setInput('');
      setAttachment(null);
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  useEffect(() => {
    const matchesChannel = (detail: any) => {
      const raw = String(detail?.channel || detail?.scope || detail?.target || detail?.chat || '').trim().toLowerCase();
      if (!raw) return normalizedChannel === 'chat';
      if (raw === 'chart' || raw === 'chartchat' || raw === 'chart_chat') return normalizedChannel === 'chart';
      return normalizedChannel === 'chat';
    };

    const handleAttachmentEvent = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      if (!matchesChannel(detail)) return;
      if (detail.clear) {
        setAttachment(null);
        return;
      }
      const dataUrl = detail.dataUrl || detail.attachment || detail.image;
      if (dataUrl) setAttachment(String(dataUrl));
    };

    const handleSnapshotCapture = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      if (!matchesChannel(detail)) return;
      void handleCaptureScreen();
    };

    const handleSnapshotSend = (event: any) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      if (!matchesChannel(detail)) return;
      void handleSendSnapshot();
    };

    window.addEventListener('glass_chat_attachment', handleAttachmentEvent as any);
    window.addEventListener('glass_chat_snapshot_capture', handleSnapshotCapture as any);
    window.addEventListener('glass_chat_snapshot_send', handleSnapshotSend as any);
    return () => {
      window.removeEventListener('glass_chat_attachment', handleAttachmentEvent as any);
      window.removeEventListener('glass_chat_snapshot_capture', handleSnapshotCapture as any);
      window.removeEventListener('glass_chat_snapshot_send', handleSnapshotSend as any);
    };
  }, [handleCaptureScreen, handleSendSnapshot, normalizedChannel]);

  // Find active agent object for UI coloring
  const activeAgent = agents.find(a => a.id === activeAgentId) || agents[0];
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isStreamingReply = !!(lastMessage && lastMessage.isStreaming);
  const timelineRun = activePlaybookRun || (Array.isArray(recentPlaybookRuns) ? recentPlaybookRuns[0] : null);
  const timelineSteps = Array.isArray(timelineRun?.steps) ? timelineRun?.steps || [] : [];
  const blockedStep = timelineSteps.slice().reverse().find((step) => step.status === 'blocked') || null;
  const blockedNote = blockedStep?.note ? String(blockedStep.note) : '';
  const blockedNoteLower = blockedNote.toLowerCase();
  const blockedIsConfirm = blockedNoteLower === 'confirmation_required';
  const blockedIsMissing = blockedNoteLower.includes('missing');
  const blockedHeader = blockedIsConfirm
    ? 'Awaiting confirmation'
    : blockedIsMissing
      ? 'Awaiting input'
      : 'Awaiting coordination';
  const blockedPrimaryAction: 'resume' | 'approve' = blockedIsConfirm ? 'approve' : 'resume';
  const blockedPrimaryLabel = blockedIsConfirm ? 'Approve' : 'Resume';
  const blockedRequirement = blockedIsMissing
    ? (blockedNoteLower.includes('missing_symbol')
        ? 'symbol'
        : blockedNoteLower.includes('missing_timeframe')
          ? 'timeframe'
          : (blockedNoteLower.includes('missing_params') || blockedNoteLower.includes('missing_levels'))
            ? 'params'
            : null)
    : null;

  const resolveRunDefaults = (run: typeof timelineRun) => {
    if (!run) return { symbol: '', timeframe: '', strategy: '', timeframes: '' };
    const playbook = playbookOptions.find((entry) => entry.id === run.playbookId) || null;
    const context = run.context && typeof run.context === 'object' ? run.context : null;
    const ctxData = context && typeof (context as any).data === 'object' ? (context as any).data : null;
    const ctxSource = context && typeof (context as any).source === 'object' ? (context as any).source : null;
    const ctxTimeframes = Array.isArray(ctxData?.timeframes) ? ctxData?.timeframes : Array.isArray(ctxSource?.timeframes) ? ctxSource?.timeframes : null;
    const timeframes = ctxTimeframes && ctxTimeframes.length > 0
      ? ctxTimeframes.map((entry: any) => String(entry)).join(',')
      : playbook?.timeframes && playbook.timeframes.length > 0
        ? playbook.timeframes.join(',')
        : '';
    const timeframe = run.timeframe || (playbook?.timeframes && playbook.timeframes.length > 0 ? playbook.timeframes[0] : '');
    return {
      symbol: String(run.symbol || playbook?.symbol || ''),
      timeframe: String(timeframe || ''),
      strategy: String(run.strategy || playbook?.strategy || ''),
      timeframes
    };
  };
  const historyRuns = Array.isArray(recentPlaybookRuns)
    ? recentPlaybookRuns.filter((run) => !timelineRun || run.runId !== timelineRun.runId).slice(0, 6)
    : [];
  const sortTaskTreeRuns = (runs: TaskTreeRunEntry[]) => {
    return [...runs].sort((a, b) => (Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)));
  };
  const taskTreeRunList = Array.isArray(taskTreeRuns) ? sortTaskTreeRuns(taskTreeRuns).slice(0, 6) : [];
  const actionTaskTreeRunList = Array.isArray(actionTaskTreeRuns) ? sortTaskTreeRuns(actionTaskTreeRuns).slice(0, 6) : [];
  const taskTreeResumeList = Array.isArray(taskTreeResumeEntries) ? taskTreeResumeEntries : [];
  const normalizeFlowSymbol = (value?: string | null) => String(value || '').trim().toUpperCase();
  const normalizeFlowTimeframe = (value?: string | null) => String(value || '').trim().toLowerCase();
  const normalizedFlowSymbolFilter = normalizeFlowSymbol(flowSymbolFilter);
  const normalizedFlowTimeframeFilter = normalizeFlowTimeframe(flowTimeframeFilter);
  const recommendedFlowList = Array.isArray(recommendedFlows)
    ? recommendedFlows
        .filter((flow) => {
          if (normalizedFlowSymbolFilter) {
            if (!flow.symbol) return false;
            if (normalizeFlowSymbol(flow.symbol) !== normalizedFlowSymbolFilter) return false;
          }
          if (normalizedFlowTimeframeFilter) {
            if (!flow.timeframe) return false;
            if (normalizeFlowTimeframe(flow.timeframe) !== normalizedFlowTimeframeFilter) return false;
          }
          return true;
        })
        .slice(0, 4)
    : [];
  const selectedTaskTreeRun =
    taskTreeRunList.find((run) => run.runId === selectedTaskTreeRunId) || taskTreeRunList[0] || null;
  const selectedActionTaskTreeRun =
    actionTaskTreeRunList.find((run) => run.runId === selectedActionTaskTreeRunId) || actionTaskTreeRunList[0] || null;
  const formatRunTime = (value?: number | null) => {
    if (!value || value <= 0) return '--';
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--';
    }
  };
  const statusBadge = (status?: string | null) => {
    const raw = String(status || '').toLowerCase();
    if (raw === 'completed') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30';
    if (raw === 'failed') return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (raw === 'blocked') return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    if (raw === 'running') return 'bg-sky-500/20 text-sky-200 border-sky-500/30';
    if (raw === 'skipped') return 'bg-white/10 text-gray-300 border-white/10';
    return 'bg-white/5 text-gray-400 border-white/10';
  };
  const truthLevelBadge = (level?: string | null) => {
    const raw = String(level || '').toLowerCase();
    if (raw === 'error') return 'bg-red-500/20 text-red-200 border-red-500/30';
    if (raw === 'warn' || raw === 'warning') return 'bg-amber-500/20 text-amber-200 border-amber-500/30';
    return 'bg-white/10 text-gray-300 border-white/10';
  };
  const loadTruthEvents = React.useCallback(async (run: typeof timelineRun | null) => {
    const ledger = window.glass?.tradeLedger;
    if (!ledger?.listEvents) {
      setTruthEvents([]);
      return;
    }
    if (!run) {
      setTruthEvents([]);
      return;
    }
    const args: any = { limit: 40, kind: 'truth_event' };
    if (run.runId) args.runId = String(run.runId);
    else if (run.symbol) args.symbol = String(run.symbol);
    try {
      const res = await ledger.listEvents(args);
      if (!res?.ok || !Array.isArray(res.entries)) {
        setTruthEventsError(res?.error ? String(res.error) : 'Unable to load truth events.');
        return;
      }
      setTruthEvents(res.entries);
      setTruthEventsUpdatedAtMs(Date.now());
      setTruthEventsError(null);
    } catch (err: any) {
      setTruthEventsError(err?.message ? String(err.message) : 'Unable to load truth events.');
    }
  }, []);

  useEffect(() => {
    void loadTruthEvents(timelineRun);
  }, [timelineRun?.runId, timelineRun?.status, timelineRun?.symbol, loadTruthEvents]);

  const loadTaskTruthEvents = React.useCallback(async (run: TaskTreeRunEntry | null) => {
    const ledger = window.glass?.tradeLedger;
    if (!ledger?.listEvents) {
      setTaskTruthEvents([]);
      return;
    }
    if (!run?.runId) {
      setTaskTruthEvents([]);
      setTaskTruthRunId('');
      return;
    }
    try {
      const res = await ledger.listEvents({ limit: 60, kind: 'truth_event', runId: String(run.runId) });
      if (!res?.ok || !Array.isArray(res.entries)) {
        setTaskTruthError(res?.error ? String(res.error) : 'Unable to load truth events.');
        return;
      }
      setTaskTruthRunId(String(run.runId));
      setTaskTruthEvents(res.entries);
      setTaskTruthUpdatedAtMs(Date.now());
      setTaskTruthError(null);
    } catch (err: any) {
      setTaskTruthError(err?.message ? String(err.message) : 'Unable to load truth events.');
    }
  }, []);

  const truthFilterPrefix =
    truthEventFilter === 'trade'
      ? 'trade_'
      : truthEventFilter === 'broker'
        ? 'broker_'
        : truthEventFilter === 'playbook'
          ? 'playbook_'
          : truthEventFilter === 'task'
            ? 'task_tree_'
            : truthEventFilter === 'setup'
              ? 'setup_'
              : truthEventFilter === 'chart'
                ? 'chart_'
                : truthEventFilter === 'agent'
                  ? 'agent_'
                  : '';
  const filteredTruthEvents = truthFilterPrefix
    ? truthEvents.filter((event) => String(event?.eventType || '').startsWith(truthFilterPrefix))
    : truthEvents;
  const filteredTaskTruthEvents = truthFilterPrefix
    ? taskTruthEvents.filter((event) => String(event?.eventType || '').startsWith(truthFilterPrefix))
    : taskTruthEvents;
  const buildReplaySummary = (run: TaskTreeRunEntry): TaskTreeRunSummary | null => {
    if (!run || !run.runId) return null;
    const createdAtMs = Number(run.createdAtMs) || Date.now();
    const finishedAtMs = Number(run.finishedAtMs) || createdAtMs;
    const steps = (Array.isArray(run.steps) ? run.steps : []).map((step) => ({
      step: String(step.step || ''),
      status: (step.status ? String(step.status) : 'completed') as TaskTreeRunSummary['status'],
      startedAtMs: Number(step.startedAtMs) || createdAtMs,
      finishedAtMs: Number(step.finishedAtMs) || Number(step.startedAtMs) || createdAtMs,
      attempts: Number.isFinite(Number(step.attempts)) ? Number(step.attempts) : undefined,
      retryCount: Number.isFinite(Number(step.retryCount)) ? Number(step.retryCount) : undefined,
      error: step.error || undefined,
      note: step.note || undefined
    }));
    const context = run.context || {};
    return {
      runId: String(run.runId),
      status: (run.status ? String(run.status) : 'completed') as TaskTreeRunSummary['status'],
      createdAtMs,
      finishedAtMs,
      steps,
      context: {
        source: context.source ? String(context.source) : 'timeline',
        symbol: context.symbol ? String(context.symbol) : undefined,
        timeframe: context.timeframe ? String(context.timeframe) : undefined,
        strategy: context.strategy ? String(context.strategy) : undefined,
        watcherId: context.watcherId ? String(context.watcherId) : undefined,
        mode: context.mode ? String(context.mode) : undefined
      }
    };
  };
  const renderTaskTreeRun = (run: TaskTreeRunEntry, label: string) => {
    const steps = Array.isArray(run.steps) ? run.steps : [];
    const context = run.context || {};
    const metaLine = [
      context.source ? `Source ${context.source}` : '',
      context.symbol ? context.symbol : '',
      context.timeframe ? context.timeframe : '',
      context.strategy ? context.strategy : '',
      context.mode ? `Mode ${context.mode}` : ''
    ].filter(Boolean).join(' | ');
    const runIdLabel = run.runId ? `Run ${run.runId.slice(-6)}` : 'Run';
    const replaySummary = onReplayTaskTree ? buildReplaySummary(run) : null;
    const handleReplayTruth = async () => {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listEvents) return;
      const res = await ledger.listEvents({ limit: 60, kind: 'truth_event', runId: run.runId });
      if (!res?.ok || !Array.isArray(res.entries)) return;
      const payload = {
        runId: run.runId,
        symbol: context.symbol || null,
        timeframe: context.timeframe || null,
        strategy: context.strategy || null,
        createdAtMs: run.createdAtMs || null,
        events: res.entries
      };
      const filename = `truth_replay_${run.runId}.json`;
      try {
        const data = JSON.stringify(payload, null, 2);
        const saver = window.glass?.saveUserFile;
        if (typeof saver === 'function') {
          const saved = await saver({ data, mimeType: 'application/json', subdir: 'replays', prefix: filename });
          if (saved?.ok) return;
        }
      } catch {
        // ignore save failures
      }
    };
    const handleLoadTruth = () => {
      void loadTaskTruthEvents(run);
    };
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
          <div className="flex items-center gap-2">
            {onReplayTaskTree && replaySummary && (
              <button
                type="button"
                onClick={() => onReplayTaskTree(replaySummary)}
                className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
              >
                Replay
              </button>
            )}
            <button
              type="button"
              onClick={handleLoadTruth}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Truth
            </button>
            <button
              type="button"
              onClick={handleReplayTruth}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Export
            </button>
            <span className="text-[10px] text-gray-500">{runIdLabel}</span>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusBadge(run.status)}`}>
              {String(run.status || 'unknown').toUpperCase()}
            </span>
          </div>
        </div>
        {metaLine && <div className="text-[10px] text-gray-500">{metaLine}</div>}
        <div className="text-[10px] text-gray-500">
          Started {formatRunTime(run.createdAtMs)}
          {run.finishedAtMs ? ` • Finished ${formatRunTime(run.finishedAtMs)}` : ''}
        </div>
        {steps.length > 0 ? (
          <div className="mt-2 space-y-1">
            {steps.map((step, idx) => (
              <div key={`${run.runId}-${step.step}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${statusBadge(step.status)}`}>
                  {String(step.status || '').toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-gray-200">{step.step}</div>
                  {(step.note || step.error) && (
                    <div className="text-gray-500">{step.note || step.error}</div>
                  )}
                  {(Number(step.attempts || 0) > 1 || Number(step.retryCount || 0) > 0) && (
                    <div className="text-gray-500">
                      Attempts: {Number(step.attempts || 0)} | Retries: {Number(step.retryCount || 0)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[10px] text-gray-500">No steps recorded.</div>
        )}
      </div>
    );
  };
  const renderRecommendedFlow = (flow: ActionFlowRecommendation) => {
    const label = flow.intentLabel || flow.intentKey || 'intent';
    const sequence = Array.isArray(flow.sequence) ? flow.sequence.join(' > ') : '';
    const success = Number.isFinite(Number(flow.successRate)) ? `${Math.round(flow.successRate * 100)}%` : '--';
    const metaLine = [flow.symbol, flow.timeframe].filter(Boolean).join(' | ');
    const runSymbol = flowSymbolFilter.trim() || flow.symbol || '';
    const runTimeframe = flowTimeframeFilter.trim() || flow.timeframe || '';
    return (
      <div key={`${flow.intentKey}-${sequence}`} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
          {onRunActionFlow && (
            <button
              type="button"
              onClick={() => onRunActionFlow(flow, {
                symbol: runSymbol ? runSymbol : null,
                timeframe: runTimeframe ? runTimeframe : null
              })}
              className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
            >
              Run
            </button>
          )}
        </div>
        {metaLine && <div className="text-[10px] text-gray-500">{metaLine}</div>}
        <div className="text-[11px] text-gray-200">{sequence || 'No sequence recorded.'}</div>
        <div className="text-[10px] text-gray-500">Count {flow.count} | Success {success}</div>
      </div>
    );
  };

  useEffect(() => {
    if (taskTreeRunList.length === 0) {
      if (selectedTaskTreeRunId) setSelectedTaskTreeRunId('');
      return;
    }
    if (!selectedTaskTreeRunId || !taskTreeRunList.some((run) => run.runId === selectedTaskTreeRunId)) {
      setSelectedTaskTreeRunId(taskTreeRunList[0].runId);
    }
  }, [selectedTaskTreeRunId, taskTreeRunList]);

  useEffect(() => {
    if (actionTaskTreeRunList.length === 0) {
      if (selectedActionTaskTreeRunId) setSelectedActionTaskTreeRunId('');
      return;
    }
    if (!selectedActionTaskTreeRunId || !actionTaskTreeRunList.some((run) => run.runId === selectedActionTaskTreeRunId)) {
      setSelectedActionTaskTreeRunId(actionTaskTreeRunList[0].runId);
    }
  }, [selectedActionTaskTreeRunId, actionTaskTreeRunList]);
  const activeStepConfig = timelineRun && typeof timelineRun.context === 'object'
    ? ((timelineRun.context as any).data?.activeStepConfig || (timelineRun.context as any).source?.activeStepConfig || null)
    : null;
  const activeStepMeta = timelineRun?.currentStepId
    ? timelineSteps.find((step) => step.id === timelineRun.currentStepId) || null
    : null;
  const activeStepLabel = activeStepMeta?.label || activeStepMeta?.actionId || timelineRun?.currentStepId || null;
  const retryDelayMs = Number(activeStepConfig?.retryDelayMs);
  const retryDelayLabel = Number.isFinite(retryDelayMs) && retryDelayMs > 0
    ? (retryDelayMs >= 1000
        ? `${(retryDelayMs / 1000).toFixed(retryDelayMs % 1000 === 0 ? 0 : 1)}s`
        : `${Math.round(retryDelayMs)}ms`)
    : '1.2s';
  const maxRetriesRaw = Number(activeStepConfig?.maxRetries);
  const maxRetries = Number.isFinite(maxRetriesRaw) ? Math.max(0, Math.floor(maxRetriesRaw)) : 0;
  const retryPolicyLine = activeStepLabel
    ? `Retry policy: rate_limit/timeout/network | active step ${activeStepLabel}: maxRetries ${maxRetries}, delay ${retryDelayLabel}`
    : 'Retry policy: rate_limit/timeout/network | per-step maxRetries (default 0), delay 1.2s when enabled';
  const actionRetryDelayMs = Number(actionTaskActiveConfig?.retryDelayMs);
  const actionRetryDelayLabel = Number.isFinite(actionRetryDelayMs) && actionRetryDelayMs > 0
    ? (actionRetryDelayMs >= 1000
        ? `${(actionRetryDelayMs / 1000).toFixed(actionRetryDelayMs % 1000 === 0 ? 0 : 1)}s`
        : `${Math.round(actionRetryDelayMs)}ms`)
    : '1.2s';
  const actionMaxRetriesRaw = Number(actionTaskActiveConfig?.maxRetries);
  const actionMaxRetries = Number.isFinite(actionMaxRetriesRaw) ? Math.max(0, Math.floor(actionMaxRetriesRaw)) : 0;
  const actionRetryBadge = actionTaskActiveConfig
    ? `Action retry ${actionMaxRetries} | ${actionRetryDelayLabel}`
    : '';
  const actionRetryTitle = actionTaskActiveConfig
    ? `Action ${actionTaskActiveConfig.actionId || 'task'} | maxRetries ${actionMaxRetries} | delay ${actionRetryDelayLabel}${
        Number.isFinite(Number(actionTaskActiveConfig.timeoutMs)) && Number(actionTaskActiveConfig.timeoutMs) > 0
          ? ` | timeout ${Math.round(Number(actionTaskActiveConfig.timeoutMs))}ms`
          : ''
      }`
    : '';

  return (
    <div className="flex flex-col h-full w-full relative">
      
      {/* Modal Layer */}
      {editingAgent && (
        <AgentConfigModal 
          agent={editingAgent}
          isOpen={!!editingAgent}
          onClose={() => setEditingAgent(null)}
          onSave={(updated) => onUpdateAgent(updated)}
          onDelete={onDeleteAgent}
        />
      )}

      {/* Group Chat Header */}
      <div className="flex flex-col border-b border-white/5 bg-black/20 backdrop-blur-sm z-10 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
                <div className="flex -space-x-2 overflow-hidden pl-1">
                    {agents.map(agent => (
                        <button 
                            key={agent.id} 
                            onClick={() => setEditingAgent(agent)} // Click header avatar to edit
                            className={`
                                relative inline-flex items-center justify-center w-7 h-7 rounded-full ring-2 ring-[#1e1e1e] 
                                ${agent.color} text-[10px] font-bold text-white shadow-lg cursor-pointer hover:scale-110 transition-transform
                            `} 
                            title={`Edit ${agent.name}`}
                        >
                            {agent.name.substring(0, 1)}
                        </button>
                    ))}
                    <button 
                        onClick={onAddAgent}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 ring-2 ring-[#1e1e1e] text-gray-400 hover:text-white transition-colors"
                        title="Add Agent to Group"
                    >
                        <Plus size={12} />
                    </button>
                </div>
                <div className="flex flex-col cursor-pointer" onClick={() => setShowBiasInput(!showBiasInput)}>
                    <span className="text-xs font-semibold text-gray-200 flex items-center gap-1 hover:text-blue-400 transition-colors">
                        Trading Desk <Zap size={10} className="text-yellow-500"/>
                    </span>
                    <span className="text-[10px] text-gray-500">{sessionBias ? 'Bias Active' : 'Set Session Bias'}</span>
                </div>
            </div>

            <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-1 max-w-[60vw] custom-scrollbar mask-linear-fade">

                {typeof actionQueueDepth === 'number' && (
                    <div
                      className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold border ${
                        actionQueueDepth > 0
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : 'bg-white/5 border-white/10 text-gray-400'
                      }`}
                      title="Action task queue depth"
                    >
                      Action Q {actionQueueDepth}
                    </div>
                )}

                {actionTaskActiveConfig && (
                    <div
                      className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold border bg-sky-500/10 border-sky-500/30 text-sky-200"
                      title={actionRetryTitle}
                    >
                      {actionRetryBadge}
                    </div>
                )}
                
                {/* VOICE TOGGLE (New) */}
                {isLive && liveMode === 'audio' ? (
                   <button 
                        onClick={stopLiveSession}
                        className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/50 rounded-full text-[10px] font-bold animate-pulse hover:bg-green-500/30 transition-all"
                    >
                        <Mic size={14} className="animate-bounce" />
                        <span>VOICE ACTIVE</span>
                    </button>
                ) : (
                    <button 
                        onClick={() => startLiveSession('audio')}
                        disabled={isLive}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium transition-all ${isLive ? 'opacity-30 cursor-not-allowed bg-white/5' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300'}`}
                        title="Start Voice Chat"
                    >
                        <Headphones size={12} />
                        <span>Voice</span>
                    </button>
                 )}

                {/* Auto Tab Vision (sends active tab snapshot with messages) */}
                <button
                    onClick={onToggleAutoTabVision}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium transition-all border ${
                        autoTabVisionEnabled 
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' 
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300'
                    }`}
                    title={autoTabVisionEnabled ? 'Auto Tab Vision: ON (sends active tab snapshot)' : 'Auto Tab Vision: OFF'}
                >
                    <Monitor size={12} />
                    <span>Tab</span>
                </button>

                {/* Chart Watch (proactive chart updates) */}
                <div className="relative flex-shrink-0 flex items-center">
                    <button
                        onClick={onToggleChartWatch}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-full text-[10px] font-medium transition-all border ${
                            chartWatchEnabled
                                ? (chartWatchSnoozedUntilMs && chartWatchSnoozedUntilMs > Date.now()
                                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
                                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300')
                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300'
                        }`}
                        title={chartWatchEnabled ? 'Chart Watch: ON (runs on Watched TradingView tabs)' : 'Chart Watch: OFF'}
                    >
                        <Activity size={12} />
                        <span>Watch</span>
                        <span className="ml-1 px-1.5 py-0.5 rounded-md border border-white/10 bg-black/20 text-[9px] font-bold tracking-wider">
                            {chartWatchMode === 'signals' ? 'SIG' : chartWatchMode === 'digest' ? 'DGT' : 'LIVE'}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowWatchMenu(!showWatchMenu)}
                        className={`px-2.5 py-1.5 rounded-r-full text-[10px] font-medium transition-all border border-l-0 ${
                            chartWatchEnabled
                                ? (chartWatchSnoozedUntilMs && chartWatchSnoozedUntilMs > Date.now()
                                    ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/15'
                                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/15')
                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300'
                        }`}
                        title="Chart Watch options"
                    >
                        <ChevronDown size={12} />
                    </button>

                    {showWatchMenu && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                            <div className="px-4 py-3 border-b border-white/5">
                                <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                                    <Activity size={14} className="text-emerald-400" />
                                    Chart Watch
                                </div>
                                <div className="mt-1 text-[10px] text-gray-500">
                                    Runs only on tabs you mark as <span className="text-gray-300 font-semibold">Watched</span>.
                                </div>
                            </div>

                            <div className="p-3 space-y-4 max-h-[70vh] overflow-y-auto">
                                <div className="space-y-2">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">Mode</div>
                                    <div className="flex gap-2">
                                        {(['signals', 'digest', 'live'] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => { onSetChartWatchMode(m); }}
                                                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                                                    chartWatchMode === m
                                                        ? 'bg-white/10 border-white/20 text-white'
                                                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                                }`}
                                                title={m === 'signals' ? 'Only post trade tickets' : m === 'digest' ? 'Update a single digest message' : 'Post full updates (can be chatty)'}
                                            >
                                                {m === 'signals' ? 'Signals' : m === 'digest' ? 'Digest' : 'Live'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">Interval</div>
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className="text-gray-500" />
                                        <input
                                            type="number"
                                            min={5}
                                            max={600}
                                            value={chartWatchIntervalSec}
                                            onChange={(e) => setChartWatchIntervalSec(e.target.value)}
                                            onBlur={() => applyChartWatchIntervalSec(chartWatchIntervalSec)}
                                            className="w-20 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-gray-100 focus:outline-none focus:border-emerald-500/40 transition-colors font-mono"
                                        />
                                        <span className="text-[10px] text-gray-500">sec</span>
                                        <div className="ml-auto flex gap-1.5">
                                            {[30, 60, 120].map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => applyChartWatchIntervalSec(String(s))}
                                                    className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-colors"
                                                    title={`Set interval to ${s}s`}
                                                >
                                                    {s}s
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-gray-600">Default is 60s. Faster updates cost more and can spam.</div>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">Lead Agent</div>
                                    <select
                                        value={chartWatchLeadAgentId}
                                        onChange={(e) => onSetChartWatchLeadAgentId(e.target.value)}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-gray-100 focus:outline-none focus:border-emerald-500/40 transition-colors font-mono"
                                    >
                                        {agents.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-widest">Snooze</div>
                                    {chartWatchSnoozedUntilMs && chartWatchSnoozedUntilMs > Date.now() ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[11px] text-yellow-200">
                                                Snoozed until {new Date(chartWatchSnoozedUntilMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => onClearChartWatchSnooze()}
                                                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 transition-colors"
                                            >
                                                Resume
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onSnoozeChartWatch(5 * 60 * 1000)}
                                                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-colors"
                                            >
                                                5m
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onSnoozeChartWatch(15 * 60 * 1000)}
                                                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-colors"
                                            >
                                                15m
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onSnoozeChartWatch(60 * 60 * 1000)}
                                                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-colors"
                                            >
                                                60m
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Chart Sessions</div>
                                        <button
                                            type="button"
                                            onClick={() => onCreateChartSessionFromActiveTab?.()}
                                            disabled={!activeTabId || !onCreateChartSessionFromActiveTab}
                                            className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                                                activeTabId && onCreateChartSessionFromActiveTab
                                                    ? 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-200'
                                                    : 'bg-white/5 border-white/10 text-gray-500 opacity-60 cursor-not-allowed'
                                            }`}
                                            title={activeTabId ? 'Create a chart session from the active tab' : 'Open a chart tab first'}
                                        >
                                            <Plus size={12} className="inline-block mr-1" />
                                            Create
                                        </button>
                                    </div>

                                    <div className="text-[10px] text-gray-600">
                                        Assign your H4/H1/15m chart tabs so agents can analyze top-down with a single update.
                                    </div>

                                    {chartSessions.length === 0 ? (
                                        <div className="text-[11px] text-gray-500 bg-black/20 border border-white/10 rounded-lg p-2">
                                            No sessions yet. Create one from the active chart tab, then assign the other timeframes.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {chartSessions.map((s) => {
                                                const timeframes: ChartTimeframe[] = ['4h', '1h', '15m'];
                                                const tfLabel = (tf: ChartTimeframe) => (tf === '4h' ? 'H4' : tf === '1h' ? 'H1' : '15m');
                                                return (
                                                    <div key={s.id} className="bg-black/20 border border-white/10 rounded-xl p-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="text-[12px] font-semibold text-gray-100 truncate" title={s.symbol}>
                                                                    {s.symbol}
                                                                </div>
                                                                <div className="text-[10px] text-gray-500">
                                                                    {s.watchEnabled ? 'Watch: ON' : 'Watch: OFF'}
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onToggleChartSessionWatch?.(s.id)}
                                                                    disabled={!onToggleChartSessionWatch}
                                                                    className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                                                                        s.watchEnabled
                                                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15'
                                                                            : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                                                    } ${!onToggleChartSessionWatch ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                    title="Toggle session watch"
                                                                >
                                                                    <Zap size={12} className="inline-block mr-1" />
                                                                    {s.watchEnabled ? 'On' : 'Off'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onRemoveChartSession?.(s.id)}
                                                                    disabled={!onRemoveChartSession}
                                                                    className={`p-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 transition-colors ${
                                                                        !onRemoveChartSession ? 'opacity-60 cursor-not-allowed' : ''
                                                                    }`}
                                                                    title="Remove session"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="mt-2 space-y-1.5">
                                                            {timeframes.map((tf) => {
                                                                const tabId = s.views[tf];
                                                                const title = tabId
                                                                    ? (getTabTitle?.(tabId) || tabId)
                                                                    : 'Unassigned';
                                                                const canAssign = !!activeTabId && !!onAssignActiveTabToChartSession;
                                                                return (
                                                                    <div key={tf} className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/10 px-2 py-1.5">
                                                                        <div className="w-9 text-[10px] text-gray-500 font-mono">{tfLabel(tf)}</div>
                                                                        <div className="flex-1 min-w-0 text-[11px] text-gray-200 truncate" title={title}>
                                                                            {title}
                                                                        </div>
                                                                        {tabId && onClearChartSessionTimeframe && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => onClearChartSessionTimeframe(s.id, tf)}
                                                                                className="p-1 rounded-md hover:bg-white/10 text-gray-400 transition-colors"
                                                                                title="Clear timeframe"
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => onAssignActiveTabToChartSession?.(s.id, tf)}
                                                                            disabled={!canAssign}
                                                                            className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                                                                                canAssign
                                                                                    ? 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-200'
                                                                                    : 'bg-white/5 border-white/10 text-gray-500 opacity-60 cursor-not-allowed'
                                                                            }`}
                                                                            title={canAssign ? 'Assign active tab to this timeframe' : 'Open a chart tab first'}
                                                                        >
                                                                            Set
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                 {/* Live Vision Controls */}
                 {isLive && liveMode !== 'audio' ? (
                     <button 
                         onClick={stopLiveSession}
                        className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded-full text-[10px] font-bold animate-pulse hover:bg-red-500/30 transition-all"
                    >
                        <StopCircle size={14} />
                        <span>VISION ACTIVE</span>
                    </button>
                ) : (
                    <div className="relative">
                        <button 
                            onClick={() => setShowLiveMenu(!showLiveMenu)}
                            disabled={isLive}
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium transition-all ${isLive ? 'opacity-30 cursor-not-allowed bg-white/5' : 'bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300'}`}
                        >
                            <Video size={12} />
                            <span>Vision</span>
                        </button>
                        {showLiveMenu && (
                            <div className="absolute top-full right-0 mt-2 w-40 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                                <button 
                                    onClick={() => { startLiveSession('camera'); setShowLiveMenu(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-xs text-gray-300 transition-colors text-left"
                                >
                                    <Camera size={14} className="text-blue-400" />
                                    Camera
                                </button>
                                <button 
                                    onClick={() => { startLiveSession('screen'); setShowLiveMenu(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-xs text-gray-300 transition-colors text-left border-t border-white/5"
                                >
                                    <Monitor size={14} className="text-purple-400" />
                                    Screen
                                </button>
                            </div>
                        )}
                    </div>
                )}
                </div>

        <button onClick={onClearChat} className="flex-shrink-0 text-gray-500 hover:text-red-400 p-1.5 hover:bg-white/5 rounded-md transition-all" title="Clear History">
            <Trash2 size={14} />
        </button>
    </div>
</div>

        {onUpdateSymbolScope && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <input
                  value={symbolInput}
                  onChange={(event) => setSymbolInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSymbolSubmit();
                    }
                    if (event.key === 'Escape') {
                      setSymbolSuggestionsOpen(false);
                    }
                  }}
                  onFocus={() => {
                    setSymbolInputFocused(true);
                    if (symbolSuggestions.length > 0) setSymbolSuggestionsOpen(true);
                  }}
                  onBlur={() => {
                    setSymbolInputFocused(false);
                    window.setTimeout(() => setSymbolSuggestionsOpen(false), 120);
                  }}
                  placeholder={symbolScopeSymbol ? `Scope: ${symbolScopeSymbol}` : 'Set symbol scope (broker)'}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500/60"
                />
                {symbolSuggestionsOpen && (
                  <div className="absolute left-0 right-0 mt-1 rounded-lg border border-white/10 bg-black/90 shadow-xl z-30 max-h-56 overflow-y-auto custom-scrollbar">
                    {symbolSuggestionsLoading && (
                      <div className="px-3 py-2 text-[10px] text-gray-400">Searching broker…</div>
                    )}
                    {!symbolSuggestionsLoading && symbolSuggestions.length === 0 && (
                      <div className="px-3 py-2 text-[10px] text-gray-500">No matches yet.</div>
                    )}
                    {symbolSuggestions.map((item) => (
                      <button
                        key={`${item.symbol}-${item.label || ''}`}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSymbolSelect(item.symbol);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-white/5 transition-colors"
                      >
                        <div className="text-[11px] text-gray-100 font-semibold">{item.symbol}</div>
                        {item.label ? <div className="text-[10px] text-gray-500">{item.label}</div> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSymbolSubmit()}
                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-sky-500/20 text-sky-200 border border-sky-500/30 hover:bg-sky-500/30"
              >
                Set
              </button>
              {symbolScopeSymbol && onClearSymbolScope ? (
                <button
                  type="button"
                  onClick={() => onClearSymbolScope()}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10"
                >
                  Clear
                </button>
              ) : null}
              <div className="px-2 py-1 rounded-md text-[9px] font-semibold border border-white/10 text-gray-400 bg-black/30">
                MTF {symbolScopeTimeframesLabel || '4H/1H/15M'}
              </div>
            </div>
            {symbolSuggestionsError ? (
              <div className="mt-1 text-[10px] text-red-300">{symbolSuggestionsError}</div>
            ) : null}
          </div>
        )}
        
        {/* Session Bias Input */}
        {showBiasInput && (
            <div className="px-4 py-2 bg-black/30 border-t border-white/5 flex items-center gap-2 animate-slideInRight">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Session Bias:</span>
                <input 
                    type="text" 
                    value={sessionBias}
                    onChange={(e) => onUpdateSessionBias(e.target.value)}
                    placeholder="E.g. Bearish on USD, avoiding News trading..."
                    className="flex-1 bg-transparent border-none text-xs text-yellow-500 placeholder-gray-600 focus:outline-none"
                />
            </div>
        )}
      </div>

      {/* Messages Area */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar relative">
        
        {/* Live Video Preview Overlay */}
        {isLive && liveMode !== 'audio' && (
            <div className="sticky top-0 z-20 mb-4 animate-slideInRight">
                <div className="relative rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-black">
                    <video 
                        ref={videoRef}
                        muted
                        autoPlay
                        playsInline
                        className="w-full h-48 object-cover opacity-80"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                        <div className="flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </div>
                        <span className="text-[10px] font-mono text-white/80 bg-black/50 px-2 py-0.5 rounded backdrop-blur-md">
                            LIVE VISION
                        </span>
                    </div>
                </div>
            </div>
        )}

        {chartSnapshotStatus && (
          <div className={`rounded-xl border p-3 ${chartSnapshotStatus.ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
            <div className="flex items-start gap-3">
              {chartSnapshotStatus.imageDataUrl && (
                <div className="w-28 h-20 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                  <img
                    src={chartSnapshotStatus.imageDataUrl}
                    alt="Native chart snapshot"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-gray-100">
                  {chartSnapshotStatus.ok
                    ? `Native chart snapshot captured${chartSnapshotStatus.symbol ? ` for ${chartSnapshotStatus.symbol}` : ''}.`
                    : 'Native chart snapshot NOT available.'}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">
                  Last update: {chartSnapshotStatus.capturedAtMs ? `${formatAge(chartSnapshotStatus.capturedAtMs)} ago` : '--'}
                </div>
                {chartSnapshotStatus.reasonCode && !chartSnapshotStatus.ok && (
                  <div className="text-[10px] text-amber-200 mt-1">
                    Reason: {chartSnapshotStatus.reasonCode}
                  </div>
                )}
                {chartSnapshotStatus.frames && chartSnapshotStatus.frames.length > 0 && (
                  <div className="mt-2 text-[10px] text-gray-300 space-y-1">
                    <div className="uppercase tracking-widest text-[9px] text-gray-400">Frames</div>
                    {chartSnapshotStatus.frames.map((frame, idx) => (
                      <div key={`${frame.tf}_${idx}`} className="flex items-center gap-2">
                        <span className="text-gray-200">{frame.tf}</span>
                        <span className="text-gray-500">|</span>
                        <span className="text-gray-300">{frame.barsCount} bars</span>
                        <span className="text-gray-500">|</span>
                        <span className="text-gray-400">
                          updated {frame.lastUpdatedAtMs ? `${formatAge(frame.lastUpdatedAtMs)} ago` : '--'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {chartSnapshotStatus.warnings && chartSnapshotStatus.warnings.length > 0 && (
                  <details className="mt-2 text-[10px] text-gray-400">
                    <summary className="cursor-pointer text-gray-300">Details</summary>
                    <div className="mt-1">
                      {chartSnapshotStatus.warnings.map((warn, idx) => (
                        <div key={`${warn}_${idx}`}>- {warn}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {contextPackText && (
          <details open className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-gray-200 uppercase tracking-wider flex items-center gap-2">
              <Activity size={12} className="text-emerald-400" />
              Context Pack (Agents View)
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onCaptureContextPack?.({ copy: true })}
                className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => onCaptureContextPack?.({ save: true })}
                className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-200"
              >
                Save
              </button>
            </div>
            <pre className="mt-2 text-[10px] leading-relaxed text-gray-300 whitespace-pre-wrap font-mono">
{contextPackText}
            </pre>
          </details>
        )}

        {timelineRun && (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-200 uppercase tracking-wider">
                <Activity size={12} className="text-sky-400" />
                Run Timeline
              </div>
              <div className="flex items-center gap-2">
                {onResumePlaybookRun && (timelineRun.status === 'blocked' || timelineRun.status === 'failed') && (
                  <button
                    type="button"
                    onClick={() => onResumePlaybookRun(timelineRun.runId)}
                    className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                  >
                    Resume
                  </button>
                )}
                <div className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusBadge(timelineRun.status)}`}>
                  {String(timelineRun.status || 'unknown').toUpperCase()}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[10px] text-gray-500">{retryPolicyLine}</div>
            <div className="mt-2 text-[11px] text-gray-300">
              <span className="font-semibold text-gray-100">{timelineRun.playbookName || timelineRun.playbookId}</span>
              {timelineRun.symbol ? ` | ${timelineRun.symbol}` : ''}
              {timelineRun.timeframe ? ` ${timelineRun.timeframe}` : ''}
              {timelineRun.strategy ? ` | ${timelineRun.strategy}` : ''}
              {timelineRun.mode ? ` | ${timelineRun.mode}` : ''}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              Started {formatRunTime(timelineRun.startedAtMs)}{timelineRun.finishedAtMs ? ` • Finished ${formatRunTime(timelineRun.finishedAtMs)}` : ''}
            </div>
            {timelineRun.error && (
              <div className="mt-2 text-[10px] text-red-300">Error: {timelineRun.error}</div>
            )}
            {blockedStep && onResumePlaybookRun && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-100">
                <div className="font-semibold text-amber-200">
                  {blockedHeader}: {blockedStep.label || blockedStep.actionId}
                </div>
                {blockedNote && (
                  <div className="text-[10px] text-amber-200/80">Reason: {blockedStep.note}</div>
                )}
                {blockedIsMissing && timelineRun && (
                  <div className="mt-2 grid gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={getResumeDraft(timelineRun.runId).symbol}
                        onChange={(e) => updateResumeDraft(timelineRun.runId, { symbol: e.target.value })}
                        placeholder={timelineRun.symbol || 'Symbol'}
                        className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                      />
                      <input
                        type="text"
                        value={getResumeDraft(timelineRun.runId).timeframe}
                        onChange={(e) => updateResumeDraft(timelineRun.runId, { timeframe: e.target.value })}
                        placeholder={timelineRun.timeframe || 'Timeframe'}
                        className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                      />
                      <input
                        type="text"
                        value={getResumeDraft(timelineRun.runId).strategy}
                        onChange={(e) => updateResumeDraft(timelineRun.runId, { strategy: e.target.value })}
                        placeholder={timelineRun.strategy || 'Strategy'}
                        className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                      />
                      <input
                        type="text"
                        value={getResumeDraft(timelineRun.runId).timeframes}
                        onChange={(e) => updateResumeDraft(timelineRun.runId, { timeframes: e.target.value })}
                        placeholder="MTF list (4h,1h,15m,5m)"
                        className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                      />
                    </div>
                    <details className="text-[10px] text-gray-300">
                      <summary className="cursor-pointer text-gray-200">Advanced overrides (JSON)</summary>
                      <textarea
                        value={getResumeDraft(timelineRun.runId).dataJson}
                        onChange={(e) => updateResumeDraft(timelineRun.runId, { dataJson: e.target.value })}
                        placeholder='{"rangeDays":90,"maxCombos":200}'
                        className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-100 placeholder:text-gray-500"
                        rows={3}
                      />
                    </details>
                    {resumeOverrideErrors[timelineRun.runId] && (
                      <div className="text-[10px] text-red-300">{resumeOverrideErrors[timelineRun.runId]}</div>
                    )}
                  </div>
                )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {blockedIsMissing && (
                        <button
                          type="button"
                          onClick={() => {
                            const defaults = resolveRunDefaults(timelineRun);
                            updateResumeDraft(timelineRun.runId, defaults);
                          }}
                          className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                        >
                          Use defaults
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const opts: any = { action: blockedPrimaryAction, stepId: blockedStep.id, actionId: blockedStep.actionId };
                          if (blockedIsMissing) {
                            const built = buildResumeOverrides(timelineRun.runId);
                            if (built.error) {
                              setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: built.error || 'Invalid overrides.' }));
                              return;
                            }
                            if (blockedRequirement === 'symbol' && !built.overrides?.symbol) {
                              setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: 'Symbol is required.' }));
                              return;
                            }
                            if (blockedRequirement === 'timeframe' && !(built.overrides?.timeframe || (built.overrides?.timeframes || []).length > 0)) {
                              setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: 'Timeframe is required.' }));
                              return;
                            }
                            if (blockedRequirement === 'params' && (!built.overrides?.data || Object.keys(built.overrides.data).length === 0)) {
                              setResumeOverrideErrors((prev) => ({ ...prev, [timelineRun.runId]: 'Overrides JSON is required.' }));
                              return;
                            }
                            if (built.overrides) opts.overrides = built.overrides;
                          }
                          onResumePlaybookRun(timelineRun.runId, opts);
                        }}
                    className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                  >
                    {blockedPrimaryLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => onResumePlaybookRun(timelineRun.runId, { action: 'skip', stepId: blockedStep.id, actionId: blockedStep.actionId })}
                    className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => onResumePlaybookRun(timelineRun.runId, { action: 'abort', stepId: blockedStep.id, actionId: blockedStep.actionId })}
                    className="px-2 py-1 rounded-md text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-200"
                  >
                    Abort
                  </button>
                </div>
              </div>
            )}
            {timelineSteps.length > 0 ? (
              <div className="mt-3 space-y-2">
                {timelineSteps.map((step, idx) => (
                  <div key={step.id || `${step.actionId}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                    <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${statusBadge(step.status)}`}>
                      {String(step.status || '').toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-200">
                        {step.label || step.actionId}
                        {Number.isFinite(Number(step.startedAtMs)) && (
                          <span className="ml-2 text-gray-500">{formatRunTime(step.startedAtMs)}</span>
                        )}
                      </div>
                      {(step.note || step.error) && (
                        <div className="text-gray-500">
                          {step.note || step.error}
                        </div>
                      )}
                      {(Number(step.attempts || 0) > 1 || Number(step.retryCount || 0) > 0) && (
                        <div className="text-gray-500">
                          Attempts: {Number(step.attempts || 0)} | Retries: {Number(step.retryCount || 0)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-[10px] text-gray-500">No steps recorded yet.</div>
            )}
            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-gray-400">
                <span>Truth Replay</span>
                <div className="flex items-center gap-2">
                  <select
                    value={truthEventFilter}
                    onChange={(e) => {
                      const next = e.target.value as typeof truthEventFilter;
                      setTruthEventFilter(next);
                      try { localStorage.setItem('glass_truth_event_filter', next); } catch {}
                    }}
                    className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-gray-200"
                  >
                    <option value="all">All</option>
                    <option value="trade">Trades</option>
                    <option value="broker">Broker</option>
                    <option value="setup">Setup</option>
                    <option value="chart">Chart</option>
                    <option value="agent">Agent</option>
                    <option value="playbook">Playbook</option>
                    <option value="task">Task Tree</option>
                  </select>
                  {truthEventsUpdatedAtMs && (
                    <span className="text-[10px] text-gray-500">Updated {formatRunTime(truthEventsUpdatedAtMs)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => loadTruthEvents(timelineRun)}
                    className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {truthEventsError && (
                <div className="mt-1 text-[10px] text-red-300">Truth replay: {truthEventsError}</div>
              )}
              {filteredTruthEvents.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {filteredTruthEvents.map((event, idx) => {
                    const eventType = String(event?.eventType || event?.kind || 'event');
                    const label = eventType.replace(/_/g, ' ');
                    const detail =
                      event?.payload?.error ||
                      event?.payload?.reason ||
                      event?.payload?.note ||
                      event?.payload?.status ||
                      null;
                    const ts = Number(event?.createdAtMs || event?.updatedAtMs || 0);
                    return (
                      <div key={event?.id || `${eventType}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                        <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${truthLevelBadge(event?.level)}`}>
                          {String(event?.level || 'info').toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="text-gray-200">
                            {label}
                            {Number.isFinite(ts) && ts > 0 && (
                              <span className="ml-2 text-gray-500">{formatRunTime(ts)}</span>
                            )}
                          </div>
                          {detail && (
                            <div className="text-gray-500">{String(detail)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-gray-500">No truth events for this filter.</div>
              )}
            </div>
          </div>
        )}

        {historyRuns.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-200 uppercase tracking-wider">
              <Clock size={12} className="text-purple-300" />
              Run History
            </div>
            <div className="mt-3 space-y-2">
              {historyRuns.map((run) => {
                const steps = Array.isArray(run.steps) ? run.steps : [];
                return (
                  <details key={run.runId} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[10px] text-gray-300">
                    <summary className="cursor-pointer flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-100">{run.playbookName || run.playbookId}</span>
                        {run.symbol ? <span className="text-gray-400">{run.symbol}</span> : null}
                        {run.timeframe ? <span className="text-gray-400">{run.timeframe}</span> : null}
                        {run.strategy ? <span className="text-gray-400">{run.strategy}</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {onResumePlaybookRun && (run.status === 'blocked' || run.status === 'failed') && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              onResumePlaybookRun(run.runId);
                            }}
                            className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                          >
                            Resume
                          </button>
                        )}
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] ${statusBadge(run.status)}`}>
                          {String(run.status || 'unknown').toUpperCase()}
                        </span>
                      </div>
                    </summary>
                    <div className="mt-2 text-[10px] text-gray-500">
                      Started {formatRunTime(run.startedAtMs)}
                      {run.finishedAtMs ? `  • Finished ${formatRunTime(run.finishedAtMs)}` : ''}
                    </div>
                    {run.error && <div className="mt-1 text-[10px] text-red-300">Error: {run.error}</div>}
                    {steps.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {steps.map((step, idx) => (
                          <div key={step.id || `${step.actionId}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                            <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${statusBadge(step.status)}`}>
                              {String(step.status || '').toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <div className="text-gray-200">
                                {step.label || step.actionId}
                              </div>
                              {(step.note || step.error) && (
                                <div className="text-gray-500">
                                  {step.note || step.error}
                                </div>
                              )}
                              {(Number(step.attempts || 0) > 1 || Number(step.retryCount || 0) > 0) && (
                                <div className="text-gray-500">
                                  {Number(step.attempts || 0)} attempts / {Number(step.retryCount || 0)} retries
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] text-gray-500">No steps recorded.</div>
                    )}
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {taskTreeResumeList.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-gray-200 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <Activity size={12} className="text-amber-300" />
                Task Tree Resume
              </div>
              <span className="text-[10px] text-gray-500">{taskTreeResumeList.length} pending</span>
            </div>
            <div className="space-y-2">
              {taskTreeResumeList.map((entry) => {
                const label = entry.taskType === 'action' ? 'Action' : 'Signal';
                const context = entry.context || {};
                const symbol = context.symbol ? String(context.symbol) : '';
                const timeframe = context.timeframe ? String(context.timeframe) : '';
                const strategy = context.strategy ? String(context.strategy) : '';
                const requiresConfirmation =
                  entry.requiresConfirmation ||
                  entry.blockedReason === 'confirmation_required' ||
                  entry.lastStep?.note === 'confirmation_required';
                const canSkip = !!entry.blocked && !requiresConfirmation;
                const status = entry.status ? String(entry.status).toUpperCase() : 'PENDING';
                return (
                  <div key={`${entry.taskType}-${entry.runId}`} className="rounded-lg border border-white/10 bg-black/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-gray-200">
                        {label} run {entry.runId.slice(-6)}
                        {symbol ? ` | ${symbol}` : ''}
                        {timeframe ? ` ${timeframe}` : ''}
                        {strategy ? ` | ${strategy}` : ''}
                      </div>
                      <div className="flex items-center gap-2">
                        {onResumeTaskTreeRun && (
                          <>
                            {requiresConfirmation ? (
                              <button
                                type="button"
                                onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'approve' })}
                                className="px-2 py-1 rounded-md text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-100"
                              >
                                Approve
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'resume' })}
                                className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100"
                              >
                                Resume
                              </button>
                            )}
                            {canSkip && (
                              <button
                                type="button"
                                onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'skip' })}
                                className="px-2 py-1 rounded-md text-[10px] bg-slate-500/20 hover:bg-slate-500/30 text-slate-200"
                              >
                                Skip
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onResumeTaskTreeRun({ taskType: entry.taskType, runId: entry.runId, action: 'abort' })}
                              className="px-2 py-1 rounded-md text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-200"
                            >
                              Abort
                            </button>
                          </>
                        )}
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusBadge(status.toLowerCase())}`}>
                          {status}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-[10px] text-gray-500">
                      Updated {formatRunTime(entry.updatedAtMs)}
                      {Number.isFinite(Number(entry.queueDepth)) ? ` • Queue ${entry.queueDepth}` : ''}
                    </div>
                    {entry.lastStep && (
                      <div className="mt-1 text-[10px] text-gray-400">
                        Last step: {entry.lastStep.step} ({entry.lastStep.status})
                        {entry.lastStep.note ? ` • ${entry.lastStep.note}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(taskTreeRunList.length > 0 || actionTaskTreeRunList.length > 0) && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-200 uppercase tracking-wider">
              <Activity size={12} className="text-sky-300" />
              Task Tree Activity
            </div>
            {taskTreeRunList.length > 0 && (
              <div className="space-y-2">
                {taskTreeRunList.length > 1 && (
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>Signal run</span>
                    <select
                      value={selectedTaskTreeRun?.runId || ''}
                      onChange={(e) => setSelectedTaskTreeRunId(String(e.target.value))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                    >
                      {taskTreeRunList.map((run) => (
                        <option key={run.runId} value={run.runId}>
                          {run.runId.slice(-6)} {String(run.status || '').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedTaskTreeRun && renderTaskTreeRun(selectedTaskTreeRun, 'Signal Task Tree')}
              </div>
            )}
            {actionTaskTreeRunList.length > 0 && (
              <div className="space-y-2">
                {actionTaskTreeRunList.length > 1 && (
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>Action run</span>
                    <select
                      value={selectedActionTaskTreeRun?.runId || ''}
                      onChange={(e) => setSelectedActionTaskTreeRunId(String(e.target.value))}
                      className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
                    >
                      {actionTaskTreeRunList.map((run) => (
                        <option key={run.runId} value={run.runId}>
                          {run.runId.slice(-6)} {String(run.status || '').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedActionTaskTreeRun && renderTaskTreeRun(selectedActionTaskTreeRun, 'Action Task Tree')}
              </div>
            )}
            {taskTruthRunId && (
              <div className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-gray-400">
                  <span>Truth Replay (Run {taskTruthRunId.slice(-6)})</span>
                  <div className="flex items-center gap-2">
                    {taskTruthUpdatedAtMs && (
                      <span className="text-[10px] text-gray-500">Updated {formatRunTime(taskTruthUpdatedAtMs)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setTaskTruthRunId('')}
                      className="px-2 py-1 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-gray-200"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {taskTruthError && (
                  <div className="text-[10px] text-red-300">{taskTruthError}</div>
                )}
                {filteredTaskTruthEvents.length > 0 ? (
                  <div className="space-y-2">
                    {filteredTaskTruthEvents.map((event, idx) => {
                      const eventType = String(event?.eventType || event?.kind || 'event');
                      const label = eventType.replace(/_/g, ' ');
                      const detail =
                        event?.payload?.error ||
                        event?.payload?.reason ||
                        event?.payload?.note ||
                        event?.payload?.status ||
                        null;
                      const ts = Number(event?.createdAtMs || event?.updatedAtMs || 0);
                      return (
                        <div key={event?.id || `${eventType}-${idx}`} className="flex items-start gap-2 text-[10px] text-gray-300">
                          <div className={`mt-0.5 px-1.5 py-0.5 rounded-md border ${truthLevelBadge(event?.level)}`}>
                            {String(event?.level || 'info').toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="text-gray-200">
                              {label}
                              {Number.isFinite(ts) && ts > 0 && (
                                <span className="ml-2 text-gray-500">{formatRunTime(ts)}</span>
                              )}
                            </div>
                            {detail && (
                              <div className="text-gray-500">{String(detail)}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-500">No truth events for this run.</div>
                )}
              </div>
            )}
          </div>
        )}
        {Array.isArray(recommendedFlows) && recommendedFlows.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-200 uppercase tracking-wider">
              <Zap size={12} className="text-amber-300" />
              Recommended Flows
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={flowSymbolFilter}
                onChange={(e) => setFlowSymbolFilter(e.target.value)}
                placeholder="Symbol"
                className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
              />
              <input
                type="text"
                value={flowTimeframeFilter}
                onChange={(e) => setFlowTimeframeFilter(e.target.value)}
                placeholder="TF"
                className="w-20 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
              />
              {(flowSymbolFilter || flowTimeframeFilter) && (
                <button
                  type="button"
                  onClick={() => { setFlowSymbolFilter(''); setFlowTimeframeFilter(''); }}
                  className="px-2 py-1 rounded-md border border-white/10 text-[10px] text-gray-300 hover:bg-white/5"
                >
                  Clear
                </button>
              )}
            </div>
            {recommendedFlowList.length > 0 ? (
              <div className="space-y-2">
                {recommendedFlowList.map(renderRecommendedFlow)}
              </div>
            ) : (
              <div className="text-[10px] text-gray-500">No flows match the current filter.</div>
            )}
          </div>
        )}

        {/* Audio Only Visualizer Overlay */}
        {isLive && liveMode === 'audio' && (
            <div className="sticky top-0 z-20 mb-4 animate-slideInRight">
                <div className="relative rounded-xl overflow-hidden shadow-2xl border border-green-500/20 bg-gradient-to-br from-[#0a0a0a] to-[#001a00] p-6 flex flex-col items-center justify-center gap-4 h-48">
                    
                    <div className="flex items-center gap-1 h-8">
                         <div className="w-1.5 bg-green-500 rounded-full animate-loading-bar h-3" style={{animationDuration: '0.8s'}}></div>
                         <div className="w-1.5 bg-green-500 rounded-full animate-loading-bar h-5" style={{animationDuration: '1.2s'}}></div>
                         <div className="w-1.5 bg-green-500 rounded-full animate-loading-bar h-8" style={{animationDuration: '0.5s'}}></div>
                         <div className="w-1.5 bg-green-500 rounded-full animate-loading-bar h-6" style={{animationDuration: '0.9s'}}></div>
                         <div className="w-1.5 bg-green-500 rounded-full animate-loading-bar h-4" style={{animationDuration: '1.5s'}}></div>
                    </div>
                    
                    <div className="text-center">
                        <div className="text-sm font-bold text-green-400 tracking-wider">VOICE CONNECTED</div>
                        <div className="text-[10px] text-green-500/60 mt-1">Listening to Trading Team...</div>
                    </div>

                    <div className="absolute top-3 left-3 flex items-center gap-2">
                        <div className="flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </div>
                        <span className="text-[10px] font-mono text-green-400/80 bg-black/50 px-2 py-0.5 rounded backdrop-blur-md">
                            LIVE VOICE
                        </span>
                    </div>
                </div>
            </div>
        )}

        {trimmedCount > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] text-gray-400">
            Showing last {renderMessages.length} messages (trimmed {trimmedCount} older messages for performance).
          </div>
        )}

        {renderMessages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-slideInRight`}
          >
            {/* Agent Name Tag for Model Messages */}
            {msg.role === 'model' && (
                <div className="flex items-center gap-2 mb-1.5 ml-1 opacity-90">
                    <div className={`flex items-center justify-center w-5 h-5 rounded-full ${msg.agentColor || 'bg-gray-500'} shadow-sm`}>
                         <span className="text-[9px] font-bold text-white">{msg.agentName?.[0] || 'G'}</span>
                    </div>
                    <span className="text-[11px] font-bold text-gray-300 tracking-wide">
                        {msg.agentName || 'Gemini'}
                    </span>
                    <span className="text-[10px] text-gray-600">
                        {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                    {/* TTS Button */}
                    <button 
                        onClick={() => speakMessage(msg.id, msg.text, msg.agentName)}
                        className={`ml-2 p-1 rounded-full transition-colors ${speakingMessageId === msg.id ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-300'}`}
                        title="Read Aloud"
                    >
                        {speakingMessageId === msg.id ? <VolumeX size={12} className="animate-pulse"/> : <Volume2 size={12} />}
                    </button>
                </div>
            )}
            
            {/* User Name Tag */}
            {msg.role === 'user' && (
                <div className="flex items-center gap-2 mb-1 mr-1 opacity-50 justify-end">
                     <span className="text-[10px] text-gray-500">
                        {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 tracking-wide">YOU</span>
                </div>
            )}

            <div 
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-lg backdrop-blur-md border ${
                msg.role === 'user' 
                  ? 'bg-blue-600/90 border-blue-500/50 text-white rounded-tr-sm' 
                  : msg.isError 
                    ? 'bg-red-900/40 border-red-500/30 text-red-100 rounded-tl-sm'
                    : 'bg-[#252525]/80 border-white/5 text-gray-100 rounded-tl-sm'
              }`}
            >
              {msg.image && (
                <div className="mb-3 rounded-lg overflow-hidden border border-white/10 shadow-md">
                  <img src={msg.image} alt="Content" className="w-full h-auto object-cover max-h-60" />
               </div>
              )}
              
              {msg.isStreaming && !msg.text && (
                <div className="flex gap-1.5 items-center">
                  <div className={`w-1.5 h-1.5 ${msg.agentColor || 'bg-blue-600'} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }} />
                  <div className={`w-1.5 h-1.5 ${msg.agentColor || 'bg-blue-600'} rounded-full animate-bounce`} style={{ animationDelay: '150ms' }} />
                  <div className={`w-1.5 h-1.5 ${msg.agentColor || 'bg-blue-600'} rounded-full animate-bounce`} style={{ animationDelay: '300ms' }} />
                </div>
              )}

              {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

              {msg.contextTabs && msg.contextTabs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.contextTabs.map((tab, idx) => {
                    const label = String(tab.label || "Tab");
                    const age = formatAge(tab.capturedAtMs);
                    const changed = tab.changed !== false;
                    const source = tab.source ? String(tab.source) : "";
                    const sourceLabel =
                      source === "active"
                        ? "Active"
                        : source === "pinned"
                          ? "Pinned"
                          : source === "watched"
                            ? "Watched"
                            : source === "tradingview"
                              ? "TradingView"
                              : "";

                    return (
                      <div
                        key={`${msg.id}_ctx_${idx}`}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] border ${
                          changed
                            ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/30"
                            : "bg-white/5 text-gray-400 border-white/10"
                        }`}
                        title={`${label}${tab.url ? ` • ${tab.url}` : ""}${sourceLabel ? ` • ${sourceLabel}` : ""}`}
                      >
                        <span className={`inline-flex w-1.5 h-1.5 rounded-full ${changed ? "bg-emerald-400" : "bg-gray-500"}`} />
                        <span className="truncate max-w-[140px]">{label}</span>
                        {sourceLabel && <span className="text-[9px] text-gray-500">{sourceLabel}</span>}
                        {age && <span className="text-[9px] text-gray-500">{age}</span>}
                        {!changed && <span className="text-[9px] text-gray-500">no change</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Render Trade Proposal if exists */}
              {msg.tradeProposal && (
                  <TradeTicket 
                    messageId={msg.id}
                    proposal={msg.tradeProposal} 
                    onExecute={onExecuteTrade}
                    onReject={onRejectTrade}
                  />
              )}

              {msg.brokerAction && renderBrokerAction(msg.id, msg.brokerAction)}

              {msg.agentToolAction && renderAgentToolAction(msg.agentToolAction)}
            </div>
          </div>
        ))}
        
        {isThinking && !isLive && !isStreamingReply && (
          <div className="flex flex-col items-start animate-pulse">
             <div className="flex items-center gap-2 mb-1.5 ml-1 opacity-70">
                    <div className={`w-5 h-5 rounded-full ${activeAgent.color} flex items-center justify-center`}>
                        <span className="text-[8px] text-white">...</span>
                    </div>
                    <span className="text-[11px] font-bold text-gray-400">{activeAgent.name} is typing...</span>
             </div>
             <div className="bg-[#2a2a2a]/40 backdrop-blur-md border border-white/5 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1.5 items-center ml-2">
                <div className={`w-1.5 h-1.5 ${activeAgent.color} rounded-full animate-bounce`} style={{ animationDelay: '0ms' }} />
                <div className={`w-1.5 h-1.5 ${activeAgent.color} rounded-full animate-bounce`} style={{ animationDelay: '150ms' }} />
                <div className={`w-1.5 h-1.5 ${activeAgent.color} rounded-full animate-bounce`} style={{ animationDelay: '300ms' }} />
             </div>
          </div>
        )}
        {!isAtBottom && unreadCount > 0 && (
          <div className="sticky bottom-3 z-30 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={() => {
                scrollToBottom();
                setUnreadCount(0);
                setIsAtBottom(true);
              }}
              className="pointer-events-auto px-3 py-1.5 rounded-full text-[11px] font-semibold bg-blue-600/30 hover:bg-blue-600/40 text-blue-100 border border-blue-500/40 shadow-lg transition-colors"
              title="Jump to latest messages"
            >
              New messages ({unreadCount}) - Jump to latest
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5 bg-[#121212]/40 backdrop-blur-xl">
        
        {/* Responder Selector Pill */}
         <div className="flex items-center gap-2 mb-3">
             <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-md border border-white/5">
                 <Users size={10} className="text-gray-500" />
                 <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Replying:</span>
             </div>

             <button
                 onClick={onToggleTeamMode}
                 className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider transition-all ${
                     isTeamMode
                         ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200'
                         : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                 }`}
                 title={isTeamMode ? 'Team mode: all agents respond' : 'Single mode: only selected agent responds'}
             >
                 <Sparkles size={10} className={isTeamMode ? 'text-indigo-300' : 'text-gray-500'} />
                 Team
             </button>
             
             <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 max-w-full mask-linear-fade">
                 {agents.map(agent => (
                     <button
                        key={agent.id}
                        onClick={() => onSwitchAgent(agent.id)}
                        onContextMenu={(e) => { e.preventDefault(); setEditingAgent(agent); }} // Right click to edit
                        className={`
                            group flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-[11px] font-medium transition-all border
                            ${activeAgentId === agent.id 
                                ? `bg-${agent.color.replace('bg-', '')}/20 border-${agent.color.replace('bg-', '')}/50 text-white ring-1 ring-${agent.color.replace('bg-', '')}/30` 
                                : 'bg-[#1a1a1a] border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/10 hover:border-white/10'
                            }
                        `}
                    >
                        <div className={`w-2 h-2 rounded-full ${agent.color} ${activeAgentId === agent.id ? 'animate-pulse' : ''}`} />
                        {agent.name}
                    </button>
                ))}
            </div>
            
            {/* Quick Edit Button for Active Agent */}
            <button 
                onClick={() => setEditingAgent(activeAgent)}
                className="ml-auto p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                title="Agent Settings"
            >
                <Settings size={12} />
            </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-gray-500">
            <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10">Playbook</span>
            <select
              value={selectedPlaybook?.id || ''}
              onChange={(e) => {
                const nextId = String(e.target.value);
                runChatActionOr('chat.playbook.default.set', { playbookId: nextId }, () => setSelectedPlaybookId(nextId));
              }}
              className="bg-[#0f0f0f] border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-200"
            >
              {playbookOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
              onClick={() => {
                const id = selectedPlaybook?.id || defaultPlaybookId;
                const symbol = selectedPlaybook?.symbol ? ` for ${selectedPlaybook.symbol}` : '';
              sendMessageViaAction(`run playbook ${id}${symbol}`);
              }}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/30 transition-colors"
            title="Run the default MTF trade session playbook"
          >
            <Zap size={10} className="inline-block mr-1" />
            Run Workflow
          </button>
          <button
            type="button"
              onClick={() => {
                const id = selectedPlaybook?.id || defaultPlaybookId;
                const symbol = selectedPlaybook?.symbol ? ` for ${selectedPlaybook.symbol}` : '';
              sendMessageViaAction(`run playbook ${id}${symbol} in autopilot`);
              }}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/30 transition-colors"
            title="Run MTF playbook in autopilot mode if enabled"
          >
            <Zap size={10} className="inline-block mr-1" />
            Auto Workflow
          </button>
        </div>

        {attachment && (
            <div className="mb-3 relative inline-block group">
                <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full"></div>
                <img src={attachment} alt="Preview" className="h-24 rounded-xl border border-white/20 shadow-xl relative z-10" />
                <button 
                    onClick={() => setAttachment(null)}
                    className="absolute -top-2 -right-2 z-20 bg-gray-800 text-white rounded-full p-1 shadow-lg border border-white/10 hover:bg-red-500 transition-colors"
                >
                    <X size={12} />
                </button>
            </div>
        )}

        <div className="relative flex gap-2 items-center">
          <div className="flex gap-1.5">
            <button 
                onClick={handleCaptureScreen}
                className="p-2.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all border border-transparent hover:border-blue-500/20"
                title={typeof captureActiveTabScreenshot === 'function' ? "Capture Tab" : "Share Screen"}
                disabled={isThinking || isLive || isCapturingSnapshot}
            >
                <Camera size={18} />
            </button>
            <button
                onClick={handleSendSnapshot}
                className="p-2.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all border border-transparent hover:border-emerald-500/20"
                title="Send tab snapshot to agents"
                disabled={isThinking || isLive || isCapturingSnapshot}
            >
                <Sparkles size={18} />
            </button>
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-xl transition-all border border-transparent hover:border-purple-500/20"
                title="Upload Image"
                disabled={isThinking || isLive || isCapturingSnapshot}
            >
                <Paperclip size={18} />
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileSelect} 
            />
          </div>

          <div className="flex-1 relative">
               <input
                 ref={inputRef}
                 type="text"
                 value={input}
                 onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                 placeholder={isLive ? "Listening... (or type to override)" : (isTeamMode ? "Message the team..." : `Message ${activeAgent.name}...`)}
                 disabled={isThinking}
                 className="w-full bg-[#0a0a0a]/50 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/40 focus:bg-[#0a0a0a]/80 focus:ring-1 focus:ring-blue-500/30 transition-all placeholder-gray-600 shadow-inner"
               />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                   {/* Optional: Indicator inside input */}
              </div>
          </div>
          
          <button 
            onClick={handleSubmit}
            disabled={(!input.trim() && !attachment) || isThinking}
            className={`p-3 ${activeAgent.color} hover:brightness-110 rounded-xl text-white transition-all disabled:opacity-50 disabled:bg-gray-800 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20 active:scale-95`}
          >
            {input.trim().startsWith('/image') ? <ImageIcon size={18}/> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
