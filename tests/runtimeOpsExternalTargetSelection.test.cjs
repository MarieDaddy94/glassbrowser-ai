const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(ROOT, 'electron', 'main.cjs');

test('main runtime relay prefers command subscribers before stream subscribers', () => {
  const source = fs.readFileSync(MAIN, 'utf8');
  const commandIdx = source.indexOf('if (commandSubscribers.length > 0)');
  const streamIdx = source.indexOf('if (activeSubscribers.length > 0)');
  assert.equal(commandIdx >= 0, true);
  assert.equal(streamIdx >= 0, true);
  assert.equal(commandIdx < streamIdx, true);
  assert.equal(source.includes('external_command_subscriber_preferred'), true);
  assert.equal(source.includes('active_subscriber_preferred'), true);
});
