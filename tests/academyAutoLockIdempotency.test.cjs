const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('auto-lock paths are idempotent across repeated refresh/upsert cycles', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const autoLockedSignalIds = new Set<string>();'), true);
  assert.equal(app.includes('if (!normalizedSignalId || autoLockedSignalIds.has(normalizedSignalId) || !before || !after) return;'), true);
  assert.equal(app.includes('if (!changed) return;'), true);
  assert.equal(app.includes('if (autoLockReconciledSignalIds.has(signalId)) continue;'), true);
  assert.equal(app.includes('const autoLockTransitioned = !wasLockedBeforeAuto && payload.locked === true;'), true);
  assert.equal(app.includes('if (autoLockTransitioned) {'), true);
});

