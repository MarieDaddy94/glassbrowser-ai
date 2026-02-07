import {
  AgentTestRun,
  AgentTestScenario,
  TaskPlaybook,
  TaskPlaybookMode,
  TaskPlaybookRun,
  TaskPlaybookStep,
  TaskPlaybookStepStatus,
  TruthEventRecord,
  SetupStrategy
} from '../types';
import { hashStringSampled } from './stringHash';

const VALID_STATUSES = new Set<TaskPlaybookStepStatus>([
  'queued',
  'running',
  'completed',
  'failed',
  'skipped',
  'blocked'
]);

const VALID_STRATEGIES = new Set<SetupStrategy>([
  'RANGE_BREAKOUT',
  'BREAK_RETEST',
  'FVG_RETRACE',
  'TREND_PULLBACK',
  'MEAN_REVERSION'
]);

const VALID_MODES = new Set<TaskPlaybookMode>(['coordinate', 'team', 'autopilot']);

const normalizeStringArray = (input: any) => {
  if (!Array.isArray(input)) return null;
  const next: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }
  return next.length > 0 ? next : null;
};

const normalizeStep = (raw: any, index: number): TaskPlaybookStep | null => {
  if (typeof raw === 'string') {
    const actionId = raw.trim();
    if (!actionId) return null;
    return { id: `step_${index + 1}`, actionId };
  }
  if (!raw || typeof raw !== 'object') return null;
  const actionId = String(raw.actionId || raw.action || '').trim();
  if (!actionId) return null;
  const id = String(raw.id || `step_${index + 1}`).trim() || `step_${index + 1}`;
  const label = raw.label != null ? String(raw.label) : null;
  const stageRaw = raw.stage != null ? String(raw.stage).trim().toLowerCase() : '';
  const stage =
    stageRaw === 'observe' || stageRaw === 'evaluate' || stageRaw === 'decide' || stageRaw === 'verify' ||
    stageRaw === 'execute' || stageRaw === 'monitor' || stageRaw === 'review'
      ? (stageRaw as TaskPlaybookStep['stage'])
      : null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
  return {
    id,
    actionId,
    label,
    stage,
    payload,
    storeAs: raw.storeAs != null ? String(raw.storeAs) : null,
    optional: raw.optional === true,
    requiresConfirmation: raw.requiresConfirmation === true,
    requiresUser: raw.requiresUser === true,
    skipIfMissing: raw.skipIfMissing != null ? String(raw.skipIfMissing) : null,
    timeoutMs: Number.isFinite(Number(raw.timeoutMs)) ? Number(raw.timeoutMs) : null,
    maxRetries: Number.isFinite(Number(raw.maxRetries)) ? Math.max(0, Math.floor(Number(raw.maxRetries))) : null,
    retryDelayMs: Number.isFinite(Number(raw.retryDelayMs)) ? Math.max(0, Math.floor(Number(raw.retryDelayMs))) : null
  };
};

const normalizeSteps = (input: any) => {
  const raw = Array.isArray(input) ? input : [];
  const steps = raw.map((entry, idx) => normalizeStep(entry, idx)).filter(Boolean) as TaskPlaybookStep[];
  return steps.length > 0 ? steps : null;
};

const normalizeStrategy = (input: any) => {
  const raw = String(input || '').trim().toUpperCase();
  if (!raw) return null;
  return VALID_STRATEGIES.has(raw as SetupStrategy) ? (raw as SetupStrategy) : null;
};

const normalizeMode = (input: any) => {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return null;
  return VALID_MODES.has(raw as TaskPlaybookMode) ? (raw as TaskPlaybookMode) : null;
};

const normalizeExpected = (input: any): AgentTestScenario['expected'] | null => {
  if (!input || typeof input !== 'object') return null;
  const statusRaw = input.status != null ? String(input.status).trim().toLowerCase() : '';
  const status = VALID_STATUSES.has(statusRaw as TaskPlaybookStepStatus)
    ? (statusRaw as TaskPlaybookStepStatus)
    : null;
  const mustIncludeSteps = normalizeStringArray(input.mustIncludeSteps);
  const mustIncludeActions = normalizeStringArray(input.mustIncludeActions);
  const mustIncludeEvents = normalizeStringArray(input.mustIncludeEvents);
  const forbiddenEvents = normalizeStringArray(input.forbiddenEvents);
  const minStepsCompleted = Number.isFinite(Number(input.minStepsCompleted))
    ? Math.max(0, Math.floor(Number(input.minStepsCompleted)))
    : null;
  const maxDurationMs = Number.isFinite(Number(input.maxDurationMs))
    ? Math.max(0, Math.floor(Number(input.maxDurationMs)))
    : null;
  return {
    status,
    mustIncludeSteps,
    mustIncludeActions,
    mustIncludeEvents,
    forbiddenEvents,
    minStepsCompleted,
    maxDurationMs
  };
};

const buildScenarioId = (input: { id?: string | null; name?: string | null; playbookId?: string | null; steps?: TaskPlaybookStep[] | null }) => {
  const supplied = input.id ? String(input.id).trim() : '';
  if (supplied) return supplied;
  const signature = JSON.stringify({
    name: input.name || '',
    playbookId: input.playbookId || '',
    steps: Array.isArray(input.steps) ? input.steps.map((step) => step.actionId) : []
  });
  const hash = hashStringSampled(signature, 256);
  return `agent_test_${hash}`;
};

export const buildAgentTestScenarioKey = (scenarioId: string) => `agent_test_scenario:${scenarioId}`;

export const buildAgentTestRunKey = (runId: string) => `agent_test_run:${runId}`;

export const normalizeAgentTestScenario = (input: any): AgentTestScenario | null => {
  if (!input || typeof input !== 'object') return null;
  const nameRaw = String(input.name || input.title || '').trim();
  const playbookRaw = input.playbook && typeof input.playbook === 'object' ? (input.playbook as TaskPlaybook) : null;
  const playbookSteps = normalizeSteps(playbookRaw?.steps);
  const playbook = playbookRaw && playbookSteps ? { ...playbookRaw, steps: playbookSteps } : null;
  const playbookId = input.playbookId != null ? String(input.playbookId).trim() : (playbook?.id ? String(playbook.id).trim() : null);
  const steps = normalizeSteps(input.steps) || playbookSteps || null;
  const name = nameRaw || (playbook?.name ? String(playbook.name).trim() : 'Agent Test');
  const createdAtMs = Number.isFinite(Number(input.createdAtMs)) ? Number(input.createdAtMs) : Date.now();
  const updatedAtMs = Number.isFinite(Number(input.updatedAtMs)) ? Number(input.updatedAtMs) : createdAtMs;
  const id = buildScenarioId({ id: input.id, name, playbookId, steps });
  const contextRaw = input.context && typeof input.context === 'object' ? input.context : {};
  const context: AgentTestScenario['context'] | null = {
    symbol: contextRaw.symbol != null ? String(contextRaw.symbol).trim() : null,
    timeframe: contextRaw.timeframe != null ? String(contextRaw.timeframe).trim() : null,
    timeframes: normalizeStringArray(contextRaw.timeframes),
    strategy: normalizeStrategy(contextRaw.strategy),
    mode: normalizeMode(contextRaw.mode),
    data: contextRaw.data && typeof contextRaw.data === 'object' ? contextRaw.data : null
  };
  const expected = normalizeExpected(input.expected);
  const tags = normalizeStringArray(input.tags);
  return {
    id,
    name,
    description: input.description != null ? String(input.description) : null,
    playbookId: playbookId || null,
    playbook: playbook || null,
    steps,
    context,
    expected,
    tags,
    createdAtMs,
    updatedAtMs,
    source: input.source != null ? String(input.source) : null
  };
};

export const resolveScenarioPlaybook = (scenario: AgentTestScenario) => {
  if (scenario.playbook && scenario.playbook.steps && scenario.playbook.steps.length > 0) {
    const signature = JSON.stringify(scenario.playbook.steps.map((step) => step.actionId));
    const hash = hashStringSampled(signature, 256);
    const playbookId = scenario.playbook.id ? String(scenario.playbook.id).trim() : `playbook.agent_test.${hash}`;
    const playbook: TaskPlaybook = {
      ...scenario.playbook,
      id: playbookId,
      name: scenario.playbook.name ? String(scenario.playbook.name).trim() : `Agent Test: ${scenario.name}`
    };
    return { playbook, playbookId };
  }
  if (scenario.steps && scenario.steps.length > 0) {
    const signature = JSON.stringify(scenario.steps.map((step) => step.actionId));
    const hash = hashStringSampled(signature, 256);
    const playbookId = `playbook.agent_test.${hash}`;
    const playbook: TaskPlaybook = {
      id: playbookId,
      name: `Agent Test: ${scenario.name}`,
      description: scenario.description || null,
      owner: 'agent',
      version: 1,
      symbol: scenario.context?.symbol || null,
      timeframes: scenario.context?.timeframes || (scenario.context?.timeframe ? [scenario.context?.timeframe] : null),
      strategy: scenario.context?.strategy || null,
      defaultMode: scenario.context?.mode || 'coordinate',
      steps: scenario.steps
    };
    return { playbook, playbookId };
  }
  if (scenario.playbookId) {
    return { playbook: null, playbookId: scenario.playbookId };
  }
  return { playbook: null, playbookId: null };
};

export const buildAgentTestRun = (input: {
  runId: string;
  scenario: AgentTestScenario;
  status?: TaskPlaybookStepStatus;
  startedAtMs?: number | null;
  finishedAtMs?: number | null;
}) => {
  const now = Date.now();
  const status = input.status && VALID_STATUSES.has(input.status) ? input.status : 'running';
  return {
    id: `agent_test_${input.runId}`,
    runId: input.runId,
    scenarioId: input.scenario.id,
    scenarioName: input.scenario.name,
    status,
    startedAtMs: Number.isFinite(Number(input.startedAtMs)) ? Number(input.startedAtMs) : now,
    finishedAtMs: Number.isFinite(Number(input.finishedAtMs)) ? Number(input.finishedAtMs) : null,
    expected: input.scenario.expected || null,
    context: input.scenario.context || null,
    createdAtMs: now,
    updatedAtMs: now,
    source: input.scenario.source || 'agent_test'
  } as AgentTestRun;
};

const buildTruthEventCounts = (events: TruthEventRecord[]) => {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const eventType = String(event?.eventType || '').trim();
    if (!eventType) continue;
    counts[eventType] = (counts[eventType] || 0) + 1;
  }
  return counts;
};

const toNumber = (value: any): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const summarizeTradeMetrics = (events: TruthEventRecord[]) => {
  const tradeOpened = events.filter((event) => String(event?.eventType || '') === 'trade_opened');
  const tradeClosed = events.filter((event) => String(event?.eventType || '') === 'trade_closed');
  const realizedPnls = tradeClosed
    .map((event) => toNumber(event?.payload?.realizedPnl))
    .filter((value) => value != null) as number[];
  const slippagePcts = tradeClosed
    .map((event) => toNumber(event?.payload?.slippagePct))
    .filter((value) => value != null) as number[];
  const netPnl = realizedPnls.reduce((acc, value) => acc + value, 0);
  const closedCount = tradeClosed.length;
  const avgPnl = closedCount > 0 ? netPnl / closedCount : null;
  let winCount = 0;
  let lossCount = 0;
  for (const pnl of realizedPnls) {
    if (pnl > 0) winCount += 1;
    else if (pnl < 0) lossCount += 1;
  }
  const winRate = closedCount > 0 ? winCount / closedCount : null;
  const avgSlippagePct = slippagePcts.length > 0
    ? slippagePcts.reduce((acc, value) => acc + value, 0) / slippagePcts.length
    : null;
  return {
    tradeOpenedCount: tradeOpened.length,
    tradeClosedCount: closedCount,
    tradeWinCount: winCount,
    tradeLossCount: lossCount,
    tradeWinRate: winRate,
    tradeNetPnl: Number.isFinite(netPnl) ? netPnl : null,
    tradeAvgPnl: avgPnl != null && Number.isFinite(avgPnl) ? avgPnl : null,
    tradeAvgSlippagePct: avgSlippagePct != null && Number.isFinite(avgSlippagePct) ? avgSlippagePct : null
  };
};

const summarizeSignalMetrics = (events: TruthEventRecord[]) => {
  const signals = events.filter((event) => String(event?.eventType || '') === 'setup_signal');
  const triggered = signals.filter((event) => {
    const status = String(event?.payload?.status || '').trim().toLowerCase();
    return status === 'triggered' || status === 'entry_confirmed';
  });
  return {
    setupSignalCount: signals.length,
    setupTriggeredCount: triggered.length
  };
};

export const evaluateAgentTestRun = (input: {
  scenario: AgentTestScenario;
  playbookRun: TaskPlaybookRun;
  truthEvents?: TruthEventRecord[] | null;
  baseRun?: AgentTestRun | null;
}) => {
  const { scenario, playbookRun } = input;
  const base = input.baseRun || null;
  const truthEvents = Array.isArray(input.truthEvents) ? input.truthEvents : [];
  const steps = Array.isArray(playbookRun.steps) ? playbookRun.steps : [];
  const totalSteps = steps.length;
  const completedSteps = steps.filter((step) => step.status === 'completed').length;
  const failedSteps = steps.filter((step) => step.status === 'failed').length;
  const skippedSteps = steps.filter((step) => step.status === 'skipped').length;
  const blockedSteps = steps.filter((step) => step.status === 'blocked').length;
  const startedAtMs = Number.isFinite(Number(playbookRun.startedAtMs))
    ? Number(playbookRun.startedAtMs)
    : base?.startedAtMs || Date.now();
  const finishedAtMs = Number.isFinite(Number(playbookRun.finishedAtMs))
    ? Number(playbookRun.finishedAtMs)
    : base?.finishedAtMs || null;
  const durationMs = finishedAtMs != null ? Math.max(0, finishedAtMs - startedAtMs) : null;
  const firstStepStartedAtMs = steps.reduce((acc: number | null, step) => {
    const value = Number(step.startedAtMs || 0);
    if (!Number.isFinite(value) || value <= 0) return acc;
    if (acc == null || value < acc) return value;
    return acc;
  }, null);
  const firstStepLatencyMs = firstStepStartedAtMs != null ? Math.max(0, firstStepStartedAtMs - startedAtMs) : null;
  const decisionStep = steps.find((step) => String(step.actionId || '').includes('trade.'));
  const decisionLatencyMs = decisionStep?.startedAtMs
    ? Math.max(0, Number(decisionStep.startedAtMs) - startedAtMs)
    : null;
  const truthCounts = buildTruthEventCounts(truthEvents);
  const tradeMetrics = summarizeTradeMetrics(truthEvents);
  const signalMetrics = summarizeSignalMetrics(truthEvents);
  const falseTriggerCount = Math.max(
    0,
    (signalMetrics.setupTriggeredCount || 0) - (tradeMetrics.tradeOpenedCount || 0)
  );
  const expected = scenario.expected || null;

  const stepIdSet = new Set(steps.map((step) => String(step.id || '').trim().toLowerCase()));
  const actionIdSet = new Set(steps.map((step) => String(step.actionId || '').trim().toLowerCase()));
  const eventTypeSet = new Set(truthEvents.map((event) => String(event.eventType || '').trim().toLowerCase()));
  for (const event of truthEvents) {
    const actionId = String(event.actionId || '').trim().toLowerCase();
    if (actionId) actionIdSet.add(actionId);
  }

  const missingSteps = (expected?.mustIncludeSteps || [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry && !stepIdSet.has(entry.toLowerCase()) && !actionIdSet.has(entry.toLowerCase()));
  const missingActions = (expected?.mustIncludeActions || [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry && !actionIdSet.has(entry.toLowerCase()));
  const missingEvents = (expected?.mustIncludeEvents || [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry && !eventTypeSet.has(entry.toLowerCase()));
  const forbiddenEvents = (expected?.forbiddenEvents || [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry && eventTypeSet.has(entry.toLowerCase()));

  const diff: AgentTestRun['diff'] = {};
  if (expected?.status && expected.status !== playbookRun.status) {
    diff.statusMismatch = { expected: expected.status, actual: playbookRun.status };
  }
  if (missingSteps.length > 0) diff.missingSteps = missingSteps;
  if (missingActions.length > 0) diff.missingActions = missingActions;
  if (missingEvents.length > 0) diff.missingEvents = missingEvents;
  if (forbiddenEvents.length > 0) diff.forbiddenEvents = forbiddenEvents;
  if (expected?.minStepsCompleted != null && completedSteps < expected.minStepsCompleted) {
    diff.minStepsCompleted = { expected: expected.minStepsCompleted, actual: completedSteps };
  }
  if (expected?.maxDurationMs != null && durationMs != null && durationMs > expected.maxDurationMs) {
    diff.maxDurationExceeded = { maxDurationMs: expected.maxDurationMs, actual: durationMs };
  }

  const failures =
    diff.statusMismatch ||
    (diff.missingSteps && diff.missingSteps.length > 0) ||
    (diff.missingActions && diff.missingActions.length > 0) ||
    (diff.missingEvents && diff.missingEvents.length > 0) ||
    (diff.forbiddenEvents && diff.forbiddenEvents.length > 0) ||
    diff.minStepsCompleted ||
    diff.maxDurationExceeded;

  const run: AgentTestRun = {
    id: base?.id || `agent_test_${playbookRun.runId}`,
    runId: playbookRun.runId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    status: playbookRun.status,
    startedAtMs,
    finishedAtMs,
    metrics: {
      totalSteps,
      completedSteps,
      failedSteps,
      skippedSteps,
      blockedSteps,
      durationMs,
      firstStepLatencyMs,
      decisionLatencyMs,
      truthEventCount: truthEvents.length,
      truthEventTypes: truthCounts,
      setupSignalCount: signalMetrics.setupSignalCount,
      setupTriggeredCount: signalMetrics.setupTriggeredCount,
      falseTriggerCount,
      tradeOpenedCount: tradeMetrics.tradeOpenedCount,
      tradeClosedCount: tradeMetrics.tradeClosedCount,
      tradeWinCount: tradeMetrics.tradeWinCount,
      tradeLossCount: tradeMetrics.tradeLossCount,
      tradeWinRate: tradeMetrics.tradeWinRate,
      tradeNetPnl: tradeMetrics.tradeNetPnl,
      tradeAvgPnl: tradeMetrics.tradeAvgPnl,
      tradeAvgSlippagePct: tradeMetrics.tradeAvgSlippagePct
    },
    diff: Object.keys(diff).length > 0 ? diff : null,
    pass: failures ? false : true,
    expected: expected || null,
    context: scenario.context || null,
    createdAtMs: base?.createdAtMs || Date.now(),
    updatedAtMs: Date.now(),
    source: base?.source || scenario.source || 'agent_test'
  };

  return run;
};

export const buildAgentTestScenarioMemoryEntry = (scenario: AgentTestScenario) => {
  const symbol = scenario.context?.symbol || null;
  const timeframe = scenario.context?.timeframe || null;
  const summary = scenario.description || scenario.name;
  const tags = Array.isArray(scenario.tags) ? scenario.tags : [];
  return {
    key: buildAgentTestScenarioKey(scenario.id),
    familyKey: buildAgentTestScenarioKey(scenario.id),
    scope: 'shared',
    category: 'agent_test',
    subcategory: 'scenario',
    kind: 'agent_test_scenario',
    symbol,
    timeframe,
    summary,
    payload: scenario,
    source: scenario.source || 'agent_test',
    tags
  };
};

export const buildAgentTestRunMemoryEntry = (run: AgentTestRun, scenario?: AgentTestScenario | null) => {
  const symbol = run.context?.symbol || scenario?.context?.symbol || null;
  const timeframe = run.context?.timeframe || scenario?.context?.timeframe || null;
  const summaryParts = [
    run.scenarioName || run.scenarioId,
    run.status.toUpperCase(),
    run.metrics?.completedSteps != null && run.metrics?.totalSteps != null
      ? `${run.metrics.completedSteps}/${run.metrics.totalSteps} steps`
      : null,
    run.metrics?.tradeClosedCount != null && run.metrics?.tradeNetPnl != null
      ? `Pnl ${Number(run.metrics.tradeNetPnl).toFixed(2)}`
      : null
  ].filter(Boolean);
  const tags = [
    run.scenarioId,
    run.status,
    symbol,
    timeframe
  ].filter(Boolean) as string[];
  return {
    key: buildAgentTestRunKey(run.runId),
    familyKey: buildAgentTestScenarioKey(run.scenarioId),
    scope: 'shared',
    category: 'agent_test',
    subcategory: 'run',
    kind: 'agent_test_run',
    symbol,
    timeframe,
    summary: summaryParts.join(' | '),
    payload: run,
    source: run.source || scenario?.source || 'agent_test',
    tags
  };
};
