const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('auto-lock helper is WIN/LOSS-only and no-ops for other statuses', () => {
  const app = read('App.tsx');

  assert.equal(app.includes("return key === 'WIN' || key === 'LOSS';"), true);
  assert.equal(app.includes('if (!isAutoLockOutcome(outcomeRaw)) return payload;'), true);
  assert.equal(app.includes('const shouldAutoLock = isAutoLockOutcome(payload.outcome ?? payload.status);'), true);
  assert.equal(app.includes('if (shouldAutoLock) {'), true);
});

