import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type ShadowControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
};

export const createShadowController = (options: ShadowControllerOptions): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "shadow",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      dispose = ctx.scheduler.registerTask({
        id: "controller.shadow.tick",
        groupId: "shadow",
        intervalMs: Number(options.intervalMs || 12_000),
        jitterPct: 0.12,
        visibilityMode: "foreground",
        priority: "normal",
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

