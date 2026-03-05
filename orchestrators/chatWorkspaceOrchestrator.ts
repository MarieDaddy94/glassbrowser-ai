import { useChatWorkspaceStore } from '../stores/chatWorkspaceStore';
import type { ChatThreadDescriptor, ChatWorkspaceDomainPort } from '../services/domain/chatWorkspaceDomain';

export interface ChatWorkspaceOrchestratorOptions {
  listThreads?: () => ChatThreadDescriptor[];
}

export const createChatWorkspaceOrchestrator = (
  options: ChatWorkspaceOrchestratorOptions = {}
): ChatWorkspaceDomainPort => ({
  init: () => {},
  dispose: () => {},
  getSnapshot: () => {
    const state = useChatWorkspaceStore.getState();
    return {
      activeThreadId: state.activeThreadId,
      unreadByThread: { ...(state.unreadByThread || {}) },
      contextInspector: state.contextInspector || null
    };
  },
  actions: {
    selectThread: (threadId) => useChatWorkspaceStore.getState().setActiveThread(threadId),
    setUnreadByThread: (next) => useChatWorkspaceStore.getState().setUnreadByThread(next),
    setContextInspector: (next) => useChatWorkspaceStore.getState().setContextInspector(next || null)
  },
  selectThread: (threadId) => useChatWorkspaceStore.getState().setActiveThread(threadId),
  listThreads: () => (typeof options.listThreads === 'function' ? options.listThreads() : [])
});

type SignalEntryLike = {
  id?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
};

type SignalContextLike = {
  symbol?: string | null;
  timeframe?: string | null;
};

type SignalContextMap = Record<string, SignalContextLike | undefined>;

export interface ChatWorkspaceActionBundle {
  selectSignalThreadFromChat: (signalId: string | null) => void;
  askAgentAboutSignalFromChat: (signalId: string, promptKind: 'status' | 'risk' | 'thesis' | 'exit') => void;
  openSignalFromChat: (signalId: string) => void;
  openAcademyCaseFromChat: (signalId: string) => void;
  openChartFromSignalChat: (signalId: string) => void;
}

export interface CreateChatWorkspaceActionBundleArgs {
  chatSignalWorkspaceV1: boolean;
  appendAuditEvent: (payload: any) => void | Promise<void>;
  setActiveSignalThreadId: (signalId: string | null) => void;
  signalEntriesById: Map<string, SignalEntryLike>;
  signalContextById: SignalContextMap;
  publishSignalSelectionContext: (entry: SignalEntryLike | null | undefined, originPanel?: string) => void;
  signalThreadUnreadBaselineRef: { current: Record<string, number> };
  chartSignalThreadCounts: Record<string, number>;
  resolveSignalThreadKey: (signalId: string | null | undefined) => string;
  chartChatContext: { url: string; title: string };
  sendChartChatMessageWithSnapshot: (
    text: string,
    context: { url: string; title: string },
    attachments: any[],
    imageData: string | null,
    options?: {
      threadKind?: 'global' | 'signal';
      threadId?: string | null;
      signalId?: string | null;
      threadLabel?: string | null;
    }
  ) => Promise<void>;
  openSidebarMode: (mode: 'signal') => void;
  openAcademyCaseFromSignal: (signalId: string) => void;
  openSymbolPanel: (target: 'nativechart', symbol: string, timeframe?: string | null) => void;
}

export const createChatWorkspaceActionBundle = (
  args: CreateChatWorkspaceActionBundleArgs
): ChatWorkspaceActionBundle => {
  const selectSignalThreadFromChat: ChatWorkspaceActionBundle['selectSignalThreadFromChat'] = (signalId) => {
    const id = String(signalId || '').trim();
    if (!id) {
      args.setActiveSignalThreadId(null);
      args.signalThreadUnreadBaselineRef.current.global = Number(args.chartSignalThreadCounts.global || 0);
      return;
    }
    const entry = args.signalEntriesById.get(id);
    if (entry) {
      args.publishSignalSelectionContext(entry, 'chat');
    }
    args.setActiveSignalThreadId(id);
    const threadKey = args.resolveSignalThreadKey(id);
    args.signalThreadUnreadBaselineRef.current[threadKey] = Number(args.chartSignalThreadCounts[threadKey] || 0);
    void args.appendAuditEvent({
      eventType: 'chat_signal_thread_opened',
      symbol: entry?.symbol || args.signalContextById[id]?.symbol || null,
      payload: { signalId: id, source: 'chat_workspace' }
    });
  };

  const askAgentAboutSignalFromChat: ChatWorkspaceActionBundle['askAgentAboutSignalFromChat'] = (signalId, promptKind) => {
    if (!args.chatSignalWorkspaceV1) return;
    const id = String(signalId || '').trim();
    if (!id) return;
    selectSignalThreadFromChat(id);
    const ctx = args.signalContextById[id];
    const subject = ctx?.symbol ? `${ctx.symbol}${ctx?.timeframe ? ` ${String(ctx.timeframe).toUpperCase()}` : ''}` : `signal ${id}`;
    const prompt =
      promptKind === 'risk'
        ? `Risk check for ${subject}: validate current exposure, invalidation, and what would cancel this idea.`
        : promptKind === 'thesis'
          ? `Thesis check for ${subject}: is the original idea still valid?`
          : promptKind === 'exit'
            ? `Exit plan for ${subject}: best management from here and what signals invalidate continuation.`
            : `Status now for ${subject}: summarize market progress versus entry, stop, and target.`;
    void args.appendAuditEvent({
      eventType: 'chat_signal_prompt_chip_used',
      symbol: ctx?.symbol || null,
      payload: { signalId: id, promptKind }
    });
    void args.sendChartChatMessageWithSnapshot(prompt, args.chartChatContext, [], null, {
      threadKind: 'signal',
      threadId: args.resolveSignalThreadKey(id),
      signalId: id,
      threadLabel: ctx?.symbol || id
    });
  };

  const openSignalFromChat: ChatWorkspaceActionBundle['openSignalFromChat'] = (signalId) => {
    const id = String(signalId || '').trim();
    if (!id) return;
    const entry = args.signalEntriesById.get(id);
    if (entry) args.publishSignalSelectionContext(entry, 'chat');
    args.openSidebarMode('signal');
  };

  const openAcademyCaseFromChat: ChatWorkspaceActionBundle['openAcademyCaseFromChat'] = (signalId) => {
    const id = String(signalId || '').trim();
    if (!id) return;
    args.openAcademyCaseFromSignal(id);
  };

  const openChartFromSignalChat: ChatWorkspaceActionBundle['openChartFromSignalChat'] = (signalId) => {
    const id = String(signalId || '').trim();
    if (!id) return;
    const ctx = args.signalContextById[id];
    if (!ctx?.symbol) return;
    args.openSymbolPanel('nativechart', ctx.symbol, ctx.timeframe || undefined);
  };

  return {
    selectSignalThreadFromChat,
    askAgentAboutSignalFromChat,
    openSignalFromChat,
    openAcademyCaseFromChat,
    openChartFromSignalChat
  };
};
