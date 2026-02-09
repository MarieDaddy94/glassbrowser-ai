const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('monitor surfaces scheduler/cache/broker/startup telemetry from shared health snapshot', () => {
  const monitor = read('components/MonitorInterface.tsx');

  assert.equal(monitor.includes('const schedulerHealth = liveHealth?.scheduler || null;'), true);
  assert.equal(monitor.includes('const cacheBudgetRows = Array.isArray(liveHealth?.cacheBudgets) ? liveHealth.cacheBudgets : [];'), true);

  assert.equal(monitor.includes('<MetricCard title="Scheduler">'), true);
  assert.equal(monitor.includes('<MetricCard title="Cache Budgets">'), true);
  assert.equal(monitor.includes('<MetricCard title="Startup">'), true);
  assert.equal(monitor.includes('<MetricCard title="Broker">'), true);
  assert.equal(monitor.includes('<MetricCard title="Bridge Domains">'), true);

  assert.equal(monitor.includes('value={liveHealth.startupPhase ||'), true);
  assert.equal(monitor.includes('value={liveHealth.startupBridgeState ||'), true);
  assert.equal(monitor.includes('value={liveHealth.startupOpenaiState ||'), true);
  assert.equal(monitor.includes('value={liveHealth.startupTradeLockerState ||'), true);
});

test('health snapshot builder publishes scheduler/cache/startup/bridge fields for monitor', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const refreshSlaByChannel = refreshSlaMonitor.getChannelSnapshots(now);'), true);
  assert.equal(app.includes('const bridgeDomainReadiness = getDomainReadiness();'), true);
  assert.equal(app.includes('const schedulerStats = runtimeScheduler.getStats();'), true);

  assert.equal(app.includes('startupPhase: startup?.startupPhase ?? startupPhase ?? null,'), true);
  assert.equal(app.includes('startupBridgeState: startup?.bridgeState ?? startupBridgeState ?? null,'), true);
  assert.equal(app.includes('startupBridgeError: startup?.bridgeError ?? startupBridgeError ?? null,'), true);
  assert.equal(app.includes('cacheBudgets: cacheBudgetManager.getTelemetry(),'), true);
  assert.equal(app.includes('scheduler: {'), true);
  assert.equal(app.includes('refreshSlaByChannel: refreshSlaByChannel as any,'), true);
  assert.equal(app.includes('bridgeDomainReadiness: bridgeDomainReadiness as any,'), true);
});
