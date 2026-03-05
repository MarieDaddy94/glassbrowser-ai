const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 signal slice migration keeps status-report/thread parity wiring', () => {
  const app = read('App.tsx');
  const hook = read('hooks/migration/useSignalWorkspaceState.ts');
  const store = read('stores/signalWorkspaceStore.ts');
  const orchestrator = read('orchestrators/signalWorkspaceOrchestrator.ts');

  assert.equal(app.includes("useSignalWorkspaceState"), true);
  assert.equal(app.includes("legacySignalStatusReportRunning"), true);
  assert.equal(app.includes("legacySignalStatusReportPending"), true);
  assert.equal(app.includes("legacySignalThreadArchivedBySignalId"), true);
  assert.equal(app.includes("setSignalStatusReportPending"), true);
  assert.equal(app.includes("setSignalThreadArchivedBySignalId"), true);
  assert.equal(app.includes("const signalWorkspaceActionBundle = React.useMemo(() => createSignalWorkspaceActionBundle({"), true);
  assert.equal(app.includes("const openSignalThreadInChat = signalWorkspaceActionBundle.openSignalThreadInChat;"), true);
  assert.equal(app.includes("const handleSignalFocus = signalWorkspaceActionBundle.handleSignalFocus;"), true);
  assert.equal(app.includes("signalWorkspaceActionBundle.openSignalThreadInChat(entry, opts);"), false);
  assert.equal(app.includes("signalWorkspaceActionBundle.handleSignalFocus(entry);"), false);

  assert.equal(store.includes("statusReportRunning"), true);
  assert.equal(store.includes("statusReportPending"), true);
  assert.equal(store.includes("setStatusReportPending"), true);
  assert.equal(orchestrator.includes('createSignalWorkspaceActionBundle'), true);

  assert.equal(hook.includes("sliceEnabled = flags.zustandMigrationV1 && flags.zustandSignalSliceV1"), true);
  assert.equal(hook.includes("onParityMismatch('signal'"), true);
  assert.equal(hook.includes("setStoreStatusReportRunning"), true);
  assert.equal(hook.includes("setStoreStatusReportPending"), true);
});
