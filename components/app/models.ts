import type React from 'react';
import type { CommandAction } from '../CommandPalette';
import type {
  Notification,
  SidebarMode,
  SignalChatContextSnapshot,
  SignalChatThreadSummary,
  SignalStatusReportMap,
  Tab,
  TradeLockerAccountMetrics,
  TradeLockerAccountSelectorModel
} from '../../types';

export type AppSidebarLegacyPanelModel = Record<string, unknown>;

export interface AppChatPanelModel extends Record<string, unknown> {
  activeSignalThreadId: string | null;
  signalThreads: SignalChatThreadSummary[];
  signalContextById: Record<string, SignalChatContextSnapshot>;
  chatContextInspectorState: unknown;
  chatContextInspectorV1: boolean;
  chatSignalWorkspaceV1: boolean;
  chatSignalWorkspaceActionsV1: boolean;
  selectSignalThreadFromChat: (signalId: string | null) => void;
  askAgentAboutSignalFromChat: (signalId: string, promptKind: 'status' | 'risk' | 'thesis' | 'exit') => void;
  openSignalFromChat: (signalId: string) => void;
  openAcademyCaseFromChat: (signalId: string) => void;
  openChartFromSignalChat: (signalId: string) => void;
  executeSignalFromChat: (signalId: string) => void;
  rejectSignalFromChat: (signalId: string) => void;
  cancelSignalOrderFromChat: (signalId: string) => void;
}

export interface AppSignalPanelModel extends Record<string, unknown> {
  signalEntries: unknown[];
  signalStatusReportsBySignalId: SignalStatusReportMap;
  signalStatusReportRunning: boolean;
  signalContextById: Record<string, SignalChatContextSnapshot>;
  openSignalThreadInChat: (entry: unknown, opts?: { auto?: boolean; originPanel?: string }) => void;
  handleSignalFocus: (entry: unknown) => void;
  refreshSignalStatusesNow: () => void;
}

export interface AppTradeLockerPanelModel extends Record<string, unknown> {
  tlAccounts: unknown[];
  tlAccountMetrics: TradeLockerAccountMetrics | null;
  tlAccountMetricsError: string | null;
  tlSavedConfig: Record<string, unknown> | null;
  tlRefreshAccounts: () => void | Promise<void>;
  tlRefreshAccountMetrics: () => void | Promise<void>;
  tlRefreshOrders: () => void | Promise<void>;
  tlRefreshQuotes: () => void | Promise<void>;
  tlRefreshSnapshot: () => void | Promise<void>;
  handleSnapshotSourceChange: (accountKey: string) => void | Promise<void>;
}

export interface AppSidebarPanelsModel {
  mode: SidebarMode;
  SIDEBAR_LAZY_FALLBACK: React.ReactNode;
  chat: AppChatPanelModel;
  signal: AppSignalPanelModel;
  tradeLocker: AppTradeLockerPanelModel;
  legacy: AppSidebarLegacyPanelModel;
  ctx: AppSidebarPanelsCtx;
}

export type AppSidebarPanelsCtx = AppSidebarLegacyPanelModel &
  AppChatPanelModel &
  AppSignalPanelModel &
  AppTradeLockerPanelModel & {
    mode: SidebarMode;
    SIDEBAR_LAZY_FALLBACK: React.ReactNode;
  };

export interface AppShellContentModel {
  isFullscreen: boolean;
  notifications: Notification[];
  dismissNotification: (id: string) => void;
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  setCommandPaletteQuery: (value: string) => void;
  commandActions: CommandAction[];
  closeCommandPalette: () => void;
  activeTab: Tab;
  tabs: Tab[];
  navigate: (url: string) => void;
  handleRefresh: () => void;
  handleBack: () => void;
  handleForward: () => void;
  toggleSidebar: () => void;
  isOpen: boolean;
  toggleTabWatch: (id: string) => void;
  setActiveTabId: (id: string) => void;
  addTab: () => void;
  closeTab: (id: string) => void;
  toggleTabPin: (id: string) => void;
  setTabLabel: (id: string, label: string) => void;
  openSettings: () => void;
  toggleFullscreen: () => void;
  tradeLockerAccountSelectorModel?: TradeLockerAccountSelectorModel | null;
  isTradingViewUrl: (url: string) => boolean;
  formatBrokerPrice: (value: unknown) => string;
  brokerBadgeSymbol: string | null;
  brokerBadgeBid: number | null;
  brokerBadgeAsk: number | null;
  brokerBadgeSpread: number | null;
  brokerBadgeAgeLabel: string | null;
  tvPriceLine: string | null;
  tvSymbolLine: string | null;
  activeTabId: string;
  updateTab: (tabId: string, updates: unknown) => void;
  handleControlsReady: (controls: unknown) => void;
  isSettingsOpen: boolean;
  isChartFullscreen: boolean;
  keepWatchedTabsMounted: boolean;
  closeSidebar: () => void;
  mode: SidebarMode;
  handleSwitchSidebarMode: (mode: SidebarMode) => void;
  prefetchSidebarMode: (mode: SidebarMode) => void;
  sidebarPanels: AppSidebarPanelsModel;
}

export type AppOutsideShellModel = Record<string, unknown>;
