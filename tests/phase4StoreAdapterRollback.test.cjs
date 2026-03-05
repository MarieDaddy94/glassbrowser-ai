const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 adapters and flags support per-slice rollback', () => {
  const flags = read('services/enterpriseFeatureFlags.ts');
  const chatHook = read('hooks/migration/useChatWorkspaceState.ts');
  const signalHook = read('hooks/migration/useSignalWorkspaceState.ts');
  const tlHook = read('hooks/migration/useTradeLockerWorkspaceState.ts');

  assert.equal(flags.includes("zustandChatSliceV1"), true);
  assert.equal(flags.includes("zustandSignalSliceV1"), true);
  assert.equal(flags.includes("zustandTradeLockerSliceV1"), true);
  assert.equal(flags.includes("phase4ParityAuditV1"), true);

  assert.equal(chatHook.includes("sliceEnabled = flags.zustandMigrationV1 && flags.zustandChatSliceV1"), true);
  assert.equal(signalHook.includes("sliceEnabled = flags.zustandMigrationV1 && flags.zustandSignalSliceV1"), true);
  assert.equal(tlHook.includes("sliceEnabled = flags.zustandMigrationV1 && flags.zustandTradeLockerSliceV1"), true);

  assert.equal(chatHook.includes(": legacyActiveSignalThreadId"), true);
  assert.equal(signalHook.includes(": legacySignalStatusReportRunning"), true);
  assert.equal(tlHook.includes(": legacyRefreshState"), true);
});
