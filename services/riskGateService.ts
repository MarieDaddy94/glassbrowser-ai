import type { AutoPilotStateSnapshot } from '../types';

export type RiskGateDecision = {
  ok: boolean;
  reasonCode?: string;
  message?: string;
};

export type RiskGateInput = {
  source: 'manual' | 'autopilot';
  guardrailsActive: boolean;
  autoPilotState?: AutoPilotStateSnapshot | null;
  maxOrdersPerMinute?: number | null;
  recentOrdersCount?: number | null;
  maxOpenPositions?: number | null;
  openPositionsCount?: number | null;
  maxDailyLoss?: number | null;
  dailyPnl?: number | null;
  maxConsecutiveLosses?: number | null;
  lossStreak?: number | null;
  symbolAllowed?: boolean | null;
};

const deny = (reasonCode: string, message: string): RiskGateDecision => ({
  ok: false,
  reasonCode,
  message
});

export const evaluateRiskGate = (input: RiskGateInput): RiskGateDecision => {
  if (input.source === 'autopilot') {
    const state = input.autoPilotState;
    if (state && (state.state === 'DISABLED' || state.state === 'PAUSED' || state.state === 'FAULTED')) {
      return deny(state.reason || 'AUTOPILOT_DISABLED', state.message || 'AutoPilot is not ready to trade.');
    }
  }

  if (!input.guardrailsActive) return { ok: true };

  if (Number.isFinite(Number(input.maxOrdersPerMinute)) && Number(input.maxOrdersPerMinute) > 0) {
    const recent = Number(input.recentOrdersCount || 0);
    if (recent >= Number(input.maxOrdersPerMinute)) {
      return deny(
        'ORDER_RATE_LIMIT',
        `Order rate limit hit (${recent}/${Number(input.maxOrdersPerMinute)} per minute).`
      );
    }
  }

  if (Number.isFinite(Number(input.maxOpenPositions)) && Number(input.maxOpenPositions) > 0) {
    const openCount = Number(input.openPositionsCount || 0);
    if (openCount >= Number(input.maxOpenPositions)) {
      return deny(
        'EXPOSURE_LIMIT',
        `Max open positions reached (${openCount}/${Number(input.maxOpenPositions)}).`
      );
    }
  }

  if (Number.isFinite(Number(input.maxDailyLoss)) && Number(input.maxDailyLoss) > 0) {
    const pnl = Number(input.dailyPnl);
    if (Number.isFinite(pnl) && pnl <= -Number(input.maxDailyLoss)) {
      return deny(
        'MAX_DAILY_LOSS',
        `Max daily loss hit (P&L ${pnl.toFixed(2)} <= -${Number(input.maxDailyLoss)}).`
      );
    }
  }

  if (Number.isFinite(Number(input.maxConsecutiveLosses)) && Number(input.maxConsecutiveLosses) > 0) {
    const streak = Number(input.lossStreak || 0);
    if (streak >= Number(input.maxConsecutiveLosses)) {
      return deny(
        'MAX_LOSS_STREAK',
        `Max loss streak hit (${streak} >= ${Number(input.maxConsecutiveLosses)}).`
      );
    }
  }

  if (input.symbolAllowed === false) {
    return deny('SYMBOL_NOT_ALLOWED', 'Symbol is not in the AutoPilot allowlist.');
  }

  return { ok: true };
};
