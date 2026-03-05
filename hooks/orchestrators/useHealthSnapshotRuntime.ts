import React from 'react';
import type { HealthSnapshot } from '../../types';

type UseHealthSnapshotRuntimeArgs = {
  setupWatchersRef: React.MutableRefObject<any[]>;
  setupSignalsRef: React.MutableRefObject<any[]>;
  nativeChartRef: React.MutableRefObject<any>;
  autoPilotStateRef: React.MutableRefObject<any>;
  startupReadinessStatus: any;
  startupPhase: string;
  openaiReadinessState: string | null;
  tradeLockerReadinessState: string | null;
  startupBridgeState: string | null;
  startupBridgeError: string | null;
  tlStartupAutoRestore: any;
  tlStatus: string;
  tlQuotesUpdatedAtMs: number | null;
  tlQuotesError: string | null;
  tlSnapshotUpdatedAtMs: number | null;
  tlStreamStatus: string | null;
  tlStreamUpdatedAtMs: number | null;
  tlStreamError: string | null;
  brokerRateLimitSuppressUntilMs: number | null;
  tlStatusMeta: any;
  tlShardStates: any[];
  tlStrategyMatrixRows: any[];
  tlMarketSubscriptions: any[];
  tradeLockerAccountSelectorSnapshot: any;
  tlShardScheduler: { getTelemetry: () => any };
  agentScorecards: any[];
  runtimeOpsControllerState: any;
  chartEngine: any;
  runtimeScheduler: { getStats: () => any };
  getWorkerFallbackStats: () => any[];
  refreshSlaMonitor: { getSnapshot: (now: number) => any; getChannelSnapshots: (now: number) => any[] };
  brokerCircuitBreaker: { getSnapshot: (now: number) => any; getSourceSnapshot: (now: number) => any[] };
  getDomainReadiness: () => any;
  getPersistenceHealthSnapshot: () => any;
  executionAuditService: { getSnapshot: () => any };
  livePolicyService: { getSnapshot: () => any };
  panelConnectivityEngine: { getSnapshot: (now: number) => any };
  normalizePanelConnectivitySnapshot: (snapshot: any, now: number) => any;
  crossPanelContextEngine: { getContext: () => any };
  outcomeConsistencyEngine: {
    getCursor: () => any;
    getConsistencyState: (now?: number) => any;
    getPanelFreshness: (now?: number) => any;
  };
  buildRankFreshnessState: (input: any) => any;
  snapshotPerf: (now: number) => any;
  updateAutoPilotState: (opts?: { now?: number; emit?: boolean }) => any;
  appendAuditEvent: (event: any) => Promise<any> | void;
  loadFeatureControllers: () => Promise<{
    startIntervalControllerSafe: (args: { intervalMs: number; onTick: () => void }) => (() => void) | null;
  }>;
  setHealthSnapshot: React.Dispatch<React.SetStateAction<HealthSnapshot | null>>;
  buildHealthSnapshotRef: React.MutableRefObject<(() => HealthSnapshot) | null>;
  healthSnapshotRef: React.MutableRefObject<HealthSnapshot | null>;
  lastHealthAuditAtRef: React.MutableRefObject<number>;
  securityAuditSnapshotRef: React.MutableRefObject<any>;
  bridgeLifecycleSnapshotRef: React.MutableRefObject<any>;
  renderPerfSnapshotRef: React.MutableRefObject<any>;
  ciValidationSnapshotRef: React.MutableRefObject<any>;
  migrationParityRef: React.MutableRefObject<any>;
  academyMergeStatsRef: React.MutableRefObject<any>;
  academyDataQualityStatsRef: React.MutableRefObject<any>;
  academyLearningGraphTelemetryRef: React.MutableRefObject<any>;
  runtimeOpsExternalStatsRef: React.MutableRefObject<any>;
  runtimeOpsStreamStatsRef: React.MutableRefObject<any>;
  tradeLockerSwitchStatsRef: React.MutableRefObject<any>;
  academyCompanionRowsReadRef: React.MutableRefObject<number>;
  intentHydrationRowsReadRef: React.MutableRefObject<number>;
  incrementalCursorFallbackCountRef: React.MutableRefObject<number>;
  ledgerArchiveStatsRef: React.MutableRefObject<any>;
  signalIdCollisionPreventedCountRef: React.MutableRefObject<number>;
  signalStatusReportStatsRef: React.MutableRefObject<any>;
  chatStateRef: React.MutableRefObject<any>;
  brokerRateLimitLastAtRef: React.MutableRefObject<number | null>;
  brokerRateLimitLastMessageRef: React.MutableRefObject<string | null>;
  setupWatcherLastEvalAtRef: React.MutableRefObject<number | null>;
  setupWatcherLastSignalAtRef: React.MutableRefObject<number | null>;
  backgroundWatcherLastTickAtRef: React.MutableRefObject<number | null>;
  taskTreeUpdatedAtRef: React.MutableRefObject<number | null>;
  autoPilotConfigRef: React.MutableRefObject<any>;
  cacheBudgetManager: { getTelemetry: () => any };
  agentDriftReportsRef: React.MutableRefObject<any[]>;
  lastSuccessfulSignalScanAtRef: React.MutableRefObject<number>;
  signalAutoRefreshTaskId: string;
  shadowControllerTaskId: string;
};

export const useHealthSnapshotRuntime = (args: UseHealthSnapshotRuntimeArgs) => {
  const {
    setupWatchersRef,
    setupSignalsRef,
    nativeChartRef,
    autoPilotStateRef,
    startupReadinessStatus,
    startupPhase,
    openaiReadinessState,
    tradeLockerReadinessState,
    startupBridgeState,
    startupBridgeError,
    tlStartupAutoRestore,
    tlStatus,
    tlQuotesUpdatedAtMs,
    tlQuotesError,
    tlSnapshotUpdatedAtMs,
    tlStreamStatus,
    tlStreamUpdatedAtMs,
    tlStreamError,
    brokerRateLimitSuppressUntilMs,
    tlStatusMeta,
    tlShardStates,
    tlStrategyMatrixRows,
    tlMarketSubscriptions,
    tradeLockerAccountSelectorSnapshot,
    tlShardScheduler,
    agentScorecards,
    runtimeOpsControllerState,
    chartEngine,
    runtimeScheduler,
    getWorkerFallbackStats,
    refreshSlaMonitor,
    brokerCircuitBreaker,
    getDomainReadiness,
    getPersistenceHealthSnapshot,
    executionAuditService,
    livePolicyService,
    panelConnectivityEngine,
    normalizePanelConnectivitySnapshot,
    crossPanelContextEngine,
    outcomeConsistencyEngine,
    buildRankFreshnessState,
    snapshotPerf,
    updateAutoPilotState,
    appendAuditEvent,
    loadFeatureControllers,
    setHealthSnapshot,
    buildHealthSnapshotRef,
    healthSnapshotRef,
    lastHealthAuditAtRef,
    securityAuditSnapshotRef,
    bridgeLifecycleSnapshotRef,
    renderPerfSnapshotRef,
    ciValidationSnapshotRef,
    migrationParityRef,
    academyMergeStatsRef,
    academyDataQualityStatsRef,
    academyLearningGraphTelemetryRef,
    runtimeOpsExternalStatsRef,
    runtimeOpsStreamStatsRef,
    tradeLockerSwitchStatsRef,
    academyCompanionRowsReadRef,
    intentHydrationRowsReadRef,
    incrementalCursorFallbackCountRef,
    ledgerArchiveStatsRef,
    signalIdCollisionPreventedCountRef,
    signalStatusReportStatsRef,
    chatStateRef,
    brokerRateLimitLastAtRef,
    brokerRateLimitLastMessageRef,
    setupWatcherLastEvalAtRef,
    setupWatcherLastSignalAtRef,
    backgroundWatcherLastTickAtRef,
    taskTreeUpdatedAtRef,
    autoPilotConfigRef,
    cacheBudgetManager,
    agentDriftReportsRef,
    lastSuccessfulSignalScanAtRef,
    signalAutoRefreshTaskId,
    shadowControllerTaskId
  } = args;

  const buildHealthSnapshot = React.useCallback((): HealthSnapshot => {
    const now = Date.now();
    const watchers = setupWatchersRef.current || [];
    const enabledCount = watchers.filter((w) => w && w.enabled !== false).length;
    const signalsCount = setupSignalsRef.current?.length ?? 0;
    const meta = nativeChartRef.current?.getMeta ? nativeChartRef.current.getMeta() : null;
    const autoState = autoPilotStateRef.current;
    const startup = startupReadinessStatus;
    const workerFallbackStats = getWorkerFallbackStats();
    const refreshSlaSnapshot = refreshSlaMonitor.getSnapshot(now);
    const refreshSlaByChannel = refreshSlaMonitor.getChannelSnapshots(now);
    const brokerCircuitSnapshot = brokerCircuitBreaker.getSnapshot(now);
    const brokerCircuitBySource = brokerCircuitBreaker.getSourceSnapshot(now).map((entry) => ({
      source: entry.source,
      state: entry.state,
      failureCount: entry.failureCount,
      openedAt: entry.openedAtMs ?? null,
      retryAfterMs: entry.retryAfterMs ?? 0,
      lastError: entry.lastError ?? null
    }));
    const brokerCircuitOpenCount = brokerCircuitSnapshot.entries.filter((entry: any) => entry.open).length;
    const bridgeDomainReadiness = getDomainReadiness();
    const persistenceHealth = getPersistenceHealthSnapshot();
    const executionAuditSnapshot = executionAuditService.getSnapshot();
    const livePolicySnapshot = livePolicyService.getSnapshot();
    const panelConnectivity = normalizePanelConnectivitySnapshot(panelConnectivityEngine.getSnapshot(now), now);
    const crossPanelContextSnapshot = crossPanelContextEngine.getContext();
    const outcomeCursorSnapshot = outcomeConsistencyEngine.getCursor();
    const outcomeConsistencySnapshot = outcomeConsistencyEngine.getConsistencyState(now);
    const panelFreshnessSnapshot = outcomeConsistencyEngine.getPanelFreshness(now);
    const chartFrameCache = chartEngine.getFrameCacheTelemetry();
    const schedulerStats = runtimeScheduler.getStats();
    const signalSchedulerTask = (schedulerStats.tasks || []).find((entry: any) => entry.id === signalAutoRefreshTaskId) || null;
    const shadowSchedulerTask = (schedulerStats.tasks || []).find((entry: any) => entry.id === shadowControllerTaskId) || null;
    const scorecardUpdatedAtMs = (agentScorecards || []).reduce((acc, item) => {
      const ts = Number(item?.updatedAtMs || 0);
      if (Number.isFinite(ts) && ts > acc) return ts;
      return acc;
    }, 0);
    const rankFreshness = buildRankFreshnessState({
      updatedAtMs: scorecardUpdatedAtMs || null,
      persistenceOk: persistenceHealth.overallOk,
      rankDomainOk: persistenceHealth.domains?.rank?.ok ?? null,
      driftReports: agentDriftReportsRef.current || [],
      staleAfterMs: 10 * 60_000
    });
    const channelLastSuccess = refreshSlaByChannel
      .map((entry: any) => Number(entry?.lastSuccessAt || 0))
      .filter((value: number) => Number.isFinite(value) && value > 0);
    const lastSuccessfulScanAtMs = Math.max(
      Number(lastSuccessfulSignalScanAtRef.current || 0),
      channelLastSuccess.length > 0 ? Math.max(...channelLastSuccess) : 0
    ) || null;
    const workerFallbackByDomain = workerFallbackStats.reduce((acc, entry) => {
      const domain = String(entry?.domain || 'unknown').trim() || 'unknown';
      acc[domain] = {
        total: Number(entry?.total || 0),
        fallbackUsed: Number(entry?.fallbackUsed || 0),
        byReason: entry?.fallbackReasons || {}
      };
      return acc;
    }, {} as Record<string, { total: number; fallbackUsed: number; byReason: Record<string, number> }>);
    const tlShardSchedulerTelemetry = tlShardScheduler.getTelemetry();
    return {
      updatedAtMs: now,
      securityAudit: securityAuditSnapshotRef.current
        ? {
            generatedAtMs: Number(securityAuditSnapshotRef.current.generatedAtMs || now),
            isPackaged: securityAuditSnapshotRef.current.isPackaged ?? null,
            csp: securityAuditSnapshotRef.current.csp
              ? { ...securityAuditSnapshotRef.current.csp }
              : null,
            windows: Array.isArray(securityAuditSnapshotRef.current.windows)
              ? securityAuditSnapshotRef.current.windows.map((entry: any) => ({
                  ...(entry || {}),
                  webPreferences: entry?.webPreferences ? { ...entry.webPreferences } : null
                }))
              : null,
            lastError: securityAuditSnapshotRef.current.lastError ?? null
          }
        : null,
      bridgeLifecycle: bridgeLifecycleSnapshotRef.current
        ? {
            ...bridgeLifecycleSnapshotRef.current,
            generatedAtMs: Number(bridgeLifecycleSnapshotRef.current.generatedAtMs || now)
          }
        : null,
      renderPerf: renderPerfSnapshotRef.current
        ? {
            ...renderPerfSnapshotRef.current,
            generatedAtMs: Number(renderPerfSnapshotRef.current.generatedAtMs || now),
            memory: renderPerfSnapshotRef.current.memory
              ? { ...renderPerfSnapshotRef.current.memory }
              : null,
            runtime: renderPerfSnapshotRef.current.runtime
              ? { ...renderPerfSnapshotRef.current.runtime }
              : null
          }
        : null,
      ciValidation: ciValidationSnapshotRef.current
        ? {
            ...ciValidationSnapshotRef.current,
            generatedAtMs: Number(ciValidationSnapshotRef.current.generatedAtMs || now)
          }
        : null,
      migrationParity: {
        ...migrationParityRef.current
      },
      academyMergeAddedCount: Number(academyMergeStatsRef.current.added || 0),
      academyMergeReplacedCount: Number(academyMergeStatsRef.current.replaced || 0),
      academyMergeRetainedCount: Number(academyMergeStatsRef.current.retained || 0),
      academyRichCaseCount: Number(academyDataQualityStatsRef.current.richCaseCount || 0),
      academySparseCaseCount: Number(academyDataQualityStatsRef.current.sparseCaseCount || 0),
      academyLessonValidCount: Number(academyDataQualityStatsRef.current.lessonValidCount || 0),
      academyLessonDroppedCount: Number(academyDataQualityStatsRef.current.lessonDroppedCount || 0),
      academyRepairUpserts: Number(academyDataQualityStatsRef.current.repairUpserts || 0),
      academyLearningGraphNodeCount: Number(academyLearningGraphTelemetryRef.current.nodeCount || 0),
      academyLearningGraphEdgeCount: Number(academyLearningGraphTelemetryRef.current.edgeCount || 0),
      academyLearningGraphBuildMs: Number(academyLearningGraphTelemetryRef.current.buildMs || 0),
      academyLearningGraphConflictCount: Number(academyLearningGraphTelemetryRef.current.conflictCount || 0),
      academyLearningGraphPathRuns: Number(academyLearningGraphTelemetryRef.current.pathRuns || 0),
      academyGraphCaseActions: Number(academyLearningGraphTelemetryRef.current.graphCaseActions || 0),
      academyGraphLifecycleActions: Number(academyLearningGraphTelemetryRef.current.graphLifecycleActions || 0),
      academyGraphExportCount: Number(academyLearningGraphTelemetryRef.current.graphExportCount || 0),
      runtimeOpsStreamDrops: Number(runtimeOpsControllerState?.droppedCount || 0),
      runtimeOpsExternalCommandSubscribeCount: Number(runtimeOpsExternalStatsRef.current.externalCommandSubscribeCount || 0),
      runtimeOpsExternalCommandUnsubscribeCount: Number(runtimeOpsExternalStatsRef.current.externalCommandUnsubscribeCount || 0),
      runtimeOpsExternalCommandReplyFailures: Number(runtimeOpsExternalStatsRef.current.externalCommandReplyFailures || 0),
      runtimeOpsExternalCommandTimeouts: Number(runtimeOpsExternalStatsRef.current.externalCommandTimeouts || 0),
      runtimeOpsRendererErrorForwarded: Number(runtimeOpsExternalStatsRef.current.rendererErrorForwarded || 0),
      runtimeOpsStreamStartAttempts: Number(runtimeOpsStreamStatsRef.current.startAttempts || 0),
      runtimeOpsStreamStarts: Number(runtimeOpsStreamStatsRef.current.starts || 0),
      runtimeOpsStreamReuses: Number(runtimeOpsStreamStatsRef.current.reuses || 0),
      runtimeOpsStreamDisconnects: Number(runtimeOpsStreamStatsRef.current.disconnects || 0),
      runtimeOpsStreamReconnects: Number(runtimeOpsControllerState?.reconnectCount || 0),
      runtimeOpsDecisions: Number((runtimeOpsControllerState?.recentDecisions || []).length || 0),
      runtimeOpsActions: Number(runtimeOpsControllerState?.actionRuns || 0),
      runtimeOpsActionFailures: Number(runtimeOpsControllerState?.actionFailures || 0),
      runtimeOpsGuardrailTrips: Number(runtimeOpsControllerState?.guardrailTrips || 0),
      runtimeOpsMode: runtimeOpsControllerState?.mode || null,
      runtimeOpsLockedAttempts: Number(runtimeOpsControllerState?.lockedAttempts || 0),
      tradeLockerSwitchAttempts: Number(tradeLockerSwitchStatsRef.current.switchAttempts || 0),
      tradeLockerSwitchFailures: Number(tradeLockerSwitchStatsRef.current.switchFailures || 0),
      tradeLockerSwitchReverts: Number(tradeLockerSwitchStatsRef.current.switchReverts || 0),
      tradeLockerSwitchReconnectRetries: Number(tradeLockerSwitchStatsRef.current.switchReconnectRetries || 0),
      tradeLockerSwitchShieldActivations: Number(tradeLockerSwitchStatsRef.current.switchShieldActivations || 0),
      academyCompanionRowsRead: Number(academyCompanionRowsReadRef.current || 0),
      intentHydrationRowsRead: Number(intentHydrationRowsReadRef.current || 0),
      incrementalCursorFallbackCount: Number(incrementalCursorFallbackCountRef.current || 0),
      ledgerArchiveMoves: Number(ledgerArchiveStatsRef.current.moves || 0),
      ledgerArchiveRows: Number(ledgerArchiveStatsRef.current.rows || 0),
      signalIdCollisionPreventedCount: Number(signalIdCollisionPreventedCountRef.current || 0),
      signalStatusReportRuns: Number(signalStatusReportStatsRef.current.runs || 0),
      signalStatusReportErrors: Number(signalStatusReportStatsRef.current.errors || 0),
      signalStatusReportSkipped: Number(signalStatusReportStatsRef.current.skipped || 0),
      signalStatusReportLastAtMs: signalStatusReportStatsRef.current.lastAtMs ?? null,
      chatSignalActiveThreadId: chatStateRef.current?.chatSignalActiveThreadId ?? null,
      chatSignalThreadMessageCounts: { ...(chatStateRef.current?.chatSignalThreadMessageCounts || {}) },
      chatSignalThreadUnreadCounts: { ...(chatStateRef.current?.chatSignalThreadUnreadCounts || {}) },
      chatSignalActionAttempts: Number(chatStateRef.current?.chatSignalActionAttempts || 0),
      chatSignalActionSuccess: Number(chatStateRef.current?.chatSignalActionSuccess || 0),
      chatSignalActionFailure: Number(chatStateRef.current?.chatSignalActionFailure || 0),
      startupCheckedAtMs: startup?.checkedAtMs ?? null,
      startupPhase: startup?.startupPhase ?? startupPhase ?? null,
      startupOpenaiState: openaiReadinessState || null,
      startupTradeLockerState: tradeLockerReadinessState || null,
      startupOpenaiProbeSource: startup?.openaiProbeSource ?? null,
      startupTradeLockerProbeSource: startup?.tradeLockerProbeSource ?? null,
      startupBridgeState: startup?.bridgeState ?? startupBridgeState ?? null,
      startupBridgeError: startup?.bridgeError ?? startupBridgeError ?? null,
      startupProbeSkippedDueToBridge: startup?.probeSkippedDueToBridge ?? null,
      startupProbeErrors: startup?.probeErrors ?? null,
      startupTradeLockerAutoRestoreAttempted: tlStartupAutoRestore?.attempted ?? null,
      startupTradeLockerAutoRestoreSuccess: tlStartupAutoRestore?.success ?? null,
      startupTradeLockerAutoRestoreError: tlStartupAutoRestore?.error ?? null,
      startupTradeLockerAutoRestoreAtMs: tlStartupAutoRestore?.atMs ?? null,
      startupRequestedScopes: Array.isArray(startup?.requestedScopes) ? startup.requestedScopes.slice() : null,
      startupSkippedScopes: Array.isArray(startup?.skippedScopes) ? startup.skippedScopes.slice() : null,
      startupActiveScopes: Array.isArray(startup?.activeScopes) ? startup.activeScopes.slice() : null,
      startupBlockedScopes: Array.isArray(startup?.blockedScopes) ? startup.blockedScopes.slice() : null,
      startupUnknownScopes: Array.isArray(startup?.unknownScopes) ? startup.unknownScopes.slice() : null,
      startupPermissionError: startup?.permissionError ?? null,
      startupDiagnosticWarning: startup?.diagnosticWarning ?? null,
      brokerStatus: tlStatus || null,
      brokerQuotesUpdatedAtMs: tlQuotesUpdatedAtMs ?? null,
      brokerQuotesError: tlQuotesError ?? null,
      brokerSnapshotUpdatedAtMs: tlSnapshotUpdatedAtMs ?? null,
      brokerStreamStatus: tlStreamStatus ?? null,
      brokerStreamUpdatedAtMs: tlStreamUpdatedAtMs ?? null,
      brokerStreamError: tlStreamError ?? null,
      brokerRateLimitLastAtMs: brokerRateLimitLastAtRef.current ?? null,
      brokerRateLimitLastMessage: brokerRateLimitLastMessageRef.current ?? null,
      brokerRateLimitSuppressUntilMs: brokerRateLimitSuppressUntilMs || null,
      tradelockerRequestQueueDepth: tlStatusMeta?.requestQueueDepth ?? null,
      tradelockerRequestQueueMaxDepth: tlStatusMeta?.requestQueueMaxDepth ?? null,
      tradelockerRequestQueueMaxWaitMs: tlStatusMeta?.requestQueueMaxWaitMs ?? null,
      tradelockerRequestInFlight: tlStatusMeta?.requestInFlight ?? null,
      tradelockerRequestConcurrency: tlStatusMeta?.requestConcurrency ?? null,
      tradelockerMinRequestIntervalMs: tlStatusMeta?.minRequestIntervalMs ?? null,
      tradelockerRateLimitTelemetry: tlStatusMeta?.rateLimitTelemetry ?? null,
      tradelockerShards: Array.isArray(tlShardStates)
        ? tlShardStates.map((entry: any) => ({
            accountKey: String(entry?.accountKey || ''),
            queueDepth: Number(entry?.queueDepth || 0),
            rateBudget: Number(entry?.rateBudget || 0),
            circuitState: (entry?.circuitState || 'closed') as any,
            lastError: entry?.lastError ? String(entry.lastError) : null,
            lastReconcileAtMs: Number.isFinite(Number(entry?.lastReconcileAtMs)) ? Number(entry?.lastReconcileAtMs) : null
          }))
        : null,
      tradelockerTenants: Array.isArray(tlStrategyMatrixRows) ? tlStrategyMatrixRows.length : 0,
      tradelockerFanout: Array.isArray(tlMarketSubscriptions)
        ? tlMarketSubscriptions.map((entry: any) => ({
            symbol: String(entry?.symbol || ''),
            subscriberCount: Number(entry?.subscriberCount || 0),
            subscribers: Array.isArray(entry?.subscribers) ? entry.subscribers.slice() : [],
            lastQuoteAtMs: Number.isFinite(Number(entry?.lastQuoteAtMs)) ? Number(entry?.lastQuoteAtMs) : null
          }))
        : null,
      tradelockerAccountSelector: {
        ...(tradeLockerAccountSelectorSnapshot || {
          activeAccountKey: null,
          cardsCount: 0,
          freshCount: 0,
          staleCount: 0,
          unavailableCount: 0,
          refreshQueueDepth: 0,
          lastRefreshAtMs: null,
          lastRefreshError: null
        })
      },
      tradelockerScheduler: {
        shardCount: Number(tlShardSchedulerTelemetry?.shardCount || 0),
        totalQueueDepth: Number(tlShardSchedulerTelemetry?.totalQueueDepth || 0),
        totalRuns: Number(tlShardSchedulerTelemetry?.totalRuns || 0),
        totalFailures: Number(tlShardSchedulerTelemetry?.totalFailures || 0)
      },
      nativeChartSymbol: meta?.symbol || null,
      nativeChartUpdatedAtMs: meta?.updatedAtMs ?? null,
      nativeChartFrames: Array.isArray(meta?.frames) ? meta.frames.length : null,
      setupWatcherEvalAtMs: setupWatcherLastEvalAtRef.current ?? null,
      setupSignalAtMs: setupWatcherLastSignalAtRef.current ?? null,
      setupWatcherCount: watchers.length,
      setupWatcherEnabledCount: enabledCount,
      setupSignalCount: signalsCount,
      backgroundWatcherTickAtMs: backgroundWatcherLastTickAtRef.current ?? null,
      taskTreeUpdatedAtMs: taskTreeUpdatedAtRef.current ?? null,
      autoPilotEnabled: autoPilotConfigRef.current?.enabled ?? null,
      autoPilotMode: autoPilotConfigRef.current?.mode ?? null,
      killSwitch: autoPilotConfigRef.current?.killSwitch ?? null,
      autoPilotState: autoState?.state ?? null,
      autoPilotReason: autoState?.reason ?? null,
      autoPilotReasonMessage: autoState?.message ?? null,
      autoPilotStateUpdatedAtMs: autoState?.updatedAtMs ?? null,
      perf: snapshotPerf(now),
      scheduler: {
        visible: schedulerStats.visible,
        taskCount: schedulerStats.taskCount,
        signalTaskId: signalAutoRefreshTaskId,
        signalTask: signalSchedulerTask
          ? {
              id: signalSchedulerTask.id,
              groupId: signalSchedulerTask.groupId,
              runCount: signalSchedulerTask.runCount,
              errorCount: signalSchedulerTask.errorCount,
              lastRunAtMs: signalSchedulerTask.lastRunAtMs,
              lastDurationMs: signalSchedulerTask.lastDurationMs,
              paused: signalSchedulerTask.paused,
              consecutiveFailures: signalSchedulerTask.consecutiveFailures
            }
          : null,
        shadowTaskId: shadowControllerTaskId,
        shadowTask: shadowSchedulerTask
          ? {
              id: shadowSchedulerTask.id,
              groupId: shadowSchedulerTask.groupId,
              runCount: shadowSchedulerTask.runCount,
              errorCount: shadowSchedulerTask.errorCount,
              lastRunAtMs: shadowSchedulerTask.lastRunAtMs,
              lastDurationMs: shadowSchedulerTask.lastDurationMs,
              paused: shadowSchedulerTask.paused,
              consecutiveFailures: shadowSchedulerTask.consecutiveFailures
            }
          : null
      },
      cacheBudgets: cacheBudgetManager.getTelemetry(),
      chartFrameCache,
      workerFallback: {
        updatedAtMs: now,
        byDomain: workerFallbackByDomain
      },
      signalRefreshSla: {
        updatedAtMs: now,
        tasks: refreshSlaSnapshot
      },
      brokerCircuit: {
        updatedAtMs: brokerCircuitSnapshot.updatedAtMs,
        openCount: brokerCircuitOpenCount,
        entries: brokerCircuitSnapshot.entries
      },
      persistenceHealth,
      refreshSlaByChannel: refreshSlaByChannel as any,
      bridgeDomainReadiness: bridgeDomainReadiness as any,
      brokerCircuitBySource: brokerCircuitBySource as any,
      lastSuccessfulScanAtMs,
      rankFreshness,
      agentDrift: {
        updatedAtMs: now,
        reports: agentDriftReportsRef.current || []
      },
      executionAudit: {
        updatedAtMs: executionAuditSnapshot.updatedAtMs,
        recordsCount: executionAuditSnapshot.records.length,
        mismatches: executionAuditSnapshot.mismatches
      },
      livePolicy: livePolicySnapshot,
      panelConnectivity,
      panelFreshness: panelFreshnessSnapshot,
      outcomeFeed: {
        cursor: outcomeCursorSnapshot,
        consistency: outcomeConsistencySnapshot
      },
      crossPanelContext: crossPanelContextSnapshot
    };
  }, [agentScorecards, autoPilotConfigRef, autoPilotStateRef, backgroundWatcherLastTickAtRef, brokerCircuitBreaker, brokerRateLimitLastAtRef, brokerRateLimitLastMessageRef, brokerRateLimitSuppressUntilMs, buildRankFreshnessState, cacheBudgetManager, chartEngine, chatStateRef, ciValidationSnapshotRef, crossPanelContextEngine, executionAuditService, getDomainReadiness, getPersistenceHealthSnapshot, getWorkerFallbackStats, intentHydrationRowsReadRef, lastSuccessfulSignalScanAtRef, ledgerArchiveStatsRef, livePolicyService, migrationParityRef, nativeChartRef, openaiReadinessState, outcomeConsistencyEngine, panelConnectivityEngine, refreshSlaMonitor, renderPerfSnapshotRef, runtimeOpsControllerState, runtimeOpsExternalStatsRef, runtimeOpsStreamStatsRef, runtimeScheduler, securityAuditSnapshotRef, setHealthSnapshot, setupSignalsRef, setupWatcherLastEvalAtRef, setupWatcherLastSignalAtRef, setupWatchersRef, shadowControllerTaskId, signalAutoRefreshTaskId, signalIdCollisionPreventedCountRef, signalStatusReportStatsRef, snapshotPerf, startupBridgeError, startupBridgeState, startupPhase, startupReadinessStatus, taskTreeUpdatedAtRef, tlMarketSubscriptions, tlQuotesError, tlQuotesUpdatedAtMs, tlShardScheduler, tlShardStates, tlSnapshotUpdatedAtMs, tlStartupAutoRestore, tlStatus, tlStatusMeta, tlStrategyMatrixRows, tlStreamError, tlStreamStatus, tlStreamUpdatedAtMs, tradeLockerAccountSelectorSnapshot, tradeLockerReadinessState, tradeLockerSwitchStatsRef, academyCompanionRowsReadRef, academyDataQualityStatsRef, academyLearningGraphTelemetryRef, academyMergeStatsRef, bridgeLifecycleSnapshotRef, normalizePanelConnectivitySnapshot, incrementalCursorFallbackCountRef]);

  React.useEffect(() => {
    buildHealthSnapshotRef.current = buildHealthSnapshot;
  }, [buildHealthSnapshot, buildHealthSnapshotRef]);

  React.useEffect(() => {
    const update = () => {
      updateAutoPilotState({ emit: true });
      const snapshot = buildHealthSnapshot();
      healthSnapshotRef.current = snapshot;
      setHealthSnapshot(snapshot);
      const now = Date.now();
      if (now - lastHealthAuditAtRef.current >= 60_000) {
        lastHealthAuditAtRef.current = now;
        void appendAuditEvent({
          eventType: 'health_heartbeat',
          payload: snapshot
        });
      }
    };
    let stop: (() => void) | null = null;
    let cancelled = false;
    update();
    void loadFeatureControllers().then((mod) => {
      if (cancelled) return;
      stop = mod.startIntervalControllerSafe({
        intervalMs: 10_000,
        onTick: () => update()
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [appendAuditEvent, buildHealthSnapshot, healthSnapshotRef, lastHealthAuditAtRef, loadFeatureControllers, setHealthSnapshot, updateAutoPilotState]);
};

