const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('snapshot panel ready label is exact legacy text', () => {
  const status = read('services/unifiedSnapshotStatus.ts');
  const snapshot = read('components/SnapshotInterface.tsx');
  assert.equal(status.includes("export const UNIFIED_SNAPSHOT_READY_LABEL = 'NATIVE SNAPSHOT READY';"), true);
  assert.equal(snapshot.includes('readyLabel: UNIFIED_SNAPSHOT_READY_LABEL'), true);
});
