const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('legacy academy/signal rows are repaired into canonical keys in both ledgers', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');
  const json = read('electron/tradeLedger.cjs');

  for (const source of [sqlite, json]) {
    assert.equal(source.includes('_repairLegacySignalCaseRows() {'), true);
    assert.equal(source.includes("LEGACY_SIGNAL_CASE_REPAIR_KEY"), true);
    assert.equal(source.includes("kind IN ('signal_entry', 'academy_case')") || source.includes("kind !== 'signal_entry' && kind !== 'academy_case'"), true);
    assert.equal(source.includes("key LIKE 'signal_%'") || source.includes('isLegacySignalKey(entry.key)'), true);
    assert.equal(source.includes("canonicalAgentMemoryKey(kind, signalId") || source.includes('canonicalAgentMemoryKey(next.kind, signalId'), true);
  }
});
