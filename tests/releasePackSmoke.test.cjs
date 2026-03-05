const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(process.cwd(), 'scripts', 'releasePackSmoke.cjs');

test('release pack smoke script checks preload and generated scopes entries', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.equal(source.includes('/electron/preload.cjs'), true);
  assert.equal(source.includes('/electron/generated/ipcScopes.cjs'), true);
  assert.equal(source.includes('/services/runtimeOpsExternalBridge.cjs'), true);
  assert.equal(source.includes('extractPackagedDistIndexHtml'), true);
  assert.equal(source.includes('extractRendererAssetRefsFromHtml'), true);
});

test('release pack smoke script enforces minimum size guards', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.equal(source.includes('APP_ASAR_MIN_BYTES'), true);
  assert.equal(source.includes('SETUP_EXE_MIN_BYTES'), true);
  assert.equal(source.includes('WIN_UNPACKED_MIN_BYTES'), true);
  assert.equal(source.includes('SIDE_CAR_MIN_BYTES'), true);
  assert.equal(source.includes('build.nsis.runAfterFinish must be false'), true);
  assert.equal(source.includes('runAfterFinish'), true);
  assert.equal(source.includes('app.asar too small'), true);
  assert.equal(source.includes('setup executable too small'), true);
  assert.equal(source.includes('missing renderer asset entries referenced by dist/index.html'), true);
  assert.equal(source.includes('packaged MT5 sidecar executable missing'), true);
  assert.equal(source.includes('sidecar hash mismatch'), true);
});

test('release pack smoke script exports runner', () => {
  const mod = require(scriptPath);
  assert.equal(typeof mod.runReleasePackSmoke, 'function');
  assert.equal(typeof mod.extractRendererAssetRefsFromHtml, 'function');
  assert.equal(Array.isArray(mod.REQUIRED_PATHS), true);
  assert.equal(typeof mod.APP_ASAR_MIN_BYTES, 'number');
  assert.equal(mod.APP_ASAR_MIN_BYTES > 0, true);
  assert.equal(typeof mod.SETUP_EXE_MIN_BYTES, 'number');
  assert.equal(mod.SETUP_EXE_MIN_BYTES > 0, true);
  assert.equal(typeof mod.WIN_UNPACKED_MIN_BYTES, 'number');
  assert.equal(mod.WIN_UNPACKED_MIN_BYTES > 0, true);
  assert.equal(typeof mod.SIDE_CAR_MIN_BYTES, 'number');
  assert.equal(mod.SIDE_CAR_MIN_BYTES > 0, true);
});
