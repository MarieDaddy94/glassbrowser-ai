const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

test('strict typecheck profile exists and package script is wired', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(typeof pkg.scripts?.['typecheck:strict'], 'string');
  assert.equal(fs.existsSync(path.join(ROOT, 'tsconfig.strict.json')), true);
});
