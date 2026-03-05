import React from 'react';
import type { SidebarMode, Tab } from '../../types';
import type { AppOutsideShellModel } from './models';

type AgentLike = {
  id?: unknown;
  name?: unknown;
};

type ChartSessionLike = {
  watchEnabled?: boolean;
  views?: Record<string, unknown> | null;
};

interface AppOutsideShellRuntimeModel {
  OnboardingGate: React.ComponentType<Record<string, unknown>>;
  SETTINGS_LAZY_FALLBACK: React.ReactNode;
  SIGNAL_TELEGRAM_STATUS_OPTIONS: unknown;
  SettingsModal: React.ComponentType<Record<string, unknown>>;
  SignalIntentComposer: React.ComponentType<Record<string, unknown>>;
  activeBrokerSymbol: string | null;
  agents: AgentLike[];
  assistSignalIntentParse: (...args: unknown[]) => unknown;
  brokerLinkConfig: Record<string, unknown>;
  brokerWatchSymbols: string[];
  chartSessions: { sessions?: ChartSessionLike[] };
  clearLiveErrors: () => void;
  createSignalIntent: (...args: unknown[]) => unknown;
  executeAgentToolRequest: (...args: unknown[]) => unknown;
  handleSettingsSaved: (...args: unknown[]) => unknown;
  healthSnapshot: unknown;
  keepWatchedTabsMounted: boolean;
  keepWatchedTabsMountedRequested: boolean;
  isLive: boolean;
  liveMode: string;
  chartWatchEnabled: boolean;
  isOpen: boolean;
  isSettingsOpen: boolean;
  liveErrors: unknown[];
  mode: SidebarMode;
  mt5BridgeAvailable: boolean;
  onboardingOpen: boolean;
  openSidebarMode: (mode: SidebarMode) => void;
  openaiKeyStored: boolean;
  openaiPermissionBlockedReason: string | null;
  openaiReadinessState: string;
  patternSymbols: string[];
  refreshOnboardingStatus: () => void;
  runActionCatalog: (...args: unknown[]) => unknown;
  runActionCatalogImmediate: (...args: unknown[]) => unknown;
  setBrokerLinkConfig: (next: Record<string, unknown>) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setSignalIntentComposerOpen: (open: boolean) => void;
  signalIntentComposerOpen: boolean;
  signalIntentFeatureFlags: { signalIntentV1Composer?: boolean };
  signalPrimarySymbol: string | null;
  signalSnapshotWarmupBars1d: number;
  signalSnapshotWarmupBars1w: number;
  signalSnapshotWarmupBarsDefault: number;
  signalSnapshotWarmupTimeoutMs: number;
  signalSymbols: string[];
  signalTelegramConfig: Record<string, unknown>;
  signalTimeframes: string[];
  startupPhase: string;
  symbolScopeSymbol: string | null;
  tabs: Tab[];
  tradeLockerPermissionBlockedReason: string | null;
  tradeLockerReadinessState: string;
  tradeLockerReady: boolean;
  updateSignalSnapshotWarmup: (patch: Record<string, unknown>) => void;
  updateSignalTelegram: (patch: Record<string, unknown>) => void;
}

export interface AppOutsideShellContentProps {
  ctx: AppOutsideShellModel;
}

const AppOutsideShellContent: React.FC<AppOutsideShellContentProps> = ({ ctx }) => {
  const {
    OnboardingGate,
    SETTINGS_LAZY_FALLBACK,
    SIGNAL_TELEGRAM_STATUS_OPTIONS,
    SettingsModal,
    SignalIntentComposer,
    activeBrokerSymbol,
    agents,
    assistSignalIntentParse,
    brokerLinkConfig,
    brokerWatchSymbols,
    chartSessions,
    clearLiveErrors,
    createSignalIntent,
    executeAgentToolRequest,
    handleSettingsSaved,
    healthSnapshot,
    keepWatchedTabsMounted,
    keepWatchedTabsMountedRequested,
    isLive,
    liveMode,
    chartWatchEnabled,
    isOpen,
    isSettingsOpen,
    liveErrors,
    mode,
    mt5BridgeAvailable,
    onboardingOpen,
    openSidebarMode,
    openaiKeyStored,
    openaiPermissionBlockedReason,
    openaiReadinessState,
    patternSymbols,
    refreshOnboardingStatus,
    runActionCatalog,
    runActionCatalogImmediate,
    setBrokerLinkConfig,
    setIsSettingsOpen,
    setSignalIntentComposerOpen,
    signalIntentComposerOpen,
    signalIntentFeatureFlags,
    signalPrimarySymbol,
    signalSnapshotWarmupBars1d,
    signalSnapshotWarmupBars1w,
    signalSnapshotWarmupBarsDefault,
    signalSnapshotWarmupTimeoutMs,
    signalSymbols,
    signalTelegramConfig,
    signalTimeframes,
    startupPhase,
    symbolScopeSymbol,
    tabs,
    tradeLockerPermissionBlockedReason,
    tradeLockerReadinessState,
    tradeLockerReady,
    updateSignalSnapshotWarmup,
    updateSignalTelegram,
  } = ctx as AppOutsideShellRuntimeModel;

  return (
    <>
      {signalIntentFeatureFlags.signalIntentV1Composer && signalIntentComposerOpen && (
        <React.Suspense fallback={null}>
          <SignalIntentComposer
            open={signalIntentComposerOpen}
            onClose={() => setSignalIntentComposerOpen(false)}
            agents={(agents || []).map((agent) => ({
              id: String(agent?.id || '').trim(),
              name: agent?.name ? String(agent.name) : null
            })).filter((agent) => agent.id)}
            knownSymbols={Array.from(
              new Set(
                [
                  ...(Array.isArray(signalSymbols) ? signalSymbols : []),
                  ...(Array.isArray(patternSymbols) ? patternSymbols : []),
                  ...(Array.isArray(brokerWatchSymbols) ? brokerWatchSymbols : []),
                  symbolScopeSymbol,
                  activeBrokerSymbol,
                  signalPrimarySymbol
                ]
                  .map((entry) => String(entry || '').trim().toUpperCase())
                  .filter(Boolean)
              )
            )}
            defaultSymbol={signalPrimarySymbol || symbolScopeSymbol || activeBrokerSymbol || null}
            defaultTimeframes={signalTimeframes}
            onAssistParse={assistSignalIntentParse}
            onCreateIntent={createSignalIntent}
          />
        </React.Suspense>
      )}

      <OnboardingGate
        open={onboardingOpen}
        startupPhase={startupPhase}
        openaiReady={openaiKeyStored}
        openaiState={openaiReadinessState}
        tradeLockerReady={tradeLockerReady}
        tradeLockerState={tradeLockerReadinessState}
        openaiBlockedReason={openaiPermissionBlockedReason}
        tradeLockerBlockedReason={tradeLockerPermissionBlockedReason}
        mt5Available={mt5BridgeAvailable}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTradeLocker={() => openSidebarMode('tradelocker')}
        onOpenMt5={() => openSidebarMode('mt5')}
        onRefresh={refreshOnboardingStatus}
      />

      {isSettingsOpen && (
        <React.Suspense fallback={SETTINGS_LAZY_FALLBACK}>
          <SettingsModal 
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onSave={handleSettingsSaved}
            onRunActionCatalog={runActionCatalog}
            onRunActionCatalogImmediate={runActionCatalogImmediate}
            onExecuteAgentTool={executeAgentToolRequest}
            liveErrors={liveErrors}
            onClearLiveErrors={clearLiveErrors}
            brokerLinkConfig={brokerLinkConfig}
            onBrokerLinkChange={setBrokerLinkConfig}
            signalTelegramConfig={signalTelegramConfig}
            signalTelegramStatusOptions={SIGNAL_TELEGRAM_STATUS_OPTIONS}
            onSignalTelegramChange={updateSignalTelegram}
            signalSnapshotWarmupConfig={{
              barsDefault: signalSnapshotWarmupBarsDefault,
              bars1d: signalSnapshotWarmupBars1d,
              bars1w: signalSnapshotWarmupBars1w,
              timeoutMs: signalSnapshotWarmupTimeoutMs
            }}
            onSignalSnapshotWarmupChange={updateSignalSnapshotWarmup}
            healthSnapshot={healthSnapshot}
            performance={{
              keepWatchedTabsMounted,
              keepWatchedTabsMountedRequested,
              isLive,
              liveMode,
              chatOpen: isOpen,
              sidebarMode: mode,
              chartWatchEnabled,
              watchedTabs: {
                total: tabs.filter((t) => !!t.isWatched).length,
                manual: tabs.filter((t) => !!t.isWatched && t.watchSource === 'manual').length,
                auto: tabs.filter((t) => !!t.isWatched && t.watchSource === 'auto').length
              },
              chartSessions: {
                total: (chartSessions.sessions || []).length,
                watchEnabled: (chartSessions.sessions || []).filter((s) => s && s.watchEnabled !== false).length,
                assignedViews: (chartSessions.sessions || []).reduce((acc, s) => {
                  if (!s || !s.views) return acc;
                  return acc + Object.values(s.views).filter(Boolean).length;
                }, 0)
              }
            }}
          />
        </React.Suspense>
      )}
      
      {/* Background Ambience styles */}
      <style>{`
        @keyframes loading-bar {
          0% { width: 0%; margin-left: 0; }
          50% { width: 70%; margin-left: 0; }
          100% { width: 100%; margin-left: 100%; }
        }
        .animate-loading-bar {
          animation: loading-bar 1.5s infinite linear;
        }
        .animate-slideInRight {
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </>
  );
};

export default AppOutsideShellContent;
