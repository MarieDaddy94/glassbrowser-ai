import type { SignalIntent, SignalIntentRun, SignalIntentChatTurn } from '../types';
import { normalizeSignalIntent } from './signalIntentParser';
import { computeSignalIntentNextDueAt } from './signalIntentScheduler';

export const createSignalIntentId = () => `intent_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

export const createSignalIntentRunId = (intentId: string) =>
  `intent_run_${intentId}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

export const normalizeSignalIntentRun = (raw: any): SignalIntentRun | null => {
  if (!raw || typeof raw !== 'object') return null;
  const intentId = String(raw.intentId || '').trim();
  const runId = String(raw.runId || '').trim();
  if (!intentId || !runId) return null;
  const resultRaw = String(raw.result || '').trim().toLowerCase();
  const result: SignalIntentRun['result'] =
    resultRaw === 'spawned' || resultRaw === 'error' ? (resultRaw as SignalIntentRun['result']) : 'no_match';
  return {
    intentId,
    runId,
    triggerAtMs: Number.isFinite(Number(raw.triggerAtMs)) ? Number(raw.triggerAtMs) : Date.now(),
    scopeKey: raw.scopeKey ? String(raw.scopeKey) : null,
    result,
    signalIds: Array.isArray(raw.signalIds) ? raw.signalIds.map((item: any) => String(item || '').trim()).filter(Boolean) : null,
    note: raw.note ? String(raw.note) : null
  };
};

export const normalizeSignalIntentChatTurn = (raw: any): SignalIntentChatTurn | null => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const intentId = String(raw.intentId || '').trim();
  const text = String(raw.text || '').trim();
  if (!id || !intentId || !text) return null;
  const roleRaw = String(raw.role || '').trim().toLowerCase();
  const role: SignalIntentChatTurn['role'] =
    roleRaw === 'assistant' || roleRaw === 'system' ? (roleRaw as SignalIntentChatTurn['role']) : 'user';
  return {
    id,
    intentId,
    role,
    text,
    atMs: Number.isFinite(Number(raw.atMs)) ? Number(raw.atMs) : Date.now()
  };
};

export const buildSignalIntentFromDraft = (draft: Partial<SignalIntent>): SignalIntent | null => {
  const normalized = normalizeSignalIntent({
    id: draft.id || createSignalIntentId(),
    ...draft,
    createdAtMs: draft.createdAtMs || Date.now(),
    updatedAtMs: Date.now()
  });
  if (!normalized) return null;
  const nextDueAtMs = computeSignalIntentNextDueAt(normalized, Date.now());
  return {
    ...normalized,
    nextDueAtMs
  };
};

export const applySignalIntentPatch = (intent: SignalIntent, patch: Partial<SignalIntent>) => {
  const next = normalizeSignalIntent({
    ...intent,
    ...patch,
    id: intent.id,
    updatedAtMs: Date.now()
  });
  if (!next) return intent;
  return {
    ...next,
    nextDueAtMs: computeSignalIntentNextDueAt(next, Date.now())
  };
};

export const sortSignalIntents = (intents: SignalIntent[]) =>
  [...intents].sort((a, b) => {
    const aActive = a.status === 'active' ? 0 : 1;
    const bActive = b.status === 'active' ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0);
  });

