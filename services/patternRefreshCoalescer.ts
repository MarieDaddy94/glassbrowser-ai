export type PatternRefreshCoalescerOptions<T> = {
  delayMs?: number;
  onRun: (payload: T) => void | Promise<void>;
  onCoalesced?: () => void;
  setTimer?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
};

export type PatternRefreshCoalescer<T> = {
  schedule: (payload: T) => void;
  dispose: () => void;
  isPending: () => boolean;
};

export const createPatternRefreshCoalescer = <T,>(
  options: PatternRefreshCoalescerOptions<T>
): PatternRefreshCoalescer<T> => {
  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Math.floor(Number(options.delayMs)))
    : 180;
  const onRun = options.onRun;
  const onCoalesced = options.onCoalesced;
  const setTimer = options.setTimer || ((handler, timeoutMs) => window.setTimeout(handler, timeoutMs));
  const clearTimer = options.clearTimer || ((handle) => window.clearTimeout(handle));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestPayload: T | null = null;
  let disposed = false;

  const schedule = (payload: T) => {
    if (disposed) return;
    latestPayload = payload;
    if (timer != null) {
      clearTimer(timer);
      timer = null;
      if (onCoalesced) onCoalesced();
    }
    timer = setTimer(() => {
      timer = null;
      if (disposed || latestPayload == null) return;
      const runPayload = latestPayload;
      void Promise.resolve(onRun(runPayload)).catch(() => {
        // Best-effort coalescer; caller handles telemetry/logging.
      });
    }, delayMs);
  };

  const dispose = () => {
    disposed = true;
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    latestPayload = null;
  };

  return {
    schedule,
    dispose,
    isPending: () => timer != null
  };
};

