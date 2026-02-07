import {
  BrokerAccountSpec,
  BrokerId,
  BrokerLinkConfig,
  BrokerQuote,
  PriceAdjustMode,
  SizeAdjustMode,
  SymbolMapEntry,
  applyPriceAdjustment,
  adjustSizeByMode,
  clampVolume
} from "./brokerLink";
import { buildSymbolKeyVariants, normalizeSymbolKey, normalizeSymbolLoose } from "./symbols";

export type BrokerOrderType = "market" | "limit" | "stop";

export type BrokerOrder = {
  id: string;
  brokerId: BrokerId;
  symbol: string;
  side: "BUY" | "SELL";
  type: BrokerOrderType;
  qty: number;
  price: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  status?: string | null;
  createdAtMs?: number | null;
  meta?: Record<string, any>;
};

export type BrokerPosition = {
  id: string;
  brokerId: BrokerId;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  qty: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openTimeMs?: number | null;
  status?: string | null;
  meta?: Record<string, any>;
};

export type TradeIntent = {
  symbol: string;
  side: "BUY" | "SELL";
  type: BrokerOrderType;
  qty: number | null;
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  comment?: string | null;
  sourceBroker?: BrokerId | "signal";
  correlationId?: string | null;
  meta?: Record<string, any>;
};

export type BrokerAdapter = {
  id: BrokerId;
  resolveSymbol?: (symbol: string) => Promise<string>;
  getQuote?: (symbol: string) => Promise<BrokerQuote | null>;
  getAccountSpec?: () => Promise<BrokerAccountSpec | null>;
  placeOrder?: (intent: TradeIntent) => Promise<{ ok: boolean; orderId?: string | null; positionId?: string | null; error?: string | null }>;
};

const buildSymbolMatchSet = (value: string) => {
  const set = new Set<string>();
  const raw = String(value || "").trim();
  if (!raw) return set;
  const variants = buildSymbolKeyVariants(raw);
  for (const variant of variants) {
    const key = normalizeSymbolKey(variant);
    if (key) set.add(key);
    const loose = normalizeSymbolLoose(variant);
    if (loose) set.add(loose);
  }
  const key = normalizeSymbolKey(raw);
  if (key) set.add(key);
  const loose = normalizeSymbolLoose(raw);
  if (loose) set.add(loose);
  return set;
};

const matchesSymbol = (inputKeys: Set<string>, candidate: string) => {
  if (inputKeys.size === 0) return false;
  const candidateKeys = buildSymbolMatchSet(candidate);
  if (candidateKeys.size === 0) return false;
  for (const key of candidateKeys) {
    if (inputKeys.has(key)) return true;
  }
  return false;
};

const mapSymbolEntry = (symbol: string, brokerId: BrokerId, entries: SymbolMapEntry[]) => {
  const input = String(symbol || "").trim();
  if (!input) return symbol;
  const inputKeys = buildSymbolMatchSet(input);
  if (inputKeys.size === 0) return symbol;
  for (const entry of entries) {
    if (!entry) continue;
    const candidates = [entry.canonical, entry.mt5, entry.tradelocker].filter(Boolean) as string[];
    if (candidates.length === 0) continue;
    if (!candidates.some((candidate) => matchesSymbol(inputKeys, candidate))) continue;
    if (brokerId === "mt5" && entry.mt5) return entry.mt5;
    if (brokerId === "tradelocker" && entry.tradelocker) return entry.tradelocker;
    if (entry.canonical) return entry.canonical;
  }
  return symbol;
};

export const resolveBrokerSymbol = async (input: {
  symbol: string;
  brokerId: BrokerId;
  config: BrokerLinkConfig;
  adapter?: BrokerAdapter | null;
}) => {
  const mapped = mapSymbolEntry(input.symbol, input.brokerId, input.config.symbolMap || []);
  if (input.adapter?.resolveSymbol) {
    try {
      const resolved = await input.adapter.resolveSymbol(mapped);
      const cleaned = String(resolved || "").trim();
      if (cleaned) return cleaned;
    } catch {
      // ignore resolve failures
    }
  }
  return mapped;
};

export const buildMirroredIntent = async (input: {
  sourceIntent: TradeIntent;
  sourceBroker: BrokerId;
  targetBroker: BrokerId;
  config: BrokerLinkConfig;
  sourceAdapter?: BrokerAdapter | null;
  targetAdapter?: BrokerAdapter | null;
  sourceAccount?: BrokerAccountSpec | null;
  targetAccount?: BrokerAccountSpec | null;
}) => {
  const {
    sourceIntent,
    sourceBroker,
    targetBroker,
    config,
    sourceAdapter,
    targetAdapter,
    sourceAccount,
    targetAccount
  } = input;

  const sourceQuote = sourceAdapter?.getQuote ? await sourceAdapter.getQuote(sourceIntent.symbol) : null;
  const targetSymbol = await resolveBrokerSymbol({
    symbol: sourceIntent.symbol,
    brokerId: targetBroker,
    config,
    adapter: targetAdapter
  });
  const targetQuote = targetAdapter?.getQuote ? await targetAdapter.getQuote(targetSymbol) : null;

  const priceMode: PriceAdjustMode = config.priceAdjustMode || "pip";
  const sizeMode: SizeAdjustMode = config.sizeAdjustMode || "match";

  const entryPrice = applyPriceAdjustment({
    price: sourceIntent.entryPrice,
    sourceQuote,
    targetQuote,
    mode: priceMode
  });
  const stopLoss =
    sourceIntent.stopLoss != null
      ? applyPriceAdjustment({
          price: sourceIntent.stopLoss,
          sourceQuote,
          targetQuote,
          mode: priceMode
        })
      : null;
  const takeProfit =
    sourceIntent.takeProfit != null
      ? applyPriceAdjustment({
          price: sourceIntent.takeProfit,
          sourceQuote,
          targetQuote,
          mode: priceMode
        })
      : null;

  const stopDistance =
    sourceIntent.stopLoss != null && Number.isFinite(Number(sourceIntent.stopLoss))
      ? Math.abs(sourceIntent.entryPrice - Number(sourceIntent.stopLoss))
      : null;

  const riskValue = (() => {
    if (sizeMode === "risk_amount") return config.globalRiskCapAmount ?? null;
    if (sizeMode === "risk_percent") {
      const pct = Number(config.globalRiskCapPercent);
      const equity = Number(targetAccount?.equity);
      if (!Number.isFinite(pct) || pct <= 0) return null;
      if (!Number.isFinite(equity) || equity <= 0) return null;
      return (equity * pct) / 100;
    }
    return null;
  })();

  const qtyBase = sourceIntent.qty != null ? Number(sourceIntent.qty) : null;
  const adjustedQty =
    qtyBase != null
      ? adjustSizeByMode({
          sourceQty: qtyBase,
          sourceAccount,
          targetAccount,
          mode: sizeMode,
          stopDistance,
          riskValue
        })
      : null;

  const finalQty =
    adjustedQty != null && Number.isFinite(adjustedQty)
      ? clampVolume({ qty: adjustedQty, account: targetAccount })
      : adjustedQty;

  return {
    symbol: targetSymbol,
    side: sourceIntent.side,
    type: sourceIntent.type,
    qty: finalQty,
    entryPrice,
    stopLoss,
    takeProfit,
    comment: sourceIntent.comment || null,
    sourceBroker,
    correlationId: sourceIntent.correlationId || null,
    meta: {
      ...sourceIntent.meta,
      mirroredFrom: sourceBroker,
      priceAdjustMode: priceMode,
      sizeAdjustMode: sizeMode
    }
  } as TradeIntent;
};
