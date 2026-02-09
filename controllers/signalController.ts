import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type SignalControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
  taskId?: string;
  groupId?: string;
  jitterPct?: number;
  visibilityMode?: "always" | "foreground" | "background";
  priority?: "critical" | "high" | "normal" | "low";
};

export const createSignalController = (options: SignalControllerOptions): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "signal",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      dispose = ctx.scheduler.registerTask({
        id: options.taskId || "controller.signal.tick",
        groupId: options.groupId || "signal",
        intervalMs: Number(options.intervalMs || 10_000),
        jitterPct: Number.isFinite(Number(options.jitterPct)) ? Number(options.jitterPct) : 0.12,
        visibilityMode: options.visibilityMode || "foreground",
        priority: options.priority || "high",
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
