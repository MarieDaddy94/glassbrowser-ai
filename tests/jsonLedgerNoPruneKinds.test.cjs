const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('json ledger trim protects non-prunable signal/academy kinds in electron and fallback ledgers', () => {
  const electronLedger = read('electron/tradeLedger.cjs');
  const fallbackLedger = read('tradeLedger.cjs');

  for (const source of [electronLedger, fallbackLedger]) {
    assert.equal(source.includes('const NON_PRUNABLE_AGENT_MEMORY_KINDS = Object.freeze(['), true);
    assert.equal(source.includes('const NON_PRUNABLE_AGENT_MEMORY_KIND_SET = new Set(NON_PRUNABLE_AGENT_MEMORY_KINDS);'), true);
    assert.equal(source.includes("'academy_lesson'"), true);
    assert.equal(source.includes("'academy_symbol_learning'"), true);
    assert.equal(source.includes('function isNonPrunableAgentMemoryKind(entry) {'), true);
    assert.equal(source.includes("console.warn('[agent_memory_trim_skipped_non_prunable]'"), true);
  }
});
