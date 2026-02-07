import type { AgentToolAction } from '../types';

type ParseArgs = (value: any) => any;

export type BuildRunActionCatalogToolActionInput = {
  args: any;
  parseArgs: ParseArgs;
  agentId: string;
};

export type BuildRunActionCatalogToolActionResult = {
  action?: AgentToolAction;
  error?: string;
};

const normalizeToolString = (value: any) => {
  const raw = String(value || '').trim();
  return raw || undefined;
};

const normalizeToolBoolean = (value: any) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (['true', '1', 'yes', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'n'].includes(raw)) return false;
  return undefined;
};

const normalizeToolMode = (value: any): AgentToolAction['mode'] => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'suggest' || raw === 'paper' || raw === 'live') return raw;
  return undefined;
};

const normalizeStepsInput = (value: any) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parts = value
      .split(/[>,]/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : null;
  }
  return null;
};

export const buildRunActionCatalogToolAction = (
  input: BuildRunActionCatalogToolActionInput
): BuildRunActionCatalogToolActionResult => {
  const args = input.args && typeof input.args === 'object' ? input.args : {};

  let payload: Record<string, any> = {};
  if (args.payload && typeof args.payload === 'object') {
    payload = { ...args.payload };
  } else if (typeof args.payload === 'string') {
    try {
      payload = input.parseArgs(args.payload) as Record<string, any>;
    } catch {
      payload = { raw: args.payload };
    }
  }

  const stepsInput = normalizeStepsInput(args.steps ?? args.actions ?? args.sequence);
  if (stepsInput && payload.steps == null && payload.actions == null && payload.sequence == null) {
    payload.steps = stepsInput;
  }

  const intent = normalizeToolString(args.intent);
  const intentKey = normalizeToolString(args.intentKey);
  const preferFlow = normalizeToolBoolean(args.preferFlow);
  if (intent) payload.intent = intent;
  if (intentKey) payload.intentKey = intentKey;
  if (typeof preferFlow === 'boolean') payload.preferFlow = preferFlow;

  const actionId = normalizeToolString(args.actionId || payload.actionId);
  if (actionId && !payload.actionId) payload.actionId = actionId;
  const hasFlowIntent = !!(payload.intentKey || payload.intent);

  if (!actionId && !hasFlowIntent) {
    return { error: 'Action catalog request missing actionId.' };
  }

  const symbol = normalizeToolString(args.symbol) || normalizeToolString(payload.symbol);
  const timeframe = normalizeToolString(args.timeframe) || normalizeToolString(payload.timeframe);
  const strategy = normalizeToolString(args.strategy) || normalizeToolString(payload.strategy);

  return {
    action: {
      type: 'RUN_ACTION_CATALOG',
      status: 'PENDING',
      actionId: actionId || undefined,
      payload,
      symbol,
      timeframe,
      strategy,
      mode: normalizeToolMode(args.mode || payload.mode),
      dedupeKey: normalizeToolString(args.dedupeKey || payload.dedupeKey),
      source: normalizeToolString(args.source || payload.source),
      reason: normalizeToolString(args.reason || payload.reason),
      agentId: input.agentId
    }
  };
};
