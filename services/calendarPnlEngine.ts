import type {
  CalendarPnlAccountOption,
  CalendarPnlAccountSummary,
  CalendarPnlDayAccountOverlay,
  CalendarPnlDayCell,
  CalendarPnlKpis,
  CalendarPnlMonthSummary,
  CalendarPnlSnapshot,
  CalendarPnlSourceSummary,
  CalendarPnlTrade
} from '../types';

type CalendarPnlEngineInput = {
  entries: any[];
  monthKey?: string | null;
  timezone?: string | null;
  accountBalance?: number | null;
  accountEquity?: number | null;
  symbol?: string | null;
  agentId?: string | null;
  broker?: string | null;
  accountKey?: string | null;
  accountId?: number | null;
  accNum?: number | null;
};

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  dateKey: string;
  monthKey: string;
};

type NormalizedCalendarPnlTrade = CalendarPnlTrade & {
  dateKey: string;
  monthKey: string;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getDateFormatter = (timezone: string) => {
  const key = String(timezone || 'UTC').trim() || 'UTC';
  const cached = dateFormatterCache.get(key);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-CA', {
    timeZone: key,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  dateFormatterCache.set(key, created);
  return created;
};

const safeNumber = (value: any): number | null => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const safeInteger = (value: any): number | null => {
  const next = safeNumber(value);
  if (next == null) return null;
  const rounded = Math.round(next);
  return Number.isFinite(rounded) ? rounded : null;
};

const safeText = (value: any): string => {
  if (value == null) return '';
  return String(value).trim();
};

const toZonedDateParts = (timestampMs: number, timezone: string): ZonedDateParts => {
  const formatter = getDateFormatter(timezone);
  const parts = formatter.formatToParts(new Date(timestampMs));
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    if (part.type === 'month') month = Number(part.value);
    if (part.type === 'day') day = Number(part.value);
  }
  if (!Number.isFinite(year) || year <= 0) year = new Date(timestampMs).getUTCFullYear();
  if (!Number.isFinite(month) || month <= 0) month = new Date(timestampMs).getUTCMonth() + 1;
  if (!Number.isFinite(day) || day <= 0) day = new Date(timestampMs).getUTCDate();
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const monthKey = `${year}-${mm}`;
  return {
    year,
    month,
    day,
    monthKey,
    dateKey: `${monthKey}-${dd}`
  };
};

export const getCalendarMonthKey = (timestampMs: number = Date.now(), timezone: string = 'UTC') => {
  const parts = toZonedDateParts(timestampMs, timezone);
  return parts.monthKey;
};

export const normalizeCalendarMonthKey = (monthKey?: string | null, timezone: string = 'UTC') => {
  const raw = String(monthKey || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return getCalendarMonthKey(Date.now(), timezone);
};

const resolveCloseTimestampMs = (entry: any): number | null => {
  const ordered = [entry?.positionClosedAtMs, entry?.closedAtMs, entry?.updatedAtMs];
  for (const value of ordered) {
    const next = safeNumber(value);
    if (next != null && next > 0) return next;
  }
  return null;
};

const isClosedTradeEntry = (entry: any) => {
  const kind = String(entry?.kind || '').trim().toLowerCase();
  if (kind !== 'trade') return false;
  const status = String(entry?.status || '').trim().toUpperCase();
  const positionStatus = String(entry?.positionStatus || '').trim().toUpperCase();
  const closeTs = resolveCloseTimestampMs(entry);
  return status === 'CLOSED' || positionStatus === 'CLOSED' || (closeTs != null && closeTs > 0);
};

const resolveRealizedPnl = (entry: any) => {
  const ordered = [entry?.realizedPnl, entry?.positionClosedPnl, 0];
  for (const value of ordered) {
    const next = safeNumber(value);
    if (next != null) return next;
  }
  return 0;
};

const resolveRMultiple = (entry: any): number | null => {
  const ordered = [entry?.shadowR, entry?.rMultiple, entry?.score];
  for (const value of ordered) {
    const next = safeNumber(value);
    if (next != null) return next;
  }
  return null;
};

const resolveWinLoss = (realizedPnl: number): CalendarPnlTrade['winLoss'] => {
  if (realizedPnl > 0) return 'win';
  if (realizedPnl < 0) return 'loss';
  return 'be';
};

const normalizeFilterValue = (value?: string | null) => {
  const next = String(value || '').trim();
  return next ? next.toLowerCase() : '';
};

const pickEntryField = (entry: any, keys: string[]): any => {
  const account = entry?.account && typeof entry.account === 'object' ? entry.account : null;
  const raw = entry?.raw && typeof entry.raw === 'object' ? entry.raw : null;
  for (const key of keys) {
    if (entry?.[key] != null) return entry[key];
    if (account?.[key] != null) return account[key];
    if (raw?.[key] != null) return raw[key];
  }
  return null;
};

const resolvePnlSourceKind = (value: string | null): CalendarPnlTrade['pnlSourceKind'] => {
  const raw = normalizeFilterValue(value);
  if (!raw) return 'ledger';
  if (raw.includes('ledger')) return 'ledger';
  if (
    raw.includes('orders_history') ||
    raw.includes('broker') ||
    raw.includes('position') ||
    raw.includes('mt5') ||
    raw.includes('fill')
  ) {
    return 'broker';
  }
  if (raw.includes('manual') || raw.includes('sim')) return 'ledger';
  return 'unknown';
};

const buildAccountIdentity = (entry: any, brokerRaw: string) => {
  const explicitAccountKey = safeText(pickEntryField(entry, ['accountKey', 'snapshotSourceKey', 'sourceKey']));
  const accountId = safeInteger(pickEntryField(entry, ['accountId', 'accountID']));
  const accNum = safeInteger(pickEntryField(entry, ['accNum', 'accountNum']));
  const env = safeText(pickEntryField(entry, ['env', 'accountEnv']));
  const server = safeText(pickEntryField(entry, ['server', 'accountServer']));
  const broker = safeText(brokerRaw);

  let accountKey = explicitAccountKey || null;
  if (!accountKey) {
    const parts = [
      broker || null,
      env || null,
      server || null,
      accountId != null ? String(accountId) : null,
      accNum != null ? String(accNum) : null
    ].filter(Boolean) as string[];
    accountKey = parts.length > 0 ? parts.join(':') : null;
  }

  let label = '';
  if (accountId != null) {
    label = `${broker || 'acct'} ${accountId}${accNum != null ? `/${accNum}` : ''}`;
    if (env) label += ` • ${env}`;
  } else if (accountKey) {
    label = accountKey;
  } else {
    label = 'Unassigned';
  }

  return {
    accountKey,
    accountLabel: label,
    accountId,
    accNum,
    env: env || null,
    server: server || null
  };
};

const normalizeTrade = (entry: any, timezone: string): NormalizedCalendarPnlTrade | null => {
  if (!isClosedTradeEntry(entry)) return null;
  const closedAtMs = resolveCloseTimestampMs(entry);
  if (!Number.isFinite(Number(closedAtMs))) return null;
  const realizedPnl = resolveRealizedPnl(entry);
  const sideRaw = String(entry?.action || '').trim().toUpperCase();
  const side = sideRaw === 'SELL' ? 'SELL' : 'BUY';
  const symbolRaw = safeText(entry?.symbol);
  const brokerRaw = safeText(entry?.broker);
  const agentRaw = safeText(entry?.agentId);
  const pnlSourceRaw = safeText(
    pickEntryField(entry, ['realizedPnlSource', 'pnlSource', 'realizedSource', 'source'])
  );
  const pnlSourceKind = resolvePnlSourceKind(pnlSourceRaw || null);
  const account = buildAccountIdentity(entry, brokerRaw);
  const parts = toZonedDateParts(Number(closedAtMs), timezone);
  return {
    id: String(entry?.id || entry?.executionId || `${parts.dateKey}:${symbolRaw || 'trade'}`),
    symbol: symbolRaw || null,
    side,
    broker: brokerRaw || null,
    agentId: agentRaw || null,
    closedAtMs: Number(closedAtMs),
    realizedPnl,
    rMultiple: resolveRMultiple(entry),
    winLoss: resolveWinLoss(realizedPnl),
    accountKey: account.accountKey,
    accountLabel: account.accountLabel || null,
    accountId: account.accountId,
    accNum: account.accNum,
    realizedPnlSource: pnlSourceRaw || null,
    pnlSourceKind,
    dateKey: parts.dateKey,
    monthKey: parts.monthKey
  };
};

const resolveProfitFactor = (grossProfit: number, grossLoss: number) => {
  if (!Number.isFinite(grossProfit) || !Number.isFinite(grossLoss)) return null;
  if (grossLoss <= 0) return null;
  return grossProfit / grossLoss;
};

const normalizeRequestedAccountKey = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.toLowerCase();
};

const isSameAccount = (
  trade: NormalizedCalendarPnlTrade,
  requestedAccountKey: string,
  requestedAccountId: number | null,
  requestedAccNum: number | null
) => {
  if (requestedAccountKey) {
    if (requestedAccountKey === 'unassigned') return !trade.accountKey;
    return normalizeRequestedAccountKey(trade.accountKey) === requestedAccountKey;
  }
  if (requestedAccountId != null) {
    if (trade.accountId !== requestedAccountId) return false;
    if (requestedAccNum != null && trade.accNum !== requestedAccNum) return false;
    return true;
  }
  if (requestedAccNum != null) return trade.accNum === requestedAccNum;
  return true;
};

const buildSourceSummary = (trades: NormalizedCalendarPnlTrade[]): CalendarPnlSourceSummary => {
  const summary: CalendarPnlSourceSummary = {
    ledgerTrades: 0,
    brokerTrades: 0,
    unknownTrades: 0,
    ledgerNetPnl: 0,
    brokerNetPnl: 0,
    unknownNetPnl: 0
  };

  for (const trade of trades) {
    if (trade.pnlSourceKind === 'broker') {
      summary.brokerTrades += 1;
      summary.brokerNetPnl += trade.realizedPnl;
      continue;
    }
    if (trade.pnlSourceKind === 'ledger') {
      summary.ledgerTrades += 1;
      summary.ledgerNetPnl += trade.realizedPnl;
      continue;
    }
    summary.unknownTrades += 1;
    summary.unknownNetPnl += trade.realizedPnl;
  }

  return summary;
};

const buildAccountView = (trades: NormalizedCalendarPnlTrade[]) => {
  const rollups = new Map<string, {
    key: string;
    label: string;
    broker: string | null;
    accountId: number | null;
    accNum: number | null;
    netPnl: number;
    tradeCount: number;
    wins: number;
    losses: number;
    activeDays: Set<string>;
  }>();

  for (const trade of trades) {
    const key = trade.accountKey || 'unassigned';
    const existing = rollups.get(key);
    if (!existing) {
      rollups.set(key, {
        key,
        label: trade.accountLabel || (key === 'unassigned' ? 'Unassigned' : key),
        broker: trade.broker || null,
        accountId: trade.accountId ?? null,
        accNum: trade.accNum ?? null,
        netPnl: trade.realizedPnl,
        tradeCount: 1,
        wins: trade.realizedPnl > 0 ? 1 : 0,
        losses: trade.realizedPnl < 0 ? 1 : 0,
        activeDays: new Set([trade.dateKey])
      });
      continue;
    }
    existing.netPnl += trade.realizedPnl;
    existing.tradeCount += 1;
    if (trade.realizedPnl > 0) existing.wins += 1;
    if (trade.realizedPnl < 0) existing.losses += 1;
    existing.activeDays.add(trade.dateKey);
  }

  const accountSummaries: CalendarPnlAccountSummary[] = Array.from(rollups.values())
    .map((row) => {
      const denominator = row.wins + row.losses;
      return {
        accountKey: row.key,
        label: row.label,
        broker: row.broker,
        accountId: row.accountId,
        accNum: row.accNum,
        netPnl: row.netPnl,
        tradeCount: row.tradeCount,
        wins: row.wins,
        losses: row.losses,
        winRate: denominator > 0 ? row.wins / denominator : null,
        activeDays: row.activeDays.size
      };
    })
    .sort((a, b) => {
      const absDelta = Math.abs(b.netPnl) - Math.abs(a.netPnl);
      if (Math.abs(absDelta) > 1e-9) return absDelta;
      return b.tradeCount - a.tradeCount;
    });

  const availableAccounts: CalendarPnlAccountOption[] = accountSummaries.map((row) => ({
    accountKey: row.accountKey,
    label: row.label,
    broker: row.broker,
    accountId: row.accountId,
    accNum: row.accNum
  }));

  return {
    accountSummaries,
    availableAccounts
  };
};

const buildAccountOverlaysByDate = (trades: NormalizedCalendarPnlTrade[]) => {
  const byDate = new Map<string, Map<string, CalendarPnlDayAccountOverlay>>();

  for (const trade of trades) {
    const dateMap = byDate.get(trade.dateKey) ?? new Map<string, CalendarPnlDayAccountOverlay>();
    const accountKey = trade.accountKey || 'unassigned';
    const current = dateMap.get(accountKey);
    if (!current) {
      dateMap.set(accountKey, {
        accountKey,
        label: trade.accountLabel || (accountKey === 'unassigned' ? 'Unassigned' : accountKey),
        broker: trade.broker || null,
        netPnl: trade.realizedPnl,
        tradeCount: 1,
        wins: trade.realizedPnl > 0 ? 1 : 0,
        losses: trade.realizedPnl < 0 ? 1 : 0
      });
    } else {
      current.netPnl += trade.realizedPnl;
      current.tradeCount += 1;
      if (trade.realizedPnl > 0) current.wins += 1;
      if (trade.realizedPnl < 0) current.losses += 1;
    }
    byDate.set(trade.dateKey, dateMap);
  }

  const result: Record<string, CalendarPnlDayAccountOverlay[]> = {};
  for (const [dateKey, overlayMap] of byDate.entries()) {
    result[dateKey] = Array.from(overlayMap.values()).sort((a, b) => {
      const absDelta = Math.abs(b.netPnl) - Math.abs(a.netPnl);
      if (Math.abs(absDelta) > 1e-9) return absDelta;
      return b.tradeCount - a.tradeCount;
    });
  }
  return result;
};

export const buildCalendarPnlSnapshot = (input: CalendarPnlEngineInput): CalendarPnlSnapshot => {
  const timezone = String(input?.timezone || 'UTC').trim() || 'UTC';
  const monthKey = normalizeCalendarMonthKey(input?.monthKey, timezone);
  const symbolFilter = normalizeFilterValue(input?.symbol);
  const agentFilter = normalizeFilterValue(input?.agentId);
  const brokerFilter = normalizeFilterValue(input?.broker);
  const requestedAccountKey = normalizeRequestedAccountKey(input?.accountKey);
  const requestedAccountId = safeInteger(input?.accountId);
  const requestedAccNum = safeInteger(input?.accNum);

  const allTrades = (Array.isArray(input?.entries) ? input.entries : [])
    .map((entry) => normalizeTrade(entry, timezone))
    .filter(Boolean) as NormalizedCalendarPnlTrade[];

  const monthScopedTrades = allTrades.filter((trade) => {
    if (trade.monthKey !== monthKey) return false;
    if (symbolFilter && normalizeFilterValue(trade.symbol) !== symbolFilter) return false;
    if (agentFilter && normalizeFilterValue(trade.agentId) !== agentFilter) return false;
    if (brokerFilter && normalizeFilterValue(trade.broker) !== brokerFilter) return false;
    return true;
  });

  const { accountSummaries, availableAccounts } = buildAccountView(monthScopedTrades);
  const accountOverlaysByDate = buildAccountOverlaysByDate(monthScopedTrades);

  const filteredTrades = monthScopedTrades.filter((trade) =>
    isSameAccount(trade, requestedAccountKey, requestedAccountId, requestedAccNum)
  );

  const byDate = new Map<
    string,
    {
      dateKey: string;
      dayOfMonth: number;
      trades: NormalizedCalendarPnlTrade[];
      wins: number;
      losses: number;
      netPnl: number;
      grossProfit: number;
      grossLoss: number;
      bySymbol: Map<string, number>;
    }
  >();

  let netPnl = 0;
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sumWins = 0;
  let sumLosses = 0;
  let winCount = 0;
  let lossCount = 0;

  for (const trade of filteredTrades) {
    netPnl += trade.realizedPnl;
    if (trade.realizedPnl > 0) {
      wins += 1;
      grossProfit += trade.realizedPnl;
      sumWins += trade.realizedPnl;
      winCount += 1;
    } else if (trade.realizedPnl < 0) {
      losses += 1;
      grossLoss += Math.abs(trade.realizedPnl);
      sumLosses += trade.realizedPnl;
      lossCount += 1;
    }

    const existing = byDate.get(trade.dateKey);
    const dayOfMonth = Number(String(trade.dateKey).slice(-2));
    if (!existing) {
      byDate.set(trade.dateKey, {
        dateKey: trade.dateKey,
        dayOfMonth: Number.isFinite(dayOfMonth) ? dayOfMonth : 0,
        trades: [trade],
        wins: trade.realizedPnl > 0 ? 1 : 0,
        losses: trade.realizedPnl < 0 ? 1 : 0,
        netPnl: trade.realizedPnl,
        grossProfit: trade.realizedPnl > 0 ? trade.realizedPnl : 0,
        grossLoss: trade.realizedPnl < 0 ? Math.abs(trade.realizedPnl) : 0,
        bySymbol: new Map(trade.symbol ? [[trade.symbol, 1]] : [])
      });
      continue;
    }
    existing.trades.push(trade);
    existing.netPnl += trade.realizedPnl;
    if (trade.realizedPnl > 0) {
      existing.wins += 1;
      existing.grossProfit += trade.realizedPnl;
    } else if (trade.realizedPnl < 0) {
      existing.losses += 1;
      existing.grossLoss += Math.abs(trade.realizedPnl);
    }
    if (trade.symbol) {
      existing.bySymbol.set(trade.symbol, (existing.bySymbol.get(trade.symbol) || 0) + 1);
    }
  }

  const dateKeys = Array.from(byDate.keys()).sort();
  const cells: CalendarPnlDayCell[] = dateKeys.map((dateKey) => {
    const day = byDate.get(dateKey)!;
    const topSymbol = Array.from(day.bySymbol.entries()).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? null;
    const winRateDenominator = day.wins + day.losses;
    return {
      dateKey,
      dayOfMonth: day.dayOfMonth,
      tradeCount: day.trades.length,
      wins: day.wins,
      losses: day.losses,
      netPnl: day.netPnl,
      grossProfit: day.grossProfit,
      grossLoss: day.grossLoss,
      winRate: winRateDenominator > 0 ? day.wins / winRateDenominator : null,
      profitFactor: resolveProfitFactor(day.grossProfit, day.grossLoss),
      topSymbol
    };
  });

  const tradesByDate: Record<string, CalendarPnlTrade[]> = {};
  for (const cell of cells) {
    const day = byDate.get(cell.dateKey);
    if (!day) continue;
    tradesByDate[cell.dateKey] = day.trades
      .map((trade) => ({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        broker: trade.broker,
        agentId: trade.agentId,
        closedAtMs: trade.closedAtMs,
        realizedPnl: trade.realizedPnl,
        rMultiple: trade.rMultiple,
        winLoss: trade.winLoss,
        accountKey: trade.accountKey,
        accountLabel: trade.accountLabel,
        accountId: trade.accountId,
        accNum: trade.accNum,
        realizedPnlSource: trade.realizedPnlSource,
        pnlSourceKind: trade.pnlSourceKind
      }))
      .sort((a, b) => b.closedAtMs - a.closedAtMs);
  }

  const bestDayPnl = cells.length > 0 ? Math.max(...cells.map((item) => item.netPnl)) : null;
  const worstDayPnl = cells.length > 0 ? Math.min(...cells.map((item) => item.netPnl)) : null;
  const winRateDenominator = wins + losses;

  const monthSummary: CalendarPnlMonthSummary = {
    monthKey,
    netPnl,
    tradeCount: filteredTrades.length,
    wins,
    losses,
    winRate: winRateDenominator > 0 ? wins / winRateDenominator : null,
    profitFactor: resolveProfitFactor(grossProfit, grossLoss),
    bestDayPnl,
    worstDayPnl,
    activeDays: cells.length
  };

  const kpis: CalendarPnlKpis = {
    netPnl,
    accountBalance: safeNumber(input?.accountBalance),
    accountEquity: safeNumber(input?.accountEquity),
    profitFactor: monthSummary.profitFactor,
    winRate: monthSummary.winRate,
    avgWin: winCount > 0 ? sumWins / winCount : null,
    avgLoss: lossCount > 0 ? sumLosses / lossCount : null
  };

  const sourceSummary = buildSourceSummary(filteredTrades);

  return {
    timezone,
    monthKey,
    selectedAccountKey: requestedAccountKey || null,
    kpis,
    monthSummary,
    cells,
    tradesByDate,
    availableAccounts,
    accountSummaries,
    accountOverlaysByDate,
    sourceSummary
  };
};
