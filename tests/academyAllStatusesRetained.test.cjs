const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh no longer filters to final outcomes only', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const hydrated = reconcileAutoLockCase(hydrateAcademyCaseFinality(normalized)) || hydrateAcademyCaseFinality(normalized);'), true);
  assert.equal(app.includes('if (!isFinalAcademyCase(hydrated)) {'), false);
  assert.equal(app.includes('.filter((entry): entry is SignalHistoryEntry => !!entry && isFinalOutcome(entry))'), false);
  assert.equal(app.includes('.filter((entry): entry is SignalEntry => !!entry && isFinalOutcome(entry))'), false);
});
