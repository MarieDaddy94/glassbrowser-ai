const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'checkDistAssetIntegrity.cjs');
const {
  runDistAssetIntegrityCheck,
  extractAssetReferencesFromHtml
} = require(scriptPath);

function withTempDir(fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-dist-asset-'));
  try {
    return fn(tempDir);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
}

test('dist asset integrity check passes when all index.html asset references exist', () => {
  withTempDir((rootDir) => {
    const distDir = path.join(rootDir, 'dist');
    const assetsDir = path.join(distDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'index-abc.js'), 'console.log("ok");', 'utf8');
    fs.writeFileSync(path.join(assetsDir, 'vendor-def.css'), 'body{}', 'utf8');
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<script src="./assets/index-abc.js"></script><link href="./assets/vendor-def.css" rel="stylesheet"/>',
      'utf8'
    );

    const result = runDistAssetIntegrityCheck(rootDir, { distDir });
    assert.equal(result.ok, true);
    assert.equal(result.references.length, 2);
    assert.deepEqual(result.missingAssets, []);
  });
});

test('dist asset integrity check reports missing references from index.html', () => {
  withTempDir((rootDir) => {
    const distDir = path.join(rootDir, 'dist');
    const assetsDir = path.join(distDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'vendor-def.css'), 'body{}', 'utf8');
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<script src="./assets/index-abc.js"></script><link href="./assets/vendor-def.css" rel="stylesheet"/>',
      'utf8'
    );

    const result = runDistAssetIntegrityCheck(rootDir, { distDir });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missingAssets, ['assets/index-abc.js']);
  });
});

test('dist asset extraction only includes local assets references', () => {
  const refs = extractAssetReferencesFromHtml(`
    <link href="./assets/a.css" rel="stylesheet" />
    <script src="./assets/b.js"></script>
    <script src="https://cdn.example.com/c.js"></script>
    <a href="#section"></a>
  `);
  assert.deepEqual(refs, ['assets/a.css', 'assets/b.js']);
});
