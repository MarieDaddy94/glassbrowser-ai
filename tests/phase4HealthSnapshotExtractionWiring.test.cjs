const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 health snapshot runtime extraction wiring is present', () => {
  const app = read('App.tsx');
  const hook = read('hooks/orchestrators/useHealthSnapshotRuntime.ts');

  assert.equal(
    app.includes("import { useHealthSnapshotRuntime } from './hooks/orchestrators/useHealthSnapshotRuntime';"),
    true
  );
  assert.equal(app.includes('useHealthSnapshotRuntime({'), true);
  assert.equal(app.includes('const buildHealthSnapshot = useCallback((): HealthSnapshot => {'), false);
  assert.equal(app.includes('buildHealthSnapshotRef.current = buildHealthSnapshot;'), false);
  assert.equal(hook.includes('const buildHealthSnapshot = React.useCallback((): HealthSnapshot => {'), true);
  assert.equal(hook.includes("eventType: 'health_heartbeat'"), true);
  assert.equal(hook.includes('setHealthSnapshot(snapshot);'), true);
});

