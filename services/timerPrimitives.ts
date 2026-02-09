export type TimerHandle = ReturnType<typeof window.setTimeout>;

const normalizeDelay = (delayMs: number) => {
  const value = Number(delayMs);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

export const deferMs = (run: () => void, delayMs = 0): TimerHandle => {
  return window.setTimeout(run, normalizeDelay(delayMs));
};

export const cancelTimer = (handle: TimerHandle | null | undefined) => {
  if (typeof handle !== "number") return;
  window.clearTimeout(handle);
};

export const sleepMs = (delayMs: number) =>
  new Promise<void>((resolve) => {
    deferMs(resolve, delayMs);
  });
