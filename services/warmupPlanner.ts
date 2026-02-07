export type WarmupPlannerInput = {
  timeframe: string;
  configuredMinBars: number;
  sessionOpen?: boolean;
  volatilityScore?: number | null;
  cacheCoverageBars?: number | null;
  brokerHealthy?: boolean;
};

export type WarmupPlannerResult = {
  requiredBars: number;
  maxStalenessMs: number;
  reason: "configured_floor" | "session_open_boost" | "volatility_boost" | "cache_gap" | "broker_degraded";
};

const timeframeToMs = (tf: string) => {
  const value = String(tf || "").trim().toLowerCase();
  const match = value.match(/^(\d+)\s*([mhdw])$/);
  if (!match) return 60_000;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return 60_000;
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 60 * 60_000;
  if (unit === "d") return amount * 24 * 60 * 60_000;
  return amount * 7 * 24 * 60 * 60_000;
};

export const planWarmup = (input: WarmupPlannerInput): WarmupPlannerResult => {
  const floor = Math.max(1, Math.floor(Number(input.configuredMinBars) || 1));
  const cacheBars = Number.isFinite(Number(input.cacheCoverageBars)) ? Math.max(0, Math.floor(Number(input.cacheCoverageBars))) : 0;
  const volatility = Number.isFinite(Number(input.volatilityScore)) ? Math.max(0, Number(input.volatilityScore)) : 0;

  let required = floor;
  let reason: WarmupPlannerResult["reason"] = "configured_floor";

  if (input.sessionOpen) {
    const boosted = Math.max(required, Math.ceil(required * 1.25));
    if (boosted > required) {
      required = boosted;
      reason = "session_open_boost";
    }
  }

  if (volatility > 0.7) {
    const boosted = Math.max(required, Math.ceil(required * 1.35));
    if (boosted > required) {
      required = boosted;
      reason = "volatility_boost";
    }
  }

  if (cacheBars < required) {
    reason = "cache_gap";
  } else {
    required = floor;
  }

  if (input.brokerHealthy === false) {
    required = Math.max(floor, Math.ceil(required * 0.85));
    reason = "broker_degraded";
  }

  const tfMs = timeframeToMs(input.timeframe);
  const maxStalenessMs = Math.max(5_000, Math.floor(tfMs * 0.5));
  return {
    requiredBars: required,
    maxStalenessMs,
    reason
  };
};

