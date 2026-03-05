const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

test('release pack smoke checks packaged dist/index.html asset references against app.asar entries', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'releasePackSmoke.cjs'), 'utf8');
  assert.equal(source.includes('extractPackagedDistIndexHtml'), true);
  assert.equal(source.includes('extractRendererAssetRefsFromHtml'), true);
  assert.equal(source.includes('/dist/index.html'), true);
  assert.equal(source.includes('missing renderer asset entries referenced by dist/index.html'), true);
  assert.equal(source.includes('rendererAssetRefs'), true);
});
