export type DedupeFallbackResult = {
  blocked: boolean;
  previousAtMs?: number | null;
};

const pruneDedupeMap = (map: Map<string, number>, windowMs: number, now: number) => {
  const expiry = Math.max(windowMs * 2, 30_000);
  for (const [k, ts] of map.entries()) {
    if (!Number.isFinite(ts) || now - ts > expiry) {
      map.delete(k);
    }
  }
};

export const reserveDedupeFallback = (map: Map<string, number>, key: string, windowMs: number, nowMs?: number) => {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  pruneDedupeMap(map, windowMs, now);
  const last = map.get(key) || 0;
  if (last && now - last < windowMs) {
    return { blocked: true, previousAtMs: last } as DedupeFallbackResult;
  }
  map.set(key, now);
  return { blocked: false, previousAtMs: last || null } as DedupeFallbackResult;
};

export type OmsReserveResult = {
  ok: boolean;
  reserved: boolean;
  entry?: any;
  dedupeKey: string;
  fallback?: boolean;
  previousAtMs?: number | null;
  error?: string | null;
};

export const reserveLedgerEntry = async (input: {
  ledger?: any;
  dedupeKey: string;
  windowMs: number;
  entry: any;
  fallbackMap?: Map<string, number>;
  fallbackWindowMs?: number;
}) => {
  const { ledger, dedupeKey, windowMs, entry, fallbackMap, fallbackWindowMs } = input;
  const fallback = (): OmsReserveResult => {
    if (!fallbackMap) {
      return { ok: false, reserved: false, dedupeKey, error: 'Dedupe fallback unavailable.' };
    }
    const res = reserveDedupeFallback(fallbackMap, dedupeKey, fallbackWindowMs || windowMs);
    return {
      ok: true,
      reserved: !res.blocked,
      dedupeKey,
      fallback: true,
      previousAtMs: res.previousAtMs ?? null
    };
  };

  if (!ledger?.reserve) return fallback();
  try {
    const res = await ledger.reserve({
      dedupeKey,
      windowMs,
      entry
    });
    if (res?.ok) {
      return {
        ok: true,
        reserved: res?.reserved !== false,
        entry: res?.entry,
        dedupeKey,
        fallback: false
      };
    }
  } catch {
    // ignore ledger failures
  }
  return fallback();
};
