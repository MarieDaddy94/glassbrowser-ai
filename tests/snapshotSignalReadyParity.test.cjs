const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal status is forced to ready only when snapshot panel status is ready for strict matching scope', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const effectiveSignalSnapshotStatus = React.useMemo(() => {'), true);
  assert.equal(app.includes("if (normalizedPanel?.state !== 'ready') return normalizedSignal;"), true);
  assert.equal(app.includes('const scopeMatches = !!signalScopeKey && !!panelScopeKey && signalScopeKey === panelScopeKey;'), true);
  assert.equal(app.includes('if (!scopeMatches) return normalizedSignal;'), true);
  assert.equal(app.includes('symbolMatches'), false);
  assert.equal(app.includes("state: 'ready'"), true);
  assert.equal(app.includes('ok: true,'), true);
});
