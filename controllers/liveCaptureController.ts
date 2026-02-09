import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type LiveCaptureControllerOptions = {
  runLiveActive: () => void | Promise<void>;
  runLiveWatched: () => void | Promise<void>;
  runChartWatch: () => void | Promise<void>;
  isLiveEnabled: () => boolean;
  isChartEnabled: () => boolean;
  getChartBackoffUntilMs?: () => number;
  liveActiveIntervalMs?: number;
  liveWatchedIntervalMs?: number;
  chartWatchIntervalMs?: number;
  schedulerIntervalMs?: number;
  taskId?: string;
  groupId?: string;
};

const clamp = (value: number, fallback: number, min: number, max: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
};

export const createLiveCaptureController = (
  options: LiveCaptureControllerOptions
): FeatureController => {
  let dispose: (() => void) | null = null;
  let tickInFlight = false;
  const schedulerIntervalMs = clamp(options.schedulerIntervalMs ?? 250, 250, 80, 60_000);
  const liveActiveIntervalMs = clamp(options.liveActiveIntervalMs ?? 2_500, 2_500, 250, 60_000);
  const liveWatchedIntervalMs = clamp(options.liveWatchedIntervalMs ?? 4_000, 4_000, 250, 60_000);
  const chartWatchIntervalMs = clamp(options.chartWatchIntervalMs ?? 2_500, 2_500, 250, 60_000);

  const due = {
    liveActive: Date.now(),
    liveWatched: Date.now(),
    chartWatch: Date.now()
  };

  const health: FeatureControllerHealth = {
    id: "liveCapture",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  const runTick = async () => {
    if (tickInFlight) return;
    const liveEnabled = options.isLiveEnabled();
    const chartEnabled = options.isChartEnabled();
    if (!liveEnabled && !chartEnabled) return;
    tickInFlight = true;
    try {
      const now = Date.now();
      if (liveEnabled && now >= due.liveActive) {
        await Promise.resolve(options.runLiveActive());
        due.liveActive = Date.now() + liveActiveIntervalMs;
      }
      if (liveEnabled && now >= due.liveWatched) {
        await Promise.resolve(options.runLiveWatched());
        due.liveWatched = Date.now() + liveWatchedIntervalMs;
      }
      if (chartEnabled) {
        const backoffUntil = Number(options.getChartBackoffUntilMs ? options.getChartBackoffUntilMs() : 0) || 0;
        const nowChart = Date.now();
        if (nowChart >= Math.max(due.chartWatch, backoffUntil)) {
          await Promise.resolve(options.runChartWatch());
          due.chartWatch = Date.now() + chartWatchIntervalMs;
        }
      }
      health.running = true;
      health.lastTickAtMs = Date.now();
    } catch {
      health.errorCount += 1;
    } finally {
      tickInFlight = false;
    }
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      const now = Date.now();
      due.liveActive = now;
      due.liveWatched = now;
      due.chartWatch = now;
      dispose = ctx.scheduler.registerTask({
        id: options.taskId || "controller.liveCapture",
        groupId: options.groupId || "capture",
        intervalMs: schedulerIntervalMs,
        jitterPct: 0,
        visibilityMode: "always",
        priority: "high",
        run: runTick
      });
    },
    stop() {
      if (!dispose) return;
      dispose();
      dispose = null;
      health.running = false;
    },
    onVisibilityChange() {
      // scheduler handles visibility behavior
    },
    getHealth() {
      return { ...health };
    }
  };
};
