import { useSignalWorkspaceStore } from '../stores/signalWorkspaceStore';
import type { SignalDomainPort, SignalThreadContext } from '../services/domain/signalDomain';

export interface SignalWorkspaceOrchestratorOptions {
  resolveSignalThread?: (signalId: string) => SignalThreadContext | null;
}

export const createSignalWorkspaceOrchestrator = (
  options: SignalWorkspaceOrchestratorOptions = {}
): SignalDomainPort => ({
  init: () => {},
  dispose: () => {},
  getSnapshot: () => {
    const state = useSignalWorkspaceStore.getState();
    return {
      activeSignalId: state.activeSignalId,
      threadArchivedBySignalId: { ...(state.threadArchivedBySignalId || {}) },
      statusReportRunning: state.statusReportRunning === true,
      statusReportPending:
        state.statusReportPending === 'manual' || state.statusReportPending === 'chart_update'
          ? state.statusReportPending
          : null
    };
  },
  actions: {
    setActiveSignalId: (signalId) => useSignalWorkspaceStore.getState().setActiveSignalId(signalId),
    setSignalArchived: (signalId, archived) => useSignalWorkspaceStore.getState().setSignalArchived(signalId, archived),
    setStatusReportRunning: (running) => useSignalWorkspaceStore.getState().setStatusReportRunning(running === true),
    setStatusReportPending: (pending) => useSignalWorkspaceStore.getState().setStatusReportPending(pending)
  },
  resolveSignalThread: (signalId: string) =>
    typeof options.resolveSignalThread === 'function'
      ? options.resolveSignalThread(signalId)
      : null
});

type SignalSelectionEntry = {
  id?: string | null;
  symbol?: string | null;
};

export interface SignalWorkspaceActionBundle {
  openSignalThreadInChat: (
    entry: SignalSelectionEntry | null | undefined,
    opts?: { auto?: boolean; originPanel?: string }
  ) => void;
  handleSignalFocus: (entry: SignalSelectionEntry | null | undefined) => void;
}

export interface CreateSignalWorkspaceActionBundleArgs {
  chatSignalWorkspaceV1: boolean;
  publishSignalSelectionContext: (entry: SignalSelectionEntry | null | undefined, originPanel?: string) => void;
  setActiveSignalThreadId: (signalId: string) => void;
  openSidebarMode: (mode: 'chartchat') => void;
  appendAuditEvent: (payload: any) => void | Promise<void>;
  signalThreadAutoFocusRef: { current: { signalId: string; atMs: number } | null };
}

export const createSignalWorkspaceActionBundle = (
  args: CreateSignalWorkspaceActionBundleArgs
): SignalWorkspaceActionBundle => {
  const openSignalThreadInChat: SignalWorkspaceActionBundle['openSignalThreadInChat'] = (entry, opts) => {
    if (!entry) return;
    const signalId = String(entry.id || '').trim();
    if (!signalId) return;
    const originPanel = String(opts?.originPanel || 'signal').trim() || 'signal';
    args.publishSignalSelectionContext(entry, originPanel);
    if (!args.chatSignalWorkspaceV1) return;
    args.setActiveSignalThreadId(signalId);
    args.openSidebarMode('chartchat');
    void args.appendAuditEvent({
      eventType: opts?.auto ? 'chat_signal_thread_auto_opened' : 'chat_signal_thread_opened',
      symbol: entry.symbol || null,
      payload: {
        signalId,
        originPanel
      }
    });
  };

  const handleSignalFocus: SignalWorkspaceActionBundle['handleSignalFocus'] = (entry) => {
    if (!entry) return;
    const signalId = String(entry.id || '').trim();
    if (!signalId) return;
    if (!args.chatSignalWorkspaceV1) {
      args.publishSignalSelectionContext(entry, 'signal');
      return;
    }
    const now = Date.now();
    const last = args.signalThreadAutoFocusRef.current;
    if (last && last.signalId === signalId && now - last.atMs < 750) {
      args.publishSignalSelectionContext(entry, 'signal');
      return;
    }
    args.signalThreadAutoFocusRef.current = { signalId, atMs: now };
    openSignalThreadInChat(entry, { auto: true, originPanel: 'signal' });
  };

  return {
    openSignalThreadInChat,
    handleSignalFocus
  };
};
