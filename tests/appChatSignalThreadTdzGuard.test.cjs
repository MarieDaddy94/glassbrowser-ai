const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

function assertDeclaredBefore(source, beforeNeedle, afterNeedle, message) {
  const beforeIdx = source.indexOf(beforeNeedle);
  const afterIdx = source.indexOf(afterNeedle);
  assert.notStrictEqual(beforeIdx, -1, `Missing declaration: ${beforeNeedle}`);
  assert.notStrictEqual(afterIdx, -1, `Missing declaration: ${afterNeedle}`);
  assert.ok(beforeIdx < afterIdx, message);
}

test('chat signal callbacks are declared after their dependencies to avoid TDZ startup crashes', () => {
  const source = fs.readFileSync(appPath, 'utf8');

  assertDeclaredBefore(
    source,
    'const publishSignalSelectionContext = useCallback(',
    'const selectSignalThreadFromChat = useCallback((signalId: string | null) => {',
    'publishSignalSelectionContext must be declared before selectSignalThreadFromChat'
  );

  assertDeclaredBefore(
    source,
    'const openSidebarMode = useCallback((nextMode: SidebarMode) => {',
    'const openSignalFromChat = useCallback((signalId: string) => {',
    'openSidebarMode must be declared before openSignalFromChat'
  );

  assertDeclaredBefore(
    source,
    'const openSymbolPanel = useCallback(',
    'const openChartFromSignalChat = useCallback((signalId: string) => {',
    'openSymbolPanel must be declared before openChartFromSignalChat'
  );

  assertDeclaredBefore(
    source,
    'const openAcademyCaseFromSignal = useCallback((signalId: string) => {',
    'const openAcademyCaseFromChat = useCallback((signalId: string) => {',
    'openAcademyCaseFromSignal must be declared before openAcademyCaseFromChat'
  );
});
