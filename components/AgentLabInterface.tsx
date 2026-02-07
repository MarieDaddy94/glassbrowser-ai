import React from 'react';
import { Cpu } from 'lucide-react';
import AgentTestHarnessPanel from './AgentTestHarnessPanel';

interface AgentLabInterfaceProps {
  onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;
}

const AgentLabInterface: React.FC<AgentLabInterfaceProps> = ({ onRunActionCatalog }) => {
  return (
    <div className="flex flex-col h-full min-h-0 bg-[#060606] text-gray-200">
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Agent Lab</div>
            <div className="text-xs text-gray-400">Centralized test harness for agent scenarios and replays</div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <Cpu size={12} />
            Dev Tools
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <AgentTestHarnessPanel onRunActionCatalog={onRunActionCatalog} />
      </div>
    </div>
  );
};

export default AgentLabInterface;
