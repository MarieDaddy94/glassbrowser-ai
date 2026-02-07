const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('monitor includes panel connectivity and outcome feed telemetry cards', () => {
  const source = read('components/MonitorInterface.tsx');
  assert.equal(source.includes('MetricCard title="Panel Connectivity"'), true);
  assert.equal(source.includes('MetricCard title="Outcome Feed"'), true);
  assert.equal(source.includes('MetricCard title="Panel Freshness"'), true);
  assert.equal(source.includes('liveHealth?.outcomeFeed?.consistency'), true);
  assert.equal(source.includes('liveHealth?.panelConnectivity'), true);
  assert.equal(source.includes('liveHealth?.panelFreshness'), true);
});

test('signal panel surfaces context and connectivity degradation hints', () => {
  const signal = read('components/SignalInterface.tsx');
  assert.equal(signal.includes('crossPanelContext?: CrossPanelContext | null;'), true);
  assert.equal(signal.includes('const signalPanelConnectivity = useMemo(() => {'), true);
  assert.equal(signal.includes('Connectivity: '), true);
});
