import type { AcademyLesson } from '../types';

const asText = (value: any) => String(value || '').trim();

const normalize = (value: any) => asText(value).toLowerCase();

const scopeKey = (lesson: AcademyLesson) => {
  const applies = lesson?.appliesTo || {};
  const symbol = normalize(applies.symbol) || 'all';
  const timeframe = normalize(applies.timeframe) || 'all';
  const strategy = normalize(applies.strategyMode) || 'all';
  return `${symbol}|${timeframe}|${strategy}`;
};

const recommendationProfile = (lesson: AcademyLesson) => {
  const text = normalize(lesson?.recommendedAction);
  if (!text) return 'neutral';
  if (
    text.includes('avoid') ||
    text.includes('do not') ||
    text.includes("don't") ||
    text.includes('skip')
  ) {
    return 'avoid';
  }
  if (
    text.includes('enter') ||
    text.includes('take') ||
    text.includes('buy') ||
    text.includes('sell') ||
    text.includes('execute')
  ) {
    return 'enter';
  }
  return 'neutral';
};

const sideProfile = (lesson: AcademyLesson) => {
  const text = normalize(lesson?.recommendedAction);
  if (!text) return 'neutral';
  if (text.includes('buy') || text.includes('long')) return 'buy';
  if (text.includes('sell') || text.includes('short')) return 'sell';
  return 'neutral';
};

export type LessonConflictRecord = {
  lessonAId: string;
  lessonBId: string;
  reason: string;
  confidence: number;
  overrideCondition?: string | null;
};

export const detectLessonConflicts = (lessons: AcademyLesson[]): LessonConflictRecord[] => {
  const list = Array.isArray(lessons) ? lessons.filter((entry) => entry && entry.id) : [];
  const out: LessonConflictRecord[] = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const left = list[i];
      const right = list[j];
      if (!left || !right) continue;
      if (scopeKey(left) !== scopeKey(right)) continue;
      const leftRec = recommendationProfile(left);
      const rightRec = recommendationProfile(right);
      const leftSide = sideProfile(left);
      const rightSide = sideProfile(right);
      let reason = '';
      let confidence = 0;
      if (leftRec === 'enter' && rightRec === 'avoid') {
        reason = 'enter_vs_avoid';
        confidence = 0.82;
      } else if (leftRec === 'avoid' && rightRec === 'enter') {
        reason = 'avoid_vs_enter';
        confidence = 0.82;
      } else if (leftSide !== 'neutral' && rightSide !== 'neutral' && leftSide !== rightSide) {
        reason = 'buy_vs_sell';
        confidence = 0.77;
      }
      if (!reason) continue;
      const triggerLeft = Array.isArray(left.triggerConditions) ? left.triggerConditions.join(' ') : '';
      const triggerRight = Array.isArray(right.triggerConditions) ? right.triggerConditions.join(' ') : '';
      const overrideCondition =
        asText(triggerLeft) && asText(triggerRight)
          ? `Use conditional override by trigger set: [${triggerLeft}] vs [${triggerRight}]`
          : null;
      out.push({
        lessonAId: left.id,
        lessonBId: right.id,
        reason,
        confidence,
        overrideCondition
      });
    }
  }
  return out;
};

