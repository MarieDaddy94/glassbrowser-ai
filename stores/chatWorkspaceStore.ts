import { create } from 'zustand';

export interface ChatWorkspaceState {
  activeThreadId: string | null;
  unreadByThread: Record<string, number>;
  contextInspector: {
    sections: Array<{ id: string; title: string; chars: number; approxTokens: number; truncated: boolean; text: string }>;
    totalApproxTokens: number;
    generatedAtMs: number;
    threadId: string | null;
  } | null;
  setActiveThread: (threadId: string | null) => void;
  incrementUnread: (threadId: string) => void;
  clearUnread: (threadId: string) => void;
  setUnreadByThread: (next: Record<string, number>) => void;
  setContextInspector: (next: ChatWorkspaceState['contextInspector']) => void;
}

export const useChatWorkspaceStore = create<ChatWorkspaceState>((set) => ({
  activeThreadId: null,
  unreadByThread: {},
  contextInspector: null,
  setActiveThread: (threadId) => set({ activeThreadId: threadId }),
  incrementUnread: (threadId) =>
    set((state) => ({
      unreadByThread: {
        ...state.unreadByThread,
        [threadId]: Number(state.unreadByThread[threadId] || 0) + 1
      }
    })),
  clearUnread: (threadId) =>
    set((state) => ({
      unreadByThread: {
        ...state.unreadByThread,
        [threadId]: 0
      }
    })),
  setUnreadByThread: (next) => set({ unreadByThread: { ...(next || {}) } }),
  setContextInspector: (next) => set({ contextInspector: next || null })
}));
