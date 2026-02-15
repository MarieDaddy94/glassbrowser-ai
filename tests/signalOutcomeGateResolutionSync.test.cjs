const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal scan gate treats simulated outcomes as closed for open-count blocking', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const isFinalSignalStatus = (status?: string | null) => {'), true);
  assert.equal(app.includes('const simulated = simulatedOutcomeRef.current.get(entry.id);'), true);
  assert.equal(
    app.includes('if (simulated && Number(simulated.createdAtMs || 0) === Number(entry.createdAtMs || 0)) continue;'),
    true
  );
});

test('simulated outcome resolver finalizes signal entries status in-memory', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const outcomeUpdateIds = Object.keys(outcomeUpdates);'), true);
  assert.equal(app.includes("const executionMode = entry.executionMode || 'simulated';"), true);
  assert.equal(app.includes("status: SignalEntry['status'] = update.outcome;"), true);
  assert.equal(app.includes("status === 'EXPIRED'"), true);
  assert.equal(app.includes("Expired (simulated outcome)."), true);
});
