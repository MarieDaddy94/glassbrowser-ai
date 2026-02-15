const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy normalization uses strict parser with legacy-compatible fallback', () => {
  const app = read('App.tsx');

  assert.equal(app.includes('const normalizeAcademyCaseMemoryStrict = useCallback((memory: any): AcademyCase | null => {'), true);
  assert.equal(app.includes('const normalizeAcademyCaseMemoryLegacyCompat = useCallback((memory: any): AcademyCase | null => {'), true);
  assert.equal(
    app.includes('return normalizeAcademyCaseMemoryStrict(memory) ?? normalizeAcademyCaseMemoryLegacyCompat(memory);'),
    true
  );
  assert.equal(app.includes('inferLegacyTradeAction({'), true);
});

test('signal history normalization no longer hard-drops entries with missing explicit action', () => {
  const app = read('App.tsx');

  const start = app.indexOf('const normalizeSignalHistoryMemory = useCallback((memory: any): SignalHistoryEntry | null => {');
  assert.equal(start >= 0, true);
  const end = app.indexOf('const normalizeAgentScorecardMemory = useCallback', start);
  assert.equal(end > start, true);
  const block = app.slice(start, end);
  assert.equal(block.includes('const action = inferLegacyTradeAction({'), true);
  assert.equal(block.includes("if (actionRaw !== 'SELL' && actionRaw !== 'BUY') return null;"), false);
});
