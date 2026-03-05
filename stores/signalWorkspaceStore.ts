import { create } from 'zustand';

export interface SignalWorkspaceState {
  activeSignalId: string | null;
  threadArchivedBySignalId: Record<string, boolean>;
  statusReportRunning: boolean;
  statusReportPending: 'manual' | 'chart_update' | null;
  setActiveSignalId: (signalId: string | null) => void;
  setSignalArchived: (signalId: string, archived: boolean) => void;
  setStatusReportRunning: (running: boolean) => void;
  setStatusReportPending: (pending: 'manual' | 'chart_update' | null) => void;
}

export const useSignalWorkspaceStore = create<SignalWorkspaceState>((set) => ({
  activeSignalId: null,
  threadArchivedBySignalId: {},
  statusReportRunning: false,
  statusReportPending: null,
  setActiveSignalId: (signalId) => set({ activeSignalId: signalId }),
  setSignalArchived: (signalId, archived) =>
    set((state) => ({
      threadArchivedBySignalId: {
        ...state.threadArchivedBySignalId,
        [signalId]: archived === true
      }
    })),
  setStatusReportRunning: (running) => set({ statusReportRunning: running === true }),
  setStatusReportPending: (pending) =>
    set({
      statusReportPending: pending === 'manual' || pending === 'chart_update' ? pending : null
    })
}));
