type ActionResult = { ok: boolean; error?: string; data?: any };

type BacktesterLike = {
  listOptimizerPresets?: () => any[];
  saveOptimizerPreset?: (opts?: any) => { ok: boolean; preset?: any; error?: string };
  loadOptimizerPreset?: (id: string) => { ok: boolean; preset?: any; error?: string };
  deleteOptimizerPreset?: (id: string, opts?: { confirmed?: boolean }) => { ok: boolean; deletedId?: string; error?: string };
  exportOptimizerPresets?: (opts?: { mode?: 'clipboard' | 'download' | 'return' }) => Promise<{ ok: boolean; payload?: string; error?: string }>;
  importOptimizerPresets?: (rawText: string) => { ok: boolean; imported?: number; error?: string };
  listBatchPresets?: () => any[];
  saveBatchPreset?: (opts?: any) => { ok: boolean; preset?: any; error?: string };
  loadBatchPreset?: (id: string) => { ok: boolean; preset?: any; error?: string };
  deleteBatchPreset?: (id: string, opts?: { confirmed?: boolean }) => { ok: boolean; deletedId?: string; error?: string };
  runBatchOptimization?: (opts?: { config?: any }) => void;
  cancelBatchOptimization?: () => void;
  clearBatchResults?: () => void;
  exportBatchResults?: (opts?: {
    format?: 'csv' | 'json';
    mode?: 'clipboard' | 'download' | 'return';
  }) => Promise<{ ok: boolean; payload?: string; error?: string }>;
};

type RunBacktesterActionRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  backtester: BacktesterLike | null | undefined;
  openBacktesterPanel: () => void;
};

const dispatchBacktesterEvent = (eventName: string, detail: any) => {
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
};

export async function runBacktesterActionRuntime(
  input: RunBacktesterActionRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(input.actionId || '').trim();
  const payload = (input.payload && typeof input.payload === 'object' ? input.payload : {}) as Record<string, any>;
  const backtester = input.backtester;

  if (actionId === 'backtester.config.set') {
    const detail = {
      symbol: payload.symbol ?? payload.asset ?? null,
      timeframe: payload.timeframe ?? payload.resolution ?? null,
      rangeDays: payload.rangeDays ?? payload.days ?? null
    };
    const dispatched = dispatchBacktesterEvent('glass_backtester_config', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester config.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: detail } };
  }

  if (actionId === 'backtester.params.set') {
    const detail = {
      strategy: payload.strategy ?? payload.setup ?? null,
      params: payload.params ?? payload.config ?? null,
      symbol: payload.symbol ?? null,
      timeframe: payload.timeframe ?? payload.resolution ?? null,
      rangeDays: payload.rangeDays ?? payload.days ?? null
    };
    const dispatched = dispatchBacktesterEvent('glass_backtester_params', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester params.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: detail } };
  }

  if (actionId === 'backtester.optimizer.config.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_optimizer_config', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester optimizer config.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.batch.config.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_batch_config', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester batch config.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.execution.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_execution', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester execution config.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.confluence.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_confluence', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester confluence config.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.validation.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_validation', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester validation config.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.walkforward.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_walkforward', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester walk-forward config.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.replay.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_replay', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester replay controls.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.replay.play.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_replay', { playing: detail.playing });
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to toggle Backtester replay.' } };
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.replay.step') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const stepDelta = Number.isFinite(Number(detail.stepDelta)) ? Number(detail.stepDelta) : 1;
    const dispatched = dispatchBacktesterEvent('glass_backtester_replay', { stepDelta });
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to step Backtester replay.' } };
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.tiebreaker.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_tiebreaker', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester tie-breaker.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.auto_summary.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_auto_summary', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester auto-summary.' } };
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.watchlist.mode.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_watchlist_mode', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester watchlist mode.' } };
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.trade.select') {
    const detail = {
      tradeId: payload.tradeId ?? payload.id ?? null,
      clear: payload.clear === true
    };
    const dispatched = dispatchBacktesterEvent('glass_backtester_trade_select', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to select Backtester trade.' } };
    return { handled: true, result: { ok: true, data: detail } };
  }

  if (actionId === 'backtester.memory.filters.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_memory_filters', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester memory filters.' } };
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtester.research.config.set') {
    const detail = payload && typeof payload === 'object' ? { ...payload } : {};
    const dispatched = dispatchBacktesterEvent('glass_backtester_research_config', detail);
    if (!dispatched.ok) return { handled: true, result: { ok: false, error: 'Unable to update Backtester research config.' } };
    return { handled: true, result: { ok: true, data: { updated: true } } };
  }

  if (actionId === 'backtest.preset.list') {
    if (backtester?.listOptimizerPresets) {
      return { handled: true, result: { ok: true, data: { presets: backtester.listOptimizerPresets() } } };
    }
    const raw = localStorage.getItem('glass_backtester_optimizer_presets_v1');
    let presets: any[] = [];
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      presets = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.presets) ? parsed.presets : [];
    } catch {
      presets = [];
    }
    return { handled: true, result: { ok: true, data: { presets } } };
  }

  if (actionId === 'backtest.preset.save') {
    if (!backtester?.saveOptimizerPreset) {
      return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    }
    const mode = payload.mode === 'update' ? 'update' : 'new';
    const res = backtester.saveOptimizerPreset({
      mode,
      presetId: payload.presetId,
      name: payload.name,
      config: payload.config,
      symbol: payload.symbol,
      timeframe: payload.timeframe
    });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to save preset.' } };
    return { handled: true, result: { ok: true, data: { preset: res.preset || null } } };
  }

  if (actionId === 'backtest.preset.load') {
    if (!backtester?.loadOptimizerPreset) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const presetId = String(payload.presetId || payload.id || '').trim();
    if (!presetId) return { handled: true, result: { ok: false, error: 'Preset id is required.' } };
    const res = backtester.loadOptimizerPreset(presetId);
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to load preset.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { preset: res.preset || null } } };
  }

  if (actionId === 'backtest.preset.delete') {
    if (!backtester?.deleteOptimizerPreset) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const presetId = String(payload.presetId || payload.id || '').trim();
    if (!presetId) return { handled: true, result: { ok: false, error: 'Preset id is required.' } };
    const res = backtester.deleteOptimizerPreset(presetId, { confirmed: payload.confirmed === true });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to delete preset.' } };
    return { handled: true, result: { ok: true, data: { deletedId: res.deletedId || presetId } } };
  }

  if (actionId === 'backtest.preset.export') {
    if (!backtester?.exportOptimizerPresets) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const mode = payload.mode === 'download' || payload.mode === 'clipboard' ? payload.mode : 'return';
    const res = await backtester.exportOptimizerPresets({ mode });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Export failed.' } };
    return { handled: true, result: { ok: true, data: { payload: res.payload || null } } };
  }

  if (actionId === 'backtest.preset.import') {
    if (!backtester?.importOptimizerPresets) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const rawText = String(payload.text || payload.json || '').trim();
    if (!rawText) return { handled: true, result: { ok: false, error: 'Preset JSON required.' } };
    const res = backtester.importOptimizerPresets(rawText);
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Import failed.' } };
    return { handled: true, result: { ok: true, data: { imported: res.imported ?? null } } };
  }

  if (actionId === 'backtest.batch.preset.list') {
    if (!backtester?.listBatchPresets) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    return { handled: true, result: { ok: true, data: { presets: backtester.listBatchPresets() } } };
  }

  if (actionId === 'backtest.batch.preset.save') {
    if (!backtester?.saveBatchPreset) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const res = backtester.saveBatchPreset({
      mode: payload.mode === 'update' ? 'update' : 'new',
      presetId: payload.presetId,
      name: payload.name,
      config: payload.config
    });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to save batch preset.' } };
    return { handled: true, result: { ok: true, data: { preset: res.preset || null } } };
  }

  if (actionId === 'backtest.batch.preset.load') {
    if (!backtester?.loadBatchPreset) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const presetId = String(payload.presetId || payload.id || '').trim();
    if (!presetId) return { handled: true, result: { ok: false, error: 'Preset id is required.' } };
    const res = backtester.loadBatchPreset(presetId);
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to load batch preset.' } };
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { preset: res.preset || null } } };
  }

  if (actionId === 'backtest.batch.preset.delete') {
    if (!backtester?.deleteBatchPreset) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const presetId = String(payload.presetId || payload.id || '').trim();
    if (!presetId) return { handled: true, result: { ok: false, error: 'Preset id is required.' } };
    const res = backtester.deleteBatchPreset(presetId, { confirmed: payload.confirmed === true });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to delete batch preset.' } };
    return { handled: true, result: { ok: true, data: { deletedId: res.deletedId || presetId } } };
  }

  if (actionId === 'backtest.batch.run') {
    if (!backtester?.runBatchOptimization) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    backtester.runBatchOptimization({ config: payload.config || null });
    if (payload.openPanel) input.openBacktesterPanel();
    return { handled: true, result: { ok: true, data: { started: true } } };
  }

  if (actionId === 'backtest.batch.cancel') {
    if (!backtester?.cancelBatchOptimization) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    backtester.cancelBatchOptimization();
    return { handled: true, result: { ok: true, data: { cancelled: true } } };
  }

  if (actionId === 'backtest.batch.clear') {
    if (!backtester?.clearBatchResults) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    backtester.clearBatchResults();
    return { handled: true, result: { ok: true, data: { cleared: true } } };
  }

  if (actionId === 'backtest.batch.export') {
    if (!backtester?.exportBatchResults) return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    const format = payload.format === 'json' ? 'json' : 'csv';
    const mode = payload.mode === 'download' || payload.mode === 'clipboard' ? payload.mode : 'return';
    const res = await backtester.exportBatchResults({ format, mode });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Batch export failed.' } };
    return { handled: true, result: { ok: true, data: { payload: res.payload || null } } };
  }

  return { handled: false };
}
