const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();

test('package.json disables installer finish auto-run', () => {
  const packagePath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(pkg?.build?.nsis?.runAfterFinish, false);
});

test('packaging scripts enforce dist asset integrity gate and no double-build dist flow', () => {
  const packagePath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(pkg?.scripts?.['release:validate:dist-assets'], 'node scripts/checkDistAssetIntegrity.cjs');
  assert.equal(pkg?.scripts?.['release:validate:mt5-sidecar'], 'node scripts/checkMt5SidecarPackaging.cjs --mode prepackage');
  assert.equal(
    pkg?.scripts?.['electron:dist:package'],
    'npm run build:mt5-sidecar && npm run release:validate:dist-assets && npm run release:validate:mt5-sidecar && electron-builder'
  );
  assert.equal(
    pkg?.scripts?.['electron:dist'],
    'npm run release:validate && npm run electron:dist:package && npm run release:pack:smoke'
  );
  assert.equal(
    pkg?.scripts?.['release:pack:smoke'],
    'node scripts/releasePackSmoke.cjs && node scripts/checkMt5SidecarPackaging.cjs --mode packaged && node scripts/checkRendererExternalDeps.cjs --packaged'
  );
});

test('installer script does not override launchLink', () => {
  const installerPath = path.join(repoRoot, 'electron', 'installer.nsh');
  const source = fs.readFileSync(installerPath, 'utf8');
  assert.equal(source.includes('StrCpy $launchLink'), false);
});
