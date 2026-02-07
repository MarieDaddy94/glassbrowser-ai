export type RefreshSlaState = 'idle' | 'on_time' | 'delayed' | 'missed';
export type RefreshSlaChannel = 'signal' | 'snapshot' | 'backtest';

export type RefreshSlaTaskSnapshot = {
  id: string;
  channel: RefreshSlaChannel;
  intervalMs: number;
  state: RefreshSlaState;
  expectedAtMs: number | null;
  nextDueAtMs: number | null;
  delayMs: number;
  lastAttemptAtMs: number | null;
  lastRunAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastSkipAtMs: number | null;
  lastSkipReason: string | null;
  updatedAtMs: number | null;
};

type RefreshSlaTaskConfig = {
  id: string;
  channel: RefreshSlaChannel;
  intervalMs: number;
  delayedMultiplier: number;
  missedMultiplier: number;
};

type RefreshSlaTaskEntry = {
  config: RefreshSlaTaskConfig;
  lastAttemptAtMs: number | null;
  lastRunAtMs: number | null;
  lastSuccessAtMs: number | null;
  lastSkipAtMs: number | null;
  lastSkipReason: string | null;
  updatedAtMs: number | null;
};

const MIN_INTERVAL_MS = 1000;
const DEFAULT_DELAYED_MULTIPLIER = 1.5;
const DEFAULT_MISSED_MULTIPLIER = 3;
const VALID_CHANNELS: RefreshSlaChannel[] = ['signal', 'snapshot', 'backtest'];

const toIntervalMs = (value: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return MIN_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, Math.floor(num));
};

const toMultiplier = (value: number, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, num);
};

const normalizeChannel = (value: any): RefreshSlaChannel => {
  const raw = String(value || '').trim().toLowerCase();
  if ((VALID_CHANNELS as string[]).includes(raw)) return raw as RefreshSlaChannel;
  if (raw.includes('snapshot')) return 'snapshot';
  if (raw.includes('backtest')) return 'backtest';
  return 'signal';
};

export class RefreshSlaMonitor {
  private readonly tasks = new Map<string, RefreshSlaTaskEntry>();

  ensureTask(input: {
    id: string;
    channel?: RefreshSlaChannel | string;
    intervalMs: number;
    delayedMultiplier?: number;
    missedMultiplier?: number;
  }) {
    const id = String(input?.id || '').trim();
    if (!id) return;
    const now = Date.now();
    const existing = this.tasks.get(id);
    const nextConfig: RefreshSlaTaskConfig = {
      id,
      channel: normalizeChannel(input.channel || id),
      intervalMs: toIntervalMs(input.intervalMs),
      delayedMultiplier: toMultiplier(input.delayedMultiplier ?? DEFAULT_DELAYED_MULTIPLIER, DEFAULT_DELAYED_MULTIPLIER),
      missedMultiplier: toMultiplier(input.missedMultiplier ?? DEFAULT_MISSED_MULTIPLIER, DEFAULT_MISSED_MULTIPLIER)
    };
    if (!existing) {
      this.tasks.set(id, {
        config: nextConfig,
        lastAttemptAtMs: null,
        lastRunAtMs: null,
        lastSuccessAtMs: null,
        lastSkipAtMs: null,
        lastSkipReason: null,
        updatedAtMs: now
      });
      return;
    }
    existing.config = nextConfig;
    existing.updatedAtMs = now;
  }

  noteAttempt(id: string, atMs = Date.now()) {
    const entry = this.tasks.get(String(id || '').trim());
    if (!entry) return;
    entry.lastAttemptAtMs = atMs;
    entry.updatedAtMs = atMs;
  }

  noteRun(id: string, atMs = Date.now()) {
    const entry = this.tasks.get(String(id || '').trim());
    if (!entry) return;
    entry.lastRunAtMs = atMs;
    entry.lastSuccessAtMs = atMs;
    entry.updatedAtMs = atMs;
  }

  noteSkip(id: string, reason?: string | null, atMs = Date.now()) {
    const entry = this.tasks.get(String(id || '').trim());
    if (!entry) return;
    entry.lastSkipAtMs = atMs;
    entry.lastSkipReason = reason ? String(reason).trim() || null : null;
    entry.updatedAtMs = atMs;
  }

  getTaskSnapshot(id: string, now = Date.now()): RefreshSlaTaskSnapshot | null {
    const entry = this.tasks.get(String(id || '').trim());
    if (!entry) return null;
    const intervalMs = entry.config.intervalMs;
    const anchorAtMs = Number(entry.lastSuccessAtMs || entry.lastRunAtMs || entry.lastAttemptAtMs || 0);
    if (!anchorAtMs) {
      return {
        id: entry.config.id,
        channel: entry.config.channel,
        intervalMs,
        state: 'idle',
        expectedAtMs: null,
        nextDueAtMs: null,
        delayMs: 0,
        lastAttemptAtMs: entry.lastAttemptAtMs,
        lastRunAtMs: entry.lastRunAtMs,
        lastSuccessAtMs: entry.lastSuccessAtMs,
        lastSkipAtMs: entry.lastSkipAtMs,
        lastSkipReason: entry.lastSkipReason,
        updatedAtMs: entry.updatedAtMs
      };
    }
    const expectedAtMs = anchorAtMs + intervalMs;
    const delayMs = Math.max(0, now - expectedAtMs);
    const delayedAtMs = anchorAtMs + Math.floor(intervalMs * entry.config.delayedMultiplier);
    const missedAtMs = anchorAtMs + Math.floor(intervalMs * entry.config.missedMultiplier);
    const state: RefreshSlaState =
      now >= missedAtMs
        ? 'missed'
        : now >= delayedAtMs
          ? 'delayed'
          : 'on_time';
    return {
      id: entry.config.id,
      channel: entry.config.channel,
      intervalMs,
      state,
      expectedAtMs,
      nextDueAtMs: expectedAtMs,
      delayMs,
      lastAttemptAtMs: entry.lastAttemptAtMs,
      lastRunAtMs: entry.lastRunAtMs,
      lastSuccessAtMs: entry.lastSuccessAtMs,
      lastSkipAtMs: entry.lastSkipAtMs,
      lastSkipReason: entry.lastSkipReason,
      updatedAtMs: entry.updatedAtMs
    };
  }

  getSnapshot(now = Date.now()): RefreshSlaTaskSnapshot[] {
    const list: RefreshSlaTaskSnapshot[] = [];
    for (const key of this.tasks.keys()) {
      const item = this.getTaskSnapshot(key, now);
      if (item) list.push(item);
    }
    return list;
  }

  getChannelSnapshot(channel: RefreshSlaChannel | string, now = Date.now()) {
    const target = normalizeChannel(channel);
    const candidates = this.getSnapshot(now).filter((item) => item.channel === target);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const aTs = Number(a.lastSuccessAtMs || a.lastRunAtMs || a.updatedAtMs || 0);
      const bTs = Number(b.lastSuccessAtMs || b.lastRunAtMs || b.updatedAtMs || 0);
      return bTs - aTs;
    });
    const newest = candidates[0];
    const worstState = candidates.some((item) => item.state === 'missed')
      ? 'missed'
      : candidates.some((item) => item.state === 'delayed')
        ? 'delayed'
        : candidates.some((item) => item.state === 'on_time')
          ? 'on_time'
          : 'idle';
    return {
      channel: target,
      taskId: newest.id,
      expectedIntervalMs: newest.intervalMs,
      lastRunAt: newest.lastRunAtMs ?? null,
      lastSuccessAt: newest.lastSuccessAtMs ?? newest.lastRunAtMs ?? null,
      delayMs: Math.max(...candidates.map((item) => Number(item.delayMs || 0))),
      state: worstState,
      nextDueAt: newest.nextDueAtMs ?? null
    };
  }

  getChannelSnapshots(now = Date.now()) {
    return VALID_CHANNELS
      .map((channel) => this.getChannelSnapshot(channel, now))
      .filter((item) => !!item);
  }
}

let singleton: RefreshSlaMonitor | null = null;

export const getRefreshSlaMonitor = () => {
  if (!singleton) singleton = new RefreshSlaMonitor();
  return singleton;
};
