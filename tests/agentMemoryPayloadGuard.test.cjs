const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal_entry and academy_case payloads are guarded against null payload writes', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');
  const json = read('electron/tradeLedger.cjs');

  for (const source of [sqlite, json]) {
    assert.equal(source.includes('function ensureSignalCasePayload(entry, signalId) {'), true);
    assert.equal(
      source.includes("normalizeKindValue(next.kind) === 'signal_entry' || normalizeKindValue(next.kind) === 'academy_case'"),
      true
    );
    assert.equal(source.includes('next.payload = ensureSignalCasePayload(next, signalId);'), true);
  }
});
