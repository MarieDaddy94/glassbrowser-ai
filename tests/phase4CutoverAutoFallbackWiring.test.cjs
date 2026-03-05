const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 migration parity mismatches can auto-disable a slice for rollback-safe cutover', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('PHASE4_SLICE_MISMATCH_AUTO_FALLBACK_THRESHOLD'), true);
  assert.equal(app.includes('PHASE4_MIGRATION_SLICE_FLAG_MAP'), true);
  assert.equal(app.includes("const disablePatch = { [sliceFlagKey]: false } as Partial<EnterpriseFeatureFlags>;"), true);
  assert.equal(app.includes('setEnterpriseFeatureFlags(disablePatch);'), true);
  assert.equal(app.includes("[phase4-cutover-auto-fallback]"), true);
  assert.equal(app.includes("action: 'slice_auto_fallback'"), true);
  assert.equal(
    app.includes('mismatchCount >= PHASE4_SLICE_MISMATCH_AUTO_FALLBACK_THRESHOLD'),
    true
  );
});
