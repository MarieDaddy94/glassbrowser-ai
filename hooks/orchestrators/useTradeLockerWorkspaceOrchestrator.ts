import React from 'react';
import {
  createTradeLockerWorkspaceOrchestrator,
  type TradeLockerWorkspaceOrchestratorOptions
} from '../../orchestrators/tradeLockerWorkspaceOrchestrator';

export const useTradeLockerWorkspaceOrchestrator = (
  options: TradeLockerWorkspaceOrchestratorOptions
) => {
  const orchestrator = React.useMemo(() => createTradeLockerWorkspaceOrchestrator(options), [options]);
  React.useEffect(() => {
    orchestrator.init();
    return () => orchestrator.dispose();
  }, [orchestrator]);
  return orchestrator;
};
