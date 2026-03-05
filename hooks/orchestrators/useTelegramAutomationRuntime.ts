import React from 'react';

type UseTelegramAutomationRuntimeArgs = {
  activeBrokerSymbol: string;
  appendAuditEvent: (entry: any) => Promise<any> | void;
  autoPilotConfigRef: React.MutableRefObject<any>;
  buildTelegramSignalInlineActions: (entry: any, status: any) => any;
  captureChartChatSnapshot: (opts?: any) => Promise<any>;
  executeTelegramPendingAction: (pending: any) => Promise<void>;
  fetchMt5: (path: string, options?: any) => Promise<any>;
  fetchTelegramNewsSnapshot: (symbol: string) => Promise<any>;
  formatTelegramNewsTone: (tone?: string | null, toneScore?: number | null) => string;
  formatTelegramSignalLine: (entry: any) => string;
  formatTimeframeLabel: (timeframe?: string | null) => string;
  getDailyBaselineStorageKey: (accountKey: string, dateKey: string) => string;
  getLocalDateKey: (date?: Date) => string;
  loadFeatureControllers: () => Promise<any>;
  loadTelegramCallbackRuntimeModule: () => Promise<any>;
  loadTelegramCommandRuntimeModule: () => Promise<any>;
  loadTelegramMessageRuntimeModule: () => Promise<any>;
  parseTelegramAccountHint: (text: string) => string;
  parseTelegramBroker: (text: string) => 'mt5' | 'tradelocker' | null;
  parseTelegramChatIds: (raw: string) => string[];
  parseTelegramQtySpec: (text: string) => any;
  parseTelegramSymbol: (text: string) => string;
  parseTelegramTimeframe: (text: string) => string;
  pauseSignalIntent: (intentId: string, opts?: any) => Promise<any>;
  queueTelegramConfirmation: (input: any) => Promise<any>;
  readLocalJson: (key: string) => any | null;
  resolveSignalIntentByToken: (token: string) => any | null;
  resolveTelegramPendingAction: (id: string) => any | null;
  resolveTelegramSignalEntry: (token: string) => any | null;
  resolveTradeLockerSymbolBestEffort: (symbol: string) => string;
  resumeSignalIntent: (intentId: string, opts?: any) => Promise<any>;
  runTelegramManageAction: (input: any) => Promise<void>;
  runTelegramSignalAction: (input: any) => Promise<void>;
  sendPlainTextToOpenAI: (...args: any[]) => Promise<any>;
  sendTelegramAlert: (title: string, message: string, chatIdOverride?: string) => Promise<any>;
  sendTelegramPhoto: (dataUrl: string, caption?: string, chatIdOverride?: string) => Promise<any>;
  sendTelegramText: (text: string, chatIdOverride?: string, opts?: { replyMarkup?: any }) => Promise<any>;
  signalEntries: any[];
  signalEntriesRef: React.MutableRefObject<any[]>;
  signalHistory: any[];
  signalIntentFeatureFlags: { signalIntentV1TelegramOps: boolean };
  signalIntentRunsRef: React.MutableRefObject<any[]>;
  signalIntentsRef: React.MutableRefObject<any[]>;
  signalPrimarySymbol: string;
  signalStatusSet: Set<string>;
  signalTelegramAlertAgentConfidence: boolean;
  signalTelegramAlertConfidenceDrop: number;
  signalTelegramAlertDrawdown: boolean;
  signalTelegramAlertDrawdownPct: number;
  signalTelegramAlertSentRef: React.MutableRefObject<Map<string, Set<string>>>;
  signalTelegramAlertTpSl: boolean;
  signalTelegramAlertTrades: boolean;
  signalTelegramAllowChart: boolean;
  signalTelegramAllowManage: boolean;
  signalTelegramAllowStatus: boolean;
  signalTelegramBotToken: string;
  signalTelegramChatId: string;
  signalTelegramCommandMode: 'read' | 'manage';
  signalTelegramCommandPassphrase: string;
  signalTelegramCommandsEnabled: boolean;
  signalTelegramConfirmationsEnabled: boolean;
  signalTelegramDigestDailyEnabled: boolean;
  signalTelegramDigestHourLocal: number;
  signalTelegramDigestWeeklyDay: number;
  signalTelegramDigestWeeklyEnabled: boolean;
  signalTelegramEnabled: boolean;
  symbolScopeSymbol: string;
  telegramCommandInFlightRef: React.MutableRefObject<boolean>;
  telegramConfidenceRef: React.MutableRefObject<Map<string, number>>;
  telegramConfidenceSeenRef: React.MutableRefObject<Set<string>>;
  telegramDigestSentRef: React.MutableRefObject<{ dailyKey: string; weeklyKey: string }>;
  telegramDrawdownAlertRef: React.MutableRefObject<{ dateKey: string; sent: boolean }>;
  telegramMt5AlertInFlightRef: React.MutableRefObject<boolean>;
  telegramMt5PositionSnapshotRef: React.MutableRefObject<{ initialized: boolean; byId: Record<string, any> }>;
  telegramPendingActionsRef: React.MutableRefObject<Map<string, any>>;
  telegramPollingActiveRef: React.MutableRefObject<boolean>;
  telegramTlPositionSnapshotRef: React.MutableRefObject<{ initialized: boolean; byId: Record<string, any> }>;
  telegramUpdateIdRef: React.MutableRefObject<number>;
  telegramWatcherResumeRef: React.MutableRefObject<Record<string, number>>;
  tlAccountMetrics: any;
  tlBalance: number;
  tlEquity: number;
  tlOrders: any[];
  tlOrdersRef: React.MutableRefObject<any[]>;
  tlPositions: any[];
  tlPositionsRef: React.MutableRefObject<any[]>;
  tlSavedConfig: any;
  tlStatus: string;
  updateSetupWatcher: (watcherId: string, patch: any) => void;
  updateSymbolScope: (scope: any) => void;
  brokerLinkConfigRef: React.MutableRefObject<any>;
  setAutoPilotConfigRef: React.MutableRefObject<any>;
  setupWatchersRef: React.MutableRefObject<any[]>;
  writeLocalJson: (key: string, value: any) => boolean;
};

export const useTelegramAutomationRuntime = (args: UseTelegramAutomationRuntimeArgs) => {
  const {
    activeBrokerSymbol,
    appendAuditEvent,
    autoPilotConfigRef,
    buildTelegramSignalInlineActions,
    captureChartChatSnapshot,
    executeTelegramPendingAction,
    fetchMt5,
    fetchTelegramNewsSnapshot,
    formatTelegramNewsTone,
    formatTelegramSignalLine,
    formatTimeframeLabel,
    getDailyBaselineStorageKey,
    getLocalDateKey,
    loadFeatureControllers,
    loadTelegramCallbackRuntimeModule,
    loadTelegramCommandRuntimeModule,
    loadTelegramMessageRuntimeModule,
    parseTelegramAccountHint,
    parseTelegramBroker,
    parseTelegramChatIds,
    parseTelegramQtySpec,
    parseTelegramSymbol,
    parseTelegramTimeframe,
    pauseSignalIntent,
    queueTelegramConfirmation,
    readLocalJson,
    resolveSignalIntentByToken,
    resolveTelegramPendingAction,
    resolveTelegramSignalEntry,
    resolveTradeLockerSymbolBestEffort,
    resumeSignalIntent,
    runTelegramManageAction,
    runTelegramSignalAction,
    sendPlainTextToOpenAI,
    sendTelegramAlert,
    sendTelegramPhoto,
    sendTelegramText,
    signalEntries,
    signalEntriesRef,
    signalHistory,
    signalIntentFeatureFlags,
    signalIntentRunsRef,
    signalIntentsRef,
    signalPrimarySymbol,
    signalStatusSet,
    signalTelegramAlertAgentConfidence,
    signalTelegramAlertConfidenceDrop,
    signalTelegramAlertDrawdown,
    signalTelegramAlertDrawdownPct,
    signalTelegramAlertSentRef,
    signalTelegramAlertTpSl,
    signalTelegramAlertTrades,
    signalTelegramAllowChart,
    signalTelegramAllowManage,
    signalTelegramAllowStatus,
    signalTelegramBotToken,
    signalTelegramChatId,
    signalTelegramCommandMode,
    signalTelegramCommandPassphrase,
    signalTelegramCommandsEnabled,
    signalTelegramConfirmationsEnabled,
    signalTelegramDigestDailyEnabled,
    signalTelegramDigestHourLocal,
    signalTelegramDigestWeeklyDay,
    signalTelegramDigestWeeklyEnabled,
    signalTelegramEnabled,
    symbolScopeSymbol,
    telegramCommandInFlightRef,
    telegramConfidenceRef,
    telegramConfidenceSeenRef,
    telegramDigestSentRef,
    telegramDrawdownAlertRef,
    telegramMt5AlertInFlightRef,
    telegramMt5PositionSnapshotRef,
    telegramPendingActionsRef,
    telegramPollingActiveRef,
    telegramTlPositionSnapshotRef,
    telegramUpdateIdRef,
    telegramWatcherResumeRef,
    tlAccountMetrics,
    tlBalance,
    tlEquity,
    tlOrders,
    tlOrdersRef,
    tlPositions,
    tlPositionsRef,
    tlSavedConfig,
    tlStatus,
    updateSetupWatcher,
    updateSymbolScope,
    brokerLinkConfigRef,
    setAutoPilotConfigRef,
    setupWatchersRef,
    writeLocalJson
  } = args;

  const telegramAlertsActive = signalTelegramEnabled && !!signalTelegramBotToken && !!signalTelegramChatId;

  const buildTelegramDigest = React.useCallback(async (windowDays: number, label: string) => {
    const sinceMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const history = Array.isArray(signalHistory) ? signalHistory : [];
    const recent = history.filter((entry) => {
      const ts = entry.resolvedAtMs ?? entry.executedAtMs ?? 0;
      return ts >= sinceMs;
    });
    const wins = recent.filter((entry) => entry.outcome === 'WIN').length;
    const losses = recent.filter((entry) => entry.outcome === 'LOSS').length;
    const resolved = wins + losses;
    const winRate = resolved > 0 ? Math.round((wins / resolved) * 100) : null;

    const symbolStats = new Map<string, { total: number; wins: number }>();
    for (const entry of recent) {
      const symbol = String(entry.symbol || '').trim();
      if (!symbol) continue;
      const stat = symbolStats.get(symbol) || { total: 0, wins: 0 };
      stat.total += 1;
      if (entry.outcome === 'WIN') stat.wins += 1;
      symbolStats.set(symbol, stat);
    }
    const topSymbols = Array.from(symbolStats.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3)
      .map(([symbol, stat]) => {
        const rate = stat.total > 0 ? Math.round((stat.wins / stat.total) * 100) : null;
        return `${symbol} ${stat.total}${rate != null ? ` (${rate}% win)` : ''}`;
      });

    const fmtMoney = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? num.toFixed(2) : '--';
    };

    const lines: string[] = [];
    lines.push(`${label} Digest`);
    if (tlStatus === 'connected') {
      lines.push(`TradeLocker: Equity ${fmtMoney(tlEquity)} | Balance ${fmtMoney(tlBalance)} | Pos ${tlPositions.length} | Ord ${tlOrders.length}`);
    } else {
      lines.push(`TradeLocker: ${tlStatus || 'offline'}`);
    }

    const mt5AccountRes = await fetchMt5('/account');
    if (mt5AccountRes.ok && mt5AccountRes.data?.account) {
      const account = mt5AccountRes.data.account;
      lines.push(`MT5: Equity ${fmtMoney(account?.equity)} | Balance ${fmtMoney(account?.balance)}`);
    } else {
      lines.push('MT5: offline');
    }

    lines.push(
      `Signals: ${recent.length} | Wins ${wins} | Losses ${losses}${winRate != null ? ` | Win ${winRate}%` : ''}`
    );
    if (topSymbols.length > 0) lines.push(`Top symbols: ${topSymbols.join(', ')}`);

    const statusSymbol = symbolScopeSymbol || activeBrokerSymbol || signalPrimarySymbol;
    if (statusSymbol) {
      const snapshot = await fetchTelegramNewsSnapshot(statusSymbol);
      if (snapshot?.items?.length) {
        const top = snapshot.items[0];
        const toneLabel = formatTelegramNewsTone(snapshot.tone, snapshot.toneScore);
        const impactLabel = snapshot.impactLevel ? snapshot.impactLevel.toUpperCase() : '';
        const trumpFlag = snapshot.trumpNews ? ' Trump News' : '';
        lines.push(`News: ${top.title}${impactLabel ? ` (${impactLabel}${toneLabel ? `/${toneLabel}` : ''})` : ''}${trumpFlag}`);
      }
    }

    return lines.join('\n');
  }, [
    activeBrokerSymbol,
    fetchMt5,
    fetchTelegramNewsSnapshot,
    formatTelegramNewsTone,
    signalHistory,
    signalPrimarySymbol,
    symbolScopeSymbol,
    tlBalance,
    tlEquity,
    tlOrders,
    tlPositions,
    tlStatus
  ]);

  React.useEffect(() => {
    if (!telegramAlertsActive || !signalTelegramAlertTpSl) return;
    const sentMap = signalTelegramAlertSentRef.current;
    for (const entry of signalEntries) {
      const status = String(entry.status || '').toUpperCase();
      if (status !== 'WIN' && status !== 'LOSS') continue;
      const statusKey = `signal:${status}`;
      const statusSet = sentMap.get(entry.id) || new Set();
      if (statusSet.has(statusKey)) continue;
      statusSet.add(statusKey);
      sentMap.set(entry.id, statusSet);
      const tf = entry.timeframe ? formatTimeframeLabel(entry.timeframe) : '';
      const prob = Number.isFinite(Number(entry.probability)) ? Math.round(Number(entry.probability)) : null;
      const reason = entry.reason ? String(entry.reason).slice(0, 160) : '';
      const lines = [
        `${entry.action} ${entry.symbol} ${tf}`.trim(),
        `Entry ${entry.entryPrice} SL ${entry.stopLoss} TP ${entry.takeProfit}`,
        prob != null ? `Prob ${prob}%` : '',
        reason ? `Reason: ${reason}` : ''
      ].filter(Boolean);
      void sendTelegramAlert(`Signal ${status}`, lines.join('\n'));
    }
  }, [formatTimeframeLabel, sendTelegramAlert, signalEntries, signalTelegramAlertTpSl, telegramAlertsActive, signalTelegramAlertSentRef]);

  React.useEffect(() => {
    if (!telegramAlertsActive || !signalTelegramAlertAgentConfidence) return;
    const seen = telegramConfidenceSeenRef.current;
    const lastByAgent = telegramConfidenceRef.current;
    for (const entry of signalEntries) {
      if (!entry?.id || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const probRaw = Number(entry.probability);
      if (!Number.isFinite(probRaw)) continue;
      const agentKey = entry.agentId || entry.agentName;
      if (!agentKey) continue;
      const prob = Math.round(probRaw);
      const prev = lastByAgent.get(agentKey);
      if (prev != null && prev - prob >= signalTelegramAlertConfidenceDrop) {
        const tf = entry.timeframe ? formatTimeframeLabel(entry.timeframe) : '';
        const label = entry.agentName || entry.agentId || 'Agent';
        const msg = `${label}: ${entry.symbol} ${tf} ${prob}% (was ${prev}%)`.trim();
        void sendTelegramAlert('Agent confidence drop', msg);
      }
      lastByAgent.set(agentKey, prob);
    }
  }, [
    formatTimeframeLabel,
    sendTelegramAlert,
    signalEntries,
    signalTelegramAlertAgentConfidence,
    signalTelegramAlertConfidenceDrop,
    telegramAlertsActive,
    telegramConfidenceRef,
    telegramConfidenceSeenRef
  ]);

  React.useEffect(() => {
    if (tlStatus !== 'connected') return;
    const snapshot = telegramTlPositionSnapshotRef.current;
    const positions = Array.isArray(tlPositions) ? tlPositions : [];
    const nextById: Record<string, any> = {};
    for (const pos of positions) {
      const id = pos?.id != null ? String(pos.id).trim() : '';
      if (!id) continue;
      const side = String(pos?.type || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      const symbol = String(pos?.symbol || '').trim();
      const size = Number(pos?.size);
      const entry = Number(pos?.entryPrice);
      const pnl = Number(pos?.pnl);
      nextById[id] = { id, side, symbol, size, entry, pnl };
    }

    if (!snapshot.initialized) {
      snapshot.byId = nextById;
      snapshot.initialized = true;
      return;
    }

    const shouldSend = telegramAlertsActive && signalTelegramAlertTrades;
    if (shouldSend) {
      for (const id of Object.keys(nextById)) {
        if (snapshot.byId[id]) continue;
        const pos = nextById[id];
        const sizeLabel = Number.isFinite(pos.size) ? pos.size.toFixed(2) : '--';
        const entryLabel = Number.isFinite(pos.entry) ? pos.entry.toFixed(2) : '--';
        const msg = `${pos.side} ${pos.symbol} ${sizeLabel} @ ${entryLabel}`.trim();
        void sendTelegramAlert('TradeLocker Open', msg);
      }
      for (const id of Object.keys(snapshot.byId)) {
        if (nextById[id]) continue;
        const prev = snapshot.byId[id];
        const sizeLabel = Number.isFinite(prev?.size) ? prev.size.toFixed(2) : '--';
        const pnlLabel = Number.isFinite(prev?.pnl) ? prev.pnl.toFixed(2) : '--';
        const msg = `${prev?.side || ''} ${prev?.symbol || ''} ${sizeLabel} pnl ${pnlLabel}`.trim();
        void sendTelegramAlert('TradeLocker Closed', msg);
      }
    }

    snapshot.byId = nextById;
  }, [sendTelegramAlert, signalTelegramAlertTrades, telegramAlertsActive, tlPositions, tlStatus, telegramTlPositionSnapshotRef]);

  React.useEffect(() => {
    if (!telegramAlertsActive || !signalTelegramAlertTrades) return;
    let mounted = true;
    let stop: (() => void) | null = null;
    let cancelled = false;
    telegramMt5PositionSnapshotRef.current = { initialized: false, byId: {} };

    const resolveMt5PositionId = (pos: any) => {
      const raw =
        pos?.ticket ??
        pos?.position ??
        pos?.id ??
        pos?.order ??
        null;
      if (raw == null) return '';
      return String(raw).trim();
    };

    const poll = async () => {
      if (!mounted) return;
      if (telegramMt5AlertInFlightRef.current) return;
      telegramMt5AlertInFlightRef.current = true;
      try {
        const res = await fetchMt5('/positions');
        if (!mounted) return;
        if (!res?.ok || !Array.isArray(res.data?.positions)) return;
        const positions = res.data.positions;
        const nextById: Record<string, any> = {};
        for (const pos of positions) {
          const id = resolveMt5PositionId(pos);
          if (!id) continue;
          const side = Number(pos?.type) === 0 ? 'BUY' : 'SELL';
          const symbol = String(pos?.symbol || '').trim();
          const size = Number(pos?.volume ?? pos?.volume_current ?? pos?.volume_initial);
          const entry = Number(pos?.price_open ?? pos?.price);
          const pnl = Number(pos?.profit);
          nextById[id] = { id, side, symbol, size, entry, pnl };
        }

        const snapshot = telegramMt5PositionSnapshotRef.current;
        if (!snapshot.initialized) {
          snapshot.byId = nextById;
          snapshot.initialized = true;
          return;
        }

        for (const id of Object.keys(nextById)) {
          if (snapshot.byId[id]) continue;
          const pos = nextById[id];
          const sizeLabel = Number.isFinite(pos.size) ? pos.size.toFixed(2) : '--';
          const entryLabel = Number.isFinite(pos.entry) ? pos.entry.toFixed(2) : '--';
          const msg = `${pos.side} ${pos.symbol} ${sizeLabel} @ ${entryLabel}`.trim();
          void sendTelegramAlert('MT5 Open', msg);
        }
        for (const id of Object.keys(snapshot.byId)) {
          if (nextById[id]) continue;
          const prev = snapshot.byId[id];
          const sizeLabel = Number.isFinite(prev?.size) ? prev.size.toFixed(2) : '--';
          const pnlLabel = Number.isFinite(prev?.pnl) ? prev.pnl.toFixed(2) : '--';
          const msg = `${prev?.side || ''} ${prev?.symbol || ''} ${sizeLabel} pnl ${pnlLabel}`.trim();
          void sendTelegramAlert('MT5 Closed', msg);
        }

        snapshot.byId = nextById;
      } finally {
        telegramMt5AlertInFlightRef.current = false;
      }
    };

    void poll();
    void loadFeatureControllers().then((mod) => {
      if (cancelled) return;
      stop = mod.startIntervalControllerSafe({
        intervalMs: 15_000,
        onTick: () => poll()
      });
    }).catch(() => {});
    return () => {
      mounted = false;
      cancelled = true;
      stop?.();
    };
  }, [fetchMt5, loadFeatureControllers, sendTelegramAlert, signalTelegramAlertTrades, telegramAlertsActive, telegramMt5AlertInFlightRef, telegramMt5PositionSnapshotRef]);

  React.useEffect(() => {
    if (!telegramAlertsActive || !signalTelegramAlertDrawdown) return;
    if (tlStatus !== 'connected') return;
    const env = tlSavedConfig?.env || null;
    const server = tlSavedConfig?.server || null;
    const accountId = tlSavedConfig?.accountId ?? null;
    const accNum = tlSavedConfig?.accNum ?? null;
    if (!env || !server || accountId == null || accNum == null) return;
    const equityNow =
      tlAccountMetrics && Number.isFinite(Number(tlAccountMetrics.equity)) ? Number(tlAccountMetrics.equity) : tlEquity;
    if (!Number.isFinite(equityNow) || equityNow <= 0) return;

    const accountKey = `${String(env)}:${String(server)}:${String(accountId)}:${String(accNum)}`;
    const dateKey = getLocalDateKey();
    const tracker = telegramDrawdownAlertRef.current;
    if (tracker.dateKey !== dateKey) {
      tracker.dateKey = dateKey;
      tracker.sent = false;
    }
    if (tracker.sent) return;
    const storageKey = getDailyBaselineStorageKey(accountKey, dateKey);
    const baseline = readLocalJson(storageKey);
    const equityStart = baseline && Number.isFinite(Number(baseline.equityStart)) ? Number(baseline.equityStart) : null;
    if (equityStart == null) {
      writeLocalJson(storageKey, { equityStart: equityNow, createdAtMs: Date.now() });
      return;
    }

    const lossAmount = Math.max(0, equityStart - equityNow);
    if (lossAmount <= 0) return;
    const maxDailyLossRaw = Number(autoPilotConfigRef.current?.maxDailyLoss);
    const hasLimit = Number.isFinite(maxDailyLossRaw) && maxDailyLossRaw > 0;
    const drawdownPct = hasLimit
      ? (lossAmount / maxDailyLossRaw) * 100
      : (lossAmount / equityStart) * 100;
    if (!Number.isFinite(drawdownPct) || drawdownPct < signalTelegramAlertDrawdownPct) return;

    const fmtMoney = (value: number) => value.toFixed(2);
    const limitLabel = hasLimit ? ` of ${fmtMoney(maxDailyLossRaw)}` : '';
    const msg = `Daily drawdown ${fmtMoney(lossAmount)} (${drawdownPct.toFixed(1)}%${limitLabel}).`;
    tracker.sent = true;
    void sendTelegramAlert('Drawdown Alert', msg);
  }, [
    autoPilotConfigRef,
    getDailyBaselineStorageKey,
    getLocalDateKey,
    readLocalJson,
    sendTelegramAlert,
    signalTelegramAlertDrawdown,
    signalTelegramAlertDrawdownPct,
    telegramAlertsActive,
    telegramDrawdownAlertRef,
    tlAccountMetrics,
    tlEquity,
    tlSavedConfig?.accNum,
    tlSavedConfig?.accountId,
    tlSavedConfig?.env,
    tlSavedConfig?.server,
    tlStatus,
    writeLocalJson
  ]);

  React.useEffect(() => {
    if (!signalTelegramEnabled || !signalTelegramBotToken || !signalTelegramChatId) return;
    if (!signalTelegramDigestDailyEnabled && !signalTelegramDigestWeeklyEnabled) return;
    let mounted = true;
    let stop: (() => void) | null = null;
    let cancelled = false;

    const check = async () => {
      if (!mounted) return;
      const now = new Date();
      const hour = now.getHours();
      const dateKey = getLocalDateKey();
      if (signalTelegramDigestDailyEnabled && hour >= signalTelegramDigestHourLocal) {
        const dailyKey = `${dateKey}:${signalTelegramDigestHourLocal}`;
        if (telegramDigestSentRef.current.dailyKey !== dailyKey) {
          const digest = await buildTelegramDigest(1, 'Daily');
          await sendTelegramText(digest);
          telegramDigestSentRef.current.dailyKey = dailyKey;
        }
      }
      if (
        signalTelegramDigestWeeklyEnabled &&
        now.getDay() === signalTelegramDigestWeeklyDay &&
        hour >= signalTelegramDigestHourLocal
      ) {
        const weeklyKey = `${dateKey}:${signalTelegramDigestWeeklyDay}`;
        if (telegramDigestSentRef.current.weeklyKey !== weeklyKey) {
          const digest = await buildTelegramDigest(7, 'Weekly');
          await sendTelegramText(digest);
          telegramDigestSentRef.current.weeklyKey = weeklyKey;
        }
      }
    };

    void check();
    void loadFeatureControllers().then((mod) => {
      if (cancelled) return;
      stop = mod.startIntervalControllerSafe({
        intervalMs: 60_000,
        onTick: () => check()
      });
    }).catch(() => {});
    return () => {
      mounted = false;
      cancelled = true;
      stop?.();
    };
  }, [
    buildTelegramDigest,
    getLocalDateKey,
    loadFeatureControllers,
    sendTelegramText,
    signalTelegramChatId,
    signalTelegramDigestDailyEnabled,
    signalTelegramDigestHourLocal,
    signalTelegramDigestWeeklyDay,
    signalTelegramDigestWeeklyEnabled,
    signalTelegramEnabled,
    signalTelegramBotToken,
    telegramDigestSentRef
  ]);

  const processTelegramUpdate = React.useCallback(async (update: any) => {
    const allowed = new Set(parseTelegramChatIds(signalTelegramChatId));
    const callbackRuntime = await loadTelegramCallbackRuntimeModule();
    const callbackRes = await callbackRuntime.runTelegramCallbackRuntime({
      update,
      allowedChatIds: allowed,
      signalTelegramAllowManage,
      signalTelegramCommandMode,
      signalTelegramConfirmationsEnabled,
      telegramPendingActionsRef,
      resolveTelegramPendingAction,
      executeTelegramPendingAction,
      sendTelegramText,
      resolveTelegramSignalEntry,
      queueTelegramConfirmation,
      runTelegramSignalAction
    });
    if (callbackRes.handled) return;
    const messageRuntime = await loadTelegramMessageRuntimeModule();
    await messageRuntime.runTelegramMessageRuntime({
      update,
      allowedChatIds: allowed,
      signalTelegramCommandPassphrase,
      signalTelegramAllowManage,
      signalTelegramCommandMode,
      signalTelegramAllowStatus,
      signalTelegramAllowChart,
      signalTelegramConfirmationsEnabled,
      signalIntentTelegramOpsEnabled: signalIntentFeatureFlags.signalIntentV1TelegramOps,
      signalStatusSet,
      signalEntriesRef,
      signalIntentsRef,
      signalIntentRunsRef,
      tlStatus,
      tlPositionsRef,
      tlOrdersRef,
      tlEquity,
      tlBalance,
      symbolScopeSymbol,
      activeBrokerSymbol,
      signalPrimarySymbol,
      brokerLinkConfigRef,
      setAutoPilotConfigRef,
      autoPilotConfigRef,
      setupWatchersRef,
      telegramWatcherResumeRef,
      sendTelegramText,
      resolveTelegramSignalEntry,
      resolveTelegramSignalIntent: resolveSignalIntentByToken,
      pauseSignalIntent,
      resumeSignalIntent,
      formatTelegramSignalLine,
      formatTimeframeLabel,
      buildTelegramSignalInlineActions,
      buildTelegramDigest,
      queueTelegramConfirmation,
      runTelegramSignalAction,
      runTelegramManageAction,
      updateSetupWatcher,
      updateSymbolScope,
      parseTelegramSymbol,
      parseTelegramTimeframe,
      parseTelegramBroker,
      parseTelegramAccountHint,
      parseTelegramQtySpec,
      fetchMt5,
      fetchTelegramNewsSnapshot,
      formatTelegramNewsTone,
      captureChartChatSnapshot,
      sendPlainTextToOpenAI,
      sendTelegramPhoto,
      resolveTradeLockerSymbolBestEffort
    });
  }, [
    activeBrokerSymbol,
    autoPilotConfigRef,
    brokerLinkConfigRef,
    buildTelegramDigest,
    buildTelegramSignalInlineActions,
    captureChartChatSnapshot,
    executeTelegramPendingAction,
    fetchMt5,
    fetchTelegramNewsSnapshot,
    formatTelegramNewsTone,
    formatTelegramSignalLine,
    formatTimeframeLabel,
    loadTelegramCallbackRuntimeModule,
    loadTelegramMessageRuntimeModule,
    parseTelegramAccountHint,
    parseTelegramBroker,
    parseTelegramChatIds,
    parseTelegramQtySpec,
    parseTelegramSymbol,
    parseTelegramTimeframe,
    pauseSignalIntent,
    queueTelegramConfirmation,
    resolveSignalIntentByToken,
    resolveTelegramPendingAction,
    resolveTelegramSignalEntry,
    resolveTradeLockerSymbolBestEffort,
    resumeSignalIntent,
    runTelegramManageAction,
    runTelegramSignalAction,
    sendPlainTextToOpenAI,
    sendTelegramPhoto,
    sendTelegramText,
    setAutoPilotConfigRef,
    setupWatchersRef,
    signalEntriesRef,
    signalIntentFeatureFlags.signalIntentV1TelegramOps,
    signalIntentRunsRef,
    signalIntentsRef,
    signalPrimarySymbol,
    signalStatusSet,
    signalTelegramAllowChart,
    signalTelegramAllowManage,
    signalTelegramAllowStatus,
    signalTelegramChatId,
    signalTelegramCommandMode,
    signalTelegramCommandPassphrase,
    signalTelegramConfirmationsEnabled,
    symbolScopeSymbol,
    telegramPendingActionsRef,
    telegramWatcherResumeRef,
    tlBalance,
    tlEquity,
    tlOrdersRef,
    tlPositionsRef,
    tlStatus,
    updateSetupWatcher,
    updateSymbolScope
  ]);

  const handleTelegramUpdate = React.useCallback(async (update: any) => {
    const mod = await loadTelegramCommandRuntimeModule();
    await mod.runTelegramUpdateOrchestratorRuntime({
      update,
      signalTelegramCommandsEnabled,
      signalTelegramBotToken,
      signalTelegramChatId,
      telegramUpdateIdRef,
      telegramCommandInFlightRef,
      processUpdate: processTelegramUpdate
    });
  }, [
    loadTelegramCommandRuntimeModule,
    processTelegramUpdate,
    signalTelegramBotToken,
    signalTelegramChatId,
    signalTelegramCommandsEnabled,
    telegramCommandInFlightRef,
    telegramUpdateIdRef
  ]);

  React.useEffect(() => {
    const api = window.glass?.telegram;
    if (!api?.startPolling || !api?.stopPolling) return;
    const ready = signalTelegramCommandsEnabled && signalTelegramBotToken && signalTelegramChatId;
    if (ready) {
      telegramPollingActiveRef.current = true;
      void api.startPolling({
        botToken: signalTelegramBotToken,
        chatId: parseTelegramChatIds(signalTelegramChatId),
        drain: true
      });
      return;
    }
    if (telegramPollingActiveRef.current) {
      telegramPollingActiveRef.current = false;
      void api.stopPolling();
    }
  }, [parseTelegramChatIds, signalTelegramBotToken, signalTelegramChatId, signalTelegramCommandsEnabled, telegramPollingActiveRef]);

  React.useEffect(() => {
    const api = window.glass?.telegram;
    if (!api?.onUpdate) return;
    const unsub = api.onUpdate((payload: any) => {
      void handleTelegramUpdate(payload);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [handleTelegramUpdate]);
};
