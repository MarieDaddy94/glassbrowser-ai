import React from 'react';
import { dispatchGlassEvent, GLASS_EVENT } from '../../services/glassEvents';

type TelegramQtySpec = { mode: 'fraction' | 'absolute'; value: number };

type TelegramPendingAction = {
  id: string;
  kind: 'signal_execute' | 'signal_reject' | 'signal_cancel' | 'manage_positions';
  createdAtMs: number;
  expiresAtMs: number;
  chatId: string;
  summary: string;
  payload: {
    entryId?: string;
    forceBroker?: string | null;
    broker?: 'mt5' | 'tradelocker';
    requestedSymbol?: string | null;
    isBreakeven?: boolean;
    qtySpec?: TelegramQtySpec | null;
    accountHint?: string | null;
  };
};

type UseTelegramCommandHelpersArgs = {
  addNotification: (title: string, message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  signalTelegramBotToken: string;
  signalTelegramChatId: string;
  telegramAlertsActive: boolean;
  signalTelegramEnabled: boolean;
  signalTelegramAllowStatus: boolean;
  signalTelegramAllowManage: boolean;
  signalTelegramCommandMode: 'read' | 'manage';
  signalTelegramConfirmationsEnabled: boolean;
  signalTelegramConfirmationTimeoutSec: number;
  signalEntries: any[];
  signalEntriesRef: React.MutableRefObject<any[]>;
  signalStatusReportsBySignalId: Record<string, any[]>;
  signalStatusReportTelegramSentRef: React.MutableRefObject<Map<string, { reportId: string; verdict: string; sentAtMs: number }>>;
  signalTelegramAlertSentRef: React.MutableRefObject<Map<string, Set<string>>>;
  signalSymbols: string[];
  brokerWatchSymbols: string[];
  patternSymbols: string[];
  symbolScopeSymbol: string;
  activeBrokerSymbol: string;
  brokerLinkConfig: any;
  normalizeSymbolKeyShared: (value: string) => string;
  buildSymbolKeyVariantsShared: (value: string) => string[];
  formatTimeframeLabel: (timeframe?: string | null) => string;
  buildSignalStatusReportTelegramText: (entry: any, report: any) => string;
  executeSignalTrade: (signalId: string, source?: string, entry?: any, opts?: any) => Promise<any>;
  rejectSignalEntry: (signalId: string, reason?: string) => Promise<any>;
  cancelSignalOrder: (signalId: string) => Promise<any>;
  appendAuditEvent: (entry: any) => Promise<any> | void;
  executeBrokerActionViaApi: (action: any) => Promise<any>;
  fetchMt5: (path: string, options?: any) => Promise<any>;
  tlPositionsRef: React.MutableRefObject<any[]>;
  telegramPendingActionsRef: React.MutableRefObject<Map<string, TelegramPendingAction>>;
  telegramPendingCleanupAtRef: React.MutableRefObject<number>;
};

type UseTelegramCommandHelpersResult = {
  parseTelegramChatIds: (raw: string) => string[];
  sendTelegramText: (text: string, chatIdOverride?: string, opts?: { replyMarkup?: any }) => Promise<any>;
  sendTelegramPhoto: (dataUrl: string, caption?: string, chatIdOverride?: string) => Promise<any>;
  answerTelegramCallback: (callbackId: string, text?: string) => Promise<any>;
  sendTelegramAlert: (title: string, message: string, chatIdOverride?: string) => Promise<any>;
  parseTelegramSymbol: (text: string) => string;
  parseTelegramTimeframe: (text: string) => string;
  parseTelegramBroker: (text: string) => 'mt5' | 'tradelocker' | null;
  parseTelegramAccountHint: (text: string) => string;
  parseTelegramQtySpec: (text: string) => TelegramQtySpec | null;
  fetchTelegramNewsSnapshot: (symbol: string) => Promise<any>;
  formatTelegramNewsTone: (tone?: string | null, toneScore?: number | null) => string;
  formatTelegramSignalLine: (entry: any) => string;
  resolveTelegramSignalEntry: (token: string) => any | null;
  resolveTelegramPendingAction: (id: string) => TelegramPendingAction | null;
  queueTelegramConfirmation: (input: {
    chatId: string;
    summary: string;
    kind: TelegramPendingAction['kind'];
    payload: TelegramPendingAction['payload'];
  }) => Promise<{ ok: boolean; skipped?: boolean; id?: string }>;
  runTelegramSignalAction: (input: {
    type: 'execute' | 'reject' | 'cancel';
    entry: any;
    chatId: string;
    forceBroker?: string | null;
  }) => Promise<void>;
  runTelegramManageAction: (input: {
    chatId: string;
    broker: 'mt5' | 'tradelocker';
    requestedSymbol?: string | null;
    isBreakeven?: boolean;
    qtySpec?: TelegramQtySpec | null;
    accountHint?: string | null;
  }) => Promise<void>;
  executeTelegramPendingAction: (pending: TelegramPendingAction) => Promise<void>;
};

export const useTelegramCommandHelpers = (args: UseTelegramCommandHelpersArgs): UseTelegramCommandHelpersResult => {
  const {
    addNotification,
    signalTelegramBotToken,
    signalTelegramChatId,
    telegramAlertsActive,
    signalTelegramEnabled,
    signalTelegramAllowStatus,
    signalTelegramAllowManage,
    signalTelegramCommandMode,
    signalTelegramConfirmationsEnabled,
    signalTelegramConfirmationTimeoutSec,
    signalEntries,
    signalEntriesRef,
    signalStatusReportsBySignalId,
    signalStatusReportTelegramSentRef,
    signalTelegramAlertSentRef,
    signalSymbols,
    brokerWatchSymbols,
    patternSymbols,
    symbolScopeSymbol,
    activeBrokerSymbol,
    brokerLinkConfig,
    normalizeSymbolKeyShared,
    buildSymbolKeyVariantsShared,
    formatTimeframeLabel,
    buildSignalStatusReportTelegramText,
    executeSignalTrade,
    rejectSignalEntry,
    cancelSignalOrder,
    appendAuditEvent,
    executeBrokerActionViaApi,
    fetchMt5,
    tlPositionsRef,
    telegramPendingActionsRef,
    telegramPendingCleanupAtRef
  } = args;

  const parseTelegramChatIds = React.useCallback((raw: string) => {
    const text = String(raw || '').trim();
    if (!text) return [] as string[];
    return text.split(/[,\s]+/g).map((entry) => entry.trim()).filter(Boolean);
  }, []);

  const sendTelegramText = React.useCallback(async (text: string, chatIdOverride?: string, opts?: { replyMarkup?: any }) => {
    const sender = window.glass?.telegram?.sendMessage;
    if (!sender) return { ok: false, error: 'Telegram relay unavailable.' };
    const chatId = String(chatIdOverride || signalTelegramChatId || '').trim();
    const clean = String(text || '').trim();
    if (!signalTelegramBotToken || !chatId || !clean) {
      return { ok: false, error: 'Telegram bot token, chat id, and text are required.' };
    }
    const res = await sender({ botToken: signalTelegramBotToken, chatId, text: clean, replyMarkup: opts?.replyMarkup });
    if (!res?.ok) {
      const err = res?.error ? String(res.error) : 'Telegram send failed.';
      addNotification('Telegram Relay', err, 'error');
    }
    return res;
  }, [addNotification, signalTelegramBotToken, signalTelegramChatId]);

  const sendTelegramPhoto = React.useCallback(async (dataUrl: string, caption?: string, chatIdOverride?: string) => {
    const sender = window.glass?.telegram?.sendPhoto;
    if (!sender) return { ok: false, error: 'Telegram relay unavailable.' };
    const chatId = String(chatIdOverride || signalTelegramChatId || '').trim();
    const clean = String(dataUrl || '').trim();
    if (!signalTelegramBotToken || !chatId || !clean) {
      return { ok: false, error: 'Telegram bot token, chat id, and image are required.' };
    }
    const res = await sender({ botToken: signalTelegramBotToken, chatId, dataUrl: clean, caption });
    if (!res?.ok) {
      const err = res?.error ? String(res.error) : 'Telegram send failed.';
      addNotification('Telegram Relay', err, 'error');
    }
    return res;
  }, [addNotification, signalTelegramBotToken, signalTelegramChatId]);

  const answerTelegramCallback = React.useCallback(async (callbackId: string, text?: string) => {
    const responder = window.glass?.telegram?.answerCallback;
    if (!responder) return { ok: false, error: 'Telegram callback unavailable.' };
    const clean = String(text || '').trim();
    if (!signalTelegramBotToken || !callbackId) {
      return { ok: false, error: 'Telegram bot token and callback id are required.' };
    }
    return responder({ botToken: signalTelegramBotToken, callbackId, text: clean || undefined });
  }, [signalTelegramBotToken]);

  const sendTelegramAlert = React.useCallback(async (title: string, message: string, chatIdOverride?: string) => {
    if (!telegramAlertsActive) return { ok: false, skipped: true };
    const header = String(title || '').trim();
    const body = String(message || '').trim();
    const text = header ? [header, body].filter(Boolean).join('\n') : body;
    if (!text) return { ok: false, error: 'Alert payload empty.' };
    return sendTelegramText(text, chatIdOverride);
  }, [sendTelegramText, telegramAlertsActive]);

  React.useEffect(() => {
    if (!signalTelegramEnabled || !signalTelegramBotToken || !signalTelegramChatId) return;
    if (!signalTelegramAllowStatus) return;
    const sentMap = signalStatusReportTelegramSentRef.current;
    const entriesById = new Map((Array.isArray(signalEntries) ? signalEntries : []).map((entry) => [String(entry.id || ''), entry]));
    const now = Date.now();

    for (const [signalId, reports] of Object.entries(signalStatusReportsBySignalId || {})) {
      const latest = Array.isArray(reports) && reports.length > 0 ? reports[0] : null;
      if (!latest) continue;
      const reportId = String(latest.id || '').trim();
      if (!reportId) continue;
      const verdict = String(latest.verdict || '').trim().toLowerCase();
      const previous = sentMap.get(signalId);
      if (previous?.reportId === reportId) continue;

      if (
        latest.source === 'chart_update' &&
        previous &&
        previous.verdict === verdict &&
        now - previous.sentAtMs < 60_000
      ) {
        sentMap.set(signalId, { reportId, verdict, sentAtMs: previous.sentAtMs });
        continue;
      }

      const signalEntry = entriesById.get(signalId);
      if (!signalEntry) {
        sentMap.set(signalId, { reportId, verdict, sentAtMs: now });
        continue;
      }

      const message = buildSignalStatusReportTelegramText(signalEntry, latest);
      if (!message) {
        sentMap.set(signalId, { reportId, verdict, sentAtMs: now });
        continue;
      }

      sentMap.set(signalId, { reportId, verdict, sentAtMs: now });
      void sendTelegramText(message).catch(() => null);
    }
  }, [
    buildSignalStatusReportTelegramText,
    sendTelegramText,
    signalEntries,
    signalStatusReportsBySignalId,
    signalTelegramAllowStatus,
    signalTelegramBotToken,
    signalTelegramChatId,
    signalTelegramEnabled,
    signalStatusReportTelegramSentRef
  ]);

  const telegramSymbolCandidates = React.useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    const push = (value: any) => {
      const sym = String(value || '').trim();
      if (!sym) return;
      const key = normalizeSymbolKeyShared(sym);
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(sym);
    };
    push(symbolScopeSymbol);
    push(activeBrokerSymbol);
    signalSymbols.forEach(push);
    brokerWatchSymbols.forEach(push);
    patternSymbols.forEach(push);
    const map = brokerLinkConfig?.symbolMap || [];
    for (const entry of map) {
      if (!entry) continue;
      push(entry.canonical);
      push(entry.mt5);
      push(entry.tradelocker);
    }
    return list;
  }, [activeBrokerSymbol, brokerLinkConfig, brokerWatchSymbols, patternSymbols, signalSymbols, symbolScopeSymbol, normalizeSymbolKeyShared]);

  const parseTelegramSymbol = React.useCallback((text: string) => {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();
    const lower = raw.toLowerCase();
    const aliasMap: Array<{ keys: string[]; symbol: string }> = [
      { keys: ['gold', 'xau'], symbol: 'XAUUSD' },
      { keys: ['nas100', 'nas', 'us100'], symbol: 'NAS100' },
      { keys: ['us30', 'dow', 'dj30'], symbol: 'US30' },
      { keys: ['btc', 'bitcoin'], symbol: 'BTCUSD' }
    ];
    for (const alias of aliasMap) {
      if (alias.keys.some((key) => lower.includes(key))) return alias.symbol;
    }
    for (const candidate of telegramSymbolCandidates) {
      const variants = buildSymbolKeyVariantsShared(candidate).map((v) => String(v).toUpperCase());
      if (variants.some((v) => v && upper.includes(v))) return candidate;
    }
    const tokenMatch = upper.match(/\b[A-Z]{2,6}[A-Z0-9]{0,6}(?:\.[A-Z0-9]+)?\b/);
    return tokenMatch ? tokenMatch[0] : '';
  }, [buildSymbolKeyVariantsShared, telegramSymbolCandidates]);

  const parseTelegramTimeframe = React.useCallback((text: string) => {
    const raw = String(text || '');
    if (!raw) return '';
    const lower = raw.toLowerCase();
    const direct = lower.match(/\b(\d+)\s*(m|h|d|w)\b/);
    if (direct) return `${direct[1]}${direct[2]}`.toUpperCase();
    const swapped = lower.match(/\b(m|h|d|w)\s*(\d+)\b/);
    if (swapped) return `${swapped[2]}${swapped[1]}`.toUpperCase();
    const hr = lower.match(/\b(\d+)\s*(hr|hrs|hour|hours)\b/);
    if (hr) return `${hr[1]}H`;
    const min = lower.match(/\b(\d+)\s*(min|mins|minute|minutes)\b/);
    if (min) return `${min[1]}M`;
    return '';
  }, []);

  const parseTelegramBroker = React.useCallback((text: string) => {
    const lower = String(text || '').toLowerCase();
    if (/\btradelocker\b|\btrade locker\b|\blocker\b|\btl\b/.test(lower)) {
      return 'tradelocker' as const;
    }
    if (lower.includes('mt5') || lower.includes('metatrader') || lower.includes('meta trader')) {
      return 'mt5' as const;
    }
    return null;
  }, []);

  const parseTelegramAccountHint = React.useCallback((text: string) => {
    const lower = String(text || '').toLowerCase();
    const match = lower.match(/\b(?:acct|account)\s*[:=]\s*([a-z0-9_-]+)/i);
    if (match && match[1]) return match[1];
    const hashMatch = lower.match(/#(\d{2,})/);
    if (hashMatch && hashMatch[1]) return hashMatch[1];
    return '';
  }, []);

  const parseTelegramQtySpec = React.useCallback((text: string): TelegramQtySpec | null => {
    const lower = String(text || '').toLowerCase();
    if (lower.includes('half')) return { mode: 'fraction' as const, value: 0.5 };
    if (lower.includes('quarter')) return { mode: 'fraction' as const, value: 0.25 };
    const pct = lower.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pct) {
      const value = Number(pct[1]) / 100;
      return Number.isFinite(value) ? { mode: 'fraction' as const, value } : null;
    }
    const lots = lower.match(/(\d+(?:\.\d+)?)\s*(lot|lots)\b/);
    if (lots) {
      const value = Number(lots[1]);
      return Number.isFinite(value) ? { mode: 'absolute' as const, value } : null;
    }
    const raw = lower.match(/\bclose\s+(\d+(?:\.\d+)?)\b/);
    if (raw) {
      const value = Number(raw[1]);
      return Number.isFinite(value) ? { mode: 'absolute' as const, value } : null;
    }
    return null;
  }, []);

  const fetchTelegramNewsSnapshot = React.useCallback(async (symbol: string) => {
    const api = window.glass?.news;
    if (!api?.getSnapshot) return null;
    try {
      const res = await api.getSnapshot({ symbol, limit: 6, force: false });
      if (!res?.ok) return null;
      return (res.snapshot || null) as any | null;
    } catch {
      return null;
    }
  }, []);

  const formatTelegramNewsTone = React.useCallback((tone?: string | null, toneScore?: number | null) => {
    const label = String(tone || '').trim().toUpperCase();
    if (!label) return '';
    const score = Number.isFinite(Number(toneScore)) ? Number(toneScore) : null;
    const scoreLabel = score != null && score !== 0 ? ` ${score > 0 ? '+' : ''}${score}` : '';
    return `${label}${scoreLabel}`;
  }, []);

  const formatTelegramSignalLine = React.useCallback((entry: any) => {
    const idShort = entry.id ? entry.id.slice(-6) : '';
    const tf = entry.timeframe ? formatTimeframeLabel(entry.timeframe) : '';
    const prob = Number.isFinite(Number(entry.probability)) ? Math.round(Number(entry.probability)) : null;
    const parts = [idShort, entry.action, entry.symbol, tf].filter(Boolean);
    if (prob != null) parts.push(`p${prob}`);
    parts.push(entry.status || 'PROPOSED');
    return parts.join(' ');
  }, [formatTimeframeLabel]);

  const resolveTelegramSignalEntry = React.useCallback((token: string) => {
    const cleaned = String(token || '').trim();
    const entries = Array.isArray(signalEntriesRef.current) ? signalEntriesRef.current : [];
    const ordered = entries.slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if (!cleaned) return ordered[0] || null;
    const exact = ordered.find((entry) => entry.id === cleaned);
    if (exact) return exact;
    const lower = cleaned.toLowerCase();
    const byPrefix = ordered.find((entry) => entry.id.toLowerCase().startsWith(lower));
    if (byPrefix) return byPrefix;
    const bySuffix = ordered.find((entry) => entry.id.toLowerCase().endsWith(lower));
    if (bySuffix) return bySuffix;
    const symbolKey = normalizeSymbolKeyShared(cleaned);
    if (symbolKey) {
      const bySymbol = ordered.find((entry) => normalizeSymbolKeyShared(entry.symbol) === symbolKey);
      if (bySymbol) return bySymbol;
    }
    return null;
  }, [normalizeSymbolKeyShared, signalEntriesRef]);

  const pruneTelegramPendingActions = React.useCallback(() => {
    const now = Date.now();
    if (now - telegramPendingCleanupAtRef.current < 3000) return;
    telegramPendingCleanupAtRef.current = now;
    const map = telegramPendingActionsRef.current;
    for (const [id, action] of map.entries()) {
      if (action.expiresAtMs <= now) map.delete(id);
    }
  }, [telegramPendingActionsRef, telegramPendingCleanupAtRef]);

  const resolveTelegramPendingAction = React.useCallback((id: string) => {
    const key = String(id || '').trim();
    if (!key) return null;
    pruneTelegramPendingActions();
    const pending = telegramPendingActionsRef.current.get(key) || null;
    if (!pending) return null;
    if (pending.expiresAtMs <= Date.now()) {
      telegramPendingActionsRef.current.delete(key);
      return null;
    }
    return pending;
  }, [pruneTelegramPendingActions, telegramPendingActionsRef]);

  const queueTelegramConfirmation = React.useCallback(async (input: {
    chatId: string;
    summary: string;
    kind: TelegramPendingAction['kind'];
    payload: TelegramPendingAction['payload'];
  }) => {
    if (!signalTelegramConfirmationsEnabled) return { ok: false, skipped: true };
    const now = Date.now();
    pruneTelegramPendingActions();
    const id = `tg_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const expiresAtMs = now + signalTelegramConfirmationTimeoutSec * 1000;
    const pending: TelegramPendingAction = {
      id,
      kind: input.kind,
      payload: input.payload,
      createdAtMs: now,
      expiresAtMs,
      chatId: input.chatId,
      summary: input.summary
    };
    telegramPendingActionsRef.current.set(id, pending);
    const ttlSec = Math.max(0, Math.round((expiresAtMs - now) / 1000));
    await sendTelegramText(`Confirm: ${input.summary}\nExpires in ${ttlSec}s.`, input.chatId, {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'Confirm', callback_data: `confirm:${id}` },
            { text: 'Cancel', callback_data: `cancel:${id}` }
          ]
        ]
      }
    });
    return { ok: true, id };
  }, [pruneTelegramPendingActions, sendTelegramText, signalTelegramConfirmationTimeoutSec, signalTelegramConfirmationsEnabled, telegramPendingActionsRef]);

  const runTelegramSignalAction = React.useCallback(async (input: {
    type: 'execute' | 'reject' | 'cancel';
    entry: any;
    chatId: string;
    forceBroker?: string | null;
  }) => {
    const entry = input.entry;
    const idLabel = entry.id ? entry.id.slice(-6) : '';
    const brokerLabel = input.forceBroker ? ` (${String(input.forceBroker).toUpperCase()})` : '';
    try {
      if (input.type === 'execute') {
        await executeSignalTrade(entry.id, 'manual', entry, { forceBroker: input.forceBroker ?? undefined });
        await sendTelegramText(`Execution requested${brokerLabel}: ${entry.action} ${entry.symbol} ${idLabel}`.trim(), input.chatId);
      } else if (input.type === 'reject') {
        await rejectSignalEntry(entry.id);
        await sendTelegramText(`Rejected signal ${idLabel}.`, input.chatId);
      } else {
        await cancelSignalOrder(entry.id);
        await sendTelegramText(`Cancel requested for ${idLabel}.`, input.chatId);
      }
      void appendAuditEvent({
        eventType: 'telegram_action',
        symbol: entry.symbol,
        payload: {
          action: input.type,
          signalId: entry.id,
          broker: input.forceBroker || null,
          chatId: input.chatId
        }
      });
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : 'Telegram action failed.';
      await sendTelegramText(msg, input.chatId);
    }
  }, [appendAuditEvent, cancelSignalOrder, executeSignalTrade, rejectSignalEntry, sendTelegramText]);

  const runTelegramManageAction = React.useCallback(async (input: {
    chatId: string;
    broker: 'mt5' | 'tradelocker';
    requestedSymbol?: string | null;
    isBreakeven?: boolean;
    qtySpec?: TelegramQtySpec | null;
    accountHint?: string | null;
  }) => {
    const chatId = input.chatId;
    const requestedSymbol = input.requestedSymbol || '';
    const qtySpec = input.qtySpec || null;
    void appendAuditEvent({
      eventType: 'telegram_action',
      symbol: requestedSymbol || null,
      payload: {
        action: input.isBreakeven ? 'breakeven' : 'close',
        broker: input.broker,
        chatId
      }
    });
    if (input.broker === 'tradelocker') {
      let positions = Array.isArray(tlPositionsRef.current) ? tlPositionsRef.current : [];
      const accountHint = input.accountHint ? String(input.accountHint).trim() : '';
      if (accountHint) {
        const api = window.glass?.tradelocker;
        if (!api?.getAccounts || !api?.setActiveAccount) {
          await sendTelegramText('TradeLocker account switching unavailable.', chatId);
          return;
        }
        const res = await api.getAccounts();
        const accounts = Array.isArray(res?.accounts) ? res.accounts : [];
        const match = accounts.find((acc) => {
          const id = acc?.id != null ? String(acc.id) : '';
          const accNum = acc?.accNum != null ? String(acc.accNum) : '';
          return id === accountHint || accNum === accountHint;
        });
        if (!match) {
          await sendTelegramText(`TradeLocker account ${accountHint} not found.`, chatId);
          return;
        }
        const switchRes = await api.setActiveAccount({ accountId: Number(match.id), accNum: Number(match.accNum) });
        if (switchRes?.ok === false) {
          await sendTelegramText(switchRes?.error ? String(switchRes.error) : 'Failed to switch TradeLocker account.', chatId);
          return;
        }
        try {
          dispatchGlassEvent(GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED, {
            accountId: Number(match.id),
            accNum: Number(match.accNum),
            source: 'telegram',
            atMs: Date.now()
          });
        } catch {
          // ignore renderer event dispatch failures
        }
        if (api?.getSnapshot) {
          const snapRes = await api.getSnapshot({ includeOrders: false });
          if (snapRes?.ok && Array.isArray(snapRes.positions)) {
            positions = snapRes.positions
              .map((p: any) => ({
                id: String(p?.id || ''),
                symbol: String(p?.symbol || ''),
                size: Number(p?.size),
                entryPrice: Number(p?.entryPrice)
              }))
              .filter((p: any) => p.id && p.symbol);
          }
        }
      }
      const matches = (symbol: string) => {
        if (!requestedSymbol) return true;
        const targetKey = normalizeSymbolKeyShared(requestedSymbol);
        const posKey = normalizeSymbolKeyShared(symbol);
        return targetKey && posKey === targetKey;
      };
      let targets = positions.filter((pos) => pos?.symbol && matches(String(pos.symbol)));
      if (!requestedSymbol && targets.length !== 1) {
        await sendTelegramText('Multiple TradeLocker positions open. Specify a symbol.', chatId);
        return;
      }
      if (targets.length === 0) {
        await sendTelegramText('No matching TradeLocker positions found.', chatId);
        return;
      }

      if (input.isBreakeven) {
        const results: Array<{ ok: boolean; error?: string }> = [];
        for (const entry of targets) {
          const entryPrice = Number(entry?.entryPrice);
          const positionId = entry?.id != null ? String(entry.id) : '';
          if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !positionId) {
            results.push({ ok: false, error: 'Missing entry price.' });
            continue;
          }
          const res = await executeBrokerActionViaApi({
            type: 'MODIFY_POSITION',
            positionId,
            stopLoss: entryPrice,
            source: 'telegram',
            reason: 'Telegram breakeven'
          });
          results.push({ ok: !!res?.ok, error: res?.error });
        }
        const okCount = results.filter((r) => r.ok).length;
        const failCount = results.length - okCount;
        await sendTelegramText(
          `TradeLocker breakeven: ${okCount}/${results.length} updated${failCount ? `, ${failCount} failed` : ''}.`,
          chatId
        );
        return;
      }

      const results: Array<{ ok: boolean; error?: string }> = [];
      for (const entry of targets) {
        const size = Number(entry?.size);
        let qty: number | null = null;
        if (qtySpec && Number.isFinite(size) && size > 0) {
          if (qtySpec.mode === 'fraction') {
            qty = Math.max(0, size * qtySpec.value);
          } else {
            qty = Math.max(0, qtySpec.value);
          }
          if (qty >= size) qty = null;
        }
        const res = await executeBrokerActionViaApi({
          type: 'CLOSE_POSITION',
          positionId: entry.id,
          qty: qty != null ? qty : undefined,
          source: 'telegram',
          reason: 'Telegram close'
        });
        results.push({ ok: !!res?.ok, error: res?.error });
      }
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      await sendTelegramText(
        `TradeLocker close: ${okCount}/${results.length} sent${failCount ? `, ${failCount} failed` : ''}.`,
        chatId
      );
      return;
    }

    const mt5PositionsRes = await fetchMt5('/positions');
    const mt5Positions = Array.isArray(mt5PositionsRes.data?.positions) ? mt5PositionsRes.data.positions : [];
    const matches = (symbol: string) => {
      if (!requestedSymbol) return true;
      const targetKey = normalizeSymbolKeyShared(requestedSymbol);
      const posKey = normalizeSymbolKeyShared(symbol);
      return targetKey && posKey === targetKey;
    };
    const targets = mt5Positions.filter((pos) => pos?.symbol && matches(String(pos.symbol)));
    if (!requestedSymbol && targets.length !== 1) {
      await sendTelegramText('Multiple MT5 positions open. Specify a symbol.', chatId);
      return;
    }
    if (targets.length === 0) {
      await sendTelegramText('No matching MT5 positions found.', chatId);
      return;
    }

    if (input.isBreakeven) {
      const results: Array<{ ok: boolean; error?: string }> = [];
      for (const pos of targets) {
        const entry = Number(pos?.price_open ?? pos?.price);
        if (!Number.isFinite(entry) || entry <= 0) {
          results.push({ ok: false, error: 'Missing entry price.' });
          continue;
        }
        const res = await fetchMt5('/position/modify', {
          method: 'POST',
          body: JSON.stringify({ position: pos?.ticket ?? pos?.position ?? pos?.id, sl: entry })
        });
        results.push({ ok: !!res?.ok, error: res?.error });
      }
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      await sendTelegramText(`MT5 breakeven: ${okCount}/${results.length} updated${failCount ? `, ${failCount} failed` : ''}.`, chatId);
      return;
    }

    const results: Array<{ ok: boolean; error?: string }> = [];
    for (const pos of targets) {
      const size = Number(pos?.volume);
      let volume: number | null = null;
      if (qtySpec && Number.isFinite(size) && size > 0) {
        if (qtySpec.mode === 'fraction') {
          volume = Math.max(0, size * qtySpec.value);
        } else {
          volume = Math.max(0, qtySpec.value);
        }
        if (volume >= size) volume = null;
      }
      const payload: any = { position: pos?.ticket ?? pos?.position ?? pos?.id };
      if (volume != null && volume > 0) payload.volume = volume;
      const res = await fetchMt5('/position/close', { method: 'POST', body: JSON.stringify(payload) });
      results.push({ ok: !!res?.ok, error: res?.error });
    }
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    await sendTelegramText(`MT5 close: ${okCount}/${results.length} sent${failCount ? `, ${failCount} failed` : ''}.`, chatId);
  }, [appendAuditEvent, executeBrokerActionViaApi, fetchMt5, normalizeSymbolKeyShared, sendTelegramText, tlPositionsRef]);

  const executeTelegramPendingAction = React.useCallback(async (pending: TelegramPendingAction) => {
    const chatId = pending.chatId;
    if (pending.kind === 'manage_positions') {
      const broker = pending.payload.broker || 'mt5';
      await runTelegramManageAction({
        chatId,
        broker,
        requestedSymbol: pending.payload.requestedSymbol || null,
        isBreakeven: !!pending.payload.isBreakeven,
        qtySpec: pending.payload.qtySpec || null,
        accountHint: pending.payload.accountHint || null
      });
      return;
    }

    const entryId = pending.payload.entryId || '';
    const entry = resolveTelegramSignalEntry(entryId);
    if (!entry) {
      await sendTelegramText('Signal not found or expired.', chatId);
      return;
    }
    if (pending.kind === 'signal_execute') {
      await runTelegramSignalAction({
        type: 'execute',
        entry,
        chatId,
        forceBroker: pending.payload.forceBroker || null
      });
      return;
    }
    if (pending.kind === 'signal_reject') {
      await runTelegramSignalAction({ type: 'reject', entry, chatId });
      return;
    }
    if (pending.kind === 'signal_cancel') {
      await runTelegramSignalAction({ type: 'cancel', entry, chatId });
    }
  }, [resolveTelegramSignalEntry, runTelegramManageAction, runTelegramSignalAction, sendTelegramText]);

  return {
    parseTelegramChatIds,
    sendTelegramText,
    sendTelegramPhoto,
    answerTelegramCallback,
    sendTelegramAlert,
    parseTelegramSymbol,
    parseTelegramTimeframe,
    parseTelegramBroker,
    parseTelegramAccountHint,
    parseTelegramQtySpec,
    fetchTelegramNewsSnapshot,
    formatTelegramNewsTone,
    formatTelegramSignalLine,
    resolveTelegramSignalEntry,
    resolveTelegramPendingAction,
    queueTelegramConfirmation,
    runTelegramSignalAction,
    runTelegramManageAction,
    executeTelegramPendingAction
  };
};
