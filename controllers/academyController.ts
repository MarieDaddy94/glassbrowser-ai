import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type AcademyControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
};

export const createAcademyController = (options: AcademyControllerOptions): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "academy",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      dispose = ctx.scheduler.registerTask({
        id: "controller.academy.tick",
        groupId: "academy",
        intervalMs: Number(options.intervalMs || 15_000),
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

