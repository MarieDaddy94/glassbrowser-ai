export interface EvidenceCard {
  bias?: string | null;
  setup?: string | null;
  levels?: {
    entry?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    rr?: number | null;
  };
  risk?: {
    riskReward?: number | null;
    stopDistance?: number | null;
    rewardDistance?: number | null;
    note?: string | null;
  };
  invalidation?: string | null;
  confidence?: {
    score?: number | null;
    reasons?: string[] | null;
  };
  createdAtMs?: number | null;
  source?: string | null;
}

export interface TradeProposal {
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio?: number;
  forceOrderType?: 'market' | 'limit' | 'stop';
  expiresAtMs?: number | null;
  fallbackLevels?: {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    model?: string | null;
    rr?: number | null;
    source?: string | null;
  } | null;
  status: 'PENDING' | 'SUBMITTING' | 'EXECUTED' | 'REJECTED';
  messageId?: string;
  agentId?: string;
  reason?: string;
  evidence?: EvidenceCard | null;
  setup?: {
    watcherId?: string;
    strategy?: SetupStrategy;
    timeframe?: string;
    signalId?: string;
    signalType?: SetupSignalType;
    profileId?: string | null;
    paramsHash?: string | null;
    libraryKey?: string | null;
    libraryTier?: SetupLibraryTier | null;
    libraryScore?: number | null;
    libraryWinRateTier?: SetupWinRateTier | null;
    mode?: SetupWatcherMode | string;
    source?: string;
    playbook?: ExecutionPlaybook | null;
  };
  executionSource?: 'manual' | 'autopilot';
  executionBroker?: 'tradelocker' | 'sim' | 'shadow' | 'mt5';
  executionError?: string;
  executedAtMs?: number;
}

export interface TradeBlockInfo {
  atMs: number;
  symbol?: string | null;
  broker?: string | null;
  reason?: string | null;
  code?: string | null;
  block?: string | null;
  source?: string | null;
  executionMode?: string | null;
  autoPilotState?: string | null;
  autoPilotReason?: string | null;
  agentId?: string | null;
  messageId?: string | null;
  decisionId?: string | null;
  correlationId?: string | null;
  details?: Record<string, any> | null;
}

export interface Position {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  size: number; // Lots
  stopLoss: number;
  takeProfit: number;
  openTime: Date;
  closeTime?: Date;
  closePrice?: number;
  pnl: number; // Floating P&L (Simulated)
  status: 'OPEN' | 'CLOSED';
  strategyId?: string | null;
  agentId?: string;
  reason?: string;
  brokerBid?: number | null;
  brokerAsk?: number | null;
  brokerMid?: number | null;
  brokerSpread?: number | null;
  brokerUpdatedAtMs?: number | null;
}

export type SignalOutcome = 'WIN' | 'LOSS' | 'EXPIRED' | 'REJECTED' | 'FAILED';

export type SignalIntentStatus = 'draft' | 'needs_confirmation' | 'active' | 'paused' | 'archived' | 'error';

export interface SignalIntentSchedule {
  timezone: string;
  times: string[]; // HH:mm local to schedule timezone
  weekdays: number[]; // 0-6 (Sun-Sat)
  marketOpenMode?: boolean;
}

export interface SignalIntentSessionGate {
  id: 'asia' | 'london' | 'ny' | 'custom';
  enabled: boolean;
  startHour?: number | null;
  endHour?: number | null;
}

export interface SignalIntent {
  id: string;
  agentId: string;
  rawPrompt: string;
  status: SignalIntentStatus;
  createdAtMs: number;
  updatedAtMs: number;
  symbol: string;
  timeframes: string[];
  strategyMode?: 'scalp' | 'day' | 'swing' | string | null;
  probabilityMin?: number | null;
  targetPoints?: number | null;
  schedule: SignalIntentSchedule;
  sessionGates?: SignalIntentSessionGate[] | null;
  telegramEnabled?: boolean;
  parseConfidence?: number | null;
  parseNotes?: string[] | null;
  nextDueAtMs?: number | null;
  lastTriggeredAtMs?: number | null;
  lastTriggeredSlotKey?: string | null;
}

export interface SignalIntentRun {
  intentId: string;
  runId: string;
  triggerAtMs: number;
  scopeKey?: string | null;
  result: 'no_match' | 'spawned' | 'error';
  signalIds?: string[] | null;
  note?: string | null;
}

export interface SignalIntentChatTurn {
  id: string;
  intentId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  atMs: number;
}

export type NewsImpactLevel = 'low' | 'medium' | 'high';
export type NewsTone = 'positive' | 'negative' | 'mixed' | 'neutral';

export interface NewsItem {
  title: string;
  url: string;
  summary?: string | null;
  source?: string | null;
  publishedAtMs?: number | null;
  impactScore?: number | null;
  trumpNews?: boolean;
  tone?: NewsTone | null;
  toneScore?: number | null;
}

export interface NewsSnapshot {
  symbol: string;
  updatedAtMs: number;
  impactScore: number;
  impactLevel: NewsImpactLevel;
  trumpNews: boolean;
  tone?: NewsTone | null;
  toneScore?: number | null;
  sources?: string[] | null;
  items: NewsItem[];
}

export type CalendarRuleType = 'auto_window' | 'blackout';

export interface CalendarRule {
  id: string;
  title: string;
  type: CalendarRuleType;
  daysOfWeek: number[];
  startTimeLocal: string;
  endTimeLocal: string;
  timezone: string;
  enabled: boolean;
  appliesTo?: {
    brokers?: string[] | null;
    symbols?: string[] | null;
    agents?: string[] | null;
  } | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
}

export interface CalendarPnlTrade {
  id: string;
  symbol: string | null;
  side: 'BUY' | 'SELL';
  broker: string | null;
  agentId: string | null;
  closedAtMs: number;
  realizedPnl: number;
  rMultiple: number | null;
  winLoss: 'win' | 'loss' | 'be';
  accountKey: string | null;
  accountLabel: string | null;
  accountId: number | null;
  accNum: number | null;
  realizedPnlSource: string | null;
  pnlSourceKind: 'ledger' | 'broker' | 'unknown';
}

export interface CalendarPnlDayCell {
  dateKey: string;
  dayOfMonth: number;
  tradeCount: number;
  wins: number;
  losses: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number | null;
  profitFactor: number | null;
  topSymbol: string | null;
}

export interface CalendarPnlMonthSummary {
  monthKey: string;
  netPnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  profitFactor: number | null;
  bestDayPnl: number | null;
  worstDayPnl: number | null;
  activeDays: number;
}

export interface CalendarPnlKpis {
  netPnl: number;
  accountBalance: number | null;
  accountEquity: number | null;
  profitFactor: number | null;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
}

export interface CalendarPnlAccountOption {
  accountKey: string;
  label: string;
  broker: string | null;
  accountId: number | null;
  accNum: number | null;
  env?: string | null;
  server?: string | null;
  isActive?: boolean;
}

export interface CalendarPnlAccountSummary {
  accountKey: string;
  label: string;
  broker: string | null;
  accountId: number | null;
  accNum: number | null;
  netPnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  activeDays: number;
}

export interface CalendarPnlDayAccountOverlay {
  accountKey: string;
  label: string;
  broker: string | null;
  netPnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
}

export interface CalendarPnlSourceSummary {
  ledgerTrades: number;
  brokerTrades: number;
  unknownTrades: number;
  ledgerNetPnl: number;
  brokerNetPnl: number;
  unknownNetPnl: number;
}

export interface CalendarPnlSnapshot {
  timezone: string;
  monthKey: string;
  selectedAccountKey: string | null;
  kpis: CalendarPnlKpis;
  monthSummary: CalendarPnlMonthSummary;
  cells: CalendarPnlDayCell[];
  tradesByDate: Record<string, CalendarPnlTrade[]>;
  availableAccounts: CalendarPnlAccountOption[];
  accountSummaries: CalendarPnlAccountSummary[];
  accountOverlaysByDate: Record<string, CalendarPnlDayAccountOverlay[]>;
  sourceSummary: CalendarPnlSourceSummary;
}

export interface SignalHistoryEntry {
  id: string;
  signalId: string;
  agentId?: string | null;
  agentName?: string | null;
  symbol: string;
  timeframe?: string | null;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  probability?: number | null;
  strategyMode?: 'scalp' | 'day' | 'swing' | string | null;
  reason?: string | null;
  executionSource?: 'manual' | 'autopilot' | null;
  executionBroker?: 'tradelocker' | 'sim' | 'shadow' | string | null;
  executionMode?: 'suggest' | 'paper' | 'live' | 'shadow' | string | null;
  status?: string | null;
  outcome?: SignalOutcome | null;
  score?: number | null;
  executedAtMs?: number | null;
  resolvedAtMs?: number | null;
  durationMs?: number | null;
  barsToOutcome?: number | null;
  exitPrice?: number | null;
  runId?: string | null;
  ledgerId?: string | null;
  orderId?: string | null;
  positionId?: string | null;
  newsSnapshot?: NewsSnapshot | null;
  outcomeSource?: ResolvedOutcomeEnvelope['source'] | null;
  decisionOutcome?: ResolvedOutcomeEnvelope['decisionOutcome'] | null;
  executionOutcome?: ResolvedOutcomeEnvelope['executionOutcome'] | null;
  resolvedOutcomeEnvelope?: ResolvedOutcomeEnvelope | null;
  attribution?: SignalAttributionRecord | null;
}

export type AcademyCaseStatus =
  | 'PROPOSED'
  | 'SUBMITTING'
  | 'PENDING'
  | 'EXECUTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'WIN'
  | 'LOSS'
  | 'FAILED';

export interface AcademyCaseSnapshotFrame {
  tf: string;
  barsCount: number;
  lastUpdatedAtMs?: number | null;
}

export interface AcademyCaseSnapshot {
  symbol?: string | null;
  capturedAtMs?: number | null;
  imageDataUrl?: string | null;
  savedPath?: string | null;
  memoryKey?: string | null;
  frames?: AcademyCaseSnapshotFrame[];
  timeframes?: string[];
  reasonCode?: string | null;
  payload?: Record<string, any> | null;
}

export interface AcademyCaseEvent {
  id: string;
  type: string;
  atMs: number;
  payload?: Record<string, any> | null;
}

export interface AcademyCase {
  id: string;
  signalId?: string | null;
  signalCanonicalId?: string | null;
  signalIdentityVersion?: 'v2' | string | null;
  legacySignalId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  symbol: string;
  timeframe?: string | null;
  action: 'BUY' | 'SELL';
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  probability?: number | null;
  strategyMode?: 'scalp' | 'day' | 'swing' | string | null;
  reason?: string | null;
  executionSource?: 'manual' | 'autopilot' | null;
  executionBroker?: 'tradelocker' | 'sim' | 'shadow' | string | null;
  executionMode?: 'suggest' | 'paper' | 'live' | 'shadow' | string | null;
  status?: AcademyCaseStatus | null;
  outcome?: SignalOutcome | null;
  score?: number | null;
  createdAtMs?: number | null;
  executedAtMs?: number | null;
  resolvedAtMs?: number | null;
  durationMs?: number | null;
  barsToOutcome?: number | null;
  exitPrice?: number | null;
  runId?: string | null;
  ledgerId?: string | null;
  orderId?: string | null;
  positionId?: string | null;
  brokerSnapshot?: Record<string, any> | null;
  snapshot?: AcademyCaseSnapshot | null;
  telemetry?: AcademyCaseEvent[];
  analysis?: Record<string, any> | null;
  source?: string | null;
  decisionOutcome?: ResolvedOutcomeEnvelope['decisionOutcome'] | null;
  executionOutcome?: ResolvedOutcomeEnvelope['executionOutcome'] | null;
  resolvedOutcomeEnvelope?: ResolvedOutcomeEnvelope | null;
  attribution?: SignalAttributionRecord | null;
  locked?: boolean;
  lockedAtMs?: number | null;
  lockSource?: 'signal_button' | 'system_repair' | string | null;
  lockReason?: string | null;
  dataQualityScore?: number | null;
  dataQualityFlags?: string[] | null;
  materializedBy?: string | null;
  lastRepairedAtMs?: number | null;
  academyMergeVersion?: number | null;
  academyLastSeenAtMs?: number | null;
}

export interface AcademyLesson {
  id: string;
  title: string;
  summary?: string | null;
  appliesTo?: {
    symbol?: string | null;
    session?: string | null;
    strategyMode?: string | null;
    timeframe?: string | null;
    broker?: string | null;
    executionMode?: string | null;
  };
  triggerConditions?: string[] | null;
  recommendedAction?: string | null;
  confidence?: number | null;
  evidenceCaseIds?: string[] | null;
  agentId?: string | null;
  agentName?: string | null;
  outcome?: SignalOutcome | null;
  score?: number | null;
  category?: string | null;
  tags?: string[] | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  source?: string | null;
  lifecycleState?: 'candidate' | 'core' | 'deprecated' | null;
  version?: number | null;
  pinned?: boolean;
  appliedAgents?: string[] | null;
  experimentId?: string | null;
}

export interface AcademySymbolLearning {
  id: string;
  symbol: string;
  summary?: string | null;
  wins: number;
  losses: number;
  winRate?: number | null;
  avgScore?: number | null;
  bestConditions?: string[] | null;
  failurePatterns?: string[] | null;
  recommendedAdjustments?: string[] | null;
  evidenceCaseIds?: string[] | null;
  updatedAtMs?: number | null;
  source?: string | null;
}

export interface LearningGraphNode {
  id: string;
  type: 'agent' | 'symbol' | 'pattern' | 'lesson' | 'goal' | 'conflict';
  kind?: 'agent' | 'symbol' | 'pattern' | 'lesson' | 'goal' | 'conflict';
  label: string;
  parentId?: string | null;
  agentKey?: string | null;
  impactScore?: number | null;
  confidence?: number | null;
  sampleSize?: number | null;
  lastSeenAtMs?: number | null;
  hot?: boolean;
  contradicted?: boolean;
  evidenceCaseIds?: string[] | null;
  meta?: (Record<string, any> & {
    evidenceStats?: {
      wins: number;
      losses: number;
      avgR: number;
      expectancy: number;
    };
    pathScore?: number;
  }) | null;
}

export interface LearningGraphEdge {
  id: string;
  source: string;
  target: string;
  type?: 'contains' | 'supports' | 'learns_from' | 'conflicts' | 'overrides_when' | 'co_occurs' | string;
  weight?: number | null;
  supportCount?: number | null;
  confidence?: number | null;
}

export type LearningGraphTimelineWindow = '7d' | '30d' | '90d' | 'all' | 'custom';

export interface LearningGraphTimelineRange {
  window: LearningGraphTimelineWindow;
  startAtMs?: number | null;
  endAtMs?: number | null;
}

export type LearningGraphDiffMode = 'off' | 'time_compare' | 'agent_compare';

export interface LearningGraphNodeDiff {
  nodeId: string;
  status: 'added' | 'removed' | 'changed' | 'stable';
  impactDelta?: number | null;
  confidenceDelta?: number | null;
  sampleDelta?: number | null;
  winRateDelta?: number | null;
}

export interface LearningGraphEdgeDiff {
  edgeId: string;
  status: 'added' | 'removed' | 'changed' | 'stable';
  supportDelta?: number | null;
  confidenceDelta?: number | null;
}

export interface LearningGraphDiffSnapshot {
  baseScopeKey: string;
  compareScopeKey: string;
  nodeDiffs: LearningGraphNodeDiff[];
  edgeDiffs: LearningGraphEdgeDiff[];
  summary: {
    addedNodes: number;
    removedNodes: number;
    changedNodes: number;
    addedEdges: number;
    removedEdges: number;
    changedEdges: number;
    netImpactDelta: number | null;
    confidenceShift: number | null;
  };
  builtAtMs?: number;
  buildMs?: number;
}

export type LessonConflictPolicyType =
  | 'unresolved'
  | 'conditional_override'
  | 'precedence'
  | 'scope_split';

export interface LessonConflictResolution {
  conflictId: string;
  lessonAId: string;
  lessonBId: string;
  policyType: LessonConflictPolicyType;
  condition?: {
    symbol?: string | null;
    timeframe?: string | null;
    strategyMode?: string | null;
    session?: string | null;
    trigger?: string | null;
  } | null;
  precedence?: 'lessonA_wins' | 'lessonB_wins' | null;
  scopeSplit?: {
    lessonASymbols?: string[] | null;
    lessonBSymbols?: string[] | null;
    lessonATimeframes?: string[] | null;
    lessonBTimeframes?: string[] | null;
  } | null;
  note?: string | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  source?: string | null;
}

export interface LessonConflictPolicy {
  conflictId: string;
  policy: LessonConflictResolution;
}

export interface LearningGraphFilters {
  agentId?: string | null;
  includeOutcomes?: Array<'WIN' | 'LOSS' | 'EXPIRED' | 'REJECTED' | 'FAILED'>;
  lens?: 'hierarchy' | 'performance' | 'recency' | 'failure_mode' | 'strategy_broker' | null;
  timeWindow?: '7d' | '30d' | '90d' | 'all' | null;
  strategyMode?: string | null;
  broker?: string | null;
  lessonLifecycle?: 'candidate' | 'core' | 'deprecated' | 'all' | null;
  confidenceMin?: number | null;
  layoutMode?: 'hierarchy' | 'radial' | 'force' | null;
  spread?: number | null;
  focusMode?: 'off' | 'hop1' | 'hop2' | 'path' | null;
  diffMode?: LearningGraphDiffMode | null;
  compareAgentId?: string | null;
  compareWindow?: LearningGraphTimelineWindow | null;
  timelineRange?: LearningGraphTimelineRange | null;
}

export interface LearningGraphSnapshot {
  builtAtMs: number;
  scopeKey?: string | null;
  filters?: LearningGraphFilters | null;
  nodes: LearningGraphNode[];
  edges: LearningGraphEdge[];
  rootNodeIds: string[];
  stats?: {
    nodeCount: number;
    edgeCount: number;
    buildMs: number;
    conflictCount: number;
    hotNodeCount: number;
    pathBuildMs?: number;
    pathCoverage?: number;
    diffBuildMs?: number;
    layoutBuildMs?: number;
    bundleBuildMs?: number;
    cacheHit?: number;
  } | null;
  builtFromCursor?: {
    cases: number | null;
    lessons: number | null;
    symbols: number | null;
  } | null;
}

export type LearningGraphInspectorView = 'overview' | 'evidence' | 'actions';

export interface LearningPathSummary {
  stepCount: number;
  confidence: number | null;
  sampleSize: number;
  estimatedImpact: number | null;
}

export interface LearningCaseAction {
  caseId: string;
  action: 'open_chart' | 'replay_case' | 'show_reasoning';
}

export interface LearningGraphViewportState {
  zoom: number;
  pan: { x: number; y: number };
  selectedNodeId?: string | null;
  layoutMode?: 'hierarchy' | 'radial' | 'force' | null;
  spread?: number | null;
  focusMode?: 'off' | 'hop1' | 'hop2' | 'path' | null;
}

export interface LearningGraphRenderState {
  zoomBand: 'far' | 'mid' | 'near';
  labels: Record<string, string>;
  nodeOpacity: Record<string, number>;
  edgeOpacity: Record<string, number>;
  nodeDiffStatus?: Record<string, 'added' | 'removed' | 'changed' | 'stable'>;
  edgeDiffStatus?: Record<string, 'added' | 'removed' | 'changed' | 'stable'>;
  visibleEdgeIds: string[];
  focusNodeIds: string[];
}

export interface UnifiedSnapshotStatus {
  symbol?: string | null;
  timeframes?: string[] | null;
  scopeKey?: string | null;
  ok?: boolean;
  state?: 'warming' | 'ready' | 'coverage_delayed' | 'failed';
  reasonCode?: string | null;
  frames?: Array<{
    tf: string;
    barsCount: number;
    lastUpdatedAtMs?: number | null;
    indicators?: ChartIndicatorFrameSummary | null;
  }>;
  missingFrames?: string[];
  shortFrames?: Array<{ tf: string; barsCount: number; minBars: number }>;
  capturedAtMs?: number | null;
  warnings?: string[];
}

export interface TradeLockerQuote {
  symbol?: string | null;
  tradableInstrumentId?: number | null;
  routeId?: number | null;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  mid?: number | null;
  bidSize?: number | null;
  askSize?: number | null;
  spread?: number | null;
  timestampMs?: number | null;
  fetchedAtMs?: number | null;
}

export interface TradeLockerBar {
  t: number;
  o?: number | null;
  h?: number | null;
  l?: number | null;
  c?: number | null;
  v?: number | null;
}

export interface TradeLockerOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'market' | 'limit' | 'stop';
  qty: number;
  price: number;
  stopLoss: number;
  takeProfit: number;
  status: string;
  createdAt: Date;
  strategyId?: string | null;
  filledQty?: number | null;
  remainingQty?: number | null;
}

export interface TradeLockerOrderHistory {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'market' | 'limit' | 'stop';
  qty: number;
  price: number;
  stopPrice?: number | null;
  stopLoss: number;
  takeProfit: number;
  status: string;
  createdAt: Date;
  filledAt?: Date | null;
  closedAt?: Date | null;
  filledQty?: number | null;
  remainingQty?: number | null;
  strategyId?: string | null;
}

export interface TradeLockerAccountMetrics {
  accountId: number | null;
  accNum: number | null;
  currency?: string | null;
  balance: number;
  equity: number;
  openGrossPnl?: number | null;
  openNetPnl?: number | null;
  marginUsed?: number | null;
  marginFree?: number | null;
  marginLevel?: number | null;
  computedMarginLevel?: boolean;
  updatedAtMs?: number;
}

export interface Memory {
  id: string;
  text: string;
  type: 'WIN' | 'LOSS';
  timestamp: Date;
  meta?: Record<string, any>;
}

export interface AgentMemoryEntry {
  id: string;
  key: string;
  familyKey?: string | null;
  agentId?: string | null;
  scope?: 'agent' | 'shared' | 'global' | string | null;
  category?: string | null;
  subcategory?: string | null;
  kind?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  summary?: string | null;
  payload?: Record<string, any> | null;
  tags?: string[];
  source?: string | null;
  createdAtMs?: number;
  updatedAtMs?: number;
  lastAccessedAtMs?: number | null;
  archivedAtMs?: number | null;
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
  correlationId?: string;
  attachments?: Array<{
    kind: 'image' | 'text';
    name: string;
    dataUrl?: string;
    preview?: string;
    lineCount?: number;
    truncated?: boolean;
  }>;
  isError?: boolean;
  isStreaming?: boolean;
  image?: string; // UI image src (prefer file:// or blob:; avoid storing large data: URLs in state)
  agentId?: string; // ID of the agent who sent the message
  agentName?: string; // Display name of the agent
  agentColor?: string; // Visual color for the agent
  tradeProposal?: TradeProposal; // Structured trade data
  brokerAction?: BrokerAction; // Structured broker action request
  agentToolAction?: AgentToolAction; // Structured agent tool request
  contextTabs?: Array<{
    label: string;
    url?: string;
    capturedAtMs?: number;
    changed?: boolean;
    source?: 'active' | 'pinned' | 'watched' | 'tradingview';
  }>;
}

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  isWatched?: boolean; // New: If true, agents monitor this tab in background
  watchSource?: 'manual' | 'auto'; // Optional: indicates how watch status was set
  aiPinned?: boolean; // If true, always include this tab in AI context
  aiLabel?: string; // Optional label (e.g., 15m, 30m, H1) used in AI context
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export interface ChatConfig {
  isOpen: boolean;
  transparency: number; // 0 to 100
}

export enum BrowsingState {
  IDLE,
  LOADING,
  ERROR
}

export interface Agent {
  id: string;
  name: string;
  color: string; // Tailwind class
  type: 'gemini' | 'openai';
  profile?: string;
  systemInstruction?: string;
  voice?: string; // TTS Voice Name (Puck, Kore, Fenrir, etc.)
  capabilities?: AgentCapabilities;
}

export interface AgentCapabilities {
  tools?: boolean;
  broker?: boolean;
  trade?: boolean;
  autoExecute?: boolean;
}

export interface AgentConfidencePolicy {
  minProbability?: number;
  maxProbability?: number;
  minRiskReward?: number;
}

export interface UploadedTextRef {
  id: string;
  name: string;
  sizeBytes: number;
  textExcerpt: string;
  storageKey: string;
  createdAtMs: number;
}

export interface AgentDraft {
  id: string;
  name: string;
  description: string;
  strategyText: string;
  watchSymbols: string[];
  watchTimeframes: string[];
  sessionWindows: string[];
  entryRules: string[];
  exitRules: string[];
  riskRules: string[];
  confidencePolicy: AgentConfidencePolicy;
  capabilities: AgentCapabilities;
  status: 'draft' | 'validated' | 'published';
  sourceFiles: UploadedTextRef[];
  createdAtMs: number;
  updatedAtMs: number;
  publishedAgentId?: string | null;
  useInSignalScans?: boolean;
}

export interface AgentCreatorMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAtMs: number;
  draftId?: string | null;
  files?: UploadedTextRef[];
  isError?: boolean;
}

export interface AgentCreatorSession {
  messages: AgentCreatorMessage[];
  activeDraftId?: string | null;
  selectedFileIds: string[];
  lastValidation?: {
    draftId?: string | null;
    ok: boolean;
    warnings: string[];
    errors: string[];
    atMs: number;
  } | null;
}

export type AutoPilotMode = 'custom' | 'scalper' | 'day' | 'trend' | 'swing';
export type AutoPilotExecutionMode = 'live' | 'paper' | 'shadow';
export type AutoPilotDecisionMode = 'deterministic' | 'agent';
export type AutoPilotReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export interface AutoPilotPolicy {
  riskPerTrade?: number; // Percentage of account (0-100)
  maxOpenPositions?: number;
  spreadLimitModel?: 'none' | 'percent' | 'atr';
  spreadLimitPct?: number;
  spreadLimitAtrMult?: number;
  stopModel?: 'percent' | 'atr';
  stopPercent?: number;
  stopAtrMult?: number;
  defaultRR?: number;
  allowedStrategies?: SetupStrategy[];
  allowedTimeframes?: string[];
}

export interface AutoPilotConfig {
  enabled: boolean;
  killSwitch?: boolean;
  maxDailyLoss: number; // in Dollars
  riskPerTrade: number; // Percentage of account (0-100)
  maxOrdersPerMinute?: number; // Max new orders per minute (0 disables)
  symbolAllowlistRaw?: string; // Optional allowlist (one per line or comma-separated)
  mode?: AutoPilotMode;
  executionMode?: AutoPilotExecutionMode;
  decisionMode?: AutoPilotDecisionMode;
  decisionAgentId?: string;
  decisionReasoningEffort?: AutoPilotReasoningEffort;
  maxAgentCommandsPerMinute?: number;
  modePolicies?: Record<AutoPilotMode, AutoPilotPolicy>;
  spreadLimitModel?: 'none' | 'percent' | 'atr';
  spreadLimitPct?: number; // Percent of price (e.g., 0.2 = 0.2%)
  spreadLimitAtrMult?: number; // ATR multiplier (ATR14, 1m)
  stopModel?: 'percent' | 'atr';
  stopPercent?: number; // Percent of price for auto fallback stops
  stopAtrMult?: number; // ATR multiplier for auto fallback stops
  defaultRR?: number; // Default RR used for auto fallback TP
  lotSize: number; // Default lot size for AI trades (lots)
  maxOpenPositions: number;
  perSymbolMaxPositions?: number;
  perSymbolMaxLot?: number;
  symbolCapsRaw?: string;
  maxConsecutiveLosses?: number;
  symbolGroupMapRaw?: string;
  groupCapsRaw?: string;
  driftActionWarn?: 'none' | 'paper' | 'suggest' | 'disable';
  driftActionPoor?: 'none' | 'paper' | 'suggest' | 'disable';
  driftActionCooldownHours?: number;
  driftAutoRetest?: boolean;
  driftRetestCooldownHours?: number;
  driftRetestRangeDays?: number;
  driftRetestMaxCombos?: number;
  quantModes?: Partial<Record<'regime' | 'ensemble' | 'metaLabel' | 'portfolioRisk' | 'promotion', 'observe' | 'warn' | 'soft_block' | 'hard_block'>>;
  requireConfirmation: boolean; // If true, AI pauses and asks before final trigger
  telegram: {
    botToken: string;
    chatId: string;
    connected: boolean;
  };
}

export type AutoPilotState = 'DISABLED' | 'ARMED' | 'RUNNING' | 'PAUSED' | 'FAULTED';

export type AutoPilotStateReason =
  | 'AUTOPILOT_DISABLED'
  | 'KILL_SWITCH_ON'
  | 'BROKER_DISCONNECTED'
  | 'BROKER_TRADING_DISABLED'
  | 'BROKER_AUTOPILOT_DISABLED'
  | 'STREAM_UNHEALTHY'
  | 'STALE_MARKET_DATA'
  | 'NO_WATCHERS'
  | 'UNKNOWN';

export interface AutoPilotStateSnapshot {
  state: AutoPilotState;
  reason?: AutoPilotStateReason | null;
  message?: string | null;
  updatedAtMs: number;
}

export type BrokerActionType = 'REFRESH_BROKER' | 'CLOSE_POSITION' | 'CANCEL_ORDER' | 'MODIFY_POSITION' | 'MODIFY_ORDER';

export interface BrokerAction {
  type: BrokerActionType;
  status: 'PENDING' | 'SUBMITTING' | 'EXECUTED' | 'REJECTED';
  source?: string;
  messageId?: string;
  positionId?: string;
  orderId?: string;
  symbol?: string;
  qty?: number;
  price?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  stopLossUsd?: number | null;
  takeProfitUsd?: number | null;
  trailingOffset?: number | null;
  clearStopLoss?: boolean;
  clearTakeProfit?: boolean;
  scope?: 'snapshot' | 'orders' | 'metrics' | 'all';
  reason?: string;
  agentId?: string;
  executionError?: string;
  executionCode?: string;
  executedAtMs?: number;
}

export type AgentToolActionType =
  | 'GET_SYSTEM_STATE'
  | 'GET_APP_SNAPSHOT'
  | 'GET_NATIVE_CHART_SNAPSHOT'
  | 'GET_BACKTEST_SUMMARY'
  | 'GET_BACKTEST_TRAINING_PACK'
  | 'RUN_ACTION_CATALOG'
  | 'RUN_BACKTEST_OPTIMIZATION'
  | 'START_BACKTEST_OPTIMIZER'
  | 'GET_BACKTEST_OPTIMIZER_STATUS'
  | 'GET_BACKTEST_OPTIMIZER_RESULTS'
  | 'GET_OPTIMIZER_WINNER_PARAMS'
  | 'SAVE_OPTIMIZER_WINNER_PRESET'
  | 'PROPOSE_BACKTEST_OPTIMIZATION_REFINEMENT'
  | 'RUN_BACKTEST_OPTIMIZATION_CHAIN'
  | 'START_RESEARCH_AUTOPILOT'
  | 'GET_RESEARCH_AUTOPILOT_STATUS'
  | 'GET_RESEARCH_AUTOPILOT_RESULTS'
  | 'STOP_RESEARCH_AUTOPILOT'
  | 'GET_BROKER_QUOTE'
  | 'GET_AGENT_MEMORY'
  | 'LIST_AGENT_MEMORY'
  | 'CODEBASE_LIST_FILES'
  | 'CODEBASE_SEARCH'
  | 'CODEBASE_READ_FILE'
  | 'CODEBASE_TRACE_DATAFLOW'
  | 'LIST_SETUP_WATCHERS'
  | 'LIST_SETUP_LIBRARY'
  | 'CREATE_SETUP_WATCHER'
  | 'CREATE_WATCHER_FROM_LIBRARY'
  | 'UPDATE_SETUP_WATCHER'
  | 'DELETE_SETUP_WATCHER'
  | 'GET_SETUP_SIGNALS'
  | 'EXPLAIN_SETUP_SIGNAL'
  | 'UPDATE_AGENT_CAPABILITIES';

export type SetupStrategy =
  | 'RANGE_BREAKOUT'
  | 'BREAK_RETEST'
  | 'FVG_RETRACE'
  | 'TREND_PULLBACK'
  | 'MEAN_REVERSION';

export type RegimeLabel = 'trend' | 'range' | 'breakout';

export type SetupRegimeGate = 'any' | RegimeLabel;

export interface RegimeSnapshot {
  label: RegimeLabel;
  trendStrength: number | null;
  volatilityPct: number | null;
  atr?: number | null;
  close?: number | null;
  emaFast?: number | null;
  emaSlow?: number | null;
  updatedAtMs?: number | null;
  symbol?: string | null;
  timeframe?: string | null;
}

export interface ShadowTradeStats {
  openCount: number;
  closedCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netR: number;
  avgR: number | null;
  lastClosedAtMs: number | null;
  updatedAtMs?: number | null;
  byRegime?: Record<string, {
    trades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    netR: number;
    avgR: number | null;
  }>;
}

export interface ShadowTradeComparePair {
  key: string;
  symbol?: string | null;
  timeframe?: string | null;
  strategy?: string | null;
  setupSignalId?: string | null;
  decisionId?: string | null;
  messageId?: string | null;
  shadowId?: string | null;
  actualId?: string | null;
  shadowR?: number | null;
  actualR?: number | null;
  shadowOutcome?: 'win' | 'loss' | null;
  actualOutcome?: 'win' | 'loss' | null;
  regimeKey?: string | null;
  openedAtMs?: number | null;
  closedAtMs?: number | null;
}

export interface ShadowTradeCompareSummary {
  matchedCount: number;
  shadowOnlyCount: number;
  actualOnlyCount: number;
  shadowWinRate: number | null;
  actualWinRate: number | null;
  shadowNetR: number;
  actualNetR: number;
  avgDeltaR: number | null;
  outcomeMatchRate: number | null;
  updatedAtMs: number;
  byRegime?: Record<string, {
    matchedCount: number;
    shadowWinRate: number | null;
    actualWinRate: number | null;
    shadowNetR: number;
    actualNetR: number;
    avgDeltaR: number | null;
    outcomeMatchRate: number | null;
  }>;
}

export interface ShadowProfile {
  agentId: string;
  agentName?: string | null;
  enabled: boolean;
  startingBalance: number;
  riskPct: number;
  lotSize?: number | null;
  maxDrawdownPct?: number | null;
  dailyDrawdownPct?: number | null;
  preset?: string | null;
  liveDeployEnabled?: boolean;
  liveBroker?: 'mt5' | 'tradelocker' | null;
  liveMode?: 'fixed' | 'risk' | null;
  liveLotSize?: number | null;
  liveRiskPct?: number | null;
  liveAccountKey?: string | null;
  liveMaxDailyLoss?: number | null;
  liveMaxOpenPositions?: number | null;
  liveMaxOrdersPerMinute?: number | null;
  liveMaxConsecutiveLosses?: number | null;
  liveSymbolAllowlistRaw?: string | null;
  liveEntryTolerancePct?: number | null;
  updatedAtMs?: number | null;
}

export interface ShadowAccountSnapshot {
  agentId: string;
  balance: number;
  equity: number;
  wins: number;
  losses: number;
  expires: number;
  netR: number;
  maxBalance: number;
  drawdownPct: number | null;
  dailyDrawdownPct: number | null;
  openTrades: number;
  updatedAtMs: number;
  balanceSource?: 'shadow' | 'live';
}

export interface ShadowTradeView {
  id: string;
  signalId?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openedAtMs?: number | null;
  closedAtMs?: number | null;
  outcome?: 'WIN' | 'LOSS' | 'EXPIRED' | null;
  shadowR?: number | null;
  status?: string | null;
  exitReason?: string | null;
}

export type SetupLibraryTier = 'S' | 'A' | 'B' | 'C' | 'D';

export type SetupWinRateTier = 'WR70' | 'WR60' | 'WR50' | 'WR40' | 'WR30';

export type SetupWatcherMode = 'suggest' | 'paper' | 'live';

export type SetupSignalType = 'setup_ready' | 'entry_confirmed' | 'invalidated';

export type SetupSignalStatus =
  | 'setup_detected'
  | 'setup_ready'
  | 'entry_confirmed'
  | 'invalidated'
  | 'triggered';

export type ExecutionPlaybookStep = {
  id?: string;
  rr: number;
  qtyPct: number;
  moveStopTo?: 'breakeven' | 'entry' | 'none';
};

export type ExecutionPlaybookTrail = {
  activationR?: number;
  offsetR?: number;
};

export interface ExecutionPlaybook {
  enabled?: boolean;
  version?: number;
  steps?: ExecutionPlaybookStep[];
  breakevenAtR?: number;
  trail?: ExecutionPlaybookTrail | null;
  minIntervalMs?: number;
}

export type TaskPlaybookMode = 'coordinate' | 'team' | 'autopilot';
export type TaskTreeStep = string;

export type TaskPlaybookStep = {
  id: string;
  label?: string | null;
  stage?: TaskTreeStep | null;
  actionId: string;
  payload?: Record<string, any> | null;
  storeAs?: string | null;
  optional?: boolean | null;
  requiresConfirmation?: boolean | null;
  requiresUser?: boolean | null;
  skipIfMissing?: string | null;
  timeoutMs?: number | null;
  maxRetries?: number | null;
  retryDelayMs?: number | null;
};

export interface TaskPlaybook {
  id: string;
  name: string;
  description?: string | null;
  version?: number | null;
  owner?: 'system' | 'agent' | 'user' | null;
  symbol?: string | null;
  timeframes?: string[] | null;
  strategy?: SetupStrategy | null;
  defaultMode?: TaskPlaybookMode | null;
  steps: TaskPlaybookStep[];
  tags?: string[] | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
}

export type TaskPlaybookStepStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';

export interface TaskPlaybookRunStep {
  id: string;
  actionId: string;
  label?: string | null;
  status: TaskPlaybookStepStatus;
  startedAtMs?: number | null;
  finishedAtMs?: number | null;
  attempts?: number | null;
  retryCount?: number | null;
  error?: string | null;
  note?: string | null;
}

export interface TaskPlaybookRun {
  runId: string;
  playbookId: string;
  playbookName?: string | null;
  status: TaskPlaybookStepStatus;
  mode?: TaskPlaybookMode | null;
  symbol?: string | null;
  timeframe?: string | null;
  strategy?: SetupStrategy | null;
  startedAtMs: number;
  finishedAtMs?: number | null;
  currentStepId?: string | null;
  currentActionId?: string | null;
  currentStepIndex?: number | null;
  error?: string | null;
  steps?: TaskPlaybookRunStep[] | null;
  context?: Record<string, any> | null;
  resumeOfRunId?: string | null;
  resumeFromStepIndex?: number | null;
}

export type TaskTreeRunStepEntry = {
  step: string;
  status: string;
  startedAtMs?: number | null;
  finishedAtMs?: number | null;
  attempts?: number | null;
  retryCount?: number | null;
  error?: string | null;
  note?: string | null;
};

export type TaskTreeRunEntry = {
  runId: string;
  status?: string | null;
  createdAtMs?: number | null;
  finishedAtMs?: number | null;
  context?: {
    source?: string | null;
    correlationId?: string | null;
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    watcherId?: string | null;
    mode?: string | null;
  } | null;
  steps?: TaskTreeRunStepEntry[];
};

export type TaskTreeResumeEntry = {
  taskType: 'signal' | 'action';
  runId: string;
  status?: string | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  queueDepth?: number | null;
  blocked?: boolean | null;
  blockedReason?: string | null;
  requiresConfirmation?: boolean | null;
  context?: {
    source?: string | null;
    correlationId?: string | null;
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    watcherId?: string | null;
    mode?: string | null;
  } | null;
  lastStep?: {
    step?: string | null;
    status?: string | null;
    note?: string | null;
    error?: string | null;
  } | null;
};

export type ActionFlowRecommendation = {
  intentKey: string;
  intentLabel?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  sequence: string[];
  count: number;
  successRate: number;
  lastSeenAtMs?: number | null;
};

export interface SetupWatcher {
  id: string;
  symbol: string;
  timeframe: string;
  strategy: SetupStrategy;
  params: Record<string, any>;
  playbook?: ExecutionPlaybook | null;
  mode: SetupWatcherMode;
  enabled: boolean;
  regime?: SetupRegimeGate | null;
  createdAtMs: number;
  updatedAtMs: number;
  lastSignalType?: SetupSignalType | null;
  lastSignalAtMs?: number | null;
  profileId?: string | null;
  profileLabel?: string | null;
  profileObjectivePreset?: string | null;
  profileSessionId?: string | null;
  profileBaselineRunId?: string | null;
  profileParamsHash?: string | null;
  optimizerSessionId?: string | null;
  optimizerRound?: number | null;
  optimizerWinnerId?: string | null;
  libraryKey?: string | null;
  libraryTier?: SetupLibraryTier | null;
  libraryScore?: number | null;
  libraryWinRateTier?: SetupWinRateTier | null;
  libraryStats?: {
    total?: number | null;
    winRate?: number | null;
    expectancy?: number | null;
    profitFactor?: number | null;
    netR?: number | null;
    maxDrawdown?: number | null;
  } | null;
}

export interface SetupSignal {
  id: string;
  type: 'setup_signal';
  profileId: string | null;
  symbol: string;
  timeframe: string;
  ts: number;
  strength: number;
  reasonCodes: string[];
  payload: {
    signalType: SetupSignalType;
    status: SetupSignalStatus;
    strategy: SetupStrategy;
    side?: 'BUY' | 'SELL';
    barTime: number;
    watcherId?: string | null;
    details?: Record<string, any> | null;
    evidence?: EvidenceCard | null;
    invalidReasonCodes?: string[];
    confirmation?: {
      type?: string;
      ts?: number;
      details?: Record<string, any> | null;
    };
  };
}

export interface SetupSignalTransition {
  id: string;
  signalId: string;
  profileId: string | null;
  symbol: string;
  timeframe: string;
  signalType?: SetupSignalType | string | null;
  ts: number;
  fromStatus: SetupSignalStatus;
  toStatus: SetupSignalStatus;
  reasonCodes?: string[];
  note?: string | null;
  details?: Record<string, any> | null;
}

export interface ExperimentNote {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  symbol?: string | null;
  timeframe?: string | null;
  strategy?: SetupStrategy | string | null;
  baselineRunId?: string | null;
  round1SessionId?: string | null;
  round2SessionId?: string | null;
  objectivePreset?: string | null;
  summary?: string | null;
  hypothesis?: string | null;
  refinementDiff?: Record<string, any> | null;
  resultSummary?: Record<string, any> | null;
  decision?: 'adopt' | 'reject' | 'investigate' | null;
  recommendedParams?: Record<string, any> | null;
  recommendedMetrics?: Record<string, any> | null;
  rangeDays?: number | null;
  tags?: string[];
  source?: string | null;
}

export interface OptimizerWinnerMetrics {
  winRate?: number | null;
  profitFactor?: number | null;
  expectancy?: number | null;
  maxDrawdown?: number | null;
  edgeMargin?: number | null;
  tradeCount?: number | null;
  netR?: number | null;
  score?: number | null;
  penalties?: {
    penalty?: number | null;
    stabilityPenalty?: number | null;
  };
}

export interface OptimizerWinnerParams {
  id: string;
  sessionId: string;
  round: 1 | 2;
  symbol?: string | null;
  timeframe?: string | null;
  strategy?: SetupStrategy | string | null;
  params: Record<string, any>;
  paramsHash?: string | null;
  metrics?: OptimizerWinnerMetrics | null;
  createdAtMs: number;
}

export interface RegimeChampionRecord {
  regimeKey: string;
  experimentNoteId?: string | null;
  paramsHash?: string | null;
  score?: number | null;
  decision?: string | null;
  testMetrics?: Record<string, any> | null;
  robustnessWorstCase?: Record<string, any> | null;
  penalties?: {
    penalty?: number | null;
    stabilityPenalty?: number | null;
  } | null;
  updatedAtMs?: number | null;
}

export interface ResearchSession {
  sessionId: string;
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  symbol: string;
  timeframe: string;
  strategy: SetupStrategy | string;
  objectivePreset?: string | null;
  config?: Record<string, any> | null;
  stats: {
    experimentsPlanned: number;
    experimentsRun: number;
    bestScore: number | null;
    bestExperimentId?: string | null;
    lastExperimentId?: string | null;
    warnings?: string[] | null;
    lastError?: string | null;
    robustnessFailures?: number | null;
    rateLimitPauses?: number | null;
    targetRegimeKey?: string | null;
    targetRegimeOutcome?: { foundChampion: boolean; reason?: string | null; samples?: number | null } | null;
    champion?: {
      experimentId?: string | null;
      experimentNoteId?: string | null;
      paramsHash?: string | null;
      score?: number | null;
      decision?: string | null;
      testMetrics?: Record<string, any> | null;
      robustnessWorstCase?: Record<string, any> | null;
      regimeCoverageSummary?: Record<string, any> | null;
      penalties?: {
        penalty?: number | null;
        stabilityPenalty?: number | null;
      } | null;
      updatedAtMs?: number | null;
    } | null;
    championsByRegime?: Record<string, RegimeChampionRecord> | null;
    regimeFrequency?: Record<string, number> | null;
  };
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ResearchStep {
  id: string;
  sessionId: string;
  stepIndex: number;
  kind: string;
  payload?: Record<string, any> | null;
  createdAtMs: number;
}

export interface WatchProfile {
  profileId: string;
  symbol: string;
  timeframe: string;
  strategy: SetupStrategy;
  params: Record<string, any>;
  regimeConstraint?: { mode: 'require' | 'exclude'; keys: string[] } | null;
  paramsHash?: string | null;
  objectivePresetId?: string | null;
  objectivePresetName?: string | null;
  baselineRunId?: string | null;
  optimizerSessionId?: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  source?: string | null;
}

export interface PerformanceDashboardModel {
  generatedAtMs: number;
  globalChampion?: ResearchSession['stats']['champion'] | null;
  championsByRegime?: Record<string, RegimeChampionRecord> | null;
  regimeFrequency?: Record<string, number> | null;
  sessionSeries?: Array<{
    ts: number;
    sessionId?: string | null;
    bestScore?: number | null;
    bestEdgeMargin?: number | null;
    worstDD?: number | null;
    robustnessPassRate?: number | null;
    overfitPenalty?: number | null;
    decisions?: { adopt: number; investigate: number; reject: number };
  }>;
  experimentSeries?: Array<{
    ts: number;
    decision?: string | null;
    score?: number | null;
  }>;
  recentExperiments?: Array<{
    id: string;
    decision?: string | null;
    createdAtMs?: number | null;
    symbol?: string | null;
    timeframe?: string | null;
    strategy?: string | null;
    summary?: string | null;
    metrics?: Record<string, any> | null;
  }>;
  trendSeries?: Array<Record<string, any>>;
}

export type RegimeBlockState = {
  blocked: boolean;
  currentRegimeKey?: string | null;
  requiredKeys?: string[];
  mode?: 'require' | 'exclude' | null;
};

export type ReviewAnnotationLevel = {
  price: number;
  label: string;
  color?: string;
  style?: 'solid' | 'dashed';
  priority?: number;
};

export interface ReviewAnnotation {
  id: string;
  symbol: string;
  timeframe?: string | null;
  createdAtMs: number;
  levels: ReviewAnnotationLevel[];
  note?: string | null;
}

export interface SetupPerformance {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
  profitFactor: number | null;
  expectancy?: number | null;
  maxDrawdown?: number | null;
  slippageAvg?: number | null;
  slippagePctAvg?: number | null;
  drift?: {
    status: 'ok' | 'warn' | 'poor';
    winRateDelta?: number | null;
    profitFactorDelta?: number | null;
    trades?: number | null;
  } | null;
  lastClosedAtMs?: number | null;
  symbol?: string | null;
  timeframe?: string | null;
  strategy?: SetupStrategy | null;
  mode?: SetupWatcherMode | string | null;
}

export type RefreshSlaChannel = 'signal' | 'snapshot' | 'backtest';

export interface RefreshSlaStatus {
  channel: RefreshSlaChannel;
  taskId?: string | null;
  expectedIntervalMs: number;
  lastRunAt?: number | null;
  lastSuccessAt?: number | null;
  delayMs: number;
  state: 'idle' | 'on_time' | 'delayed' | 'missed';
  nextDueAt?: number | null;
}

export interface BrokerCircuitState {
  source: string;
  state: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  failureCount: number;
  openedAt?: number | null;
  retryAfterMs?: number | null;
  lastError?: string | null;
}

export interface PreTradeGateResult {
  allowed: boolean;
  reasons: string[];
  quoteAgeMs?: number | null;
  spreadBps?: number | null;
  slippageEstimateBps?: number | null;
  cooldownRemainingMs?: number | null;
}

export interface ResolvedOutcomeEnvelope {
  signalId: string;
  lifecycleState: 'proposed' | 'entry_reached' | 'submitted' | 'filled' | 'expired' | 'tp_exit' | 'sl_exit' | 'slippage_exit' | 'rejected' | 'failed';
  timestamps: {
    proposedAtMs?: number | null;
    submittedAtMs?: number | null;
    executedAtMs?: number | null;
    resolvedAtMs?: number | null;
  };
  decisionOutcome: 'WIN' | 'LOSS' | 'EXPIRED' | 'REJECTED' | 'FAILED' | 'UNKNOWN';
  executionOutcome: 'FILLED' | 'REJECTED' | 'SLIPPAGE_EXIT' | 'EXPIRED' | 'MISSED' | 'UNKNOWN';
  source: 'live' | 'simulated' | 'shadow' | 'mixed' | 'unknown';
}

export interface SignalAttributionRecord {
  signalId: string;
  decisionOutcome: ResolvedOutcomeEnvelope['decisionOutcome'];
  executionOutcome: ResolvedOutcomeEnvelope['executionOutcome'];
  alphaBps?: number | null;
  executionDragBps?: number | null;
  resolvedAt?: number | null;
}

export interface SignalQuantTelemetry {
  status: 'pass' | 'warn' | 'block';
  evaluatedAtMs: number;
  elapsedMs: number;
  regimeLabel?: string | null;
  regimeNewsRisk?: boolean;
  regimeHighVol?: boolean;
  ensembleAction?: 'take' | 'skip' | null;
  ensembleScore?: number | null;
  metaDecision?: 'take' | 'skip' | 'size_down' | null;
  metaConfidence?: number | null;
  portfolioAllowed?: boolean | null;
  portfolioReasons?: string[] | null;
  warnReasons?: string[] | null;
  blockReasons?: string[] | null;
}

export interface AgentDriftReport {
  agentId: string;
  segment: string;
  baselineWindow: {
    samples: number;
    winRate: number | null;
    avgScore: number | null;
  };
  liveWindow: {
    samples: number;
    winRate: number | null;
    avgScore: number | null;
  };
  delta: {
    winRate: number | null;
    avgScore: number | null;
  };
  severity: 'ok' | 'warn' | 'poor';
  triggeredAt: number;
}

export interface RankFreshnessState {
  degraded: boolean;
  stale: boolean;
  updatedAtMs?: number | null;
  reason?: string | null;
}

export interface RegimeState {
  symbol: string;
  timeframe: string;
  label: string;
  trend: boolean;
  range: boolean;
  highVol: boolean;
  newsRisk: boolean;
  confidence: number;
  updatedAtMs: number;
}

export interface EnsembleDecision {
  signalId?: string | null;
  score: number;
  action: 'take' | 'skip';
  priority: 'low' | 'normal' | 'high';
  reasons: string[];
}

export interface MetaLabelDecision {
  signalId?: string | null;
  decision: 'take' | 'skip' | 'size_down';
  confidence: number;
  sizeMultiplier?: number | null;
  reasons: string[];
}

export interface CorrelationExposureSnapshot {
  symbolGroup: string;
  symbols: string[];
  openRiskPct: number;
}

export interface PortfolioRiskBudget {
  maxCorrelatedExposurePct: number;
  maxSymbolFamilyOverlap: number;
  maxConcurrentRiskPct: number;
  currentCorrelatedExposurePct: number;
  currentConcurrentRiskPct: number;
}

export interface ExperimentRegistryEntry {
  experimentId: string;
  configHash: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  createdAtMs: number;
  source: 'optimizer' | 'research_autopilot' | string;
}

export interface PromotionDecision {
  experimentId: string;
  pass: boolean;
  reasons: string[];
  score?: number | null;
  decidedAtMs: number;
}

export interface LivePolicySnapshot {
  activeChampionId?: string | null;
  previousChampionId?: string | null;
  demotedAtMs?: number | null;
  demotionReason?: string | null;
  updatedAtMs: number;
}

export interface PanelActionRequest {
  actionId: string;
  payload?: Record<string, any>;
}

export interface PanelActionResult {
  ok: boolean;
  data?: any;
  error?: string | null;
  source?: string | null;
  fallbackUsed?: boolean;
  timedOut?: boolean;
  attempts?: number;
  blocked?: boolean | null;
  retryAfterMs?: number | null;
  blockedReason?: string | null;
  blockedUntilMs?: number | null;
}

export interface PanelConnectivityState {
  source: string;
  panel?: string | null;
  ready: boolean;
  latencyMs: number | null;
  error?: string | null;
  updatedAt: number;
  failureCount?: number;
  blocked?: boolean | null;
  retryAfterMs?: number | null;
  blockedReason?: string | null;
  blockedUntilMs?: number | null;
}

export type ExecutionSubmissionRoute = 'trade_execute' | 'ticket_execute' | 'broker_action_open';

export interface ExecutionSubmissionRequest {
  route: ExecutionSubmissionRoute;
  executionTargets: string[];
  snapshotAccountKey?: string | null;
  ensureAccount: (accountKey: string, reason?: string) => Promise<{ ok: boolean; error?: string | null }>;
  withAccountLock: <T>(fn: () => Promise<T>) => Promise<T>;
  submitForAccount: (accountKey: string) => Promise<{
    res: any;
    normalized?: boolean;
    payload?: Record<string, any> | null;
  }>;
  getActiveAccountKey?: () => string | null;
  switchReason?: string | null;
  restoreReason?: string | null;
}

export interface ExecutionSubmissionResult {
  ok: boolean;
  route: ExecutionSubmissionRoute;
  attempts: number;
  restoreAttempted: boolean;
  restoreError?: string | null;
  restoredAccountKey?: string | null;
  results: Array<{
    accountKey: string;
    ok: boolean;
    error?: string | null;
    normalized: boolean;
    payload?: Record<string, any> | null;
    res: any;
  }>;
  primaryResult?: {
    accountKey: string;
    ok: boolean;
    error?: string | null;
    normalized: boolean;
    payload?: Record<string, any> | null;
    res: any;
  } | null;
}

export interface CrossPanelContext {
  symbol?: string | null;
  timeframe?: string | null;
  session?: string | null;
  agentId?: string | null;
  strategyId?: string | null;
  focusEntity?: 'signal' | 'academy_case' | null;
  focusSignalId?: string | null;
  focusCaseId?: string | null;
  focusRequestId?: string | null;
  originPanel?: string | null;
  updatedAtMs?: number | null;
}

export interface PanelFreshnessState {
  panel: string;
  state: 'fresh' | 'stale' | 'degraded' | 'unknown';
  lastSyncAt?: number | null;
  reason?: string | null;
}

export interface OutcomeFeedCursor {
  version: number;
  total: number;
  lastResolvedAtMs?: number | null;
  checksum: string;
  generatedAtMs: number;
}

export interface OutcomeFeedConsistencyState {
  degraded: boolean;
  stale: boolean;
  desyncedPanels: string[];
  reason?: string | null;
  updatedAtMs: number;
}

export type TradeLockerRateLimitGovernorMode = 'normal' | 'guarded' | 'cooldown';
export type TradeLockerRateLimitPolicy = 'safe' | 'balanced' | 'aggressive';

export interface TradeLockerRateLimitPolicyThresholds {
  guardedThreshold: number;
  cooldownThreshold: number;
  guardedPressure: number;
  cooldownPressure: number;
  recoveryStreak: number;
  maxIntervalMs: number;
}

export interface TradeLockerRateLimitRouteTelemetry {
  routeKey: string;
  method?: string | null;
  path?: string | null;
  windowRequests: number;
  window429: number;
  windowBlocked: number;
  totalRequests: number;
  total429: number;
  totalBlocked: number;
  lastStatus?: number | null;
  lastError?: string | null;
  lastRequestAtMs?: number | null;
  last429AtMs?: number | null;
  lastBlockedAtMs?: number | null;
  blockedUntilMs?: number | null;
  retryAfterMs?: number | null;
  avgLatencyMs?: number | null;
}

export interface TradeLockerRateLimitAccountTelemetry {
  accountKey: string;
  env?: 'demo' | 'live' | null;
  server?: string | null;
  accountId?: number | null;
  accNum?: number | null;
  label?: string | null;
  windowRequests: number;
  window429: number;
  windowBlocked: number;
  totalRequests: number;
  total429: number;
  totalBlocked: number;
  lastStatus?: number | null;
  lastError?: string | null;
  lastRequestAtMs?: number | null;
  last429AtMs?: number | null;
  lastBlockedAtMs?: number | null;
  blockedUntilMs?: number | null;
  retryAfterMs?: number | null;
}

export interface TradeLockerRateLimitTelemetry {
  mode: TradeLockerRateLimitGovernorMode;
  modeChangedAtMs: number;
  policy?: TradeLockerRateLimitPolicy;
  pressure?: number;
  policyThresholds?: TradeLockerRateLimitPolicyThresholds | null;
  windowMs: number;
  windowStartedAtMs: number;
  windowRequests: number;
  window429: number;
  windowBlocked: number;
  totalRequests: number;
  total429: number;
  totalBlocked: number;
  totalErrors: number;
  totalSuccess: number;
  consecutive429: number;
  consecutiveSuccess: number;
  adaptiveMinIntervalMs: number;
  baseMinIntervalMs: number;
  adaptiveRequestConcurrency: number;
  baseRequestConcurrency: number;
  last429AtMs?: number | null;
  lastSuccessAtMs?: number | null;
  lastBlockedAtMs?: number | null;
  lastRouteKey?: string | null;
  lastAccountKey?: string | null;
  topRoutes: TradeLockerRateLimitRouteTelemetry[];
  topAccounts?: TradeLockerRateLimitAccountTelemetry[];
}

export interface HealthSnapshot {
  updatedAtMs: number;
  academyMergeAddedCount?: number | null;
  academyMergeReplacedCount?: number | null;
  academyMergeRetainedCount?: number | null;
  academyRichCaseCount?: number | null;
  academySparseCaseCount?: number | null;
  academyLessonValidCount?: number | null;
  academyLessonDroppedCount?: number | null;
  academyRepairUpserts?: number | null;
  academyLearningGraphNodeCount?: number | null;
  academyLearningGraphEdgeCount?: number | null;
  academyLearningGraphBuildMs?: number | null;
  academyLearningGraphConflictCount?: number | null;
  academyLearningGraphPathRuns?: number | null;
  academyLearningGraphDiffBuildMs?: number | null;
  academyLearningGraphLayoutBuildMs?: number | null;
  academyLearningGraphBundleBuildMs?: number | null;
  academyLearningGraphCacheHitRate?: number | null;
  academyLearningGraphWorkerFallbacks?: number | null;
  academyGraphCaseActions?: number | null;
  academyGraphLifecycleActions?: number | null;
  academyGraphExportCount?: number | null;
  ledgerArchiveMoves?: number | null;
  ledgerArchiveRows?: number | null;
  signalIdCollisionPreventedCount?: number | null;
  startupCheckedAtMs?: number | null;
  startupPhase?: 'booting' | 'restoring' | 'settled' | null;
  startupOpenaiState?: 'ready' | 'assumed_ready' | 'missing' | 'unknown' | null;
  startupTradeLockerState?: 'ready' | 'assumed_ready' | 'missing' | 'unknown' | null;
  startupOpenaiProbeSource?: string | null;
  startupTradeLockerProbeSource?: string | null;
  startupBridgeState?: 'ready' | 'failed' | null;
  startupBridgeError?: string | null;
  startupProbeSkippedDueToBridge?: boolean | null;
  startupProbeErrors?: {
    secrets?: string | null;
    broker?: string | null;
    tradeLedger?: string | null;
    tradelocker?: string | null;
  } | null;
  startupTradeLockerAutoRestoreAttempted?: boolean | null;
  startupTradeLockerAutoRestoreSuccess?: boolean | null;
  startupTradeLockerAutoRestoreError?: string | null;
  startupTradeLockerAutoRestoreAtMs?: number | null;
  startupRequestedScopes?: string[] | null;
  startupSkippedScopes?: string[] | null;
  startupActiveScopes?: string[] | null;
  startupBlockedScopes?: string[] | null;
  startupUnknownScopes?: string[] | null;
  startupPermissionError?: string | null;
  startupDiagnosticWarning?: string | null;
  brokerStatus?: string | null;
  brokerQuotesUpdatedAtMs?: number | null;
  brokerQuotesError?: string | null;
  brokerSnapshotUpdatedAtMs?: number | null;
  brokerStreamStatus?: string | null;
  brokerStreamUpdatedAtMs?: number | null;
  brokerStreamError?: string | null;
  brokerRateLimitLastAtMs?: number | null;
  brokerRateLimitLastMessage?: string | null;
  brokerRateLimitSuppressUntilMs?: number | null;
  tradelockerRequestQueueDepth?: number | null;
  tradelockerRequestQueueMaxDepth?: number | null;
  tradelockerRequestQueueMaxWaitMs?: number | null;
  tradelockerRequestInFlight?: number | null;
  tradelockerRequestConcurrency?: number | null;
  tradelockerMinRequestIntervalMs?: number | null;
  tradelockerRateLimitTelemetry?: TradeLockerRateLimitTelemetry | null;
  nativeChartSymbol?: string | null;
  nativeChartUpdatedAtMs?: number | null;
  nativeChartFrames?: number | null;
  setupWatcherEvalAtMs?: number | null;
  setupSignalAtMs?: number | null;
  setupWatcherCount?: number | null;
  setupWatcherEnabledCount?: number | null;
  setupSignalCount?: number | null;
  backgroundWatcherTickAtMs?: number | null;
  taskTreeUpdatedAtMs?: number | null;
  autoPilotEnabled?: boolean | null;
  autoPilotMode?: string | null;
  killSwitch?: boolean | null;
  autoPilotState?: AutoPilotState | null;
  autoPilotReason?: AutoPilotStateReason | null;
  autoPilotReasonMessage?: string | null;
  autoPilotStateUpdatedAtMs?: number | null;
  perf?: {
    windowMs?: number | null;
    auditEvents?: number | null;
    brokerRequests?: number | null;
    brokerResponses?: number | null;
    brokerTimeouts?: number | null;
    brokerRateLimits?: number | null;
    brokerQueueDepth?: number | null;
    brokerQueueMaxDepth?: number | null;
    brokerQueueMaxWaitMs?: number | null;
    brokerInFlight?: number | null;
    quoteUpdates?: number | null;
    quoteIngests?: number | null;
    backgroundWatcherTicks?: number | null;
    backgroundWatcherLastDurationMs?: number | null;
    signalScans?: number | null;
    signalScanLastDurationMs?: number | null;
    chartRefreshRequests?: number | null;
    chartRefreshCoalesced?: number | null;
    patternWatchSyncCoalesced?: number | null;
    chartRefreshRuns?: number | null;
    chartRefreshLastDurationMs?: number | null;
    signalSnapshotWarmups?: number | null;
    signalSnapshotWarmupTimeouts?: number | null;
    signalSnapshotWarmupLastDurationMs?: number | null;
    brokerCoordinatorRequests?: number | null;
    brokerCoordinatorExecutions?: number | null;
    brokerCoordinatorCacheHits?: number | null;
    brokerCoordinatorDedupeHits?: number | null;
    brokerCoordinatorCacheHitRate?: number | null;
    brokerCoordinatorDedupeRate?: number | null;
  } | null;
  scheduler?: {
    visible?: boolean | null;
    taskCount?: number | null;
    signalTaskId?: string | null;
    signalTask?: {
      id: string;
      groupId: string;
      runCount?: number | null;
      errorCount?: number | null;
      lastRunAtMs?: number | null;
      lastDurationMs?: number | null;
      paused?: boolean | null;
      consecutiveFailures?: number | null;
    } | null;
    shadowTaskId?: string | null;
    shadowTask?: {
      id: string;
      groupId: string;
      runCount?: number | null;
      errorCount?: number | null;
      lastRunAtMs?: number | null;
      lastDurationMs?: number | null;
      paused?: boolean | null;
      consecutiveFailures?: number | null;
    } | null;
  } | null;
  cacheBudgets?: Array<{
    name: string;
    size: number;
    entries?: number;
    maxEntries: number;
    evictions: number;
    ttlExpired?: number;
    ttlEvictions: number;
    hitRate: number;
  }> | null;
  chartFrameCache?: {
    enabled?: boolean | null;
    entries?: number | null;
    partitions?: string[] | null;
    hydrate?: {
      attempts?: number | null;
      hits?: number | null;
      hitRate?: number | null;
      lastHydrateAtMs?: number | null;
    } | null;
    fetchMix?: {
      full?: number | null;
      incremental?: number | null;
    } | null;
    persist?: {
      flushes?: number | null;
      flushFailures?: number | null;
      lastFlushAtMs?: number | null;
      lastFlushError?: string | null;
      lastClearAtMs?: number | null;
    } | null;
    patternDetection?: {
      fromRefresh?: number | null;
      fromLive?: number | null;
      fromStartupBackfill?: number | null;
      dedupeSuppressed?: number | null;
      indicatorCoverageCount?: number | null;
      fibAnchorMissingCount?: number | null;
      indicatorComputeMs?: number | null;
    } | null;
  } | null;
  workerFallback?: {
    updatedAtMs?: number | null;
    byDomain?: Record<string, {
      total?: number | null;
      fallbackUsed?: number | null;
      byReason?: Record<string, number> | null;
    }> | null;
  } | null;
  signalRefreshSla?: {
    updatedAtMs?: number | null;
    tasks?: Array<{
      id: string;
      intervalMs: number;
      state: 'idle' | 'on_time' | 'delayed' | 'missed';
      expectedAtMs?: number | null;
      delayMs?: number | null;
      lastAttemptAtMs?: number | null;
      lastRunAtMs?: number | null;
      lastSkipAtMs?: number | null;
      lastSkipReason?: string | null;
    }> | null;
  } | null;
  brokerCircuit?: {
    updatedAtMs?: number | null;
    openCount?: number | null;
    entries?: Array<{
      method: string;
      source: string;
      open: boolean;
      failureCount?: number | null;
      consecutiveFailures?: number | null;
      successCount?: number | null;
      openUntilMs?: number | null;
      lastFailureAtMs?: number | null;
      lastSuccessAtMs?: number | null;
      lastError?: string | null;
    }> | null;
  } | null;
  persistenceHealth?: {
    overallOk?: boolean | null;
    updatedAtMs?: number | null;
    domains?: Record<string, {
      ok?: boolean | null;
      lastOkAtMs?: number | null;
      lastErrorAtMs?: number | null;
      lastError?: string | null;
      failures?: number | null;
      writesQueued?: number | null;
    }> | null;
  } | null;
  refreshSlaByChannel?: RefreshSlaStatus[] | null;
  bridgeDomainReadiness?: Record<string, {
    ready: boolean;
    missingPaths?: string[] | null;
    reason?: string | null;
  }> | null;
  brokerCircuitBySource?: BrokerCircuitState[] | null;
  lastSuccessfulScanAtMs?: number | null;
  rankFreshness?: RankFreshnessState | null;
  agentDrift?: {
    updatedAtMs?: number | null;
    reports?: AgentDriftReport[] | null;
  } | null;
  executionAudit?: {
    updatedAtMs?: number | null;
    recordsCount?: number | null;
    mismatches?: Array<{
      dedupeKey: string;
      signalId?: string | null;
      reasons: string[];
    }> | null;
  } | null;
  livePolicy?: LivePolicySnapshot | null;
  panelConnectivity?: PanelConnectivityState[] | null;
  panelFreshness?: PanelFreshnessState[] | null;
  outcomeFeed?: {
    cursor?: OutcomeFeedCursor | null;
    consistency?: OutcomeFeedConsistencyState | null;
  } | null;
  crossPanelContext?: CrossPanelContext | null;
}

export interface TruthEventRecord {
  eventType: string;
  level?: 'info' | 'warn' | 'error';
  symbol?: string | null;
  runId?: string | null;
  toolId?: string | null;
  actionId?: string | null;
  decisionId?: string | null;
  executionId?: string | null;
  brokerResponseId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, any> | null;
  createdAtMs?: number | null;
  source?: string | null;
}

export interface TruthProjection {
  updatedAtMs: number;
  lastEventAtMs?: number | null;
  lastEventType?: string | null;
  lastEvent?: TruthEventRecord | null;
  broker?: {
    lastSnapshotAtMs?: number | null;
    lastQuotesAtMs?: number | null;
    lastStreamAtMs?: number | null;
    lastStatus?: string | null;
    lastStreamStatus?: string | null;
    lastError?: string | null;
  } | null;
  chart?: {
    lastEventAtMs?: number | null;
    lastEventType?: string | null;
    lastSymbol?: string | null;
    lastTimeframe?: string | null;
  } | null;
  setup?: {
    lastSignalAtMs?: number | null;
    lastSignalId?: string | null;
    lastProfileId?: string | null;
  } | null;
  agent?: {
    lastToolAtMs?: number | null;
    lastToolId?: string | null;
  } | null;
  task?: {
    lastEventAtMs?: number | null;
    lastEventType?: string | null;
  } | null;
  playbook?: {
    lastEventAtMs?: number | null;
    lastEventType?: string | null;
  } | null;
  trade?: {
    lastEventAtMs?: number | null;
    lastEventType?: string | null;
  } | null;
  counts?: Record<string, number> | null;
}

export interface TruthReplay {
  runId?: string | null;
  symbol?: string | null;
  events: TruthEventRecord[];
  projection: TruthProjection | null;
  startedAtMs?: number | null;
  finishedAtMs?: number | null;
}

export interface SystemStateSnapshot {
  capturedAtMs: number;
  detail: 'summary' | 'full';
  health: HealthSnapshot;
  truth?: {
    projection?: TruthProjection | null;
    updatedAtMs?: number | null;
  } | null;
  sidebar?: {
    isOpen: boolean;
    mode: SidebarMode;
  } | null;
  chat?: {
    isThinking?: boolean | null;
    replyMode?: string | null;
    isLive?: boolean | null;
    chartChatIsLive?: boolean | null;
    chartChatThinking?: boolean | null;
    liveMode?: string | null;
    messagesCount?: number | null;
    lastMessageAtMs?: number | null;
    chartChatMessagesCount?: number | null;
    chartChatLastMessageAtMs?: number | null;
    activeAgentId?: string | null;
    agentsCount?: number | null;
    sessionBias?: string | null;
    autoTabVisionEnabled?: boolean | null;
    chartWatchEnabled?: boolean | null;
    chartWatchMode?: string | null;
    chartWatchSnoozedUntilMs?: number | null;
    postTradeReviewEnabled?: boolean | null;
    postTradeReviewAgentId?: string | null;
    chartWatchLeadAgentId?: string | null;
  } | null;
  agents?: Array<{
    id: string;
    name: string;
    type: 'gemini' | 'openai';
    voice?: string | null;
    capabilities?: AgentCapabilities | null;
  }> | null;
  tabs?: {
    activeTabId?: string | null;
    activeTab?: {
      id: string;
      title?: string | null;
      url?: string | null;
      isWatched?: boolean | null;
      aiPinned?: boolean | null;
      aiLabel?: string | null;
    } | null;
    items?: Array<{
      id: string;
      title?: string | null;
      url?: string | null;
      isWatched?: boolean | null;
      aiPinned?: boolean | null;
      aiLabel?: string | null;
    }>;
    total?: number | null;
    watched?: number | null;
    pinned?: number | null;
  } | null;
  symbolScope?: SymbolScope | null;
  tradelocker?: {
    status?: string | null;
    env?: 'demo' | 'live' | null;
    server?: string | null;
    accountId?: number | null;
    accNum?: number | null;
    tradingEnabled?: boolean | null;
    autoPilotEnabled?: boolean | null;
    defaultOrderQty?: number | null;
    defaultOrderType?: string | null;
    balance?: number | null;
    equity?: number | null;
    currency?: string | null;
    marginUsed?: number | null;
    marginFree?: number | null;
    marginLevel?: number | null;
    openGrossPnl?: number | null;
    openNetPnl?: number | null;
    accountMetricsUpdatedAtMs?: number | null;
    watchSymbols?: string[] | null;
    positionsCount?: number | null;
    ordersCount?: number | null;
    openPositionsCount?: number | null;
    openOrdersCount?: number | null;
    positions?: Array<{
      id: string;
      symbol: string;
      type: 'BUY' | 'SELL';
      size: number;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      pnl: number;
      status: 'OPEN' | 'CLOSED';
    }>;
    orders?: Array<{
      id: string;
      symbol: string;
      side: 'BUY' | 'SELL';
      type: 'market' | 'limit' | 'stop';
      qty: number;
      price: number;
      stopLoss: number;
      takeProfit: number;
      status: string;
    }>;
    streamStatus?: string | null;
    streamError?: string | null;
    streamUpdatedAtMs?: number | null;
    lastError?: string | null;
    quotesUpdatedAtMs?: number | null;
    quotesError?: string | null;
    quotesBySymbolCount?: number | null;
    snapshotUpdatedAtMs?: number | null;
    rateLimitSuppressUntilMs?: number | null;
  } | null;
  mt5?: {
    bridgeAvailable?: boolean | null;
    accountKey?: string | null;
    balance?: number | null;
    equity?: number | null;
    currency?: string | null;
    netting?: boolean | null;
    updatedAtMs?: number | null;
    positionsCount?: number | null;
    ordersCount?: number | null;
    positionsUpdatedAtMs?: number | null;
    ordersUpdatedAtMs?: number | null;
    lastError?: string | null;
  } | null;
  sim?: {
    available?: boolean | null;
    balance?: number | null;
    equity?: number | null;
    positionsCount?: number | null;
    floatingPnl?: number | null;
    updatedAtMs?: number | null;
  } | null;
  autopilot?: {
    enabled?: boolean | null;
    mode?: string | null;
    policyMode?: string | null;
    killSwitch?: boolean | null;
    executionMode?: string | null;
    decisionMode?: string | null;
    decisionAgentId?: string | null;
    decisionReasoningEffort?: string | null;
    maxAgentCommandsPerMinute?: number | null;
    riskPerTrade?: number | null;
    maxDailyLoss?: number | null;
    maxOpenPositions?: number | null;
    requireConfirmation?: boolean | null;
    spreadLimitModel?: string | null;
    spreadLimitPct?: number | null;
    spreadLimitAtrMult?: number | null;
    stopModel?: string | null;
    stopPercent?: number | null;
    stopAtrMult?: number | null;
    defaultRR?: number | null;
    lotSize?: number | null;
    maxConsecutiveLosses?: number | null;
    perSymbolMaxPositions?: number | null;
    perSymbolMaxLot?: number | null;
    allowedStrategies?: SetupStrategy[] | null;
    allowedTimeframes?: string[] | null;
    symbolCapsRaw?: string | null;
    symbolGroupMapRaw?: string | null;
    groupCapsRaw?: string | null;
    driftActionWarn?: string | null;
    driftActionPoor?: string | null;
    driftActionCooldownHours?: number | null;
    driftAutoRetest?: boolean | null;
    driftRetestCooldownHours?: number | null;
    driftRetestRangeDays?: number | null;
    driftRetestMaxCombos?: number | null;
    telegram?: {
      connected?: boolean | null;
      hasToken?: boolean | null;
      chatIdSuffix?: string | null;
    } | null;
  } | null;
  shadow?: {
    stats?: ShadowTradeStats | null;
    compare?: ShadowTradeCompareSummary | null;
  } | null;
  watchers?: {
    total?: number | null;
    enabled?: number | null;
    live?: number | null;
    paper?: number | null;
    suggest?: number | null;
    profiles?: number | null;
    signals?: number | null;
    lastEvalAtMs?: number | null;
    lastSignalAtMs?: number | null;
    blockedByRegime?: number | null;
    items?: Array<{
      id: string;
      symbol: string;
      timeframe: string;
      strategy: SetupStrategy;
      mode: SetupWatcherMode;
      enabled: boolean;
      profileId?: string | null;
      paramsHash?: string | null;
      lastSignalType?: SetupSignalType | null;
      lastSignalAtMs?: number | null;
      regime?: SetupRegimeGate | null;
    }>;
    signalsList?: Array<{
      id: string;
      profileId: string | null;
      symbol: string;
      timeframe: string;
      ts: number;
      strength: number;
      signalType: SetupSignalType;
      status: SetupSignalStatus;
      side?: 'BUY' | 'SELL';
    }>;
    profilesList?: Array<{
      profileId: string;
      symbol: string;
      timeframe: string;
      strategy: SetupStrategy;
      paramsHash?: string | null;
      objectivePresetName?: string | null;
      optimizerSessionId?: string | null;
      createdAtMs: number;
      updatedAtMs: number;
    }>;
  } | null;
  regimes?: {
    total?: number | null;
    blocked?: number | null;
    blocks?: Array<{
      watcherId: string;
      blocked: boolean;
      currentRegimeKey?: string | null;
      requiredKeys?: string[];
      mode?: 'require' | 'exclude' | null;
    }>;
    snapshots?: Array<{
      symbol?: string | null;
      timeframe?: string | null;
      label?: RegimeLabel | null;
      trendStrength?: number | null;
      volatilityPct?: number | null;
      atr?: number | null;
      close?: number | null;
      emaFast?: number | null;
      emaSlow?: number | null;
      updatedAtMs?: number | null;
    }>;
  } | null;
  setupLibrary?: {
    total?: number | null;
    updatedAtMs?: number | null;
    error?: string | null;
    tiers?: Record<string, number> | null;
    items?: Array<{
      key: string;
      symbol: string;
      timeframe: string;
      strategy: SetupStrategy;
      score: number;
      tier: SetupLibraryTier;
      winRate?: number | null;
      expectancy?: number | null;
      profitFactor?: number | null;
      netR?: number | null;
      maxDrawdown?: number | null;
      rangeDays?: number | null;
      source?: string | null;
      updatedAtMs?: number | null;
    }>;
  } | null;
  chart?: {
    nativeSymbol?: string | null;
    nativeTimeframe?: string | null;
    chartSessions?: number | null;
    chartSessionsWatched?: number | null;
    sessions?: Array<{
      id: string;
      symbol: string;
      watchEnabled: boolean;
      views: Record<ChartTimeframe, string | null>;
      updatedAtMs: number;
    }>;
  } | null;
  taskTree?: {
    updatedAtMs?: number | null;
    queueDepth?: number | null;
    processing?: boolean | null;
    maxQueue?: number | null;
    dedupeWindowMs?: number | null;
    resumes?: TaskTreeResumeEntry[] | null;
    lastRun?: {
      runId?: string | null;
      status?: string | null;
      lastEventType?: string | null;
      lastEventAtMs?: number | null;
    } | null;
    recentEvents?: Array<{
      eventType: string;
      runId?: string | null;
      step?: string | null;
      status?: string | null;
      note?: string | null;
      error?: string | null;
      symbol?: string | null;
      createdAtMs?: number | null;
    }>;
    runs?: Array<{
      runId: string;
      status?: string | null;
      createdAtMs?: number | null;
      finishedAtMs?: number | null;
      context?: {
        source?: string | null;
        symbol?: string | null;
        timeframe?: string | null;
        strategy?: string | null;
        watcherId?: string | null;
        mode?: string | null;
      } | null;
      steps?: Array<{
        step: string;
        status: string;
        startedAtMs?: number | null;
        finishedAtMs?: number | null;
        attempts?: number | null;
        retryCount?: number | null;
        error?: string | null;
        note?: string | null;
      }>;
    }>;
    action?: {
      updatedAtMs?: number | null;
      queueDepth?: number | null;
      processing?: boolean | null;
      maxQueue?: number | null;
      dedupeWindowMs?: number | null;
      lastRun?: {
        runId?: string | null;
        status?: string | null;
        lastEventType?: string | null;
        lastEventAtMs?: number | null;
      } | null;
      recentEvents?: Array<{
        eventType: string;
        runId?: string | null;
        step?: string | null;
        status?: string | null;
        note?: string | null;
        error?: string | null;
        symbol?: string | null;
        createdAtMs?: number | null;
      }>;
      runs?: Array<{
        runId: string;
        status?: string | null;
        createdAtMs?: number | null;
        finishedAtMs?: number | null;
        context?: {
          source?: string | null;
          symbol?: string | null;
          timeframe?: string | null;
          strategy?: string | null;
          watcherId?: string | null;
          mode?: string | null;
        } | null;
        steps?: Array<{
          step: string;
          status: string;
          startedAtMs?: number | null;
          finishedAtMs?: number | null;
          attempts?: number | null;
          retryCount?: number | null;
          error?: string | null;
          note?: string | null;
        }>;
      }>;
      activeStepConfig?: {
        runId?: string | null;
        actionId?: string | null;
        maxRetries?: number | null;
        retryDelayMs?: number | null;
        timeoutMs?: number | null;
      } | null;
    } | null;
  } | null;
  taskPlaybooks?: {
    total?: number | null;
    updatedAtMs?: number | null;
    activeRun?: TaskPlaybookRun | null;
    recentRuns?: TaskPlaybookRun[] | null;
    library?: Array<{
      id: string;
      name: string;
      version?: number | null;
      defaultMode?: TaskPlaybookMode | null;
      symbol?: string | null;
      timeframes?: string[] | null;
      strategy?: SetupStrategy | null;
    }> | null;
  } | null;
  execution?: {
    playbookRunning?: boolean | null;
    playbookLastRunAtMs?: number | null;
    lossStreak?: {
      streak?: number | null;
      lastClosedAtMs?: number | null;
      updatedAtMs?: number | null;
      accountKey?: string | null;
    } | null;
    lastTrade?: {
      id: string;
      status?: string | null;
      symbol?: string | null;
      action?: string | null;
      executionMode?: string | null;
      executionId?: string | null;
      createdAtMs?: number | null;
      updatedAtMs?: number | null;
    } | null;
    lastTradeBlock?: TradeBlockInfo | null;
    shadow?: ShadowTradeStats | null;
  } | null;
  playbooks?: {
    watchersWithPlaybook?: number | null;
    activeCount?: number | null;
    byWatcher?: Record<string, {
      stepsTotal: number;
      stepsDone: number;
      breakevenDone: boolean;
      trailActive: boolean;
      lastActionAtMs: number | null;
      openedAtMs: number | null;
      positionId: string | null;
    }>;
  } | null;
  ledger?: {
    stats?: {
      path?: string | null;
      entriesCount?: number | null;
      memoriesCount?: number | null;
      agentMemoryCount?: number | null;
      optimizerCacheCount?: number | null;
      experimentCount?: number | null;
      researchSessionCount?: number | null;
      researchStepCount?: number | null;
      stateVersion?: number | null;
      persistedVersion?: number | null;
      pendingWrites?: number | null;
      persistDelayMs?: number | null;
      inFlight?: boolean | null;
      lastDirtyAtMs?: number | null;
      lastPersistAtMs?: number | null;
      lastError?: string | null;
    } | null;
    recentEntries?: Array<{
      id: string;
      kind?: string | null;
      status?: string | null;
      symbol?: string | null;
      action?: string | null;
      executionMode?: string | null;
      executionId?: string | null;
      runId?: string | null;
      decisionId?: string | null;
      createdAtMs?: number | null;
      updatedAtMs?: number | null;
    }>;
  } | null;
  persistence?: {
    overallOk?: boolean | null;
    updatedAtMs?: number | null;
    domains?: Record<string, {
      domain?: string | null;
      ok?: boolean | null;
      lastOkAtMs?: number | null;
      lastErrorAtMs?: number | null;
      lastError?: string | null;
      failures?: number | null;
      writesQueued?: number | null;
    }> | null;
  } | null;
  performance?: {
    summary?: SetupPerformance | null;
    updatedAtMs?: number | null;
    error?: string | null;
    byWatcherCount?: number | null;
    byLibraryCount?: number | null;
    byModeCount?: number | null;
    bySymbolCount?: number | null;
  } | null;
  backtester?: {
    symbol?: string | null;
    timeframe?: string | null;
    rangeDays?: number | null;
    bars?: number | null;
    stats?: Record<string, any> | null;
    performance?: Record<string, any> | null;
    validation?: Record<string, any> | null;
    walkForward?: Record<string, any> | null;
    updatedAtMs?: number | null;
  } | null;
}

export interface SetupLibraryEntry {
  key: string;
  configKey?: string | null;
  symbol: string;
  timeframe: string;
  strategy: SetupStrategy;
  params: Record<string, any>;
  evidence?: EvidenceCard | null;
  stats: {
    total?: number | null;
    winRate?: number | null;
    expectancy?: number | null;
    profitFactor?: number | null;
  };
  performance: {
    netR?: number | null;
    maxDrawdown?: number | null;
  };
  score: number;
  tier: SetupLibraryTier;
  winRateTier: SetupWinRateTier;
  runId?: string | null;
  rangeDays?: number | null;
  timeFilter?: { startHour?: number; endHour?: number; timezone?: 'utc' | 'local' } | null;
  createdAtMs: number;
  updatedAtMs: number;
  source?: string | null;
}

export interface AgentTestScenario {
  id: string;
  name: string;
  description?: string | null;
  playbookId?: string | null;
  playbook?: TaskPlaybook | null;
  steps?: TaskPlaybookStep[] | null;
  context?: {
    symbol?: string | null;
    timeframe?: string | null;
    timeframes?: string[] | null;
    strategy?: SetupStrategy | null;
    mode?: TaskPlaybookMode | null;
    data?: Record<string, any> | null;
  } | null;
  expected?: {
    status?: TaskPlaybookStepStatus | null;
    mustIncludeSteps?: string[] | null;
    mustIncludeActions?: string[] | null;
    mustIncludeEvents?: string[] | null;
    forbiddenEvents?: string[] | null;
    minStepsCompleted?: number | null;
    maxDurationMs?: number | null;
  } | null;
  tags?: string[] | null;
  createdAtMs: number;
  updatedAtMs: number;
  source?: string | null;
}

export interface AgentTestRun {
  id: string;
  runId: string;
  scenarioId: string;
  scenarioName?: string | null;
  status: TaskPlaybookStepStatus;
  startedAtMs: number;
  finishedAtMs?: number | null;
  metrics?: {
    totalSteps?: number | null;
    completedSteps?: number | null;
    failedSteps?: number | null;
    skippedSteps?: number | null;
    blockedSteps?: number | null;
    durationMs?: number | null;
    firstStepLatencyMs?: number | null;
    decisionLatencyMs?: number | null;
    truthEventCount?: number | null;
    truthEventTypes?: Record<string, number> | null;
    setupSignalCount?: number | null;
    setupTriggeredCount?: number | null;
    falseTriggerCount?: number | null;
    tradeOpenedCount?: number | null;
    tradeClosedCount?: number | null;
    tradeWinCount?: number | null;
    tradeLossCount?: number | null;
    tradeWinRate?: number | null;
    tradeNetPnl?: number | null;
    tradeAvgPnl?: number | null;
    tradeAvgSlippagePct?: number | null;
  } | null;
  diff?: {
    statusMismatch?: { expected: string | null; actual: string | null } | null;
    missingSteps?: string[] | null;
    missingActions?: string[] | null;
    missingEvents?: string[] | null;
    forbiddenEvents?: string[] | null;
    minStepsCompleted?: { expected: number; actual: number } | null;
    maxDurationExceeded?: { maxDurationMs: number; actual: number } | null;
  } | null;
  pass?: boolean | null;
  expected?: AgentTestScenario['expected'] | null;
  context?: AgentTestScenario['context'] | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
  source?: string | null;
}

export interface AgentToolAction {
  type: AgentToolActionType;
  status: 'PENDING' | 'EXECUTED' | 'FAILED';
  messageId?: string;
  correlationId?: string;
  agentId?: string;
  agentName?: string;
  capabilities?: AgentCapabilities;
  actionId?: string;
  payload?: Record<string, any>;
  dedupeKey?: string;
  source?: string;
  query?: string;
  path?: string;
  root?: string;
  includeAll?: boolean;
  regex?: boolean;
  caseSensitive?: boolean;
  contextLines?: number;
  maxResults?: number;
  maxLines?: number;
  maxFileBytes?: number;
  maxFileResults?: number;
  fullFile?: boolean;
  startLine?: number;
  endLine?: number;
  flowSource?: string;
  flowSink?: string;
  extensions?: string[];
  symbol?: string;
  symbols?: string[];
  timeframe?: string;
  timeframes?: string[];
  watcherId?: string;
  watcherIds?: string[];
  profileId?: string;
  signalId?: string;
  includeSnapshot?: boolean;
  includeReplay?: boolean;
  detail?: 'summary' | 'full';
  maxItems?: number;
  format?: 'jpeg' | 'png';
  quality?: number;
  width?: number;
  height?: number;
  save?: boolean;
  label?: string;
  libraryKey?: string;
  libraryTier?: SetupLibraryTier | string;
  winRateTier?: SetupWinRateTier | string;
  mode?: SetupWatcherMode;
  enabled?: boolean;
  params?: Record<string, any>;
  memoryKey?: string;
  memoryId?: string;
  kind?: string;
  tags?: string[];
  strategy?: string;
  strategyDescription?: string;
  timeFilter?: { startHour?: number; endHour?: number; timezone?: 'utc' | 'local' };
  paramGrid?: Record<string, any>;
  playbook?: ExecutionPlaybook | null;
  regime?: SetupRegimeGate;
  rangeDays?: number;
  maxCombos?: number;
  presetKey?: string;
  usePreset?: boolean;
  presetName?: string;
  progressPct?: number;
  progressDone?: number;
  progressTotal?: number;
  progressLabel?: string;
  reason?: string;
  maxEpisodes?: number;
  offset?: number;
  limit?: number;
  sinceMs?: number;
  baselineRunId?: string;
  sessionId?: string;
  winnerId?: string;
  round?: number;
  includeHumanReadable?: boolean;
  objectivePreset?: string;
  objective?: Record<string, any>;
  searchSpacePreset?: string;
  budget?: number;
  parallelism?: number;
  rounds?: number;
  hypothesis?: string;
  validation?: Record<string, any>;
  maxExperiments?: number;
  maxRuntimeSec?: number;
  plateauLimit?: number;
  robustness?: {
    spreadBpsVariants?: number[];
    slippagePctVariants?: number[];
    oosShiftDays?: number[];
  };
  robustnessLevel?: 'lite' | 'standard' | 'strict' | string;
  allowRegimeBrittle?: boolean;
  requiredRegimePassRate?: number;
  criticalRegimes?: string[];
  minRegimesSeen?: number;
  targetRegimeKey?: string;
  minTargetRegimeSamples?: number;
  execution?: Record<string, any>;
  executionPreset?: string;
  realityPreset?: string;
  error?: string;
  executedAtMs?: number;
}

export interface AgentToolResult {
  ok: boolean;
  text: string;
  imageDataUrl?: string | null;
  payload?: any;
}

export type ActionDomain =
  | 'ui'
  | 'chat'
  | 'broker'
  | 'settings'
  | 'mt5'
  | 'autopilot'
  | 'backtest'
  | 'chart'
  | 'playbook'
  | 'watcher'
  | 'setup'
  | 'agent'
  | 'agent_test'
  | 'tasktree'
  | 'notes'
  | 'system'
  | 'ledger';

export type ActionOwner = 'ui' | 'agent' | 'autopilot' | 'system' | 'user';

export type ActionGate =
  | 'confirmation'
  | 'risk'
  | 'permissions'
  | 'rate_limit'
  | 'broker_connected'
  | 'broker_trading_enabled'
  | 'autopilot_enabled'
  | 'backtester_ready'
  | 'chart_ready'
  | 'watcher_exists';

export type ActionPrerequisite = {
  type: ActionGate;
  message?: string;
};

export interface ActionDefinition {
  id: string;
  domain: ActionDomain;
  owner: ActionOwner;
  summary: string;
  description?: string | null;
  requiresVision?: boolean;
  requiresBroker?: boolean;
  safety?: {
    gates?: ActionGate[];
    requiresConfirmation?: boolean;
    killSwitchSensitive?: boolean;
  } | null;
  prerequisites?: ActionPrerequisite[];
  auditEventType?: string | null;
  defaultTimeoutMs?: number | null;
}

export type SidebarMode =
  | 'chat'
  | 'signal'
  | 'snapshot'
  | 'patterns'
  | 'chartchat'
  | 'notes'
  | 'shadow'
  | 'calendar'
  | 'mt5'
  | 'tradelocker'
  | 'autopilot'
  | 'leaderboard'
  | 'dashboard'
  | 'monitor'
  | 'nativechart'
  | 'backtester'
  | 'agentcreator'
  | 'agentmemory'
  | 'agentlab'
  | 'setups'
  | 'audit'
  | 'changes'
  | 'academy';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
}

export type ChartTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export type ChartSnapshotReasonCode =
  | 'NO_SYMBOL_SELECTED'
  | 'NO_TIMEFRAMES_SUBSCRIBED'
  | 'STORE_EMPTY'
  | 'BROKER_DISCONNECTED'
  | 'SNAPSHOT_TIMEOUT'
  | 'WARMUP_TIMEOUT'
  | 'RENDER_FAILED'
  | 'PAYLOAD_STRIPPED';

export interface ChartSnapshotFrameSummary {
  tf: string;
  barsCount: number;
  lastUpdatedAtMs?: number | null;
  indicators?: ChartIndicatorFrameSummary | null;
}

export interface ChartIndicatorFrameSummary {
  indicatorContextVersion?: 'v1' | null;
  vwapSession?: string | null;
  vwap?: number | null;
  vwapDistanceBps?: number | null;
  bbBasis?: number | null;
  bbUpper?: number | null;
  bbLower?: number | null;
  bbWidthPct?: number | null;
  bbZScore?: number | null;
  bbPosition?: string | null;
  ichimokuTenkan?: number | null;
  ichimokuKijun?: number | null;
  ichimokuSenkouA?: number | null;
  ichimokuSenkouB?: number | null;
  ichimokuChikou?: number | null;
  ichimokuBias?: string | null;
  fibAnchorHigh?: number | null;
  fibAnchorLow?: number | null;
  fibDirection?: 'up' | 'down' | null;
  fibNearestLevel?: string | null;
  fibNearestDistanceBps?: number | null;
  fibLevels?: Record<string, number> | null;
}

export interface ChartChatSnapshotStatus {
  msgId: string;
  symbol: string | null;
  timeframes: string[];
  capturedAtMs: number | null;
  imageDataUrl?: string | null;
  frames: ChartSnapshotFrameSummary[];
  ok: boolean;
  reasonCode?: ChartSnapshotReasonCode | null;
  warnings?: string[];
  payloadChars?: number | null;
}

export interface SymbolScope {
  symbol: string;
  timeframes: ChartTimeframe[];
  updatedAtMs: number;
  source?: string | null;
}

export interface ChartSession {
  id: string;
  symbol: string;
  createdAtMs: number;
  updatedAtMs: number;
  watchEnabled: boolean;
  views: Record<ChartTimeframe, string | null>; // timeframe -> tabId
  roiProfileId?: string | null;
  notes?: string | null;
}
