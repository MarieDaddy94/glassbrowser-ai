const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('MT5 interface accepts symbol map and resolves mapped MT5 symbols before broker lookup', () => {
  const source = read('components/MT5Interface.tsx');
  assert.equal(source.includes('symbolMap?: SymbolMapEntry[];'), true);
  assert.equal(source.includes('const resolveMappedMt5Symbol = useCallback((raw: string) => {'), true);
  assert.equal(source.includes('const mapped = resolveMappedMt5Symbol(trimmed);'), true);
  assert.equal(source.includes('if (mapped) {'), true);
});

test('App passes broker link symbol map into MT5 panel', () => {
  const source = read('App.tsx');
  assert.equal(source.includes('symbolMap={brokerLinkConfig?.symbolMap || []}'), true);
});
