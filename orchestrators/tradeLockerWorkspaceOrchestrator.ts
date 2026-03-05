import { useTradeLockerAccountStore } from '../stores/tradeLockerAccountStore';
import type { TradeLockerAccountDescriptor, TradeLockerDomainPort } from '../services/domain/tradeLockerDomain';

export interface TradeLockerWorkspaceOrchestratorOptions {
  listAccounts?: () => TradeLockerAccountDescriptor[];
  switchAccount?: (accountKey: string) => Promise<{ ok: boolean; error?: string }>;
}

export const createTradeLockerWorkspaceOrchestrator = (
  options: TradeLockerWorkspaceOrchestratorOptions = {}
): TradeLockerDomainPort => ({
  init: () => {},
  dispose: () => {},
  getSnapshot: () => {
    const state = useTradeLockerAccountStore.getState();
    return {
      activeAccountKey: state.activeAccountKey,
      switching: state.switching === true,
      selectorOpen: state.selectorOpen === true,
      selectorSearch: String(state.selectorSearch || ''),
      refreshQueueDepth: Number(state.refreshQueueDepth || 0),
      lastRefreshAtMs: state.lastRefreshAtMs ?? null,
      lastRefreshError: state.lastRefreshError || null
    };
  },
  actions: {
    setActiveAccountKey: (accountKey) => useTradeLockerAccountStore.getState().setActiveAccountKey(accountKey),
    setSwitching: (switching) => useTradeLockerAccountStore.getState().setSwitching(switching),
    setSelectorOpen: (open) => useTradeLockerAccountStore.getState().setSelectorOpen(open),
    setSelectorSearch: (search) => useTradeLockerAccountStore.getState().setSelectorSearch(search),
    setRefreshState: (patch) => useTradeLockerAccountStore.getState().setRefreshState(patch)
  },
  listAccounts: () => (typeof options.listAccounts === 'function' ? options.listAccounts() : []),
  switchAccount: (accountKey) =>
    typeof options.switchAccount === 'function'
      ? options.switchAccount(accountKey)
      : Promise.resolve({ ok: false, error: 'TradeLocker account switch handler unavailable.' })
});

export interface TradeLockerSelectorActionBundle {
  handleTradeLockerAccountSelectorSearch: (nextValue: string) => void;
  handleTradeLockerAccountSelectorClose: () => void;
  handleTradeLockerAccountSelectorToggleOpen: () => void;
}

export interface CreateTradeLockerSelectorActionBundleArgs {
  setTlAccountSelectorSearch: (value: string) => void;
  appendAuditEvent: (payload: any) => void | Promise<void>;
  tlAccountSelectorSearchLastAuditAtRef: { current: number };
  setTlAccountSelectorOpen: (updater: ((prev: boolean) => boolean) | boolean) => void;
  tlAccountSelectorLastUsedAtRef: { current: number };
  tradeLockerAccountSelectorItemsLength: number;
  handleTradeLockerAccountSelectorRefreshAccounts: () => Promise<void>;
  handleTradeLockerAccountSelectorRefreshBalances: (opts?: { reason?: 'manual' | 'auto' }) => Promise<void>;
}

export const createTradeLockerSelectorActionBundle = (
  args: CreateTradeLockerSelectorActionBundleArgs
): TradeLockerSelectorActionBundle => {
  const handleTradeLockerAccountSelectorSearch = (nextValue: string) => {
    const value = String(nextValue || '');
    args.setTlAccountSelectorSearch(value);
    const now = Date.now();
    if (now - args.tlAccountSelectorSearchLastAuditAtRef.current >= 400) {
      args.tlAccountSelectorSearchLastAuditAtRef.current = now;
      void args.appendAuditEvent({
        eventType: 'tradelocker_account_selector_searched',
        payload: { source: 'browser_chrome_selector', query: value.slice(0, 120), length: value.length }
      });
    }
  };

  const handleTradeLockerAccountSelectorToggleOpen = () => {
    args.setTlAccountSelectorOpen((prev: boolean) => {
      const next = !prev;
      if (next) {
        args.tlAccountSelectorLastUsedAtRef.current = Date.now();
        void args.appendAuditEvent({
          eventType: 'tradelocker_account_selector_opened',
          payload: {
            source: 'browser_chrome_selector',
            cards: args.tradeLockerAccountSelectorItemsLength
          }
        });
        void args.handleTradeLockerAccountSelectorRefreshAccounts();
        void args.handleTradeLockerAccountSelectorRefreshBalances({ reason: 'auto' });
      }
      return next;
    });
  };

  return {
    handleTradeLockerAccountSelectorSearch,
    handleTradeLockerAccountSelectorClose: () => args.setTlAccountSelectorOpen(false),
    handleTradeLockerAccountSelectorToggleOpen
  };
};
