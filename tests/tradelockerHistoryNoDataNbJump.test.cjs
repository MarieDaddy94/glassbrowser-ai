const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(process.cwd(), 'electron', 'tradelocker.cjs'), 'utf8');

test('history no_data handling consumes nb jump hints', () => {
  assert.match(source, /status === 'no_data'/);
  assert.match(source, /json\?\.d\?\.nb \?\? json\?\.nb/);
  assert.match(source, /historyNoDataCount/);
  assert.match(source, /historyNbJumps/);
});

test('history cursor stall recovery is bounded', () => {
  assert.match(source, /historyCursorStallRecoveries/);
  assert.match(source, /nextCursor <= cursor/);
  assert.match(source, /cursor = cursor \+ 1/);
});

