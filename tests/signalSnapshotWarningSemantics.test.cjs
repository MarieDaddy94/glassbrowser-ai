const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal panel copy distinguishes snapshot coverage delay from hard capture failure', () => {
  const signal = read('components/SignalInterface.tsx');
  const unified = read('services/unifiedSnapshotStatus.ts');
  assert.equal(signal.includes('formatUnifiedSnapshotStatusLabel(status,'), true);
  assert.equal(unified.includes('Snapshot coverage delayed'), true);
  assert.equal(unified.includes('Snapshot capture failed'), true);
});

test('chart snapshot diagnostics map timeout and warmup into warning severity', () => {
  const app = read('App.tsx');
  assert.equal(app.includes("const coverageCodes = new Set(['SNAPSHOT_TIMEOUT', 'WARMUP_TIMEOUT']);"), true);
  assert.equal(app.includes("const severity: 'warn' | 'error' = hasCoverageDelay || hasUsableFrames ? 'warn' : 'error';"), true);
  assert.equal(app.includes("const issueLabel = hasCoverageDelay ? 'coverage delayed' : 'capture failure';"), true);
});
