type ActionResult = { ok: boolean; error?: string; data?: any };

type MutableRef<T> = { current: T };

export type RunChangesShadowActionRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  executeCatalogAction: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any>;
  refreshShadowTrades: (opts?: any) => Promise<any>;
  shadowTradeStatsRef: MutableRef<any>;
  shadowTradeCompareRef: MutableRef<any>;
  shadowTradeCompareAtRef: MutableRef<number>;
  shadowLedgerCacheRef: MutableRef<{ atMs: number; entries: any[] } | null>;
  shadowTradeStatsState: any;
  shadowTradeCompareState: any;
  setShadowTradeCompare: (next: any) => void;
  normalizeSymbolKey: (value: any) => string;
  isShadowEntry: (entry: any) => boolean;
  isEntryClosed: (entry: any) => boolean;
  buildShadowTradeCompare: (entries: any[], opts?: any) => { summary: any; pairs?: any };
};

export async function runChangesShadowActionRuntime(
  input: RunChangesShadowActionRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(input.actionId || '').trim();
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};

  if (actionId === 'changes.list') {
    const res = await input.executeCatalogAction({ actionId: 'audit.list', payload });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to load changes.' } };
    return { handled: true, result: { ok: true, data: res.data || null } };
  }

  if (actionId === 'changes.export') {
    const res = await input.executeCatalogAction({ actionId: 'audit.export', payload });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to export changes.' } };
    return { handled: true, result: { ok: true, data: res.data || null } };
  }

  if (actionId === 'changes.filters.set') {
    const detail = {
      rangeHours: payload.rangeHours,
      limit: payload.limit,
      symbol: payload.symbol || payload.filterSymbol || null
    };
    try {
      window.dispatchEvent(new CustomEvent('glass_changes_filters', { detail }));
    } catch {
      return { handled: true, result: { ok: false, error: 'Unable to update Changes filters.' } };
    }
    return { handled: true, result: { ok: true, data: detail } };
  }

  if (actionId === 'shadow.stats.get') {
    const includePaper = payload.includePaper === true;
    const res = await input.refreshShadowTrades({ force: true, includeCompare: true, includePaper });
    if (!res?.ok) return { handled: true, result: { ok: false, error: res?.error || 'Failed to refresh shadow trades.' } };
    return {
      handled: true,
      result: {
        ok: true,
        data: {
          stats: input.shadowTradeStatsRef.current ?? input.shadowTradeStatsState ?? null,
          compare: input.shadowTradeCompareRef.current ?? input.shadowTradeCompareState ?? null
        }
      }
    };
  }

  if (actionId === 'shadow.trades.list') {
    const ledger = (window as any).glass?.tradeLedger;
    if (!ledger?.list) return { handled: true, result: { ok: false, error: 'Trade ledger unavailable.' } };
    const now = Date.now();
    const limit = Number(payload.limit ?? payload.max ?? 500);
    const effectiveLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 500;
    const allowCache = payload.useCache !== false;
    const cache = allowCache ? input.shadowLedgerCacheRef.current : null;
    const cacheAge = cache ? now - cache.atMs : Infinity;
    let entries = cache && cacheAge < 15_000 ? cache.entries : null;
    if (!entries) {
      const res = await ledger.list({ limit: 3000 });
      if (!res?.ok || !Array.isArray(res.entries)) return { handled: true, result: { ok: false, error: res?.error || 'Failed to load ledger.' } };
      entries = res.entries;
      input.shadowLedgerCacheRef.current = { atMs: now, entries };
    }
    const symbolFilter = input.normalizeSymbolKey(String(payload.symbol || payload.filterSymbol || ''));
    const timeframeFilter = String(payload.timeframe || payload.tf || '').trim();
    const includeOpen = payload.includeOpen !== false;
    const list = entries
      .filter((entry: any) => entry?.kind === 'trade' && input.isShadowEntry(entry))
      .filter((entry: any) => {
        if (!includeOpen && !input.isEntryClosed(entry)) return false;
        if (symbolFilter) {
          const entrySymbol = input.normalizeSymbolKey(String(entry?.symbol || ''));
          if (entrySymbol !== symbolFilter) return false;
        }
        if (timeframeFilter) {
          const entryTf = String(entry?.setupTimeframe || entry?.timeframe || '').trim();
          if (entryTf !== timeframeFilter) return false;
        }
        return true;
      });
    return { handled: true, result: { ok: true, data: { entries: list.slice(0, effectiveLimit), total: list.length } } };
  }

  if (actionId === 'shadow.compare') {
    const ledger = (window as any).glass?.tradeLedger;
    if (!ledger?.list) return { handled: true, result: { ok: false, error: 'Trade ledger unavailable.' } };
    const now = Date.now();
    const includePairs = payload.includePairs === true;
    const includePaper = payload.includePaper === true;
    const allowCache = payload.useCache !== false;
    const cache = allowCache ? input.shadowLedgerCacheRef.current : null;
    const cacheAge = cache ? now - cache.atMs : Infinity;
    let entries = cache && cacheAge < 15_000 ? cache.entries : null;
    if (!entries) {
      const res = await ledger.list({ limit: 3000 });
      if (!res?.ok || !Array.isArray(res.entries)) return { handled: true, result: { ok: false, error: res?.error || 'Failed to load ledger.' } };
      entries = res.entries;
      input.shadowLedgerCacheRef.current = { atMs: now, entries };
    }
    const compare = input.buildShadowTradeCompare(entries, { includePairs, includePaper });
    input.shadowTradeCompareRef.current = compare.summary;
    input.shadowTradeCompareAtRef.current = now;
    input.setShadowTradeCompare(compare.summary);
    return { handled: true, result: { ok: true, data: { summary: compare.summary, pairs: includePairs ? compare.pairs : undefined } } };
  }

  return { handled: false };
}
