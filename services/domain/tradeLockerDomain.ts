export interface TradeLockerAccountDescriptor {
  accountKey: string;
  accountId?: number | null;
  accNum?: number | null;
  label?: string | null;
  status?: 'fresh' | 'stale' | 'unavailable';
}

export interface TradeLockerDomainPort {
  init: () => void;
  dispose: () => void;
  getSnapshot: () => {
    activeAccountKey: string | null;
    switching: boolean;
    selectorOpen: boolean;
    selectorSearch: string;
    refreshQueueDepth: number;
    lastRefreshAtMs: number | null;
    lastRefreshError: string | null;
  };
  actions: {
    setActiveAccountKey: (accountKey: string | null) => void;
    setSwitching: (switching: boolean) => void;
    setSelectorOpen: (open: boolean) => void;
    setSelectorSearch: (search: string) => void;
    setRefreshState: (patch: {
      refreshQueueDepth?: number;
      lastRefreshAtMs?: number | null;
      lastRefreshError?: string | null;
    }) => void;
  };
  listAccounts: () => TradeLockerAccountDescriptor[];
  switchAccount: (accountKey: string) => Promise<{ ok: boolean; error?: string }>;
}
