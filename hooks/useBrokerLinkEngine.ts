import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrokerLinkConfig, BrokerQuote, BrokerId } from "../services/brokerLink";
import { getQuoteMid } from "../services/brokerLink";
import { buildMirroredIntent, type BrokerAdapter, type BrokerOrder, type BrokerPosition, type TradeIntent } from "../services/brokerRouter";
import { createMt5Adapter, createTradeLockerAdapter } from "../services/brokerAdapters";
import { fetchMt5 } from "../services/mt5Client";
import { getRuntimeScheduler } from "../services/runtimeScheduler";
import type { Position, TradeLockerOrder } from "../types";
import type { Mt5Order, Mt5Position } from "./useMt5Bridge";

const MIRROR_TAG_PREFIX = "gl-mirror:";

const buildMirrorTag = (broker: BrokerId, id: string) => `${MIRROR_TAG_PREFIX}${broker}:${id}`;

const extractMirrorTag = (value?: string | number | null) => {
  if (value == null) return null;
  const raw = String(value || "");
  const idx = raw.indexOf(MIRROR_TAG_PREFIX);
  if (idx < 0) return null;
  const sliced = raw.slice(idx).trim();
  const token = sliced.split(/\s|;/g)[0]?.trim();
  return token && token.startsWith(MIRROR_TAG_PREFIX) ? token : null;
};

const parseMirrorTag = (tag: string | null) => {
  if (!tag || !tag.startsWith(MIRROR_TAG_PREFIX)) return null;
  const raw = tag.slice(MIRROR_TAG_PREFIX.length);
  const [broker, id] = raw.split(":");
  if ((broker !== "mt5" && broker !== "tradelocker") || !id) return null;
  return { sourceBroker: broker as BrokerId, sourceId: id };
};

const mt5OrderType = (type?: number | null) => {
  const code = typeof type === "number" ? type : Number(type);
  if ([2, 3].includes(code)) return "limit";
  if ([4, 5, 6, 7].includes(code)) return "stop";
  return "market";
};

const mt5OrderSide = (type?: number | null) => {
  const code = typeof type === "number" ? type : Number(type);
  if ([1, 3, 5, 7].includes(code)) return "SELL";
  if ([0, 2, 4, 6].includes(code)) return "BUY";
  return "BUY";
};

const mapMt5Order = (order: Mt5Order): BrokerOrder | null => {
  const id = order?.ticket != null ? String(order.ticket) : "";
  const symbol = String(order?.symbol || "").trim();
  if (!id || !symbol) return null;
  const qtyRaw = order?.volume_current ?? order?.volume ?? (order as any)?.volume_initial;
  const qty = Number(qtyRaw);
  const price = Number(order?.price_open ?? (order as any)?.price ?? order?.price);
  return {
    id,
    brokerId: "mt5",
    symbol,
    side: mt5OrderSide(order?.type),
    type: mt5OrderType(order?.type),
    qty: Number.isFinite(qty) ? qty : 0,
    price: Number.isFinite(price) ? price : 0,
    stopLoss: order?.sl ?? null,
    takeProfit: order?.tp ?? null,
    status: order?.state != null ? String(order.state) : null,
    createdAtMs: order?.time_setup != null ? Number(order.time_setup) * 1000 : null,
    meta: {
      comment: order?.comment ?? null,
      magic: order?.magic ?? null
    }
  };
};

const mapMt5Position = (pos: Mt5Position): BrokerPosition | null => {
  const id = pos?.ticket != null ? String(pos.ticket) : "";
  const symbol = String(pos?.symbol || "").trim();
  if (!id || !symbol) return null;
  const qty = Number(pos?.volume ?? (pos as any)?.volume_current);
  const entry = Number(pos?.price_open ?? (pos as any)?.price);
  return {
    id,
    brokerId: "mt5",
    symbol,
    side: mt5OrderSide(pos?.type),
    entryPrice: Number.isFinite(entry) ? entry : 0,
    qty: Number.isFinite(qty) ? qty : 0,
    stopLoss: pos?.sl ?? null,
    takeProfit: pos?.tp ?? null,
    openTimeMs: pos?.time != null ? Number(pos.time) * 1000 : null,
    status: "OPEN",
    meta: {
      comment: pos?.comment ?? null,
      magic: pos?.magic ?? null
    }
  };
};

const mapTlOrder = (order: TradeLockerOrder): BrokerOrder | null => {
  const id = String(order?.id || "").trim();
  const symbol = String(order?.symbol || "").trim();
  if (!id || !symbol) return null;
  return {
    id,
    brokerId: "tradelocker",
    symbol,
    side: order?.side === "SELL" ? "SELL" : "BUY",
    type: order?.type === "stop" ? "stop" : order?.type === "limit" ? "limit" : "market",
    qty: Number(order?.qty ?? 0),
    price: Number(order?.price ?? 0),
    stopLoss: order?.stopLoss ?? null,
    takeProfit: order?.takeProfit ?? null,
    status: order?.status != null ? String(order.status) : null,
    createdAtMs: order?.createdAt ? order.createdAt.getTime() : null,
    meta: {
      strategyId: order?.strategyId ?? null
    }
  };
};

const mapTlPosition = (pos: Position): BrokerPosition | null => {
  const id = String(pos?.id || "").trim();
  const symbol = String(pos?.symbol || "").trim();
  if (!id || !symbol) return null;
  return {
    id,
    brokerId: "tradelocker",
    symbol,
    side: pos?.type === "SELL" ? "SELL" : "BUY",
    entryPrice: Number(pos?.entryPrice ?? 0),
    qty: Number(pos?.size ?? 0),
    stopLoss: pos?.stopLoss ?? null,
    takeProfit: pos?.takeProfit ?? null,
    openTimeMs: pos?.openTime ? pos.openTime.getTime() : null,
    status: pos?.status ?? "OPEN",
    meta: {
      strategyId: pos?.strategyId ?? null
    }
  };
};

const intentFromOrder = (order: BrokerOrder, mirrorTag: string): TradeIntent => ({
  symbol: order.symbol,
  side: order.side,
  type: order.type,
  qty: order.qty,
  entryPrice: Number(order.price),
  stopLoss: order.stopLoss ?? null,
  takeProfit: order.takeProfit ?? null,
  comment: mirrorTag,
  sourceBroker: order.brokerId,
  correlationId: mirrorTag,
  meta: {
    mirrorTag,
    strategyId: mirrorTag,
    sourceOrderId: order.id
  }
});

const intentFromPosition = (pos: BrokerPosition, mirrorTag: string): TradeIntent => ({
  symbol: pos.symbol,
  side: pos.side,
  type: "market",
  qty: pos.qty,
  entryPrice: Number(pos.entryPrice),
  stopLoss: pos.stopLoss ?? null,
  takeProfit: pos.takeProfit ?? null,
  comment: mirrorTag,
  sourceBroker: pos.brokerId,
  correlationId: mirrorTag,
  meta: {
    mirrorTag,
    strategyId: mirrorTag,
    sourcePositionId: pos.id
  }
});

const collectMirrorTags = (orders: BrokerOrder[], positions: BrokerPosition[]) => {
  const tags = new Set<string>();
  for (const order of orders) {
    const tag = extractMirrorTag(order.meta?.comment ?? order.meta?.strategyId ?? null);
    if (tag) tags.add(tag);
  }
  for (const pos of positions) {
    const tag = extractMirrorTag(pos.meta?.comment ?? pos.meta?.strategyId ?? null);
    if (tag) tags.add(tag);
  }
  return tags;
};

const shouldMirrorDirection = (config: BrokerLinkConfig, source: BrokerId, target: BrokerId) => {
  if (!config?.enabled || config?.mirrorMode === "off") return false;
  if (config.mirrorMode === "bidirectional") return true;
  if (config.mirrorMode === "one-way") {
    const dir = config.oneWayDirection;
    if (dir === "mt5_to_tradelocker") return source === "mt5" && target === "tradelocker";
    if (dir === "tradelocker_to_mt5") return source === "tradelocker" && target === "mt5";
  }
  return false;
};

const shouldSkipSource = (item: BrokerOrder | BrokerPosition, mirrorTags: Set<string>, mirrorTag: string) => {
  const sourceTag = extractMirrorTag(item.meta?.comment ?? item.meta?.strategyId ?? null);
  if (sourceTag) return true;
  if (mirrorTags.has(mirrorTag)) return true;
  return false;
};

type BrokerLinkEngineInput = {
  config: BrokerLinkConfig;
  tradeLockerRef: React.MutableRefObject<any>;
  resolveTradeLockerSymbol?: (symbol: string) => Promise<string>;
  pollIntervalMs?: number;
  onEvent?: (event: { type: string; payload?: Record<string, any> }) => void;
};

export const useBrokerLinkEngine = (input: BrokerLinkEngineInput) => {
  const { config, tradeLockerRef, resolveTradeLockerSymbol, pollIntervalMs, onEvent } = input;
  const [lastSyncAtMs, setLastSyncAtMs] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const configRef = useRef(config);
  const inFlightRef = useRef(false);
  const mirroredTagsRef = useRef<Set<string>>(new Set());
  const closureAttemptAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const mt5Adapter = useMemo(() => createMt5Adapter(), []);
  const tradeLockerAdapter = useMemo(() => {
    return createTradeLockerAdapter({
      api: (window as any)?.glass?.tradelocker,
      resolveSymbol: resolveTradeLockerSymbol
    });
  }, [resolveTradeLockerSymbol]);

  const loadMt5Orders = useCallback(async () => {
    const res = await fetchMt5("/orders");
    if (!res.ok) return [];
    const raw = Array.isArray(res.data?.orders) ? res.data.orders : [];
    return raw.map((item: Mt5Order) => mapMt5Order(item)).filter(Boolean) as BrokerOrder[];
  }, []);

  const loadMt5Positions = useCallback(async () => {
    const res = await fetchMt5("/positions");
    if (!res.ok) return [];
    const raw = Array.isArray(res.data?.positions) ? res.data.positions : [];
    return raw.map((item: Mt5Position) => mapMt5Position(item)).filter(Boolean) as BrokerPosition[];
  }, []);

  const slippageAllowed = useCallback(async (intent: TradeIntent, adapter: BrokerAdapter, cfg: BrokerLinkConfig) => {
    const maxPips = cfg?.slippageGuard?.maxPips;
    const maxPercent = cfg?.slippageGuard?.maxPercent;
    if (!adapter.getQuote || (maxPips == null && maxPercent == null)) return true;
    const quote: BrokerQuote | null = await adapter.getQuote(intent.symbol);
    const mid = getQuoteMid(quote);
    if (!Number.isFinite(mid) || mid == null) return true;
    const diff = Math.abs(Number(intent.entryPrice) - Number(mid));
    if (Number.isFinite(maxPips) && maxPips != null && maxPips > 0 && diff > maxPips) return false;
    if (Number.isFinite(maxPercent) && maxPercent != null && maxPercent > 0) {
      const pct = (diff / Number(mid)) * 100;
      if (pct > maxPercent) return false;
    }
    return true;
  }, []);

  const mirrorTrades = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg?.enabled || cfg.mirrorMode === "off") return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const [mt5Orders, mt5Positions] = await Promise.all([
        cfg.syncMode === "orders" ? loadMt5Orders() : Promise.resolve([]),
        cfg.syncMode === "positions" ? loadMt5Positions() : Promise.resolve([])
      ]);

      const tlMeta = tradeLockerRef.current || {};
      const tlOrdersRaw: TradeLockerOrder[] = Array.isArray(tlMeta?.orders) ? tlMeta.orders : [];
      const tlPositionsRaw: Position[] = Array.isArray(tlMeta?.positions) ? tlMeta.positions : [];

      const tlOrders = cfg.syncMode === "orders"
        ? tlOrdersRaw.map((item) => mapTlOrder(item)).filter(Boolean) as BrokerOrder[]
        : [];
      const tlPositions = cfg.syncMode === "positions"
        ? tlPositionsRaw.map((item) => mapTlPosition(item)).filter(Boolean) as BrokerPosition[]
        : [];

      const mirrorTags = collectMirrorTags(
        [...mt5Orders, ...tlOrders],
        [...mt5Positions, ...tlPositions]
      );
      for (const tag of mirroredTagsRef.current) mirrorTags.add(tag);

      const [mt5Account, tlAccount] = await Promise.all([
        mt5Adapter.getAccountSpec ? mt5Adapter.getAccountSpec() : Promise.resolve(null),
        tradeLockerAdapter.getAccountSpec ? tradeLockerAdapter.getAccountSpec() : Promise.resolve(null)
      ]);

      const mt5OrderIds = new Set(mt5Orders.map((item) => item.id));
      const mt5PositionIds = new Set(mt5Positions.map((item) => item.id));
      const tlOrderIds = new Set(tlOrders.map((item) => item.id));
      const tlPositionIds = new Set(tlPositions.map((item) => item.id));

      const canAttemptClosure = (key: string) => {
        const now = Date.now();
        const last = closureAttemptAtRef.current.get(key) || 0;
        if (now - last < 5000) return false;
        closureAttemptAtRef.current.set(key, now);
        return true;
      };

      const cancelTargetOrder = async (targetBroker: BrokerId, orderId: string, symbol?: string | null) => {
        const key = `cancel:${targetBroker}:${orderId}`;
        if (!canAttemptClosure(key)) return;
        if (targetBroker === "mt5") {
          const res = await fetchMt5("/order/cancel", {
            method: "POST",
            body: JSON.stringify({ order: orderId })
          });
          if (res.ok) {
            onEvent?.({ type: "mirror_cancelled", payload: { targetBroker, orderId, symbol } });
          } else {
            onEvent?.({ type: "mirror_cancel_failed", payload: { targetBroker, orderId, symbol, error: res.error || res.data?.error } });
          }
          return;
        }
        if (targetBroker === "tradelocker") {
          if (!tlMeta?.connected || !tlMeta?.tradingEnabled || !tlMeta?.cancelOrder) return;
          const res = await tlMeta.cancelOrder(String(orderId));
          if (res?.ok) {
            onEvent?.({ type: "mirror_cancelled", payload: { targetBroker, orderId, symbol } });
          } else {
            onEvent?.({ type: "mirror_cancel_failed", payload: { targetBroker, orderId, symbol, error: res?.error || "Cancel failed" } });
          }
        }
      };

      const closeTargetPosition = async (targetBroker: BrokerId, positionId: string, symbol?: string | null) => {
        const key = `close:${targetBroker}:${positionId}`;
        if (!canAttemptClosure(key)) return;
        if (targetBroker === "mt5") {
          const res = await fetchMt5("/position/close", {
            method: "POST",
            body: JSON.stringify({ position: positionId })
          });
          if (res.ok) {
            onEvent?.({ type: "mirror_closed", payload: { targetBroker, positionId, symbol } });
          } else {
            onEvent?.({ type: "mirror_close_failed", payload: { targetBroker, positionId, symbol, error: res.error || res.data?.error } });
          }
          return;
        }
        if (targetBroker === "tradelocker") {
          if (!tlMeta?.connected || !tlMeta?.tradingEnabled || !tlMeta?.closePosition) return;
          const res = await tlMeta.closePosition(String(positionId), 0);
          if (res?.ok) {
            onEvent?.({ type: "mirror_closed", payload: { targetBroker, positionId, symbol } });
          } else {
            onEvent?.({ type: "mirror_close_failed", payload: { targetBroker, positionId, symbol, error: res?.error || "Close failed" } });
          }
        }
      };

      const mirrorFrom = async (
        sourceBroker: BrokerId,
        targetBroker: BrokerId,
        sourceOrders: BrokerOrder[],
        sourcePositions: BrokerPosition[]
      ) => {
        if (!shouldMirrorDirection(cfg, sourceBroker, targetBroker)) return;
        if (targetBroker === "tradelocker" && (!tlMeta?.connected || !tlMeta?.tradingEnabled)) return;

        const sourceAdapter = sourceBroker === "mt5" ? mt5Adapter : tradeLockerAdapter;
        const targetAdapter = targetBroker === "mt5" ? mt5Adapter : tradeLockerAdapter;
        const sourceAccount = sourceBroker === "mt5" ? mt5Account : tlAccount;
        const targetAccount = targetBroker === "mt5" ? mt5Account : tlAccount;

        const items = cfg.syncMode === "orders" ? sourceOrders : sourcePositions;
        for (const item of items) {
          const mirrorTag = buildMirrorTag(sourceBroker, item.id);
          if (shouldSkipSource(item, mirrorTags, mirrorTag)) continue;
          const intent = cfg.syncMode === "orders"
            ? intentFromOrder(item as BrokerOrder, mirrorTag)
            : intentFromPosition(item as BrokerPosition, mirrorTag);
          const mirrored = await buildMirroredIntent({
            sourceIntent: intent,
            sourceBroker,
            targetBroker,
            config: cfg,
            sourceAdapter,
            targetAdapter,
            sourceAccount,
            targetAccount
          });
          if (!(await slippageAllowed(mirrored, targetAdapter, cfg))) {
            onEvent?.({
              type: "mirror_blocked",
              payload: { reason: "slippage_guard", sourceBroker, targetBroker, symbol: mirrored.symbol, mirrorTag }
            });
            continue;
          }
          if (!targetAdapter.placeOrder) continue;
          const res = await targetAdapter.placeOrder(mirrored);
          if (res?.ok) {
            mirroredTagsRef.current.add(mirrorTag);
            onEvent?.({
              type: "mirror_submitted",
              payload: { sourceBroker, targetBroker, symbol: mirrored.symbol, mirrorTag, orderId: res.orderId || null, positionId: res.positionId || null }
            });
          } else {
            onEvent?.({
              type: "mirror_failed",
              payload: { sourceBroker, targetBroker, symbol: mirrored.symbol, mirrorTag, error: res?.error || "Mirror failed" }
            });
          }
        }
      };

      const syncClosures = async (
        targetBroker: BrokerId,
        targetOrders: BrokerOrder[],
        targetPositions: BrokerPosition[]
      ) => {
        if (cfg.syncMode === "orders") {
          for (const order of targetOrders) {
            const tag = extractMirrorTag(order.meta?.comment ?? order.meta?.strategyId ?? null);
            const parsed = parseMirrorTag(tag);
            if (!parsed) continue;
            if (!shouldMirrorDirection(cfg, parsed.sourceBroker, targetBroker)) continue;
            const sourceSet = parsed.sourceBroker === "mt5" ? mt5OrderIds : tlOrderIds;
            if (sourceSet.has(parsed.sourceId)) continue;
            await cancelTargetOrder(targetBroker, order.id, order.symbol);
          }
          return;
        }

        for (const pos of targetPositions) {
          const tag = extractMirrorTag(pos.meta?.comment ?? pos.meta?.strategyId ?? null);
          const parsed = parseMirrorTag(tag);
          if (!parsed) continue;
          if (!shouldMirrorDirection(cfg, parsed.sourceBroker, targetBroker)) continue;
          const sourceSet = parsed.sourceBroker === "mt5" ? mt5PositionIds : tlPositionIds;
          if (sourceSet.has(parsed.sourceId)) continue;
          await closeTargetPosition(targetBroker, pos.id, pos.symbol);
        }
      };

      await mirrorFrom("mt5", "tradelocker", mt5Orders, mt5Positions);
      await mirrorFrom("tradelocker", "mt5", tlOrders, tlPositions);
      await syncClosures("tradelocker", tlOrders, tlPositions);
      await syncClosures("mt5", mt5Orders, mt5Positions);

      setLastSyncAtMs(Date.now());
      setLastError(null);
    } catch (err: any) {
      const message = err?.message ? String(err.message) : "Broker link sync failed.";
      setLastError(message);
      onEvent?.({ type: "mirror_error", payload: { error: message } });
    } finally {
      inFlightRef.current = false;
    }
  }, [loadMt5Orders, loadMt5Positions, mt5Adapter, tradeLockerAdapter, onEvent, slippageAllowed, tradeLockerRef]);

  useEffect(() => {
    if (!config?.enabled || config?.mirrorMode === "off") return;
    mirrorTrades();
    const scheduler = getRuntimeScheduler();
    const interval = Number.isFinite(Number(pollIntervalMs)) ? Number(pollIntervalMs) : 5000;
    const dispose = scheduler.registerTask({
      id: "broker-link.mirror-trades",
      groupId: "execution",
      intervalMs: Math.max(1500, interval),
      jitterPct: 0.1,
      visibilityMode: "always",
      priority: "high",
      run: async () => {
        await mirrorTrades();
      }
    });
    return () => {
      dispose();
    };
  }, [config?.enabled, config?.mirrorMode, config?.syncMode, mirrorTrades, pollIntervalMs]);

  return {
    lastSyncAtMs,
    lastError
  };
};
