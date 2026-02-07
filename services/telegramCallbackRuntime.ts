type MutableRef<T> = { current: T };

type TelegramPendingAction = {
  chatId: string;
  [key: string]: any;
};

type TelegramSignalEntry = {
  id: string;
  action: string;
  symbol: string;
  [key: string]: any;
};

type RunTelegramCallbackRuntimeInput = {
  update: any;
  allowedChatIds: Set<string>;
  signalTelegramAllowManage: boolean;
  signalTelegramCommandMode: string;
  signalTelegramConfirmationsEnabled: boolean;
  telegramPendingActionsRef: MutableRef<Map<string, any>>;
  answerTelegramCallback: (callbackId: string, text?: string) => Promise<any>;
  appendAuditEvent?: (event: { eventType: string; payload?: Record<string, any> }) => void | Promise<void>;
  resolveTelegramPendingAction: (id: string) => TelegramPendingAction | null | undefined;
  executeTelegramPendingAction: (pending: TelegramPendingAction) => Promise<void>;
  sendTelegramText: (text: string, chatId?: string, opts?: { replyMarkup?: any }) => Promise<any>;
  resolveTelegramSignalEntry: (token: string) => TelegramSignalEntry | null | undefined;
  queueTelegramConfirmation: (input: {
    chatId: string;
    summary: string;
    kind: string;
    payload: Record<string, any>;
  }) => Promise<any>;
  runTelegramSignalAction: (input: {
    type: 'execute' | 'reject' | 'cancel';
    entry: TelegramSignalEntry;
    chatId: string;
    forceBroker?: any;
  }) => Promise<void>;
};

export async function runTelegramCallbackRuntime(input: RunTelegramCallbackRuntimeInput): Promise<{ handled: boolean }> {
  const callback = input.update?.callback_query;
  if (!callback) return { handled: false };

  const callbackId = callback?.id ? String(callback.id).trim() : '';
  const chatId =
    callback?.message?.chat?.id != null
      ? String(callback.message.chat.id).trim()
      : callback?.from?.id != null
        ? String(callback.from.id).trim()
        : '';
  if (!chatId) return { handled: true };
  if (input.allowedChatIds.size > 0 && !input.allowedChatIds.has(chatId)) return { handled: true };

  const data = String(callback?.data || '').trim();
  if (!data) {
    if (callbackId) await input.answerTelegramCallback(callbackId, 'No action.');
    return { handled: true };
  }

  if (input.appendAuditEvent) {
    try {
      await input.appendAuditEvent({
        eventType: 'telegram_command',
        payload: { type: 'callback', data, chatId }
      });
    } catch {
      // ignore audit failures
    }
  }

  if (data.startsWith('confirm:')) {
    const pendingId = data.slice('confirm:'.length).trim();
    const pending = input.resolveTelegramPendingAction(pendingId);
    if (!pending || pending.chatId !== chatId) {
      if (callbackId) await input.answerTelegramCallback(callbackId, 'Expired.');
      return { handled: true };
    }
    input.telegramPendingActionsRef.current.delete(pendingId);
    if (callbackId) await input.answerTelegramCallback(callbackId, 'Executing.');
    await input.executeTelegramPendingAction(pending);
    return { handled: true };
  }

  if (data.startsWith('cancel:')) {
    const pendingId = data.slice('cancel:'.length).trim();
    input.telegramPendingActionsRef.current.delete(pendingId);
    if (callbackId) await input.answerTelegramCallback(callbackId, 'Canceled.');
    await input.sendTelegramText('Canceled.', chatId);
    return { handled: true };
  }

  if (data.startsWith('sig:')) {
    if (!input.signalTelegramAllowManage || input.signalTelegramCommandMode !== 'manage') {
      if (callbackId) await input.answerTelegramCallback(callbackId, 'Manage disabled.');
      return { handled: true };
    }
    const parts = data.split(':').filter(Boolean);
    const action = parts[1] || '';
    let forceBroker: string | null = null;
    let token = '';
    if (action === 'exec' && (parts[2] === 'mt5' || parts[2] === 'tradelocker')) {
      forceBroker = parts[2];
      token = parts.slice(3).join(':');
    } else {
      token = parts[2] || '';
    }
    const entry = input.resolveTelegramSignalEntry(token);
    if (!entry) {
      if (callbackId) await input.answerTelegramCallback(callbackId, 'Signal not found.');
      await input.sendTelegramText('Signal not found or expired.', chatId);
      return { handled: true };
    }
    if (action !== 'exec' && action !== 'reject' && action !== 'cancel') {
      if (callbackId) await input.answerTelegramCallback(callbackId, 'Unknown action.');
      return { handled: true };
    }
    const actionLabel = action === 'exec' ? 'Execute' : action === 'reject' ? 'Reject' : 'Cancel';
    const summary = `${actionLabel}${forceBroker ? ` ${forceBroker.toUpperCase()}` : ''} ${entry.action} ${entry.symbol} ${entry.id.slice(-6)}`.trim();
    if (input.signalTelegramConfirmationsEnabled) {
      await input.queueTelegramConfirmation({
        chatId,
        summary,
        kind: action === 'exec' ? 'signal_execute' : action === 'reject' ? 'signal_reject' : 'signal_cancel',
        payload: { entryId: entry.id, forceBroker }
      });
      if (callbackId) await input.answerTelegramCallback(callbackId, 'Confirm in chat.');
      return { handled: true };
    }
    await input.runTelegramSignalAction({
      type: action === 'exec' ? 'execute' : action === 'reject' ? 'reject' : 'cancel',
      entry,
      chatId,
      forceBroker
    });
    if (callbackId) await input.answerTelegramCallback(callbackId, 'Done.');
    return { handled: true };
  }

  if (callbackId) await input.answerTelegramCallback(callbackId, 'Unknown action.');
  return { handled: true };
}
