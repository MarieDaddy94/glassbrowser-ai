const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('action catalog bus is shared across chat/notes/setups/audit/changes through runtime handlers', () => {
  const app = read('App.tsx');
  const agentRuntime = read('services/catalogAgentRuntime.ts');
  const chat = read('components/ChatInterface.tsx');
  const notes = read('components/NotesInterface.tsx');
  const setups = read('components/SetupsInterface.tsx');
  const audit = read('components/AuditTrailInterface.tsx');
  const changes = read('components/ChangesInterface.tsx');

  assert.equal(app.includes('panelConnectivityEngine.runAction({'), true);
  assert.equal(app.includes("type: 'RUN_ACTION_CATALOG'"), true);

  assert.equal(agentRuntime.includes('runNotesActionRuntime'), true);
  assert.equal(agentRuntime.includes('runAuditActionRuntime'), true);
  assert.equal(agentRuntime.includes('runChangesShadowActionRuntime'), true);

  assert.equal(chat.includes('onRunActionCatalog?: (input: { actionId: string; payload?: Record<string, any> }) => Promise<any> | any;'), true);
  assert.equal(notes.includes("runActionOr('notes.filters.set'"), true);
  assert.equal(setups.includes("runActionOr('setups.filters.set'"), true);
  assert.equal(audit.includes("actionId: 'audit.list'"), true);
  assert.equal(changes.includes("actionId: 'changes.list'"), true);
});

test('broker coordinator dedupe key is enforced and used by signal/snapshot/chart/backtest/settings paths', () => {
  const coordinator = read('services/brokerRequestCoordinator.ts');
  const app = read('App.tsx');
  const nativeChart = read('components/NativeChartInterface.tsx');
  const backtestResearch = read('services/backtestResearchService.ts');
  const settings = read('components/SettingsModal.tsx');

  assert.equal(coordinator.includes('method'), true);
  assert.equal(coordinator.includes('symbol'), true);
  assert.equal(coordinator.includes('timeframe'), true);
  assert.equal(coordinator.includes('maxAgeMs'), true);
  assert.equal(coordinator.includes('argsHash'), true);

  assert.equal(app.includes('const coordinated = await brokerRequestCoordinator.run('), true);
  assert.equal(app.includes('requestBrokerWithAudit('), true);
  assert.equal(app.includes("requestBrokerWithAudit('getHistorySeries'"), true);
  assert.equal(nativeChart.includes('requestBrokerCoordinated(method, args'), true);
  assert.equal(backtestResearch.includes("requestBrokerCoordinated('getHistorySeries'"), true);
  assert.equal(settings.includes('requestBrokerCoordinated("getStatus"'), true);
});

test('diagnostics aggregation and cache budget telemetry are surfaced from shared health state', () => {
  const app = read('App.tsx');
  const monitor = read('components/MonitorInterface.tsx');
  const agentMemory = read('components/AgentMemoryInterface.tsx');
  const backtestResearch = read('services/backtestResearchService.ts');
  const backtestWorker = read('services/backtestComputeWorkerClient.ts');
  const techLog = read('services/techAgentLog.ts');

  assert.equal(app.includes('diagnosticsRateLimiter.drainAggregated()'), true);
  assert.equal(app.includes('aggregatedCount: agg.count,'), true);
  assert.equal(app.includes('suppressedCount: Math.max(0, agg.count - 1),'), true);
  assert.equal(app.includes('windowMs: agg.windowMs,'), true);

  assert.equal(app.includes('cacheBudgets: cacheBudgetManager.getTelemetry(),'), true);
  assert.equal(monitor.includes('const cacheBudgetRows = Array.isArray(liveHealth?.cacheBudgets) ? liveHealth.cacheBudgets : [];'), true);

  assert.equal(agentMemory.includes("const AGENT_MEMORY_QUERY_CACHE_BUDGET = 'agent_memory.query_cache';"), true);
  assert.equal(backtestResearch.includes("name: 'backtestResearch.historyCache'"), true);
  assert.equal(backtestResearch.includes("name: 'backtestResearch.inFlight'"), true);
  assert.equal(backtestWorker.includes("const QUEUE_BUDGET_NAME = 'backtest.worker.queue';"), true);
  assert.equal(techLog.includes("const TECH_LOG_BUDGET_NAME = 'techAgent.logCache';"), true);
});
