import React, { useEffect, useMemo, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Tab } from '../types';
import { coerceUrlString } from '../services/url';

export interface BrowserControls {
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  captureTab: (tabId: string, options?: { format?: 'jpeg' | 'png'; quality?: number; width?: number; height?: number }) => Promise<{ mimeType: string; data: string } | null>;
  executeInTab?: (tabId: string, script: string) => Promise<any>;
}

interface BrowserViewProps {
  tabs: Tab[];
  activeTabId: string;
  onTabUpdate: (id: string, patch: Partial<Tab>) => void;
  onControlsReady?: (controls: BrowserControls) => void;
  isOverlayActive?: boolean;
  keepWatchedTabsMounted?: boolean;
}

const detectElectron = () => {
  try {
    return Boolean((window as any).glass?.isElectron) || navigator.userAgent.toLowerCase().includes('electron');
  } catch {
    return false;
  }
};

const BrowserView: React.FC<BrowserViewProps> = ({ tabs, activeTabId, onTabUpdate, onControlsReady, isOverlayActive, keepWatchedTabsMounted }) => {
  const isElectron = useMemo(detectElectron, []);
  const webviewsRef = useRef<Record<string, any>>({});
  const shouldKeepWatchedMounted = keepWatchedTabsMounted !== false;

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const getActiveWebview = () => webviewsRef.current[activeTabId];

  const captureTab = async (
    tabId: string,
    options?: { format?: 'jpeg' | 'png'; quality?: number; width?: number; height?: number }
  ): Promise<{ mimeType: string; data: string } | null> => {
    if (!isElectron) return null;
    const el = webviewsRef.current[tabId];
    if (!el) return null;

    // Prefer capturing via preload -> webContents for consistent encoding.
    try {
      const rawId = el.getWebContentsId?.();
      const wcId = typeof rawId === 'number' ? rawId : Number(rawId);
      const capture = (window as any).glass?.captureWebContents;
      if (Number.isFinite(wcId) && typeof capture === 'function') {
        return await capture(wcId, options || { format: 'jpeg', quality: 60, width: 1280 });
      }
    } catch {
      // ignore
    }

    // Fallback to webview.capturePage() if available.
    try {
      const img = await el.capturePage?.();
      const dataUrl = img?.toDataURL?.();
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        const [meta, b64] = dataUrl.split(',', 2);
        const mimeType = meta?.match(/data:(.*?);/)?.[1] || 'image/png';
        if (b64) return { mimeType, data: b64 };
      }
    } catch {
      // ignore
    }

    return null;
  };

  useEffect(() => {
    if (!onControlsReady) return;
    onControlsReady({
      goBack: () => getActiveWebview()?.goBack?.(),
      goForward: () => getActiveWebview()?.goForward?.(),
      reload: () => getActiveWebview()?.reload?.(),
      stop: () => getActiveWebview()?.stop?.(),
      captureTab,
      executeInTab: async (tabId: string, script: string) => {
        if (!isElectron) return null;
        const el = webviewsRef.current[tabId];
        if (!el?.executeJavaScript) return null;
        try {
          return await el.executeJavaScript(String(script), true);
        } catch {
          return null;
        }
      }
    });
  }, [activeTabId, onControlsReady]);

  const registerWebview = (tabId: string) => (el: any | null) => {
    if (!el) {
      delete webviewsRef.current[tabId];
      return;
    }
    webviewsRef.current[tabId] = el;
    if (el.__glassListenersAttached) return;
    el.__glassListenersAttached = true;

    const updateNavState = () => {
      const nextUrl = coerceUrlString(el.getURL?.() || el.src);
      onTabUpdate(tabId, {
        canGoBack: el.canGoBack?.() || false,
        canGoForward: el.canGoForward?.() || false,
        ...(nextUrl ? { url: nextUrl } : {})
      });
    };

    el.addEventListener('did-start-loading', () => onTabUpdate(tabId, { isLoading: true }));
    el.addEventListener('did-stop-loading', () => {
      onTabUpdate(tabId, { isLoading: false });
      updateNavState();
    });
    el.addEventListener('page-title-updated', (e: any) => {
      onTabUpdate(tabId, { title: e.title || el.getTitle?.() || 'New Tab' });
    });
    el.addEventListener('page-favicon-updated', (e: any) => {
      const fav = e.favicons?.[0];
      if (fav) onTabUpdate(tabId, { favicon: fav });
    });
    el.addEventListener('did-navigate', (e: any) => {
      const nextUrl = coerceUrlString(e?.url);
      onTabUpdate(tabId, { ...(nextUrl ? { url: nextUrl } : {}), isLoading: false });
      updateNavState();
    });
    el.addEventListener('did-navigate-in-page', (e: any) => {
      const nextUrl = coerceUrlString(e?.url);
      onTabUpdate(tabId, nextUrl ? { url: nextUrl } : {});
      updateNavState();
    });
  };

  return (
    <div className="flex-1 bg-white relative">
      {activeTab?.isLoading && (
        <div className="absolute top-0 left-0 w-full h-1 bg-blue-100/20 overflow-hidden z-20">
          <div className="h-full bg-blue-500 animate-loading-bar"></div>
        </div>
      )}
      
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`absolute inset-0 ${
            isOverlayActive
              ? 'hidden'
              : tab.id === activeTabId
                ? 'block'
                : shouldKeepWatchedMounted && (tab.isWatched || tab.aiPinned)
                  ? 'block opacity-0 pointer-events-none'
                  : 'hidden'
          }`}
        >
          {isElectron ? (
            <webview
              ref={registerWebview(tab.id)}
              src={tab.url}
              className="w-full h-full border-none bg-white"
              allowpopups
              partition="persist:glass"
              webpreferences="contextIsolation=yes, sandbox=yes, nodeIntegration=no, webSecurity=yes, allowRunningInsecureContent=no"
            />
          ) : (
            <iframe 
              src={tab.url} 
              className="w-full h-full border-none bg-white"
              title="Browser Content"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => onTabUpdate(tab.id, { isLoading: false })}
            />
          )}
        </div>
      ))}
      
      {/* Fallback/Overlay for blocked sites */}
      <div className="absolute bottom-4 left-4 pointer-events-none z-10">
         <div className="bg-black/70 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-md flex items-center gap-2">
            <ShieldAlert size={12} className="text-yellow-400"/>
            Some sites may refuse connection in this preview.
         </div>
      </div>
    </div>
  );
};

const MemoBrowserView = React.memo(BrowserView);
MemoBrowserView.displayName = 'BrowserView';

export default MemoBrowserView;
