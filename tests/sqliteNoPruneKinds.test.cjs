const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('sqlite ledger trim protects non-prunable signal/academy kinds', () => {
  const sqliteLedger = read('electron/tradeLedgerSqlite.cjs');

  assert.equal(sqliteLedger.includes('const NON_PRUNABLE_AGENT_MEMORY_KINDS = Object.freeze(['), true);
  assert.equal(sqliteLedger.includes("'signal_entry'"), true);
  assert.equal(sqliteLedger.includes("'signal_history'"), true);
  assert.equal(sqliteLedger.includes("'academy_case'"), true);
  assert.equal(sqliteLedger.includes("'academy_case_lock'"), true);
  assert.equal(sqliteLedger.includes("'academy_lesson'"), true);
  assert.equal(sqliteLedger.includes("'academy_symbol_learning'"), true);
  assert.equal(sqliteLedger.includes('const nonPrunableKinds = NON_PRUNABLE_AGENT_MEMORY_KINDS.map((kind) => String(kind).trim().toLowerCase()).filter(Boolean);'), true);
  assert.equal(sqliteLedger.includes("console.warn('[agent_memory_trim_skipped_non_prunable]'"), true);
});
