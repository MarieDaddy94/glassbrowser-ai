import type { PanelActionRequest, PanelActionResult, PanelConnectivityState } from '../types';

type CatalogRunner = (input: PanelActionRequest) => Promise<any> | any;
type FallbackRunner = (request: PanelActionRequest) => Promise<any> | any;

type InternalConnectivityState = {
  source: string;
  panel: string;
  ready: boolean;
  latencyMs: number | null;
  error: string | null;
  blockedReason: string | null;
  updatedAt: number;
  failureCount: number;
  blockedUntilMs: number | null;
};

type RunActionInput = {
  panel: string;
  request: PanelActionRequest;
  runActionCatalog?: CatalogRunner;
  fallback?: FallbackRunner;
  source?: string;
  fallbackSource?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export type CreatePanelActionRunnerInput = {
  panel: string;
  runActionCatalog?: CatalogRunner;
  defaultSource?: string;
  defaultFallbackSource?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export type PanelActionRunner = (
  actionId: string,
  payload?: Record<string, any>,
  options?: {
    fallback?: FallbackRunner;
    source?: string;
    fallbackSource?: string;
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
  }
) => Promise<PanelActionResult>;

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 120;
const MAX_BACKOFF_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message || error.name || 'unknown_error';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown_error';
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`timeout:${label}`));
      }, timeoutMs);
    })
  ]);
};

class PanelConnectivityEngine {
  private stateByKey = new Map<string, InternalConnectivityState>();

  private toKey(panel: string, source: string) {
    return `${String(panel || 'panel').trim().toLowerCase()}::${String(source || 'source').trim().toLowerCase()}`;
  }

  private resolveState(panel: string, source: string): InternalConnectivityState {
    const key = this.toKey(panel, source);
    const existing = this.stateByKey.get(key);
    if (existing) return existing;
    const created: InternalConnectivityState = {
      source,
      panel,
      ready: true,
      latencyMs: null,
      error: null,
      blockedReason: null,
      updatedAt: Date.now(),
      failureCount: 0,
      blockedUntilMs: null
    };
    this.stateByKey.set(key, created);
    return created;
  }

  private markSuccess(panel: string, source: string, latencyMs: number | null) {
    const state = this.resolveState(panel, source);
    state.ready = true;
    state.latencyMs = Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null;
    state.error = null;
    state.blockedReason = null;
    state.updatedAt = Date.now();
    state.failureCount = 0;
    state.blockedUntilMs = null;
  }

  private markFailure(panel: string, source: string, error: string, latencyMs: number | null) {
    const state = this.resolveState(panel, source);
    state.ready = false;
    state.latencyMs = Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null;
    state.error = error || 'unknown_error';
    state.blockedReason = null;
    state.updatedAt = Date.now();
    state.failureCount += 1;
    if (state.failureCount >= 3) {
      const exponent = Math.max(0, state.failureCount - 3);
      const backoffMs = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, exponent));
      state.blockedUntilMs = Date.now() + backoffMs;
      state.blockedReason = 'source_cooldown_active';
    }
  }

  private isBlocked(panel: string, source: string, now: number) {
    const state = this.resolveState(panel, source);
    const blockedUntil = Number(state.blockedUntilMs || 0);
    return blockedUntil > now;
  }

  private normalizeCatalogResult(raw: any, source: string): PanelActionResult {
    if (raw == null) {
      return { ok: false, source, error: 'Empty action response.' };
    }
    if (typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'ok')) {
      const ok = raw.ok !== false;
      return {
        ok,
        source,
        data: raw.data ?? raw.payload ?? null,
        error: ok ? null : (raw.error ? String(raw.error) : 'Action failed.'),
        blocked: raw.blocked === true,
        retryAfterMs: Number.isFinite(Number(raw.retryAfterMs)) ? Number(raw.retryAfterMs) : null,
        blockedReason: raw.blockedReason ? String(raw.blockedReason) : null,
        blockedUntilMs: Number.isFinite(Number(raw.blockedUntilMs)) ? Number(raw.blockedUntilMs) : null
      };
    }
    return {
      ok: true,
      source,
      data: raw
    };
  }

  private normalizeFallbackResult(raw: any, source: string): PanelActionResult {
    if (raw == null) {
      return { ok: false, source, error: 'Fallback returned no result.' };
    }
    if (typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'ok')) {
      const ok = raw.ok !== false;
      return {
        ok,
        source,
        data: raw.data ?? raw.payload ?? raw,
        error: ok ? null : (raw.error ? String(raw.error) : 'Fallback failed.'),
        blocked: raw.blocked === true,
        retryAfterMs: Number.isFinite(Number(raw.retryAfterMs)) ? Number(raw.retryAfterMs) : null,
        blockedReason: raw.blockedReason ? String(raw.blockedReason) : null,
        blockedUntilMs: Number.isFinite(Number(raw.blockedUntilMs)) ? Number(raw.blockedUntilMs) : null
      };
    }
    return {
      ok: true,
      source,
      data: raw
    };
  }

  private async runSource(
    panel: string,
    source: string,
    fn: () => Promise<any>,
    options: { timeoutMs: number; retries: number; retryDelayMs: number; normalize: (raw: any, source: string) => PanelActionResult }
  ): Promise<PanelActionResult> {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(250, Math.floor(options.timeoutMs)) : DEFAULT_TIMEOUT_MS;
    const retries = Number.isFinite(options.retries) ? Math.max(0, Math.floor(options.retries)) : DEFAULT_RETRIES;
    const retryDelayMs = Number.isFinite(options.retryDelayMs) ? Math.max(0, Math.floor(options.retryDelayMs)) : DEFAULT_RETRY_DELAY_MS;
    let attempts = 0;

    while (attempts <= retries) {
      attempts += 1;
      const now = Date.now();
      if (this.isBlocked(panel, source, now)) {
        const blocked = this.resolveState(panel, source);
        const blockedUntilMs = Number(blocked.blockedUntilMs || 0) || now;
        const retryAfterMs = Math.max(0, blockedUntilMs - now);
        const blockedReason = blocked.blockedReason || 'source_cooldown_active';
        blocked.ready = false;
        blocked.error = blockedReason;
        blocked.blockedReason = blockedReason;
        blocked.updatedAt = now;
        return {
          ok: false,
          source,
          attempts,
          error: blockedReason,
          blocked: true,
          retryAfterMs,
          blockedReason,
          blockedUntilMs
        };
      }

      const startedAt = Date.now();
      try {
        const raw = await withTimeout(Promise.resolve(fn()), timeoutMs, `${panel}.${source}`);
        const normalized = options.normalize(raw, source);
        const latencyMs = Date.now() - startedAt;
        if (normalized.ok) {
          this.markSuccess(panel, source, latencyMs);
          return {
            ...normalized,
            attempts
          };
        }
        this.markFailure(panel, source, normalized.error || 'action_failed', latencyMs);
        if (attempts <= retries) await sleep(retryDelayMs);
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const message = toErrorMessage(error);
        this.markFailure(panel, source, message, latencyMs);
        if (attempts > retries) {
          return {
            ok: false,
            source,
            attempts,
            timedOut: message.startsWith('timeout:'),
            error: message
          };
        }
        await sleep(retryDelayMs);
      }
    }

    return {
      ok: false,
      source,
      attempts,
      error: 'exhausted_retries'
    };
  }

  async runAction(input: RunActionInput): Promise<PanelActionResult> {
    const panel = String(input.panel || 'panel').trim().toLowerCase();
    const request: PanelActionRequest = {
      actionId: String(input.request?.actionId || '').trim(),
      payload: input.request?.payload && typeof input.request.payload === 'object' ? input.request.payload : {}
    };
    if (!request.actionId) {
      return { ok: false, source: null, error: 'Action id is required.' };
    }

    const timeoutMs = Number.isFinite(input.timeoutMs) ? Number(input.timeoutMs) : DEFAULT_TIMEOUT_MS;
    const retries = Number.isFinite(input.retries) ? Number(input.retries) : DEFAULT_RETRIES;
    const retryDelayMs = Number.isFinite(input.retryDelayMs) ? Number(input.retryDelayMs) : DEFAULT_RETRY_DELAY_MS;
    const source = String(input.source || 'catalog').trim().toLowerCase() || 'catalog';
    const fallbackSource = String(input.fallbackSource || 'fallback').trim().toLowerCase() || 'fallback';

    let catalogResult: PanelActionResult | null = null;
    if (input.runActionCatalog) {
      catalogResult = await this.runSource(
        panel,
        source,
        async () => await input.runActionCatalog!(request),
        {
          timeoutMs,
          retries,
          retryDelayMs,
          normalize: this.normalizeCatalogResult.bind(this)
        }
      );
      if (catalogResult.ok || !input.fallback) {
        return catalogResult;
      }
    }

    if (input.fallback) {
      const fallbackResult = await this.runSource(
        panel,
        fallbackSource,
        async () => await input.fallback!(request),
        {
          timeoutMs,
          retries: 0,
          retryDelayMs: 0,
          normalize: this.normalizeFallbackResult.bind(this)
        }
      );
      if (fallbackResult.ok) {
        return {
          ...fallbackResult,
          fallbackUsed: true,
          attempts: (catalogResult?.attempts || 0) + (fallbackResult.attempts || 1)
        };
      }
      return {
        ok: false,
        source: fallbackResult.source || fallbackSource,
        fallbackUsed: true,
        attempts: (catalogResult?.attempts || 0) + (fallbackResult.attempts || 1),
        error: fallbackResult.error || catalogResult?.error || 'Action failed.'
      };
    }

    return catalogResult || {
      ok: false,
      source,
      error: 'No action runners available.'
    };
  }

  getSnapshot(now: number = Date.now()): PanelConnectivityState[] {
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const rows = Array.from(this.stateByKey.values()).map((entry) => ({
      source: entry.source,
      panel: entry.panel,
      ready: entry.ready,
      latencyMs: entry.latencyMs,
      error: entry.error,
      updatedAt: entry.updatedAt,
      failureCount: entry.failureCount,
      blocked: !!(entry.blockedUntilMs && entry.blockedUntilMs > ts),
      retryAfterMs: entry.blockedUntilMs && entry.blockedUntilMs > ts ? Math.max(0, entry.blockedUntilMs - ts) : null,
      blockedReason: entry.blockedUntilMs && entry.blockedUntilMs > ts ? (entry.blockedReason || 'source_cooldown_active') : null,
      blockedUntilMs: entry.blockedUntilMs && entry.blockedUntilMs > ts ? entry.blockedUntilMs : null
    }));
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return rows;
  }
}

let singleton: PanelConnectivityEngine | null = null;

export const getPanelConnectivityEngine = () => {
  if (!singleton) singleton = new PanelConnectivityEngine();
  return singleton;
};

export const createPanelActionRunner = (input: CreatePanelActionRunnerInput): PanelActionRunner => {
  const engine = getPanelConnectivityEngine();
  return async (actionId, payload, options) => {
    return await engine.runAction({
      panel: input.panel,
      request: { actionId, payload: payload && typeof payload === 'object' ? payload : {} },
      runActionCatalog: input.runActionCatalog,
      fallback: options?.fallback,
      source: options?.source || input.defaultSource || 'catalog',
      fallbackSource: options?.fallbackSource || input.defaultFallbackSource || 'fallback',
      timeoutMs: options?.timeoutMs ?? input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: options?.retries ?? input.retries ?? DEFAULT_RETRIES,
      retryDelayMs: options?.retryDelayMs ?? input.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    });
  };
};
