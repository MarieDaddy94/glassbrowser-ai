const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('chart context pack includes harmonic tokens for signal reasoning', () => {
  const source = read('services/chartEngine.ts');

  assert.equal(source.includes("const harmonicEvents = merged.filter((evt) => String(evt?.payload?.family || '').trim().toLowerCase() === 'harmonic');"), true);
  assert.equal(source.includes('return `harmonic:${harmonicType}:${direction} prz:${przToken} confidence:${confToken}`;'), true);
  assert.equal(source.includes("if (tokens.length > 0) bodyLines.push(`- Harmonics ${tokens.join(' | ')}`);"), true);
});
