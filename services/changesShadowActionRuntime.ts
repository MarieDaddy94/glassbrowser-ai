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

const CHANGE_AGGREGATION_WINDOW_MS = 90_000;
const CHANGE_AGGREGATION_LIMIT = 4_000;

const buildAggregationKey = (entry: any) => {
  const eventType = String(entry?.eventType || '').trim().toLowerCase();
  const level = String(entry?.level || '').trim().toLowerCase();
  const symbol = String(entry?.symbol || '').trim().toLowerCase();
  const source = String(entry?.source || '').trim().toLowerCase();
  const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : null;
  const reason = String(
    payload?.reason ||
      payload?.error ||
      payload?.note ||
      payload?.message ||
      payload?.resolution ||
      ''
  )
    .trim()
    .toLowerCase();
  return [eventType, level, symbol, source, reason].join('|');
};

const readAggregateCount = (entry: any) => {
  const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : null;
  const direct = Number(payload?.aggregatedCount);
  if (Number.isFinite(direct) && direct > 0) return Math.max(1, Math.floor(direct));
  const suppressed = Number(payload?.suppressedCount);
  if (Number.isFinite(suppressed) && suppressed > 0) return Math.max(1, Math.floor(suppressed) + 1);
  return 1;
};

const aggregateChangeEntries = (entries: any[], limit: number) => {
  const safeEntries = Array.isArray(entries) ? entries.slice() : [];
  safeEntries.sort((a, b) => Number(b?.createdAtMs || 0) - Number(a?.createdAtMs || 0));

  const groups = new Map<
    string,
    {
      entry: any;
      firstAtMs: number;
      lastAtMs: number;
      count: number;
      ids: Set<string>;
    }
  >();

  for (const entry of safeEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const createdAtMs = Number(entry.createdAtMs || 0);
    const bucket = Math.floor((Number.isFinite(createdAtMs) ? createdAtMs : 0) / CHANGE_AGGREGATION_WINDOW_MS);
    const key = `${bucket}|${buildAggregationKey(entry)}`;
    const count = readAggregateCount(entry);
    const id = entry.id ? String(entry.id) : null;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        entry,
        firstAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        lastAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        count,
        ids: new Set(id ? [id] : [])
      });
      continue;
    }
    existing.count += count;
    existing.firstAtMs = Math.min(existing.firstAtMs, Number.isFinite(createdAtMs) ? createdAtMs : existing.firstAtMs);
    existing.lastAtMs = Math.max(existing.lastAtMs, Number.isFinite(createdAtMs) ? createdAtMs : existing.lastAtMs);
    if (id) existing.ids.add(id);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.lastAtMs - a.lastAtMs)
    .slice(0, Math.max(1, Math.min(CHANGE_AGGREGATION_LIMIT, limit)))
    .map((group) => {
      const payload = group.entry?.payload && typeof group.entry.payload === 'object'
        ? { ...group.entry.payload }
        : {};
      payload.aggregatedCount = group.count;
      payload.suppressedCount = Math.max(0, group.count - 1);
      payload.windowMs = CHANGE_AGGREGATION_WINDOW_MS;
      payload.firstAtMs = group.firstAtMs || null;
      payload.lastAtMs = group.lastAtMs || null;
      return {
        ...group.entry,
        id: group.entry?.id || `changes_agg_${group.lastAtMs}_${group.count}`,
        payload,
        createdAtMs: group.lastAtMs || group.entry?.createdAtMs || null
      };
    });
};

export async function runChangesShadowActionRuntime(
  input: RunChangesShadowActionRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(input.actionId || '').trim();
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};

  if (actionId === 'changes.list') {
    const res = await input.executeCatalogAction({ actionId: 'audit.list', payload });
    if (!res.ok) return { handled: true, result: { ok: false, error: res.error || 'Failed to load changes.' } };
    const data = res.data && typeof res.data === 'object' ? res.data : {};
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const limit = Number.isFinite(Number(payload.limit)) ? Math.max(1, Math.floor(Number(payload.limit))) : 800;
    const aggregatedEntries = aggregateChangeEntries(entries, limit);
    return {
      handled: true,
      result: {
        ok: true,
        data: {
          ...data,
          entries: aggregatedEntries,
          rawCount: entries.length,
          aggregatedCount: aggregatedEntries.length,
          aggregatedWindowMs: CHANGE_AGGREGATION_WINDOW_MS
        }
      }
    };
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
