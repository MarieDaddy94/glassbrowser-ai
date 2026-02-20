import type { AcademyCase, AcademyLesson } from '../types';

const asText = (value: any) => String(value || '').trim().toLowerCase();

const matchesLessonScope = (entry: AcademyCase, lesson: AcademyLesson) => {
  const applies = lesson.appliesTo || {};
  const symbol = asText(applies.symbol);
  const timeframe = asText(applies.timeframe);
  const strategy = asText(applies.strategyMode);
  if (symbol && asText(entry.symbol) !== symbol) return false;
  if (timeframe && asText(entry.timeframe) !== timeframe) return false;
  if (strategy && asText(entry.strategyMode) !== strategy) return false;
  return true;
};

const isWin = (entry: AcademyCase) => asText(entry.outcome || entry.status) === 'win';

export type LessonExperimentResult = {
  experimentId: string;
  lessonId: string;
  sampleSize: number;
  controlWinRate: number | null;
  treatmentWinRate: number | null;
  preventedLossEstimate: number;
  netScoreDelta: number;
  matchedCaseIds: string[];
  generatedAtMs: number;
};

export const runLessonCounterfactualExperiment = (input: {
  lesson: AcademyLesson;
  cases: AcademyCase[];
  lookback?: number;
  nowMs?: number;
}): LessonExperimentResult => {
  const lesson = input.lesson;
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const lookback = Number.isFinite(Number(input.lookback)) ? Math.max(5, Math.floor(Number(input.lookback))) : 60;
  const filtered = (Array.isArray(input.cases) ? input.cases : [])
    .filter((entry) => entry && matchesLessonScope(entry, lesson))
    .sort((a, b) => Number(b.resolvedAtMs || b.executedAtMs || b.createdAtMs || 0) - Number(a.resolvedAtMs || a.executedAtMs || a.createdAtMs || 0))
    .slice(0, lookback);
  const sampleSize = filtered.length;
  const wins = filtered.filter((entry) => isWin(entry)).length;
  const losses = Math.max(0, sampleSize - wins);
  const controlWinRate = sampleSize > 0 ? wins / sampleSize : null;

  const confidence = Number.isFinite(Number(lesson.confidence)) ? Number(lesson.confidence) : 0.55;
  const treatmentLift = Math.max(-0.2, Math.min(0.25, confidence * 0.14));
  const treatmentWinRate = controlWinRate == null ? null : Math.max(0, Math.min(1, controlWinRate + treatmentLift));
  const preventedLossEstimate = treatmentWinRate == null || controlWinRate == null
    ? 0
    : Math.max(0, (treatmentWinRate - controlWinRate) * losses);
  const avgScore = filtered.length > 0
    ? filtered.reduce((sum, entry) => sum + (Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0), 0) / filtered.length
    : 0;
  const netScoreDelta = Number.isFinite(avgScore) ? treatmentLift * Math.max(1, avgScore || 1.2) : treatmentLift;
  const experimentId = `lesson_exp_${lesson.id}_${Math.floor(nowMs / 1000)}`;
  return {
    experimentId,
    lessonId: lesson.id,
    sampleSize,
    controlWinRate,
    treatmentWinRate,
    preventedLossEstimate: Math.round(preventedLossEstimate * 100) / 100,
    netScoreDelta: Math.round(netScoreDelta * 1000) / 1000,
    matchedCaseIds: filtered.map((entry) => String(entry.id)).slice(0, 100),
    generatedAtMs: nowMs
  };
};

