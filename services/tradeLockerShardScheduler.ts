import { getRuntimeScheduler, type RuntimeScheduler } from './runtimeScheduler';
import type { TradeLockerAccountShardState } from '../types';

type ShardQueueEntry<T> = {
  accountKey: string;
  taskId: string;
  run: () => Promise<T>;
  queuedAtMs: number;
};

type ShardState = TradeLockerAccountShardState & {
  accountKey: string;
  inFlight: number;
  queued: number;
  actionRuns: number;
  actionFailures: number;
  chain: Promise<void>;
};

type EnqueueOptions = {
  priority?: 'critical' | 'high' | 'normal' | 'low';
  bypassCooldown?: boolean;
};

export type TradeLockerShardSchedulerOptions = {
  scheduler?: RuntimeScheduler;
  maxQueueDepth?: number;
};

const normText = (value: unknown) => String(value || '').trim();

export const createTradeLockerShardScheduler = (opts?: TradeLockerShardSchedulerOptions) => {
  const scheduler = opts?.scheduler || getRuntimeScheduler();
  const shardByAccount = new Map<string, ShardState>();
  const maxQueueDepth = Math.max(10, Number(opts?.maxQueueDepth || 120));
  const taskDisposers = new Map<string, () => void>();

  const now = () => Date.now();

  const ensureShard = (accountKeyRaw: unknown): ShardState => {
    const accountKey = normText(accountKeyRaw);
    const existing = shardByAccount.get(accountKey);
    if (existing) return existing;
    const created: ShardState = {
      accountKey,
      queueDepth: 0,
      rateBudget: 0,
      circuitState: 'closed',
      lastError: null,
      lastReconcileAtMs: null,
      inFlight: 0,
      queued: 0,
      actionRuns: 0,
      actionFailures: 0,
      chain: Promise.resolve()
    };
    shardByAccount.set(accountKey, created);
    return created;
  };

  const updateShard = (accountKeyRaw: unknown, patch: Partial<TradeLockerAccountShardState>) => {
    const shard = ensureShard(accountKeyRaw);
    const next: ShardState = {
      ...shard,
      ...patch,
      accountKey: shard.accountKey
    };
    shardByAccount.set(shard.accountKey, next);
    return next;
  };

  const enqueue = async <T,>(
    accountKeyRaw: unknown,
    taskIdRaw: unknown,
    run: () => Promise<T> | T,
    opts?: EnqueueOptions
  ): Promise<{ ok: boolean; error?: string | null; data?: T | null; queued?: number; code?: string | null }> => {
    const accountKey = normText(accountKeyRaw);
    const taskId = normText(taskIdRaw) || 'task';
    if (!accountKey) return { ok: false, error: 'account_key_required', code: 'account_key_required' };
    const shard = ensureShard(accountKey);
    const cooldownUntil = Number(shard.rateBudget || 0);
    if ((opts?.bypassCooldown !== true) && cooldownUntil > now()) {
      return { ok: false, error: 'shard_cooldown_active', code: 'shard_cooldown_active' };
    }
    if (shard.queued >= maxQueueDepth) {
      return { ok: false, error: 'shard_queue_full', code: 'shard_queue_full', queued: shard.queued };
    }
    shard.queued += 1;
    shard.queueDepth = shard.queued + shard.inFlight;
    const entry: ShardQueueEntry<T> = {
      accountKey,
      taskId,
      run: async () => await Promise.resolve(run()),
      queuedAtMs: now()
    };
    let output: { ok: boolean; error?: string | null; data?: T | null; code?: string | null } = { ok: false, error: 'unknown' };
    shard.chain = shard.chain.then(async () => {
      shard.queued = Math.max(0, shard.queued - 1);
      shard.inFlight += 1;
      shard.queueDepth = shard.queued + shard.inFlight;
      shard.actionRuns += 1;
      try {
        const data = await entry.run();
        output = { ok: true, data };
        shard.lastError = null;
      } catch (err: any) {
        shard.actionFailures += 1;
        const message = err?.message ? String(err.message) : `${entry.taskId}_failed`;
        output = { ok: false, error: message, code: 'task_failed' };
        shard.lastError = message;
      } finally {
        shard.inFlight = Math.max(0, shard.inFlight - 1);
        shard.queueDepth = shard.queued + shard.inFlight;
      }
    });
    await shard.chain;
    return { ...output, queued: shard.queued };
  };

  const registerShardTask = (input: {
    accountKey: string;
    taskId: string;
    intervalMs: number;
    priority?: 'critical' | 'high' | 'normal' | 'low';
    run: () => Promise<void> | void;
  }) => {
    const accountKey = normText(input.accountKey);
    const taskId = normText(input.taskId) || 'task';
    if (!accountKey) return () => {};
    const compositeId = `tradelocker.shard.${accountKey}.${taskId}`.replace(/[^a-zA-Z0-9._:-]/g, '_');
    taskDisposers.get(compositeId)?.();
    const dispose = scheduler.registerTask({
      id: compositeId,
      groupId: `tradelocker.shard.${accountKey}`,
      intervalMs: Math.max(300, Math.round(Number(input.intervalMs) || 1000)),
      jitterPct: 0.1,
      visibilityMode: 'foreground',
      priority: input.priority || 'normal',
      run: async () => {
        await enqueue(accountKey, taskId, async () => {
          await Promise.resolve(input.run());
          return null;
        }, { priority: input.priority });
      }
    });
    taskDisposers.set(compositeId, dispose);
    return () => {
      taskDisposers.get(compositeId)?.();
      taskDisposers.delete(compositeId);
    };
  };

  const getSnapshot = (): ShardState[] =>
    Array.from(shardByAccount.values()).map((entry) => ({ ...entry })).sort((a, b) => String(a.accountKey).localeCompare(String(b.accountKey)));

  const getTelemetry = () => {
    const shards = getSnapshot();
    return {
      shardCount: shards.length,
      totalQueueDepth: shards.reduce((sum, item) => sum + Number(item.queueDepth || 0), 0),
      totalRuns: shards.reduce((sum, item) => sum + Number(item.actionRuns || 0), 0),
      totalFailures: shards.reduce((sum, item) => sum + Number(item.actionFailures || 0), 0)
    };
  };

  const setShardCooldown = (accountKeyRaw: unknown, untilMsRaw: unknown) => {
    const untilMs = Number(untilMsRaw);
    const next = Number.isFinite(untilMs) ? untilMs : 0;
    return updateShard(accountKeyRaw, { rateBudget: next });
  };

  const setShardCircuitState = (accountKeyRaw: unknown, state: TradeLockerAccountShardState['circuitState'], error?: string | null) => {
    return updateShard(accountKeyRaw, {
      circuitState: state || 'closed',
      lastError: error ?? null
    });
  };

  const markShardReconciled = (accountKeyRaw: unknown, atMsRaw?: unknown) => {
    const atMs = Number(atMsRaw);
    return updateShard(accountKeyRaw, {
      lastReconcileAtMs: Number.isFinite(atMs) ? atMs : now(),
      lastError: null
    });
  };

  const dispose = () => {
    for (const [id, stop] of taskDisposers.entries()) {
      try {
        stop();
      } catch {
        // ignore dispose failures
      }
      taskDisposers.delete(id);
    }
  };

  return {
    ensureShard,
    updateShard,
    enqueue,
    registerShardTask,
    getSnapshot,
    getTelemetry,
    setShardCooldown,
    setShardCircuitState,
    markShardReconciled,
    dispose
  };
};

export type TradeLockerShardScheduler = ReturnType<typeof createTradeLockerShardScheduler>;
