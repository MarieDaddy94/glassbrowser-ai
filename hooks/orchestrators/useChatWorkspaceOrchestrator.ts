import React from 'react';
import {
  createChatWorkspaceOrchestrator,
  type ChatWorkspaceOrchestratorOptions
} from '../../orchestrators/chatWorkspaceOrchestrator';

export const useChatWorkspaceOrchestrator = (options: ChatWorkspaceOrchestratorOptions) => {
  const orchestrator = React.useMemo(() => createChatWorkspaceOrchestrator(options), [options]);
  React.useEffect(() => {
    orchestrator.init();
    return () => orchestrator.dispose();
  }, [orchestrator]);
  return orchestrator;
};
