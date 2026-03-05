const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const electronMain = fs.readFileSync(path.join(repoRoot, 'electron', 'main.cjs'), 'utf8');
const main = fs.readFileSync(path.join(repoRoot, 'main.cjs'), 'utf8');

test('electron main validates packaged renderer assets and shows explicit startup failure screen', () => {
  assert.match(electronMain, /function validatePackagedRendererEntryIntegrity\(/);
  assert.match(electronMain, /renderer_entry_integrity_failed/);
  assert.match(electronMain, /Packaged renderer integrity check failed; loading startup error page\./);
  assert.match(electronMain, /data:text\/html;charset=UTF-8/);
  assert.match(electronMain, /function buildRendererIntegrityFailureHtml\(/);
});

test('root main mirrors packaged renderer startup integrity guard', () => {
  assert.match(main, /function validatePackagedRendererEntryIntegrity\(/);
  assert.match(main, /renderer_entry_integrity_failed/);
  assert.match(main, /data:text\/html;charset=UTF-8/);
  assert.match(main, /function buildRendererIntegrityFailureHtml\(/);
});
