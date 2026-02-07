import type { Agent, Memory, SetupSignal, SetupWatcher, TradeProposal } from '../types';
import { sendMessageToOpenAI } from './openaiService';
import { normalizeSymbolKey } from './symbols';

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

type AgentRunnerAuditEvent = {
  eventType: string;
  level?: 'info' | 'warn' | 'error';
  payload?: Record<string, any>;
};

export type AgentRunnerInput = {
  agent: Agent;
  signal: SetupSignal;
  watcher?: SetupWatcher | null;
  symbol?: string | null;
  timeframe?: string | null;
  strategy?: string | null;
  context?: string | null;
  quote?: any;
  allAgents?: Agent[];
  memories?: Memory[];
  monitoredUrls?: string[];
  maxCommandsPerMinute?: number;
  reasoningEffort?: ReasoningEffort;
  sessionId?: string | null;
};

export type AgentRunnerDecision = {
  ok: boolean;
  proposal?: TradeProposal | null;
  text?: string;
  error?: string;
  code?: string;
  sessionId?: string;
};

export type AgentRunnerStatus = {
  activeSymbols: string[];
  activeSessions?: Array<{
    sessionId: string;
    agentId?: string | null;
    symbol?: string | null;
    startedAtMs?: number | null;
  }>;
  lastRunAtMs: number | null;
};

export type AgentRunnerCancelResult = {
  ok: boolean;
  canceled?: string[];
  canceledCount?: number;
  error?: string;
};

type AgentRunnerDeps = {
  sendMessage?: typeof sendMessageToOpenAI;
  now?: () => number;
  onAudit?: (event: AgentRunnerAuditEvent) => void;
};

const clampString = (value: string, max = 1200) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
};

const formatQuote = (quote: any) => {
  if (!quote || typeof quote !== 'object') return '';
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  const mid = Number(quote.mid);
  const spread = Number(quote.spread);
  const parts = [
    Number.isFinite(bid) ? `bid ${bid}` : '',
    Number.isFinite(ask) ? `ask ${ask}` : '',
    Number.isFinite(mid) ? `mid ${mid}` : '',
    Number.isFinite(spread) ? `spread ${spread}` : ''
  ].filter(Boolean);
  return parts.join(' | ');
};

export const createAgentRunner = (deps: AgentRunnerDeps = {}) => {
  const sendMessage = deps.sendMessage || sendMessageToOpenAI;
  const nowFn = deps.now || (() => Date.now());
  const onAudit = deps.onAudit;
  const activeSymbols = new Map<string, number>();
  const agentRate = new Map<string, number[]>();
  const activeSessions = new Map<string, { symbolKey?: string; symbol?: string; agentId?: string; startedAtMs?: number }>();
  const canceledSessions = new Set<string>();
  let lastRunAtMs: number | null = null;

  const pruneRateWindow = (agentId: string, now: number) => {
    const windowMs = 60_000;
    const list = agentRate.get(agentId) || [];
    const next = list.filter((ts) => now - ts <= windowMs);
    agentRate.set(agentId, next);
    return next;
  };

  const evaluateSignal = async (input: AgentRunnerInput): Promise<AgentRunnerDecision> => {
    const agent = input.agent;
    if (!agent) return { ok: false, error: 'Agent is required.', code: 'agent_missing' };
    const now = nowFn();
    lastRunAtMs = now;
    const sessionId = String(input.sessionId || '').trim() || `ar_${now}_${Math.random().toString(16).slice(2, 8)}`;

    const runnerBridge = typeof window !== 'undefined' ? (window as any)?.glass?.agentRunner : null;
    if (runnerBridge?.evaluateSignal) {
      try {
        const res = await runnerBridge.evaluateSignal({
          agent,
          signal: input.signal,
          watcher: input.watcher,
          symbol: input.symbol,
          timeframe: input.timeframe,
          strategy: input.strategy,
          context: input.context,
          quote: input.quote,
          maxCommandsPerMinute: input.maxCommandsPerMinute,
          reasoningEffort: input.reasoningEffort,
          sessionId
        });
        const resolvedSessionId = res?.sessionId || sessionId;
        if (res?.ok) {
          return { ok: true, proposal: res.proposal || null, text: res.text || '', sessionId: resolvedSessionId };
        }
        if (res && res.ok === false) {
          return {
            ok: false,
            error: res.error || 'Agent runner failed.',
            code: res.code || 'agent_error',
            sessionId: resolvedSessionId
          };
        }
      } catch (err: any) {
        const message = err?.message ? String(err.message) : 'Agent runner failed.';
        return { ok: false, error: message, code: 'agent_error', sessionId };
      }
    }

    const signal = input.signal || ({} as SetupSignal);
    const watcher = input.watcher || null;
    const symbol = String(input.symbol || signal.symbol || watcher?.symbol || '').trim();
    const timeframe = String(input.timeframe || signal.timeframe || watcher?.timeframe || '').trim();
    const strategy = String(input.strategy || signal.payload?.strategy || watcher?.strategy || '').trim();
    const symbolKey = normalizeSymbolKey(symbol);

    const maxPerMinute = Number.isFinite(Number(input.maxCommandsPerMinute))
      ? Math.max(0, Math.floor(Number(input.maxCommandsPerMinute)))
      : 0;
    if (maxPerMinute > 0) {
      const recent = pruneRateWindow(agent.id, now);
      if (recent.length >= maxPerMinute) {
        return { ok: false, error: 'Agent rate limit reached.', code: 'rate_limited' };
      }
      recent.push(now);
      agentRate.set(agent.id, recent);
    }

    if (symbolKey && activeSymbols.has(symbolKey)) {
      return { ok: false, error: 'Agent already evaluating this symbol.', code: 'agent_busy' };
    }

    activeSessions.set(sessionId, { symbolKey, symbol, agentId: agent.id, startedAtMs: now });
    if (symbolKey) activeSymbols.set(symbolKey, now);
    try {
      const details = signal?.payload?.details && typeof signal.payload.details === 'object'
        ? signal.payload.details
        : {};
      const sideRaw = String(signal?.payload?.side || signal?.payload?.action || '').toUpperCase();
      const side = sideRaw === 'SELL' ? 'SELL' : sideRaw === 'BUY' ? 'BUY' : '';
      const entryPrice = Number(details.entryPrice);
      const stopLoss = Number(details.stopLoss);
      const takeProfit = Number(details.takeProfit);
      const signalType = signal?.payload?.signalType || null;
      const quoteLine = formatQuote(input.quote);

      const promptLines = [
        'Evaluate the setup signal and decide if it should trade.',
        'If you want to trade, call proposeTrade with symbol, action, entryPrice, stopLoss, takeProfit, and reason.',
        'If you do NOT want to trade, reply with "NO_TRADE: <reason>" only.',
        `Signal: ${signalType || 'setup_signal'} ${side || ''}`.trim(),
        symbol ? `Symbol: ${symbol}` : '',
        timeframe ? `Timeframe: ${timeframe}` : '',
        strategy ? `Strategy: ${strategy}` : '',
        Number.isFinite(entryPrice) ? `Entry: ${entryPrice}` : '',
        Number.isFinite(stopLoss) ? `Stop: ${stopLoss}` : '',
        Number.isFinite(takeProfit) ? `TP: ${takeProfit}` : '',
        watcher?.id ? `Watcher: ${watcher.id}` : '',
        quoteLine ? `Quote: ${quoteLine}` : ''
      ].filter(Boolean);

      const context = input.context ? String(input.context) : '';
      const res = await sendMessage(
        [],
        clampString(promptLines.join('\n')),
        context,
        null,
        Array.isArray(input.allAgents) && input.allAgents.length > 0 ? input.allAgents : [agent],
        Array.isArray(input.memories) ? input.memories : [],
        Array.isArray(input.monitoredUrls) ? input.monitoredUrls : [],
        { agent, reasoningEffort: input.reasoningEffort }
      );

      if (res?.tradeProposal) {
        const proposal = {
          ...res.tradeProposal,
          agentId: res.tradeProposal.agentId || agent.id,
          reason: res.tradeProposal.reason || res.text || 'Agent decision'
        };
        onAudit?.({
          eventType: 'agent_runner_decision',
          level: 'info',
          payload: { symbol, timeframe, strategy, agentId: agent.id, decision: 'trade' }
        });
        if (canceledSessions.has(sessionId)) {
          return { ok: false, error: 'Agent runner canceled.', code: 'agent_canceled', sessionId };
        }
        return { ok: true, proposal, text: res.text, sessionId };
      }

      const text = res?.text ? String(res.text) : '';
      onAudit?.({
        eventType: 'agent_runner_decision',
        level: 'info',
        payload: { symbol, timeframe, strategy, agentId: agent.id, decision: 'no_trade' }
      });
      if (canceledSessions.has(sessionId)) {
        return { ok: false, error: 'Agent runner canceled.', code: 'agent_canceled', sessionId };
      }
      return { ok: true, proposal: null, text, sessionId };
    } catch (err: any) {
      onAudit?.({
        eventType: 'agent_runner_error',
        level: 'warn',
        payload: { symbol, timeframe, strategy, agentId: agent.id, error: err?.message || String(err) }
      });
      if (canceledSessions.has(sessionId)) {
        return { ok: false, error: 'Agent runner canceled.', code: 'agent_canceled', sessionId };
      }
      return { ok: false, error: err?.message ? String(err.message) : 'Agent decision failed.', code: 'agent_error', sessionId };
    } finally {
      if (symbolKey) activeSymbols.delete(symbolKey);
      activeSessions.delete(sessionId);
      canceledSessions.delete(sessionId);
    }
  };

  const getStatus = async (): Promise<AgentRunnerStatus> => {
    const runnerBridge = typeof window !== 'undefined' ? (window as any)?.glass?.agentRunner : null;
    if (runnerBridge?.getStatus) {
      const res = await runnerBridge.getStatus();
      if (res?.ok) {
        return {
          activeSymbols: Array.isArray(res.activeSymbols) ? res.activeSymbols : [],
          activeSessions: Array.isArray(res.activeSessions) ? res.activeSessions : [],
          lastRunAtMs: res.lastRunAtMs ?? null
        };
      }
    }
    const activeSessionsList = Array.from(activeSessions.entries()).map(([id, entry]) => ({
      sessionId: id,
      agentId: entry?.agentId || null,
      symbol: entry?.symbol || entry?.symbolKey || null,
      startedAtMs: entry?.startedAtMs || null
    }));
    return {
      activeSymbols: Array.from(activeSymbols.keys()),
      activeSessions: activeSessionsList,
      lastRunAtMs
    };
  };

  const cancelSession = async (input: { sessionId?: string; symbol?: string }): Promise<AgentRunnerCancelResult> => {
    const runnerBridge = typeof window !== 'undefined' ? (window as any)?.glass?.agentRunner : null;
    if (runnerBridge?.cancel) {
      return runnerBridge.cancel(input);
    }
    const sessionId = String(input?.sessionId || '').trim();
    const symbolKey = normalizeSymbolKey(input?.symbol);
    const canceled: string[] = [];
    if (sessionId) {
      canceledSessions.add(sessionId);
      const entry = activeSessions.get(sessionId);
      if (entry?.symbolKey) activeSymbols.delete(entry.symbolKey);
      activeSessions.delete(sessionId);
      canceled.push(sessionId);
    } else if (symbolKey) {
      for (const [id, entry] of activeSessions.entries()) {
        if (entry?.symbolKey === symbolKey) {
          canceledSessions.add(id);
          activeSessions.delete(id);
          activeSymbols.delete(symbolKey);
          canceled.push(id);
          break;
        }
      }
    } else {
      return { ok: false, error: 'Session id or symbol is required.' };
    }
    if (canceled.length === 0) return { ok: false, error: 'No active agent runner session found.' };
    return { ok: true, canceled, canceledCount: canceled.length };
  };

  return {
    evaluateSignal,
    getStatus,
    cancelSession
  };
};
