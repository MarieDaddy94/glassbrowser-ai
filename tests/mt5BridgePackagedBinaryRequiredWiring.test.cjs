const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('main entrypoints enforce packaged sidecar binary without packaged python fallback', () => {
  const electronMain = read('electron/main.cjs');
  const rootMain = read('main.cjs');

  for (const source of [electronMain, rootMain]) {
    assert.equal(source.includes("mode: 'packaged_binary_missing'"), true);
    assert.equal(source.includes("if (launchMode === 'packaged_binary_missing')"), true);
    assert.equal(source.includes('Packaged MT5 sidecar binary missing at'), true);
    assert.equal(source.includes('npm run build:mt5-sidecar'), true);
    assert.equal(source.includes('mode: launchMode'), true);
  }
});

