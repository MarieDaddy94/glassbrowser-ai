export type FeatureControllerHealth = {
  id: string;
  running: boolean;
  lastTickAtMs: number | null;
  errorCount: number;
  detail?: Record<string, any>;
};

export type FeatureControllerContext = {
  scheduler: {
    registerTask: (task: {
      id: string;
      groupId?: string;
      intervalMs: number;
      jitterPct?: number;
      visibilityMode?: "always" | "foreground" | "background";
      priority?: "critical" | "high" | "normal" | "low";
      run: () => void | Promise<void>;
    }) => () => void;
  };
};

export interface FeatureController {
  start: (ctx: FeatureControllerContext) => void;
  stop: () => void;
  onVisibilityChange: (isVisible: boolean) => void;
  getHealth: () => FeatureControllerHealth;
}

