import type { CrossPanelContext } from '../types';

type ContextListener = (context: CrossPanelContext | null) => void;

type PublishOptions = {
  debounceMs?: number;
  merge?: boolean;
};

const sanitizeText = (value: any) => {
  const text = String(value || '').trim();
  return text ? text : null;
};

const sanitizeContext = (input: Partial<CrossPanelContext> | null | undefined): CrossPanelContext | null => {
  if (!input || typeof input !== 'object') return null;
  const next: CrossPanelContext = {
    symbol: sanitizeText(input.symbol),
    timeframe: sanitizeText(input.timeframe),
    session: sanitizeText(input.session),
    agentId: sanitizeText(input.agentId),
    strategyId: sanitizeText(input.strategyId),
    originPanel: sanitizeText(input.originPanel),
    updatedAtMs: Number.isFinite(Number(input.updatedAtMs)) ? Number(input.updatedAtMs) : Date.now()
  };
  const hasData = !!(next.symbol || next.timeframe || next.session || next.agentId || next.strategyId || next.originPanel);
  return hasData ? next : null;
};

class CrossPanelContextEngine {
  private context: CrossPanelContext | null = null;
  private listeners = new Set<ContextListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: CrossPanelContext | null = null;

  private notify() {
    const snapshot = this.context ? { ...this.context } : null;
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(snapshot);
      } catch {
        // ignore listener errors
      }
    }
  }

  private commit(next: CrossPanelContext | null) {
    this.context = next ? { ...next, updatedAtMs: Date.now() } : null;
    this.pending = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.notify();
  }

  getContext() {
    return this.context ? { ...this.context } : null;
  }

  publish(input: Partial<CrossPanelContext>, options?: PublishOptions) {
    const merge = options?.merge !== false;
    const base = merge ? (this.pending || this.context || {}) : {};
    const merged = sanitizeContext({
      ...(base || {}),
      ...(input || {}),
      updatedAtMs: Date.now()
    });
    const debounceMs = Number.isFinite(Number(options?.debounceMs)) ? Math.max(0, Math.floor(Number(options?.debounceMs))) : 80;
    if (debounceMs <= 0) {
      this.commit(merged);
      return;
    }
    this.pending = merged;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.commit(this.pending);
    }, debounceMs);
  }

  clear(originPanel?: string) {
    this.commit(originPanel ? { originPanel: sanitizeText(originPanel), updatedAtMs: Date.now() } : null);
  }

  subscribe(listener: ContextListener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

let singleton: CrossPanelContextEngine | null = null;

export const getCrossPanelContextEngine = () => {
  if (!singleton) singleton = new CrossPanelContextEngine();
  return singleton;
};
