import type {
  AcademyCase,
  AcademyLesson,
  AcademySymbolLearning,
  LearningGraphTimelineRange,
  LearningGraphTimelineWindow
} from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

const toNum = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toText = (value: any) => String(value || '').trim();

const caseTime = (entry: AcademyCase) => {
  const resolved = toNum(entry?.resolvedAtMs, 0);
  if (resolved > 0) return resolved;
  const executed = toNum(entry?.executedAtMs, 0);
  if (executed > 0) return executed;
  return toNum(entry?.createdAtMs, 0);
};

const lessonTime = (entry: AcademyLesson) => {
  const updated = toNum(entry?.updatedAtMs, 0);
  if (updated > 0) return updated;
  return toNum(entry?.createdAtMs, 0);
};

const symbolLearningTime = (entry: AcademySymbolLearning) => toNum(entry?.updatedAtMs, 0);

const normalizeWindow = (window: LearningGraphTimelineWindow | null | undefined): LearningGraphTimelineWindow => {
  const key = toText(window).toLowerCase();
  if (key === '7d' || key === '30d' || key === '90d' || key === 'all' || key === 'custom') {
    return key;
  }
  return 'all';
};

const windowStartFor = (window: LearningGraphTimelineWindow, nowMs: number) => {
  if (window === '7d') return nowMs - (7 * DAY_MS);
  if (window === '30d') return nowMs - (30 * DAY_MS);
  if (window === '90d') return nowMs - (90 * DAY_MS);
  return 0;
};

export const resolveLearningTimelineRange = (input: {
  window?: LearningGraphTimelineWindow | null;
  startAtMs?: number | null;
  endAtMs?: number | null;
  nowMs?: number;
}): LearningGraphTimelineRange => {
  const nowMs = toNum(input.nowMs, Date.now());
  const window = normalizeWindow(input.window);
  const startAtMsRaw = toNum(input.startAtMs, 0);
  const endAtMsRaw = toNum(input.endAtMs, 0);

  if (window === 'custom') {
    const startAtMs = startAtMsRaw > 0 ? startAtMsRaw : Math.max(0, nowMs - (30 * DAY_MS));
    const endAtMs = endAtMsRaw > 0 ? endAtMsRaw : nowMs;
    if (startAtMs > endAtMs) {
      return {
        window,
        startAtMs: endAtMs,
        endAtMs: startAtMs
      };
    }
    return {
      window,
      startAtMs,
      endAtMs
    };
  }

  const startAtMs = windowStartFor(window, nowMs);
  const endAtMs = nowMs;
  return {
    window,
    startAtMs,
    endAtMs
  };
};

const inRange = (valueMs: number, range: LearningGraphTimelineRange) => {
  if (!Number.isFinite(valueMs) || valueMs <= 0) return false;
  const startAtMs = toNum(range.startAtMs, 0);
  const endAtMs = toNum(range.endAtMs, 0);
  if (startAtMs > 0 && valueMs < startAtMs) return false;
  if (endAtMs > 0 && valueMs > endAtMs) return false;
  return true;
};

const dayKey = (valueMs: number) => {
  if (!Number.isFinite(valueMs) || valueMs <= 0) return '';
  const dt = new Date(valueMs);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export type LearningTimelineFilterResult = {
  range: LearningGraphTimelineRange;
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings: AcademySymbolLearning[];
  stats: {
    caseCount: number;
    lessonCount: number;
    symbolLearningCount: number;
    wins: number;
    losses: number;
    netR: number;
    timelinePoints: Array<{
      day: string;
      wins: number;
      losses: number;
      netR: number;
      count: number;
    }>;
  };
};

export const filterAcademyDataByTimeline = (input: {
  cases: AcademyCase[];
  lessons: AcademyLesson[];
  symbolLearnings: AcademySymbolLearning[];
  range: LearningGraphTimelineRange;
}): LearningTimelineFilterResult => {
  const range = resolveLearningTimelineRange({
    window: input.range?.window,
    startAtMs: input.range?.startAtMs,
    endAtMs: input.range?.endAtMs
  });
  const caseList = Array.isArray(input.cases) ? input.cases : [];
  const lessonList = Array.isArray(input.lessons) ? input.lessons : [];
  const symbolLearningList = Array.isArray(input.symbolLearnings) ? input.symbolLearnings : [];

  const filteredCases = caseList.filter((entry) => inRange(caseTime(entry), range));
  const caseIdSet = new Set(filteredCases.map((entry) => toText(entry.id || entry.signalId)).filter(Boolean));
  const symbolSet = new Set(filteredCases.map((entry) => toText(entry.symbol).toUpperCase()).filter(Boolean));

  const filteredLessons = lessonList.filter((entry) => {
    const evidence = Array.isArray(entry.evidenceCaseIds) ? entry.evidenceCaseIds.map((id) => toText(id)) : [];
    if (evidence.some((id) => caseIdSet.has(id))) return true;
    return inRange(lessonTime(entry), range);
  });

  const filteredSymbolLearnings = symbolLearningList.filter((entry) => {
    const symbol = toText(entry.symbol).toUpperCase();
    if (symbol && symbolSet.has(symbol)) return true;
    return inRange(symbolLearningTime(entry), range);
  });

  const timelineMap = new Map<string, { wins: number; losses: number; netR: number; count: number }>();
  let wins = 0;
  let losses = 0;
  let netR = 0;

  for (const entry of filteredCases) {
    const t = caseTime(entry);
    const key = dayKey(t) || 'unknown';
    const bucket = timelineMap.get(key) || { wins: 0, losses: 0, netR: 0, count: 0 };
    const outcome = toText(entry.outcome || entry.status).toUpperCase();
    if (outcome === 'WIN') {
      bucket.wins += 1;
      wins += 1;
    } else if (outcome === 'LOSS') {
      bucket.losses += 1;
      losses += 1;
    }
    const score = Number(entry.score);
    if (Number.isFinite(score)) {
      bucket.netR += score;
      netR += score;
    }
    bucket.count += 1;
    timelineMap.set(key, bucket);
  }

  const timelinePoints = Array.from(timelineMap.entries())
    .map(([day, value]) => ({
      day,
      wins: value.wins,
      losses: value.losses,
      netR: Math.round(value.netR * 1000) / 1000,
      count: value.count
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    range,
    cases: filteredCases,
    lessons: filteredLessons,
    symbolLearnings: filteredSymbolLearnings,
    stats: {
      caseCount: filteredCases.length,
      lessonCount: filteredLessons.length,
      symbolLearningCount: filteredSymbolLearnings.length,
      wins,
      losses,
      netR: Math.round(netR * 1000) / 1000,
      timelinePoints
    }
  };
};
