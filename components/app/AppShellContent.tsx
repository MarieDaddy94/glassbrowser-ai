import React from 'react';
import BrowserChrome from '../BrowserChrome';
import BrowserView from '../BrowserView';
import WindowFrame from '../WindowFrame';
import SidebarFrame from '../SidebarFrame';
import ToastContainer from '../ToastContainer';
import CommandPalette from '../CommandPalette';
import AppSidebarPanels from './AppSidebarPanels';
import type { AppShellContentModel } from './models';

export interface AppShellContentProps {
  ctx: AppShellContentModel;
}

const AppShellContent: React.FC<AppShellContentProps> = ({ ctx }) => {
  const {
    isFullscreen,
    notifications,
    dismissNotification,
    commandPaletteOpen,
    commandPaletteQuery,
    setCommandPaletteQuery,
    commandActions,
    closeCommandPalette,
    activeTab,
    tabs,
    navigate,
    handleRefresh,
    handleBack,
    handleForward,
    toggleSidebar,
    isOpen,
    toggleTabWatch,
    setActiveTabId,
    addTab,
    closeTab,
    toggleTabPin,
    setTabLabel,
    openSettings,
    toggleFullscreen,
    tradeLockerAccountSelectorModel,
    isTradingViewUrl,
    formatBrokerPrice,
    brokerBadgeSymbol,
    brokerBadgeBid,
    brokerBadgeAsk,
    brokerBadgeSpread,
    brokerBadgeAgeLabel,
    tvPriceLine,
    tvSymbolLine,
    activeTabId,
    updateTab,
    handleControlsReady,
    isSettingsOpen,
    isChartFullscreen,
    keepWatchedTabsMounted,
    closeSidebar,
    mode,
    handleSwitchSidebarMode,
    prefetchSidebarMode,
    sidebarPanels
  } = ctx;

  return (
    <>
      <ToastContainer notifications={notifications} onDismiss={dismissNotification} />
      <CommandPalette
        isOpen={commandPaletteOpen}
        query={commandPaletteQuery}
        onQueryChange={setCommandPaletteQuery}
        actions={commandActions}
        onClose={closeCommandPalette}
      />

      <WindowFrame variant={isFullscreen ? 'full' : 'framed'}>
        <BrowserChrome
          currentTab={activeTab}
          tabs={tabs}
          onNavigate={navigate}
          onRefresh={handleRefresh}
          onBack={handleBack}
          onForward={handleForward}
          toggleChat={toggleSidebar}
          isChatOpen={isOpen}
          onToggleWatch={toggleTabWatch}
          onSwitchTab={setActiveTabId}
          onAddTab={addTab}
          onCloseTab={closeTab}
          onTogglePin={toggleTabPin}
          onSetLabel={setTabLabel}
          onOpenSettings={openSettings}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          tradeLockerAccountSelector={tradeLockerAccountSelectorModel || undefined}
        />

        <div className="flex-1 relative flex overflow-hidden">
          {isTradingViewUrl(activeTab?.url || '') && (
            <div className="absolute top-3 left-3 z-20 pointer-events-none">
              <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 text-[10px] font-mono text-gray-200 shadow-lg">
                <div className="text-gray-400 uppercase tracking-wider">
                  TL Quote{brokerBadgeSymbol ? ` (${brokerBadgeSymbol})` : ''}
                </div>
                <div className="mt-1">
                  {brokerBadgeBid != null || brokerBadgeAsk != null ? (
                    <>
                      bid {formatBrokerPrice(brokerBadgeBid)} / ask {formatBrokerPrice(brokerBadgeAsk)}
                    </>
                  ) : (
                    <>bid -- / ask --</>
                  )}
                  {brokerBadgeSpread != null ? ` | sp ${formatBrokerPrice(brokerBadgeSpread)}` : ''}
                  {brokerBadgeAgeLabel ? ` | ${brokerBadgeAgeLabel}` : ''}
                </div>
                {tvPriceLine ? (
                  <div className="mt-1 text-gray-500">{tvPriceLine}</div>
                ) : null}
                {tvSymbolLine ? (
                  <div className="mt-1 text-gray-500">{tvSymbolLine}</div>
                ) : null}
              </div>
            </div>
          )}
          <BrowserView
            tabs={tabs}
            activeTabId={activeTabId}
            onTabUpdate={updateTab}
            onControlsReady={handleControlsReady}
            isOverlayActive={isSettingsOpen || isChartFullscreen}
            keepWatchedTabsMounted={keepWatchedTabsMounted}
          />

          <SidebarFrame
            isVisible={isOpen}
            onClose={closeSidebar}
            activeMode={mode}
            onSwitchMode={handleSwitchSidebarMode}
            onPrefetchMode={prefetchSidebarMode}
          >
            <AppSidebarPanels model={sidebarPanels} />
          </SidebarFrame>
        </div>
      </WindowFrame>
    </>
  );
};

export default AppShellContent;
