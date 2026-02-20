const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('academy shutdown flush keeps deterministic persistence order', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  const markers = [
    'const flushAcademyForShutdown = useCallback(async (',
    'await awaitAcademyPersistenceDrain(',
    'academy_graph_view:',
    'for (const entry of academyCasesRef.current || [])',
    'for (const lesson of academyLessonsRef.current || [])',
    'for (const learning of academySymbolLearningsRef.current || [])',
    "await trackAcademyPersistence(persistAcademyExport(), 'academy_shutdown_export');",
    "const flushRes = await trackAcademyPersistence(ledger.flush(), 'academy_shutdown_ledger_flush');"
  ];

  let prev = -1;
  for (const marker of markers) {
    const at = source.indexOf(marker);
    assert.notEqual(at, -1, `missing marker: ${marker}`);
    assert.equal(at > prev, true, `marker out of order: ${marker}`);
    prev = at;
  }
});

