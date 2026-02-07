export type BacktesterLooseCtx = Record<string, any>;

export interface OptimizerLoopPanelCtx extends BacktesterLooseCtx {}
export interface BatchOptimizerPanelCtx extends BacktesterLooseCtx {}
export interface TrainingPackPanelCtx extends BacktesterLooseCtx {}
export interface ResearchAutopilotPanelCtx extends BacktesterLooseCtx {}
export interface AgentMemoryPanelCtx extends BacktesterLooseCtx {}

export interface StrategyConfigPanelCtx extends BacktesterLooseCtx {}
export interface ValidationPanelCtx extends BacktesterLooseCtx {}
export interface ReplayChartPanelCtx extends BacktesterLooseCtx {}
export interface StatsPerformancePanelCtx extends BacktesterLooseCtx {}
export interface TimelineTruthPanelCtx extends BacktesterLooseCtx {}

export interface OptimizerLoopPanelProps {
  ctx: OptimizerLoopPanelCtx;
}

export interface BatchOptimizerPanelProps {
  ctx: BatchOptimizerPanelCtx;
}

export interface TrainingPackPanelProps {
  ctx: TrainingPackPanelCtx;
}

export interface ResearchAutopilotPanelProps {
  ctx: ResearchAutopilotPanelCtx;
}

export interface AgentMemoryPanelProps {
  ctx: AgentMemoryPanelCtx;
}

export interface StrategyConfigPanelProps {
  ctx: StrategyConfigPanelCtx;
}

export interface ValidationPanelProps {
  ctx: ValidationPanelCtx;
}

export interface ReplayChartPanelProps {
  ctx: ReplayChartPanelCtx;
}

export interface StatsPerformancePanelProps {
  ctx: StatsPerformancePanelCtx;
}

export interface TimelineTruthPanelProps {
  ctx: TimelineTruthPanelCtx;
}
