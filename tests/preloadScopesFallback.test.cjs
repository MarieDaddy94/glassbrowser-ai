const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const preloadPath = path.join(process.cwd(), 'electron', 'preload.cjs');
const rootPreloadPath = path.join(process.cwd(), 'preload.cjs');

test('preload includes generated-scope fallback loader', () => {
  const source = fs.readFileSync(preloadPath, 'utf8');
  assert.equal(source.includes("./generated/ipcScopes.cjs"), true);
  assert.equal(source.includes("../generated/ipcScopes.cjs"), true);
  assert.equal(source.includes('fallback_inline'), true);
  assert.equal(source.includes('generated scope module missing; falling back to inline allowlist'), true);
  assert.equal(source.includes("require('path')"), false);
  assert.equal(source.includes('path.resolve('), false);
  assert.equal(source.includes("require('fs')"), false);
  assert.equal(source.includes("require('net')"), false);
  assert.equal(source.includes("require('tls')"), false);
});

test('root preload stays a thin forwarder to electron preload', () => {
  const source = fs.readFileSync(rootPreloadPath, 'utf8');
  assert.equal(source.includes("require('./electron/preload.cjs');"), true);
  assert.equal(source.includes("require('path')"), false);
  assert.equal(source.includes("require('./generated/ipcScopes.cjs')"), false);
});
