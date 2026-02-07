const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('refresh SLA monitor supports multi-channel snapshots', () => {
  const source = read('services/refreshSlaMonitor.ts');
  assert.equal(source.includes("RefreshSlaChannel = 'signal' | 'snapshot' | 'backtest'"), true);
  assert.equal(source.includes('getChannelSnapshot('), true);
  assert.equal(source.includes('getChannelSnapshots('), true);
  assert.equal(source.includes('lastSuccessAtMs'), true);
});

test('app publishes channel SLA in health snapshot', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('refreshSlaByChannel = refreshSlaMonitor.getChannelSnapshots(now)'), true);
  assert.equal(app.includes('refreshSlaByChannel: refreshSlaByChannel as any'), true);
});
