const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('trade ledger kind inference only classifies academy_case when payload looks case-shaped', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');
  const json = read('electron/tradeLedger.cjs');

  for (const source of [sqlite, json]) {
    assert.equal(source.includes('function looksLikeAcademyCasePayload(payload) {'), true);
    assert.equal(
      source.includes("if ((sourceKey === 'academy' || sourceKey === 'academy_analyst') && looksLikeAcademyCasePayload(payload)) {"),
      true
    );
    assert.equal(source.includes("if (sourceKey === 'academy' || sourceKey === 'academy_analyst') {\n      return 'academy_case';"), false);
    const academyBranch = source.indexOf("if ((sourceKey === 'academy' || sourceKey === 'academy_analyst') && looksLikeAcademyCasePayload(payload)) {");
    const signalHintBranch = source.indexOf('const hasSignalHints = !!actionKey || hasPriceHints || !!normalizeKindValue(payload?.symbol || entry.symbol);');
    assert.equal(academyBranch >= 0 && signalHintBranch >= 0, true);
    assert.equal(academyBranch < signalHintBranch, true);
  }
});
