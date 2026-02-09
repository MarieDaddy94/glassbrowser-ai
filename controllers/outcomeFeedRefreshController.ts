import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type OutcomeFeedRefreshControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
  taskId?: string;
  groupId?: string;
};

export const createOutcomeFeedRefreshController = (
  options: OutcomeFeedRefreshControllerOptions
): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "outcomeFeedRefresh",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      dispose = ctx.scheduler.registerTask({
        id: options.taskId || "controller.outcomeFeed.refresh",
        groupId: options.groupId || "outcome",
        intervalMs: Number.isFinite(Number(options.intervalMs))
          ? Math.max(1_000, Math.floor(Number(options.intervalMs)))
          : 15_000,
        jitterPct: 0.08,
        visibilityMode: "always",
        priority: "normal",
        run: async () => {
          try {
            await Promise.resolve(options.tick());
            health.running = true;
            health.lastTickAtMs = Date.now();
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
      // scheduler handles visibility behavior
    },
    getHealth() {
      return { ...health };
    }
  };
};
