import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type TradingViewPriceControllerOptions = {
  tick: () => void | Promise<void>;
  intervalMs?: number;
  runOnStart?: boolean;
  taskId?: string;
  groupId?: string;
};

export const createTradingViewPriceController = (
  options: TradingViewPriceControllerOptions
): FeatureController => {
  let dispose: (() => void) | null = null;
  const health: FeatureControllerHealth = {
    id: "tradingViewPrice",
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
        id: options.taskId || "controller.tradingView.price",
        groupId: options.groupId || "chart",
        intervalMs: Number.isFinite(Number(options.intervalMs))
          ? Math.max(1_000, Math.floor(Number(options.intervalMs)))
          : 8_000,
        jitterPct: 0.05,
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
