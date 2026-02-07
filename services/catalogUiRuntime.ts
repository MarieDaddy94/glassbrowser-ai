type ActionResult = { ok: boolean; error?: string; data?: any };

export type runCatalogUiRuntimeInput = {
  actionId: string;
  payload: Record<string, any>;
  requestContext?: Record<string, any> | null;
  context: Record<string, any>;
};

export async function runCatalogUiRuntime(
  runtimeInput: runCatalogUiRuntimeInput
): Promise<{ handled: boolean; result?: ActionResult }> {
  const actionId = String(runtimeInput.actionId || '').trim();
  const payload = runtimeInput.payload && typeof runtimeInput.payload === 'object' ? runtimeInput.payload : {};
  const input = (runtimeInput.requestContext && typeof runtimeInput.requestContext === 'object'
    ? runtimeInput.requestContext
    : {}) as any;
  const context = runtimeInput.context && typeof runtimeInput.context === 'object' ? runtimeInput.context : {};
  const {
  sidebarControlRef,
  resolveSidebarMode,
  openCommandPalette,
  closeCommandPalette,
  setCommandPaletteOpen,
  setIsSettingsOpen,
  addTab,
  updateTab,
  tabsRef,
  activeTabIdRef,
  setActiveTabId,
  closeTab,
  setTabLabel,
  browserControlsRef,
  isFullscreen,
  setIsFullscreen
} = context as any;
  
    if (actionId === 'ui.sidebar.open' || actionId === 'ui.sidebar.close' || actionId === 'ui.sidebar.toggle') {
      const sidebar = sidebarControlRef.current || {};
      if (actionId === 'ui.sidebar.open') {
        if (!sidebar.openSidebar) return { ok: false, error: 'Sidebar controls unavailable.' };
        sidebar.openSidebar();
        return { ok: true, data: { open: true } };
      }
      if (actionId === 'ui.sidebar.close') {
        if (!sidebar.closeSidebar) return { ok: false, error: 'Sidebar controls unavailable.' };
        sidebar.closeSidebar();
        return { ok: true, data: { open: false } };
      }
      if (sidebar.toggleSidebar) {
        sidebar.toggleSidebar();
        return { ok: true, data: { toggled: true } };
      }
      return { ok: false, error: 'Sidebar controls unavailable.' };
    }

    if (actionId === 'ui.sidebar.setMode' || actionId === 'ui.panel.open') {
      const target = payload.mode || payload.panel || payload.target || input?.mode;
      const resolved = resolveSidebarMode(target);
      if (!resolved) return { ok: false, error: 'Unknown sidebar panel.' };
      const shouldOpen = actionId === 'ui.panel.open'
        ? true
        : payload.open !== false && payload.open !== 'false';
      const sidebar = sidebarControlRef.current || {};
      if (!sidebar.openSidebarMode && !sidebar.switchMode) {
        return { ok: false, error: 'Sidebar controls unavailable.' };
      }
      if (shouldOpen && sidebar.openSidebarMode) {
        sidebar.openSidebarMode(resolved);
      } else if (sidebar.switchMode) {
        sidebar.switchMode(resolved);
      }
      return { ok: true, data: { mode: resolved, opened: shouldOpen } };
    }

    if (actionId === 'ui.command_palette.open' || actionId === 'ui.command_palette.close' || actionId === 'ui.command_palette.toggle') {
      if (actionId === 'ui.command_palette.open') {
        openCommandPalette();
        return { ok: true, data: { open: true } };
      }
      if (actionId === 'ui.command_palette.close') {
        closeCommandPalette();
        return { ok: true, data: { open: false } };
      }
      setCommandPaletteOpen((prev) => !prev);
      return { ok: true, data: { toggled: true } };
    }

    if (actionId === 'ui.modal.open' || actionId === 'ui.modal.close') {
      const modal = String(payload.modal || payload.id || 'settings').trim().toLowerCase();
      if (modal !== 'settings') {
        return { ok: false, error: 'Unsupported modal.' };
      }
      setIsSettingsOpen(actionId === 'ui.modal.open');
      return { ok: true, data: { modal, open: actionId === 'ui.modal.open' } };
    }

    if (actionId === 'ui.tab.open') {
      const url = String(payload.url || payload.href || '').trim();
      if (!url) return { ok: false, error: 'Tab open requires url.' };
      const tabId = addTab(url);
      const patch: Record<string, any> = {};
      if (typeof payload.pinned === 'boolean') patch.aiPinned = payload.pinned;
      if (typeof payload.aiPinned === 'boolean') patch.aiPinned = payload.aiPinned;
      if (payload.label) patch.aiLabel = String(payload.label);
      if (typeof payload.watch === 'boolean') {
        patch.isWatched = payload.watch;
        patch.watchSource = 'manual';
      }
      if (typeof payload.watched === 'boolean') {
        patch.isWatched = payload.watched;
        patch.watchSource = 'manual';
      }
      if (Object.keys(patch).length > 0 && tabId) {
        updateTab(tabId, patch);
      }
      return { ok: true, data: { tabId, url } };
    }

    const tabsNow = tabsRef.current || [];
    const normalizeTabUrl = (raw: any) => {
      const value = String(raw || '').trim();
      if (!value) return '';
      try {
        return new URL(value).toString();
      } catch {
        return value;
      }
    };
    const resolveTab = (payloadBlock: Record<string, any>) => {
      const id = String(payloadBlock.tabId || payloadBlock.id || '').trim();
      if (id) return tabsNow.find((tab) => tab.id === id) || null;
      const idx = Number(payloadBlock.index);
      if (Number.isFinite(idx) && idx >= 0) return tabsNow[Math.floor(idx)] || null;
      const url = normalizeTabUrl(payloadBlock.url || payloadBlock.href);
      if (url) {
        const exact = tabsNow.find((tab) => normalizeTabUrl(tab.url) === url);
        if (exact) return exact;
        const partial = tabsNow.find((tab) => String(tab.url || '').includes(url));
        if (partial) return partial;
      }
      const activeId = activeTabIdRef.current;
      if (payloadBlock.active && activeId) {
        return tabsNow.find((tab) => tab.id === activeId) || null;
      }
      return null;
    };

    if (actionId === 'ui.tab.switch') {
      const target = resolveTab(payload);
      if (!target?.id) return { ok: false, error: 'Tab not found.' };
      setActiveTabId(target.id);
      return { ok: true, data: { tabId: target.id } };
    }

    if (actionId === 'ui.tab.close') {
      const target = resolveTab(payload);
      if (!target?.id) return { ok: false, error: 'Tab not found.' };
      closeTab(target.id);
      return { ok: true, data: { tabId: target.id } };
    }

    if (actionId === 'ui.tab.pin') {
      const target = resolveTab(payload);
      if (!target?.id) return { ok: false, error: 'Tab not found.' };
      const enabled = typeof payload.pinned === 'boolean'
        ? payload.pinned
        : typeof payload.enabled === 'boolean'
          ? payload.enabled
          : true;
      const patch: Record<string, any> = { aiPinned: enabled };
      if (payload.label) patch.aiLabel = String(payload.label);
      updateTab(target.id, patch);
      return { ok: true, data: { tabId: target.id, pinned: enabled } };
    }

    if (actionId === 'ui.tab.label.set') {
      const target = resolveTab(payload);
      if (!target?.id) return { ok: false, error: 'Tab not found.' };
      const label = payload.label != null ? String(payload.label) : '';
      setTabLabel(target.id, label);
      return { ok: true, data: { tabId: target.id, label } };
    }

    if (actionId === 'ui.tab.watch') {
      const target = resolveTab(payload);
      if (!target?.id) return { ok: false, error: 'Tab not found.' };
      const enabled = typeof payload.watch === 'boolean'
        ? payload.watch
        : typeof payload.enabled === 'boolean'
          ? payload.enabled
          : true;
      updateTab(target.id, { isWatched: enabled, watchSource: 'manual' });
      return { ok: true, data: { tabId: target.id, watched: enabled } };
    }

    if (actionId === 'ui.window.fullscreen.toggle') {
      const enabled = payload.enabled !== undefined ? !!payload.enabled : !isFullscreen;
      setIsFullscreen(enabled);
      return { ok: true, data: { enabled } };
    }

    if (actionId === 'ui.tab.navigate') {
      const target = resolveTab(payload) || (activeTabIdRef.current ? tabsNow.find((tab) => tab.id === activeTabIdRef.current) : null);
      if (!target?.id) return { ok: false, error: 'Tab not found.' };
      const nextUrl = normalizeTabUrl(payload.url || payload.href);
      if (!nextUrl) return { ok: false, error: 'URL is required.' };
      updateTab(target.id, { url: nextUrl });
      setActiveTabId(target.id);
      return { ok: true, data: { tabId: target.id, url: nextUrl } };
    }

    if (actionId === 'ui.tab.back') {
      browserControlsRef.current?.goBack();
      return { ok: true, data: { navigated: 'back' } };
    }

    if (actionId === 'ui.tab.forward') {
      browserControlsRef.current?.goForward();
      return { ok: true, data: { navigated: 'forward' } };
    }

    if (actionId === 'ui.tab.reload') {
      browserControlsRef.current?.reload();
      return { ok: true, data: { reloaded: true } };
    }


  return { handled: false };
}