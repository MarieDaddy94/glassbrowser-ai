import type { SignalIntent } from '../types';

type ZonedParts = {
  weekday: number;
  hhmm: string;
  ymd: string;
  hour: number;
};

const WEEKDAY_FROM_SHORT: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
};

const getZonedParts = (atMs: number, timezone: string): ZonedParts => {
  const date = new Date(atMs);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const map = new Map<string, string>();
  for (const part of formatter.formatToParts(date)) {
    if (part.type === 'literal') continue;
    map.set(part.type, part.value);
  }
  const weekdayRaw = String(map.get('weekday') || '').toLowerCase().slice(0, 3);
  const weekday = WEEKDAY_FROM_SHORT[weekdayRaw] ?? date.getUTCDay();
  const year = String(map.get('year') || '1970');
  const month = String(map.get('month') || '01');
  const day = String(map.get('day') || '01');
  const hour = Number(map.get('hour') || '0');
  const minute = String(map.get('minute') || '00');
  return {
    weekday,
    hhmm: `${String(hour).padStart(2, '0')}:${minute}`,
    ymd: `${year}-${month}-${day}`,
    hour: Number.isFinite(hour) ? hour : 0
  };
};

export const isSignalIntentSessionAllowed = (intent: SignalIntent, atMs: number): boolean => {
  const gates = Array.isArray(intent.sessionGates) ? intent.sessionGates.filter((gate) => gate && gate.enabled) : [];
  if (gates.length === 0) return true;
  const timezone = intent.schedule?.timezone || 'UTC';
  const parts = getZonedParts(atMs, timezone);
  return gates.some((gate) => {
    const start = Number.isFinite(Number(gate.startHour)) ? Number(gate.startHour) : null;
    const end = Number.isFinite(Number(gate.endHour)) ? Number(gate.endHour) : null;
    if (start == null || end == null) return true;
    if (start === end) return true;
    if (start < end) return parts.hour >= start && parts.hour < end;
    return parts.hour >= start || parts.hour < end;
  });
};

export const isSignalIntentDueAt = (intent: SignalIntent, atMs: number): { due: boolean; slotKey: string | null } => {
  if (!intent || intent.status !== 'active') return { due: false, slotKey: null };
  const timezone = intent.schedule?.timezone || 'UTC';
  const times = Array.isArray(intent.schedule?.times) ? intent.schedule.times : [];
  if (times.length === 0) return { due: false, slotKey: null };
  const weekdays = Array.isArray(intent.schedule?.weekdays) ? intent.schedule.weekdays : [1, 2, 3, 4, 5];
  const parts = getZonedParts(atMs, timezone);
  if (!weekdays.includes(parts.weekday)) return { due: false, slotKey: null };
  if (!times.includes(parts.hhmm)) return { due: false, slotKey: null };
  if (!isSignalIntentSessionAllowed(intent, atMs)) return { due: false, slotKey: null };
  return {
    due: true,
    slotKey: `${intent.id}:${parts.ymd}:${parts.hhmm}:${timezone}`
  };
};

export const computeSignalIntentNextDueAt = (intent: SignalIntent, nowMs: number): number | null => {
  if (!intent || intent.status !== 'active') return null;
  // Minute-level bounded search (8 days) keeps behavior deterministic across timezones.
  const maxMinutes = 8 * 24 * 60;
  for (let i = 1; i <= maxMinutes; i += 1) {
    const candidate = nowMs + i * 60_000;
    const due = isSignalIntentDueAt(intent, candidate);
    if (due.due) {
      return candidate - (candidate % 60_000);
    }
  }
  return null;
};

export const computeDueIntents = (intents: SignalIntent[], nowMs: number, seenSlots: Set<string>) => {
  const due: Array<{ intent: SignalIntent; slotKey: string }> = [];
  for (const intent of Array.isArray(intents) ? intents : []) {
    const check = isSignalIntentDueAt(intent, nowMs);
    if (!check.due || !check.slotKey) continue;
    if (seenSlots.has(check.slotKey)) continue;
    due.push({ intent, slotKey: check.slotKey });
  }
  return due;
};

