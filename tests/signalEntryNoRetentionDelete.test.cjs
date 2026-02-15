const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('signal entry refresh/persist no longer performs retention-based deletion', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const persistSignalEntries = useCallback(async (entries: SignalEntry[]) => {'), true);
  assert.equal(app.includes('const cutoff = now - SIGNAL_ENTRY_RETENTION_MS;'), false);
  assert.equal(app.includes('const staleKeys: Array<{ key?: string; id?: string }> = [];'), false);
  assert.equal(app.includes('await ledger.deleteAgentMemory({ key: stale.key, id: stale.id });'), false);
  assert.equal(app.includes("const limit = Number.isFinite(Number(opts?.limit)) ? Math.max(50, Math.min(50000, Math.floor(Number(opts?.limit)))) : 5000;"), true);
});
