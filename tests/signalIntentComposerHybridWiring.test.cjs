const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal intent composer supports hybrid assist parse and manual schedule controls', () => {
  const source = read('components/signal/SignalIntentComposer.tsx');

  assert.equal(source.includes("parseSignalIntentPrompt, validateSignalIntentDraft"), true);
  assert.equal(source.includes('onAssistParse?: (input:'), true);
  assert.equal(source.includes('Assist Parse'), true);
  assert.equal(source.includes('setAssistantDraft(assisted);'), true);
  assert.equal(source.includes('Manual Adjustments'), true);
  assert.equal(source.includes('placeholder={`Schedule times HH:mm'), true);
  assert.equal(source.includes('Weekdays:'), true);
  assert.equal(source.includes('Intent Chat Preview'), true);
  assert.equal(source.includes('parsedWithOverrides.needsConfirmation'), true);
});

