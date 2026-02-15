const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('startup diagnostics only warn when permission/bridge failures are present', () => {
  const source = read('hooks/useStartupReadiness.ts');
  assert.equal(
    source.includes('if (result.diagnosticWarning) {\n        if (shouldWarnPermissions) {'),
    true
  );
  assert.equal(source.includes("console.info('[startup_permissions]'"), false);
  assert.equal(source.includes("if (shouldWarnPermissions) {\n          console.warn('[startup_permissions]'"), true);
});
