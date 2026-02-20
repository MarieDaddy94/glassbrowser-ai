import type { AcademyLesson } from '../types';

const asText = (value: any) => String(value || '').trim();

export type AcademyLessonLifecycleAction =
  | 'apply'
  | 'pin'
  | 'unpin'
  | 'promote'
  | 'demote_candidate'
  | 'deprecate';

export const patchLessonLifecycle = (input: {
  lesson: AcademyLesson;
  action: AcademyLessonLifecycleAction;
  agentId?: string | null;
  experimentId?: string | null;
  nowMs?: number;
}): AcademyLesson => {
  const lesson = input.lesson;
  const now = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const next: AcademyLesson = {
    ...lesson,
    updatedAtMs: now,
    version: Number(lesson.version || 0) + 1
  };
  if (input.action === 'apply') {
    const agentId = asText(input.agentId);
    const current = Array.isArray(next.appliedAgents) ? next.appliedAgents.map((entry) => String(entry)) : [];
    if (agentId && !current.includes(agentId)) current.push(agentId);
    next.appliedAgents = current;
    if (!next.lifecycleState) next.lifecycleState = 'candidate';
    if (input.experimentId) next.experimentId = String(input.experimentId);
    return next;
  }
  if (input.action === 'pin') {
    next.pinned = true;
    return next;
  }
  if (input.action === 'unpin') {
    next.pinned = false;
    return next;
  }
  if (input.action === 'promote') {
    next.lifecycleState = 'core';
    return next;
  }
  if (input.action === 'demote_candidate') {
    next.lifecycleState = 'candidate';
    return next;
  }
  if (input.action === 'deprecate') {
    next.lifecycleState = 'deprecated';
    return next;
  }
  return next;
};

export const evaluatePromotionDecision = (input: {
  controlWinRate: number | null;
  treatmentWinRate: number | null;
  tradeCount: number;
}): 'promote' | 'candidate' | 'deprecate' => {
  const tradeCount = Number(input.tradeCount || 0);
  const control = Number(input.controlWinRate);
  const treatment = Number(input.treatmentWinRate);
  if (!Number.isFinite(control) || !Number.isFinite(treatment) || tradeCount < 8) return 'candidate';
  const delta = treatment - control;
  if (delta >= 0.08 && tradeCount >= 12) return 'promote';
  if (delta <= -0.04 && tradeCount >= 10) return 'deprecate';
  return 'candidate';
};

