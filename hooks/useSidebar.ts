import { useState, useCallback } from 'react';
import { SidebarMode } from '../types';

export const useSidebar = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<SidebarMode>('chat');

  const toggleSidebar = useCallback(() => setIsOpen(prev => !prev), []);
  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => setIsOpen(false), []);
  const switchMode = useCallback((newMode: SidebarMode) => setMode(newMode), []);

  return {
    isOpen,
    mode,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    switchMode
  };
};
