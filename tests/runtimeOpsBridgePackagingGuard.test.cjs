const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

test('electron-builder files allowlist includes runtime ops bridge module', () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const packageJson = require(packageJsonPath);
  const files = Array.isArray(packageJson?.build?.files) ? packageJson.build.files : [];
  assert.equal(
    files.includes('services/runtimeOpsExternalBridge.cjs'),
    true,
    'build.files must include services/runtimeOpsExternalBridge.cjs'
  );
});
