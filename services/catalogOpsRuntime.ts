// @ts-nocheck
type ActionResult = { ok: boolean; error?: string; data?: any };

export type runCatalogOpsRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogOpsRuntime(runtimeInput: runCatalogOpsRuntimeInput): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const CustomEvent = (context as any).CustomEvent;
  const Partial = (context as any).Partial;
  const Record = (context as any).Record;
  const SetupLibraryEntry = (context as any).SetupLibraryEntry;
  const SetupWatcher = (context as any).SetupWatcher;
  const TradeProposal = (context as any).TradeProposal;
  const backtestOptimizationCancelRef = (context as any).backtestOptimizationCancelRef;
  const backtesterRef = (context as any).backtesterRef;
  const buildParamGridFromParams = (context as any).buildParamGridFromParams;
  const buildSetupLibraryEntry = (context as any).buildSetupLibraryEntry;
  const buildSetupLibraryTierKey = (context as any).buildSetupLibraryTierKey;
  const chartChatMessages = (context as any).chartChatMessages;
  const clearSetupSignals = (context as any).clearSetupSignals;
  const definition = (context as any).definition;
  const executeBrokerAction = (context as any).executeBrokerAction;
  const executeChartChatBrokerAction = (context as any).executeChartChatBrokerAction;
  const executeChartChatTradeProposal = (context as any).executeChartChatTradeProposal;
  const executeTradeProposal = (context as any).executeTradeProposal;
  const executeTradeProposalRef = (context as any).executeTradeProposalRef;
  const formatExecutionSummary = (context as any).formatExecutionSummary;
  const formatValidationSummary = (context as any).formatValidationSummary;
  const loadBacktestCatalogRuntimeModule = (context as any).loadBacktestCatalogRuntimeModule;
  const loadBacktestOptimizationHistory = (context as any).loadBacktestOptimizationHistory;
  const loadBacktesterActionRuntimeModule = (context as any).loadBacktesterActionRuntimeModule;
  const matchesSetupWatcher = (context as any).matchesSetupWatcher;
  const messages = (context as any).messages;
  const normalizeExecutionPresetKey = (context as any).normalizeExecutionPresetKey;
  const normalizeSetupMode = (context as any).normalizeSetupMode;
  const normalizeSetupStrategy = (context as any).normalizeSetupStrategy;
  const normalizeSetupTimeframe = (context as any).normalizeSetupTimeframe;
  const normalizeSymbolKey = (context as any).normalizeSymbolKey;
  const recommendedActionFlowsState = (context as any).recommendedActionFlowsState;
  const refreshSetupLibrary = (context as any).refreshSetupLibrary;
  const rejectBrokerAction = (context as any).rejectBrokerAction;
  const rejectChartChatBrokerAction = (context as any).rejectChartChatBrokerAction;
  const rejectChartChatTradeProposal = (context as any).rejectChartChatTradeProposal;
  const rejectTradeProposal = (context as any).rejectTradeProposal;
  const resolveActionFlowByIntent = (context as any).resolveActionFlowByIntent;
  const resolveExecutionConfig = (context as any).resolveExecutionConfig;
  const runBacktestOptimization = (context as any).runBacktestOptimization;
  const runBacktestOptimizationWorker = (context as any).runBacktestOptimizationWorker;
  const runRecommendedActionFlowRef = (context as any).runRecommendedActionFlowRef;
  const setBacktesterMounted = (context as any).setBacktesterMounted;
  const setupWatchersRef = (context as any).setupWatchersRef;
  const shouldReplaceLibraryEntry = (context as any).shouldReplaceLibraryEntry;
  const sidebarControlRef = (context as any).sidebarControlRef;
  const updateSetupWatcher = (context as any).updateSetupWatcher;
  const validateTradeProposalBasic = (context as any).validateTradeProposalBasic;

    if (actionId === 'ledger.stats') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.stats) return { ok: false, error: 'Ledger stats unavailable.' };
      const res = await ledger.stats();
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to fetch ledger stats.' };
      return { ok: true, data: res ?? null };
    }

    if (actionId === 'dashboard.session.select') {
      const detail = {
        symbol: payload.symbol != null ? String(payload.symbol) : undefined,
        timeframe: payload.timeframe != null ? String(payload.timeframe) : undefined,
        sessionId: payload.sessionId != null ? String(payload.sessionId) : undefined,
        sessionWindow: Number.isFinite(Number(payload.sessionWindow)) ? Number(payload.sessionWindow) : undefined,
        smooth: payload.smooth != null ? !!payload.smooth : undefined
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_dashboard_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update dashboard selection.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'dashboard.window.set') {
      const sessionWindow = Number(payload.sessionWindow ?? payload.window ?? payload.value);
      if (!Number.isFinite(sessionWindow)) return { ok: false, error: 'Session window is required.' };
      try {
        window.dispatchEvent(new CustomEvent('glass_dashboard_filters', { detail: { sessionWindow } }));
      } catch {
        return { ok: false, error: 'Unable to update dashboard window.' };
      }
      return { ok: true, data: { sessionWindow } };
    }

    if (actionId === 'dashboard.smoothing.set') {
      const smooth = payload.smooth !== undefined ? !!payload.smooth : payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : false;
      try {
        window.dispatchEvent(new CustomEvent('glass_dashboard_filters', { detail: { smooth } }));
      } catch {
        return { ok: false, error: 'Unable to update dashboard smoothing.' };
      }
      return { ok: true, data: { smooth } };
    }

    if (actionId === 'dashboard.compare.set') {
      const compare = payload.compare !== undefined ? !!payload.compare : payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : false;
      try {
        window.dispatchEvent(new CustomEvent('glass_dashboard_filters', { detail: { compare } }));
      } catch {
        return { ok: false, error: 'Unable to update dashboard compare.' };
      }
      return { ok: true, data: { compare } };
    }

    if (actionId === 'dashboard.refresh') {
      try {
        window.dispatchEvent(new CustomEvent('glass_dashboard_refresh', { detail: { atMs: Date.now() } }));
      } catch {
        return { ok: false, error: 'Unable to refresh dashboard.' };
      }
      return { ok: true, data: { refreshed: true } };
    }

    if (actionId === 'dashboard.action.apply' || actionId === 'dashboard.action.promote' || actionId === 'dashboard.action.save_preset') {
      const detail = payload && typeof payload === 'object' ? payload : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_dashboard_action', { detail: { ...detail, action: actionId } }));
      } catch {
        return { ok: false, error: 'Unable to run dashboard action.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'dashboard.autopilot.target') {
      const detail = payload && typeof payload === 'object' ? payload : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_dashboard_action', { detail: { ...detail, action: actionId } }));
      } catch {
        return { ok: false, error: 'Unable to start targeted autopilot.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'mt5.connect' || actionId === 'mt5.disconnect' || actionId === 'mt5.ws_url.set' || actionId === 'mt5.symbols.set' || actionId === 'mt5.symbols.apply' || actionId === 'mt5.symbols.search' || actionId === 'mt5.log.open') {
      const detail: Record<string, any> = {};
      if (actionId === 'mt5.connect') detail.connect = true;
      if (actionId === 'mt5.disconnect') detail.disconnect = true;
      if (actionId === 'mt5.log.open') detail.openLog = true;
      if (actionId === 'mt5.ws_url.set') detail.wsUrl = payload.wsUrl ?? payload.url ?? payload.value;
      if (actionId === 'mt5.symbols.set') detail.symbolsText = payload.symbolsText ?? payload.symbols ?? payload.value;
      if (actionId === 'mt5.symbols.apply') detail.apply = true;
      if (actionId === 'mt5.symbols.search') detail.search = payload.query ?? payload.search ?? payload.value;
      try {
        window.dispatchEvent(new CustomEvent('glass_mt5_controls', { detail }));
      } catch {
        return { ok: false, error: 'Unable to control MT5 panel.' };
      }
      return { ok: true, data: { updated: true } };
    }

      if (actionId === 'trade.propose') {
        const symbol = String(payload.symbol || input?.symbol || '').trim();
      const actionRaw = String(payload.action || payload.side || '').toUpperCase();
      const actionSide = actionRaw === 'SELL' ? 'SELL' : 'BUY';
      const entryPrice = Number(payload.entryPrice);
      const stopLoss = Number(payload.stopLoss);
      const takeProfit = Number(payload.takeProfit);
      const proposal: TradeProposal = {
        symbol,
        action: actionSide,
        entryPrice,
        stopLoss,
        takeProfit,
        riskRewardRatio: payload.riskRewardRatio,
        status: 'PENDING',
        agentId: payload.agentId || undefined,
        reason: payload.reason || definition?.summary || undefined,
        setup: payload.setup || undefined
      };
      if (!Number.isFinite(proposal.entryPrice) || !Number.isFinite(proposal.stopLoss) || !Number.isFinite(proposal.takeProfit)) {
        return { ok: false, error: 'Trade proposal missing price levels.' };
      }
      if (!Number.isFinite(Number(proposal.riskRewardRatio))) {
        const risk = Math.abs(proposal.entryPrice - proposal.stopLoss);
        const reward = Math.abs(proposal.takeProfit - proposal.entryPrice);
        proposal.riskRewardRatio = risk > 0 ? Number((reward / risk).toFixed(2)) : undefined;
      }
      const validation = validateTradeProposalBasic(proposal);
      if (validation) return { ok: false, error: validation };
      const exec = executeTradeProposalRef.current;
      if (!exec) return { ok: false, error: 'Trade proposal executor unavailable.' };
      const messageId = `action_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
        const source = payload.source === 'manual' || payload.source === 'autopilot' ? payload.source : 'autopilot';
        exec(messageId, proposal, source);
        return { ok: true, data: { messageId } };
      }

      if (actionId === 'trade.execute' || actionId === 'trade.reject') {
        const messageId = String(payload.messageId || payload.id || '').trim();
        const sourceHint = String(payload.source || '').trim().toLowerCase();
        const primaryList = sourceHint === 'chart' ? chartChatMessages : sourceHint === 'chat' ? messages : null;
        const combined = primaryList || [...messages, ...chartChatMessages];
        let targetMessage: any | null = null;
        if (messageId) {
          targetMessage = combined.find((msg) => msg.id === messageId) || null;
        } else {
          for (let i = combined.length - 1; i >= 0; i -= 1) {
            const msg = combined[i];
            if (msg?.tradeProposal && msg.tradeProposal.status === 'PENDING') {
              targetMessage = msg;
              break;
            }
          }
        }
        if (!targetMessage?.tradeProposal) return { ok: false, error: 'No pending trade proposal found.' };
        const isChart = chartChatMessages.some((msg) => msg.id === targetMessage?.id);
        if (actionId === 'trade.execute') {
          const exec = isChart ? executeChartChatTradeProposal : executeTradeProposal;
          exec(targetMessage.id, targetMessage.tradeProposal, 'manual');
          return { ok: true, data: { messageId: targetMessage.id } };
        }
        const reject = isChart ? rejectChartChatTradeProposal : rejectTradeProposal;
        reject(targetMessage.id, payload.reason ? String(payload.reason) : 'Rejected by action');
        return { ok: true, data: { messageId: targetMessage.id } };
      }

      if (actionId === 'broker.action.execute' || actionId === 'broker.action.reject') {
        const messageId = String(payload.messageId || payload.id || '').trim();
        const sourceHint = String(payload.source || '').trim().toLowerCase();
        const primaryList = sourceHint === 'chart' ? chartChatMessages : sourceHint === 'chat' ? messages : null;
        const combined = primaryList || [...messages, ...chartChatMessages];
        let targetMessage: any | null = null;
        if (messageId) {
          targetMessage = combined.find((msg) => msg.id === messageId) || null;
        } else {
          for (let i = combined.length - 1; i >= 0; i -= 1) {
            const msg = combined[i];
            if (msg?.brokerAction && msg.brokerAction.status === 'PENDING') {
              targetMessage = msg;
              break;
            }
          }
        }
        if (!targetMessage?.brokerAction) return { ok: false, error: 'No pending broker action found.' };
        const isChart = chartChatMessages.some((msg) => msg.id === targetMessage?.id);
        if (actionId === 'broker.action.execute') {
          const exec = isChart ? executeChartChatBrokerAction : executeBrokerAction;
          exec(targetMessage.id, targetMessage.brokerAction);
          return { ok: true, data: { messageId: targetMessage.id } };
        }
        const reject = isChart ? rejectChartChatBrokerAction : rejectBrokerAction;
        reject(targetMessage.id, payload.reason ? String(payload.reason) : 'Rejected by action');
        return { ok: true, data: { messageId: targetMessage.id } };
      }

    if (actionId === 'setup.library.delete') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.deleteAgentMemory) return { ok: false, error: 'Setup library unavailable.' };
      const entryKey = String(
        payload.entryKey || payload.libraryKey || payload.configKey || payload.key || ''
      ).trim();
      const id = String(payload.id || payload.memoryId || '').trim();
      if (!entryKey && !id) return { ok: false, error: 'Library key or id is required.' };

      let deleteKey = entryKey;
      let deleteId = id;
      let resolvedEntryKey: string | null = null;

      if (entryKey && ledger?.listAgentMemory) {
        const symbol = String(payload.symbol || '').trim();
        const timeframe = String(payload.timeframe || '').trim();
        const strategy = String(payload.strategy || '').trim();
        try {
          const res = await ledger.listAgentMemory({
            limit: 500,
            kind: 'setup_library',
            symbol: symbol || undefined,
            timeframe: timeframe || undefined,
            tags: strategy ? [strategy] : undefined
          });
          if (res?.ok && Array.isArray(res.memories)) {
            const match = res.memories.find((memory: any) => {
              const memoryKey = String(memory?.key || '').trim();
              const payloadKey = String(memory?.payload?.key || '').trim();
              const configKey = String(memory?.payload?.configKey || '').trim();
              return memoryKey === entryKey || payloadKey === entryKey || configKey === entryKey;
            });
            if (match?.key) deleteKey = String(match.key);
            if (match?.id) deleteId = String(match.id);
            if (match?.payload?.key) resolvedEntryKey = String(match.payload.key);
          }
        } catch {
          // ignore lookup failures
        }
      }

      const res = await ledger.deleteAgentMemory({ key: deleteKey || undefined, id: deleteId || undefined });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to delete setup library entry.' };
      void refreshSetupLibrary();
      return {
        ok: true,
        data: { deleted: true, key: deleteKey || null, id: deleteId || null, entryKey: resolvedEntryKey || entryKey || null }
      };
    }

    if (actionId === 'setups.filters.set') {
      const detail = {
        symbol: payload.symbol != null ? String(payload.symbol) : undefined,
        timeframe: payload.timeframe != null ? String(payload.timeframe) : undefined,
        strategy: payload.strategy != null ? String(payload.strategy) : undefined,
        readyOnly: payload.readyOnly != null ? !!payload.readyOnly : undefined,
        search: payload.search != null ? String(payload.search) : undefined,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update Setups filters.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.library.filters.set') {
      const detail = {
        search: payload.search != null ? String(payload.search) : undefined,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_library_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update Setup library filters.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'setups.compare.toggle') {
      const detail = {
        key: payload.key ?? payload.entryKey ?? payload.libraryKey ?? null,
        keys: Array.isArray(payload.keys) ? payload.keys : null,
        mode: payload.mode ?? null,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_compare', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update setup compare selection.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'setups.playbook.draft.set') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_playbook_draft', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update setup playbook draft.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.playbook.save') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_playbook_save', { detail }));
      } catch {
        return { ok: false, error: 'Unable to save setup playbook.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.playbook.reset') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_playbook_reset', { detail }));
      } catch {
        return { ok: false, error: 'Unable to reset setup playbook.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.playbook.create.toggle') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_playbook_create_toggle', { detail }));
      } catch {
        return { ok: false, error: 'Unable to toggle setup playbook creator.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.playbook.editor.toggle') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_playbook_editor', { detail }));
      } catch {
        return { ok: false, error: 'Unable to toggle setup playbook editor.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.apply_to_backtester') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_apply_backtester', { detail }));
      } catch {
        return { ok: false, error: 'Unable to apply setup to Backtester.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.replay.run') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_replay_run', { detail }));
      } catch {
        return { ok: false, error: 'Unable to replay setup watcher.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.debug.filters.set') {
      const detail = {
        symbol: payload.symbol != null ? String(payload.symbol) : undefined,
        timeframe: payload.timeframe != null ? String(payload.timeframe) : undefined,
        profileId: payload.profileId != null ? String(payload.profileId) : undefined,
        signalId: payload.signalId != null ? String(payload.signalId) : undefined,
        limit: payload.limit != null ? Number(payload.limit) : undefined,
        clear: payload.clear === true
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_debug_filters', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update setup debug filters.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'setups.create.form.set') {
      const detail = payload && typeof payload === 'object' ? { ...payload } : {};
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_create_form', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update setup create form.' };
      }
      return { ok: true, data: { updated: true } };
    }

    if (actionId === 'setups.signals.clear') {
      if (!payload.confirmed) return { ok: false, error: 'Confirmation required.' };
      clearSetupSignals();
      return { ok: true, data: { cleared: true } };
    }

    if (actionId === 'setups.replay.range.set') {
      const detail = {
        rangeDays: payload.rangeDays ?? payload.days ?? payload.value ?? null
      };
      try {
        window.dispatchEvent(new CustomEvent('glass_setups_replay_range', { detail }));
      } catch {
        return { ok: false, error: 'Unable to update setup replay range.' };
      }
      return { ok: true, data: detail };
    }

    if (actionId === 'watcher.bulk.enable' || actionId === 'watcher.bulk.disable' || actionId === 'watcher.bulk.mode') {
      const watchers = setupWatchersRef.current || [];
      const ids = Array.isArray(payload.watcherIds || payload.ids)
        ? (payload.watcherIds || payload.ids).map((id: any) => String(id || '').trim()).filter(Boolean)
        : [];
      const filters = ids.length > 0
        ? null
        : {
            symbol: payload.symbol || undefined,
            timeframe: payload.timeframe || undefined,
            strategy: payload.strategy || undefined,
            mode: payload.mode || undefined,
            enabled: payload.enabled
          };
      const targets = ids.length > 0
        ? watchers.filter((watcher) => ids.includes(String(watcher?.id || '')))
        : watchers.filter((watcher) => matchesSetupWatcher(watcher, filters || {}));
      if (targets.length === 0) return { ok: false, error: 'No setup watchers matched.' };
      const patch: Partial<SetupWatcher> = {};
      if (actionId === 'watcher.bulk.enable') patch.enabled = true;
      if (actionId === 'watcher.bulk.disable') patch.enabled = false;
      if (actionId === 'watcher.bulk.mode') {
        const nextMode = normalizeSetupMode(payload.mode);
        if (!nextMode) return { ok: false, error: 'Watcher mode is required.' };
        patch.mode = nextMode as SetupWatcher['mode'];
      }
      targets.forEach((watcher) => updateSetupWatcher(watcher.id, patch));
      return { ok: true, data: { updated: targets.length, ids: targets.map((w) => w.id) } };
    }

    if (actionId === 'setup.library.save' || actionId === 'setup.library.update') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.upsertAgentMemory) return { ok: false, error: 'Setup library unavailable.' };
      const rawSymbol = String(payload.symbol || input?.symbol || '').trim();
      const rawTimeframe = String(payload.timeframe || input?.timeframe || '').trim();
      const rawStrategy = String(payload.strategy || '').trim().toUpperCase();
      if (!rawSymbol || !rawTimeframe || !rawStrategy) {
        return { ok: false, error: 'Symbol, timeframe, and strategy are required.' };
      }
      const params = payload.params && typeof payload.params === 'object' ? payload.params : null;
      if (!params) return { ok: false, error: 'Setup params are required.' };
      const stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : {};
      const performance = payload.performance && typeof payload.performance === 'object' ? payload.performance : {};
      const timeFilter = payload.timeFilter && typeof payload.timeFilter === 'object' ? payload.timeFilter : null;
      const minTrades = Number.isFinite(Number(payload.minTrades)) ? Math.max(1, Math.floor(Number(payload.minTrades))) : 20;
      const stabilityScore = Number.isFinite(Number(payload.stabilityScore)) ? Number(payload.stabilityScore) : null;
      const rangeDays = Number.isFinite(Number(payload.rangeDays)) ? Math.max(1, Math.floor(Number(payload.rangeDays))) : null;
      const safeSymbol = normalizeSymbolKey(rawSymbol);
      const safeTf = String(rawTimeframe).trim();
      const safeStrategy = rawStrategy as any;
      const entryKeyOverride = String(payload.entryKey || payload.libraryKey || '').trim();
      const memoryKeyOverride = String(payload.memoryKey || payload.storageKey || '').trim();
      const built = buildSetupLibraryEntry({
        symbol: safeSymbol,
        timeframe: safeTf,
        strategy: safeStrategy,
        params,
        stats: {
          total: stats.total ?? stats.trades ?? null,
          winRate: stats.winRate ?? null,
          expectancy: stats.expectancy ?? null,
          profitFactor: stats.profitFactor ?? null
        },
        performance: {
          netR: performance.netR ?? null,
          maxDrawdown: performance.maxDrawdown ?? performance.dd ?? null
        },
        runId: payload.runId ?? null,
        rangeDays,
        timeFilter,
        stabilityScore,
        source: payload.source || 'manual',
        minTrades
      });

      const tierKey = buildSetupLibraryTierKey(
        built.entry.symbol,
        built.entry.timeframe,
        built.entry.strategy,
        built.entry.tier
      );
      let ledgerKey = memoryKeyOverride || entryKeyOverride || tierKey;
      let existing: SetupLibraryEntry | null = null;

      if (entryKeyOverride && ledger?.listAgentMemory) {
        try {
          const res = await ledger.listAgentMemory({
            limit: 200,
            kind: 'setup_library',
            symbol: built.entry.symbol,
            timeframe: built.entry.timeframe,
            tags: [built.entry.strategy]
          });
          if (res?.ok && Array.isArray(res.memories)) {
            const match = res.memories.find((memory: any) => {
              const payloadKey = String(memory?.payload?.key || '').trim();
              const memoryKey = String(memory?.key || '').trim();
              return payloadKey === entryKeyOverride || memoryKey === entryKeyOverride;
            });
            if (match?.key) ledgerKey = String(match.key);
            if (match?.payload) existing = match.payload as SetupLibraryEntry;
          }
        } catch {
          // ignore lookup failures
        }
      }

      if (!existing && ledger?.getAgentMemory) {
        try {
          const res = await ledger.getAgentMemory({ key: ledgerKey, touch: true });
          if (res?.ok && res.memory?.payload) existing = res.memory.payload as SetupLibraryEntry;
        } catch {
          // ignore
        }
      }
      const now = Date.now();
      const entry: SetupLibraryEntry = {
        ...built.entry,
        key: entryKeyOverride || built.entry.key,
        configKey: entryKeyOverride || built.entry.key,
        createdAtMs: existing?.createdAtMs ?? now,
        updatedAtMs: now
      };
      const force = payload.force === true || actionId === 'setup.library.update';
      if (!force && !shouldReplaceLibraryEntry(existing, entry)) {
        return { ok: true, data: { skipped: true, key: entry.key, reason: 'existing_stronger' } };
      }
      const summaryLine = `${entry.symbol} ${entry.timeframe} ${entry.strategy}\n${built.summary} | Score ${entry.score}`;
      const tags = [
        entry.symbol,
        entry.timeframe,
        entry.strategy,
        'setup',
        'library',
        `tier:${entry.tier}`,
        entry.winRateTier,
        ...(Array.isArray(payload.tags) ? payload.tags : [])
      ].filter(Boolean);
      try {
        await ledger.upsertAgentMemory({
          key: ledgerKey,
          familyKey: `setup_library:${entry.symbol}:${entry.timeframe}:${entry.strategy}`,
          scope: 'shared',
          category: 'setup',
          subcategory: 'library',
          kind: 'setup_library',
          symbol: entry.symbol,
          timeframe: entry.timeframe,
          summary: summaryLine,
          payload: entry,
          source: 'manual',
          tags
        });
      } catch {
        return { ok: false, error: 'Failed to save setup library entry.' };
      }
      void refreshSetupLibrary();
      return { ok: true, data: { key: entry.key, symbol: entry.symbol, timeframe: entry.timeframe, strategy: entry.strategy } };
    }

    if (actionId === 'setup.library.export') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.listAgentMemory) return { ok: false, error: 'Setup library unavailable.' };
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 500;
      const symbol = payload.symbol ? normalizeSymbolKey(payload.symbol) : undefined;
      const timeframe = payload.timeframe ? normalizeSetupTimeframe(payload.timeframe) : undefined;
      const strategy = payload.strategy ? normalizeSetupStrategy(payload.strategy) : '';
      const tags = Array.isArray(payload.tags) ? payload.tags : strategy ? [strategy] : undefined;
      const res = await ledger.listAgentMemory({ limit, kind: 'setup_library', symbol, timeframe, tags });
      if (!res?.ok) return { ok: false, error: res?.error || 'Failed to list setup library.' };
      const memories = Array.isArray(res.memories) ? res.memories : [];
      const exportPayload = JSON.stringify(
        {
          schemaVersion: 1,
          exportedAtMs: Date.now(),
          entries: memories
        },
        null,
        2
      );
      const mode = String(payload.mode || 'return').trim().toLowerCase();
      if (mode === 'return') return { ok: true, data: { payload: exportPayload } };
      if (mode === 'clipboard') {
        try {
          const fn = window.glass?.clipboard?.writeText;
          if (fn) {
            const resCopy = fn(exportPayload);
            if (resCopy && typeof resCopy.then === 'function') await resCopy;
            return { ok: true, data: { copied: true } };
          }
        } catch {
          // ignore
        }
        return { ok: false, error: 'Clipboard unavailable.' };
      }
      const saver = window.glass?.saveUserFile;
      if (!saver) return { ok: false, error: 'Save unavailable.' };
      const resSave = await saver({
        data: exportPayload,
        mimeType: 'application/json',
        subdir: 'setup-library',
        prefix: 'setup_library'
      });
      if (!resSave?.ok) return { ok: false, error: resSave?.error || 'Export failed.' };
      return { ok: true, data: { filename: resSave.filename || null } };
    }

    if (actionId === 'setup.library.import') {
      const ledger = window.glass?.tradeLedger;
      if (!ledger?.upsertAgentMemory) return { ok: false, error: 'Setup library unavailable.' };
      const rawText = String(payload.text || payload.json || payload.payload || '').trim();
      if (!rawText) return { ok: false, error: 'Setup library JSON is required.' };
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return { ok: false, error: 'Invalid JSON.' };
      }
      const rawEntries = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.entries)
          ? parsed.entries
          : Array.isArray(parsed?.memories)
            ? parsed.memories
            : [];
      if (rawEntries.length === 0) return { ok: false, error: 'No setup library entries found.' };
      const force = payload.force === true;
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      for (const raw of rawEntries) {
        const payloadEntry =
          raw?.payload?.symbol && raw?.payload?.timeframe && raw?.payload?.strategy
            ? raw.payload
            : raw?.entry?.symbol && raw?.entry?.timeframe && raw?.entry?.strategy
              ? raw.entry
              : raw;
        const symbol = String(payloadEntry?.symbol || '').trim();
        const timeframe = String(payloadEntry?.timeframe || '').trim();
        const strategy = normalizeSetupStrategy(payloadEntry?.strategy || '');
        const params = payloadEntry?.params && typeof payloadEntry.params === 'object' ? payloadEntry.params : null;
        if (!symbol || !timeframe || !strategy || !params) {
          failed += 1;
          continue;
        }
        const stats = payloadEntry?.stats && typeof payloadEntry.stats === 'object' ? payloadEntry.stats : {};
        const performance = payloadEntry?.performance && typeof payloadEntry.performance === 'object' ? payloadEntry.performance : {};
        const timeFilter = payloadEntry?.timeFilter && typeof payloadEntry.timeFilter === 'object' ? payloadEntry.timeFilter : null;
        const rangeDays = Number.isFinite(Number(payloadEntry?.rangeDays)) ? Number(payloadEntry.rangeDays) : null;
        const stabilityScore = Number.isFinite(Number(payloadEntry?.stabilityScore)) ? Number(payloadEntry.stabilityScore) : null;
        const built = buildSetupLibraryEntry({
          symbol: normalizeSymbolKey(symbol),
          timeframe: normalizeSetupTimeframe(timeframe) || timeframe,
          strategy: strategy as any,
          params,
          stats: {
            total: stats.total ?? stats.trades ?? null,
            winRate: stats.winRate ?? null,
            expectancy: stats.expectancy ?? null,
            profitFactor: stats.profitFactor ?? null
          },
          performance: {
            netR: performance.netR ?? null,
            maxDrawdown: performance.maxDrawdown ?? performance.dd ?? null
          },
          runId: payloadEntry?.runId ?? null,
          rangeDays,
          timeFilter,
          stabilityScore,
          source: payloadEntry?.source || 'import',
          minTrades: payloadEntry?.minTrades ?? 20
        });

        const entryKey = String(payloadEntry?.key || payloadEntry?.configKey || built.entry.key || '').trim();
        const memoryKey = entryKey || built.entry.key;
        let existing: SetupLibraryEntry | null = null;
        try {
          const res = await ledger.getAgentMemory?.({ key: memoryKey, touch: true });
          if (res?.ok && res.memory?.payload) existing = res.memory.payload as SetupLibraryEntry;
        } catch {
          // ignore
        }

        const now = Date.now();
        const entry: SetupLibraryEntry = {
          ...built.entry,
          key: entryKey || built.entry.key,
          configKey: entryKey || built.entry.key,
          createdAtMs: Number.isFinite(Number(payloadEntry?.createdAtMs))
            ? Number(payloadEntry.createdAtMs)
            : existing?.createdAtMs ?? now,
          updatedAtMs: now
        };

        if (!force && !shouldReplaceLibraryEntry(existing, entry)) {
          skipped += 1;
          continue;
        }
        const summaryLine = `${entry.symbol} ${entry.timeframe} ${entry.strategy}\n${built.summary} | Score ${entry.score}`;
        const tags = [
          entry.symbol,
          entry.timeframe,
          entry.strategy,
          'setup',
          'library',
          `tier:${entry.tier}`,
          entry.winRateTier,
          ...(Array.isArray(raw?.tags) ? raw.tags : [])
        ].filter(Boolean);
        try {
          await ledger.upsertAgentMemory({
            key: memoryKey,
            familyKey: `setup_library:${entry.symbol}:${entry.timeframe}:${entry.strategy}`,
            scope: 'shared',
            category: 'setup',
            subcategory: 'library',
            kind: 'setup_library',
            symbol: entry.symbol,
            timeframe: entry.timeframe,
            summary: summaryLine,
            payload: entry,
            source: 'import',
            tags
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      void refreshSetupLibrary();
      return { ok: true, data: { imported, skipped, failed } };
    }

    {
      const backtestCatalogRuntime = await loadBacktestCatalogRuntimeModule();
      const runtimeRes = await backtestCatalogRuntime.runBacktestCatalogRuntime({
        actionId,
        payload,
        requestContext: {
          symbol: input?.symbol,
          timeframe: input?.timeframe,
          strategy: input?.strategy,
          mode: input?.mode,
          source: input?.source
        },
        backtester: backtesterRef.current,
        backtestOptimizationCancelRef,
        openBacktesterPanel: () => {
          const sidebar = sidebarControlRef.current;
          if (sidebar?.openSidebarMode) sidebar.openSidebarMode('backtester');
          setBacktesterMounted(true);
        },
        buildParamGridFromParams,
        normalizeExecutionPresetKey,
        resolveExecutionConfig,
        formatExecutionSummary,
        formatValidationSummary,
        loadBacktestOptimizationHistory,
        runBacktestOptimizationWorker,
        runBacktestOptimization,
        normalizeSymbolKey,
        normalizeSetupTimeframe,
        normalizeSetupStrategy
      });
      if (runtimeRes.handled) return runtimeRes.result || { ok: false, error: 'Backtest action failed.' };
    }

    {
      const backtesterActionRuntime = await loadBacktesterActionRuntimeModule();
      const runtimeRes = await backtesterActionRuntime.runBacktesterActionRuntime({
        actionId,
        payload,
        backtester: backtesterRef.current,
        openBacktesterPanel: () => {
          const sidebar = sidebarControlRef.current;
          if (sidebar?.openSidebarMode) sidebar.openSidebarMode('backtester');
          setBacktesterMounted(true);
        }
      });
      if (runtimeRes.handled) return runtimeRes.result || { ok: false, error: 'Backtester action failed.' };
    }

    if (actionId === 'action_flow.list') {
      const limit = Number.isFinite(Number(payload.limit))
        ? Math.max(1, Math.min(50, Math.floor(Number(payload.limit))))
        : 12;
      const flows = Array.isArray(recommendedActionFlowsState)
        ? recommendedActionFlowsState.slice(0, limit)
        : [];
      return { ok: true, data: { flows, count: flows.length } };
    }

    if (actionId === 'action_flow.run') {
      const intentKey = payload.intentKey || payload.intent || payload.flowId || null;
      const sequence = payload.sequence || null;
      const index = payload.index;
      const flow = resolveActionFlowByIntent({ intentKey, sequence, index });
      if (!flow) return { ok: false, error: 'No matching action flow found.' };
      const flowRunner = runRecommendedActionFlowRef.current;
      if (!flowRunner) return { ok: false, error: 'Action flow runner unavailable.' };
      const res = flowRunner(flow, {
        symbol: payload.symbol || flow.symbol || null,
        timeframe: payload.timeframe || flow.timeframe || null,
        strategy: payload.strategy || null,
        mode: payload.mode || null,
        source: payload.source || 'action_flow.run'
      });
      if (!res.ok) return { ok: false, error: res.error || 'Failed to start action flow.' };
      return { ok: true, data: { runId: res.runId || null, queued: res.queued ?? null, intentKey: flow.intentKey } };
    }



  return { handled: false };
}
