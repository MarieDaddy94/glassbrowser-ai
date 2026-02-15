const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal Academy row action routes into force-focus Academy flow', () => {
  const signal = read('components/SignalInterface.tsx');
  const app = read('App.tsx');

  assert.equal(signal.includes('onOpenAcademyCase(signal.id);'), true);
  assert.equal(signal.includes('focusSignal(signal);'), true);

  assert.equal(app.includes('const openAcademyCaseFromSignal = useCallback((signalId: string) => {'), true);
  assert.equal(app.includes('setAcademyFocusRequest({ requestId, signalId: id, caseId: id, forceVisible: true });'), true);
  assert.equal(app.includes("focusEntity: 'signal',"), true);
  assert.equal(app.includes('focusSignalId: id,'), true);
  assert.equal(app.includes('focusCaseId: id,'), true);
  assert.equal(app.includes("originPanel: 'signal'"), true);
  assert.equal(app.includes("openSidebarMode('academy');"), true);

  assert.equal(app.includes('focusRequest={academyFocusRequest}'), true);
  assert.equal(app.includes('onFocusRequestConsumed={handleAcademyFocusRequestConsumed}'), true);
});
