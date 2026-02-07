import { getCacheBudgetManager } from './cacheBudgetManager';

export type TechAgentLogEntry = {
  id: string;
  ts: number;
  level: 'error' | 'warn' | 'info';
  source: string;
  message: string;
  detail?: any;
  count?: number;
};

type TechAgentLogInput = {
  message: string;
  level?: 'error' | 'warn' | 'info';
  source?: string;
  detail?: any;
  ts?: number;
};

type LogListener = (entries: TechAgentLogEntry[]) => void;

const STORAGE_KEY = 'glass_tech_agent_logs_v1';
const MAX_LOGS = 600;
const MERGE_WINDOW_MS = 2000;
const MAX_DETAIL_CHARS = 700;

let hydrated = false;
let cache: TechAgentLogEntry[] = [];
const listeners = new Set<LogListener>();
const budgetManager = getCacheBudgetManager();
const TECH_LOG_BUDGET_NAME = 'techAgent.logCache';
budgetManager.register({
  name: TECH_LOG_BUDGET_NAME,
  maxEntries: MAX_LOGS,
  maxAgeMs: 24 * 60 * 60 * 1000
});

const safeReadStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === 'object');
  } catch {
    return [];
  }
};

const safeWriteStorage = (entries: TechAgentLogEntry[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage failures
  }
};

const hydrate = () => {
  if (hydrated) return;
  hydrated = true;
  cache = safeReadStorage();
};

const publish = () => {
  const snapshot = cache.slice();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore listener failures
    }
  });
};

const normalizeLevel = (level: any): TechAgentLogEntry['level'] => {
  const raw = String(level || '').trim().toLowerCase();
  if (raw === 'warn' || raw === 'warning') return 'warn';
  if (raw === 'info') return 'info';
  return 'error';
};

const safeStringify = (value: any) => {
  if (value == null) return '';
  try {
    const text = JSON.stringify(value);
    if (!text) return '';
    return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}...` : text;
  } catch {
    try {
      const text = String(value);
      return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}...` : text;
    } catch {
      return '';
    }
  }
};

export const getTechAgentLogs = () => {
  hydrate();
  budgetManager.setSize(TECH_LOG_BUDGET_NAME, cache.length);
  return cache.slice();
};

export const subscribeTechAgentLogs = (listener: LogListener) => {
  hydrate();
  listeners.add(listener);
  try {
    listener(cache.slice());
  } catch {
    // ignore listener failures
  }
  return () => listeners.delete(listener);
};

export const appendTechAgentLog = (input: TechAgentLogInput) => {
  if (!input || !input.message) return;
  hydrate();
  const ts = typeof input.ts === 'number' && Number.isFinite(input.ts) ? input.ts : Date.now();
  const level = normalizeLevel(input.level);
  const source = String(input.source || 'app').trim() || 'app';
  const message = String(input.message || 'Unknown').trim() || 'Unknown';

  const entry: TechAgentLogEntry = {
    id: `log_${ts}_${Math.random().toString(36).slice(2, 8)}`,
    ts,
    level,
    source,
    message,
    detail: input.detail
  };

  const list = cache.slice();
  const last = list[list.length - 1];
  const key = (e: TechAgentLogEntry) => `${e.level}|${e.source}|${e.message}`;
  if (last && key(last) === key(entry) && ts - last.ts < MERGE_WINDOW_MS) {
    const merged = { ...last, ts, count: (last.count || 1) + 1 };
    list[list.length - 1] = merged;
  } else {
    list.push(entry);
  }

  if (list.length > MAX_LOGS) {
    const removed = list.length - MAX_LOGS;
    list.splice(0, removed);
    budgetManager.noteEviction(TECH_LOG_BUDGET_NAME, removed, 'lru');
  }

  cache = list;
  budgetManager.noteSet(TECH_LOG_BUDGET_NAME, entry.id);
  budgetManager.setSize(TECH_LOG_BUDGET_NAME, cache.length);
  safeWriteStorage(cache);
  publish();
};

export const clearTechAgentLogs = () => {
  hydrate();
  if (cache.length > 0) {
    budgetManager.noteEviction(TECH_LOG_BUDGET_NAME, cache.length, 'lru');
  }
  cache = [];
  budgetManager.setSize(TECH_LOG_BUDGET_NAME, 0);
  safeWriteStorage(cache);
  publish();
};

export const formatTechAgentLogLines = (entries: TechAgentLogEntry[], limit: number) => {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const trimmed = list.slice(-Math.max(0, Math.floor(Number(limit) || 0) || list.length));
  return trimmed
    .map((entry) => {
      const at = new Date(entry.ts).toISOString();
      const detail = safeStringify(entry.detail);
      const count = entry.count && entry.count > 1 ? ` x${entry.count}` : '';
      return `[${at}] [${entry.level.toUpperCase()}] ${entry.source}${count}: ${entry.message}${detail ? ` ${detail}` : ''}`;
    })
    .join('\n');
};
