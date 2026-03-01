const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(process.cwd(), 'electron', 'tradelocker.cjs'), 'utf8');

test('config TTL policy is defined and tracked', () => {
  assert.match(source, /const CONFIG_TTL_MS =/);
  assert.match(source, /this\.configFetchedAtMs = 0/);
  assert.match(source, /configFetchedAtMs: this\.configFetchedAtMs \|\| null/);
});

test('ensureConfig supports force and ttl refresh semantics', () => {
  assert.match(source, /async ensureConfig\(opts = \{\}\)/);
  assert.match(source, /const force = opts === true \? true : opts\?\.force === true/);
  assert.match(source, /const ttlMs = Number\.isFinite\(Number\(opts\?\.ttlMs\)\)/);
  assert.match(source, /if \(!force && this\.config && ageMs <= ttlMs\) return this\.config/);
  assert.match(source, /this\.configFetchedAtMs = nowMs\(\)/);
});

