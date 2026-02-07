import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type CalendarControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
};

export const createCalendarController = (options: CalendarControllerOptions): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "calendar",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      dispose = ctx.scheduler.registerTask({
        id: "controller.calendar.tick",
        groupId: "calendar",
        intervalMs: Number(options.intervalMs || 20_000),
        jitterPct: 0.12,
        visibilityMode: "always",
        priority: "low",
        run: async () => {
          try {
            await Promise.resolve(options.tick());
            health.lastTickAtMs = Date.now();
            health.running = true;
          } catch {
            health.errorCount += 1;
          }
        }
      });
    },
    stop() {
      if (!dispose) return;
      dispose();
      dispose = null;
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

