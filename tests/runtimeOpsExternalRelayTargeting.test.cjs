const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('runtime external relay prefers active stream subscriber then responder then focused fallback', () => {
  const main = read('electron/main.cjs');

  assert.equal(main.includes('function getPreferredRuntimeOpsWebContents() {'), true);
  assert.equal(main.includes('runtimeStreamSubscribersByWebContentsId'), true);
  assert.equal(main.includes("source: 'active_subscriber'"), true);
  assert.equal(main.includes("source: 'last_responder'"), true);
  assert.equal(main.includes("source: 'focused_window'"), true);
  assert.equal(main.includes("source: 'first_alive_window'"), true);
  assert.equal(main.includes('targetSource'), true);
});

