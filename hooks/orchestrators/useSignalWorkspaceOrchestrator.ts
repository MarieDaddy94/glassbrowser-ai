import React from 'react';
import {
  createSignalWorkspaceOrchestrator,
  type SignalWorkspaceOrchestratorOptions
} from '../../orchestrators/signalWorkspaceOrchestrator';

export const useSignalWorkspaceOrchestrator = (options: SignalWorkspaceOrchestratorOptions) => {
  const orchestrator = React.useMemo(() => createSignalWorkspaceOrchestrator(options), [options]);
  React.useEffect(() => {
    orchestrator.init();
    return () => orchestrator.dispose();
  }, [orchestrator]);
  return orchestrator;
};
