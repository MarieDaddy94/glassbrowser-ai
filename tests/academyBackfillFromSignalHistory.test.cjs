const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh backfills missing cases from resolved signal history and resolved signal-entry fallback', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const nextBySignalId = new Map<string, AcademyCase>();'), true);
  assert.equal(app.includes('const resolvedHistoryBySignalId = new Map<string, SignalHistoryEntry>();'), true);
  assert.equal(app.includes('const resolvedSignalEntryEntries ='), true);
  assert.equal(app.includes('const signalEntryFallbackHistoryEntries: SignalHistoryEntry[] = resolvedSignalEntryEntries.map((entry) => {'), true);
  assert.equal(app.includes('for (const entry of signalEntryFallbackHistoryEntries) {'), true);
  assert.equal(app.includes('for (const historyEntry of resolvedHistoryBySignalId.values()) {'), true);
  assert.equal(app.includes("buildAcademyCaseFromSignalHistory(historyEntry, { source: 'academy_repair' })"), true);
  assert.equal(app.includes('const repairedSignalIds = new Set<string>();'), true);
});
