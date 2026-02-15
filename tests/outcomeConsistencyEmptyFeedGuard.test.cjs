const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('outcome consistency engine suppresses stale/degraded status when feed is empty', () => {
  const source = read('services/outcomeConsistencyEngine.ts');
  assert.equal(source.includes('if (Number(this.cursor.total || 0) <= 0)'), true);
  assert.equal(source.includes('degraded: false'), true);
  assert.equal(source.includes('stale: false'), true);
  assert.equal(source.includes('const hasResolvedFeed = Number(this.cursor.total || 0) > 0;'), true);
});
