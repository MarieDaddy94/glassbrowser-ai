const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 callback extraction replaces thin useCallback wrappers with orchestrator bundle members', () => {
  const app = read('App.tsx');
  const tradeLockerHook = read('hooks/orchestrators/useTradeLockerAccountSelectorRuntime.ts');

  assert.equal(app.includes('const openSignalThreadInChat = signalWorkspaceActionBundle.openSignalThreadInChat;'), true);
  assert.equal(app.includes('const handleSignalFocus = signalWorkspaceActionBundle.handleSignalFocus;'), true);
  assert.equal(app.includes('const openSignalThreadInChat = useCallback('), false);
  assert.equal(app.includes('const handleSignalFocus = useCallback('), false);

  assert.equal(app.includes('const selectSignalThreadFromChat = chatWorkspaceActionBundle.selectSignalThreadFromChat;'), true);
  assert.equal(app.includes('const askAgentAboutSignalFromChat = chatWorkspaceActionBundle.askAgentAboutSignalFromChat;'), true);
  assert.equal(app.includes('const openSignalFromChat = chatWorkspaceActionBundle.openSignalFromChat;'), true);
  assert.equal(app.includes('const openAcademyCaseFromChat = chatWorkspaceActionBundle.openAcademyCaseFromChat;'), true);
  assert.equal(app.includes('const openChartFromSignalChat = chatWorkspaceActionBundle.openChartFromSignalChat;'), true);
  assert.equal(app.includes('const selectSignalThreadFromChat = useCallback('), false);
  assert.equal(app.includes('const askAgentAboutSignalFromChat = useCallback('), false);
  assert.equal(app.includes('const openSignalFromChat = useCallback('), false);
  assert.equal(app.includes('const openAcademyCaseFromChat = useCallback('), false);
  assert.equal(app.includes('const openChartFromSignalChat = useCallback('), false);

  assert.equal(
    tradeLockerHook.includes(
      'const handleTradeLockerAccountSelectorSearch = tradeLockerSelectorActionBundle.handleTradeLockerAccountSelectorSearch;'
    ),
    true
  );
  assert.equal(
    tradeLockerHook.includes(
      'const handleTradeLockerAccountSelectorToggleOpen = tradeLockerSelectorActionBundle.handleTradeLockerAccountSelectorToggleOpen;'
    ),
    true
  );
  assert.equal(
    tradeLockerHook.includes(
      'const handleTradeLockerAccountSelectorClose = tradeLockerSelectorActionBundle.handleTradeLockerAccountSelectorClose;'
    ),
    true
  );
  assert.equal(app.includes('const handleTradeLockerAccountSelectorSearch = useCallback('), false);
  assert.equal(app.includes('const handleTradeLockerAccountSelectorToggleOpen = useCallback('), false);
  assert.equal(app.includes('const handleTradeLockerAccountSelectorClose = useCallback('), false);
});
