const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

test('phase4 App.tsx LOC gate is satisfied (<= 38442)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
  const lineCount = source
    .split(/\r?\n/g)
    .filter((line) => String(line || '').trim().length > 0)
    .length;
  assert.equal(lineCount <= 38442, true, `App.tsx non-empty line count ${lineCount} exceeded gate 38442`);
});
