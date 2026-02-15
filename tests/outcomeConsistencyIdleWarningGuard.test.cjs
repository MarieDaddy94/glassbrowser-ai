const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('outcome consistency engine does not emit cursor-only stale warning when checksums are current', () => {
  const source = read('services/outcomeConsistencyEngine.ts');
  assert.equal(source.includes("if (age > staleAfter && !read.checksum)"), true);
  assert.equal(source.includes("reason = 'cursor_stale';"), false);
  assert.equal(source.includes('const stale = stalePanels.length > 0;'), true);
});
