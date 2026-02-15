const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('sqlite ledger infers/backfills agent memory kinds, materializes legacy signal history, and filters by inferred kind', () => {
  const sqlite = read('electron/tradeLedgerSqlite.cjs');
  assert.equal(sqlite.includes('function inferAgentMemoryKind(input) {'), true);
  assert.equal(sqlite.includes('this._repairAgentMemoryKinds();'), true);
  assert.equal(sqlite.includes('this._materializeLegacySignalHistories();'), true);
  assert.equal(sqlite.includes("const LEGACY_SIGNAL_HISTORY_BACKFILL_KEY = 'legacy_signal_history_materialized_v1';"), true);
  assert.equal(sqlite.includes("WHERE key LIKE 'signal_outcome_resolved:%'"), true);
  assert.equal(sqlite.includes('const canonicalKey = `signal_history:${signalId}`;'), true);
  assert.equal(sqlite.includes('const entryKind = normalizeKindValue(entry.kind || inferAgentMemoryKind(entry));'), true);
  assert.equal(sqlite.includes('const inferredKind = inferAgentMemoryKind({'), true);
  assert.equal(sqlite.includes("if (key.startsWith(`${prefix}:`) || key.startsWith(`${prefix}_`)) {"), true);
  assert.equal(sqlite.includes("if (prefix === 'academy_lesson') {"), true);
  assert.equal(sqlite.includes("return looksLikeAcademyLessonPayload(payload) ? 'academy_lesson' : 'calendar_event';"), true);
  assert.equal(sqlite.includes('const hasSignalHints = !!actionKey || hasPriceHints || !!normalizeKindValue(payload?.symbol || entry.symbol);'), true);
  assert.equal(sqlite.includes('function looksLikeAcademyCasePayload(payload) {'), true);
  assert.equal(sqlite.includes('function looksLikeAcademyLessonPayload(payload) {'), true);
  assert.equal(
    sqlite.includes("if ((sourceKey === 'academy' || sourceKey === 'academy_analyst') && looksLikeAcademyCasePayload(payload)) {"),
    true
  );
  assert.equal(sqlite.includes("if (sourceKey === 'academy' || sourceKey === 'academy_analyst') return 'academy_case';"), false);
  assert.equal(sqlite.includes('return null;'), true);
});

test('json ledger fallback mirrors kind inference for compatibility with legacy rows', () => {
  const jsonLedger = read('electron/tradeLedger.cjs');
  assert.equal(jsonLedger.includes('function inferAgentMemoryKind(input) {'), true);
  assert.equal(jsonLedger.includes('agentMemories: trimAgentMemoriesWithPolicy(agentMemories.map((entry) => {'), true);
  assert.equal(jsonLedger.includes('const inferred = inferAgentMemoryKind(entry);'), true);
  assert.equal(
    jsonLedger.includes('normalizeKindValue(entry.kind || inferAgentMemoryKind(entry))'),
    true
  );
  assert.equal(jsonLedger.includes("if (key.startsWith(`${prefix}:`) || key.startsWith(`${prefix}_`)) {"), true);
  assert.equal(jsonLedger.includes("if (prefix === 'academy_lesson') {"), true);
  assert.equal(jsonLedger.includes("return looksLikeAcademyLessonPayload(payload) ? 'academy_lesson' : 'calendar_event';"), true);
  assert.equal(jsonLedger.includes('const hasSignalHints = !!actionKey || hasPriceHints || !!normalizeKindValue(payload?.symbol || entry.symbol);'), true);
});
