import type { FeatureController, FeatureControllerContext, FeatureControllerHealth } from "./types";

type SetupWatcherBackgroundControllerOptions = {
  tick: () => void | Promise<void>;
  isEnabled: () => boolean;
  schedulerIntervalMs?: number;
  enabledIntervalMs?: number;
  disabledIntervalMs?: number;
  initialEnabledDelayMs?: number;
  initialDisabledDelayMs?: number;
  taskId?: string;
  groupId?: string;
};

const clamp = (value: number, fallback: number, min: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
};

export const createSetupWatcherBackgroundController = (
  options: SetupWatcherBackgroundControllerOptions
): FeatureController => {
  let dispose: (() => void) | null = null;
  let nextDueAtMs = 0;
  const pollIntervalMs = clamp(options.schedulerIntervalMs ?? 1000, 1000, 250);
  const enabledIntervalMs = clamp(options.enabledIntervalMs ?? 8000, 8000, 500);
  const disabledIntervalMs = clamp(options.disabledIntervalMs ?? 60_000, 60_000, enabledIntervalMs);
  const initialEnabledDelayMs = clamp(options.initialEnabledDelayMs ?? 4000, 4000, 0);
  const initialDisabledDelayMs = clamp(options.initialDisabledDelayMs ?? 20_000, 20_000, 0);

  const health: FeatureControllerHealth = {
    id: "setupWatcherBackground",
    running: false,
    lastTickAtMs: null,
    errorCount: 0,
    detail: {
      nextDueAtMs: null as number | null,
      enabledIntervalMs,
      disabledIntervalMs,
      pollIntervalMs
    }
  };

  return {
    start(ctx: FeatureControllerContext) {
      if (dispose) return;
      const now = Date.now();
      nextDueAtMs = now + (options.isEnabled() ? initialEnabledDelayMs : initialDisabledDelayMs);
      health.detail = {
        ...(health.detail || {}),
        nextDueAtMs
      };
      dispose = ctx.scheduler.registerTask({
        id: options.taskId || "controller.setupWatcher.background",
        groupId: options.groupId || "watchers",
        intervalMs: pollIntervalMs,
        jitterPct: 0,
        visibilityMode: "always",
        priority: "normal",
        run: async () => {
          const nowTs = Date.now();
          if (nowTs < nextDueAtMs) return;
          try {
            await Promise.resolve(options.tick());
            health.lastTickAtMs = Date.now();
            health.running = true;
          } catch {
            health.errorCount += 1;
          } finally {
            const delay = options.isEnabled() ? enabledIntervalMs : disabledIntervalMs;
            nextDueAtMs = Date.now() + delay;
            health.detail = {
              ...(health.detail || {}),
              nextDueAtMs
            };
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
