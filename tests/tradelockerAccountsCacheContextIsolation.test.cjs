const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const electronPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('accounts cache stores context metadata and validates context match', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /this\.accountsCache = \{ accounts: \[\], fetchedAtMs: 0, env: null, server: null, email: null \};/);
  assert.match(source, /getAccountsCacheContext\(\) \{/);
  assert.match(source, /isAccountsCacheContextMatch\(\) \{/);
  assert.match(source, /setAccountsCache\(accounts, fetchedAtMs = nowMs\(\)\) \{/);
});

test('ensureAllAccountsCache avoids cross-context stale fallback reuse', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /const contextMatches = this\.isAccountsCacheContextMatch\(\);/);
  assert.match(source, /if \(contextMatches && Array\.isArray\(this\.accountsCache\?\.accounts\)/);
  assert.match(source, /if \(!contextMatches\) \{\s*this\.setAccountsCache\(\[\], 0\);/);
});

