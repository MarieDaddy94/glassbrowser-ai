const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 chat slice migration uses adapter parity + dual-write wiring', () => {
  const app = read('App.tsx');
  const hook = read('hooks/migration/useChatWorkspaceState.ts');
  const store = read('stores/chatWorkspaceStore.ts');
  const orchestrator = read('orchestrators/chatWorkspaceOrchestrator.ts');

  assert.equal(app.includes("useChatWorkspaceState"), true);
  assert.equal(app.includes("legacyActiveSignalThreadId"), true);
  assert.equal(app.includes("legacySignalThreadUnreadCountsState"), true);
  assert.equal(app.includes("legacyChatContextInspectorState"), true);
  assert.equal(app.includes("recordMigrationParityMismatch"), true);
  assert.equal(app.includes("const chatWorkspaceState = useChatWorkspaceState"), true);

  assert.equal(store.includes("contextInspector"), true);
  assert.equal(store.includes("setContextInspector"), true);
  assert.equal(store.includes("setUnreadByThread"), true);
  assert.equal(orchestrator.includes('createChatWorkspaceActionBundle'), true);
  assert.equal(app.includes('const chatWorkspaceActionBundle = React.useMemo(() => createChatWorkspaceActionBundle({'), true);
  assert.equal(app.includes('const selectSignalThreadFromChat = chatWorkspaceActionBundle.selectSignalThreadFromChat;'), true);
  assert.equal(app.includes('chatWorkspaceActionBundle.selectSignalThreadFromChat(signalId);'), false);

  assert.equal(hook.includes("sliceEnabled = flags.zustandMigrationV1 && flags.zustandChatSliceV1"), true);
  assert.equal(hook.includes("onParityMismatch('chat'"), true);
  assert.equal(hook.includes("setStoreActiveThread"), true);
  assert.equal(hook.includes("setStoreUnreadByThread"), true);
  assert.equal(hook.includes("setStoreContextInspector"), true);
});
