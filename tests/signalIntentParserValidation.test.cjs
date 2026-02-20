const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal intent parser exposes strict draft validation and confidence confirmation gating', () => {
  const source = read('services/signalIntentParser.ts');

  assert.equal(source.includes('const SIGNAL_INTENT_MIN_CONFIDENCE = 0.72;'), true);
  assert.equal(source.includes('export const validateSignalIntentDraft = ('), true);
  assert.equal(source.includes("errors.push('Agent is required.')"), true);
  assert.equal(source.includes("errors.push('No schedule time found. Add a time like 08:30.')"), true);
  assert.equal(source.includes('if (!needsConfirmation && confidence < SIGNAL_INTENT_MIN_CONFIDENCE)'), true);
  assert.equal(source.includes("normalizedDraft.status = needsConfirmation ? 'needs_confirmation' : 'draft';"), true);
  assert.equal(source.includes('return validateSignalIntentDraft(draft,'), true);
});

