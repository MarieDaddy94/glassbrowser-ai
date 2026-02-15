const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('Signal and Snapshot panels share unified snapshot status classifier and labeling', () => {
  const signal = read('components/SignalInterface.tsx');
  const snapshot = read('components/SnapshotInterface.tsx');
  const app = read('App.tsx');
  const unified = read('services/unifiedSnapshotStatus.ts');

  assert.equal(unified.includes('export const classifyUnifiedSnapshotStatus'), true);
  assert.equal(unified.includes('export const formatUnifiedSnapshotStatusLabel'), true);
  assert.equal(unified.includes('export const buildSnapshotScopeKey'), true);

  assert.equal(signal.includes('classifyUnifiedSnapshotStatus'), true);
  assert.equal(signal.includes('formatUnifiedSnapshotStatusLabel'), true);
  assert.equal(snapshot.includes('classifyUnifiedSnapshotStatus'), true);
  assert.equal(snapshot.includes('formatUnifiedSnapshotStatusLabel'), true);

  assert.equal(app.includes('const effectiveSignalSnapshotStatus = React.useMemo(() => {'), true);
  assert.equal(app.includes("if (normalizedPanel?.state !== 'ready') return normalizedSignal;"), true);
  assert.equal(app.includes('snapshotStatus={effectiveSignalSnapshotStatus}'), true);
  assert.equal(app.includes('const normalizedStatus = classifyUnifiedSnapshotStatus(status) || status;'), true);
  assert.equal(app.includes('const normalizedStatus = classifyUnifiedSnapshotStatus(statusWithGaps) || statusWithGaps;'), true);
});
