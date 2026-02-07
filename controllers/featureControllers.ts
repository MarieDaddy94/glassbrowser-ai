import { getRuntimeScheduler } from "../services/runtimeScheduler";

type StopFn = () => void;

type IntervalControllerOptions = {
  intervalMs: number;
  initialDelayMs?: number;
  runOnStart?: boolean;
  guard?: () => boolean;
  onTick: () => void | Promise<void>;
};

export function startIntervalController(options: IntervalControllerOptions): StopFn {
  const intervalMs = Number.isFinite(Number(options.intervalMs)) ? Math.max(250, Math.floor(Number(options.intervalMs))) : 1000;
  const initialDelayMs = Number.isFinite(Number(options.initialDelayMs))
    ? Math.max(0, Math.floor(Number(options.initialDelayMs)))
    : 0;
  const guard = typeof options.guard === 'function' ? options.guard : null;
  const onTick = options.onTick;

  let kick: number | null = null;
  let disposed = false;
  const scheduler = getRuntimeScheduler();
  const taskId = `featureController.${Math.random().toString(36).slice(2)}`;

  const tick = async () => {
    if (disposed) return;
    if (guard && !guard()) return;
    await onTick();
  };

  if (options.runOnStart) {
    if (initialDelayMs > 0) {
      kick = window.setTimeout(() => {
        void tick();
      }, initialDelayMs);
    } else {
      void tick();
    }
  }

  const disposeTask = scheduler.registerTask({
    id: taskId,
    groupId: "app",
    intervalMs,
    jitterPct: 0.12,
    visibilityMode: "always",
    priority: "normal",
    run: async () => {
      await tick();
    }
  });

  return () => {
    disposed = true;
    if (kick != null) window.clearTimeout(kick);
    disposeTask();
  };
}

export function startIntervalControllerSafe(options: IntervalControllerOptions): StopFn {
  try {
    return startIntervalController(options);
  } catch {
    return () => {};
  }
}

type SignalAutoRefreshControllerOptions = {
  signalAutoRefreshEnabled: boolean;
  signalSymbols: string[];
  signalRunning: boolean;
  signalLastRunAtMs: number | null;
  signalRefreshIntervalMs: number;
  signalSessions: any;
  isSignalSessionOpen: (sessions: any) => boolean;
  runSignalScan: (source: 'auto') => void | Promise<void>;
};

export function startSignalAutoRefreshController(options: SignalAutoRefreshControllerOptions): StopFn {
  return startIntervalControllerSafe({
    intervalMs: options.signalRefreshIntervalMs,
    initialDelayMs: 350,
    runOnStart: true,
    guard: () => {
      if (!options.signalAutoRefreshEnabled) return false;
      if (!Array.isArray(options.signalSymbols) || options.signalSymbols.length === 0) return false;
      if (options.signalRunning) return false;
      if (options.signalLastRunAtMs && Date.now() - options.signalLastRunAtMs < 1000) return false;
      if (!options.isSignalSessionOpen(options.signalSessions)) return false;
      return true;
    },
    onTick: async () => {
      await options.runSignalScan('auto');
    }
  });
}
