export interface SignalThreadContext {
  signalId: string;
  symbol: string;
  timeframe?: string | null;
  status?: string | null;
  archived?: boolean;
}

export interface SignalDomainPort {
  init: () => void;
  dispose: () => void;
  getSnapshot: () => {
    activeSignalId: string | null;
    threadArchivedBySignalId: Record<string, boolean>;
    statusReportRunning: boolean;
    statusReportPending: 'manual' | 'chart_update' | null;
  };
  actions: {
    setActiveSignalId: (signalId: string | null) => void;
    setSignalArchived: (signalId: string, archived: boolean) => void;
    setStatusReportRunning: (running: boolean) => void;
    setStatusReportPending: (pending: 'manual' | 'chart_update' | null) => void;
  };
  resolveSignalThread: (signalId: string) => SignalThreadContext | null;
}
