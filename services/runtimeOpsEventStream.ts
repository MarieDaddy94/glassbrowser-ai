import type { RuntimeOpsEvent, RuntimeOpsEventLevel } from '../types';

export const DEFAULT_RUNTIME_EVENT_BUFFER_LIMIT = 600;

const normalizeLevel = (value: any): RuntimeOpsEventLevel => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'warn') return 'warn';
  if (raw === 'error') return 'error';
  return 'info';
};

export const normalizeRuntimeOpsEvent = (payload: any): RuntimeOpsEvent | null => {
  if (!payload || typeof payload !== 'object') return null;
  const event = payload.event && typeof payload.event === 'object' ? payload.event : payload;
  const id = String(event.id || '').trim();
  const message = String(event.message || '').trim();
  if (!id || !message) return null;
  const ts = Number(event.ts);
  return {
    id,
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
    seq: Number.isFinite(Number(event.seq)) ? Number(event.seq) : null,
    streamId: payload.streamId != null ? String(payload.streamId) : (event.streamId != null ? String(event.streamId) : null),
    source: String(event.source || 'runtime'),
    level: normalizeLevel(event.level),
    message,
    code: event.code != null ? String(event.code) : null,
    droppedCount: Number.isFinite(Number(event.droppedCount)) ? Number(event.droppedCount) : null,
    payload: event.payload && typeof event.payload === 'object' ? event.payload : null
  };
};

export const pushRuntimeOpsEvent = (
  list: RuntimeOpsEvent[],
  next: RuntimeOpsEvent,
  limit = DEFAULT_RUNTIME_EVENT_BUFFER_LIMIT
): RuntimeOpsEvent[] => {
  const safeLimit = Math.max(50, Math.floor(Number(limit) || DEFAULT_RUNTIME_EVENT_BUFFER_LIMIT));
  const merged = list.slice();
  const last = merged[merged.length - 1];
  if (last && last.message === next.message && last.source === next.source && Math.abs(next.ts - last.ts) < 1200) {
    merged[merged.length - 1] = {
      ...next,
      payload: {
        ...(last.payload || {}),
        ...(next.payload || {}),
        repeated: Number((last.payload as any)?.repeated || 1) + 1
      }
    };
  } else {
    merged.push(next);
  }
  if (merged.length > safeLimit) {
    merged.splice(0, merged.length - safeLimit);
  }
  return merged;
};

export const filterRuntimeOpsEvents = (
  events: RuntimeOpsEvent[],
  input: { text?: string; level?: string; source?: string }
): RuntimeOpsEvent[] => {
  const textNeedle = String(input.text || '').trim().toLowerCase();
  const levelNeedle = String(input.level || '').trim().toLowerCase();
  const sourceNeedle = String(input.source || '').trim().toLowerCase();
  return (events || []).filter((event) => {
    if (levelNeedle && levelNeedle !== 'all' && String(event.level || '').toLowerCase() !== levelNeedle) return false;
    if (sourceNeedle && sourceNeedle !== 'all' && String(event.source || '').toLowerCase() !== sourceNeedle) return false;
    if (!textNeedle) return true;
    const hay = `${event.message || ''} ${(event.code || '')} ${JSON.stringify(event.payload || {})}`.toLowerCase();
    return hay.includes(textNeedle);
  });
};
