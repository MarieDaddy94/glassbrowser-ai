const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.resolve(__dirname, '..', 'App.tsx');

const getBareUseMemoCalls = (source) => {
  const matches = [];
  const pattern = /useMemo\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? -1;
    if (index <= 0) {
      matches.push(index);
      continue;
    }
    const previous = source[index - 1];
    if (previous === '.' || /[A-Za-z0-9_$]/.test(previous)) {
      continue;
    }
    matches.push(index);
  }
  return matches;
};

test('App.tsx does not call bare useMemo without react named import', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const bareCalls = getBareUseMemoCalls(source);
  const hasNamedUseMemoImport = /import\s+[^;]*\buseMemo\b[^;]*from\s+['"]react['"]/m.test(source);

  assert.equal(
    bareCalls.length > 0 && !hasNamedUseMemoImport,
    false,
    'Found bare useMemo(...) call(s) in App.tsx without importing useMemo from react. Use React.useMemo(...) or add the named import.'
  );
});
