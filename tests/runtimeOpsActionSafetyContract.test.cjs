const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT = path.join(ROOT, 'scripts', 'runtimeOpsClient.cjs');

test('runtimeOpsClient enforces safe-first confirm policy for risky actions', () => {
  const source = fs.readFileSync(CLIENT, 'utf8');
  assert.equal(source.includes('const catalog = await loadActionCatalogSnapshot();'), true);
  assert.equal(source.includes('const requiresConfirm = row?.safety?.requiresConfirmation === true || row?.requiresBroker === true;'), true);
  assert.equal(source.includes("code: 'confirmation_required'"), true);
  assert.equal(source.includes('requires explicit --confirm in safe-first mode'), true);
});
