import type { TradeProposal } from '../types';

export type PreTradeHealthGateInput = {
  proposal: TradeProposal;
  source: 'manual' | 'autopilot';
  broker: string;
  bridgeReady: boolean;
  bridgeError?: string | null;
  brokerConnected: boolean;
  upstreamBlockedUntilMs?: number | null;
  rateLimitSuppressUntilMs?: number | null;
  fetchQuote?: (symbol: string, opts?: { maxAgeMs?: number }) => Promise<{
    quote: any;
    quoteAgeMs: number | null;
    error?: string | null;
  }>;
  referencePriceFromQuote?: (quote: any) => number | null;
  maxQuoteAgeMs?: number;
  maxSpreadPct?: number | null;
  maxSpreadBps?: number | null;
  maxSlippageBps?: number | null;
  nowMs?: number;
};

export type PreTradeGateResult = {
  ok: boolean;
  allowed: boolean;
  reasons: string[];
  quoteAgeMs?: number | null;
  spreadBps?: number | null;
  slippageEstimateBps?: number | null;
  cooldownRemainingMs?: number | null;
  code?: string;
  message?: string;
  retryAfterMs?: number | null;
  detail?: Record<string, any> | null;
};

const deny = (
  code: string,
  message: string,
  retryAfterMs?: number | null,
  detail?: Record<string, any> | null,
  metrics?: Partial<Pick<PreTradeGateResult, 'quoteAgeMs' | 'spreadBps' | 'slippageEstimateBps' | 'cooldownRemainingMs'>>
): PreTradeGateResult => ({
  ok: false,
  allowed: false,
  reasons: [code],
  quoteAgeMs: metrics?.quoteAgeMs ?? null,
  spreadBps: metrics?.spreadBps ?? null,
  slippageEstimateBps: metrics?.slippageEstimateBps ?? null,
  cooldownRemainingMs: metrics?.cooldownRemainingMs ?? (retryAfterMs ?? null),
  code,
  message,
  retryAfterMs: retryAfterMs ?? null,
  detail: detail ?? null
});

const clampMs = (value: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
};

export const evaluatePreTradeHealthGate = async (input: PreTradeHealthGateInput): Promise<PreTradeGateResult> => {
  const now = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const broker = String(input.broker || '').trim().toLowerCase();
  if (!input.bridgeReady) {
    return deny(
      'bridge_unavailable',
      input.bridgeError ? String(input.bridgeError) : 'Renderer bridge unavailable.'
    );
  }
  if (!input.brokerConnected) {
    return deny('broker_disconnected', `${broker || 'Broker'} not connected.`);
  }

  const upstreamBlockedUntilMs = Number(input.upstreamBlockedUntilMs || 0);
  if (Number.isFinite(upstreamBlockedUntilMs) && upstreamBlockedUntilMs > now) {
    const cooldownRemainingMs = clampMs(upstreamBlockedUntilMs - now);
    return deny(
      'broker_upstream_backoff',
      'Broker upstream unavailable. Retry later.',
      cooldownRemainingMs,
      { upstreamBlockedUntilMs },
      { cooldownRemainingMs }
    );
  }

  const rateLimitSuppressUntilMs = Number(input.rateLimitSuppressUntilMs || 0);
  if (Number.isFinite(rateLimitSuppressUntilMs) && rateLimitSuppressUntilMs > now) {
    const cooldownRemainingMs = clampMs(rateLimitSuppressUntilMs - now);
    return deny(
      'broker_rate_limited',
      'Broker rate limit cooldown active.',
      cooldownRemainingMs,
      { rateLimitSuppressUntilMs },
      { cooldownRemainingMs }
    );
  }

  if (broker === 'tradelocker' && input.fetchQuote && input.referencePriceFromQuote) {
    const maxQuoteAgeMs = Number.isFinite(Number(input.maxQuoteAgeMs)) ? Math.max(1000, Math.floor(Number(input.maxQuoteAgeMs))) : 30_000;
    const symbol = String(input.proposal?.symbol || '').trim();
    if (!symbol) {
      return deny('missing_symbol', 'Trade proposal symbol missing.');
    }
    const quoteRes = await input.fetchQuote(symbol, { maxAgeMs: maxQuoteAgeMs });
    if (!quoteRes?.quote) {
      return deny('quote_unavailable', quoteRes?.error ? String(quoteRes.error) : 'Quote unavailable.');
    }
    const quoteAgeMs = Number(quoteRes.quoteAgeMs);
    if (Number.isFinite(quoteAgeMs) && quoteAgeMs > maxQuoteAgeMs) {
      return deny(
        'quote_stale',
        `Quote is stale (${Math.floor(quoteAgeMs)}ms > ${maxQuoteAgeMs}ms).`,
        null,
        { quoteAgeMs, maxQuoteAgeMs },
        { quoteAgeMs }
      );
    }
    const refPrice = Number(input.referencePriceFromQuote(quoteRes.quote));
    if (!Number.isFinite(refPrice) || refPrice <= 0) {
      return deny('quote_invalid', 'Quote reference price unavailable.');
    }
    const spreadRaw = Number(quoteRes.quote?.spread);
    const maxSpreadPct = Number(input.maxSpreadPct);
    const maxSpreadBps = Number(input.maxSpreadBps);
    const spreadBps = Number.isFinite(spreadRaw) && spreadRaw >= 0 && refPrice > 0
      ? (spreadRaw / refPrice) * 10_000
      : null;
    if (Number.isFinite(spreadRaw) && spreadRaw >= 0 && Number.isFinite(maxSpreadPct) && maxSpreadPct > 0) {
      const spreadPct = (spreadRaw / refPrice) * 100;
      if (Number.isFinite(spreadPct) && spreadPct > maxSpreadPct) {
        return deny(
          'spread_too_wide',
          `Spread too wide (${spreadPct.toFixed(3)}% > ${maxSpreadPct.toFixed(3)}%).`,
          null,
          { spreadPct, maxSpreadPct, spread: spreadRaw, refPrice, spreadBps },
          { quoteAgeMs, spreadBps }
        );
      }
    }

    if (Number.isFinite(spreadBps) && Number.isFinite(maxSpreadBps) && maxSpreadBps > 0 && spreadBps > maxSpreadBps) {
      return deny(
        'spread_bps_too_wide',
        `Spread too wide (${spreadBps.toFixed(1)}bps > ${maxSpreadBps.toFixed(1)}bps).`,
        null,
        { spreadBps, maxSpreadBps, spread: spreadRaw, refPrice },
        { quoteAgeMs, spreadBps }
      );
    }

    const entry = Number(input.proposal?.entryPrice);
    const slippageEstimateBps = Number.isFinite(entry) && entry > 0
      ? Math.abs(entry - refPrice) / entry * 10_000
      : null;
    const maxSlippageBps = Number(input.maxSlippageBps);
    if (Number.isFinite(slippageEstimateBps) && Number.isFinite(maxSlippageBps) && maxSlippageBps > 0 && slippageEstimateBps > maxSlippageBps) {
      return deny(
        'slippage_estimate_too_wide',
        `Slippage estimate too wide (${slippageEstimateBps.toFixed(1)}bps > ${maxSlippageBps.toFixed(1)}bps).`,
        null,
        { slippageEstimateBps, maxSlippageBps, entryPrice: entry, referencePrice: refPrice },
        { quoteAgeMs, spreadBps, slippageEstimateBps }
      );
    }

    return {
      ok: true,
      allowed: true,
      reasons: [],
      quoteAgeMs: Number.isFinite(quoteAgeMs) ? quoteAgeMs : null,
      spreadBps: Number.isFinite(spreadBps as number) ? (spreadBps as number) : null,
      slippageEstimateBps: Number.isFinite(slippageEstimateBps as number) ? (slippageEstimateBps as number) : null,
      cooldownRemainingMs: null
    };
  }

  return { ok: true, allowed: true, reasons: [], cooldownRemainingMs: null };
};
