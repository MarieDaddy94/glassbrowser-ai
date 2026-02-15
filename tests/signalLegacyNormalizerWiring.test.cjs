const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('signal normalizers use legacy action inference but still reject unresolved malformed price-shape rows', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.equal(source.includes('const inferLegacyTradeAction = useCallback((input: {'), true);
  assert.equal(source.includes('const normalizeSignalEntryMemory = useCallback((memory: any): SignalEntry | null => {'), true);
  assert.equal(source.includes('const normalizeSignalHistoryMemory = useCallback((memory: any): SignalHistoryEntry | null => {'), true);
  assert.equal(source.includes('const action = inferLegacyTradeAction({'), true);
  assert.equal(source.includes('if ((!hasValidEntry || !hasValidStop || !hasValidTarget) && !isResolvedStatus) return null;'), true);
  assert.equal(source.includes('if ((!hasValidEntry || !hasValidStop || !hasValidTarget) && !outcome) return null;'), true);
});
