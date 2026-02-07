import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type ExecutionControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
};

export const createExecutionController = (options: ExecutionControllerOptions): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "execution",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      dispose = ctx.scheduler.registerTask({
        id: "controller.execution.tick",
        groupId: "execution",
        intervalMs: Number(options.intervalMs || 5_000),
        jitterPct: 0.08,
        visibilityMode: "always",
        priority: "critical",
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

