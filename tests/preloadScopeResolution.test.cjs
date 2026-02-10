const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const preloadPath = path.join(process.cwd(), 'electron', 'preload.cjs');

test('preload resolves scope module through deterministic absolute path attempts', () => {
  const source = fs.readFileSync(preloadPath, 'utf8');
  assert.equal(source.includes('const resolveScopeModuleAttempts = () => {'), true);
  assert.equal(source.includes("'./generated/ipcScopes.cjs'"), true);
  assert.equal(source.includes("'../generated/ipcScopes.cjs'"), true);
  assert.equal(source.includes('/electron/generated/ipcScopes.cjs'), true);
  assert.equal(source.includes("require('path')"), false);
  assert.equal(source.includes('if (GENERATED_SCOPE_LOAD.source === \'fallback_inline\')'), true);
  assert.equal(source.includes('generated scope module missing; falling back to inline allowlist'), true);
});
