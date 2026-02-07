import type { TradeProposal } from "../types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateTradeProposalBasic(proposal: TradeProposal): string | null {
  const symbol = String(proposal?.symbol || "").trim();
  if (!symbol) return "Symbol is required.";

  const action = proposal?.action;
  if (action !== "BUY" && action !== "SELL") return "Action must be BUY or SELL.";

  if (!isFiniteNumber(proposal?.entryPrice) || proposal.entryPrice <= 0) return "Entry price must be > 0.";
  if (!isFiniteNumber(proposal?.stopLoss) || proposal.stopLoss <= 0) return "Stop loss must be > 0.";
  if (!isFiniteNumber(proposal?.takeProfit) || proposal.takeProfit <= 0) return "Take profit must be > 0.";

  if (action === "BUY") {
    if (proposal.stopLoss >= proposal.entryPrice) return "For BUY, stop loss must be below entry.";
    if (proposal.takeProfit <= proposal.entryPrice) return "For BUY, take profit must be above entry.";
  } else {
    if (proposal.stopLoss <= proposal.entryPrice) return "For SELL, stop loss must be above entry.";
    if (proposal.takeProfit >= proposal.entryPrice) return "For SELL, take profit must be below entry.";
  }

  return null;
}

