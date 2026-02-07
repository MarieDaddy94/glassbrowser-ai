const DEFAULT_CAPABILITIES = Object.freeze({
  quotes: true,
  history: true,
  positions: true,
  orders: true,
  constraints: true,
  streaming: true,
  execution: true
});

const WRITE_METHODS = new Set([
  'connect',
  'disconnect',
  'setActiveAccount',
  'setTradingOptions',
  'startStream',
  'stopStream',
  'cancelOrder',
  'modifyOrder',
  'modifyPosition',
  'closePosition',
  'placeOrder',
  'setQuote',
  'setHistorySeries',
  'fillOrder'
]);

const SIM_CAPABILITIES = Object.freeze({
  quotes: true,
  history: true,
  positions: true,
  orders: true,
  constraints: false,
  streaming: false,
  execution: true,
  paper: true
});

function createTradeLockerAdapter(client) {
  const handlers = {
    getStatus: () => client.getStatus(),
    connect: (opts) => client.connect(opts),
    disconnect: () => client.disconnect(),
    getAccounts: () => client.getAllAccounts(),
    setActiveAccount: (account) => client.setActiveAccount(account || {}),
    setTradingOptions: (options) => client.setTradingOptions(options || {}),
    searchInstruments: (args) => client.searchInstruments(args || {}),
    getSnapshot: (opts) => client.getSnapshot(opts || {}),
    getAccountMetrics: (opts) => client.getAccountMetrics(opts || {}),
    getOrders: () => client.getOrders(),
    getOrderDetails: (args) => client.getOrderDetails(args || {}),
    getPositionDetails: (args) => client.getPositionDetails(args || {}),
    getQuote: (args) => client.getQuote(args || {}),
    getQuotes: (args) => client.getQuotes(args || {}),
    getHistory: (args) => client.getHistory(args || {}),
    getHistorySeries: (args) => client.getHistorySeries(args || {}),
    getDailyBar: (args) => client.getDailyBar(args || {}),
    getInstrumentConstraints: (args) => client.getInstrumentConstraints(args || {}),
    getInstrumentDetails: (args) => client.getInstrumentDetails(args || {}),
    getSessionDetails: (args) => client.getSessionDetails(args || {}),
    getSessionStatus: (args) => client.getSessionStatus(args || {}),
    getStreamStatus: () => client.getStreamStatus(),
    startStream: () => client.startStream(),
    stopStream: () => client.stopStream(),
    cancelOrder: (args) => client.cancelOrder(args || {}),
    modifyOrder: (args) => client.modifyOrder(args || {}),
    modifyPosition: (args) => client.modifyPosition(args || {}),
    closePosition: (args) => client.closePosition(args || {}),
    placeOrder: (args) => client.placeOrder(args || {})
  };

  return {
    id: 'tradelocker',
    label: 'TradeLocker',
    kind: 'broker',
    capabilities: { ...DEFAULT_CAPABILITIES },
    handlers
  };
}

function createSimAdapter() {
  const state = {
    connected: true,
    balance: 100000,
    realizedPnl: 0,
    currency: 'USD',
    orders: new Map(),
    ordersHistory: [],
    positions: new Map(),
    quotes: new Map(),
    history: new Map(),
    orderSeq: 0,
    positionSeq: 0
  };

  const nowMs = () => Date.now();
  const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();
  const normalizeResolution = (value) => String(value || '').trim();
  const normalizeSide = (value) => {
    const side = String(value || '').trim().toUpperCase();
    return side === 'SELL' ? 'SELL' : 'BUY';
  };
  const normalizeOrderType = (value) => {
    const type = String(value || '').trim().toUpperCase();
    return type === 'LIMIT' || type === 'STOP' ? type : 'MARKET';
  };
  const normalizeQty = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const toNumber = (value) => {
    const num = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(num) ? num : null;
  };
  const makeId = (prefix) => `${prefix}_${nowMs()}_${Math.random().toString(16).slice(2, 8)}`;
  const withDelay = async (args) => {
    const delay = Number(args?.simulate?.delayMs);
    if (!Number.isFinite(delay) || delay <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(3000, Math.floor(delay))));
  };
  const maybeSimulateFailure = (args, fallback) => {
    const sim = args?.simulate;
    if (!sim) return null;
    if (sim.timeout) {
      return { ok: false, error: fallback || 'Sim timeout.', code: 'SIM_TIMEOUT', retryable: true };
    }
    if (sim.error || sim.code || sim.status) {
      return {
        ok: false,
        error: sim.error || fallback || 'Sim error.',
        code: sim.code || null,
        status: sim.status || null,
        retryAfterMs: sim.retryAfterMs || null,
        retryable: sim.retryable === true
      };
    }
    return null;
  };

  const getQuoteMid = (quote) => {
    const mid = toNumber(quote?.mid);
    if (mid != null) return mid;
    const bid = toNumber(quote?.bid);
    const ask = toNumber(quote?.ask);
    if (bid != null && ask != null) return (bid + ask) / 2;
    if (bid != null) return bid;
    if (ask != null) return ask;
    const last = toNumber(quote?.last);
    if (last != null) return last;
    return null;
  };

  const pickFillPrice = (quote, side, fallbackPrice) => {
    const bid = toNumber(quote?.bid);
    const ask = toNumber(quote?.ask);
    if (side === 'BUY' && ask != null) return ask;
    if (side === 'SELL' && bid != null) return bid;
    const mid = getQuoteMid(quote);
    if (mid != null) return mid;
    const fallback = toNumber(fallbackPrice);
    return fallback != null ? fallback : null;
  };

  const computePositionPnl = (position, quote) => {
    const price = pickFillPrice(quote, position.side, position.entryPrice);
    if (price == null) return 0;
    const diff = position.side === 'BUY' ? price - position.entryPrice : position.entryPrice - price;
    return diff * position.qty;
  };

  const buildPositionSnapshot = (position) => {
    const quote = state.quotes.get(position.symbol) || null;
    const pnl = computePositionPnl(position, quote);
    return {
      ...position,
      size: position.qty,
      pnl,
      brokerBid: toNumber(quote?.bid),
      brokerAsk: toNumber(quote?.ask),
      brokerMid: toNumber(quote?.mid),
      brokerSpread: toNumber(quote?.spread),
      brokerUpdatedAtMs: toNumber(quote?.updatedAtMs)
    };
  };

  const getFloatingPnl = () => {
    let total = 0;
    for (const pos of state.positions.values()) {
      total += computePositionPnl(pos, state.quotes.get(pos.symbol) || null);
    }
    return total;
  };

  const buildHistoryKey = (symbol, resolution) => {
    const sym = normalizeSymbol(symbol);
    const res = normalizeResolution(resolution);
    return `${sym}:${res}`;
  };

  const resolveBarTimestamp = (bar) => {
    const raw = toNumber(bar?.t ?? bar?.time ?? bar?.timestamp);
    if (raw == null) return null;
    return raw > 1e11 ? Math.floor(raw) : Math.floor(raw * 1000);
  };

  const normalizeBar = (bar) => {
    const ts = resolveBarTimestamp(bar);
    const o = toNumber(bar?.o ?? bar?.open ?? bar?.c ?? bar?.close);
    const h = toNumber(bar?.h ?? bar?.high ?? o ?? bar?.l ?? bar?.low);
    const l = toNumber(bar?.l ?? bar?.low ?? o ?? bar?.h ?? bar?.high);
    const c = toNumber(bar?.c ?? bar?.close ?? o);
    if (ts == null || o == null || h == null || l == null || c == null) return null;
    return {
      t: ts,
      o,
      h,
      l,
      c,
      v: toNumber(bar?.v ?? bar?.volume)
    };
  };

  const handlers = {
    getStatus: async () => ({
      ok: true,
      connected: state.connected,
      tradingEnabled: state.connected,
      mode: 'sim',
      note: 'Sim broker (in-memory orders/positions).'
    }),
    connect: async () => {
      state.connected = true;
      return { ok: true, connected: true, mode: 'sim' };
    },
    disconnect: async () => {
      state.connected = false;
      return { ok: true, connected: false, mode: 'sim' };
    },
    getAccountMetrics: async () => {
      const floating = getFloatingPnl();
      const equity = state.balance + floating;
      return {
        ok: true,
        metrics: {
          balance: state.balance,
          equity,
          currency: state.currency,
          floatingPnl: floating,
          realizedPnl: state.realizedPnl,
          accountId: 'sim',
          accountKey: 'sim',
          updatedAtMs: nowMs()
        }
      };
    },
    getOrders: async () => ({
      ok: true,
      orders: Array.from(state.orders.values())
    }),
    getOrdersHistory: async () => ({
      ok: true,
      orders: Array.isArray(state.ordersHistory) ? state.ordersHistory.slice() : []
    }),
    getPositions: async () => ({
      ok: true,
      positions: Array.from(state.positions.values()).map(buildPositionSnapshot)
    }),
    getQuote: async (args) => {
      const symbol = normalizeSymbol(args?.symbol);
      const quote = state.quotes.get(symbol) || null;
      if (!quote) {
        return { ok: false, error: 'Sim broker does not support getQuote (no cache).' };
      }
      return { ok: true, quote };
    },
    getQuotes: async (args) => {
      const symbols = Array.isArray(args?.symbols) ? args.symbols : [];
      const list = symbols
        .map((sym) => normalizeSymbol(sym))
        .filter(Boolean)
        .map((sym) => state.quotes.get(sym))
        .filter(Boolean);
      if (list.length === 0) {
        return { ok: false, error: 'Sim broker does not support getQuotes (no cache).' };
      }
      return { ok: true, quotes: list };
    },
    setQuote: async (args) => {
      const symbol = normalizeSymbol(args?.symbol);
      if (!symbol) return { ok: false, error: 'Symbol required.' };
      const bid = toNumber(args?.bid);
      const ask = toNumber(args?.ask);
      const mid = toNumber(args?.mid);
      const last = toNumber(args?.last);
      const quote = {
        symbol,
        bid,
        ask,
        mid,
        last,
        spread: toNumber(args?.spread),
        updatedAtMs: toNumber(args?.fetchedAtMs ?? args?.timestampMs) ?? nowMs()
      };
      state.quotes.set(symbol, quote);
      return { ok: true, quote };
    },
    setHistorySeries: async (args) => {
      const symbol = normalizeSymbol(args?.symbol);
      const resolution = normalizeResolution(args?.resolution || args?.timeframe);
      if (!symbol || !resolution) return { ok: false, error: 'Symbol and resolution required.' };
      const rawBars = Array.isArray(args?.bars) ? args.bars : [];
      if (rawBars.length === 0) return { ok: false, error: 'Bars required.' };
      const normalized = rawBars
        .map((bar) => normalizeBar(bar))
        .filter(Boolean);
      if (normalized.length === 0) return { ok: false, error: 'Bars invalid.' };
      state.history.set(buildHistoryKey(symbol, resolution), {
        symbol,
        resolution,
        bars: normalized,
        fetchedAtMs: toNumber(args?.fetchedAtMs) ?? nowMs()
      });
      return { ok: true, count: normalized.length };
    },
    getHistorySeries: async (args) => {
      const symbol = normalizeSymbol(args?.symbol);
      const resolution = normalizeResolution(args?.resolution || args?.timeframe);
      const entry = state.history.get(buildHistoryKey(symbol, resolution));
      if (!entry || !Array.isArray(entry.bars) || entry.bars.length === 0) {
        return { ok: false, error: 'Sim broker does not support getHistorySeries (cache empty).' };
      }
      const from = toNumber(args?.from);
      const to = toNumber(args?.to);
      const bars = entry.bars.filter((bar) => {
        const ts = toNumber(bar?.t);
        if (ts == null) return false;
        if (from != null && ts < from) return false;
        if (to != null && ts > to) return false;
        return true;
      });
      return {
        ok: true,
        bars,
        symbol,
        resolution,
        fetchedAtMs: entry.fetchedAtMs ?? nowMs()
      };
    },
    placeOrder: async (args) => {
      await withDelay(args);
      const failure = maybeSimulateFailure(args, 'Order rejected.');
      if (failure) return failure;
      const symbol = normalizeSymbol(args?.symbol);
      if (!symbol) return { ok: false, error: 'Symbol required.' };
      const qty = normalizeQty(args?.qty || args?.quantity || args?.size);
      if (!qty) return { ok: false, error: 'Quantity required.' };
      const side = normalizeSide(args?.side);
      const orderType = normalizeOrderType(args?.orderType || args?.type);
      const id = makeId('ord');
      const order = {
        id,
        symbol,
        side,
        orderType,
        qty,
        price: toNumber(args?.price),
        stopLoss: toNumber(args?.stopLoss),
        takeProfit: toNumber(args?.takeProfit),
        status: 'WORKING',
        createdAtMs: nowMs(),
        updatedAtMs: null
      };
      state.orders.set(id, order);
      const autoFill = orderType === 'MARKET' ? args?.autoFill !== false : args?.autoFill === true;
      if (!autoFill) {
        return { ok: true, order, orderId: id, orderStatus: order.status };
      }
      const quote = state.quotes.get(symbol) || null;
      const fillPrice = pickFillPrice(quote, side, order.price);
      const fillQty = qty;
      order.status = 'FILLED';
      order.updatedAtMs = nowMs();
      order.fillPrice = fillPrice;
      order.filledQty = fillQty;
      const posId = makeId('pos');
      const position = {
        id: posId,
        symbol,
        side,
        qty: fillQty,
        entryPrice: fillPrice ?? toNumber(order.price) ?? 0,
        stopLoss: order.stopLoss ?? null,
        takeProfit: order.takeProfit ?? null,
        status: 'OPEN',
        openedAtMs: nowMs(),
        updatedAtMs: null
      };
      order.positionId = posId;
      state.orders.set(id, order);
      state.positions.set(posId, position);
      return {
        ok: true,
        order,
        position,
        orderId: id,
        positionId: posId,
        orderStatus: order.status,
        filledQty: fillQty,
        remainingQty: 0,
        resolvedSymbol: symbol
      };
    },
    modifyOrder: async (args) => {
      await withDelay(args);
      const failure = maybeSimulateFailure(args, 'Modify rejected.');
      if (failure) return failure;
      const orderId = String(args?.orderId || '').trim();
      const order = state.orders.get(orderId);
      if (!order) return { ok: false, error: 'Order not found.' };
      if (toNumber(args?.price) != null) order.price = toNumber(args?.price);
      if (toNumber(args?.qty || args?.quantity) != null) {
        order.qty = Number(args.qty || args.quantity);
      }
      if (toNumber(args?.stopLoss) != null) order.stopLoss = toNumber(args.stopLoss);
      if (toNumber(args?.takeProfit) != null) order.takeProfit = toNumber(args.takeProfit);
      order.updatedAtMs = nowMs();
      return { ok: true, order };
    },
    cancelOrder: async (args) => {
      await withDelay(args);
      const failure = maybeSimulateFailure(args, 'Cancel rejected.');
      if (failure) return failure;
      const orderId = String(args?.orderId || '').trim();
      const order = state.orders.get(orderId);
      if (!order) return { ok: false, error: 'Order not found.' };
      order.status = 'CANCELED';
      order.updatedAtMs = nowMs();
      state.orders.set(orderId, order);
      state.ordersHistory.push({ ...order });
      return { ok: true, order };
    },
    fillOrder: async (args) => {
      await withDelay(args);
      const failure = maybeSimulateFailure(args, 'Fill rejected.');
      if (failure) return failure;
      const orderId = String(args?.orderId || '').trim();
      const order = state.orders.get(orderId);
      if (!order) return { ok: false, error: 'Order not found.' };
      const existingPositionId = String(order.positionId || '').trim();
      if (order.status === 'FILLED' && existingPositionId) {
        const existingPosition = state.positions.get(existingPositionId);
        if (existingPosition) {
          return { ok: true, order, position: existingPosition };
        }
      }
      const fillQty = normalizeQty(args?.fillQty || args?.qty || order.qty);
      const fillPrice = toNumber(args?.fillPrice) ?? toNumber(order.price);
      order.status = 'FILLED';
      order.updatedAtMs = nowMs();
      order.fillPrice = fillPrice;
      order.filledQty = fillQty;
      state.orders.set(orderId, order);
      const posId = makeId('pos');
      const position = {
        id: posId,
        symbol: order.symbol,
        side: order.side,
        qty: fillQty,
        entryPrice: fillPrice ?? 0,
        stopLoss: order.stopLoss ?? null,
        takeProfit: order.takeProfit ?? null,
        status: 'OPEN',
        openedAtMs: nowMs(),
        updatedAtMs: null
      };
      order.positionId = posId;
      state.orders.set(orderId, order);
      state.positions.set(posId, position);
      return { ok: true, order, position };
    },
    modifyPosition: async (args) => {
      await withDelay(args);
      const failure = maybeSimulateFailure(args, 'Modify rejected.');
      if (failure) return failure;
      const positionId = String(args?.positionId || '').trim();
      const position = state.positions.get(positionId);
      if (!position) return { ok: false, error: 'Position not found.' };
      if (toNumber(args?.qty || args?.quantity) != null) {
        position.qty = Number(args.qty || args.quantity);
      }
      if (toNumber(args?.stopLoss) != null) position.stopLoss = toNumber(args.stopLoss);
      if (toNumber(args?.takeProfit) != null) position.takeProfit = toNumber(args.takeProfit);
      position.updatedAtMs = nowMs();
      return { ok: true, position };
    },
    closePosition: async (args) => {
      await withDelay(args);
      const failure = maybeSimulateFailure(args, 'Close rejected.');
      if (failure) return failure;
      const positionId = String(args?.positionId || '').trim();
      const position = state.positions.get(positionId);
      if (!position) return { ok: false, error: 'Position not found.' };
      const quote = state.quotes.get(position.symbol) || null;
      const closePrice = pickFillPrice(quote, position.side === 'BUY' ? 'SELL' : 'BUY', position.entryPrice);
      const pnl = computePositionPnl(position, quote);
      state.positions.delete(positionId);
      state.balance += pnl;
      state.realizedPnl += pnl;
      const closed = { ...position, closedAtMs: nowMs(), closePrice, pnl };
      return { ok: true, position: closed };
    }
  };

  return {
    id: 'sim',
    label: 'Sim/Paper',
    kind: 'paper',
    capabilities: { ...SIM_CAPABILITIES },
    handlers
  };
}

function normalizeBrokerResponse(result, brokerId, method) {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const ok = typeof result.ok === 'boolean' ? result.ok : true;
    return { ...result, ok, brokerId, sourceBroker: brokerId, brokerMethod: method };
  }
  return { ok: true, brokerId, sourceBroker: brokerId, brokerMethod: method, result };
}

class BrokerRegistry {
  constructor() {
    this.adapters = new Map();
    this.activeId = null;
  }

  register(adapter) {
    if (!adapter || !adapter.id) throw new Error('Broker adapter missing id.');
    this.adapters.set(adapter.id, adapter);
    if (!this.activeId) this.activeId = adapter.id;
    return adapter;
  }

  list() {
    return Array.from(this.adapters.values()).map((adapter) => ({
      id: adapter.id,
      label: adapter.label || adapter.id,
      kind: adapter.kind || 'broker',
      capabilities: adapter.capabilities || {},
      active: adapter.id === this.activeId
    }));
  }

  getActiveId() {
    return this.activeId || null;
  }

  setActive(id) {
    if (!this.adapters.has(id)) return { ok: false, error: `Unknown broker: ${id}` };
    this.activeId = id;
    return { ok: true, activeId: id };
  }

  async request({ brokerId, method, args }) {
    const id = brokerId || this.activeId;
    if (!id) return { ok: false, error: 'No active broker configured.' };
    const adapter = this.adapters.get(id);
    if (!adapter) return { ok: false, error: `Unknown broker: ${id}` };
    const handler = adapter.handlers?.[method];
    if (typeof handler !== 'function') {
      return { ok: false, error: `Broker ${id} does not support ${String(method)}` };
    }
    const result = await handler(args);
    return normalizeBrokerResponse(result, id, method);
  }

  isWriteMethod(method) {
    return WRITE_METHODS.has(String(method || ''));
  }
}

module.exports = {
  BrokerRegistry,
  createTradeLockerAdapter,
  createSimAdapter
};
