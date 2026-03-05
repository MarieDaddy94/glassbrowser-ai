const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('baseline audit command and script are wired', () => {
  const pkg = read('package.json');
  const script = read('scripts/auditBaseline.cjs');
  assert.equal(pkg.includes('"audit:baseline": "node scripts/auditBaseline.cjs"'), true);
  assert.equal(script.includes("enterprise-baseline.json"), true);
  assert.equal(script.includes('buildAppComplexity'), true);
  assert.equal(script.includes('buildIpcSurface'), true);
  assert.equal(script.includes('buildWebviewUsageMap'), true);
  assert.equal(script.includes('buildSidecarLifecycleMap'), true);
});
