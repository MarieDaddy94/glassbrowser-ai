const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('academy analyst eligibility allows repaired academy rows with stable signal identity', () => {
  const app = read('App.tsx');
  const blockStart = app.indexOf('const isSignalPanelAcademyCase = useCallback((entry: AcademyCase | null | undefined) => {');
  const blockEnd = app.indexOf('}, []);', blockStart);
  const block = blockStart >= 0 && blockEnd > blockStart ? app.slice(blockStart, blockEnd) : '';

  assert.equal(block.includes("source === 'academy_repair'"), true);
  assert.equal(block.includes("source === 'academy_analyst'"), true);
  assert.equal(block.includes("source === 'system_repair'"), true);
  assert.equal(block.includes("source === 'legacy_repair'"), true);
  assert.equal(block.includes('entry.signalCanonicalId || entry.signalId || entry.legacySignalId || entry.id'), true);
});

