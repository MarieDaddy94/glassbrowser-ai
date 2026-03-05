import { create } from 'zustand';

export interface TradeLockerAccountStoreState {
  activeAccountKey: string | null;
  switching: boolean;
  selectorOpen: boolean;
  selectorSearch: string;
  refreshQueueDepth: number;
  lastRefreshAtMs: number | null;
  lastRefreshError: string | null;
  setActiveAccountKey: (accountKey: string | null) => void;
  setSwitching: (switching: boolean) => void;
  setSelectorOpen: (open: boolean) => void;
  setSelectorSearch: (search: string) => void;
  setRefreshState: (patch: {
    refreshQueueDepth?: number;
    lastRefreshAtMs?: number | null;
    lastRefreshError?: string | null;
  }) => void;
}

export const useTradeLockerAccountStore = create<TradeLockerAccountStoreState>((set) => ({
  activeAccountKey: null,
  switching: false,
  selectorOpen: false,
  selectorSearch: '',
  refreshQueueDepth: 0,
  lastRefreshAtMs: null,
  lastRefreshError: null,
  setActiveAccountKey: (accountKey) => set({ activeAccountKey: accountKey }),
  setSwitching: (switching) => set({ switching: switching === true }),
  setSelectorOpen: (open) => set({ selectorOpen: open === true }),
  setSelectorSearch: (search) => set({ selectorSearch: String(search || '') }),
  setRefreshState: (patch) =>
    set((state) => ({
      refreshQueueDepth:
        patch?.refreshQueueDepth != null ? Number(patch.refreshQueueDepth) || 0 : state.refreshQueueDepth,
      lastRefreshAtMs:
        patch?.lastRefreshAtMs === undefined ? state.lastRefreshAtMs : patch.lastRefreshAtMs ?? null,
      lastRefreshError:
        patch?.lastRefreshError === undefined ? state.lastRefreshError : (patch.lastRefreshError || null)
    }))
}));
