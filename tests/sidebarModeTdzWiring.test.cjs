const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('mode-dependent panel consistency wiring is declared after useSidebar', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  const useSidebarDecl = "const { isOpen, mode, toggleSidebar, openSidebar, closeSidebar, switchMode } = useSidebar();";
  const useSidebarAt = source.indexOf(useSidebarDecl);
  assert.notEqual(useSidebarAt, -1, 'useSidebar declaration not found');

  const requiredAfter = [
    "if (mode === 'leaderboard')",
    "if (mode !== 'academy') return;",
    "if (mode !== 'audit') return;",
    "if (mode !== 'changes') return;",
    'originPanel: mode || null',
    "outcomeConsistencyEngine.markPanelRead('leaderboard', cursor);",
    "outcomeConsistencyEngine.markPanelRead('academy', outcomeFeedCursor);",
    "outcomeConsistencyEngine.markPanelRead('audit', outcomeFeedCursor);",
    "outcomeConsistencyEngine.markPanelRead('changes', outcomeFeedCursor);"
  ];

  for (const marker of requiredAfter) {
    const markerAt = source.indexOf(marker);
    assert.notEqual(markerAt, -1, `missing marker: ${marker}`);
    assert.equal(markerAt > useSidebarAt, true, `marker appears before useSidebar: ${marker}`);
  }
});

test('no free mode reads in startup block before useSidebar', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  const useSidebarAt = source.indexOf("const { isOpen, mode, toggleSidebar, openSidebar, closeSidebar, switchMode } = useSidebar();");
  assert.notEqual(useSidebarAt, -1, 'useSidebar declaration not found');
  const prefix = source.slice(0, useSidebarAt);

  assert.equal(prefix.includes("if (mode === 'leaderboard')"), false);
  assert.equal(prefix.includes("if (mode !== 'academy') return;"), false);
  assert.equal(prefix.includes("if (mode !== 'audit') return;"), false);
  assert.equal(prefix.includes("if (mode !== 'changes') return;"), false);
  assert.equal(prefix.includes('originPanel: mode || null'), false);
});
