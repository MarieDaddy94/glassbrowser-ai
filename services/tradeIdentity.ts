import type { TradeProposal } from "../types";
import { hashStringSampled } from "./stringHash";

function normSymbol(value: string) {
  return String(value || "").trim().toUpperCase();
}

function normSide(value: string) {
  const v = String(value || "").trim().toUpperCase();
  return v === "SELL" ? "SELL" : "BUY";
}

function normType(value: string) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "limit") return "limit";
  if (v === "stop") return "stop";
  return "market";
}

function normNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return "NaN";
  // Round aggressively to reduce float noise; still keeps FX/crypto precision.
  const rounded = Math.round(n * 1e8) / 1e8;
  return String(rounded);
}

export function computeTradeDedupeKey(args: {
  proposal: TradeProposal;
  broker: "tradelocker" | "sim";
  accountKey?: string;
  orderType?: "market" | "limit" | "stop";
  qty?: number;
}) {
  const proposal = args.proposal;
  const payload = {
    v: 1,
    broker: args.broker,
    account: String(args.accountKey || ""),
    symbol: normSymbol(proposal.symbol),
    action: normSide(proposal.action),
    type: normType(args.orderType || "market"),
    qty: args.qty != null ? normNumber(args.qty) : "",
    entry: normNumber(proposal.entryPrice),
    sl: normNumber(proposal.stopLoss),
    tp: normNumber(proposal.takeProfit)
  };

  const raw = JSON.stringify(payload);
  const h = hashStringSampled(raw, 4096);
  return `dk_${h}`;
}

export function computeBrokerActionIdempotencyKey(input: {
  type?: string;
  symbol?: string | null;
  positionId?: string | null;
  orderId?: string | null;
  qty?: number | null;
  price?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  stopLossUsd?: number | null;
  takeProfitUsd?: number | null;
  trailingOffset?: number | null;
}) {
  const parts = [
    String(input?.type || ''),
    String(input?.symbol || ''),
    String(input?.positionId || ''),
    String(input?.orderId || ''),
    String(input?.qty ?? ''),
    String(input?.price ?? ''),
    String(input?.stopLoss ?? ''),
    String(input?.takeProfit ?? ''),
    String(input?.stopLossUsd ?? ''),
    String(input?.takeProfitUsd ?? ''),
    String(input?.trailingOffset ?? '')
  ];
  const raw = parts.join('|');
  const h = hashStringSampled(raw, 1024);
  return `broker_action:${h}`;
}

export function computeClientStrategyIdFromDedupeKey(dedupeKey: string) {
  const core = String(dedupeKey || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-24);
  return `gb_${core}`.slice(0, 31);
}

export function extractBrokerOrderId(value: any): string | null {
  const direct =
    value?.orderId ??
    value?.id ??
    value?.response?.orderId ??
    value?.response?.id ??
    value?.response?.order?.id ??
    value?.response?.data?.id ??
    null;

  if (direct == null) return null;
  const s = String(direct).trim();
  return s ? s : null;
}
