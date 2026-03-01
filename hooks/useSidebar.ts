import { useState, useCallback } from 'react';
import { SidebarMode } from '../types';

export const useSidebar = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<SidebarMode>('chartchat');
  const canonicalizeMode = useCallback((nextMode: SidebarMode): SidebarMode => {
    if (nextMode === 'chat') return 'chartchat';
    return nextMode;
  }, []);

  const toggleSidebar = useCallback(() => setIsOpen(prev => !prev), []);
  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => setIsOpen(false), []);
  const switchMode = useCallback((newMode: SidebarMode) => setMode(canonicalizeMode(newMode)), [canonicalizeMode]);

  return {
    isOpen,
    mode,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    switchMode
  };
};
