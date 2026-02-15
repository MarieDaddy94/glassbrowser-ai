const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('snapshot panel forces READY when coverage is delayed but usable frames exist', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const hasUsableFrames = framesSummary.some((frame) => Number(frame?.barsCount || 0) > 0);'), true);
  assert.equal(app.includes("const isCoverageDelayed = String(normalizedStatus?.state || '').trim().toLowerCase() === 'coverage_delayed';"), true);
  assert.equal(app.includes('const shouldForceReadyFromCoverage = isCoverageDelayed && hasUsableFrames;'), true);
  assert.equal(app.includes("const effectivePanelStatus = (!reasonCode || shouldForceReadyFromCoverage)"), true);
  assert.equal(app.includes("state: 'ready'"), true);
  assert.equal(app.includes("source: 'snapshot_ready_override_applied'"), true);
});

