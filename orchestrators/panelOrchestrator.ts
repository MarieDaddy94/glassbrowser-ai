import type { PanelConnectivityState } from '../types';

export const normalizePanelConnectivitySnapshot = (
  rows: PanelConnectivityState[] | null | undefined,
  now: number = Date.now()
): PanelConnectivityState[] => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const blockedUntilMs = Number(row?.blockedUntilMs || 0);
    const retryAfterMs =
      row?.retryAfterMs != null
        ? Number(row.retryAfterMs)
        : blockedUntilMs > now
          ? Math.max(0, blockedUntilMs - now)
          : null;
    const blocked = row?.blocked != null ? !!row.blocked : blockedUntilMs > now;
    return {
      ...row,
      blocked,
      retryAfterMs: Number.isFinite(Number(retryAfterMs)) ? Number(retryAfterMs) : null,
      blockedReason: row?.blockedReason ?? (blocked ? 'source_cooldown_active' : null),
      blockedUntilMs: blockedUntilMs > now ? blockedUntilMs : null
    };
  });
};
