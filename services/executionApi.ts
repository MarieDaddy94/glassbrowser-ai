import type { BrokerAction, TradeProposal } from '../types';

export type ExecutionTradeOptions = {
  forceBroker?: 'sim' | 'tradelocker' | 'mt5';
  executionMode?: 'suggest' | 'paper' | 'live' | 'shadow';
  runId?: string;
  autoConfigOverride?: Record<string, any> | null;
};

export type ExecutionCommand =
  | {
      kind: 'trade';
      proposal: TradeProposal;
      source: 'manual' | 'autopilot';
      opts?: ExecutionTradeOptions;
    }
  | {
      kind: 'broker_action';
      action: BrokerAction;
    }
  | {
      kind: 'ticket_order';
      args: Record<string, any>;
    }
  | {
      kind: 'bulk_cancel_orders';
      orderIds?: string[];
      symbol?: string;
      reason?: string;
      source?: string;
    }
  | {
      kind: 'bulk_close_positions';
      positionIds?: string[];
      symbol?: string;
      qty?: number;
      reason?: string;
      source?: string;
    };

export type ExecutionResult =
  | { ok: true; data?: any }
  | { ok: false; error: string; code?: string };

export type ExecutionApi = {
  execute: (command: ExecutionCommand) => Promise<ExecutionResult> | ExecutionResult;
};

export type ExecutionDependencies = {
  executeTrade: (
    proposal: TradeProposal,
    source: 'manual' | 'autopilot',
    opts?: ExecutionTradeOptions
  ) => Promise<any>;
  executeBrokerAction: (action: BrokerAction) => Promise<any>;
  executeTicketOrder: (args: Record<string, any>) => Promise<ExecutionResult> | ExecutionResult;
  executeBulkCancelOrders: (input: { orderIds?: string[]; symbol?: string; reason?: string; source?: string }) => Promise<ExecutionResult> | ExecutionResult;
  executeBulkClosePositions: (input: { positionIds?: string[]; symbol?: string; qty?: number; reason?: string; source?: string }) => Promise<ExecutionResult> | ExecutionResult;
};

export const createExecutionApi = (deps: ExecutionDependencies): ExecutionApi => ({
  execute: async (command: ExecutionCommand) => {
    if (command.kind === 'trade') {
      const res = await deps.executeTrade(command.proposal, command.source, command.opts);
      if (!res || res.ok === false) {
        return { ok: false, error: res?.error ? String(res.error) : 'Trade execution failed.' };
      }
      return { ok: true, data: res };
    }
    if (command.kind === 'broker_action') {
      const res = await deps.executeBrokerAction(command.action);
      if (!res || res.ok === false) {
        return { ok: false, error: res?.error ? String(res.error) : 'Broker action failed.', code: res?.code };
      }
      return { ok: true, data: res };
    }
    if (command.kind === 'ticket_order') {
      const res = await deps.executeTicketOrder(command.args);
      return res as ExecutionResult;
    }
    if (command.kind === 'bulk_cancel_orders') {
      const res = await deps.executeBulkCancelOrders(command);
      return res as ExecutionResult;
    }
    if (command.kind === 'bulk_close_positions') {
      const res = await deps.executeBulkClosePositions(command);
      return res as ExecutionResult;
    }
    return { ok: false, error: 'Unsupported execution command.' };
  }
});
