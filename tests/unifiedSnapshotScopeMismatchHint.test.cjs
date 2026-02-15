const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('scope mismatch wiring is explicit between Signal and Snapshot status scopes', () => {
  const app = read('App.tsx');
  const signal = read('components/SignalInterface.tsx');

  assert.equal(app.includes('const signalSnapshotScopeMismatch = React.useMemo(() => {'), true);
  assert.equal(app.includes('snapshotScopeMismatch={signalSnapshotScopeMismatch}'), true);
  assert.equal(app.includes('buildSnapshotScopeKey('), true);
  assert.equal(app.includes('if (signalScopeKey === panelScopeKey) return null;'), true);

  assert.equal(signal.includes('snapshotScopeMismatch?: { signalScopeKey?: string | null; panelScopeKey?: string | null } | null;'), true);
  assert.equal(signal.includes('Scope mismatch: Signal snapshot scope differs from Snapshot panel scope.'), true);
});
