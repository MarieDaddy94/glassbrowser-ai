type LedgerHealthDomain =
  | "academy"
  | "rank"
  | "audit"
  | "changes"
  | "app"
  | "backtest"
  | "unknown";

type LedgerDomainHealth = {
  domain: LedgerHealthDomain;
  ok: boolean;
  lastOkAtMs: number | null;
  lastErrorAtMs: number | null;
  lastError: string | null;
  failures: number;
  writesQueued: number;
};

export type PersistenceHealthSnapshot = {
  overallOk: boolean;
  updatedAtMs: number;
  domains: Record<LedgerHealthDomain, LedgerDomainHealth>;
};

type GenericFn = (...args: any[]) => any;

const DOMAIN_LIST: LedgerHealthDomain[] = [
  "academy",
  "rank",
  "audit",
  "changes",
  "app",
  "backtest",
  "unknown"
];

const createDomainState = (domain: LedgerHealthDomain): LedgerDomainHealth => ({
  domain,
  ok: true,
  lastOkAtMs: null,
  lastErrorAtMs: null,
  lastError: null,
  failures: 0,
  writesQueued: 0
});

const domains = DOMAIN_LIST.reduce((acc, domain) => {
  acc[domain] = createDomainState(domain);
  return acc;
}, {} as Record<LedgerHealthDomain, LedgerDomainHealth>);

let updatedAtMs = Date.now();
const listeners = new Set<(snapshot: PersistenceHealthSnapshot) => void>();

const toDomain = (value: string): LedgerHealthDomain => {
  const key = String(value || "").trim().toLowerCase() as LedgerHealthDomain;
  return DOMAIN_LIST.includes(key) ? key : "unknown";
};

const emit = () => {
  updatedAtMs = Date.now();
  const snapshot = getPersistenceHealthSnapshot();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  }
};

export const recordLedgerHealth = (
  domainInput: string,
  ok: boolean,
  error?: string | null
) => {
  const domain = toDomain(domainInput);
  const state = domains[domain];
  if (ok) {
    state.ok = true;
    state.lastOkAtMs = Date.now();
    state.lastError = null;
    state.failures = 0;
  } else {
    state.ok = false;
    state.lastErrorAtMs = Date.now();
    state.lastError = String(error || "Ledger operation failed.");
    state.failures += 1;
  }
  emit();
};

export const recordLedgerQueueDepth = (domainInput: string, queued: number) => {
  const domain = toDomain(domainInput);
  const state = domains[domain];
  state.writesQueued = Math.max(0, Number.isFinite(Number(queued)) ? Math.floor(Number(queued)) : 0);
  emit();
};

export const getPersistenceHealthSnapshot = (): PersistenceHealthSnapshot => {
  const copy = DOMAIN_LIST.reduce((acc, domain) => {
    const state = domains[domain];
    acc[domain] = { ...state };
    return acc;
  }, {} as Record<LedgerHealthDomain, LedgerDomainHealth>);

  const overallOk = DOMAIN_LIST.every((domain) => copy[domain].ok && copy[domain].writesQueued === 0);
  return { overallOk, updatedAtMs, domains: copy };
};

export const shouldUseLocalFallback = (domainInput: string) => {
  const domain = toDomain(domainInput);
  const state = domains[domain];
  if (state.writesQueued > 0) return true;
  if (!state.ok && state.failures >= 1) return true;
  return false;
};

export const onPersistenceHealthChange = (
  listener: (snapshot: PersistenceHealthSnapshot) => void
) => {
  listeners.add(listener);
  try {
    listener(getPersistenceHealthSnapshot());
  } catch {
    // ignore listener bootstrap errors
  }
  return () => {
    listeners.delete(listener);
  };
};

const METHOD_DOMAIN_MAP: Record<string, LedgerHealthDomain> = {
  listEvents: "audit",
  list: "changes",
  stats: "app",
  appendResearchStep: "backtest",
  createResearchSession: "backtest",
  getResearchSession: "backtest",
  listResearchSessions: "backtest",
  listResearchSteps: "backtest",
  createOptimizerWinner: "backtest",
  getOptimizerWinner: "backtest",
  getOptimizerWinnerBySessionRound: "backtest",
  listOptimizerWinners: "backtest",
  getOptimizerEvalCache: "backtest",
  putOptimizerEvalCache: "backtest"
};

const ACADEMY_KIND_PREFIXES = ["academy_", "signal_", "symbol_scope", "action_flow", "chart_"];
const RANK_KIND_PREFIXES = ["agent_scorecard", "rank_"];
const BACKTEST_KIND_PREFIXES = ["backtest_", "optimizer_", "research_", "playbook_", "agent_test_"];
const AUDIT_KIND_PREFIXES = ["audit_"];
const CHANGES_KIND_PREFIXES = ["changes_", "change_"];

const readKindLike = (input: any): string => {
  if (!input || typeof input !== "object") return "";
  const direct = input.kind != null ? String(input.kind) : "";
  if (direct) return direct.trim().toLowerCase();
  const nested = input.entry && input.entry.kind != null ? String(input.entry.kind) : "";
  if (nested) return nested.trim().toLowerCase();
  return "";
};

const readKeyLike = (input: any): string => {
  if (!input || typeof input !== "object") return "";
  const direct = input.key != null ? String(input.key) : "";
  if (direct) return direct.trim().toLowerCase();
  const nested = input.entry && input.entry.key != null ? String(input.entry.key) : "";
  if (nested) return nested.trim().toLowerCase();
  return "";
};

const inferDomainFromKind = (kindRaw: string, keyRaw: string): LedgerHealthDomain => {
  const kind = String(kindRaw || "").trim().toLowerCase();
  const key = String(keyRaw || "").trim().toLowerCase();
  const source = kind || key;
  if (!source) return "app";
  if (ACADEMY_KIND_PREFIXES.some((prefix) => source.startsWith(prefix))) return "academy";
  if (RANK_KIND_PREFIXES.some((prefix) => source.startsWith(prefix))) return "rank";
  if (BACKTEST_KIND_PREFIXES.some((prefix) => source.startsWith(prefix))) return "backtest";
  if (AUDIT_KIND_PREFIXES.some((prefix) => source.startsWith(prefix))) return "audit";
  if (CHANGES_KIND_PREFIXES.some((prefix) => source.startsWith(prefix))) return "changes";
  return "app";
};

const inferDomainFromMethod = (methodName: string, args: any[]): LedgerHealthDomain => {
  const mapped = METHOD_DOMAIN_MAP[methodName];
  if (mapped) return mapped;
  const firstArg = Array.isArray(args) && args.length > 0 ? args[0] : null;
  if (
    methodName === "listAgentMemory" ||
    methodName === "upsertAgentMemory" ||
    methodName === "deleteAgentMemory" ||
    methodName === "getAgentMemory"
  ) {
    return inferDomainFromKind(readKindLike(firstArg), readKeyLike(firstArg));
  }
  if (methodName === "list" || methodName === "update" || methodName === "append") {
    return inferDomainFromKind(readKindLike(firstArg), readKeyLike(firstArg));
  }
  if (
    methodName.toLowerCase().includes("research") ||
    methodName.toLowerCase().includes("optimizer") ||
    methodName.toLowerCase().includes("backtest")
  ) {
    return "backtest";
  }
  return "app";
};

const proxyCache = new WeakMap<object, any>();

export const instrumentTradeLedger = <T extends object>(ledger: T): T => {
  if (!ledger || typeof ledger !== "object") return ledger;
  const existing = proxyCache.get(ledger as object);
  if (existing) return existing;

  const proxy = new Proxy(ledger as Record<string, any>, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const methodName = String(prop || "");
      const fn = value as GenericFn;
      const wrapped: GenericFn = async (...args: any[]) => {
        const domain = inferDomainFromMethod(methodName, args);
        try {
          const result = await Promise.resolve(fn.apply(target, args));
          const ok = !(result && typeof result === "object" && result.ok === false);
          if (ok) {
            recordLedgerHealth(domain, true);
            if (methodName === "stats" && result && typeof result === "object") {
              const pendingWrites = Number((result as any).pendingWrites || 0);
              if (Number.isFinite(pendingWrites)) {
                recordLedgerQueueDepth("app", pendingWrites);
              }
              const byDomain = (result as any).pendingWritesByDomain;
              if (byDomain && typeof byDomain === "object") {
                for (const [key, value] of Object.entries(byDomain)) {
                  const num = Number(value || 0);
                  if (Number.isFinite(num)) {
                    recordLedgerQueueDepth(key, num);
                  }
                }
              }
            }
            return result;
          }
          const error = String((result as any)?.error || `${methodName} failed`);
          recordLedgerHealth(domain, false, error);
          return result;
        } catch (err: any) {
          recordLedgerHealth(domain, false, err?.message ? String(err.message) : `${methodName} failed`);
          throw err;
        }
      };
      return wrapped;
    }
  });

  proxyCache.set(ledger as object, proxy);
  return proxy as T;
};
