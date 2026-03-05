const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('phase4 wave4b starts with chat slice default-on while other slices remain flag-gated', () => {
  const flags = read('services/enterpriseFeatureFlags.ts');
  const app = read('App.tsx');

  assert.equal(flags.includes('zustandMigrationV1: true'), true);
  assert.equal(flags.includes('zustandChatSliceV1: true'), true);
  assert.equal(flags.includes('zustandSignalSliceV1: false'), true);
  assert.equal(flags.includes('zustandTradeLockerSliceV1: false'), true);

  assert.equal(app.includes('const chatWorkspaceState = useChatWorkspaceState({'), true);
  assert.equal(app.includes('const signalWorkspaceState = useSignalWorkspaceState({'), true);
  assert.equal(app.includes('useTradeLockerWorkspaceState({'), true);
});
