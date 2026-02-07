type ActionResult = { ok: boolean; error?: string; data?: any };

type MutableRef<T> = { current: T };

type RunBacktestCatalogRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: {
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    mode?: string | null;
    source?: string | null;
  };
  backtester: any;
  backtestOptimizationCancelRef: MutableRef<Map<string, { cancelled: boolean }>>;
  openBacktesterPanel: () => void;
  buildParamGridFromParams: (params: Record<string, any> | null | undefined) => any;
  normalizeExecutionPresetKey: (value: any) => 'lite' | 'standard' | 'strict' | null;
  resolveExecutionConfig: (raw: any, fallback?: any, presetKey?: string | null) => any;
  formatExecutionSummary: (execution: any, presetKey?: string | null) => string;
  formatValidationSummary: (validation: any) => string;
  loadBacktestOptimizationHistory: (input: any) => Promise<any>;
  runBacktestOptimizationWorker: (input: any, opts?: any) => Promise<any>;
  runBacktestOptimization: (input: any, opts?: any) => Promise<any>;
  normalizeSymbolKey: (value: any) => string;
  normalizeSetupTimeframe: (value: any) => string;
  normalizeSetupStrategy: (value: any) => string;
};

export async function runBacktestCatalogRuntime(
  input: RunBacktestCatalogRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(input.actionId || '').trim();
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
  const requestContext = input.requestContext || {};

  if (actionId === 'backtest.run') {
    const rawStrategy = String(payload.strategy || requestContext?.strategy || '').trim().toUpperCase();
    const allowedStrategies = new Set(['RANGE_BREAKOUT', 'BREAK_RETEST', 'FVG_RETRACE', 'TREND_PULLBACK', 'MEAN_REVERSION']);
    if (!rawStrategy || !allowedStrategies.has(rawStrategy)) {
      return { handled: true, result: { ok: false, error: 'Backtest run requires a supported strategy.' } };
    }
    const summary = input.backtester?.getSummary?.();
    const symbol = String(payload.symbol || requestContext?.symbol || '').trim();
    const timeframe = String(payload.timeframe || requestContext?.timeframe || '').trim();
    if (!symbol || !timeframe) return { handled: true, result: { ok: false, error: 'Symbol and timeframe are required.' } };
    const params = payload.params && typeof payload.params === 'object' ? payload.params : null;
    if (!params) return { handled: true, result: { ok: false, error: 'Backtest params are required.' } };
    const rangeDays = Number.isFinite(Number(payload.rangeDays))
      ? Math.max(1, Math.floor(Number(payload.rangeDays)))
      : 90;
    const timeFilter = payload.timeFilter && typeof payload.timeFilter === 'object' ? payload.timeFilter : undefined;
    const executionPreset = input.normalizeExecutionPresetKey(
      payload.executionPreset ?? payload.realityPreset ?? requestContext?.mode
    );
    const execution = input.resolveExecutionConfig(payload.execution, summary?.execution, executionPreset);
    const paramGrid = input.buildParamGridFromParams(params);
    if (!paramGrid || Object.keys(paramGrid).length === 0) {
      return { handled: true, result: { ok: false, error: 'Backtest params could not be converted into a grid.' } };
    }

    const history = await input.loadBacktestOptimizationHistory({
      symbol,
      strategy: rawStrategy,
      timeframe,
      rangeDays,
      maxCombos: 1,
      timeFilter,
      paramGrid,
      execution
    });
    if (!history.ok) {
      return { handled: true, result: { ok: false, error: history.error || 'Backtest history unavailable.' } };
    }

    let result: any = null;
    try {
      const baseRequest =
        history.request || {
          symbol,
          strategy: rawStrategy,
          timeframe,
          rangeDays,
          maxCombos: 1,
          timeFilter,
          paramGrid
        };
      result = await input.runBacktestOptimizationWorker(
        {
          request: {
            ...baseRequest,
            execution: execution ?? (baseRequest as any).execution
          },
          bars: history.bars,
          history: history.history,
          runId: history.runId,
          startedAtMs: history.startedAtMs
        },
        { includeResults: true }
      );
    } catch {
      result = await input.runBacktestOptimization(
        {
          symbol,
          strategy: rawStrategy,
          timeframe,
          rangeDays,
          maxCombos: 1,
          timeFilter,
          paramGrid,
          execution: execution ?? (history.request as any)?.execution
        },
        { includeResults: true }
      );
    }

    if (!result?.ok) {
      return { handled: true, result: { ok: false, error: result?.error || 'Backtest run failed.', data: result ?? null } };
    }

    const top = result.bestConfig || (Array.isArray(result.topConfigs) ? result.topConfigs[0] : null);
    const formatPct = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? `${(num * 100).toFixed(1)}%` : '--';
    };
    const formatR = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? `${num.toFixed(2)}R` : '--';
    };
    const formatPf = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? num.toFixed(2) : '--';
    };

    const summaryLine = top
      ? `Params ${Object.entries(top.params || {})
          .filter(([key, value]) => key !== 'enabled' && value != null)
          .map(([key, value]) => `${key} ${value}`)
          .join(', ')} | Net ${formatR(top.performance?.netR)} | WR ${formatPct(top.stats?.winRate)} | PF ${formatPf(top.stats?.profitFactor)} | Trades ${top.stats?.total ?? 0}`
      : 'No config returned.';
    const executionLine = input.formatExecutionSummary(execution, executionPreset);
    const validationLine = input.formatValidationSummary(payload.validation);
    const responseSummary = [executionLine, validationLine, summaryLine].filter(Boolean).join('\n');

    const ledger = (window as any)?.glass?.tradeLedger;
    if (ledger?.upsertAgentMemory) {
      const runId = result.runId || `run_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
      const key = `backtest_run:${runId}`;
      const familyKey = `backtest_run:${input.normalizeSymbolKey(symbol)}:${input.normalizeSetupTimeframe(timeframe) || timeframe}`;
      const payloadOut = {
        schemaVersion: result.schemaVersion ?? 1,
        runId,
        symbol: result.symbol,
        timeframe: result.timeframe,
        strategy: result.strategy,
        rangeDays: result.rangeDays,
        timeFilter,
        execution,
        params,
        bestConfig: top,
        bars: result.bars,
        combosTested: result.combosTested,
        truncated: result.truncated,
        history: result.history || null,
        ranAtMs: result.ranAtMs,
        elapsedMs: result.elapsedMs
      };
      try {
        await ledger.upsertAgentMemory({
          key,
          familyKey,
          kind: 'backtest_run',
          symbol: result.symbol,
          timeframe: result.timeframe,
          summary: `Backtest ${result.symbol} ${result.timeframe} ${rawStrategy}\n${executionLine}\n${validationLine}\n${summaryLine}`,
          payload: payloadOut,
          source: 'agent',
          tags: [result.symbol, result.timeframe, result.strategy, 'backtest', 'run']
        });
      } catch {
        // ignore persistence failures
      }
    }

    return {
      handled: true,
      result: {
        ok: true,
        data: {
          result,
          summary: responseSummary
        }
      }
    };
  }

  if (actionId === 'backtest.export') {
    const ledger = (window as any)?.glass?.tradeLedger;
    if (!ledger?.listAgentMemory) return { handled: true, result: { ok: false, error: 'Backtest export unavailable.' } };
    const mode = String(payload.mode || 'return').trim().toLowerCase();
    const memoryKey = String(payload.key || payload.memoryKey || '').trim();
    const runId = String(payload.runId || '').trim();
    let entries: any[] = [];

    if (memoryKey && ledger?.getAgentMemory) {
      const res = await ledger.getAgentMemory({ key: memoryKey, touch: true });
      if (res?.ok && res.memory) entries = [res.memory];
    }

    if (entries.length === 0 && runId && ledger?.getAgentMemory) {
      const res = await ledger.getAgentMemory({ key: `backtest_run:${runId}`, touch: true });
      if (res?.ok && res.memory) entries = [res.memory];
    }

    if (entries.length === 0) {
      const symbol = payload.symbol ? input.normalizeSymbolKey(payload.symbol) : undefined;
      const timeframe = payload.timeframe ? input.normalizeSetupTimeframe(payload.timeframe) : undefined;
      const strategy = payload.strategy ? input.normalizeSetupStrategy(payload.strategy) : '';
      const tags = Array.isArray(payload.tags) ? payload.tags : strategy ? [strategy] : undefined;
      const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 200;
      const kindRaw = payload.kind ? String(payload.kind).trim() : '';
      const kinds = kindRaw
        ? [kindRaw]
        : ['backtest_run', 'backtest_optimization_run', 'backtest_optimization'];
      const batches: any[] = [];
      for (const kind of kinds) {
        try {
          const res = await ledger.listAgentMemory({ limit, kind, symbol, timeframe, tags });
          if (res?.ok && Array.isArray(res.memories)) {
            batches.push(...res.memories);
          }
        } catch {
          // ignore per-kind failures
        }
      }
      entries = runId
        ? batches.filter((entry) => String(entry?.payload?.runId || '') === runId)
        : batches;
    }

    if (entries.length === 0) return { handled: true, result: { ok: false, error: 'No backtest exports found.' } };

    const exportPayload = JSON.stringify(
      {
        schemaVersion: 1,
        exportedAtMs: Date.now(),
        entries
      },
      null,
      2
    );

    if (mode === 'return') return { handled: true, result: { ok: true, data: { payload: exportPayload } } };
    if (mode === 'clipboard') {
      try {
        const fn = (window as any)?.glass?.clipboard?.writeText;
        if (fn) {
          const resCopy = fn(exportPayload);
          if (resCopy && typeof resCopy.then === 'function') await resCopy;
          return { handled: true, result: { ok: true, data: { copied: true } } };
        }
      } catch {
        // ignore
      }
      return { handled: true, result: { ok: false, error: 'Clipboard unavailable.' } };
    }

    const saver = (window as any)?.glass?.saveUserFile;
    if (!saver) return { handled: true, result: { ok: false, error: 'Save unavailable.' } };
    const resSave = await saver({
      data: exportPayload,
      mimeType: 'application/json',
      subdir: 'backtests',
      prefix: 'backtest_export'
    });
    if (!resSave?.ok) return { handled: true, result: { ok: false, error: resSave?.error || 'Export failed.' } };
    return { handled: true, result: { ok: true, data: { filename: resSave.filename || null } } };
  }

  if (actionId === 'backtest.optimization.cancel') {
    const messageId = String(payload.messageId || payload.id || '').trim();
    if (!messageId) return { handled: true, result: { ok: false, error: 'Optimization message id is required.' } };
    const existing = input.backtestOptimizationCancelRef.current.get(messageId);
    if (existing) {
      existing.cancelled = true;
    } else {
      input.backtestOptimizationCancelRef.current.set(messageId, { cancelled: true });
    }
    return { handled: true, result: { ok: true, data: { cancelled: true, messageId } } };
  }

  if (actionId === 'backtest.apply_optimization') {
    const symbol = String(payload.symbol || requestContext?.symbol || '').trim();
    const timeframe = String(payload.timeframe || requestContext?.timeframe || '').trim();
    const strategy = String(payload.strategy || requestContext?.strategy || '').trim().toUpperCase();
    const rangeDays = Number.isFinite(Number(payload.rangeDays)) ? Number(payload.rangeDays) : null;

    let params = payload.params && typeof payload.params === 'object' ? payload.params : null;
    if (!params) {
      const ledger = (window as any)?.glass?.tradeLedger;
      const winnerId = String(payload.winnerId || '').trim();
      const sessionId = String(payload.sessionId || '').trim();
      const round = Number.isFinite(Number(payload.round)) ? Math.max(1, Math.floor(Number(payload.round))) : null;
      if (ledger?.getOptimizerWinner && winnerId) {
        const res = await ledger.getOptimizerWinner({ id: winnerId });
        if (res?.ok && res.winner?.params) params = res.winner.params;
      }
      if (!params && ledger?.getOptimizerWinnerBySessionRound && sessionId && round) {
        const res = await ledger.getOptimizerWinnerBySessionRound({ sessionId, round });
        if (res?.ok && res.winner?.params) params = res.winner.params;
      }
    }

    if (!params) return { handled: true, result: { ok: false, error: 'Optimization params are required.' } };
    if (!input.backtester?.applyOptimization) {
      if (payload.openPanel !== false) {
        input.openBacktesterPanel();
      }
      return { handled: true, result: { ok: false, error: 'Backtester panel unavailable.' } };
    }

    input.backtester.applyOptimization({
      params,
      strategy: strategy || undefined,
      symbol: symbol || undefined,
      timeframe: timeframe || undefined,
      rangeDays: rangeDays || undefined
    });

    if (payload.openPanel) {
      input.openBacktesterPanel();
    }
    return { handled: true, result: { ok: true, data: { applied: true } } };
  }

  return { handled: false };
}
