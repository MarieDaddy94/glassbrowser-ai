const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 tradelocker slice migration keeps canonical switch flow and parity hook wiring', () => {
  const app = read('App.tsx');
  const hook = read('hooks/migration/useTradeLockerWorkspaceState.ts');
  const selectorHook = read('hooks/orchestrators/useTradeLockerAccountSelectorRuntime.ts');
  const store = read('stores/tradeLockerAccountStore.ts');
  const orchestrator = read('orchestrators/tradeLockerWorkspaceOrchestrator.ts');

  assert.equal(app.includes("useTradeLockerWorkspaceState"), true);
  assert.equal(app.includes("useTradeLockerAccountSelectorRuntime"), true);
  assert.equal(app.includes("const activeTradeLockerAccountKey = resolveSnapshotSourceKey();"), true);
  assert.equal(app.includes("} = useTradeLockerAccountSelectorRuntime({"), true);
  assert.equal(app.includes("useTradeLockerWorkspaceState({"), true);
  assert.equal(selectorHook.includes("const res = await handleSnapshotSourceChange(nextKey);"), true);
  assert.equal(selectorHook.includes("createTradeLockerSelectorActionBundle({"), true);

  assert.equal(store.includes("selectorOpen"), true);
  assert.equal(store.includes("selectorSearch"), true);
  assert.equal(store.includes("setRefreshState"), true);
  assert.equal(orchestrator.includes('createTradeLockerSelectorActionBundle'), true);

  assert.equal(hook.includes("sliceEnabled = flags.zustandMigrationV1 && flags.zustandTradeLockerSliceV1"), true);
  assert.equal(hook.includes("onParityMismatch('tradeLocker'"), true);
  assert.equal(hook.includes("setStoreActiveAccountKey"), true);
  assert.equal(hook.includes("setStoreSwitching"), true);
});
