const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('App wires runtime ops external command dispatcher through existing runtime ops handlers', () => {
  const appSource = read('App.tsx');

  assert.equal(appSource.includes('const handleRuntimeOpsExternalCommand = useCallback(async (incoming: any) => {'), true);
  assert.equal(appSource.includes("command === 'health.get'"), true);
  assert.equal(appSource.includes("command === 'state.get'"), true);
  assert.equal(appSource.includes("command === 'actions.list'"), true);
  assert.equal(appSource.includes("command === 'mode.set'"), true);
  assert.equal(appSource.includes("command === 'emergency.stop'"), true);
  assert.equal(appSource.includes("command === 'action.run'"), true);
  assert.equal(appSource.includes('await loadActionCatalogModule()'), true);
  assert.equal(appSource.includes("source: 'external_codex'"), true);
  assert.equal(appSource.includes('runtimeOpsApi.replyExternalCommand({'), true);
  assert.equal(appSource.includes('runtimeOpsApi.onExternalCommand((payload: any) => {'), true);
});
