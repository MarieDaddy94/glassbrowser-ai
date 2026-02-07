import { Agent, AgentDraft, AgentCreatorMessage, UploadedTextRef } from '../types';
import { sendPlainTextToOpenAI } from './openaiService';
import { buildAgentCreatorSystemPrompt, buildAgentCreatorUserPrompt } from './agentCreatorPromptBuilder';
import { normalizeAgentDraftFromModel, synthesizeAgentInstructionFromDraft } from './agentCreatorSchema';
import { normalizeAgentCapabilities } from './agentCapabilities';

type RunCatalog = (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;

const emitTelemetry = (eventType: string, payload: Record<string, any>) => {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('glass_agent_creator_event', {
        detail: { eventType, payload, atMs: Date.now() }
      })
    );
  } catch {
    // ignore telemetry failures
  }
};

const buildHistorySummary = (messages: AgentCreatorMessage[], limit = 12) => {
  const list = Array.isArray(messages) ? messages.slice(-limit) : [];
  return list
    .map((msg) => `${msg.role.toUpperCase()}: ${String(msg.text || '').trim()}`)
    .filter(Boolean)
    .join('\n');
};

const runModelForDraft = async (input: {
  instruction: string;
  selectedFiles: Array<{ ref: UploadedTextRef; text: string }>;
  activeSymbol?: string | null;
  activeTimeframe?: string | null;
  messages?: AgentCreatorMessage[];
  mode?: 'create' | 'refine' | 'review';
  existingDraft?: AgentDraft | null;
}) => {
  const historySummary = buildHistorySummary(input.messages || []);
  const existingDraftJson = input.existingDraft ? JSON.stringify(input.existingDraft, null, 2) : null;
  const system = buildAgentCreatorSystemPrompt({
    userInstruction: input.instruction,
    selectedFiles: input.selectedFiles,
    activeSymbol: input.activeSymbol,
    activeTimeframe: input.activeTimeframe,
    mode: input.mode,
    existingDraftJson
  });
  const user = buildAgentCreatorUserPrompt({
    userInstruction: [input.instruction, historySummary ? `Recent chat:\n${historySummary}` : '']
      .filter(Boolean)
      .join('\n\n'),
    selectedFiles: input.selectedFiles,
    activeSymbol: input.activeSymbol,
    activeTimeframe: input.activeTimeframe,
    mode: input.mode,
    existingDraftJson
  });
  const startedAtMs = Date.now();
  const responseText = await sendPlainTextToOpenAI({
    system,
    user,
    model: 'gpt-5.2',
    temperature: 0.2,
    maxOutputTokens: 1400
  });
  const normalized = normalizeAgentDraftFromModel(
    responseText,
    input.selectedFiles.map((item) => item.ref)
  );
  emitTelemetry('agent_creator_draft_model_latency', {
    durationMs: Date.now() - startedAtMs,
    ok: normalized.ok
  });
  return { responseText, normalized };
};

export const createDraftFromPrompt = async (input: {
  instruction: string;
  selectedFiles: Array<{ ref: UploadedTextRef; text: string }>;
  activeSymbol?: string | null;
  activeTimeframe?: string | null;
  messages?: AgentCreatorMessage[];
}) => {
  const { normalized } = await runModelForDraft({
    instruction: input.instruction,
    selectedFiles: input.selectedFiles,
    activeSymbol: input.activeSymbol,
    activeTimeframe: input.activeTimeframe,
    messages: input.messages,
    mode: 'create'
  });
  emitTelemetry(normalized.ok ? 'agent_creator_draft_created' : 'agent_creator_validation_failed', {
    warnings: normalized.warnings,
    errors: normalized.errors
  });
  return normalized;
};

export const refineDraft = async (input: {
  instruction: string;
  draft: AgentDraft;
  selectedFiles: Array<{ ref: UploadedTextRef; text: string }>;
  activeSymbol?: string | null;
  activeTimeframe?: string | null;
  messages?: AgentCreatorMessage[];
}) => {
  const { normalized } = await runModelForDraft({
    instruction: input.instruction,
    selectedFiles: input.selectedFiles,
    activeSymbol: input.activeSymbol,
    activeTimeframe: input.activeTimeframe,
    messages: input.messages,
    mode: 'refine',
    existingDraft: input.draft
  });
  const merged: AgentDraft = {
    ...input.draft,
    ...normalized.draft,
    id: input.draft.id,
    createdAtMs: input.draft.createdAtMs,
    updatedAtMs: Date.now(),
    useInSignalScans: input.draft.useInSignalScans !== false
  };
  emitTelemetry(normalized.ok ? 'agent_creator_draft_refined' : 'agent_creator_validation_failed', {
    warnings: normalized.warnings,
    errors: normalized.errors
  });
  return {
    ...normalized,
    draft: merged
  };
};

export const validateDraft = (draft: AgentDraft) => {
  const { ok, warnings, errors } = normalizeAgentDraftFromModel(JSON.stringify(draft), draft.sourceFiles || []);
  return { ok, warnings, errors };
};

export const publishDraftToAgent = async (input: {
  draft: AgentDraft;
  runActionCatalog: RunCatalog;
  color?: string;
  activate?: boolean;
}): Promise<{ ok: boolean; agentId?: string; error?: string }> => {
  const draft = input.draft;
  const actionRunner = input.runActionCatalog;
  if (!draft || !actionRunner) return { ok: false, error: 'Draft publish context unavailable.' };

  const capabilities = normalizeAgentCapabilities({
    trade: draft.capabilities?.trade !== false,
    tools: !!draft.capabilities?.tools,
    broker: !!draft.capabilities?.broker,
    autoExecute: !!draft.capabilities?.autoExecute
  });
  const payload = {
    name: draft.name,
    instruction: synthesizeAgentInstructionFromDraft(draft),
    type: 'openai',
    color: input.color || 'bg-indigo-600',
    capabilities,
    active: input.activate === true
  };
  try {
    const isUpdate = !!draft.publishedAgentId;
    const res = await actionRunner({
      actionId: isUpdate ? 'agent.update' : 'agent.add',
      payload: isUpdate ? { ...payload, agentId: draft.publishedAgentId } : payload
    });
    if (!res?.ok) {
      emitTelemetry('agent_creator_publish_blocked_capability', {
        draftId: draft.id,
        error: res?.error || 'Publish failed.'
      });
      return { ok: false, error: res?.error || 'Publish failed.' };
    }
    const agentId = String(res?.data?.agentId || draft.publishedAgentId || '').trim();
    emitTelemetry('agent_creator_published', {
      draftId: draft.id,
      agentId: agentId || null
    });
    return { ok: true, agentId };
  } catch (err: any) {
    return { ok: false, error: err?.message ? String(err.message) : 'Publish failed.' };
  }
};

export const buildAgentPreview = (draft: AgentDraft): Agent => {
  return {
    id: draft.publishedAgentId || draft.id,
    name: draft.name,
    color: 'bg-indigo-600',
    type: 'openai',
    profile: 'trading',
    systemInstruction: synthesizeAgentInstructionFromDraft(draft),
    capabilities: normalizeAgentCapabilities(draft.capabilities)
  };
};

