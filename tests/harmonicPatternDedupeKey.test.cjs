const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('harmonic key uses anchor signature and chart engine prefers explicit patternKey for dedupe', () => {
  const harmonic = read('services/harmonicPatternEngine.ts');
  const chartEngine = read('services/chartEngine.ts');

  assert.equal(harmonic.includes('Math.floor(anchors.d.ts)'), true);
  assert.equal(harmonic.includes('Math.floor(anchors.x.ts)'), true);
  assert.equal(harmonic.includes('Math.floor(anchors.c.ts)'), true);
  assert.equal(chartEngine.includes("const preferred = String((event as any)?.patternKey || '').trim();"), true);
  assert.equal(chartEngine.includes('if (preferred) return preferred;'), true);
});
