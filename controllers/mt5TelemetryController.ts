import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type Mt5TelemetryControllerOptions = {
  tick: () => number | void | Promise<number | void>;
  schedulerIntervalMs?: number;
  defaultDelayMs?: number;
  taskId?: string;
  groupId?: string;
};

const normalizeDelay = (value: number | null | undefined, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(500, Math.floor(num));
};

export const createMt5TelemetryController = (
  options: Mt5TelemetryControllerOptions
): FeatureController => {
  let dispose: (() => void) | null = null;
  let nextDueAtMs = Date.now();
  const schedulerIntervalMs = normalizeDelay(options.schedulerIntervalMs, 1_000);
  const defaultDelayMs = normalizeDelay(options.defaultDelayMs, 15_000);

  const health: FeatureControllerHealth = {
    id: "mt5Telemetry",
    running: false,
    lastTickAtMs: null,
    errorCount: 0,
    detail: {
      nextDueAtMs: null as number | null,
      schedulerIntervalMs,
      defaultDelayMs
    }
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      nextDueAtMs = Date.now();
      health.detail = {
        ...(health.detail || {}),
        nextDueAtMs
      };
      dispose = ctx.scheduler.registerTask({
        id: options.taskId || "controller.mt5.telemetry",
        groupId: options.groupId || "mt5",
        intervalMs: schedulerIntervalMs,
        jitterPct: 0,
        visibilityMode: "always",
        priority: "normal",
        run: async () => {
          const now = Date.now();
          if (now < nextDueAtMs) return;
          try {
            const nextDelay = await Promise.resolve(options.tick());
            health.running = true;
            health.lastTickAtMs = Date.now();
            nextDueAtMs = Date.now() + normalizeDelay(nextDelay as number, defaultDelayMs);
          } catch {
            health.errorCount += 1;
            nextDueAtMs = Date.now() + defaultDelayMs;
          }
          health.detail = {
            ...(health.detail || {}),
            nextDueAtMs
          };
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
