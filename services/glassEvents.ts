export const GLASS_EVENT = {
  TRADELOCKER_ACCOUNT_CHANGED: 'glass_tradelocker_account_changed',
  TRADELOCKER_SWITCH_SHIELD: 'glass_tradelocker_switch_shield',
  TRADELOCKER_TICKET: 'glass_tradelocker_ticket',
  MT5_TICKET: 'glass_mt5_ticket',
  MT5_CONTROLS: 'glass_mt5_controls',
  BACKTESTER: {
    CONFIG: 'glass_backtester_config',
    PARAMS: 'glass_backtester_params',
    OPTIMIZER_CONFIG: 'glass_backtester_optimizer_config',
    BATCH_CONFIG: 'glass_backtester_batch_config',
    EXECUTION: 'glass_backtester_execution',
    CONFLUENCE: 'glass_backtester_confluence',
    VALIDATION: 'glass_backtester_validation',
    WALKFORWARD: 'glass_backtester_walkforward',
    REPLAY: 'glass_backtester_replay',
    TIEBREAKER: 'glass_backtester_tiebreaker',
    AUTO_SUMMARY: 'glass_backtester_auto_summary',
    WATCHLIST_MODE: 'glass_backtester_watchlist_mode',
    TRADE_SELECT: 'glass_backtester_trade_select',
    MEMORY_FILTERS: 'glass_backtester_memory_filters',
    RESEARCH_CONFIG: 'glass_backtester_research_config'
  }
} as const;

export type GlassEventName =
  | typeof GLASS_EVENT.TRADELOCKER_ACCOUNT_CHANGED
  | typeof GLASS_EVENT.TRADELOCKER_SWITCH_SHIELD
  | typeof GLASS_EVENT.TRADELOCKER_TICKET
  | typeof GLASS_EVENT.MT5_TICKET
  | typeof GLASS_EVENT.MT5_CONTROLS
  | (typeof GLASS_EVENT.BACKTESTER)[keyof typeof GLASS_EVENT.BACKTESTER];

export const dispatchGlassEvent = <T = any>(eventName: GlassEventName, detail: T): boolean => {
  if (typeof window === 'undefined' || !window.dispatchEvent) return false;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
  return true;
};

export const listenGlassEvent = <T = any>(
  eventName: GlassEventName,
  handler: (event: CustomEvent<T>) => void
): (() => void) => {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const wrapped = (event: Event) => handler(event as CustomEvent<T>);
  window.addEventListener(eventName, wrapped as EventListener);
  return () => window.removeEventListener(eventName, wrapped as EventListener);
};
