import { useState, useCallback, useEffect, useMemo } from 'react';
import { Position, TradeProposal } from '../types';
import { getRuntimeScheduler } from '../services/runtimeScheduler';
import { requestBrokerCoordinated } from '../services/brokerRequestBridge';

const DEFAULT_BALANCE = 100000;

const brokerAvailable = () => {
  if (typeof window === 'undefined') return false;
  return !!(window as any)?.glass?.broker?.request;
};

const toNumber = (value: any) => {
  const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
};

const normalizePosition = (raw: any): Position | null => {
  if (!raw || typeof raw !== 'object') return null;
  const entryRaw = raw.entryPrice ?? raw.avgPrice ?? raw.openPrice ?? raw.price;
  const entryPrice = toNumber(entryRaw);
  const sizeRaw = raw.size ?? raw.qty ?? raw.quantity ?? raw.lots ?? 1;
  const size = toNumber(sizeRaw) ?? 1;
  if (entryPrice == null) return null;
  const stopLoss = toNumber(raw.stopLoss ?? raw.sl) ?? entryPrice;
  const takeProfit = toNumber(raw.takeProfit ?? raw.tp) ?? entryPrice;
  const pnl = toNumber(raw.pnl ?? raw.unrealizedPnl ?? raw.profit) ?? 0;
  const openTimeMs = toNumber(raw.openTimeMs ?? raw.openedAtMs ?? raw.createdAtMs) ?? Date.now();
  return {
    id: String(raw.id || `pos_${Date.now()}`),
    symbol: String(raw.symbol || '').trim(),
    type: String(raw.side || raw.type || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    entryPrice,
    size,
    stopLoss,
    takeProfit,
    openTime: new Date(openTimeMs),
    pnl,
    status: 'OPEN',
    strategyId: raw.strategyId ?? null,
    agentId: raw.agentId ?? undefined,
    reason: raw.reason ?? undefined,
    brokerBid: toNumber(raw.brokerBid ?? raw.bid),
    brokerAsk: toNumber(raw.brokerAsk ?? raw.ask),
    brokerMid: toNumber(raw.brokerMid ?? raw.mid),
    brokerSpread: toNumber(raw.brokerSpread ?? raw.spread),
    brokerUpdatedAtMs: toNumber(raw.brokerUpdatedAtMs ?? raw.updatedAtMs)
  };
};

export const usePortfolio = () => {
  const [balance, setBalance] = useState(DEFAULT_BALANCE);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<Position[]>([]);
  const [equity, setEquity] = useState(DEFAULT_BALANCE);
  const [useSimBroker, setUseSimBroker] = useState(brokerAvailable());
  const [simUpdatedAtMs, setSimUpdatedAtMs] = useState<number | null>(null);
  const runtimeScheduler = useMemo(() => getRuntimeScheduler(), []);

  const fetchSimSnapshot = useCallback(async () => {
    if (!brokerAvailable()) return false;
    try {
      const [metricsRes, positionsRes] = await Promise.all([
        requestBrokerCoordinated('getAccountMetrics', undefined, { brokerId: 'sim', source: 'portfolio' }),
        requestBrokerCoordinated('getPositions', undefined, { brokerId: 'sim', source: 'portfolio' })
      ]);
      let didUpdate = false;
      if (metricsRes?.ok) {
        const metrics = metricsRes.metrics || metricsRes.account || metricsRes.result || {};
        const nextBalance = toNumber(metrics.balance);
        const nextEquity = toNumber(metrics.equity);
        if (nextBalance != null) setBalance(nextBalance);
        if (nextEquity != null) setEquity(nextEquity);
        didUpdate = true;
      }
      if (positionsRes?.ok && Array.isArray(positionsRes.positions)) {
        const normalized = positionsRes.positions
          .map((entry: any) => normalizePosition(entry))
          .filter(Boolean) as Position[];
        setPositions(normalized);
        didUpdate = true;
      }
      if (didUpdate) setSimUpdatedAtMs(Date.now());
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!brokerAvailable()) {
      setUseSimBroker(false);
      return;
    }
    setUseSimBroker(true);
    void fetchSimSnapshot();
    const dispose = runtimeScheduler.registerTask({
      id: 'portfolio.sim.snapshot',
      groupId: 'portfolio',
      intervalMs: 3000,
      jitterPct: 0.08,
      visibilityMode: 'always',
      priority: 'normal',
      run: async () => {
        await fetchSimSnapshot();
      }
    });
    return () => dispose();
  }, [fetchSimSnapshot, runtimeScheduler]);

  useEffect(() => {
    if (useSimBroker) return;
    const dispose = runtimeScheduler.registerTask({
      id: 'portfolio.mock.pnl',
      groupId: 'portfolio',
      intervalMs: 2000,
      jitterPct: 0.1,
      visibilityMode: 'foreground',
      priority: 'low',
      run: () => {
        setPositions((prev) => prev.map((pos) => {
          const noise = (Math.random() - 0.5) * 10;
          return { ...pos, pnl: pos.pnl + noise };
        }));
      }
    });
    return () => dispose();
  }, [runtimeScheduler, useSimBroker]);

  useEffect(() => {
    if (useSimBroker) return;
    const totalFloating = positions.reduce((acc, pos) => acc + pos.pnl, 0);
    setEquity(balance + totalFloating);
  }, [balance, positions, useSimBroker]);

  const executeTrade = useCallback((proposal: TradeProposal) => {
    if (useSimBroker && brokerAvailable()) {
      void requestBrokerCoordinated(
        'placeOrder',
        {
          symbol: proposal.symbol,
          side: proposal.action,
          orderType: 'MARKET',
          qty: 1,
          price: proposal.entryPrice,
          stopLoss: proposal.stopLoss,
          takeProfit: proposal.takeProfit,
          autoFill: true
        },
        { brokerId: 'sim', source: 'portfolio' }
      ).then(() => {
        void fetchSimSnapshot();
      });
      return null;
    }

    const newPosition: Position = {
      id: `pos-${Date.now()}`,
      symbol: proposal.symbol,
      type: proposal.action,
      entryPrice: proposal.entryPrice,
      size: 1.0,
      stopLoss: proposal.stopLoss,
      takeProfit: proposal.takeProfit,
      openTime: new Date(),
      pnl: -15.0,
      status: 'OPEN',
      agentId: proposal.agentId,
      reason: proposal.reason
    };
    setPositions((prev) => [newPosition, ...prev]);
    return newPosition;
  }, [fetchSimSnapshot, useSimBroker]);

  const closePosition = useCallback((id: string): Position | null => {
    if (useSimBroker && brokerAvailable()) {
      void requestBrokerCoordinated(
        'closePosition',
        { positionId: id },
        { brokerId: 'sim', source: 'portfolio' }
      ).then(() => fetchSimSnapshot());
      return null;
    }

    let closedPosition: Position | null = null;
    setPositions((prev) => {
      const pos = prev.find((p) => p.id === id);
      if (pos) {
        setBalance((b) => b + pos.pnl);
        closedPosition = {
          ...pos,
          status: 'CLOSED',
          closeTime: new Date(),
          closePrice: pos.entryPrice
        };
      }
      return prev.filter((p) => p.id !== id);
    });
    if (closedPosition) {
      // @ts-ignore
      setHistory((prev) => [closedPosition as Position, ...prev]);
    }
    return closedPosition;
  }, [fetchSimSnapshot, useSimBroker]);

  return {
    balance,
    equity,
    positions,
    history,
    simAvailable: useSimBroker,
    simUpdatedAtMs,
    executeTrade,
    closePosition
  };
};
