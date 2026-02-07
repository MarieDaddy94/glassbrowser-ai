import type { SetupPerformance } from '../types';

type SetupPerformanceRuntimeInput = {
  entries: any[];
  account: {
    env: string | null;
    server: string | null;
    accountId: number | string | null;
    accNum: number | string | null;
  };
  setupWatchers: any[];
  setupLibrary: any[];
  normalizeExecutionPlaybook: (playbook: any) => any;
  buildPlaybookState: (playbook: any, state: any) => any;
};

type SetupPerformanceRuntimeResult = {
  ok: true;
  playbookStatus: Record<string, any>;
  watcherObj: Record<string, SetupPerformance>;
  libraryObj: Record<string, SetupPerformance>;
  modeObj: Record<string, SetupPerformance>;
  symbolObj: Record<string, SetupPerformance>;
  summary: SetupPerformance | null;
} | {
  ok: false;
  error: string;
};

export function computeSetupPerformanceRuntime(input: SetupPerformanceRuntimeInput): SetupPerformanceRuntimeResult {
  try {
    const entriesRaw = Array.isArray(input.entries) ? input.entries : [];
    const { env, server, accountId, accNum } = input.account || {
      env: null,
      server: null,
      accountId: null,
      accNum: null
    };

    const normStr = (value: any) => String(value ?? '').trim().toUpperCase();
    const accountMatches = (entry: any) => {
      if (entry?.broker !== 'tradelocker') return true;
      if (!env && !server && !accountId && !accNum) return true;
      const acct = entry?.account || entry?.acct || null;
      if (!acct || typeof acct !== 'object') return false;
      if (env && normStr(acct?.env) !== normStr(env)) return false;
      if (server && normStr(acct?.server) !== normStr(server)) return false;
      if (accountId != null && Number(acct?.accountId) !== Number(accountId)) return false;
      if (accNum != null && Number(acct?.accNum) !== Number(accNum)) return false;
      return true;
    };

    const isClosed = (entry: any) => {
      const status = String(entry?.status || '').toUpperCase();
      const posStatus = String(entry?.positionStatus || '').toUpperCase();
      const closedAt = Number(entry?.positionClosedAtMs || 0);
      return status === 'CLOSED' || posStatus === 'CLOSED' || closedAt > 0;
    };

    type PerfAgg = SetupPerformance & {
      grossWin: number;
      grossLoss: number;
      equity: number;
      peak: number;
      maxDrawdown: number;
      slippageSum: number;
      slippageCount: number;
      slippagePctSum: number;
      slippagePctCount: number;
    };

    const watcherAgg = new Map<string, PerfAgg>();
    const libraryAgg = new Map<string, PerfAgg>();
    const modeAgg = new Map<string, PerfAgg>();
    const symbolAgg = new Map<string, PerfAgg>();
    const overallAgg = new Map<string, PerfAgg>();
    const overallKey = 'overall';

    const addAgg = (
      map: Map<string, PerfAgg>,
      key: string,
      pnl: number,
      meta: Partial<SetupPerformance>,
      closedAtMs: number,
      slippageAbs: number | null,
      slippagePct: number | null
    ) => {
      if (!key) return;
      const entry = map.get(key) || {
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        netPnl: 0,
        avgPnl: 0,
        profitFactor: null,
        expectancy: null,
        slippageAvg: null,
        slippagePctAvg: null,
        lastClosedAtMs: null,
        symbol: meta.symbol ?? null,
        timeframe: meta.timeframe ?? null,
        strategy: meta.strategy ?? null,
        mode: meta.mode ?? null,
        grossWin: 0,
        grossLoss: 0,
        equity: 0,
        peak: 0,
        maxDrawdown: 0,
        slippageSum: 0,
        slippageCount: 0,
        slippagePctSum: 0,
        slippagePctCount: 0
      };
      entry.trades += 1;
      entry.netPnl += pnl;
      entry.equity += pnl;
      entry.peak = Math.max(entry.peak, entry.equity);
      entry.maxDrawdown = Math.max(entry.maxDrawdown, entry.peak - entry.equity);
      if (pnl > 0) {
        entry.wins += 1;
        entry.grossWin += pnl;
      } else {
        entry.losses += 1;
        entry.grossLoss += Math.abs(pnl);
      }
      if (slippageAbs != null && Number.isFinite(slippageAbs)) {
        entry.slippageSum += slippageAbs;
        entry.slippageCount += 1;
      }
      if (slippagePct != null && Number.isFinite(slippagePct)) {
        entry.slippagePctSum += slippagePct;
        entry.slippagePctCount += 1;
      }
      entry.lastClosedAtMs = Math.max(Number(entry.lastClosedAtMs || 0), closedAtMs || 0) || entry.lastClosedAtMs;
      if (!entry.symbol && meta.symbol) entry.symbol = meta.symbol;
      if (!entry.timeframe && meta.timeframe) entry.timeframe = meta.timeframe;
      if (!entry.strategy && meta.strategy) entry.strategy = meta.strategy;
      if (!entry.mode && meta.mode) entry.mode = meta.mode;
      map.set(key, entry);
    };

    const entries = entriesRaw.filter((entry) => {
      if (!entry) return false;
      if (entry.kind && String(entry.kind).toLowerCase() === 'audit_event') return false;
      const execMode = String(entry.executionMode || '').toLowerCase();
      const broker = String(entry.broker || '').toLowerCase();
      if (execMode === 'shadow' || broker === 'shadow') return false;
      return true;
    });

    const playbookStatus: Record<string, any> = {};
    for (const entry of entries) {
      if (!entry || !accountMatches(entry)) continue;
      const status = String(entry.status || '').toUpperCase();
      const positionStatus = String(entry.positionStatus || '').toUpperCase();
      if (status !== 'OPEN' && positionStatus !== 'OPEN') continue;

      const setup = entry?.setup && typeof entry.setup === 'object' ? entry.setup : null;
      const watcherId = setup?.watcherId || entry?.setupWatcherId || '';
      if (!watcherId) continue;

      const playbook = input.normalizeExecutionPlaybook(entry.playbook || setup?.playbook || null);
      if (!playbook || playbook.enabled === false) continue;

      const state = input.buildPlaybookState(playbook, entry.playbookState);
      if (!state) continue;

      const steps = Array.isArray(state.steps) ? state.steps : [];
      const stepsTotal = steps.length;
      const stepsDone = steps.filter((step: any) => step?.status === 'done').length;
      const openedAtMs = Number(entry?.positionOpenedAtMs || entry?.createdAtMs || 0);
      const existing = playbookStatus[watcherId];
      if (existing?.openedAtMs && openedAtMs && openedAtMs <= existing.openedAtMs) continue;

      playbookStatus[watcherId] = {
        stepsTotal,
        stepsDone,
        breakevenDone: !!state.breakevenDone,
        trailActive: !!state.trail?.active,
        lastActionAtMs: Number(state.lastActionAtMs || 0) || null,
        openedAtMs: openedAtMs || null,
        positionId: entry?.positionId ? String(entry.positionId) : null
      };
    }

    const closedEntries = entries
      .filter((entry) => entry && accountMatches(entry) && isClosed(entry))
      .map((entry) => ({
        entry,
        closedAtMs: Number(entry?.positionClosedAtMs || entry?.positionDetectedClosedAtMs || entry?.updatedAtMs || entry?.createdAtMs || 0)
      }))
      .sort((a, b) => (a.closedAtMs || 0) - (b.closedAtMs || 0));

    for (const item of closedEntries) {
      const entry = item.entry;
      const setup = entry?.setup && typeof entry.setup === 'object' ? entry.setup : null;
      const watcherId = setup?.watcherId || entry?.setupWatcherId || '';
      const libraryKey = setup?.libraryKey || entry?.setupLibraryKey || '';
      const strategy = setup?.strategy || entry?.setupStrategy || entry?.strategy || null;
      const timeframe = setup?.timeframe || entry?.setupTimeframe || entry?.timeframe || null;
      const mode = entry?.autoPilotMode || setup?.mode || entry?.setupMode || entry?.mode || null;

      const closedAtMs = item.closedAtMs || 0;
      const realizedRaw =
        entry?.realizedPnl ??
        entry?.positionClosedPnl ??
        entry?.positionClosedPnlEstimate ??
        entry?.positionPnl ??
        0;
      const pnl = Number.isFinite(Number(realizedRaw)) ? Number(realizedRaw) : 0;

      const plannedEntry = Number(entry?.entryPrice);
      const brokerEntry =
        Number(entry?.brokerEntryPriceAtClose ?? entry?.brokerEntryPrice ?? entry?.brokerEntryPriceAtClose ?? entry?.brokerEntryPrice);
      const action = String(entry?.action || '').toUpperCase();
      const direction = action === 'SELL' ? -1 : 1;
      const slippageAbsFromEntry =
        entry?.slippageAbs != null && Number.isFinite(Number(entry.slippageAbs)) ? Number(entry.slippageAbs) : null;
      const slippagePctFromEntry =
        entry?.slippagePct != null && Number.isFinite(Number(entry.slippagePct)) ? Number(entry.slippagePct) : null;
      const slippageAbsCalc =
        Number.isFinite(plannedEntry) && Number.isFinite(brokerEntry) && plannedEntry > 0
          ? (brokerEntry - plannedEntry) * direction
          : null;
      const slippageAbs = slippageAbsFromEntry != null ? slippageAbsFromEntry : slippageAbsCalc;
      const slippagePctCalc =
        slippageAbsCalc != null && Number.isFinite(plannedEntry) && plannedEntry > 0
          ? (slippageAbsCalc / plannedEntry) * 100
          : null;
      const slippagePct = slippagePctFromEntry != null ? slippagePctFromEntry : slippagePctCalc;

      const meta = { symbol: entry.symbol, timeframe, strategy, mode };
      if (watcherId) addAgg(watcherAgg, String(watcherId), pnl, meta, closedAtMs, slippageAbs, slippagePct);
      if (libraryKey) addAgg(libraryAgg, String(libraryKey), pnl, meta, closedAtMs, slippageAbs, slippagePct);
      const modeKey = mode ? String(mode) : '';
      if (modeKey) addAgg(modeAgg, modeKey, pnl, { mode }, closedAtMs, slippageAbs, slippagePct);
      const symbolKey = entry?.symbol ? `${String(entry.symbol)}:${String(timeframe || '')}` : '';
      if (symbolKey) addAgg(symbolAgg, symbolKey, pnl, { symbol: entry.symbol, timeframe }, closedAtMs, slippageAbs, slippagePct);
      addAgg(overallAgg, overallKey, pnl, meta, closedAtMs, slippageAbs, slippagePct);
    }

    const finalize = (agg: PerfAgg): SetupPerformance => {
      const trades = agg.trades || 0;
      const wins = agg.wins || 0;
      const losses = agg.losses || 0;
      const netPnl = Number(agg.netPnl) || 0;
      const avgPnl = trades > 0 ? netPnl / trades : 0;
      const winRate = trades > 0 ? wins / trades : 0;
      const profitFactor = agg.grossLoss > 0 ? agg.grossWin / agg.grossLoss : (agg.grossWin > 0 ? Infinity : null);
      const slippageAvg = agg.slippageCount > 0 ? agg.slippageSum / agg.slippageCount : null;
      const slippagePctAvg = agg.slippagePctCount > 0 ? agg.slippagePctSum / agg.slippagePctCount : null;
      return {
        trades,
        wins,
        losses,
        winRate,
        netPnl,
        avgPnl,
        expectancy: avgPnl,
        profitFactor,
        maxDrawdown: Number.isFinite(Number(agg.maxDrawdown)) ? Number(agg.maxDrawdown) : null,
        slippageAvg,
        slippagePctAvg,
        lastClosedAtMs: agg.lastClosedAtMs || null,
        symbol: agg.symbol ?? null,
        timeframe: agg.timeframe ?? null,
        strategy: agg.strategy ?? null,
        mode: agg.mode ?? null
      };
    };

    const computeDrift = (
      perf: SetupPerformance,
      baseline?: { winRate?: number | null; profitFactor?: number | null }
    ) => {
      if (!baseline) return null;
      if (!Number.isFinite(Number(perf.trades)) || Number(perf.trades) < 8) return null;
      const winRateBase = baseline.winRate;
      const pfBase = baseline.profitFactor;
      const winRateDelta =
        winRateBase != null && Number.isFinite(Number(winRateBase)) ? perf.winRate - Number(winRateBase) : null;
      const pfDelta =
        pfBase != null && Number.isFinite(Number(pfBase)) && perf.profitFactor != null && Number.isFinite(Number(perf.profitFactor))
          ? Number(perf.profitFactor) - Number(pfBase)
          : null;
      let status: 'ok' | 'warn' | 'poor' = 'ok';
      if ((winRateDelta != null && winRateDelta <= -0.25) || (pfDelta != null && pfDelta <= -1)) {
        status = 'poor';
      } else if ((winRateDelta != null && winRateDelta <= -0.15) || (pfDelta != null && pfDelta <= -0.5)) {
        status = 'warn';
      }
      return {
        status,
        winRateDelta,
        profitFactorDelta: pfDelta,
        trades: perf.trades
      };
    };

    const watcherBaseline = new Map<string, { winRate?: number | null; profitFactor?: number | null }>();
    const watchersNow = Array.isArray(input.setupWatchers) ? input.setupWatchers : [];
    for (const watcher of watchersNow) {
      if (!watcher?.id || !watcher.libraryStats) continue;
      watcherBaseline.set(String(watcher.id), {
        winRate: watcher.libraryStats?.winRate ?? null,
        profitFactor: watcher.libraryStats?.profitFactor ?? null
      });
    }

    const libraryBaseline = new Map<string, { winRate?: number | null; profitFactor?: number | null }>();
    const libraryNow = Array.isArray(input.setupLibrary) ? input.setupLibrary : [];
    for (const entry of libraryNow) {
      if (!entry?.key) continue;
      libraryBaseline.set(String(entry.key), {
        winRate: entry.stats?.winRate ?? null,
        profitFactor: entry.stats?.profitFactor ?? null
      });
    }

    const watcherObj: Record<string, SetupPerformance> = {};
    for (const [key, agg] of watcherAgg.entries()) {
      const perf = finalize(agg);
      const drift = computeDrift(perf, watcherBaseline.get(key));
      if (drift) perf.drift = drift;
      watcherObj[key] = perf;
    }

    const libraryObj: Record<string, SetupPerformance> = {};
    for (const [key, agg] of libraryAgg.entries()) {
      const perf = finalize(agg);
      const drift = computeDrift(perf, libraryBaseline.get(key));
      if (drift) perf.drift = drift;
      libraryObj[key] = perf;
    }

    const modeObj: Record<string, SetupPerformance> = {};
    for (const [key, agg] of modeAgg.entries()) {
      modeObj[key] = finalize(agg);
    }

    const symbolObj: Record<string, SetupPerformance> = {};
    for (const [key, agg] of symbolAgg.entries()) {
      symbolObj[key] = finalize(agg);
    }

    const summaryAgg = overallAgg.get(overallKey);
    const summary = summaryAgg ? finalize(summaryAgg) : null;

    return {
      ok: true,
      playbookStatus,
      watcherObj,
      libraryObj,
      modeObj,
      symbolObj,
      summary
    };
  } catch (err: any) {
    const message = err?.message ? String(err.message) : 'Failed to compute setup performance.';
    return { ok: false, error: message };
  }
}
