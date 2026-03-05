const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('release validation includes mt5 sidecar prepackage and packaged smoke checks', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg?.scripts?.['release:validate:mt5-sidecar'], 'node scripts/checkMt5SidecarPackaging.cjs --mode prepackage');
  assert.equal(
    pkg?.scripts?.['electron:dist:package'],
    'npm run build:mt5-sidecar && npm run release:validate:dist-assets && npm run release:validate:mt5-sidecar && electron-builder'
  );
  assert.equal(
    pkg?.scripts?.['release:pack:smoke'],
    'node scripts/releasePackSmoke.cjs && node scripts/checkMt5SidecarPackaging.cjs --mode packaged && node scripts/checkRendererExternalDeps.cjs --packaged'
  );
});

test('sidecar packaging validation script enforces exe+manifest+hash checks', () => {
  const source = read('scripts/checkMt5SidecarPackaging.cjs');
  assert.equal(source.includes('MIN_SIDECAR_EXE_BYTES'), true);
  assert.equal(source.includes('sidecar-manifest.json'), true);
  assert.equal(source.includes('computeSha256'), true);
  assert.equal(source.includes('manifest version'), true);
  assert.equal(source.includes('hash mismatch'), true);
  assert.equal(source.includes("if (arg === '--mode'"), true);
});

test('release pack smoke validates packaged sidecar payload integrity', () => {
  const source = read('scripts/releasePackSmoke.cjs');
  assert.equal(source.includes('validatePackagedSidecar'), true);
  assert.equal(source.includes('SIDE_CAR_MIN_BYTES'), true);
  assert.equal(source.includes('packaged MT5 sidecar executable missing'), true);
  assert.equal(source.includes('sidecar hash mismatch'), true);
});
