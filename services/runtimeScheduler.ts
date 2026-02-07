type VisibilityMode = "always" | "foreground" | "background";
type TaskPriority = "critical" | "high" | "normal" | "low";

export type RuntimeSchedulerTask = {
  id: string;
  groupId?: string;
  intervalMs: number;
  jitterPct?: number;
  visibilityMode?: VisibilityMode;
  priority?: TaskPriority;
  run: () => void | Promise<void>;
};

export type RuntimeSchedulerTaskStats = {
  id: string;
  groupId: string;
  taskRuns: number;
  taskErrors: number;
  runCount: number;
  errorCount: number;
  lastRunAtMs: number | null;
  lastErrorAtMs: number | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  paused: boolean;
};

export type RuntimeSchedulerStats = {
  visible: boolean;
  taskCount: number;
  tasks: RuntimeSchedulerTaskStats[];
};

type ScheduledTask = {
  config: RuntimeSchedulerTask;
  timer: number | null;
  paused: boolean;
  running: boolean;
  disposed: boolean;
  stats: RuntimeSchedulerTaskStats;
  start: () => void;
  dispose: () => void;
  pause: () => void;
  resume: () => void;
};

const DEFAULT_JITTER_PCT = 0.12;
const BACKGROUND_MULTIPLIER = 3;
const PRIORITY_MULTIPLIER: Record<TaskPriority, number> = {
  critical: 1,
  high: 1,
  normal: 1.15,
  low: 1.3
};

const normalizeIntervalMs = (value: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1_000;
  return Math.max(250, Math.floor(num));
};

const normalizeJitterPct = (value?: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_JITTER_PCT;
  return Math.max(0, Math.min(0.6, num));
};

const withJitter = (baseMs: number, jitterPct: number) => {
  if (jitterPct <= 0) return baseMs;
  const spread = baseMs * jitterPct;
  const delta = (Math.random() * spread * 2) - spread;
  return Math.max(100, Math.floor(baseMs + delta));
};

export class RuntimeScheduler {
  private readonly tasks = new Map<string, ScheduledTask>();
  private visible = true;

  registerTask(task: RuntimeSchedulerTask): () => void {
    const id = String(task?.id || "").trim();
    if (!id) throw new Error("runtimeScheduler: task.id is required");
    if (this.tasks.has(id)) {
      this.tasks.get(id)?.dispose();
      this.tasks.delete(id);
    }

    const groupId = String(task.groupId || "default");
    const config: RuntimeSchedulerTask = {
      ...task,
      id,
      groupId,
      intervalMs: normalizeIntervalMs(task.intervalMs),
      jitterPct: normalizeJitterPct(task.jitterPct),
      visibilityMode: task.visibilityMode || "always",
      priority: task.priority || "normal"
    };

    const state: ScheduledTask = {
      config,
      timer: null,
      paused: false,
      running: false,
      disposed: false,
      stats: {
        id,
        groupId,
        taskRuns: 0,
        taskErrors: 0,
        runCount: 0,
        errorCount: 0,
        lastRunAtMs: null,
        lastErrorAtMs: null,
        lastDurationMs: null,
        consecutiveFailures: 0,
        paused: false
      },
      start: () => {},
      dispose: () => {},
      pause: () => {},
      resume: () => {}
    };

    const clearTimer = () => {
      if (state.timer != null) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
    };

    const canRunNow = () => {
      if (state.disposed || state.paused) return false;
      const mode = state.config.visibilityMode || "always";
      if (mode === "foreground" && !this.visible) return false;
      if (mode === "background" && this.visible) return false;
      return true;
    };

    const computeDelay = () => {
      let delay = state.config.intervalMs;
      const priority = state.config.priority || "normal";
      delay = Math.floor(delay * PRIORITY_MULTIPLIER[priority]);
      const mode = state.config.visibilityMode || "always";
      if (mode !== "always" && !this.visible) {
        delay = Math.floor(delay * BACKGROUND_MULTIPLIER);
      }
      return withJitter(delay, state.config.jitterPct || 0);
    };

    const scheduleNext = () => {
      clearTimer();
      if (state.disposed) return;
      const delayMs = computeDelay();
      state.timer = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (!canRunNow()) {
        scheduleNext();
        return;
      }
      if (state.running) {
        scheduleNext();
        return;
      }
      state.running = true;
      const startedAt = Date.now();
      try {
        await Promise.resolve(state.config.run());
        state.stats.consecutiveFailures = 0;
      } catch {
        state.stats.taskErrors += 1;
        state.stats.errorCount += 1;
        state.stats.lastErrorAtMs = Date.now();
        state.stats.consecutiveFailures += 1;
      } finally {
        state.running = false;
        const endedAt = Date.now();
        state.stats.taskRuns += 1;
        state.stats.runCount += 1;
        state.stats.lastRunAtMs = endedAt;
        state.stats.lastDurationMs = Math.max(0, endedAt - startedAt);
        scheduleNext();
      }
    };

    state.start = () => {
      if (state.disposed) return;
      scheduleNext();
    };

    state.dispose = () => {
      state.disposed = true;
      clearTimer();
    };

    state.pause = () => {
      state.paused = true;
      state.stats.paused = true;
      clearTimer();
    };

    state.resume = () => {
      if (state.disposed) return;
      state.paused = false;
      state.stats.paused = false;
      scheduleNext();
    };

    this.tasks.set(id, state);
    state.start();
    return () => {
      state.dispose();
      this.tasks.delete(id);
    };
  }

  setVisibility(isVisible: boolean) {
    this.visible = !!isVisible;
    for (const task of this.tasks.values()) {
      if (task.disposed || task.paused) continue;
      if (task.timer != null) {
        window.clearTimeout(task.timer);
        task.timer = null;
      }
      task.timer = window.setTimeout(() => {
        task.start();
      }, 0);
    }
  }

  pauseGroup(groupId: string) {
    const key = String(groupId || "default");
    for (const task of this.tasks.values()) {
      if (task.config.groupId !== key) continue;
      task.pause();
    }
  }

  resumeGroup(groupId: string) {
    const key = String(groupId || "default");
    for (const task of this.tasks.values()) {
      if (task.config.groupId !== key) continue;
      task.resume();
    }
  }

  getStats(): RuntimeSchedulerStats {
    return {
      visible: this.visible,
      taskCount: this.tasks.size,
      tasks: Array.from(this.tasks.values()).map((entry) => ({ ...entry.stats }))
    };
  }

  dispose() {
    for (const [id, task] of this.tasks.entries()) {
      task.dispose();
      this.tasks.delete(id);
    }
  }
}

let singleton: RuntimeScheduler | null = null;

export const getRuntimeScheduler = () => {
  if (!singleton) singleton = new RuntimeScheduler();
  return singleton;
};
