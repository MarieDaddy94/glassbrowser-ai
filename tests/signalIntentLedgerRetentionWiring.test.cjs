const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal intent memory kinds are protected in ledger no-prune sets', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');
  const electronJson = read('electron/tradeLedger.cjs');
  const localJson = read('tradeLedger.cjs');

  for (const source of [sqlite, electronJson, localJson]) {
    assert.equal(source.includes("'signal_intent'"), true);
    assert.equal(source.includes("'signal_intent_run'"), true);
    assert.equal(source.includes("'signal_intent_chat'"), true);
  }
});

