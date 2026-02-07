const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(process.cwd(), 'scripts', 'releasePackSmoke.cjs');

test('release pack smoke script checks preload and generated scopes entries', () => {
  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.equal(source.includes('/electron/preload.cjs'), true);
  assert.equal(source.includes('/electron/generated/ipcScopes.cjs'), true);
});

test('release pack smoke script exports runner', () => {
  const mod = require(scriptPath);
  assert.equal(typeof mod.runReleasePackSmoke, 'function');
});
