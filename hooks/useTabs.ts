import { useMemo, useState, useCallback } from 'react';
import { Tab } from '../types';
import { coerceUrlString } from '../services/url';

const STORAGE = {
  autoWatchTradingView: 'glass_auto_watch_tradingview'
};

const detectElectron = () => {
  try {
    return Boolean((window as any).glass?.isElectron) || navigator.userAgent.toLowerCase().includes('electron');
  } catch {
    return false;
  }
};

const readBool = (key: string, fallback: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
  } catch {
    // ignore
  }
  return fallback;
};

const isTradingViewUrl = (url: string) => {
  try {
    const u = new URL(url);
    return /(^|\\.)tradingview\\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
};

export const useTabs = (initialUrl: string) => {
  const isElectron = useMemo(detectElectron, []);
  const normalizedInitialUrl = useMemo(() => coerceUrlString(initialUrl) || 'about:blank', [initialUrl]);
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', title: 'New Tab', url: normalizedInitialUrl, isLoading: true, isWatched: false }
  ]);
  const [activeTabId, setActiveTabId] = useState('1');

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const applyAutoWatch = useCallback((tab: Tab): Tab => {
    const url = coerceUrlString(tab.url) || 'about:blank';
    const needsUrlPatch = url !== tab.url;

    if (!isElectron) {
      return needsUrlPatch ? { ...tab, url } : tab;
    }

    if (!readBool(STORAGE.autoWatchTradingView, true)) {
      return needsUrlPatch ? { ...tab, url } : tab;
    }

    if (tab.watchSource === 'manual') {
      return needsUrlPatch ? { ...tab, url } : tab;
    }

    if (isTradingViewUrl(url)) {
      if (tab.isWatched && !needsUrlPatch) return tab;
      return { ...tab, url, isWatched: true, watchSource: 'auto' };
    }

    if (tab.watchSource === 'auto' && tab.isWatched) {
      return { ...tab, url, isWatched: false, watchSource: undefined };
    }

    return needsUrlPatch ? { ...tab, url } : tab;
  }, [isElectron]);

  const navigate = useCallback((rawUrl: string) => {
    const url = coerceUrlString(rawUrl) || 'about:blank';
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? applyAutoWatch({ ...tab, url, isLoading: true, title: tab.title || 'New Tab' })
        : tab
    ));
  }, [activeTabId, applyAutoWatch]);

  const refresh = useCallback(() => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, isLoading: true } 
        : tab
    ));
  }, [activeTabId]);

  const toggleTabWatch = useCallback((tabId: string) => {
      setTabs(prev => prev.map(tab => 
        tab.id === tabId 
            ? { ...tab, isWatched: !Boolean(tab.isWatched), watchSource: 'manual' }
            : tab
      ));
  }, []);

  const addTab = useCallback((rawUrl: string = normalizedInitialUrl) => {
    const url = coerceUrlString(rawUrl) || normalizedInitialUrl;
    const id = Date.now().toString();
    const newTab: Tab = {
      id,
      title: 'New Tab',
      url,
      isLoading: true,
      isWatched: false
    };
    setTabs(prev => [...prev, applyAutoWatch(newTab)]);
    setActiveTabId(id);
    return id;
  }, [applyAutoWatch, normalizedInitialUrl]);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) {
        const id = Date.now().toString();
        const fallback: Tab = { id, title: 'New Tab', url: normalizedInitialUrl, isLoading: true, isWatched: false };
        setActiveTabId(id);
        return [applyAutoWatch(fallback)];
      }
      if (activeTabId === tabId) {
        setActiveTabId(next[0].id);
      }
      return next;
    });
  }, [activeTabId, applyAutoWatch, normalizedInitialUrl]);

  const updateTab = useCallback((tabId: string, patch: Partial<Tab>) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id !== tabId) return tab;
      const nextPatch: any = { ...(patch as any) };
      if ('url' in nextPatch) {
        const url = coerceUrlString(nextPatch.url);
        if (url) nextPatch.url = url;
        else delete nextPatch.url;
      }
      const next = { ...tab, ...nextPatch };
      return applyAutoWatch(next);
    }));
  }, [applyAutoWatch]);

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    navigate,
    refresh,
    toggleTabWatch,
    addTab,
    closeTab,
    updateTab
  };
};
