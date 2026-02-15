const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('trade ledger sqlite defines explicit schema version constants and migration runner', () => {
  const source = read('electron/tradeLedgerSqlite.cjs');
  assert.equal(source.includes('LEDGER_SCHEMA_VERSION_KEY'), true);
  assert.equal(source.includes('LEDGER_SCHEMA_VERSION_LATEST = 3'), true);
  assert.equal(source.includes('_runSchemaMigrations()'), true);
  assert.equal(source.includes('_schemaMigrationHandlers()'), true);
  assert.equal(source.includes("Missing ledger schema migration handler"), true);
});

test('schema v2 scaffold creates ledger_migrations table and marker row', () => {
  const source = read('electron/tradeLedgerSqlite.cjs');
  assert.equal(source.includes('CREATE TABLE IF NOT EXISTS ledger_migrations'), true);
  assert.equal(source.includes("'v2_scaffold'"), true);
  assert.equal(source.includes('Schema v2 migration scaffold applied'), true);
  assert.equal(source.includes("'v3_archive_tier'"), true);
  assert.equal(source.includes('Schema v3 archive table scaffold applied'), true);
});
