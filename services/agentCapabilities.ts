import { AgentCapabilities } from '../types';

export const DEFAULT_AGENT_CAPABILITIES: Required<AgentCapabilities> = {
  tools: true,
  broker: true,
  trade: true,
  autoExecute: true
};

export const normalizeAgentCapabilities = (raw?: AgentCapabilities | null): Required<AgentCapabilities> => {
  const base = { ...DEFAULT_AGENT_CAPABILITIES };
  if (!raw || typeof raw !== 'object') return base;
  return {
    tools: raw.tools !== false,
    broker: raw.broker !== false,
    trade: raw.trade !== false,
    autoExecute: raw.autoExecute !== false
  };
};

export const formatAgentCapabilities = (caps?: AgentCapabilities | null) => {
  const normalized = normalizeAgentCapabilities(caps);
  const entries: string[] = [];
  entries.push(normalized.trade ? 'trade' : 'no-trade');
  entries.push(normalized.autoExecute ? 'auto-exec' : 'no-auto');
  entries.push(normalized.broker ? 'broker' : 'no-broker');
  entries.push(normalized.tools ? 'tools' : 'no-tools');
  return entries.join(', ');
};

