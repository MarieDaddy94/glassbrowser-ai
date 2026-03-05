export type TradeLockerTenantRiskCaps = {
  maxOpenPositions?: number | null;
  maxPerSymbolExposure?: number | null;
  maxActionsPerMinute?: number | null;
};

export type TradeLockerRiskEvaluationInput = {
  strategyId?: string | null;
  accountKey?: string | null;
  symbol?: string | null;
  openPositions?: number | null;
  symbolExposure?: number | null;
  actionsPerMinute?: number | null;
  caps?: TradeLockerTenantRiskCaps | null;
};

export type TradeLockerRiskEvaluationResult = {
  ok: boolean;
  code?: 'risk_open_positions_limit' | 'risk_symbol_exposure_limit' | 'risk_action_rate_limit' | null;
  message?: string | null;
  violations: string[];
};

const finiteOrNull = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const evaluateTradeLockerTenantRisk = (input: TradeLockerRiskEvaluationInput): TradeLockerRiskEvaluationResult => {
  const caps = input.caps || {};
  const openPositions = finiteOrNull(input.openPositions);
  const symbolExposure = finiteOrNull(input.symbolExposure);
  const actionsPerMinute = finiteOrNull(input.actionsPerMinute);

  const violations: string[] = [];

  const maxOpenPositions = finiteOrNull(caps.maxOpenPositions);
  if (maxOpenPositions != null && openPositions != null && openPositions > maxOpenPositions) {
    violations.push(`open_positions>${maxOpenPositions}`);
  }

  const maxPerSymbolExposure = finiteOrNull(caps.maxPerSymbolExposure);
  if (maxPerSymbolExposure != null && symbolExposure != null && symbolExposure > maxPerSymbolExposure) {
    violations.push(`symbol_exposure>${maxPerSymbolExposure}`);
  }

  const maxActionsPerMinute = finiteOrNull(caps.maxActionsPerMinute);
  if (maxActionsPerMinute != null && actionsPerMinute != null && actionsPerMinute > maxActionsPerMinute) {
    violations.push(`actions_per_minute>${maxActionsPerMinute}`);
  }

  if (violations.length === 0) {
    return { ok: true, code: null, message: null, violations: [] };
  }

  let code: TradeLockerRiskEvaluationResult['code'] = 'risk_open_positions_limit';
  if (violations.some((item) => item.startsWith('symbol_exposure'))) code = 'risk_symbol_exposure_limit';
  if (violations.some((item) => item.startsWith('actions_per_minute'))) code = 'risk_action_rate_limit';

  return {
    ok: false,
    code,
    message: `Tenant risk scope blocked (${violations.join(', ')}).`,
    violations
  };
};

