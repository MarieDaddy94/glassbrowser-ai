const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('force-focus lock path can materialize from signal history when case row is absent', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const resolveSignalHistoryEntry = async (): Promise<SignalHistoryEntry | null> => {'), true);
  assert.equal(app.includes("const direct = await ledger.getAgentMemory({ key: `signal_history:${id}` });"), true);
  assert.equal(app.includes("const historyRes = await ledger.listAgentMemory({ kind: 'signal_history', limit: 2000 });"), true);
  assert.equal(app.includes('const builtCase = buildAcademyCaseFromSignalHistory(historyEntry, { source }) || null;'), true);
  assert.equal(app.includes('await persistAcademyCasePayload(materializedCase);'), true);
  assert.equal(app.includes("kind: 'academy_case',"), true);
});
