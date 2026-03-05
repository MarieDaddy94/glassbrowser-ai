const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(ROOT, relPath));

test('phase4 lint boundary config exists with warn-first import restrictions', () => {
  assert.equal(exists('eslint.config.mjs'), true);
  const lintConfig = read('eslint.config.mjs');
  assert.equal(lintConfig.includes("'no-restricted-imports': ["), true);
  assert.equal(lintConfig.includes("'warn'"), true);
  assert.equal(lintConfig.includes("'import/no-restricted-paths': ["), true);
  assert.equal(lintConfig.includes("target: './components'"), true);
  assert.equal(lintConfig.includes("from: './electron'"), true);
  assert.equal(lintConfig.includes("from: './backend'"), true);
  assert.equal(lintConfig.includes("files: ['orchestrators/**/*.{ts,tsx}']"), true);
});

test('phase4 lint scripts are wired in package.json', () => {
  const pkg = read('package.json');
  assert.equal(pkg.includes('"lint": "eslint . --ext .ts,.tsx,.js,.cjs,.mjs"'), true);
  assert.equal(pkg.includes('"lint:boundaries": "eslint components orchestrators App.tsx --ext .ts,.tsx,.js,.cjs,.mjs"'), true);
});
