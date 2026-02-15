import type { AcademyCase } from '../types';

export type AcademyCaseLockRecord = {
  signalId: string;
  caseId: string;
  lockedAtMs: number;
  source?: string | null;
  reason?: string | null;
};

const LOCK_KIND = 'academy_case_lock';
const LOCK_PREFIX = 'academy_case_lock:';

const asText = (value: any) => {
  const text = String(value || '').trim();
  return text;
};

const toSignalId = (value: any) => {
  const text = asText(value);
  return text;
};

const lockKey = (signalId: string) => `${LOCK_PREFIX}${signalId}`;

const normalizeLockMemory = (memory: any): AcademyCaseLockRecord | null => {
  if (!memory || typeof memory !== 'object') return null;
  const payload = memory.payload && typeof memory.payload === 'object' ? memory.payload : memory;
  const rawKey = asText(memory.key || memory.id || '').replace(/^academy_case_lock:/, '');
  const signalId = toSignalId(payload.signalId || payload.caseId || rawKey);
  const caseId = toSignalId(payload.caseId || payload.signalId || rawKey);
  if (!signalId || !caseId) return null;
  const lockedAtMs = Number.isFinite(Number(payload.lockedAtMs))
    ? Number(payload.lockedAtMs)
    : Date.now();
  return {
    signalId,
    caseId,
    lockedAtMs,
    source: payload.source ? String(payload.source) : null,
    reason: payload.reason ? String(payload.reason) : null
  };
};

export const lockCase = async (input: {
  signalId: string;
  caseId?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  agentId?: string | null;
  source?: string | null;
  reason?: string | null;
  payload?: AcademyCase | null;
}): Promise<{ ok: boolean; record?: AcademyCaseLockRecord | null; error?: string | null }> => {
  const signalId = toSignalId(input.signalId);
  const caseId = toSignalId(input.caseId || input.signalId);
  if (!signalId || !caseId) {
    return { ok: false, error: 'Missing signalId/caseId for academy lock.' };
  }
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.upsertAgentMemory) {
    return { ok: false, error: 'Trade ledger unavailable.' };
  }
  const now = Date.now();
  const record: AcademyCaseLockRecord = {
    signalId,
    caseId,
    lockedAtMs: now,
    source: input.source ? String(input.source) : null,
    reason: input.reason ? String(input.reason) : null
  };
  const payload = {
    ...record,
    symbol: input.symbol ? String(input.symbol) : null,
    timeframe: input.timeframe ? String(input.timeframe) : null,
    agentId: input.agentId ? String(input.agentId) : null,
    casePayload: input.payload && typeof input.payload === 'object' ? input.payload : null
  };
  await ledger.upsertAgentMemory({
    key: lockKey(signalId),
    familyKey: input.symbol ? `academy_case_lock:${String(input.symbol).trim().toLowerCase()}` : undefined,
    agentId: input.agentId ?? null,
    scope: 'shared',
    category: 'academy',
    subcategory: 'lock',
    kind: LOCK_KIND,
    symbol: input.symbol || undefined,
    timeframe: input.timeframe || undefined,
    summary: `LOCK ${signalId}`,
    payload,
    tags: ['academy_case_lock', signalId, caseId].filter(Boolean),
    source: input.source || 'signal_button'
  });
  return { ok: true, record };
};

export const listLocks = async (limit: number = 5000): Promise<Map<string, AcademyCaseLockRecord>> => {
  const out = new Map<string, AcademyCaseLockRecord>();
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.listAgentMemory) return out;
  const res = await ledger.listAgentMemory({
    kind: LOCK_KIND,
    limit: Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : 5000
  });
  if (!res?.ok || !Array.isArray(res.memories)) return out;
  for (const memory of res.memories) {
    const record = normalizeLockMemory(memory);
    if (!record) continue;
    out.set(record.signalId, record);
  }
  return out;
};

export const isLocked = async (signalId: string): Promise<boolean> => {
  const id = toSignalId(signalId);
  if (!id) return false;
  const ledger = (window as any)?.glass?.tradeLedger;
  if (!ledger?.getAgentMemory) {
    const locks = await listLocks(5000);
    return locks.has(id);
  }
  const res = await ledger.getAgentMemory({ key: lockKey(id) });
  if (!res?.ok || !res.memory) return false;
  return !!normalizeLockMemory(res.memory);
};

