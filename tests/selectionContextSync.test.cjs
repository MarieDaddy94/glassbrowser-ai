const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal panel exposes explicit focus callback wiring', () => {
  const signal = read('components/SignalInterface.tsx');
  assert.equal(signal.includes('onFocusSignal?: (signal: SignalEntry) => void;'), true);
  assert.equal(signal.includes('const focusSignal = useCallback((signal: SignalEntry | null | undefined) => {'), true);
  assert.equal(signal.includes('focusSignal(signal);'), true);
});

test('app publishes immediate selection context for signal and academy', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('const publishImmediatePanelContext = useCallback((input: {'), true);
  assert.equal(app.includes('{ debounceMs: 0, merge: false }'), true);
  assert.equal(app.includes("const handleSignalFocus = useCallback((entry: SignalEntry) => {"), true);
  assert.equal(app.includes("publishSignalSelectionContext(entry, 'signal');"), true);
  assert.equal(app.includes("const handleAcademyCaseSelect = useCallback((caseId: string | null) => {"), true);
  assert.equal(app.includes("publishAcademySelectionContext(selectedCase, 'academy');"), true);
});

test('panel props route through selection context handlers', () => {
  const app = read('App.tsx');
  assert.equal(app.includes('onFocusSignal={handleSignalFocus}'), true);
  assert.equal(app.includes('onSelectCase={handleAcademyCaseSelect}'), true);
  assert.equal(app.includes("publishSignalSelectionContext(selectedSignal, 'signal');"), true);
});
