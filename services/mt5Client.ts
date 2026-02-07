import { normalizeSymbolKey } from "./symbols";

const DEFAULT_WS_URL = "ws://127.0.0.1:8001/ws/ticks";
const STORAGE_WS_URL = "glass_mt5_bridge_ws_url";

const getHttpBaseUrl = () => {
  try {
    const stored = localStorage.getItem(STORAGE_WS_URL) || DEFAULT_WS_URL;
    const parsed = new URL(stored);
    const scheme = parsed.protocol === "wss:" ? "https:" : "http:";
    return `${scheme}//${parsed.host}`;
  } catch {
    return "http://127.0.0.1:8001";
  }
};

const scoreCandidate = (query: string, candidate: string) => {
  const rawQuery = String(query || "").trim();
  const rawCandidate = String(candidate || "").trim();
  if (!rawQuery || !rawCandidate) return 0;
  const queryUpper = rawQuery.toUpperCase();
  const candidateUpper = rawCandidate.toUpperCase();
  const queryKey = normalizeSymbolKey(queryUpper);
  const candidateKey = normalizeSymbolKey(candidateUpper);
  let score = 0;
  if (candidateUpper === queryUpper) score += 1000;
  if (queryKey && candidateKey === queryKey) score += 900;
  if (queryKey && candidateKey.startsWith(queryKey)) score += 700;
  if (candidateUpper.startsWith(queryUpper)) score += 600;
  if (candidateUpper.includes(queryUpper)) score += 500;
  return score;
};

const pickBest = (query: string, symbols: string[]) => {
  let best: string | null = null;
  let bestScore = 0;
  for (const symbol of symbols) {
    const score = scoreCandidate(query, symbol);
    if (score > bestScore) {
      bestScore = score;
      best = symbol;
    }
  }
  return best;
};

export const fetchMt5 = async (path: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${getHttpBaseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      },
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : "Request failed" };
  } finally {
    window.clearTimeout(timeout);
  }
};

export const resolveMt5SymbolBestEffort = async (raw: string) => {
  const query = String(raw || "").trim();
  if (!query) return "";
  const res = await fetchMt5(`/symbols?query=${encodeURIComponent(query)}&limit=100`);
  if (!res.ok || !Array.isArray(res.data?.symbols)) return query;
  const best = pickBest(query, res.data.symbols);
  return best || query;
};

export const fetchMt5AccountSpec = async () => {
  const res = await fetchMt5("/account");
  if (!res.ok || !res.data?.account) return null;
  const account = res.data.account;
  return {
    equity: Number(account?.equity),
    balance: Number(account?.balance),
    currency: account?.currency ?? null,
    accountKey: account?.login != null ? String(account.login) : "mt5",
    netting: account?.margin_mode === 0 ? true : null,
    updatedAtMs: Date.now()
  };
};

export const fetchMt5Quote = async (symbol: string) => {
  const cleaned = String(symbol || "").trim();
  if (!cleaned) return null;
  const res = await fetchMt5(`/quote?symbol=${encodeURIComponent(cleaned)}`);
  if (!res.ok || !res.data?.quote) return null;
  const quote = res.data.quote;
  const rawTs = quote.time_msc ?? quote.time ?? null;
  const timestampMs =
    rawTs != null && Number.isFinite(Number(rawTs))
      ? (Number(rawTs) > 1e12 ? Number(rawTs) : Number(rawTs) * 1000)
      : null;
  return {
    symbol: quote.symbol || cleaned,
    bid: quote.bid ?? null,
    ask: quote.ask ?? null,
    mid: quote.mid ?? null,
    timestampMs,
    fetchedAtMs: quote.local_ts_ms ?? null
  };
};
