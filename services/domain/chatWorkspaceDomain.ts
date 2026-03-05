export interface ChatThreadDescriptor {
  threadId: string;
  threadKind: 'global' | 'signal';
  label?: string | null;
  unreadCount?: number;
}

export interface ChatWorkspaceInspectorSnapshot {
  sections: Array<{ id: string; title: string; chars: number; approxTokens: number; truncated: boolean; text: string }>;
  totalApproxTokens: number;
  generatedAtMs: number;
  threadId: string | null;
}

export interface ChatWorkspaceDomainPort {
  init: () => void;
  dispose: () => void;
  getSnapshot: () => {
    activeThreadId: string | null;
    unreadByThread: Record<string, number>;
    contextInspector: ChatWorkspaceInspectorSnapshot | null;
  };
  actions: {
    selectThread: (threadId: string | null) => void;
    setUnreadByThread: (next: Record<string, number>) => void;
    setContextInspector: (next: ChatWorkspaceInspectorSnapshot | null) => void;
  };
  selectThread: (threadId: string | null) => void;
  listThreads: () => ChatThreadDescriptor[];
}
