const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('app wires intent feature flags, assist parse callback, and scan-path reuse for intent triggers', () => {
  const source = read('App.tsx');

  assert.equal(source.includes('const signalIntentFeatureFlags = React.useMemo(() => {'), true);
  assert.equal(source.includes('signalIntentV1Composer: true,'), true);
  assert.equal(source.includes('signalIntentV1Scheduler: true,'), true);
  assert.equal(source.includes('signalIntentV1TelegramOps: true'), true);
  assert.equal(source.includes('const assistSignalIntentParse = useCallback(async (input:'), true);
  assert.equal(source.includes('sendPlainTextToOpenAI({'), true);
  assert.equal(source.includes('symbolListOverride: symbol ? [symbol] : null,'), true);
  assert.equal(source.includes('timeframesOverride: timeframes.length > 0 ? timeframes : null,'), true);
  assert.equal(source.includes('forceSuggestOnly: true,'), true);
  assert.equal(source.includes('intentMeta: {'), true);
  assert.equal(source.includes("if (!signalIntentFeatureFlags.signalIntentV1Scheduler) {"), true);
  assert.equal(source.includes('signalIntentTelegramOpsEnabled: signalIntentFeatureFlags.signalIntentV1TelegramOps,'), true);
  assert.equal(source.includes('onAssistParse={assistSignalIntentParse}'), true);
});

