const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('monitor exposes manual soak capture and export controls', () => {
  const monitor = read('components/MonitorInterface.tsx');

  assert.equal(monitor.includes('<MetricCard title="Manual Soak">'), true);
  assert.equal(monitor.includes('Start Run'), true);
  assert.equal(monitor.includes('Capture Checkpoint'), true);
  assert.equal(monitor.includes('Export Evidence'), true);
  assert.equal(monitor.includes("subdir: 'manual-soak'"), true);
  assert.equal(monitor.includes('buildSoakCheckpointSummary'), true);
});

