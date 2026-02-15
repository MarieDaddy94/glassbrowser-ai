const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy refresh keeps materialized cases without resolved-only gating', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const toFinalDecisionOutcome = (entry: any) => {'), true);
  assert.equal(app.includes('entry.resolvedOutcomeEnvelope?.decisionOutcome'), true);
  assert.equal(app.includes('const isFinalAcademyCase = (entry: AcademyCase | null | undefined) => {'), false);
  assert.equal(app.includes('if (!isFinalAcademyCase(hydrated)) {\n            continue;\n          }'), false);
});
