type ActionResult = { ok: boolean; error?: string; data?: any };

export type runCatalogChartRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogChartRuntime(
  runtimeInput: runCatalogChartRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const {
  chartEngine,
  chartWatchEnabled,
  setChartWatchEnabled,
  setChartWatchMode,
  snoozeChartWatch,
  clearChartWatchSnooze,
  setChartWatchLeadAgentId,
  nativeChartRef,
  persistChartSnapshotMemory,
  isChartFullscreen,
  setIsChartFullscreen,
  chartSessions,
  chatChannel,
  chartHandlers,
  setSessionBias,
  updateSymbolScope,
  normalizeScopeTimeframes,
  clearSymbolScope,
  activeTabIdRef,
  tabsRef
} = context as any;
  
    if (actionId === 'chart.watch.start') {
      const symbol = String(payload.symbol || input?.symbol || '').trim();
      if (!symbol) return { ok: false, error: 'Chart watch requires symbol.' };
      const framesRaw = payload.timeframes || payload.frames || payload.timeframe || [];
      const frames = Array.isArray(framesRaw) ? framesRaw : [framesRaw];
      const timeframes = frames.map((tf) => String(tf || '').trim()).filter(Boolean);
      if (timeframes.length === 0) return { ok: false, error: 'Chart watch requires timeframes.' };
      const watches = [];
      for (const tf of timeframes) {
        const watchId = `playbook:${symbol}:${tf}`;
        const watch = await chartEngine.addWatch({
          watchId,
          symbol,
          timeframe: tf,
          enabled: true,
          source: 'playbook'
        });
        if (watch) watches.push(watch);
      }
      return { ok: true, data: { watches } };
    }

    if (actionId === 'chart.watch.stop') {
      const symbol = String(payload.symbol || input?.symbol || '').trim();
      const watchIdsRaw = payload.watchIds || payload.watchId || [];
      const ids = Array.isArray(watchIdsRaw) ? watchIdsRaw : [watchIdsRaw];
      const removed: string[] = [];
      if (ids.length > 0) {
        for (const rawId of ids) {
          const id = String(rawId || '').trim();
          if (!id) continue;
          const ok = await chartEngine.removeWatch(id);
          if (ok) removed.push(id);
        }
      } else if (symbol) {
        const framesRaw = payload.timeframes || payload.frames || payload.timeframe || [];
        const frames = Array.isArray(framesRaw) ? framesRaw : [framesRaw];
        const timeframes = frames.map((tf) => String(tf || '').trim()).filter(Boolean);
        for (const tf of timeframes) {
          const watchId = `playbook:${symbol}:${tf}`;
          const ok = await chartEngine.removeWatch(watchId);
          if (ok) removed.push(watchId);
        }
      }
      return { ok: true, data: { removed } };
    }

    if (actionId === 'chart.watch.toggle') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : !chartWatchEnabled;
      setChartWatchEnabled(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.watch.mode.set') {
      const modeRaw = String(payload.mode || '').trim().toLowerCase();
      const mode = modeRaw === 'digest' || modeRaw === 'live' || modeRaw === 'signals' ? modeRaw : null;
      if (!mode) return { ok: false, error: 'Chart watch mode must be signals, digest, or live.' };
      setChartWatchMode(mode as any);
      return { ok: true, data: { mode } };
    }

    if (actionId === 'chart.watch.snooze') {
      const minutes = Number(payload.minutes ?? payload.mins ?? payload.min);
      const durationMs = Number.isFinite(minutes) ? minutes * 60_000 : Number(payload.durationMs ?? 0);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return { ok: false, error: 'Snooze duration is required.' };
      }
      snoozeChartWatch(Math.floor(durationMs));
      return { ok: true, data: { snoozedUntilMs: Date.now() + Math.floor(durationMs) } };
    }

    if (actionId === 'chart.watch.clear_snooze') {
      clearChartWatchSnooze();
      return { ok: true, data: { cleared: true } };
    }

    if (actionId === 'chart.watch.lead_agent.set') {
      const agentId = String(payload.agentId || payload.id || '').trim();
      if (!agentId) return { ok: false, error: 'Agent id is required.' };
      setChartWatchLeadAgentId(agentId);
      return { ok: true, data: { agentId } };
    }

    if (actionId === 'chart.focus' || actionId === 'chart.symbol.set' || actionId === 'chart.timeframe.set') {
      const symbol = String(payload.symbol || input?.symbol || '').trim();
      const timeframe = String(payload.timeframe || payload.frame || payload.resolution || '').trim();
      if (!symbol && !timeframe) return { ok: false, error: 'Symbol or timeframe is required.' };
      if (nativeChartRef.current?.focusSymbol && symbol) {
        nativeChartRef.current.focusSymbol(symbol, timeframe || undefined, { revealSetups: payload.revealSetups === true });
      } else if (nativeChartRef.current?.ensureFrameActive && timeframe) {
        nativeChartRef.current.ensureFrameActive(timeframe);
      }
      return { ok: true, data: { symbol: symbol || null, timeframe: timeframe || null } };
    }

    if (actionId === 'chart.overlay.setups.toggle') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowSetups?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.overlay.patterns.toggle') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowPatterns?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.overlay.reviews.toggle') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowReviews?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.show.indicators.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowIndicators?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.show.live_quote.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowLiveQuote?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.show.ranges.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowRanges?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.show.sessions.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowSessions?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.show.constraints.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowConstraints?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.show.positions.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowPositions?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.show.orders.set') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : payload.value !== undefined ? !!payload.value : true;
      nativeChartRef.current?.setShowOrders?.(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.frame.toggle') {
      const frame = String(payload.frame || payload.timeframe || payload.resolution || '').trim();
      if (!frame) return { ok: false, error: 'Timeframe is required.' };
      nativeChartRef.current?.toggleFrame?.(frame);
      return { ok: true, data: { frame } };
    }

    if (actionId === 'chart.frames.set') {
      const framesRaw = payload.frames || payload.timeframes || [];
      const frames = Array.isArray(framesRaw) ? framesRaw : [framesRaw];
      const list = frames.map((frame) => String(frame || '').trim()).filter(Boolean);
      if (list.length === 0) return { ok: false, error: 'Timeframes are required.' };
      nativeChartRef.current?.setActiveFrames?.(list);
      return { ok: true, data: { frames: list } };
    }

    if (actionId === 'chart.refresh') {
      nativeChartRef.current?.refresh?.();
      return { ok: true, data: { refreshed: true } };
    }

    if (actionId === 'chart.capture_all') {
      nativeChartRef.current?.captureAll?.();
      return { ok: true, data: { captured: true } };
    }

    if (actionId === 'chart.capture_snapshot') {
      const snapshot = nativeChartRef.current?.captureSnapshot?.() || null;
      const meta = nativeChartRef.current?.getMeta?.() || null;
      if (snapshot) {
        lastNativeChartSnapshotRef.current = { dataUrl: snapshot, meta, capturedAtMs: Date.now() };
        void persistChartSnapshotMemory({
          imageDataUrl: snapshot,
          meta,
          symbol: meta?.symbol || payload.symbol || input?.symbol || null,
          timeframe: payload.timeframe || input?.timeframe || null,
          source: String(input?.source || payload.source || 'action').trim() || 'action'
        });
      }
      return { ok: true, data: { snapshot } };
    }

    if (actionId === 'chart.fullscreen.toggle') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : !isChartFullscreen;
      setIsChartFullscreen(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'chart.engine.snapshot') {
      const symbol = String(payload.symbol || input?.symbol || '').trim();
      const framesRaw = payload.timeframes || payload.frames || payload.timeframe || [];
      const frames = Array.isArray(framesRaw) ? framesRaw : [framesRaw];
      const timeframes = frames.map((tf) => String(tf || '').trim()).filter(Boolean);
      const barsLimit = Number.isFinite(Number(payload.barsLimit)) ? Math.max(5, Math.floor(Number(payload.barsLimit))) : 50;
      const eventsLimit = Number.isFinite(Number(payload.eventsLimit)) ? Math.max(5, Math.floor(Number(payload.eventsLimit))) : 20;
      let snapshots = chartEngine.getSnapshots({ barsLimit, eventsLimit, includeInactive: true });
      if (symbol) {
        snapshots = snapshots.filter((s) => String(s.symbol || '').trim() === symbol);
      }
      if (timeframes.length > 0) {
        const set = new Set(timeframes.map((tf) => String(tf)));
        snapshots = snapshots.filter((s) => set.has(String(s.timeframe || '')));
      }
      return { ok: true, data: { snapshots } };
    }

    if (actionId === 'chart.session.list') {
      return { ok: true, data: { sessions: chartSessions.sessions || [] } };
    }

    if (actionId === 'chart.session.create') {
      const symbol = String(payload.symbol || input?.symbol || '').trim();
      if (!symbol) return { ok: false, error: 'Symbol is required.' };
      const id = chartSessions.createSession(symbol);
      if (!id) return { ok: false, error: 'Failed to create session.' };
      return { ok: true, data: { sessionId: id, symbol } };
    }

    if (actionId === 'chart.session.create_from_tab') {
      const tabId = String(payload.tabId || payload.id || activeTabIdRef.current || '').trim();
      if (!tabId) return { ok: false, error: 'Tab id is required.' };
      const tab = (tabsRef.current || []).find((t) => t.id === tabId);
      if (!tab) return { ok: false, error: 'Tab not found.' };
      const id = chartSessions.createSessionFromTab({ url: tab.url, title: tab.title });
      if (!id) return { ok: false, error: 'Failed to create session.' };
      return { ok: true, data: { sessionId: id, symbol: chartSessions.byId.get(id)?.symbol || null } };
    }

    if (actionId === 'chart.session.update') {
      const sessionId = String(payload.sessionId || payload.id || '').trim();
      if (!sessionId) return { ok: false, error: 'Session id is required.' };
      const patch: Record<string, any> = {};
      if (payload.symbol != null) patch.symbol = String(payload.symbol);
      if (payload.notes != null) patch.notes = String(payload.notes);
      if (payload.roiProfileId != null) patch.roiProfileId = String(payload.roiProfileId);
      if (payload.watchEnabled != null) patch.watchEnabled = !!payload.watchEnabled;
      chartSessions.updateSession(sessionId, patch);
      return { ok: true, data: { sessionId, updated: true } };
    }

    if (actionId === 'chart.session.remove') {
      const sessionId = String(payload.sessionId || payload.id || '').trim();
      if (!sessionId) return { ok: false, error: 'Session id is required.' };
      chartSessions.removeSession(sessionId);
      return { ok: true, data: { sessionId, removed: true } };
    }

    if (actionId === 'chart.session.watch.set') {
      const sessionId = String(payload.sessionId || payload.id || '').trim();
      if (!sessionId) return { ok: false, error: 'Session id is required.' };
      const enabled = payload.enabled !== undefined ? !!payload.enabled : true;
      chartSessions.setSessionWatchEnabled(sessionId, enabled);
      return { ok: true, data: { sessionId, enabled } };
    }

    if (actionId === 'chart.session.assign_tab') {
      const sessionId = String(payload.sessionId || payload.id || '').trim();
      const timeframe = String(payload.timeframe || payload.frame || '').trim();
      const tabId = String(payload.tabId || payload.tab || '').trim();
      if (!sessionId || !timeframe || !tabId) return { ok: false, error: 'Session id, timeframe, and tab id are required.' };
      chartSessions.assignTabToTimeframe(sessionId, timeframe as any, tabId);
      return { ok: true, data: { sessionId, timeframe, tabId } };
    }

    if (actionId === 'chart.session.clear_timeframe') {
      const sessionId = String(payload.sessionId || payload.id || '').trim();
      const timeframe = String(payload.timeframe || payload.frame || '').trim();
      if (!sessionId || !timeframe) return { ok: false, error: 'Session id and timeframe are required.' };
      chartSessions.clearTimeframe(sessionId, timeframe as any);
      return { ok: true, data: { sessionId, timeframe } };
    }

    if (actionId === 'session.bias.set') {
      const bias = String(payload.bias || payload.sessionBias || '').trim();
      if (!bias) return { ok: false, error: 'Session bias is required.' };
      if (chatChannel === 'chart' && typeof chartHandlers.setSessionBias === 'function') {
        chartHandlers.setSessionBias(bias);
      } else {
        if (chatChannel === 'chart') {
          return { ok: false, error: 'Chart chat session bias unavailable.' };
        }
        setSessionBias(bias);
      }
      return { ok: true, data: { sessionBias: bias, channel: chatChannel } };
    }
    if (actionId === 'symbol.scope.set') {
      const symbol = String(payload.symbol || payload.value || payload.symbolScope || '').trim();
      if (!symbol) return { ok: false, error: 'Symbol is required.' };
      const timeframesRaw = payload.timeframes || payload.frames || payload.frame || payload.tf || payload.timeframe;
      const timeframes = Array.isArray(timeframesRaw)
        ? timeframesRaw.map((entry: any) => String(entry || '').trim()).filter(Boolean)
        : typeof timeframesRaw === 'string'
          ? timeframesRaw.split(/[,\s]+/).map((entry: string) => entry.trim()).filter(Boolean)
          : undefined;
      updateSymbolScope(symbol, { timeframes, source: String(payload.source || input?.source || 'action').trim() || undefined });
      return { ok: true, data: { symbol: symbol.toUpperCase(), timeframes: normalizeScopeTimeframes(timeframes) } };
    }
    if (actionId === 'symbol.scope.clear') {
      clearSymbolScope();
      return { ok: true, data: { cleared: true } };
    }


  return { handled: false };
}