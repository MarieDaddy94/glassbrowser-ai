const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('nsis config enforces stable install dir and includes custom installer guard', () => {
  const pkgRaw = read('package.json');
  const installerScript = read('electron/installer.nsh');
  const pkg = JSON.parse(pkgRaw);

  assert.equal(pkg?.build?.nsis?.include, 'electron/installer.nsh');
  assert.equal(pkg?.build?.nsis?.allowToChangeInstallationDirectory, false);
  assert.equal(installerScript.includes('!macro customInit'), true);
  assert.equal(installerScript.includes('StrCpy $INSTDIR "$LOCALAPPDATA\\Programs\\${PRODUCT_NAME}"'), true);
});

