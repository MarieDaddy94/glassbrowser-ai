const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('agent-memory upsert canonicalizes legacy signal keys in sqlite and json ledgers', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');
  const json = read('electron/tradeLedger.cjs');

  for (const source of [sqlite, json]) {
    assert.equal(source.includes('function canonicalAgentMemoryKey(kind, signalId, rawKey) {'), true);
    assert.equal(source.includes('const signalId = resolveSignalIdentity(next);'), true);
    assert.equal(source.includes('const canonicalKey = canonicalAgentMemoryKey(next.kind, signalId, next.key);'), true);
    assert.equal(source.includes('if (canonicalKey) {'), true);
    assert.equal(source.includes('next.key = canonicalKey;'), true);
  }
});

test('json ledger runs legacy signal-case repair at startup', () => {
  const json = read('electron/tradeLedger.cjs');
  assert.equal(json.includes('this._repairLegacySignalCaseRows();'), true);
  assert.equal(json.includes('const LEGACY_SIGNAL_CASE_REPAIR_KEY = \'legacy_signal_case_repair_v1\';'), true);
});
