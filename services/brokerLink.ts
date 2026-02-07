export type BrokerId = "mt5" | "tradelocker";

export type MirrorMode = "off" | "one-way" | "bidirectional";
export type MirrorSyncMode = "orders" | "positions";
export type PriceAdjustMode = "pip" | "percent";
export type SizeAdjustMode = "match" | "balance_ratio" | "risk_percent" | "risk_amount";

export type MirrorDirection = "mt5_to_tradelocker" | "tradelocker_to_mt5";

export type BrokerQuote = {
  symbol: string;
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  timestampMs?: number | null;
  fetchedAtMs?: number | null;
};

export type BrokerAccountSpec = {
  brokerId: BrokerId;
  accountKey: string;
  currency?: string | null;
  equity?: number | null;
  balance?: number | null;
  netting?: boolean | null;
  updatedAtMs?: number | null;
  pipValue?: number | null;
  lotSize?: number | null;
  tickSize?: number | null;
  minVolume?: number | null;
  volumeStep?: number | null;
  maxVolume?: number | null;
};

export type SymbolMapEntry = {
  canonical: string;
  mt5?: string | null;
  tradelocker?: string | null;
};

export type BrokerLinkConfig = {
  enabled: boolean;
  mirrorMode: MirrorMode;
  masterBroker: BrokerId;
  oneWayDirection: MirrorDirection;
  syncMode: MirrorSyncMode;
  priceAdjustMode: PriceAdjustMode;
  sizeAdjustMode: SizeAdjustMode;
  globalRiskCapPercent: number | null;
  globalRiskCapAmount: number | null;
  signalDefaults: {
    sendToMt5: boolean;
    sendToTradeLocker: boolean;
  };
  slippageGuard: {
    maxPips: number | null;
    maxPercent: number | null;
  };
  symbolMap: SymbolMapEntry[];
};

export const DEFAULT_BROKER_LINK_CONFIG: BrokerLinkConfig = {
  enabled: false,
  mirrorMode: "off",
  masterBroker: "mt5",
  oneWayDirection: "mt5_to_tradelocker",
  syncMode: "orders",
  priceAdjustMode: "pip",
  sizeAdjustMode: "match",
  globalRiskCapPercent: 1,
  globalRiskCapAmount: null,
  signalDefaults: {
    sendToMt5: true,
    sendToTradeLocker: true
  },
  slippageGuard: {
    maxPips: 15,
    maxPercent: 0.2
  },
  symbolMap: []
};

const STORAGE_KEY = "glass_broker_link_config";

export const loadBrokerLinkConfig = (): BrokerLinkConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BROKER_LINK_CONFIG };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_BROKER_LINK_CONFIG };
    return {
      ...DEFAULT_BROKER_LINK_CONFIG,
      ...parsed,
      signalDefaults: {
        ...DEFAULT_BROKER_LINK_CONFIG.signalDefaults,
        ...(parsed.signalDefaults || {})
      },
      slippageGuard: {
        ...DEFAULT_BROKER_LINK_CONFIG.slippageGuard,
        ...(parsed.slippageGuard || {})
      }
    };
  } catch {
    return { ...DEFAULT_BROKER_LINK_CONFIG };
  }
};

export const saveBrokerLinkConfig = (config: BrokerLinkConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore persistence failures
  }
};

export const getQuoteMid = (quote?: BrokerQuote | null) => {
  if (!quote) return null;
  const mid = Number(quote.mid);
  if (Number.isFinite(mid) && mid > 0) return mid;
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  if (Number.isFinite(bid)) return bid;
  if (Number.isFinite(ask)) return ask;
  return null;
};

export const applyPriceAdjustment = (input: {
  price: number;
  sourceQuote?: BrokerQuote | null;
  targetQuote?: BrokerQuote | null;
  mode: PriceAdjustMode;
}) => {
  const { price, sourceQuote, targetQuote, mode } = input;
  const sourceRef = getQuoteMid(sourceQuote);
  const targetRef = getQuoteMid(targetQuote);
  if (!Number.isFinite(price) || price <= 0) return price;
  if (!Number.isFinite(sourceRef) || !Number.isFinite(targetRef) || sourceRef <= 0 || targetRef <= 0) {
    return price;
  }

  if (mode === "percent") {
    const ratio = targetRef / sourceRef;
    if (!Number.isFinite(ratio) || ratio <= 0) return price;
    return price * ratio;
  }

  const shift = targetRef - sourceRef;
  return price + shift;
};

export const adjustSizeByMode = (input: {
  sourceQty: number;
  sourceAccount?: BrokerAccountSpec | null;
  targetAccount?: BrokerAccountSpec | null;
  mode: SizeAdjustMode;
  stopDistance?: number | null;
  riskValue?: number | null;
}) => {
  const { sourceQty, sourceAccount, targetAccount, mode, stopDistance, riskValue } = input;
  if (!Number.isFinite(sourceQty) || sourceQty <= 0) return sourceQty;
  if (mode === "match") return sourceQty;

  const sourceEquity = Number(sourceAccount?.equity);
  const targetEquity = Number(targetAccount?.equity);

  if (mode === "balance_ratio") {
    if (!Number.isFinite(sourceEquity) || !Number.isFinite(targetEquity) || sourceEquity <= 0) return sourceQty;
    const ratio = targetEquity / sourceEquity;
    if (!Number.isFinite(ratio) || ratio <= 0) return sourceQty;
    return sourceQty * ratio;
  }

  const pipValue = Number(targetAccount?.pipValue);
  const lotSize = Number(targetAccount?.lotSize);
  const stop = Number(stopDistance);
  const risk = Number(riskValue);
  if (!Number.isFinite(stop) || stop <= 0) return sourceQty;
  if (!Number.isFinite(risk) || risk <= 0) return sourceQty;

  if (Number.isFinite(pipValue) && pipValue > 0) {
    const size = risk / (stop * pipValue);
    if (Number.isFinite(size) && size > 0) return size;
  }

  if (Number.isFinite(lotSize) && lotSize > 0) {
    const size = risk / (stop * lotSize);
    if (Number.isFinite(size) && size > 0) return size;
  }

  return sourceQty;
};

export const clampVolume = (input: { qty: number; account?: BrokerAccountSpec | null }) => {
  const { qty, account } = input;
  if (!Number.isFinite(qty)) return qty;
  const min = Number(account?.minVolume);
  const max = Number(account?.maxVolume);
  const step = Number(account?.volumeStep);
  let next = qty;
  if (Number.isFinite(min) && min > 0) next = Math.max(next, min);
  if (Number.isFinite(max) && max > 0) next = Math.min(next, max);
  if (Number.isFinite(step) && step > 0) {
    next = Math.round(next / step) * step;
  }
  return next;
};
