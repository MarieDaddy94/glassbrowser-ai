const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('external runtime action command maps confirm flag into action payload confirmation fields', () => {
  const appSource = read('App.tsx');

  assert.equal(appSource.includes('if (payload?.confirm === true || payload?.confirmed === true) {'), true);
  assert.equal(appSource.includes('actionPayload.confirm = true;'), true);
  assert.equal(appSource.includes('actionPayload.confirmed = true;'), true);
  assert.equal(appSource.includes('actionPayload.confirmation = true;'), true);
});

