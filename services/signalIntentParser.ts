import type { SignalIntent, SignalIntentSchedule, SignalIntentSessionGate, SignalIntentStatus } from '../types';
import { normalizeSymbolKey, normalizeTimeframeKey } from './symbols';

type ParseIntentInput = {
  prompt: string;
  agentId: string;
  knownSymbols?: string[] | null;
  defaultSymbol?: string | null;
  defaultTimeframes?: string[] | null;
  defaultTimezone?: string | null;
};

type ParseIntentResult = {
  ok: boolean;
  draft: Partial<SignalIntent>;
  errors: string[];
  warnings: string[];
  confidence: number;
  needsConfirmation: boolean;
};

const SIGNAL_INTENT_MIN_CONFIDENCE = 0.72;

const WEEKDAY_LOOKUP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

const SESSION_LOOKUP: Record<string, SignalIntentSessionGate['id']> = {
  asia: 'asia',
  london: 'london',
  ny: 'ny',
  newyork: 'ny',
  new_york: 'ny'
};

const MARKET_TIMEZONE_BY_SYMBOL: Record<string, string> = {
  NAS100: 'America/New_York',
  US100: 'America/New_York',
  SPX500: 'America/New_York',
  US30: 'America/New_York',
  XAUUSD: 'America/New_York',
  XAGUSD: 'America/New_York',
  EURUSD: 'Europe/London',
  GBPUSD: 'Europe/London',
  USDJPY: 'Asia/Tokyo',
  BTCUSD: 'Etc/UTC'
};

const parseTimes = (text: string): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const rx = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(text))) {
    const rawHour = Number(match[1]);
    const rawMinute = match[2] != null ? Number(match[2]) : 0;
    const meridian = String(match[3] || '').toLowerCase();
    if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinute)) continue;
    if (rawMinute < 0 || rawMinute > 59) continue;
    let hour = rawHour;
    if (meridian) {
      if (hour < 1 || hour > 12) continue;
      if (meridian === 'am') hour = hour % 12;
      else hour = hour % 12 + 12;
    } else if (hour > 23) {
      continue;
    }
    const hh = String(hour).padStart(2, '0');
    const mm = String(rawMinute).padStart(2, '0');
    const slot = `${hh}:${mm}`;
    if (seen.has(slot)) continue;
    seen.add(slot);
    out.push(slot);
  }
  return out;
};

const parseWeekdays = (text: string): number[] => {
  const out = new Set<number>();
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_ ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const word of words) {
    const value = WEEKDAY_LOOKUP[word];
    if (value == null) continue;
    out.add(value);
  }
  if (/\bweekdays?\b/i.test(text)) {
    [1, 2, 3, 4, 5].forEach((day) => out.add(day));
  }
  if (/\bweekends?\b/i.test(text)) {
    [0, 6].forEach((day) => out.add(day));
  }
  return Array.from(out.values()).sort((a, b) => a - b);
};

const parseTimeframes = (text: string, fallback: string[] | null | undefined): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const rx = /\b(\d{1,3})\s*(m|min|h|hr|d|day|w|wk)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(text))) {
    const value = String(match[1] || '').trim();
    const unit = String(match[2] || '').trim().toLowerCase();
    let tfRaw = '';
    if (unit.startsWith('m')) tfRaw = `${value}m`;
    else if (unit.startsWith('h')) tfRaw = `${value}h`;
    else if (unit.startsWith('d')) tfRaw = `${value}d`;
    else if (unit.startsWith('w')) tfRaw = `${value}w`;
    const normalized = normalizeTimeframeKey(tfRaw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  if (out.length > 0) return out;
  const defaults = Array.isArray(fallback) ? fallback : [];
  for (const entry of defaults) {
    const normalized = normalizeTimeframeKey(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.length > 0 ? out : ['5m'];
};

const parseTargetPoints = (text: string): number | null => {
  const rx = /\b(\d+(?:\.\d+)?)\s*(?:point|points|pt|pts)\b/i;
  const match = rx.exec(text);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0.1, Math.min(10_000, raw));
};

const parseProbability = (text: string): number | null => {
  const pct = /\b(\d{1,3})\s*%\b/.exec(text);
  if (pct) {
    const value = Number(pct[1]);
    if (Number.isFinite(value)) return Math.max(1, Math.min(100, Math.round(value)));
  }
  const atLeast = /\b(?:at least|min(?:imum)?)\s+(\d{1,3})\b/i.exec(text);
  if (atLeast) {
    const value = Number(atLeast[1]);
    if (Number.isFinite(value)) return Math.max(1, Math.min(100, Math.round(value)));
  }
  return null;
};

const parseStrategyMode = (text: string): SignalIntent['strategyMode'] => {
  if (/\bscalp|scalping\b/i.test(text)) return 'scalp';
  if (/\bswing\b/i.test(text)) return 'swing';
  if (/\bday\b/i.test(text)) return 'day';
  return null;
};

const parseSessions = (text: string): SignalIntentSessionGate[] => {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_ ]+/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const ids = new Set<SignalIntentSessionGate['id']>();
  for (const word of words) {
    const id = SESSION_LOOKUP[word];
    if (id) ids.add(id);
  }
  return Array.from(ids.values()).map((id) => ({ id, enabled: true }));
};

const resolveSymbol = (input: ParseIntentInput): string => {
  const prompt = String(input.prompt || '').toUpperCase();
  const known = Array.isArray(input.knownSymbols) ? input.knownSymbols : [];
  const normalizedKnown = known
    .map((entry) => String(entry || '').trim().toUpperCase())
    .filter(Boolean);
  for (const symbol of normalizedKnown) {
    if (prompt.includes(symbol)) return symbol;
  }
  const tokenMatch = /\b[A-Z]{3,10}(?:\.[A-Z0-9]+)?\b/.exec(prompt);
  if (tokenMatch) return tokenMatch[0];
  return String(input.defaultSymbol || normalizedKnown[0] || 'NAS100').trim().toUpperCase();
};

const resolveTimezone = (symbol: string, prompt: string, fallback?: string | null): string => {
  const cleanSymbol = normalizeSymbolKey(symbol) || symbol;
  if (/\bnew\s*york|ny\b/i.test(prompt)) return 'America/New_York';
  if (/\blondon\b/i.test(prompt)) return 'Europe/London';
  if (/\btokyo|asia\b/i.test(prompt)) return 'Asia/Tokyo';
  if (/\butc|gmt\b/i.test(prompt)) return 'Etc/UTC';
  return MARKET_TIMEZONE_BY_SYMBOL[cleanSymbol] || String(fallback || 'America/New_York');
};

const buildDefaultSchedule = (prompt: string, symbol: string, defaultTimezone?: string | null): SignalIntentSchedule => {
  const times = parseTimes(prompt);
  const weekdays = parseWeekdays(prompt);
  const marketOpenMode = /\bmarket\s+open\b/i.test(prompt);
  const timezone = resolveTimezone(symbol, prompt, defaultTimezone);
  const scheduleTimes = times.length > 0 ? times : marketOpenMode ? ['09:30'] : [];
  return {
    timezone,
    times: scheduleTimes,
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5],
    marketOpenMode
  };
};

const normalizeSymbol = (value: any): string => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  return normalizeSymbolKey(raw) || raw;
};

const mergeUniqueText = (base: string[], extra: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (list: string[]) => {
    for (const item of list) {
      const text = String(item || '').trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
  };
  add(base);
  add(extra);
  return out;
};

const deriveConfidence = (draft: Partial<SignalIntent>, preferred: number | null): number => {
  if (Number.isFinite(Number(preferred))) {
    return Math.max(0, Math.min(1, Number(preferred)));
  }
  let confidence = 0.35;
  if (draft.symbol) confidence += 0.15;
  if (Array.isArray(draft.timeframes) && draft.timeframes.length > 0) confidence += 0.15;
  if (Array.isArray(draft.schedule?.times) && draft.schedule.times.length > 0) confidence += 0.2;
  if (draft.strategyMode) confidence += 0.05;
  if (draft.targetPoints != null) confidence += 0.05;
  if (draft.probabilityMin != null) confidence += 0.05;
  return Math.max(0, Math.min(1, confidence));
};

export const validateSignalIntentDraft = (
  draftInput: Partial<SignalIntent>,
  opts?: {
    baseErrors?: string[];
    baseWarnings?: string[];
    preferredConfidence?: number | null;
  }
): ParseIntentResult => {
  const errors = mergeUniqueText(Array.isArray(opts?.baseErrors) ? opts.baseErrors : [], []);
  const warnings = mergeUniqueText(Array.isArray(opts?.baseWarnings) ? opts.baseWarnings : [], []);

  const agentId = String(draftInput?.agentId || '').trim();
  const rawPrompt = String(draftInput?.rawPrompt || '').trim();
  const symbol = normalizeSymbol(draftInput?.symbol);

  const timeframeList = Array.isArray(draftInput?.timeframes) ? draftInput.timeframes : [];
  const timeframes = timeframeList
    .map((entry) => normalizeTimeframeKey(entry))
    .filter((entry: string | null): entry is string => !!entry);
  const uniqueTimeframes = Array.from(new Set(timeframes));

  const weekdays = normalizeWeekdays(draftInput?.schedule?.weekdays);
  const schedule: SignalIntentSchedule = {
    timezone: String(draftInput?.schedule?.timezone || 'America/New_York').trim() || 'America/New_York',
    times: normalizeTimes(draftInput?.schedule?.times),
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5],
    marketOpenMode: draftInput?.schedule?.marketOpenMode === true
  };

  const gatesRaw = Array.isArray(draftInput?.sessionGates) ? draftInput.sessionGates : [];
  const sessionGates: SignalIntentSessionGate[] = gatesRaw
    .map((entry) => {
      const idRaw = String(entry?.id || '').trim().toLowerCase();
      if (idRaw !== 'asia' && idRaw !== 'london' && idRaw !== 'ny' && idRaw !== 'custom') return null;
      return {
        id: idRaw,
        enabled: entry?.enabled !== false,
        startHour: Number.isFinite(Number(entry?.startHour)) ? Math.max(0, Math.min(23, Math.floor(Number(entry.startHour)))) : null,
        endHour: Number.isFinite(Number(entry?.endHour)) ? Math.max(0, Math.min(23, Math.floor(Number(entry.endHour)))) : null
      } as SignalIntentSessionGate;
    })
    .filter((entry): entry is SignalIntentSessionGate => !!entry);

  if (!agentId) errors.push('Agent is required.');
  if (!symbol) errors.push('Symbol is required.');
  if (uniqueTimeframes.length === 0) errors.push('At least one timeframe is required.');
  if (schedule.times.length === 0) errors.push('No schedule time found. Add a time like 08:30.');

  const probabilityMin = Number.isFinite(Number(draftInput?.probabilityMin))
    ? Math.max(1, Math.min(100, Math.round(Number(draftInput?.probabilityMin))))
    : null;
  const targetPoints = Number.isFinite(Number(draftInput?.targetPoints))
    ? Math.max(0.1, Math.min(10_000, Number(draftInput?.targetPoints)))
    : null;
  const strategyMode = draftInput?.strategyMode ? String(draftInput.strategyMode).toLowerCase() : null;

  const normalizedDraft: Partial<SignalIntent> = {
    ...draftInput,
    agentId,
    rawPrompt,
    symbol,
    timeframes: uniqueTimeframes.length > 0 ? uniqueTimeframes : ['5m'],
    strategyMode: strategyMode as SignalIntent['strategyMode'],
    probabilityMin,
    targetPoints,
    schedule,
    sessionGates: sessionGates.length > 0 ? sessionGates : null,
    telegramEnabled: draftInput?.telegramEnabled !== false
  };

  const confidence = deriveConfidence(normalizedDraft, opts?.preferredConfidence ?? draftInput?.parseConfidence ?? null);
  let needsConfirmation = errors.length > 0;
  if (!needsConfirmation && confidence < SIGNAL_INTENT_MIN_CONFIDENCE) {
    needsConfirmation = true;
    warnings.push(
      `Parse confidence ${Math.round(confidence * 100)}% is below required ${Math.round(
        SIGNAL_INTENT_MIN_CONFIDENCE * 100
      )}%. Confirm fields before activation.`
    );
  }

  normalizedDraft.parseConfidence = confidence;
  normalizedDraft.parseNotes = warnings.length > 0 ? warnings : null;
  normalizedDraft.status = needsConfirmation ? 'needs_confirmation' : 'draft';

  return {
    ok: errors.length === 0 && !needsConfirmation,
    draft: normalizedDraft,
    errors,
    warnings,
    confidence,
    needsConfirmation
  };
};

export const parseSignalIntentPrompt = (input: ParseIntentInput): ParseIntentResult => {
  const prompt = String(input.prompt || '').trim();
  const agentId = String(input.agentId || '').trim();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!prompt) errors.push('Prompt is required.');
  if (!agentId) errors.push('Agent is required.');

  const symbol = resolveSymbol(input);
  const timeframes = parseTimeframes(prompt, input.defaultTimeframes);
  const schedule = buildDefaultSchedule(prompt, symbol, input.defaultTimezone);
  const probabilityMin = parseProbability(prompt);
  const targetPoints = parseTargetPoints(prompt);
  const strategyMode = parseStrategyMode(prompt);
  const sessionGates = parseSessions(prompt);

  if (schedule.times.length === 0) {
    errors.push('No schedule time found. Add a time like 08:30.');
  }
  if (timeframes.length === 0) {
    errors.push('No timeframe found.');
  }
  if (targetPoints == null && /\bscalp\b/i.test(prompt)) {
    warnings.push('Scalp intent has no explicit target points.');
  }

  let confidence = 0.5;
  if (schedule.times.length > 0) confidence += 0.2;
  if (symbol) confidence += 0.1;
  if (timeframes.length > 0) confidence += 0.1;
  if (targetPoints != null) confidence += 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  const draft: Partial<SignalIntent> = {
    agentId,
    rawPrompt: prompt,
    symbol,
    timeframes,
    strategyMode,
    probabilityMin,
    targetPoints,
    schedule,
    sessionGates: sessionGates.length > 0 ? sessionGates : null,
    telegramEnabled: true,
    parseConfidence: confidence
  };

  return validateSignalIntentDraft(draft, {
    baseErrors: errors,
    baseWarnings: warnings,
    preferredConfidence: confidence
  });
};

const normalizeWeekdays = (value: any): number[] => {
  const list = Array.isArray(value) ? value : [];
  const out = new Set<number>();
  for (const entry of list) {
    const num = Number(entry);
    if (!Number.isFinite(num)) continue;
    const day = Math.max(0, Math.min(6, Math.floor(num)));
    out.add(day);
  }
  return Array.from(out.values()).sort((a, b) => a - b);
};

const normalizeTimes = (value: any): string[] => {
  const list = Array.isArray(value) ? value : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const text = String(entry || '').trim();
    if (!/^\d{2}:\d{2}$/.test(text)) continue;
    const hour = Number(text.slice(0, 2));
    const min = Number(text.slice(3, 5));
    if (!Number.isFinite(hour) || !Number.isFinite(min) || hour < 0 || hour > 23 || min < 0 || min > 59) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
};

export const normalizeSignalIntent = (raw: any): SignalIntent | null => {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const agentId = String(raw.agentId || '').trim();
  const symbol = String(raw.symbol || '').trim().toUpperCase();
  if (!id || !agentId || !symbol) return null;

  const statusRaw = String(raw.status || '').trim().toLowerCase();
  const status: SignalIntentStatus =
    statusRaw === 'active' || statusRaw === 'paused' || statusRaw === 'needs_confirmation' || statusRaw === 'archived' || statusRaw === 'error'
      ? (statusRaw as SignalIntentStatus)
      : 'draft';
  const scheduleRaw = raw.schedule && typeof raw.schedule === 'object' ? raw.schedule : {};
  const schedule: SignalIntentSchedule = {
    timezone: String(scheduleRaw.timezone || 'America/New_York'),
    times: normalizeTimes(scheduleRaw.times),
    weekdays: normalizeWeekdays(scheduleRaw.weekdays).length > 0 ? normalizeWeekdays(scheduleRaw.weekdays) : [1, 2, 3, 4, 5],
    marketOpenMode: scheduleRaw.marketOpenMode === true
  };

  const timeframeList = Array.isArray(raw.timeframes) ? raw.timeframes : [];
  const timeframes = timeframeList
    .map((entry: any) => normalizeTimeframeKey(entry))
    .filter((entry: string | null): entry is string => !!entry);
  const uniqueTfs = Array.from(new Set(timeframes));

  const gatesRaw = Array.isArray(raw.sessionGates) ? raw.sessionGates : [];
  const sessionGates: SignalIntentSessionGate[] = gatesRaw
    .map((entry) => {
      const idRaw = String(entry?.id || '').trim().toLowerCase();
      if (idRaw !== 'asia' && idRaw !== 'london' && idRaw !== 'ny' && idRaw !== 'custom') return null;
      return {
        id: idRaw,
        enabled: entry?.enabled !== false,
        startHour: Number.isFinite(Number(entry?.startHour)) ? Math.max(0, Math.min(23, Math.floor(Number(entry.startHour)))) : null,
        endHour: Number.isFinite(Number(entry?.endHour)) ? Math.max(0, Math.min(23, Math.floor(Number(entry.endHour)))) : null
      } as SignalIntentSessionGate;
    })
    .filter((entry): entry is SignalIntentSessionGate => !!entry);

  return {
    id,
    agentId,
    rawPrompt: String(raw.rawPrompt || '').trim(),
    status,
    createdAtMs: Number.isFinite(Number(raw.createdAtMs)) ? Number(raw.createdAtMs) : Date.now(),
    updatedAtMs: Number.isFinite(Number(raw.updatedAtMs)) ? Number(raw.updatedAtMs) : Date.now(),
    symbol,
    timeframes: uniqueTfs.length > 0 ? uniqueTfs : ['5m'],
    strategyMode: raw.strategyMode ? String(raw.strategyMode) : null,
    probabilityMin: Number.isFinite(Number(raw.probabilityMin)) ? Math.max(1, Math.min(100, Number(raw.probabilityMin))) : null,
    targetPoints: Number.isFinite(Number(raw.targetPoints)) ? Math.max(0.1, Math.min(10_000, Number(raw.targetPoints))) : null,
    schedule,
    sessionGates: sessionGates.length > 0 ? sessionGates : null,
    telegramEnabled: raw.telegramEnabled !== false,
    parseConfidence: Number.isFinite(Number(raw.parseConfidence)) ? Number(raw.parseConfidence) : null,
    parseNotes: Array.isArray(raw.parseNotes) ? raw.parseNotes.map((item: any) => String(item)).filter(Boolean) : null,
    nextDueAtMs: Number.isFinite(Number(raw.nextDueAtMs)) ? Number(raw.nextDueAtMs) : null,
    lastTriggeredAtMs: Number.isFinite(Number(raw.lastTriggeredAtMs)) ? Number(raw.lastTriggeredAtMs) : null,
    lastTriggeredSlotKey: raw.lastTriggeredSlotKey ? String(raw.lastTriggeredSlotKey) : null
  };
};
