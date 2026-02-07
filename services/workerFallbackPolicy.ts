import type { WorkerTaskEnvelope, WorkerTaskResult, WorkerTaskRouter } from './workerTaskRouter';

export type WorkerFallbackReason =
  | 'worker_init_failed'
  | 'worker_timeout'
  | 'worker_error'
  | 'invalid_payload';

export type WorkerFallbackStats = {
  domain: string;
  total: number;
  fallbackUsed: number;
  fallbackFailures: number;
  fallbackReasons: Partial<Record<WorkerFallbackReason, number>>;
};

type WorkerFallbackInput<TPayload, TResult> = {
  domain: string;
  router: WorkerTaskRouter;
  ensureWorker: () => Worker | null;
  envelope: WorkerTaskEnvelope<TPayload>;
  fallback: () => TResult | Promise<TResult>;
};

type WorkerFallbackResult<TResult> = {
  ok: boolean;
  data?: TResult;
  fallbackUsed: boolean;
  error?: string;
  reason?: WorkerFallbackReason;
};

const statsMap = new Map<string, WorkerFallbackStats>();

const bumpStats = (domain: string, fallbackUsed: boolean, reason?: WorkerFallbackReason) => {
  const key = String(domain || 'unknown').trim() || 'unknown';
  const current = statsMap.get(key) || {
    domain: key,
    total: 0,
    fallbackUsed: 0,
    fallbackFailures: 0,
    fallbackReasons: {}
  };
  current.total += 1;
  if (fallbackUsed) {
    current.fallbackUsed += 1;
    if (reason) {
      current.fallbackReasons[reason] = (current.fallbackReasons[reason] || 0) + 1;
    }
  }
  statsMap.set(key, current);
};

const runFallbackSafely = async <TResult>(
  fallback: () => TResult | Promise<TResult>
): Promise<{ ok: true; data: TResult } | { ok: false; error: string }> => {
  try {
    const data = await Promise.resolve(fallback());
    return { ok: true, data };
  } catch (err: any) {
    const error = err?.message ? String(err.message) : "Worker fallback failed.";
    return { ok: false, error };
  }
};

const classifyReason = (result: WorkerTaskResult<any>): WorkerFallbackReason => {
  const error = String(result?.error || '').toLowerCase();
  if (error.includes('timeout')) return 'worker_timeout';
  if (error.includes('invalid')) return 'invalid_payload';
  return 'worker_error';
};

export const runWorkerTaskWithFallback = async <TPayload, TResult>(
  input: WorkerFallbackInput<TPayload, TResult>
): Promise<WorkerFallbackResult<TResult>> => {
  const worker = input.ensureWorker();
  if (!worker) {
    const fallback = await runFallbackSafely(input.fallback);
    if (!fallback.ok) {
      const key = String(input.domain || 'unknown').trim() || 'unknown';
      const current = statsMap.get(key);
      if (current) {
        current.total += 1;
        current.fallbackUsed += 1;
        current.fallbackFailures += 1;
        current.fallbackReasons.worker_init_failed = (current.fallbackReasons.worker_init_failed || 0) + 1;
        statsMap.set(key, current);
      } else {
        statsMap.set(key, {
          domain: key,
          total: 1,
          fallbackUsed: 1,
          fallbackFailures: 1,
          fallbackReasons: { worker_init_failed: 1 }
        });
      }
      return {
        ok: false,
        fallbackUsed: true,
        reason: 'worker_init_failed',
        error: fallback.error
      };
    }
    bumpStats(input.domain, true, 'worker_init_failed');
    return {
      ok: true,
      data: fallback.data,
      fallbackUsed: true,
      reason: 'worker_init_failed'
    };
  }

  const result = await input.router.dispatch<TPayload, TResult>(worker, input.envelope);
  if (result?.ok && result.data !== undefined) {
    bumpStats(input.domain, false);
    return { ok: true, data: result.data, fallbackUsed: false };
  }

  const reason = classifyReason(result || { ok: false, error: 'worker error' });
  const fallback = await runFallbackSafely(input.fallback);
  if (!fallback.ok) {
    const key = String(input.domain || 'unknown').trim() || 'unknown';
    const current = statsMap.get(key);
    if (current) {
      current.total += 1;
      current.fallbackUsed += 1;
      current.fallbackFailures += 1;
      current.fallbackReasons[reason] = (current.fallbackReasons[reason] || 0) + 1;
      statsMap.set(key, current);
    } else {
      statsMap.set(key, {
        domain: key,
        total: 1,
        fallbackUsed: 1,
        fallbackFailures: 1,
        fallbackReasons: { [reason]: 1 }
      });
    }
    return {
      ok: false,
      fallbackUsed: true,
      reason,
      error: fallback.error
    };
  }
  bumpStats(input.domain, true, reason);
  return {
    ok: true,
    data: fallback.data,
    fallbackUsed: true,
    reason,
    error: result?.error || 'Worker task failed.'
  };
};

export const getWorkerFallbackStats = (): WorkerFallbackStats[] =>
  Array.from(statsMap.values()).map((entry) => ({
      domain: entry.domain,
      total: entry.total,
      fallbackUsed: entry.fallbackUsed,
      fallbackFailures: entry.fallbackFailures,
      fallbackReasons: { ...entry.fallbackReasons }
  }));
