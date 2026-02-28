const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readAppSource() {
  return fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
}

test('runtime ops actions.list uses loadActionCatalogModule and not undefined loader symbol', () => {
  const appSource = readAppSource();
  assert.equal(appSource.includes('const loadActionCatalogModule = () => {'), true);

  const branchMatch = appSource.match(
    /else if \(command === 'actions\.list'\) \{([\s\S]*?)\n\s*\} else if \(command === 'mode\.set'\) \{/m
  );
  assert.ok(branchMatch, 'actions.list branch was not found');

  const branchSource = branchMatch[1];
  assert.equal(branchSource.includes('await loadActionCatalogModule()'), true);
  assert.equal(/\bloadActionCatalog\(/.test(branchSource), false);
});
