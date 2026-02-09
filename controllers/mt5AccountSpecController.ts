import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type Mt5AccountSpecControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
  runOnStart?: boolean;
  taskId?: string;
  groupId?: string;
};

export const createMt5AccountSpecController = (
  options: Mt5AccountSpecControllerOptions
): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "mt5AccountSpec",
    running: false,
    lastTickAtMs: null,
    errorCount: 0
  };

  const runTick = async () => {
    try {
      await Promise.resolve(options.tick());
      health.running = true;
      health.lastTickAtMs = Date.now();
    } catch {
      health.errorCount += 1;
    }
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      if (options.runOnStart !== false) {
        void runTick();
      }
      dispose = ctx.scheduler.registerTask({
        id: options.taskId || "controller.mt5.accountSpec",
        groupId: options.groupId || "mt5",
        intervalMs: Number.isFinite(Number(options.intervalMs))
          ? Math.max(1_000, Math.floor(Number(options.intervalMs)))
          : 5_000,
        jitterPct: 0.08,
        visibilityMode: "always",
        priority: "normal",
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
