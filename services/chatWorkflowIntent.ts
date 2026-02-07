export const WORKFLOW_PLAYBOOK_ID = 'playbook.trade_session_mtf.v1';

export type WorkflowIntent = {
  playbookId: string;
  symbol?: string;
  timeframes?: string[];
  strategy?: string;
  mode?: 'coordinate' | 'team' | 'autopilot';
  reason: string;
  confidence: number;
};

const WORKFLOW_TRIGGER_KEYWORDS = [
  'playbook',
  'workflow',
  'work flow',
  'trade flow',
  'run flow',
  'run playbook',
  'start workflow',
  'start playbook',
  'set up',
  'setup',
  'task tree',
  'task',
  'tasks',
  'flow',
  'sequence'
];

const WORKFLOW_DOMAIN_KEYWORDS = [
  'trade',
  'trading',
  'market',
  'chart',
  'backtest',
  'simulate',
  'optimize',
  'optimizer',
  'signal',
  'watch',
  'session',
  'strategy'
];

const WORKFLOW_STEP_KEYWORDS = [
  'watch',
  'analyze',
  'analysis',
  'backtest',
  'simulate',
  'optimize',
  'optimization',
  'second pass',
  'round 2',
  'chain',
  'refine',
  'trade',
  'execute',
  'signals',
  'setup watcher',
  'setup',
  'set up'
];

const WORKFLOW_MODE_KEYWORDS = {
  autopilot: ['autopilot', 'auto pilot', 'by itself', 'fully automated', 'no confirmation'],
  team: ['team', 'all agents', 'roundtable', 'crew'],
  coordinate: ['coordinate', 'with me', 'confirm', 'ask me', 'approval']
};

const WORKFLOW_STRATEGY_KEYWORDS: Array<{ key: string; strategy: string }> = [
  { key: 'mean reversion', strategy: 'MEAN_REVERSION' },
  { key: 'mean-reversion', strategy: 'MEAN_REVERSION' },
  { key: 'mean rev', strategy: 'MEAN_REVERSION' },
  { key: 'reversion', strategy: 'MEAN_REVERSION' },
  { key: 'range breakout', strategy: 'RANGE_BREAKOUT' },
  { key: 'range-breakout', strategy: 'RANGE_BREAKOUT' },
  { key: 'breakout', strategy: 'RANGE_BREAKOUT' },
  { key: 'break retest', strategy: 'BREAK_RETEST' },
  { key: 'break-retest', strategy: 'BREAK_RETEST' },
  { key: 'break and retest', strategy: 'BREAK_RETEST' },
  { key: 'breakretest', strategy: 'BREAK_RETEST' },
  { key: 'trend pullback', strategy: 'TREND_PULLBACK' },
  { key: 'trend-pullback', strategy: 'TREND_PULLBACK' },
  { key: 'pullback', strategy: 'TREND_PULLBACK' },
  { key: 'trend', strategy: 'TREND_PULLBACK' },
  { key: 'fvg', strategy: 'FVG_RETRACE' },
  { key: 'fair value gap', strategy: 'FVG_RETRACE' },
  { key: 'fvg retrace', strategy: 'FVG_RETRACE' }
];

const WORKFLOW_SYMBOL_ALIASES: Array<{ key: string; symbol: string }> = [
  { key: 'bitcoin', symbol: 'BTCUSD' },
  { key: 'btc', symbol: 'BTCUSD' },
  { key: 'btcusd', symbol: 'BTCUSD' },
  { key: 'btc usd', symbol: 'BTCUSD' },
  { key: 'btc/usd', symbol: 'BTCUSD' },
  { key: 'btc-usd', symbol: 'BTCUSD' },
  { key: 'eth', symbol: 'ETHUSD' },
  { key: 'ethereum', symbol: 'ETHUSD' },
  { key: 'ethusd', symbol: 'ETHUSD' },
  { key: 'eth usd', symbol: 'ETHUSD' },
  { key: 'eth/usd', symbol: 'ETHUSD' },
  { key: 'eth-usd', symbol: 'ETHUSD' },
  { key: 'gold', symbol: 'XAUUSD' },
  { key: 'xau', symbol: 'XAUUSD' },
  { key: 'xauusd', symbol: 'XAUUSD' },
  { key: 'xau usd', symbol: 'XAUUSD' },
  { key: 'xau/usd', symbol: 'XAUUSD' },
  { key: 'xau-usd', symbol: 'XAUUSD' },
  { key: 'nas100', symbol: 'NAS100' },
  { key: 'us30', symbol: 'US30' },
  { key: 'spx', symbol: 'SPX' },
  { key: 'spy', symbol: 'SPX' }
];

const WORKFLOW_PLAYBOOK_ALIASES: Array<{ key: string; id: string }> = [
  { key: 'trade session mtf', id: WORKFLOW_PLAYBOOK_ID },
  { key: 'mtf trade session', id: WORKFLOW_PLAYBOOK_ID },
  { key: 'mtf workflow', id: WORKFLOW_PLAYBOOK_ID },
  { key: 'multi timeframe', id: WORKFLOW_PLAYBOOK_ID },
  { key: 'multi-timeframe', id: WORKFLOW_PLAYBOOK_ID },
  { key: 'mtf', id: WORKFLOW_PLAYBOOK_ID }
];

const normalizeWorkflowTimeframe = (raw: string) => {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return '';
  if (text.endsWith('m') || text.endsWith('h') || text.endsWith('d')) return text;
  if (text.endsWith('hr')) return `${text.replace('hr', '')}h`;
  if (text.endsWith('hrs')) return `${text.replace('hrs', '')}h`;
  return text;
};

export const extractTimeframesFromText = (text: string): string[] => {
  const matches = text.match(/\b(\d{1,3})\s*(m|h|d|hr|hrs)\b/gi) || [];
  const frames = matches
    .map((raw) => raw.replace(/\s+/g, '').toLowerCase())
    .map((raw) => normalizeWorkflowTimeframe(raw));
  const lower = text.toLowerCase();
  if (lower.includes('daily') || lower.includes('day')) frames.push('1d');
  if (lower.includes('weekly') || lower.includes('week')) frames.push('1w');
  return Array.from(new Set(frames)).filter(Boolean);
};

export const extractSymbolFromText = (text: string): string | null => {
  const lower = text.toLowerCase();
  for (const alias of WORKFLOW_SYMBOL_ALIASES) {
    if (lower.includes(alias.key)) return alias.symbol;
  }
  const upper = text.toUpperCase();
  const direct = upper.match(/\b[A-Z0-9]{3,8}(?:USD|USDT|USDC|EUR|JPY|GBP|CHF|AUD|CAD|NZD)\b/);
  if (direct?.[0]) return direct[0];
  const generic = upper.match(/\b[A-Z]{2,6}\d{0,3}\b/);
  return generic?.[0] || null;
};

const extractStrategyFromText = (text: string): string | null => {
  const lower = text.toLowerCase();
  for (const item of WORKFLOW_STRATEGY_KEYWORDS) {
    if (lower.includes(item.key)) return item.strategy;
  }
  return null;
};

const extractPlaybookIdFromText = (text: string): string | null => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const match = raw.match(/\bplaybook\s+([a-z0-9_.:-]+)/i);
  if (match && match[1]) {
    let candidate = String(match[1]).trim();
    if (!candidate) return null;
    if (!candidate.startsWith('playbook.')) {
      candidate = `playbook.${candidate.replace(/[^a-z0-9_.:-]/gi, '')}`;
    }
    return candidate;
  }
  const lower = raw.toLowerCase();
  for (const alias of WORKFLOW_PLAYBOOK_ALIASES) {
    if (lower.includes(alias.key)) return alias.id;
  }
  return null;
};

export const inferWorkflowMode = (text: string): WorkflowIntent['mode'] | undefined => {
  const lower = String(text || '').toLowerCase();
  if (WORKFLOW_MODE_KEYWORDS.autopilot.some((k) => lower.includes(k))) return 'autopilot';
  if (WORKFLOW_MODE_KEYWORDS.team.some((k) => lower.includes(k))) return 'team';
  if (WORKFLOW_MODE_KEYWORDS.coordinate.some((k) => lower.includes(k))) return 'coordinate';
  return undefined;
};

export const detectWorkflowIntent = (text: string): WorkflowIntent | null => {
  const raw = String(text || '').trim();
  if (!raw || raw.startsWith('/')) return null;
  const lower = raw.toLowerCase();
  const triggerHits = WORKFLOW_TRIGGER_KEYWORDS.filter((k) => lower.includes(k)).length;
  const stepHits = WORKFLOW_STEP_KEYWORDS.filter((k) => lower.includes(k)).length;
  const explicitPlaybookId = extractPlaybookIdFromText(raw);
  const domainHits = WORKFLOW_DOMAIN_KEYWORDS.filter((k) => lower.includes(k)).length;
  const hasSequence =
    lower.includes(' then ') ||
    lower.includes(' and then ') ||
    lower.includes(' after that ') ||
    lower.includes(' next ') ||
    lower.includes(' followed by ') ||
    lower.startsWith('then ') ||
    ((lower.includes(',') || lower.includes(';') || lower.includes(' and ')) && stepHits >= 2);
  const explicitPlaybook = Boolean(
    explicitPlaybookId &&
      (lower.includes('playbook') || triggerHits > 0 || stepHits >= 2 || hasSequence)
  );
  const hasWorkflow = triggerHits > 0 || explicitPlaybook || (stepHits >= 2 && domainHits > 0);
  const hasMultiStep = stepHits >= 2 && (hasSequence || triggerHits > 0 || domainHits > 0);
  if (!hasWorkflow && !hasMultiStep) return null;
  if (domainHits === 0 && stepHits < 2 && !explicitPlaybook) return null;

  let confidence = 0;
  if (explicitPlaybook) confidence += 2;
  if (triggerHits > 0) confidence += 1;
  if (hasSequence) confidence += 1;
  if (stepHits >= 2) confidence += 1;
  if (stepHits >= 3) confidence += 1;
  if (domainHits >= 1) confidence += 1;
  if (confidence < 2) return null;

  const mode = inferWorkflowMode(raw);
  const symbol = extractSymbolFromText(raw) || undefined;
  const timeframes = extractTimeframesFromText(raw);
  const strategy = extractStrategyFromText(raw) || undefined;
  const playbookId = explicitPlaybookId || WORKFLOW_PLAYBOOK_ID;
  const reason = `Workflow request: ${raw.slice(0, 140)}`;

  return {
    playbookId,
    symbol,
    timeframes: timeframes.length > 0 ? timeframes : undefined,
    strategy,
    mode,
    reason,
    confidence
  };
};
