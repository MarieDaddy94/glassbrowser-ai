import { AgentCapabilities, AgentConfidencePolicy, AgentDraft, UploadedTextRef } from '../types';
import { DEFAULT_AGENT_CAPABILITIES, normalizeAgentCapabilities } from './agentCapabilities';

type ValidationResult = {
  ok: boolean;
  draft: AgentDraft;
  warnings: string[];
  errors: string[];
};

const toText = (value: any) => String(value == null ? '' : value).trim();

const toStringArray = (value: any, maxItems = 16): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = toText(item);
    if (!text) continue;
    if (!out.includes(text)) out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
};

const toNumberOr = (value: any, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizePolicy = (value: any): AgentConfidencePolicy => {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    minProbability: Math.max(1, Math.min(100, Math.round(toNumberOr(raw.minProbability, 65)))),
    maxProbability: Math.max(1, Math.min(100, Math.round(toNumberOr(raw.maxProbability, 95)))),
    minRiskReward: Math.max(0.2, Math.min(20, toNumberOr(raw.minRiskReward, 1.4)))
  };
};

const normalizeCapabilitiesSafe = (value: any): AgentCapabilities => {
  const caps = normalizeAgentCapabilities(value);
  return {
    trade: caps.trade !== false,
    tools: !!caps.tools,
    broker: !!caps.broker,
    autoExecute: !!caps.autoExecute
  };
};

const parseStructuredJson = (text: string): any => {
  const raw = String(text || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Try extracting fenced JSON/object block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
};

const buildEmptyDraft = (files: UploadedTextRef[]): AgentDraft => {
  const now = Date.now();
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `draft_${crypto.randomUUID()}`
        : `draft_${now}_${Math.random().toString(16).slice(2, 8)}`,
    name: 'New Agent',
    description: '',
    strategyText: '',
    watchSymbols: [],
    watchTimeframes: [],
    sessionWindows: [],
    entryRules: [],
    exitRules: [],
    riskRules: [],
    confidencePolicy: {
      minProbability: 65,
      maxProbability: 95,
      minRiskReward: 1.4
    },
    capabilities: {
      ...DEFAULT_AGENT_CAPABILITIES,
      tools: false,
      broker: false,
      autoExecute: false
    },
    status: 'draft',
    sourceFiles: Array.isArray(files) ? files : [],
    createdAtMs: now,
    updatedAtMs: now,
    useInSignalScans: true
  };
};

export const normalizeAgentDraftFromModel = (inputText: string, files: UploadedTextRef[]): ValidationResult => {
  const base = buildEmptyDraft(files);
  const parsed = parseStructuredJson(inputText);
  const warnings: string[] = [];
  const errors: string[] = [];

  const name = toText(parsed.name || parsed.agentName || base.name);
  const description = toText(parsed.description || parsed.summary || '');
  const strategyText = toText(parsed.strategyText || parsed.strategy || parsed.strategySummary || '');
  const watchSymbols = toStringArray(parsed.watchSymbols || parsed.symbols || []);
  const watchTimeframes = toStringArray(parsed.watchTimeframes || parsed.timeframes || []);
  const sessionWindows = toStringArray(parsed.sessionWindows || parsed.sessions || []);
  const entryRules = toStringArray(parsed.entryRules || parsed.entries || []);
  const exitRules = toStringArray(parsed.exitRules || parsed.exits || []);
  const riskRules = toStringArray(parsed.riskRules || parsed.risk || []);
  const confidencePolicy = normalizePolicy(parsed.confidencePolicy || parsed.confidence || {});
  const capabilities = normalizeCapabilitiesSafe(parsed.capabilities || {});

  if (!name) errors.push('Agent name is required.');
  if (!strategyText) errors.push('Strategy summary is required.');
  if (entryRules.length === 0) errors.push('At least one entry rule is required.');
  if (exitRules.length === 0) errors.push('At least one exit rule is required.');
  if (watchTimeframes.length === 0) warnings.push('No timeframes provided.');
  if (watchSymbols.length === 0) warnings.push('No symbols provided.');

  // Safety clamp: never auto-enable dangerous capabilities by model output alone.
  if (capabilities.tools) warnings.push('Tools capability requested and requires explicit user confirmation.');
  if (capabilities.broker) warnings.push('Broker capability requested and requires explicit user confirmation.');
  if (capabilities.autoExecute) warnings.push('Auto-execute requested and requires explicit user confirmation.');

  if (confidencePolicy.maxProbability! < confidencePolicy.minProbability!) {
    confidencePolicy.maxProbability = confidencePolicy.minProbability;
  }

  const now = Date.now();
  const draft: AgentDraft = {
    ...base,
    name: name || base.name,
    description,
    strategyText,
    watchSymbols,
    watchTimeframes,
    sessionWindows,
    entryRules,
    exitRules,
    riskRules,
    confidencePolicy,
    capabilities: {
      trade: capabilities.trade !== false,
      tools: false,
      broker: false,
      autoExecute: false
    },
    status: errors.length === 0 ? 'validated' : 'draft',
    sourceFiles: Array.isArray(files) ? files : [],
    updatedAtMs: now
  };

  return {
    ok: errors.length === 0,
    draft,
    warnings,
    errors
  };
};

export const synthesizeAgentInstructionFromDraft = (draft: AgentDraft): string => {
  const sections = [
    `You are ${draft.name}, a trading agent for GlassBrowser AI.`,
    draft.description ? `Mission: ${draft.description}` : '',
    draft.strategyText ? `Strategy Summary: ${draft.strategyText}` : '',
    draft.watchSymbols?.length ? `Focus Symbols: ${draft.watchSymbols.join(', ')}` : '',
    draft.watchTimeframes?.length ? `Timeframes: ${draft.watchTimeframes.join(', ')}` : '',
    draft.sessionWindows?.length ? `Preferred Sessions: ${draft.sessionWindows.join(', ')}` : '',
    draft.entryRules?.length ? `Entry Rules:\n- ${draft.entryRules.join('\n- ')}` : '',
    draft.exitRules?.length ? `Exit Rules:\n- ${draft.exitRules.join('\n- ')}` : '',
    draft.riskRules?.length ? `Risk Rules:\n- ${draft.riskRules.join('\n- ')}` : '',
    `Confidence Policy: min ${draft.confidencePolicy.minProbability}% / max ${draft.confidencePolicy.maxProbability}%, min RR ${draft.confidencePolicy.minRiskReward}.`,
    'Use only evidence available from snapshots and broker data. Do not invent prices.'
  ].filter(Boolean);
  return sections.join('\n\n');
};

