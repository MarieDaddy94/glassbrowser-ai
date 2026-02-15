const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('preload resolves generated scope module from deterministic absolute paths before fallback', () => {
  const source = read('electron/preload.cjs');
  assert.equal(source.includes('const normalizePathLike ='), true);
  assert.equal(source.includes('const joinPathLike ='), true);
  assert.equal(source.includes("joinPathLike(dirNormalized, 'generated', 'ipcScopes.cjs')"), true);
  assert.equal(source.includes("joinPathLike(resourcesNormalized, 'app.asar.unpacked', 'electron', 'generated', 'ipcScopes.cjs')"), true);
  assert.equal(source.includes('const deduped = [];'), true);
});
