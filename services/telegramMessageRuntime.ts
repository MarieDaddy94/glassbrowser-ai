import { createMt5Adapter, createTradeLockerAdapter } from './brokerAdapters';
import { DEFAULT_BROKER_LINK_CONFIG } from './brokerLink';
import { resolveBrokerSymbol } from './brokerRouter';

type MutableRef<T> = { current: T };

type SignalEntryLike = {
  id: string;
  action: string;
  symbol: string;
  timeframe?: string;
  probability?: number;
  reason?: string;
  status?: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  [key: string]: any;
};

type TelegramMessageRuntimeInput = {
  update: any;
  allowedChatIds: Set<string>;
  signalTelegramCommandPassphrase: string;
  signalTelegramAllowManage: boolean;
  signalTelegramCommandMode: string;
  signalTelegramAllowStatus: boolean;
  signalTelegramAllowChart: boolean;
  signalTelegramConfirmationsEnabled: boolean;
  signalStatusSet: Set<string>;
  signalEntriesRef: MutableRef<SignalEntryLike[]>;
  tlStatus: string;
  tlPositionsRef: MutableRef<any[]>;
  tlOrdersRef: MutableRef<any[]>;
  tlEquity: any;
  tlBalance: any;
  symbolScopeSymbol: string;
  activeBrokerSymbol: string;
  signalPrimarySymbol: string;
  brokerLinkConfigRef: MutableRef<any>;
  setAutoPilotConfigRef: MutableRef<((updater: any) => void) | null>;
  autoPilotConfigRef: MutableRef<any>;
  setupWatchersRef: MutableRef<any[]>;
  telegramWatcherResumeRef: MutableRef<Set<string>>;
  sendTelegramText: (text: string, chatId?: string, opts?: { replyMarkup?: any }) => Promise<any>;
  resolveTelegramSignalEntry: (token: string) => SignalEntryLike | null | undefined;
  formatTelegramSignalLine: (entry: SignalEntryLike) => string;
  formatTimeframeLabel: (tf: any) => string;
  buildTelegramSignalInlineActions: (entry: SignalEntryLike, status: string) => any;
  buildTelegramDigest: (days: number, label: string) => Promise<string>;
  queueTelegramConfirmation: (input: {
    chatId: string;
    summary: string;
    kind: string;
    payload: Record<string, any>;
  }) => Promise<any>;
  runTelegramSignalAction: (input: {
    type: 'execute' | 'reject' | 'cancel';
    entry: SignalEntryLike;
    chatId: string;
    forceBroker?: any;
  }) => Promise<void>;
  runTelegramManageAction: (input: {
    chatId: string;
    broker: 'mt5' | 'tradelocker';
    requestedSymbol: string | null;
    isBreakeven: boolean;
    qtySpec: any;
    accountHint: string | null;
  }) => Promise<void>;
  updateSetupWatcher: (id: string, patch: Record<string, any>) => void;
  updateSymbolScope: (symbol: string, opts?: Record<string, any>) => void;
  parseTelegramSymbol: (text: string) => string;
  parseTelegramTimeframe: (text: string) => string | null;
  parseTelegramBroker: (text: string) => 'mt5' | 'tradelocker' | null;
  parseTelegramAccountHint: (text: string) => string | null;
  parseTelegramQtySpec: (text: string) => any;
  fetchMt5: (path: string, init?: RequestInit) => Promise<{ ok: boolean; data?: any }>;
  fetchTelegramNewsSnapshot: (symbol: string) => Promise<any>;
  formatTelegramNewsTone: (tone: any, score: any) => string;
  captureChartChatSnapshot: (runId: string, opts?: Record<string, any>) => Promise<any>;
  sendPlainTextToOpenAI: (input: {
    system?: string;
    user: string;
    imageAttachment?: { dataUrl: string; label?: string };
  }) => Promise<string>;
  sendTelegramPhoto: (imageDataUrl: string, caption: string, chatId?: string) => Promise<{ ok: boolean } | null | undefined>;
  resolveTradeLockerSymbolBestEffort: (symbol: string) => Promise<string>;
};

export async function runTelegramMessageRuntime(input: TelegramMessageRuntimeInput): Promise<{ handled: boolean }> {
  const msg = input.update?.message || input.update?.edited_message || input.update?.channel_post || input.update?.edited_channel_post;
  if (!msg || msg?.from?.is_bot) return { handled: false };

  const chatId = msg?.chat?.id != null ? String(msg.chat.id).trim() : '';
  if (!chatId) return { handled: true };
  if (input.allowedChatIds.size > 0 && !input.allowedChatIds.has(chatId)) return { handled: true };

  let text = String(msg.text || msg.caption || '').trim();
  if (!text) return { handled: true };

  let lower = text.toLowerCase();
  let tokens = text.split(/\s+/).filter(Boolean);
  let command = tokens[0] ? tokens[0].toLowerCase() : '';
  let args = tokens.slice(1);
  let argText = args.join(' ');
  let isCommand = command.startsWith('/');
  const helpRequested = lower.startsWith('/help') || lower === 'help';

  if (helpRequested) {
    await input.sendTelegramText(
      [
        'Commands:',
        '/status - account + positions summary',
        '/chart XAUUSD 1H - chart snapshot + summary',
        '/signals [n] [status] - recent signals',
        '/signal <id|symbol> - signal details',
        '/positions | /orders - broker lists',
        '/digest | /weekly - daily/weekly digest',
        '/execute <id> | /reject <id> | /cancel <id> (manage)',
        '/autopilot on|off | /risk 1.0 | /lot 0.1 | /scope XAUUSD | /watchers pause|resume',
        'Manage: "breakeven on XAUUSD" or "close half of US30"',
        'Add broker keyword: mt5 or tradelocker. Use acct=### for TradeLocker.'
      ].join('\n'),
      chatId
    );
    return { handled: true };
  }

  const passphrase = input.signalTelegramCommandPassphrase;
  let wantsManageText = !isCommand && /breakeven|break even|move stop|move sl|close\b/.test(lower);
  const manageCommands = new Set(['/execute', '/reject', '/cancel', '/autopilot', '/risk', '/lot', '/lotsize', '/scope', '/watchers']);
  let manageCommand = wantsManageText || manageCommands.has(command);

  if (manageCommand && passphrase) {
    const passLower = passphrase.toLowerCase();
    if (!lower.includes(passLower)) {
      await input.sendTelegramText('Passphrase required for manage commands.', chatId);
      return { handled: true };
    }
    tokens = tokens.filter((token) => token.toLowerCase() !== passLower);
    text = tokens.join(' ').trim();
    lower = text.toLowerCase();
    command = tokens[0] ? tokens[0].toLowerCase() : '';
    args = tokens.slice(1);
    argText = args.join(' ');
    isCommand = command.startsWith('/');
    wantsManageText = !isCommand && /breakeven|break even|move stop|move sl|close\b/.test(lower);
    manageCommand = wantsManageText || manageCommands.has(command);
  }

  const explicitStatus = command === '/status';
  const explicitChart = command === '/chart';
  const wantsStatus = explicitStatus || (!isCommand && /\bstatus\b|\bpnl\b|\bequity\b|how am i/.test(lower));
  const wantsChart = explicitChart || (!isCommand && /\bchart\b|\bsnapshot\b|how is|looking/.test(lower));
  const wantsManage = wantsManageText;

  if (command === '/signals') {
    if (!input.signalTelegramAllowStatus) {
      await input.sendTelegramText('Signal list is disabled.', chatId);
      return { handled: true };
    }
    const entries = Array.isArray(input.signalEntriesRef.current) ? input.signalEntriesRef.current : [];
    const ordered = entries.slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    let limit = 5;
    let statusFilter = '';
    for (const arg of args) {
      const num = Number(arg);
      if (!statusFilter && Number.isFinite(num)) {
        limit = Math.max(1, Math.min(10, Math.floor(num)));
        continue;
      }
      const status = String(arg || '').trim().toUpperCase();
      if (!statusFilter && input.signalStatusSet.has(status)) {
        statusFilter = status;
      }
    }
    const filtered = statusFilter
      ? ordered.filter((entry) => String(entry.status || '').toUpperCase() === statusFilter)
      : ordered;
    if (filtered.length === 0) {
      await input.sendTelegramText('No signals available.', chatId);
      return { handled: true };
    }
    const lines = filtered.slice(0, limit).map(input.formatTelegramSignalLine);
    const header = statusFilter ? `Signals (${statusFilter})` : 'Signals';
    await input.sendTelegramText(`${header}\n${lines.join('\n')}\nUse /signal <id> for details.`, chatId);
    return { handled: true };
  }

  if (command === '/signal') {
    if (!input.signalTelegramAllowStatus) {
      await input.sendTelegramText('Signal details are disabled.', chatId);
      return { handled: true };
    }
    const entry = input.resolveTelegramSignalEntry(argText);
    if (!entry) {
      await input.sendTelegramText('Signal not found. Use /signals to list.', chatId);
      return { handled: true };
    }
    const tf = entry.timeframe ? input.formatTimeframeLabel(entry.timeframe) : '';
    const prob = Number.isFinite(Number(entry.probability)) ? Math.round(Number(entry.probability)) : null;
    const reason = entry.reason ? String(entry.reason).slice(0, 420) : '';
    const lines = [
      `${entry.action} ${entry.symbol} ${tf}`.trim(),
      prob != null ? `Prob ${prob}% | ${entry.status}` : entry.status,
      `Entry ${entry.entryPrice} SL ${entry.stopLoss} TP ${entry.takeProfit}`,
      reason ? `Reason: ${reason}` : ''
    ].filter(Boolean);
    const replyMarkup = input.buildTelegramSignalInlineActions(entry, entry.status || 'PROPOSED');
    await input.sendTelegramText(lines.join('\n'), chatId, replyMarkup ? { replyMarkup } : undefined);
    return { handled: true };
  }

  if (command === '/digest' || command === '/daily') {
    if (!input.signalTelegramAllowStatus) {
      await input.sendTelegramText('Digest is disabled.', chatId);
      return { handled: true };
    }
    const digest = await input.buildTelegramDigest(1, 'Daily');
    await input.sendTelegramText(digest, chatId);
    return { handled: true };
  }

  if (command === '/weekly') {
    if (!input.signalTelegramAllowStatus) {
      await input.sendTelegramText('Digest is disabled.', chatId);
      return { handled: true };
    }
    const digest = await input.buildTelegramDigest(7, 'Weekly');
    await input.sendTelegramText(digest, chatId);
    return { handled: true };
  }

  if (command === '/autopilot') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const next = args[0] ? String(args[0]).toLowerCase() : '';
    const setter = input.setAutoPilotConfigRef.current;
    if (!setter) {
      await input.sendTelegramText('AutoPilot config unavailable.', chatId);
      return { handled: true };
    }
    if (!next || next === 'status') {
      const cfg = input.autoPilotConfigRef.current || {};
      await input.sendTelegramText(`AutoPilot ${cfg.enabled ? 'ON' : 'OFF'}${cfg.killSwitch ? ' (KILL)' : ''}.`, chatId);
      return { handled: true };
    }
    if (next === 'on' || next === 'enable') {
      setter((prev: any) => ({ ...prev, enabled: true, killSwitch: false }));
      await input.sendTelegramText('AutoPilot enabled.', chatId);
      return { handled: true };
    }
    if (next === 'off' || next === 'disable') {
      setter((prev: any) => ({ ...prev, enabled: false }));
      await input.sendTelegramText('AutoPilot disabled.', chatId);
      return { handled: true };
    }
    if (next === 'toggle') {
      setter((prev: any) => ({ ...prev, enabled: !prev?.enabled, killSwitch: prev?.enabled ? prev?.killSwitch : false }));
      await input.sendTelegramText('AutoPilot toggled.', chatId);
      return { handled: true };
    }
    await input.sendTelegramText('Usage: /autopilot on|off|status', chatId);
    return { handled: true };
  }

  if (command === '/risk') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const raw = Number(args[0] || argText);
    if (!Number.isFinite(raw)) {
      await input.sendTelegramText('Usage: /risk 1.0', chatId);
      return { handled: true };
    }
    const pct = Math.max(0.01, Math.min(100, raw));
    const setter = input.setAutoPilotConfigRef.current;
    if (!setter) {
      await input.sendTelegramText('AutoPilot config unavailable.', chatId);
      return { handled: true };
    }
    setter((prev: any) => ({ ...prev, riskPerTrade: pct }));
    await input.sendTelegramText(`Risk per trade set to ${pct}%.`, chatId);
    return { handled: true };
  }

  if (command === '/lot' || command === '/lotsize') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const raw = Number(args[0] || argText);
    if (!Number.isFinite(raw)) {
      await input.sendTelegramText('Usage: /lot 0.10', chatId);
      return { handled: true };
    }
    const size = Math.max(0.001, Math.min(100, raw));
    const setter = input.setAutoPilotConfigRef.current;
    if (!setter) {
      await input.sendTelegramText('AutoPilot config unavailable.', chatId);
      return { handled: true };
    }
    setter((prev: any) => ({ ...prev, lotSize: size }));
    await input.sendTelegramText(`Lot size set to ${size}.`, chatId);
    return { handled: true };
  }

  if (command === '/scope') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const symbol = input.parseTelegramSymbol(argText);
    if (!symbol) {
      await input.sendTelegramText('Usage: /scope XAUUSD', chatId);
      return { handled: true };
    }
    input.updateSymbolScope(symbol, { source: 'telegram' });
    await input.sendTelegramText(`Symbol scope set to ${symbol}.`, chatId);
    return { handled: true };
  }

  if (command === '/watchers') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const action = args[0] ? String(args[0]).toLowerCase() : 'status';
    const watchers = input.setupWatchersRef.current || [];
    if (action === 'pause' || action === 'off') {
      const enabled = watchers.filter((w) => w && w.enabled !== false);
      input.telegramWatcherResumeRef.current = new Set(enabled.map((w) => w.id));
      enabled.forEach((w) => input.updateSetupWatcher(w.id, { enabled: false }));
      await input.sendTelegramText(`Paused ${enabled.length} watcher(s).`, chatId);
      return { handled: true };
    }
    if (action === 'resume' || action === 'on') {
      const restore = input.telegramWatcherResumeRef.current;
      if (restore.size > 0) {
        restore.forEach((id) => input.updateSetupWatcher(id, { enabled: true }));
      } else {
        watchers.forEach((w) => input.updateSetupWatcher(w.id, { enabled: true }));
      }
      await input.sendTelegramText('Watchers resumed.', chatId);
      return { handled: true };
    }
    const enabledCount = watchers.filter((w) => w && w.enabled !== false).length;
    await input.sendTelegramText(`Watchers: ${enabledCount}/${watchers.length} enabled.`, chatId);
    return { handled: true };
  }

  if (command === '/positions') {
    if (!input.signalTelegramAllowStatus) {
      await input.sendTelegramText('Position list is disabled.', chatId);
      return { handled: true };
    }
    const lines: string[] = [];
    if (input.tlStatus === 'connected') {
      const positions = Array.isArray(input.tlPositionsRef.current) ? input.tlPositionsRef.current : [];
      if (positions.length === 0) {
        lines.push('TradeLocker: no positions.');
      } else {
        lines.push('TradeLocker positions:');
        positions.slice(0, 6).forEach((pos) => {
          const side = String(pos?.type || '').toUpperCase();
          const size = Number(pos?.size);
          const pnl = Number(pos?.pnl);
          const sizeLabel = Number.isFinite(size) ? size.toFixed(2) : '--';
          const pnlLabel = Number.isFinite(pnl) ? pnl.toFixed(2) : '--';
          lines.push(`${side} ${pos?.symbol || ''} ${sizeLabel} pnl ${pnlLabel}`.trim());
        });
      }
    } else {
      lines.push(`TradeLocker: ${input.tlStatus || 'offline'}`);
    }
    const mt5PositionsRes = await input.fetchMt5('/positions');
    if (mt5PositionsRes.ok && Array.isArray(mt5PositionsRes.data?.positions)) {
      const mt5Positions = mt5PositionsRes.data.positions;
      if (mt5Positions.length === 0) {
        lines.push('MT5: no positions.');
      } else {
        lines.push('MT5 positions:');
        mt5Positions.slice(0, 6).forEach((pos: any) => {
          const side = Number(pos?.type) === 0 ? 'BUY' : 'SELL';
          const size = Number(pos?.volume);
          const pnl = Number(pos?.profit);
          const sizeLabel = Number.isFinite(size) ? size.toFixed(2) : '--';
          const pnlLabel = Number.isFinite(pnl) ? pnl.toFixed(2) : '--';
          lines.push(`${side} ${pos?.symbol || ''} ${sizeLabel} pnl ${pnlLabel}`.trim());
        });
      }
    } else {
      lines.push('MT5: offline.');
    }
    await input.sendTelegramText(lines.join('\n'), chatId);
    return { handled: true };
  }

  if (command === '/orders') {
    if (!input.signalTelegramAllowStatus) {
      await input.sendTelegramText('Order list is disabled.', chatId);
      return { handled: true };
    }
    const lines: string[] = [];
    if (input.tlStatus === 'connected') {
      const orders = Array.isArray(input.tlOrdersRef.current) ? input.tlOrdersRef.current : [];
      if (orders.length === 0) {
        lines.push('TradeLocker: no orders.');
      } else {
        lines.push('TradeLocker orders:');
        orders.slice(0, 6).forEach((ord) => {
          const side = String(ord?.type || '').toUpperCase();
          const size = Number(ord?.size);
          const price = Number(ord?.price);
          const sizeLabel = Number.isFinite(size) ? size.toFixed(2) : '--';
          const priceLabel = Number.isFinite(price) ? price.toFixed(2) : '--';
          lines.push(`${side} ${ord?.symbol || ''} ${sizeLabel} @ ${priceLabel}`.trim());
        });
      }
    } else {
      lines.push(`TradeLocker: ${input.tlStatus || 'offline'}`);
    }
    const mt5OrdersRes = await input.fetchMt5('/orders');
    if (mt5OrdersRes.ok && Array.isArray(mt5OrdersRes.data?.orders)) {
      const mt5Orders = mt5OrdersRes.data.orders;
      if (mt5Orders.length === 0) {
        lines.push('MT5: no orders.');
      } else {
        lines.push('MT5 orders:');
        mt5Orders.slice(0, 6).forEach((ord: any) => {
          const side = Number(ord?.type) === 0 ? 'BUY' : 'SELL';
          const size = Number(ord?.volume_initial ?? ord?.volume);
          const price = Number(ord?.price_open ?? ord?.price);
          const sizeLabel = Number.isFinite(size) ? size.toFixed(2) : '--';
          const priceLabel = Number.isFinite(price) ? price.toFixed(2) : '--';
          lines.push(`${side} ${ord?.symbol || ''} ${sizeLabel} @ ${priceLabel}`.trim());
        });
      }
    } else {
      lines.push('MT5: offline.');
    }
    await input.sendTelegramText(lines.join('\n'), chatId);
    return { handled: true };
  }

  if (command === '/execute') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const entry = input.resolveTelegramSignalEntry(argText);
    if (!entry) {
      await input.sendTelegramText('Signal not found. Use /signals to list.', chatId);
      return { handled: true };
    }
    const brokerHint = input.parseTelegramBroker(text);
    const forceBroker = brokerHint || null;
    const summary = `Execute${forceBroker ? ` ${forceBroker.toUpperCase()}` : ''} ${entry.action} ${entry.symbol} ${entry.id.slice(-6)}`.trim();
    if (input.signalTelegramConfirmationsEnabled) {
      await input.queueTelegramConfirmation({
        chatId,
        summary,
        kind: 'signal_execute',
        payload: { entryId: entry.id, forceBroker }
      });
      return { handled: true };
    }
    await input.runTelegramSignalAction({ type: 'execute', entry, chatId, forceBroker });
    return { handled: true };
  }

  if (command === '/reject') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const entry = input.resolveTelegramSignalEntry(argText);
    if (!entry) {
      await input.sendTelegramText('Signal not found. Use /signals to list.', chatId);
      return { handled: true };
    }
    const summary = `Reject ${entry.action} ${entry.symbol} ${entry.id.slice(-6)}`.trim();
    if (input.signalTelegramConfirmationsEnabled) {
      await input.queueTelegramConfirmation({
        chatId,
        summary,
        kind: 'signal_reject',
        payload: { entryId: entry.id }
      });
      return { handled: true };
    }
    await input.runTelegramSignalAction({ type: 'reject', entry, chatId });
    return { handled: true };
  }

  if (command === '/cancel') {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const entry = input.resolveTelegramSignalEntry(argText);
    if (!entry) {
      await input.sendTelegramText('Signal not found. Use /signals to list.', chatId);
      return { handled: true };
    }
    const summary = `Cancel ${entry.action} ${entry.symbol} ${entry.id.slice(-6)}`.trim();
    if (input.signalTelegramConfirmationsEnabled) {
      await input.queueTelegramConfirmation({
        chatId,
        summary,
        kind: 'signal_cancel',
        payload: { entryId: entry.id }
      });
      return { handled: true };
    }
    await input.runTelegramSignalAction({ type: 'cancel', entry, chatId });
    return { handled: true };
  }

  if (wantsStatus) {
    if (!input.signalTelegramAllowStatus) {
      await input.sendTelegramText('Status commands are disabled.', chatId);
      return { handled: true };
    }
    const fmtMoney = (value: any) => {
      const num = Number(value);
      return Number.isFinite(num) ? num.toFixed(2) : '--';
    };
    const lines: string[] = [];

    const tlConnected = input.tlStatus === 'connected';
    if (tlConnected) {
      const positions = Array.isArray(input.tlPositionsRef.current) ? input.tlPositionsRef.current : [];
      const orders = Array.isArray(input.tlOrdersRef.current) ? input.tlOrdersRef.current : [];
      lines.push(
        `TradeLocker: Equity ${fmtMoney(input.tlEquity)} | Balance ${fmtMoney(input.tlBalance)} | Pos ${positions.length} | Ord ${orders.length}`
      );
    } else {
      lines.push(`TradeLocker: ${input.tlStatus || 'offline'}`);
    }

    const mt5AccountRes = await input.fetchMt5('/account');
    if (mt5AccountRes.ok && mt5AccountRes.data?.account) {
      const account = mt5AccountRes.data.account;
      const equity = fmtMoney(account?.equity);
      const balance = fmtMoney(account?.balance);
      const mt5PositionsRes = await input.fetchMt5('/positions');
      const mt5Positions = Array.isArray(mt5PositionsRes.data?.positions) ? mt5PositionsRes.data.positions : [];
      lines.push(`MT5: Equity ${equity} | Balance ${balance} | Pos ${mt5Positions.length}`);
    } else {
      lines.push('MT5: offline');
    }

    const statusSymbol = input.parseTelegramSymbol(text) || input.symbolScopeSymbol || input.activeBrokerSymbol || input.signalPrimarySymbol;
    if (statusSymbol) {
      const snapshot = await input.fetchTelegramNewsSnapshot(statusSymbol);
      if (snapshot?.items?.length) {
        const top = snapshot.items[0];
        const toneLabel = input.formatTelegramNewsTone(snapshot.tone, snapshot.toneScore);
        const impactLabel = snapshot.impactLevel ? snapshot.impactLevel.toUpperCase() : '';
        const trumpFlag = snapshot.trumpNews ? ' Trump News' : '';
        lines.push(`News: ${top.title}${impactLabel ? ` (${impactLabel}${toneLabel ? `/${toneLabel}` : ''})` : ''}${trumpFlag}`);
      }
    }

    await input.sendTelegramText(lines.join('\n'), chatId);
    return { handled: true };
  }

  if (wantsChart) {
    if (!input.signalTelegramAllowChart) {
      await input.sendTelegramText('Chart commands are disabled.', chatId);
      return { handled: true };
    }

    const linkCfg = input.brokerLinkConfigRef.current || DEFAULT_BROKER_LINK_CONFIG;
    const brokerHint = input.parseTelegramBroker(text);
    const broker = brokerHint || (linkCfg.masterBroker === 'tradelocker' ? 'tradelocker' : 'mt5');
    const rawSymbol = input.parseTelegramSymbol(text) || input.symbolScopeSymbol || input.activeBrokerSymbol || input.signalPrimarySymbol;
    if (!rawSymbol) {
      await input.sendTelegramText('Symbol missing. Example: /chart XAUUSD 1H', chatId);
      return { handled: true };
    }

    const adapter = broker === 'mt5'
      ? createMt5Adapter()
      : createTradeLockerAdapter({ api: (window as any)?.glass?.tradelocker, resolveSymbol: input.resolveTradeLockerSymbolBestEffort });

    const resolvedSymbol = await resolveBrokerSymbol({
      symbol: rawSymbol,
      brokerId: broker,
      config: linkCfg,
      adapter
    });

    const tf = input.parseTelegramTimeframe(text);
    const snapshotBundle = await input.captureChartChatSnapshot(`tg_${Date.now()}`, {
      symbol: resolvedSymbol,
      timeframes: tf ? [tf] : undefined
    });

    const imageDataUrl = snapshotBundle?.imageDataUrl || null;
    if (!imageDataUrl) {
      await input.sendTelegramText('Chart snapshot failed. Try again in a moment.', chatId);
      return { handled: true };
    }

    let summary = '';
    try {
      summary = await input.sendPlainTextToOpenAI({
        system: 'You are a trading assistant. Summarize the chart snapshot for Telegram in 4 concise bullet points. Mention bias, key levels, and risk.',
        user: `User request: ${text}\n\n${snapshotBundle.contextText}`,
        imageAttachment: { dataUrl: imageDataUrl, label: `Chart ${resolvedSymbol}` }
      });
    } catch {
      summary = '';
    }

    const caption = [resolvedSymbol, tf ? tf.toUpperCase() : '', summary].filter(Boolean).join('\n');
    const photoRes = await input.sendTelegramPhoto(imageDataUrl, caption, chatId);
    if (!photoRes?.ok && summary) {
      await input.sendTelegramText(`${resolvedSymbol} ${tf || ''}\n${summary}`, chatId);
    }
    return { handled: true };
  }

  if (wantsManage) {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      await input.sendTelegramText('Manage commands are disabled.', chatId);
      return { handled: true };
    }
    const brokerHint = input.parseTelegramBroker(text);
    const broker = brokerHint || (input.brokerLinkConfigRef.current?.masterBroker === 'tradelocker' ? 'tradelocker' : 'mt5');
    const requestedSymbol = input.parseTelegramSymbol(text);
    const accountHint = input.parseTelegramAccountHint(text);
    const isBreakeven = /breakeven|break even|move stop|move sl/.test(lower);
    const qtySpec = input.parseTelegramQtySpec(text);
    const actionLabel = isBreakeven ? 'Breakeven' : 'Close';
    const summary = `${broker.toUpperCase()} ${actionLabel} ${requestedSymbol || 'positions'}`.trim();
    if (input.signalTelegramConfirmationsEnabled) {
      await input.queueTelegramConfirmation({
        chatId,
        summary,
        kind: 'manage_positions',
        payload: {
          broker,
          requestedSymbol: requestedSymbol || null,
          isBreakeven,
          qtySpec,
          accountHint: accountHint || null
        }
      });
      return { handled: true };
    }
    await input.runTelegramManageAction({
      chatId,
      broker,
      requestedSymbol: requestedSymbol || null,
      isBreakeven,
      qtySpec,
      accountHint: accountHint || null
    });
    return { handled: true };
  }

  await input.sendTelegramText('Command not recognized. Send /help for options.', chatId);
  return { handled: true };
}
