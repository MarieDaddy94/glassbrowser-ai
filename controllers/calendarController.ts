import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type CalendarControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
  backgroundIntervalMs?: number;
};

export const createCalendarController = (options: CalendarControllerOptions): FeatureController => {
  let disposeForeground: (() => void) | null = null;
  let disposeBackground: (() => void) | null = null;
  const foregroundIntervalMs = Number.isFinite(Number(options.intervalMs))
    ? Math.max(1_000, Math.floor(Number(options.intervalMs)))
    : 20_000;
  const backgroundIntervalMs = Number.isFinite(Number(options.backgroundIntervalMs))
    ? Math.max(foregroundIntervalMs, Math.floor(Number(options.backgroundIntervalMs)))
    : Math.max(foregroundIntervalMs, Math.floor(foregroundIntervalMs * 3));
  const health: FeatureControllerHealth = {
    id: "calendar",
    running: false,
    lastTickAtMs: null,
    errorCount: 0,
    detail: {
      foregroundIntervalMs,
      backgroundIntervalMs,
      lastTickMode: null as "foreground" | "background" | null
    }
  };

  const runTick = async (mode: "foreground" | "background") => {
    try {
      await Promise.resolve(options.tick());
      health.lastTickAtMs = Date.now();
      health.running = true;
      if (health.detail) {
        health.detail.lastTickMode = mode;
      }
    } catch {
      health.errorCount += 1;
    }
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (disposeForeground || disposeBackground) return;
      disposeForeground = ctx.scheduler.registerTask({
        id: "controller.calendar.tick.foreground",
        groupId: "calendar",
        intervalMs: foregroundIntervalMs,
        jitterPct: 0.12,
        visibilityMode: "foreground",
        priority: "low",
        run: async () => {
          await runTick("foreground");
        }
      });
      disposeBackground = ctx.scheduler.registerTask({
        id: "controller.calendar.tick.background",
        groupId: "calendar",
        intervalMs: backgroundIntervalMs,
        jitterPct: 0.12,
        visibilityMode: "background",
        priority: "low",
        run: async () => {
          await runTick("background");
        }
      });
    },
    stop() {
      if (!disposeForeground && !disposeBackground) return;
      disposeForeground?.();
      disposeBackground?.();
      disposeForeground = null;
      disposeBackground = null;
      health.running = false;
    },
    onVisibilityChange() {
      // scheduler handles visibility behavior.
    },
    getHealth() {
      return { ...health };
    }
  };
};
