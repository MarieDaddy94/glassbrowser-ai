import React from 'react';
import type { AppSidebarPanelsModel } from './models';

export interface AppSidebarPanelsProps {
  model: AppSidebarPanelsModel;
}

const AppSidebarPanels: React.FC<AppSidebarPanelsProps> = ({ model }) => {
  const mergedCtx = model.ctx;

  const {
    AcademyInterface,
    AgentCreatorInterface,
    AgentLabInterface,
    AgentMemoryInterface,
    AuditTrailInterface,
    AutoPilotInterface,
    BacktesterInterface,
    CalendarInterface,
    ChangesInterface,
    ChatInterface,
    LeaderboardInterface,
    MT5Interface,
    MonitorInterface,
    NativeChartInterface,
    NotesInterface,
    PATTERN_WATCH_LIMIT,
    PatternsInterface,
    PerformanceDashboard,
    SIDEBAR_LAZY_FALLBACK,
    SetupsInterface,
    ShadowInterface,
    SignalInterface,
    SnapshotInterface,
    TradeLockerInterface,
    academyAutoApplyEnabled,
    academyAutoExportEnabled,
    academyCases,
    academyFocusRequest,
    academyLessonLimit,
    academyLessons,
    academyMounted,
    academySelectedCaseId,
    academySymbolLearnings,
    actionTaskActiveStepRef,
    actionTaskQueueDepth,
    actionTaskTreeRunsState,
    activeBrokerSymbol,
    activeSignalThreadId,
    activeTab,
    activeTabId,
    activeTvParams,
    activeTvPrice,
    activeTvPriceUpdatedAtMs,
    activeTvTimeframeLabel,
    addChartChatAgent,
    addManualMemory,
    addSetupWatcher,
    agentCreatorMounted,
    agentLabMounted,
    agentMemoryMounted,
    agentScanEnabledById,
    agentScorecards,
    agents,
    applyOrQueueBacktestOptimization,
    askAgentAboutSignalFromChat,
    auditMounted,
    autoPilotConfig,
    backtestSymbol,
    backtesterMounted,
    backtesterRef,
    brokerLinkConfig,
    brokerRateLimitSuppressUntilMs,
    buildTradeLockerAccountKey,
    calendarRules,
    cancelChartChatAgentTool,
    cancelSignalOrder,
    cancelSignalOrderFromChat,
    captureChartContextPack,
    captureChatTabContextImages,
    captureTabCached,
    changesMounted,
    chartChatActiveAgentId,
    chartChatAgents,
    chartChatAutoTabVisionEnabled,
    chartChatContext,
    chartChatIsLive,
    chartChatLeadAgentId,
    chartChatLiveMode,
    chartChatLiveStream,
    chartChatMessages,
    chartChatReplyMode,
    chartChatSessionBias,
    chartChatSnapshotStatus,
    chartChatSnoozeWatch,
    chartChatSnoozedUntilMs,
    chartChatSpeakingMessageId,
    chartChatThinking,
    chartChatWatchEnabled,
    chartChatWatchMode,
    chartSessions,
    chatContextInspectorState,
    chatContextInspectorV1,
    chatSignalWorkspaceActionsV1,
    chatSignalWorkspaceV1,
    clearChartChatSnooze,
    clearChartChatWithSnapshot,
    clearLiveErrors,
    clearRuntimeOpsEvents,
    clearSetupSignals,
    clearSignalEntries,
    clearSnapshotFrameCache,
    clearSymbolScope,
    clearTradeMemories,
    createWatchProfileFromOptimization,
    crossPanelContext,
    deleteChartChatAgent,
    deleteTradeMemory,
    effectiveSignalSnapshotStatus,
    emergencyStopRuntimeOps,
    equity,
    executeAgentToolRequest,
    executeChartChatBrokerAction,
    executeChartChatTradeProposal,
    executeSignalFromChat,
    executeSignalTrade,
    executeTicketOrderViaApi,
    flushPendingBacktestApply,
    focusNativeChart,
    getChartContextPack,
    getTradeLockerAccountKey,
    handleAcademyCaseSelect,
    handleAcademyFocusRequestConsumed,
    handleExplainSetupSignal,
    handleNativeBarClose,
    handleNormalizationChange,
    handlePatternAddSymbol,
    handlePatternDetectorsChange,
    handlePatternRemoveSymbol,
    handlePatternTimeframesChange,
    handleReplayTaskTree,
    handleReplayTrade,
    handleSignalAddSymbol,
    handleSignalFocus,
    handleSignalRemoveSymbol,
    handleSignalTimeframesChange,
    handleSnapshotPanelSelectSymbol,
    handleSnapshotSourceChange,
    handleTradeLockerCancelOrder,
    handleTradeLockerClosePosition,
    healthSnapshot,
    isUnifiedChatMode,
    journalEntry,
    lastTradeBlock,
    leaderboardFilter,
    leaderboardHistory,
    learningGraphFeatureFlags,
    liveErrors,
    loadCalendarPnlSnapshot,
    lossStreakState,
    memories,
    mode,
    nativeChartMounted,
    nativeChartRef,
    nativeChartSymbol,
    openAcademyCase,
    openAcademyCaseFromChat,
    openChartFromSignalChat,
    openSidebarMode,
    openSignalFromChat,
    openSignalThreadInChat,
    openSymbolPanel,
    outcomeFeedConsistency,
    outcomeFeedCursor,
    panelFreshness,
    parseTradeLockerAccountNumber,
    patternAutoRefreshEnabled,
    patternDetectorsResolved,
    patternEvents,
    patternRefreshIntervalMs,
    patternRefreshMode,
    patternSymbolMode,
    patternSymbols,
    patternWatchSummary,
    patternWatchSymbols,
    patternWatchTimeframes,
    pauseSignalIntent,
    persistAcademyExport,
    playbookStatusByWatcher,
    postTradeReviewAgentId,
    postTradeReviewEnabled,
    prefillSignalTicket,
    recommendedActionFlowsState,
    recordAcademyLearningGraphBuilt,
    recordAcademyLearningGraphCaseAction,
    recordAcademyLearningGraphLensChanged,
    recordAcademyLearningGraphPathZoom,
    recordAcademyLearningPathGenerated,
    refreshAcademyCases,
    refreshAcademyLessons,
    refreshAcademySymbolLearnings,
    refreshCalendarRules,
    refreshShadowTrades,
    refreshSignalStatusesNow,
    refreshSnapshotPanelStatus,
    rejectChartChatBrokerAction,
    rejectChartChatTradeProposal,
    rejectSignalEntry,
    rejectSignalFromChat,
    removeSetupWatcher,
    requestBrokerWithAudit,
    requestChartRefresh,
    requestSystemSnapshot,
    resolveSignalThreadKey,
    resolveTradeLockerSymbolBestEffort,
    resumePlaybookRun,
    resumeSignalIntent,
    resumeTaskTreeRun,
    reviewAnnotations,
    reviewLastClosedTrade,
    runAcademyLessonLifecycleAction,
    runAcademyLessonSimulation,
    runActionCatalog,
    runActionCatalogImmediate,
    runRecommendedActionFlow,
    runRuntimeOpsAction,
    runSignalScan,
    runSignalScanForce,
    runtimeOpsControllerState,
    runtimeOpsEvents,
    runtimeOpsFeatureFlags,
    saveOptimizerWinnerPreset,
    saveSetupLibraryFromOptimization,
    searchSymbolSuggestions,
    selectSignalThreadFromChat,
    sendBacktestMessage,
    sendBacktestSetupToWatchlist,
    sendChartChatMessageWithSnapshot,
    sendChartChatVideoFrame,
    sessionBias,
    setAgentSignalScanEnabled,
    setAutoPilotConfig,
    setBacktestSymbol,
    setBrokerLinkConfig,
    setChartChatAutoTabVisionEnabled,
    setChartChatLeadAgentId,
    setChartChatReplyMode,
    setChartChatSessionBias,
    setChartChatWatchEnabled,
    setChartChatWatchMode,
    setIsChartFullscreen,
    setIsSettingsOpen,
    setJournalEntry,
    setLeaderboardFilter,
    setNativeChartSymbol,
    setPostTradeReviewAgentId,
    setPostTradeReviewEnabled,
    setRuntimeOpsEnabled,
    setRuntimeOpsMode,
    setShadowPanelTabSafe,
    setSignalIntentComposerOpen,
    setSnapshotPanelApplyToSignals,
    setTlExecutionTargets,
    setTlSnapshotAutoSwitch,
    setTlSnapshotFallbackOrder,
    setupLibraryEntries,
    setupPerformanceByLibrary,
    setupPerformanceByMode,
    setupPerformanceBySymbol,
    setupPerformanceByWatcher,
    setupPerformanceError,
    setupPerformanceSummary,
    setupPerformanceUpdatedAtMs,
    setupRegimeBlocks,
    setupRegimes,
    setupSignals,
    setupWatchers,
    setupsMounted,
    shadowAccounts,
    shadowPanelTab,
    shadowProfiles,
    shadowTradeCompare,
    shadowTradeStats,
    shadowTradeViews,
    signalAutoExecuteEnabled,
    signalAutoRefreshEnabled,
    signalContextById,
    signalEntries,
    signalExecutionTarget,
    signalExpiryMinutes,
    signalIncludePatterns,
    signalIntentFeatureFlags,
    signalIntents,
    signalLastAttemptAtMs,
    signalLastError,
    signalLastParseAtMs,
    signalLastParseError,
    signalLastRunAtMs,
    signalMemoryLimit,
    signalMemoryMode,
    signalPrimarySymbol,
    signalProbabilityMax,
    signalProbabilityThreshold,
    signalRefreshIntervalMs,
    signalRunning,
    signalSessions,
    signalShadowFollowEnabled,
    signalSimulatedOutcomes,
    signalSnapshotScopeMismatch,
    signalStatusReportRunning,
    signalStatusReportsBySignalId,
    signalStrategyModes,
    signalSymbols,
    signalThreads,
    signalTimeframes,
    snapshotPanelApplyToSignals,
    snapshotPanelCandidates,
    snapshotPanelStatus,
    snapshotPanelSymbol,
    snapshotPanelTimeframes,
    speakChartChatMessage,
    startChartChatLive,
    stopChartChatLive,
    switchChartChatAgent,
    symbolScope,
    symbolScopeSymbol,
    syncEconomicCalendar,
    tabs,
    taskPlaybookActiveRunRef,
    taskPlaybookRunsRef,
    taskPlaybooks,
    taskTreeResumeEntries,
    taskTreeRunsState,
    tlAccountMetrics,
    tlAccountMetricsError,
    tlAccounts,
    tlAccountsError,
    tlBalance,
    tlConnectionMeta,
    tlEquity,
    tlExecutionTargets,
    tlMarketSubscriptions,
    tlNormalizeEnabled,
    tlNormalizeRefKey,
    tlOrders,
    tlOrdersError,
    tlPositions,
    tlQuotesBySymbol,
    tlQuotesError,
    tlQuotesUpdatedAtMs,
    tlRefreshAccountMetrics,
    tlRefreshAccounts,
    tlRefreshOrders,
    tlRefreshQuotes,
    tlRefreshSnapshot,
    tlSavedConfig,
    tlSearchInstruments,
    tlServerLabel,
    tlShardStates,
    tlSnapshotAutoSwitch,
    tlSnapshotFallbackOrder,
    tlSnapshotSourceKey,
    tlSnapshotUpdatedAtMs,
    tlStatus,
    tlStatusMeta,
    tlStrategyAssignments,
    tlStrategyMatrixRows,
    tlStreamError,
    tlStreamStatus,
    tlStreamUpdatedAtMs,
    tlUpstreamBlockedUntilMs,
    toggleCalendarRule,
    updateAcademySettings,
    updateChartChatAgent,
    updatePatternSettings,
    updateSetupWatcher,
    updateShadowProfile,
    updateSignalSettings,
    updateSymbolScope,
    updateTab,
    updateTradeMemory,
    upsertCalendarRule,
    warmupSnapshotPanel,
  } = mergedCtx as any;

  return (
    <>
      <React.Suspense fallback={SIDEBAR_LAZY_FALLBACK}>
                {/* Conditionally render the selected feature */}
                {mode === 'signal' && (
                    <SignalInterface
                      symbols={signalSymbols}
                      onAddSymbol={handleSignalAddSymbol}
                      onRemoveSymbol={handleSignalRemoveSymbol}
                      onSearchSymbols={searchSymbolSuggestions}
                      timeframes={signalTimeframes}
                      onTimeframesChange={handleSignalTimeframesChange}
                      sessions={signalSessions}
                      onSessionsChange={(next) => updateSignalSettings({ sessions: next })}
                      strategyModes={signalStrategyModes}
                      onStrategyModesChange={(next) => updateSignalSettings({ strategyModes: next })}
                      autoRefreshEnabled={signalAutoRefreshEnabled}
                      onAutoRefreshChange={(next) => updateSignalSettings({ autoRefreshEnabled: next })}
                      refreshIntervalMs={signalRefreshIntervalMs}
                      onRefreshIntervalChange={(next) => updateSignalSettings({ refreshIntervalMs: next })}
                      probabilityThreshold={signalProbabilityThreshold}
                      onProbabilityThresholdChange={(next) => updateSignalSettings({ probabilityThreshold: next })}
                      probabilityMax={signalProbabilityMax}
                      onProbabilityMaxChange={(next) => updateSignalSettings({ probabilityMax: next })}
                      expiryMinutes={signalExpiryMinutes}
                      onExpiryMinutesChange={(next) => updateSignalSettings({ expiryMinutes: next })}
                      autoExecuteEnabled={signalAutoExecuteEnabled}
                      onAutoExecuteChange={(next) => updateSignalSettings({ autoExecuteEnabled: next })}
                      executionTarget={signalExecutionTarget}
                      onExecutionTargetChange={(next) => updateSignalSettings({ executionTarget: next })}
                      memoryMode={signalMemoryMode}
                      onMemoryModeChange={(next) => updateSignalSettings({ memoryMode: next })}
                      memoryLimit={signalMemoryLimit}
                      onMemoryLimitChange={(next) => updateSignalSettings({ memoryLimit: next })}
                      patternContextEnabled={signalIncludePatterns}
                      onPatternContextChange={(next) => updateSignalSettings({ includePatterns: next })}
                      autoPilotEnabled={!!autoPilotConfig?.enabled}
                      autoPilotKill={!!autoPilotConfig?.killSwitch}
                      autoPilotMode={autoPilotConfig?.mode || null}
                      isRunning={signalRunning}
                      lastRunAtMs={signalLastRunAtMs}
                      lastAttemptAtMs={signalLastAttemptAtMs}
                      lastError={signalLastError}
                      lastParseError={signalLastParseError}
                      lastParseAtMs={signalLastParseAtMs}
                      snapshotStatus={effectiveSignalSnapshotStatus}
                      snapshotScopeMismatch={signalSnapshotScopeMismatch}
                      healthSnapshot={healthSnapshot}
                      signals={signalEntries}
                      simulatedOutcomes={signalSimulatedOutcomes}
                      onRunScan={() => runSignalScan('manual')}
                      onRunScanForceBypass={runSignalScanForce}
                      onRunSignalStatusReport={refreshSignalStatusesNow}
                      signalStatusReportRunning={signalStatusReportRunning}
                      signalStatusReportsBySignalId={signalStatusReportsBySignalId}
                      onRefreshSignalStatuses={refreshSignalStatusesNow}
                      statusRefreshRunning={signalStatusReportRunning}
                      onExecuteSignal={(id) => executeSignalTrade(id, 'manual')}
                      onRejectSignal={(id) => rejectSignalEntry(id)}
                      onCancelSignalOrder={(id) => cancelSignalOrder(id)}
                      onOpenAcademyCase={(id) => openAcademyCase(id)}
                      onFocusSignal={handleSignalFocus}
                      onDiscussInChat={(signal) => openSignalThreadInChat(signal, { originPanel: 'signal' })}
                      onOpenChart={(symbol, timeframe) => openSymbolPanel('nativechart', symbol, timeframe)}
                      onOpenMt5={(symbol, timeframe) => openSymbolPanel('mt5', symbol, timeframe)}
                      onOpenTradeLocker={(symbol, timeframe) => openSymbolPanel('tradelocker', symbol, timeframe)}
                      onPrefillMt5Ticket={(entry) => {
                        void prefillSignalTicket(entry, 'mt5');
                      }}
                      onPrefillTradeLockerTicket={(entry) => {
                        void prefillSignalTicket(entry, 'tradelocker');
                      }}
                      onClearSignals={clearSignalEntries}
                      intents={signalIntentFeatureFlags.signalIntentV1Composer ? signalIntents : []}
                      onOpenIntentComposer={() => {
                        if (!signalIntentFeatureFlags.signalIntentV1Composer) return;
                        setSignalIntentComposerOpen(true);
                      }}
                      onPauseIntent={(id) => {
                        void pauseSignalIntent(id, 'signal_panel');
                      }}
                      onResumeIntent={(id) => {
                        void resumeSignalIntent(id, 'signal_panel');
                      }}
                      crossPanelContext={crossPanelContext}
                    />
                )}
                {mode === 'snapshot' && (
                    <SnapshotInterface
                      symbol={snapshotPanelSymbol || symbolScopeSymbol || signalPrimarySymbol || activeBrokerSymbol || activeTvParams?.symbol || ''}
                      candidateSymbols={snapshotPanelCandidates}
                      onSelectSymbol={handleSnapshotPanelSelectSymbol}
                      onSearchSymbols={searchSymbolSuggestions}
                      timeframes={snapshotPanelTimeframes}
                      status={snapshotPanelStatus}
                      onWarmup={() => {
                        void warmupSnapshotPanel();
                      }}
                      onRefresh={() => {
                        void refreshSnapshotPanelStatus();
                      }}
                      applyToSignals={snapshotPanelApplyToSignals}
                      onApplyToSignalsChange={setSnapshotPanelApplyToSignals}
                      brokerConnected={tlStatus === 'connected'}
                      upstreamBlockedUntilMs={tlUpstreamBlockedUntilMs ?? null}
                    />
                )}
                {mode === 'patterns' && (
                    <PatternsInterface
                      symbols={patternSymbols}
                      symbolMode={patternSymbolMode}
                      onSymbolModeChange={(next) => updatePatternSettings({ symbolMode: next })}
                      onAddSymbol={handlePatternAddSymbol}
                      onRemoveSymbol={handlePatternRemoveSymbol}
                      onSearchSymbols={searchSymbolSuggestions}
                      timeframes={patternWatchTimeframes}
                      onTimeframesChange={handlePatternTimeframesChange}
                      detectors={patternDetectorsResolved}
                      onDetectorsChange={handlePatternDetectorsChange}
                      autoRefreshEnabled={patternAutoRefreshEnabled}
                      onAutoRefreshChange={(next) => updatePatternSettings({ autoRefreshEnabled: next })}
                      refreshIntervalMs={patternRefreshIntervalMs}
                      onRefreshIntervalChange={(next) => updatePatternSettings({ refreshIntervalMs: next })}
                      refreshMode={patternRefreshMode}
                      onRefreshModeChange={(next) => updatePatternSettings({ refreshMode: next })}
                      events={patternEvents}
                      effectiveSymbols={patternWatchSymbols}
                      watchCount={patternWatchSummary.watchCount}
                      watchLimit={PATTERN_WATCH_LIMIT}
                      watchTruncated={patternWatchSummary.truncated}
                      onRefreshNow={() => {
                        const fetches = Math.max(1, Math.min(6, patternWatchSummary.watchCount || 1));
                        requestChartRefresh(fetches);
                      }}
                      onFocusChart={(symbol, timeframe) => openSymbolPanel('nativechart', symbol, timeframe)}
                    />
                )}
                {mode === 'shadow' && (
                    <div className="flex h-full w-full flex-col bg-[#0a0a0a]">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
                        <div className="text-[11px] uppercase tracking-wider text-gray-400">Automation Control</div>
                        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
                          <button
                            type="button"
                            onClick={() => setShadowPanelTabSafe('shadow')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                              shadowPanelTab === 'shadow'
                                ? 'bg-slate-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            Shadow
                          </button>
                          <button
                            type="button"
                            onClick={() => setShadowPanelTabSafe('auto')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                              shadowPanelTab === 'auto'
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            Auto
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        {shadowPanelTab === 'shadow' ? (
                          <ShadowInterface
                            agents={agents}
                            profiles={shadowProfiles}
                            accounts={shadowAccounts}
                            trades={shadowTradeViews}
                            followEnabled={signalShadowFollowEnabled}
                            onToggleFollow={(next) => updateSignalSettings({ shadowFollowEnabled: next })}
                            onUpdateProfile={updateShadowProfile}
                            onRefresh={() => {
                              void refreshShadowTrades({ force: true, includeCompare: true });
                            }}
                          />
                        ) : (
                          <AutoPilotInterface
                            config={autoPilotConfig}
                            onUpdateConfig={setAutoPilotConfig}
                            equity={equity}
                            memories={memories}
                            agents={agents}
                            activePlaybookRun={taskPlaybookActiveRunRef.current}
                            recentPlaybookRuns={taskPlaybookRunsRef.current}
                            taskTreeResumeEntries={taskTreeResumeEntries}
                            onResumeTaskTreeRun={(input) => {
                              void resumeTaskTreeRun(input);
                            }}
                            taskTreeRuns={taskTreeRunsState}
                            actionTaskTreeRuns={actionTaskTreeRunsState}
                            onReplayTaskTree={handleReplayTaskTree}
                            recommendedFlows={recommendedActionFlowsState}
                            onRunActionFlow={runRecommendedActionFlow}
                            onRunActionCatalog={runActionCatalog}
                            onOpenAcademy={() => openAcademyCase(null)}
                            onResumePlaybookRun={(runId, opts) => {
                              void resumePlaybookRun(runId, opts);
                            }}
                            postTradeReviewEnabled={postTradeReviewEnabled}
                            onTogglePostTradeReview={(enabled) => setPostTradeReviewEnabled(!!enabled)}
                            postTradeReviewAgentId={postTradeReviewAgentId}
                            onSetPostTradeReviewAgentId={(id) => setPostTradeReviewAgentId(String(id || '').trim())}
                            onReviewLastClosedTrade={() => reviewLastClosedTrade()}
                            onAddMemory={({ type, text, meta }) => addManualMemory({ type, text, meta: { source: 'user', ...(meta || {}) } })}
                            onUpdateMemory={updateTradeMemory}
                            onDeleteMemory={deleteTradeMemory}
                            onClearMemories={clearTradeMemories}
                            lossStreak={lossStreakState?.streak ?? null}
                            lossStreakUpdatedAtMs={lossStreakState?.updatedAtMs ?? lossStreakState?.lastClosedAtMs ?? null}
                            shadowTradeStats={shadowTradeStats}
                            shadowCompare={shadowTradeCompare}
                            lastTradeBlock={lastTradeBlock}
                            healthSnapshot={healthSnapshot}
                            brokerRateLimitSuppressUntilMs={brokerRateLimitSuppressUntilMs}
                          />
                        )}
                      </div>
                    </div>
                )}
                {mode === 'calendar' && (
                    <CalendarInterface
                      rules={calendarRules}
                      onRefreshRules={refreshCalendarRules}
                      onUpsertRule={upsertCalendarRule}
                      onToggleRule={toggleCalendarRule}
                      onSearchSymbols={searchSymbolSuggestions}
                      onSyncEvents={() => syncEconomicCalendar({ force: true, reason: 'panel' })}
                      onLoadPnlSnapshot={loadCalendarPnlSnapshot}
                      pnlAccountOptions={(Array.isArray(tlAccounts) ? tlAccounts : [])
                        .map((acct: any) => {
                          const env = tlSavedConfig?.env ? String(tlSavedConfig.env) : '';
                          const server = tlSavedConfig?.server ? String(tlSavedConfig.server) : '';
                          const accountId = parseTradeLockerAccountNumber(acct?.id);
                          const accNum = parseTradeLockerAccountNumber(acct?.accNum);
                          if (accountId == null || accNum == null) return null;
                          const accountKey = buildTradeLockerAccountKey({
                            env: env || null,
                            server: server || null,
                            accountId,
                            accNum
                          });
                          if (!accountKey) return null;
                          const labelRaw = acct?.name ? String(acct.name).trim() : '';
                          const label = labelRaw || `TradeLocker ${accountId}/${accNum}`;
                          return {
                            accountKey,
                            label,
                            broker: 'tradelocker',
                            accountId,
                            accNum,
                            env: env || null,
                            server: server || null
                          };
                        })
                        .filter(Boolean)}
                      pnlActiveAccountKey={getTradeLockerAccountKey()}
                      pnlEnabled
                      onRunActionCatalog={runActionCatalog}
                    />
                )}
                {isUnifiedChatMode(mode) && (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Chart Chat</div>
                        <button
                          type="button"
                          onClick={() => sendChartChatMessageWithSnapshot(
                            'Explain latest patterns.',
                            chartChatContext,
                            [],
                            null,
                            chatSignalWorkspaceV1 && activeSignalThreadId
                              ? {
                                  threadKind: 'signal',
                                  threadId: resolveSignalThreadKey(activeSignalThreadId),
                                  signalId: activeSignalThreadId,
                                  threadLabel: signalContextById[activeSignalThreadId]?.symbol || null
                                }
                              : {
                                  threadKind: 'global',
                                  threadId: 'global',
                                  signalId: null,
                                  threadLabel: 'Global'
                                }
                          )}
                          className="px-2 py-1 rounded-md text-[10px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-100"
                        >
                          Explain latest patterns
                        </button>
                      </div>
                      <div className="flex-1 overflow-hidden">
                          <ChatInterface
                            channel="chart"
                            messages={chartChatMessages}
                            onSendMessage={(text, img) => sendChartChatMessageWithSnapshot(
                              text,
                              chartChatContext,
                              [],
                              img,
                              chatSignalWorkspaceV1 && activeSignalThreadId
                                ? {
                                    threadKind: 'signal',
                                    threadId: resolveSignalThreadKey(activeSignalThreadId),
                                    signalId: activeSignalThreadId,
                                    threadLabel: signalContextById[activeSignalThreadId]?.symbol || null
                                  }
                                : {
                                    threadKind: 'global',
                                    threadId: 'global',
                                    signalId: null,
                                    threadLabel: 'Global'
                                  }
                            )}
                            captureActiveTabScreenshot={async () => {
                              const frame = await captureTabCached(activeTabId, { format: 'jpeg', quality: 80, width: 1280 }, 1200);
                              if (!frame?.data) return null;
                              return `data:${frame.mimeType || 'image/jpeg'};base64,${frame.data}`;
                            }}
                            captureContextScreenshots={captureChatTabContextImages}
                            onClearChat={clearChartChatWithSnapshot}
                            isThinking={chartChatThinking}
                            isTeamMode={chartChatReplyMode === 'team'}
                            chartSnapshotStatus={chartChatSnapshotStatus}
                            onToggleTeamMode={() => setChartChatReplyMode(prev => prev === 'team' ? 'single' : 'team')}
                          agents={chartChatAgents}
                          activeAgentId={chartChatActiveAgentId}
                          onAddAgent={addChartChatAgent}
                          onSwitchAgent={switchChartChatAgent}
                          onUpdateAgent={updateChartChatAgent}
                            onDeleteAgent={deleteChartChatAgent}
                            actionQueueDepth={actionTaskQueueDepth}
                            actionTaskActiveConfig={actionTaskActiveStepRef.current}
                            playbooks={taskPlaybooks}
                            activePlaybookRun={taskPlaybookActiveRunRef.current}
                            recentPlaybookRuns={taskPlaybookRunsRef.current}
                            taskTreeResumeEntries={taskTreeResumeEntries}
                            onResumeTaskTreeRun={(input) => {
                              void resumeTaskTreeRun(input);
                            }}
                            taskTreeRuns={taskTreeRunsState}
                            actionTaskTreeRuns={actionTaskTreeRunsState}
                            onReplayTaskTree={handleReplayTaskTree}
                            recommendedFlows={recommendedActionFlowsState}
                            onRunActionFlow={runRecommendedActionFlow}
                            onRunActionCatalog={runActionCatalog}
                            onResumePlaybookRun={(runId, opts) => {
                              void resumePlaybookRun(runId, opts);
                            }}
                            autoTabVisionEnabled={chartChatAutoTabVisionEnabled}
                          onToggleAutoTabVision={() => setChartChatAutoTabVisionEnabled(prev => !prev)}
                          chartWatchEnabled={chartChatWatchEnabled}
                          onToggleChartWatch={() => setChartChatWatchEnabled(prev => !prev)}
                          chartWatchMode={chartChatWatchMode}
                          onSetChartWatchMode={setChartChatWatchMode}
                          chartWatchSnoozedUntilMs={chartChatSnoozedUntilMs}
                          onSnoozeChartWatch={chartChatSnoozeWatch}
                          onClearChartWatchSnooze={clearChartChatSnooze}
                          chartWatchLeadAgentId={chartChatLeadAgentId}
                          onSetChartWatchLeadAgentId={setChartChatLeadAgentId}
                          chartSessions={chartSessions.sessions}
                          activeTabId={activeTabId}
                          getTabTitle={(tabId) => {
                            const tab = tabs.find((t) => t.id === tabId);
                            return tab?.title || tab?.url || tabId;
                          }}
                          onCreateChartSessionFromActiveTab={() => {
                            if (!activeTab) return;
                            const sessionId = chartSessions.createSessionFromTab(activeTab);
                            if (!sessionId) return;
                            chartSessions.assignTabToTimeframe(sessionId, '15m', activeTabId);
                            updateTab(activeTabId, { isWatched: true, watchSource: 'manual' });
                          }}
                          onAssignActiveTabToChartSession={(sessionId, timeframe) => {
                            if (!activeTabId) return;
                            chartSessions.assignTabToTimeframe(sessionId, timeframe, activeTabId);
                            updateTab(activeTabId, { isWatched: true, watchSource: 'manual' });
                          }}
                          onClearChartSessionTimeframe={(sessionId, timeframe) => {
                            chartSessions.clearTimeframe(sessionId, timeframe);
                          }}
                          onToggleChartSessionWatch={(sessionId) => {
                            const session = chartSessions.byId.get(sessionId);
                            if (!session) return;
                            chartSessions.setSessionWatchEnabled(sessionId, !session.watchEnabled);
                          }}
                          onRemoveChartSession={(sessionId) => {
                            chartSessions.removeSession(sessionId);
                          }}
                          isLive={chartChatIsLive}
                          liveMode={chartChatLiveMode}
                          liveStream={chartChatLiveStream}
                          startLiveSession={startChartChatLive}
                          stopLiveSession={stopChartChatLive}
                          sendVideoFrame={sendChartChatVideoFrame}
                          speakMessage={speakChartChatMessage}
                          speakingMessageId={chartChatSpeakingMessageId}
                          sessionBias={chartChatSessionBias}
                          onUpdateSessionBias={setChartChatSessionBias}
                          onExecuteTrade={(messageId, proposal) => executeChartChatTradeProposal(messageId, proposal, 'manual')}
                          onRejectTrade={(messageId) => rejectChartChatTradeProposal(messageId, 'Rejected by user')}
                          onExecuteBrokerAction={(messageId, action) => executeChartChatBrokerAction(messageId, action)}
                          onRejectBrokerAction={(messageId) => rejectChartChatBrokerAction(messageId, 'Rejected by user')}
                          onCancelAgentTool={(messageId) => cancelChartChatAgentTool(messageId)}
                          contextPackText={getChartContextPack()}
                          onCaptureContextPack={captureChartContextPack}
                          symbolScope={symbolScope}
                          onUpdateSymbolScope={updateSymbolScope}
                          onClearSymbolScope={clearSymbolScope}
                          onSearchSymbols={searchSymbolSuggestions}
                          crossPanelContext={crossPanelContext}
                          signalThreads={chatSignalWorkspaceV1 ? signalThreads : []}
                          activeSignalThreadId={chatSignalWorkspaceV1 ? activeSignalThreadId : null}
                          onSelectSignalThread={chatSignalWorkspaceV1 ? selectSignalThreadFromChat : undefined}
                          signalContextById={chatSignalWorkspaceV1 ? signalContextById : {}}
                          onExecuteSignalFromChat={chatSignalWorkspaceActionsV1 ? executeSignalFromChat : undefined}
                          onRejectSignalFromChat={chatSignalWorkspaceActionsV1 ? rejectSignalFromChat : undefined}
                          onCancelSignalOrderFromChat={chatSignalWorkspaceActionsV1 ? cancelSignalOrderFromChat : undefined}
                          onAskAgentAboutSignal={chatSignalWorkspaceV1 ? askAgentAboutSignalFromChat : undefined}
                          onOpenSignalFromChat={chatSignalWorkspaceV1 ? openSignalFromChat : undefined}
                          onOpenAcademyCaseFromChat={chatSignalWorkspaceV1 ? openAcademyCaseFromChat : undefined}
                          onOpenChartFromSignalChat={chatSignalWorkspaceV1 ? openChartFromSignalChat : undefined}
                          contextInspector={chatContextInspectorV1 ? chatContextInspectorState || undefined : undefined}
                        />
                      </div>
                    </div>
                )}
                {mode === 'notes' && (
                    <NotesInterface 
                        autoAppend={journalEntry}
                        onClearAppend={() => setJournalEntry(null)}
                        currentTab={activeTab ? { url: activeTab.url, title: activeTab.title } : undefined}
                        sessionBias={sessionBias}
                        captureActiveTabScreenshot={async () => {
                          const frame = await captureTabCached(activeTabId, { format: 'jpeg', quality: 60, width: 1200 }, 1200);
                          if (!frame?.data) return null;
                          return `data:${frame.mimeType || 'image/jpeg'};base64,${frame.data}`;
                        }}
                        activeAccount={tlSavedConfig ? {
                          env: tlSavedConfig.env ?? null,
                          server: tlSavedConfig.server ?? null,
                          accountId: tlSavedConfig.accountId ?? null,
                          accNum: tlSavedConfig.accNum ?? null
                        } : undefined}
                        onReplayTrade={handleReplayTrade}
                        onRunActionCatalog={runActionCatalog}
                        crossPanelContext={crossPanelContext}
                    />
                )}
                {mode === 'leaderboard' && (
                    <LeaderboardInterface 
                        agents={agents}
                        history={leaderboardHistory}
                        scorecards={agentScorecards}
                        rankFreshness={healthSnapshot?.rankFreshness || null}
                        agentDriftReports={healthSnapshot?.agentDrift?.reports || null}
                        filter={leaderboardFilter}
                        onFilterChange={setLeaderboardFilter}
                        onRunActionCatalog={runActionCatalog}
                        onOpenAcademy={() => openAcademyCase(null)}
                        crossPanelContext={crossPanelContext}
                        outcomeFeedCursor={outcomeFeedCursor}
                        outcomeFeedConsistency={outcomeFeedConsistency}
                        panelFreshness={panelFreshness.find((row) => row.panel === 'leaderboard') || null}
                    />
                )}
                {mode === 'academy' && academyMounted && (
                    <AcademyInterface
                      cases={academyCases}
                      lessons={academyLessons}
                      symbolLearnings={academySymbolLearnings}
                      selectedCaseId={academySelectedCaseId}
                      onSelectCase={handleAcademyCaseSelect}
                      autoApplyEnabled={academyAutoApplyEnabled}
                      onToggleAutoApply={(next) => updateAcademySettings({ autoApplyEnabled: next })}
                      autoExportEnabled={academyAutoExportEnabled}
                      onToggleAutoExport={(next) => updateAcademySettings({ autoExportEnabled: next })}
                      lessonLimit={academyLessonLimit}
                      onLessonLimitChange={(next) => updateAcademySettings({ lessonLimit: next })}
                      onRefresh={() => {
                        void refreshAcademyCases();
                        void refreshAcademyLessons();
                        void refreshAcademySymbolLearnings();
                      }}
                      onExport={() => {
                        void persistAcademyExport();
                      }}
                      onOpenChart={(symbol, timeframe) => openSymbolPanel('nativechart', symbol, timeframe)}
                      onOpenMt5={(symbol, timeframe) => openSymbolPanel('mt5', symbol, timeframe)}
                      onOpenTradeLocker={(symbol, timeframe) => openSymbolPanel('tradelocker', symbol, timeframe)}
                      onReplayTrade={handleReplayTrade}
                      crossPanelContext={crossPanelContext}
                      outcomeFeedCursor={outcomeFeedCursor}
                      outcomeFeedConsistency={outcomeFeedConsistency}
                      focusRequest={academyFocusRequest}
                      onFocusRequestConsumed={handleAcademyFocusRequestConsumed}
                      onApplyLesson={(lessonId, targetAgentKey) => {
                        return runAcademyLessonLifecycleAction({
                          lessonId,
                          action: 'apply',
                          targetAgentKey: targetAgentKey || null
                        });
                      }}
                      onSimulateLesson={(lessonId) => {
                        return runAcademyLessonSimulation(lessonId);
                      }}
                      onPinLesson={(lessonId, nextPinned) => {
                        return runAcademyLessonLifecycleAction({
                          lessonId,
                          action: nextPinned ? 'pin' : 'unpin'
                        });
                      }}
                      onSetLessonLifecycle={(lessonId, next) => {
                        return runAcademyLessonLifecycleAction({
                          lessonId,
                          action: next === 'core'
                            ? 'promote'
                            : next === 'deprecated'
                              ? 'deprecate'
                              : 'demote_candidate'
                        });
                      }}
                      onLearningGraphBuilt={recordAcademyLearningGraphBuilt}
                      onLearningGraphLensChanged={recordAcademyLearningGraphLensChanged}
                      onLearningPathGenerated={recordAcademyLearningPathGenerated}
                      onLearningGraphCaseAction={recordAcademyLearningGraphCaseAction}
                      onLearningGraphPathZoom={recordAcademyLearningGraphPathZoom}
                      learningGraphFeatureFlags={learningGraphFeatureFlags}
                      panelFreshness={panelFreshness.find((row) => row.panel === 'academy') || null}
                    />
                )}
                {mode === 'dashboard' && (
                    <PerformanceDashboard
                      defaultSymbol={symbolScopeSymbol || activeBrokerSymbol || activeTvParams?.symbol}
                      defaultTimeframe={activeTvTimeframeLabel}
                      onApplyToBacktester={applyOrQueueBacktestOptimization}
                      onCreateWatchProfile={createWatchProfileFromOptimization}
                      onSaveWinnerPreset={saveOptimizerWinnerPreset}
                      onRunActionCatalog={runActionCatalog}
                    />
                )}
                {mode === 'monitor' && (
                    <MonitorInterface
                      health={healthSnapshot}
                      onRequestSnapshot={requestSystemSnapshot}
                      onClearSnapshotFrameCache={clearSnapshotFrameCache}
                      onRunActionCatalog={runActionCatalog}
                      onExecuteAgentTool={executeAgentToolRequest}
                      liveErrors={liveErrors}
                      onClearLiveErrors={clearLiveErrors}
                      runtimeOpsEvents={runtimeOpsEvents}
                      onClearRuntimeOpsEvents={clearRuntimeOpsEvents}
                      runtimeOpsState={runtimeOpsControllerState}
                      runtimeOpsEnabled={runtimeOpsControllerState.mode !== 'disarmed'}
                      onSetRuntimeOpsEnabled={setRuntimeOpsEnabled}
                      onSetRuntimeOpsMode={setRuntimeOpsMode}
                      onEmergencyStopRuntimeOps={emergencyStopRuntimeOps}
                      onRunRuntimeOpsAction={runRuntimeOpsAction}
                      runtimeOpsFeatureFlags={runtimeOpsFeatureFlags}
                    />
                )}
                {mode === 'mt5' && (
                    <MT5Interface
                      onRunActionCatalog={runActionCatalog}
                      defaultSymbol={symbolScopeSymbol || activeBrokerSymbol || activeTvParams?.symbol}
                      symbolMap={brokerLinkConfig?.symbolMap || []}
                    />
                )}
                  {mode === 'tradelocker' && (
                     <TradeLockerInterface 
                          balance={tlBalance}
                          equity={tlEquity}
                          positions={tlPositions}
                          orders={tlOrders}
                          ordersError={tlOrdersError}
                          brokerQuotes={tlQuotesBySymbol}
                          brokerQuotesUpdatedAtMs={tlQuotesUpdatedAtMs}
                          brokerQuotesError={tlQuotesError}
                          accountMetrics={tlAccountMetrics}
                          accountMetricsError={tlAccountMetricsError}
                          accountProbePath={tlStatusMeta?.accountProbePath ?? null}
                          accountProbeLastError={tlStatusMeta?.accountProbeLastError ?? null}
                          reconcileLagMs={tlStatusMeta?.reconcileLagMs ?? null}
                          snapshotUpdatedAtMs={tlSnapshotUpdatedAtMs}
                          defaultSymbol={symbolScopeSymbol || activeBrokerSymbol || activeTvParams?.symbol}
                          accounts={tlAccounts}
                          accountsError={tlAccountsError}
                          activeAccount={{
                            env: tlSavedConfig?.env ?? null,
                            server: tlSavedConfig?.server ?? null,
                            accountId: tlSavedConfig?.accountId ?? null,
                            accNum: tlSavedConfig?.accNum ?? null
                          }}
                          snapshotSourceKey={tlSnapshotSourceKey}
                          snapshotAutoSwitch={tlSnapshotAutoSwitch}
                          snapshotFallbackOrder={tlSnapshotFallbackOrder}
                          executionTargets={tlExecutionTargets}
                          normalizationEnabled={tlNormalizeEnabled}
                          normalizationReferenceKey={tlNormalizeRefKey || null}
                          symbolMap={brokerLinkConfig?.symbolMap || []}
                          strategyMatrixRows={tlStrategyMatrixRows}
                          strategyAssignments={tlStrategyAssignments}
                          marketSubscriptions={tlMarketSubscriptions}
                          shardStates={tlShardStates}
                          onRefresh={() => {
                            tlRefreshSnapshot();
                            tlRefreshOrders();
                            tlRefreshAccountMetrics();
                            tlRefreshQuotes();
                          }}
                          onRefreshAccounts={tlRefreshAccounts}
                          onClosePosition={handleTradeLockerClosePosition}
                          onCancelOrder={handleTradeLockerCancelOrder}
                          onPlaceOrder={executeTicketOrderViaApi}
                          onSearchInstruments={tlSearchInstruments}
                          onOpenSettings={() => setIsSettingsOpen(true)}
                          isConnected={tlStatus === 'connected'}
                          tradingEnabled={!!tlSavedConfig?.tradingEnabled}
                          defaultOrderQty={tlSavedConfig?.defaultOrderQty ?? 0}
                          defaultOrderType={tlSavedConfig?.defaultOrderType || 'market'}
                          streamStatus={tlStreamStatus}
                          streamUpdatedAtMs={tlStreamUpdatedAtMs}
                          streamError={tlStreamError}
                          rateLimitTelemetry={tlStatusMeta?.rateLimitTelemetry ?? null}
                          serverLabel={tlServerLabel}
                          connectionLabel={tlConnectionMeta.label}
                          connectionDotClass={tlConnectionMeta.dot}
                          onRunActionCatalog={runActionCatalog}
                          onRunActionCatalogImmediate={runActionCatalogImmediate}
                          onSnapshotSourceChange={handleSnapshotSourceChange}
                          onSnapshotAutoSwitchChange={setTlSnapshotAutoSwitch}
                          onSnapshotFallbackChange={setTlSnapshotFallbackOrder}
                          onExecutionTargetsChange={setTlExecutionTargets}
                          onNormalizationChange={handleNormalizationChange}
                          onSymbolMapChange={(entries) => {
                            setBrokerLinkConfig((prev) => ({ ...prev, symbolMap: entries || [] }));
                          }}
                        />
                  )}
                {(nativeChartMounted || mode === 'nativechart') && (
                    <div className={mode === 'nativechart' ? 'flex flex-1 flex-col min-h-0 overflow-y-auto' : 'absolute inset-0 pointer-events-none opacity-0'}>
                        <NativeChartInterface
                            ref={nativeChartRef}
                              activeSymbol={nativeChartSymbol || symbolScopeSymbol || activeBrokerSymbol || activeTvParams?.symbol}
                            isPanelVisible={mode === 'nativechart'}
                            isConnected={tlStatus === 'connected'}
                            hasDeveloperApiKey={!!tlSavedConfig?.hasSavedDeveloperApiKey}
                            positions={tlPositions}
                            orders={tlOrders}
                            quotesBySymbol={tlQuotesBySymbol}
                            setupSignals={setupSignals}
                            setupWatchers={setupWatchers}
                            regimeBlocks={setupRegimeBlocks}
                            reviewAnnotations={reviewAnnotations}
                            patternEvents={patternEvents}
                            tvSymbol={activeTvParams?.symbol}
                            tvPrice={activeTvPrice}
                            tvPriceUpdatedAtMs={activeTvPriceUpdatedAtMs}
                            onOpenAcademy={() => openAcademyCase(null)}
                            onOpenSettings={() => setIsSettingsOpen(true)}
                            onSymbolChange={setNativeChartSymbol}
                            resolveSymbol={resolveTradeLockerSymbolBestEffort}
                            onFullscreenChange={setIsChartFullscreen}
                            onBarClose={handleNativeBarClose}
                            onUpdateWatcher={updateSetupWatcher}
                            onRunActionCatalog={runActionCatalog}
                            requestBroker={requestBrokerWithAudit}
                            crossPanelContext={crossPanelContext}
                        />
                    </div>
                )}
                  {(backtesterMounted || mode === 'backtester') && (
                      <div className={mode === 'backtester' ? 'flex flex-1 flex-col' : 'hidden'}>
                          <BacktesterInterface
                              ref={backtesterRef}
                              activeSymbol={backtestSymbol || symbolScopeSymbol || activeBrokerSymbol || activeTvParams?.symbol}
                              isConnected={tlStatus === 'connected'}
                              onOpenSettings={() => setIsSettingsOpen(true)}
                              onSymbolChange={setBacktestSymbol}
                              resolveSymbol={resolveTradeLockerSymbolBestEffort}
                              onSendTrainingMessage={sendBacktestMessage}
                              onSendToWatchlist={sendBacktestSetupToWatchlist}
                              onFocusChart={focusNativeChart}
                              onPersistOptimization={saveSetupLibraryFromOptimization}
                              onCreateWatchProfile={createWatchProfileFromOptimization}
                              onRunActionCatalog={runActionCatalog}
                              activePlaybookRun={taskPlaybookActiveRunRef.current}
                              recentPlaybookRuns={taskPlaybookRunsRef.current}
                              taskTreeResumeEntries={taskTreeResumeEntries}
                              onResumeTaskTreeRun={(input) => {
                                void resumeTaskTreeRun(input);
                              }}
                        taskTreeRuns={taskTreeRunsState}
                        actionTaskTreeRuns={actionTaskTreeRunsState}
                        recommendedFlows={recommendedActionFlowsState}
                        onReplayTaskTree={handleReplayTaskTree}
                        onResumePlaybookRun={(runId, opts) => {
                          void resumePlaybookRun(runId, opts);
                        }}
                              onReady={flushPendingBacktestApply}
                          />
                      </div>
                  )}
                  {(setupsMounted || mode === 'setups') && (
                      <div className={mode === 'setups' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                          <SetupsInterface
                              isConnected={tlStatus === 'connected'}
                              watchers={setupWatchers}
                              signals={setupSignals}
                              regimes={setupRegimes}
                              regimeBlocks={setupRegimeBlocks}
                              libraryEntries={setupLibraryEntries}
                              performanceByWatcher={setupPerformanceByWatcher}
                              performanceByLibrary={setupPerformanceByLibrary}
                              performanceByMode={setupPerformanceByMode}
                              performanceBySymbol={setupPerformanceBySymbol}
                              performanceSummary={setupPerformanceSummary}
                              playbookStatusByWatcher={playbookStatusByWatcher}
                              performanceUpdatedAtMs={setupPerformanceUpdatedAtMs}
                              performanceError={setupPerformanceError}
                              onCreateWatcher={(input) => addSetupWatcher(input)}
                              onUpdateWatcher={updateSetupWatcher}
                              onRemoveWatcher={removeSetupWatcher}
                              onClearSignals={clearSetupSignals}
                              onFocusChart={(symbol, timeframe) => openSymbolPanel('nativechart', symbol, timeframe)}
                              onApplyToBacktester={(payload) => applyOrQueueBacktestOptimization(payload)}
                              onExplainSignal={handleExplainSetupSignal}
                              onRunActionCatalog={runActionCatalog}
                              crossPanelContext={crossPanelContext}
                          />
                      </div>
                  )}
                {(agentCreatorMounted || mode === 'agentcreator') && (
                    <div className={mode === 'agentcreator' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}>
                        <AgentCreatorInterface
                          agents={agents}
                          activeSymbol={symbolScopeSymbol || activeBrokerSymbol || activeTvParams?.symbol}
                          activeTimeframe={activeTvTimeframeLabel}
                          onRunActionCatalog={runActionCatalog}
                          signalScanEnabledByAgentId={agentScanEnabledById}
                          onSetSignalScanEnabled={setAgentSignalScanEnabled}
                          onOpenSignalPanel={() => openSidebarMode('signal')}
                        />
                    </div>
                )}
                {(agentMemoryMounted || mode === 'agentmemory') && (
                    <div className={mode === 'agentmemory' ? 'flex flex-1 flex-col' : 'hidden'}>
                        <AgentMemoryInterface
                            activeSymbol={symbolScopeSymbol || activeBrokerSymbol || activeTvParams?.symbol}
                          activeTimeframe={activeTvTimeframeLabel}
                          agents={agents}
                          onOpenSettings={() => setIsSettingsOpen(true)}
                          onRunActionCatalog={runActionCatalog}
                        />
                    </div>
                )}
                {(agentLabMounted || mode === 'agentlab') && (
                    <div className={mode === 'agentlab' ? 'flex flex-1 flex-col' : 'hidden'}>
                        <AgentLabInterface onRunActionCatalog={runActionCatalog} />
                    </div>
                )}
                {(auditMounted || mode === 'audit') && (
                    <div className={mode === 'audit' ? 'flex flex-1 flex-col' : 'hidden'}>
                        <AuditTrailInterface
                          health={healthSnapshot || undefined}
                          onReplayTaskTree={handleReplayTaskTree}
                          onRunActionCatalog={runActionCatalog}
                          outcomeFeedCursor={outcomeFeedCursor}
                          outcomeFeedConsistency={outcomeFeedConsistency}
                          panelFreshness={panelFreshness.find((row) => row.panel === 'audit') || null}
                        />
                    </div>
                )}
                {(changesMounted || mode === 'changes') && (
                    <div className={mode === 'changes' ? 'flex flex-1 flex-col' : 'hidden'}>
                        <ChangesInterface
                          onRunActionCatalog={runActionCatalog}
                          outcomeFeedCursor={outcomeFeedCursor}
                          outcomeFeedConsistency={outcomeFeedConsistency}
                          panelFreshness={panelFreshness.find((row) => row.panel === 'changes') || null}
                        />
                    </div>
                )}
                </React.Suspense>
    </>
  );
};

export default AppSidebarPanels;
