const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { validatePermissionScopes } = require('../scripts/validatePermissionScopes.cjs');
const { runStartupContractSmoke } = require('../scripts/smokeStartupContracts.cjs');

const repoRoot = path.resolve(__dirname, '..');

test('permission scopes requested by app boot are allowed in preload', () => {
  const result = validatePermissionScopes(repoRoot);
  assert.equal(result.ok, true, `Missing scopes: ${result.missing.join(', ')}`);
});

test('startup contract smoke checks pass', () => {
  const result = runStartupContractSmoke(repoRoot);
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.checked) && result.checked.length > 0);
});

