const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const hookPath = path.join(process.cwd(), 'hooks', 'useStartupReadiness.ts');

test('startup permission audit warning is gated to degraded conditions', () => {
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.equal(source.includes('const shouldWarnPermissions ='), true);
  assert.equal(source.includes('!!result.permissionError'), true);
  assert.equal(source.includes("result.bridgeState === 'failed'"), true);
  assert.equal(source.includes('result.blockedScopes'), true);
  assert.equal(source.includes('result.probeSkippedDueToBridge === true'), true);
  assert.match(source, /if\s*\(shouldWarnPermissions\)\s*{\s*console\.warn\('\[startup_permissions\]'/s);
  assert.match(source, /else\s*{\s*console\.info\('\[startup_permissions\]'/s);
});
