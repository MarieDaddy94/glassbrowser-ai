import React from 'react';
import ErrorBoundary from '../ErrorBoundary';
import AppShell, { type AppShellProps } from './AppShell';
import AppShellContent from './AppShellContent';
import AppOutsideShellContent from './AppOutsideShellContent';
import type { AppOutsideShellModel, AppShellContentModel, AppSidebarPanelsModel } from './models';

export interface AppOrchestratorDeps {
  shell: Omit<AppShellContentModel, 'sidebarPanels'>;
  sidebarPanels: AppSidebarPanelsModel;
  outsideShell: AppOutsideShellModel;
  shellProps?: Omit<AppShellProps, 'isFullscreen' | 'children' | 'mainSlot'>;
}

export interface AppOrchestratorProps {
  deps: AppOrchestratorDeps;
  onError?: (input: { error: Error; errorInfo?: React.ErrorInfo }) => void;
}

const AppOrchestrator: React.FC<AppOrchestratorProps> = ({ deps, onError }) => {
  const { shell, sidebarPanels, outsideShell, shellProps } = deps;
  const nextShellProps: Omit<AppShellProps, 'isFullscreen'> = {
    ...(shellProps || {}),
    mainSlot: <AppShellContent ctx={{ ...shell, sidebarPanels }} />
  };

  return (
    <ErrorBoundary onError={onError}>
      <AppShell isFullscreen={shell.isFullscreen} {...nextShellProps} />
      <AppOutsideShellContent ctx={outsideShell} />
    </ErrorBoundary>
  );
};

export default AppOrchestrator;
