const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal outcome gate ignores malformed legacy entries and keeps resolved flow writers wired', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const hasSignalTradeDefinition = (entry: any) => {'), true);
  assert.equal(app.includes('if (!hasSignalTradeDefinition(entry)) continue;'), true);
  assert.equal(app.includes('const staleDraftAgeMs = Math.max(30 * 60_000, Number(signalExpiryMinutes || 0) * 60_000 * 2);'), true);

  assert.equal(app.includes("key: `signal_history:${entry.id}`,"), true);
  assert.equal(app.includes("kind: 'signal_history',"), true);
  assert.equal(app.includes('const key = `academy_case:${caseId}`;'), true);
  assert.equal(app.includes('await ledger.upsertAgentMemory({'), true);
  assert.equal(app.includes('key,'), true);
  assert.equal(app.includes("kind: 'academy_case',"), true);
});
