import React from 'react';
import type { CommandAction } from '../../components/CommandPalette';

type UseCommandAndChartActionsArgs = {
  buildCommandActionsModel: (args: any) => CommandAction[];
  recommendedActionFlowsState: any;
  runRecommendedActionFlow: (flow: any) => Promise<any>;
  symbolScopeSymbol: string;
  activeBrokerSymbol: string;
  activeTvSymbol?: string;
  symbolScopeTimeframesLabel: string;
  activeTvTimeframeLabel: string;
  openSymbolPanel: (symbol?: string, timeframe?: string, opts?: any) => void;
  openSidebarMode: (mode: any) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  openSettings: () => void;
  toggleFullscreen: () => void;
  captureContextPack: () => any;
  setNativeChartSymbol: (value: string) => void;
  pendingChartFocusRef: React.MutableRefObject<{ symbol: string; timeframe?: string } | null>;
  nativeChartRef: React.MutableRefObject<any>;
  switchMode: (mode: any) => void;
  openSidebar: () => void;
  sendChartChatMessageWithSnapshot: (input: string, context: any, images?: any[], options?: any) => Promise<any>;
  chartChatContext: any;
  setReviewAnnotations: (value: any[]) => void;
  nativeChartMounted: boolean;
  mode: string;
  ensureTradeLockerConnectedRef: React.MutableRefObject<null | ((source: string) => Promise<any>)>;
  flushPendingBacktestApply: () => void;
};

type UseCommandAndChartActionsResult = {
  commandActions: CommandAction[];
  focusNativeChart: (symbol?: string, timeframe?: string) => void;
  handleExplainSetupSignal: (signalId: string, profileId?: string | null) => void;
  handleReplayTrade: (payload: {
    symbol: string;
    timeframe?: string | null;
    entryPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    closePrice?: number | null;
    action?: string | null;
    ledgerId?: string | null;
    noteId?: string | null;
  }) => void;
};

export const useCommandAndChartActions = (args: UseCommandAndChartActionsArgs): UseCommandAndChartActionsResult => {
  const {
    buildCommandActionsModel,
    recommendedActionFlowsState,
    runRecommendedActionFlow,
    symbolScopeSymbol,
    activeBrokerSymbol,
    activeTvSymbol,
    symbolScopeTimeframesLabel,
    activeTvTimeframeLabel,
    openSymbolPanel,
    openSidebarMode,
    isOpen,
    toggleSidebar,
    openSettings,
    toggleFullscreen,
    captureContextPack,
    setNativeChartSymbol,
    pendingChartFocusRef,
    nativeChartRef,
    switchMode,
    openSidebar,
    sendChartChatMessageWithSnapshot,
    chartChatContext,
    setReviewAnnotations,
    nativeChartMounted,
    mode,
    ensureTradeLockerConnectedRef,
    flushPendingBacktestApply
  } = args;

  const commandActions = React.useMemo<CommandAction[]>(() => {
    return buildCommandActionsModel({
      recommendedActionFlowsState,
      runRecommendedActionFlow,
      symbolScopeSymbol,
      activeBrokerSymbol,
      activeTvSymbol,
      symbolScopeTimeframesLabel,
      activeTvTimeframeLabel,
      openSymbolPanel,
      openSidebarMode,
      isOpen,
      toggleSidebar,
      openSettings,
      toggleFullscreen,
      captureContextPack
    });
  }, [
    activeBrokerSymbol,
    activeTvSymbol,
    activeTvTimeframeLabel,
    buildCommandActionsModel,
    captureContextPack,
    isOpen,
    openSettings,
    openSidebarMode,
    openSymbolPanel,
    recommendedActionFlowsState,
    runRecommendedActionFlow,
    symbolScopeSymbol,
    symbolScopeTimeframesLabel,
    toggleFullscreen,
    toggleSidebar
  ]);

  const focusNativeChart = React.useCallback(
    (symbol?: string, timeframe?: string) => {
      const nextSymbol = String(symbol || '').trim();
      if (nextSymbol) {
        setNativeChartSymbol(nextSymbol);
        pendingChartFocusRef.current = { symbol: nextSymbol, timeframe };
      }

      const chart = nativeChartRef.current;
      if (chart?.focusSymbol && nextSymbol) {
        chart.focusSymbol(nextSymbol, timeframe, { revealSetups: true });
        pendingChartFocusRef.current = null;
      } else if (chart?.ensureFrameActive && timeframe) {
        chart.ensureFrameActive(timeframe);
      }
      if (chart?.setShowSetups) {
        chart.setShowSetups(true);
      }

      switchMode('nativechart');
    },
    [pendingChartFocusRef, setNativeChartSymbol, nativeChartRef, switchMode]
  );

  const handleExplainSetupSignal = React.useCallback(
    (signalId: string, profileId?: string | null) => {
      const id = String(signalId || '').trim();
      if (!id) return;
      const profile = profileId ? String(profileId).trim() : '';
      const prompt = profile
        ? `Explain setup signal ${id} for profile ${profile}.`
        : `Explain setup signal ${id}.`;
      openSidebar();
      switchMode('chartchat');
      sendChartChatMessageWithSnapshot(prompt, chartChatContext, [], null);
    },
    [chartChatContext, openSidebar, sendChartChatMessageWithSnapshot, switchMode]
  );

  const handleReplayTrade = React.useCallback(
    (payload: {
      symbol: string;
      timeframe?: string | null;
      entryPrice?: number | null;
      stopLoss?: number | null;
      takeProfit?: number | null;
      closePrice?: number | null;
      action?: string | null;
      ledgerId?: string | null;
      noteId?: string | null;
    }) => {
      const symbol = String(payload?.symbol || '').trim();
      if (!symbol) return;
      const timeframe = payload?.timeframe ? String(payload.timeframe).trim() : null;
      const entry = Number(payload?.entryPrice);
      const stop = Number(payload?.stopLoss);
      const tp = Number(payload?.takeProfit);
      const close = Number(payload?.closePrice);
      const action = String(payload?.action || '').toUpperCase();
      const levels = [];
      if (Number.isFinite(entry)) {
        levels.push({
          price: entry,
          label: `${action === 'SELL' ? 'SELL' : action === 'BUY' ? 'BUY' : 'Trade'} Entry`,
          color: '#38bdf8',
          priority: 26
        });
      }
      if (Number.isFinite(stop)) {
        levels.push({
          price: stop,
          label: 'Stop',
          color: '#f97316',
          style: 'dashed',
          priority: 25
        });
      }
      if (Number.isFinite(tp)) {
        levels.push({
          price: tp,
          label: 'TP',
          color: '#22c55e',
          style: 'dashed',
          priority: 25
        });
      }
      if (Number.isFinite(close)) {
        levels.push({
          price: close,
          label: 'Close',
          color: '#facc15',
          priority: 24
        });
      }
      const annotation = {
        id: payload?.ledgerId ? `review_${payload.ledgerId}` : `review_${Date.now()}`,
        symbol,
        timeframe,
        createdAtMs: Date.now(),
        levels,
        note: payload?.noteId || null
      };
      setReviewAnnotations(levels.length > 0 ? [annotation] : []);
      nativeChartRef.current?.setShowReviews?.(true);
      focusNativeChart(symbol, timeframe || undefined);
    },
    [focusNativeChart, nativeChartRef, setReviewAnnotations]
  );

  React.useEffect(() => {
    if (!nativeChartMounted) return;
    const pending = pendingChartFocusRef.current;
    if (!pending) return;
    const chart = nativeChartRef.current;
    if (!chart?.focusSymbol) return;
    chart.focusSymbol(pending.symbol, pending.timeframe, { revealSetups: true });
    chart.setShowSetups?.(true);
    pendingChartFocusRef.current = null;
  }, [nativeChartMounted, pendingChartFocusRef, nativeChartRef]);

  React.useEffect(() => {
    if (!nativeChartMounted && mode !== 'nativechart') return;
    const ensureConnect = ensureTradeLockerConnectedRef.current;
    if (!ensureConnect) return;
    void ensureConnect('native_chart_panel');
  }, [ensureTradeLockerConnectedRef, mode, nativeChartMounted]);

  React.useEffect(() => {
    if (mode !== 'backtester') return;
    flushPendingBacktestApply();
  }, [flushPendingBacktestApply, mode]);

  return {
    commandActions,
    focusNativeChart,
    handleExplainSetupSignal,
    handleReplayTrade
  };
};
