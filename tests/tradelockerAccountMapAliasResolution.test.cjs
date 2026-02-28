const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'App.tsx');

test('App stores TradeLocker account map with aliases and canonical key', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /type TradeLockerAccountMapEntry = \{/);
  assert.match(source, /aliases:\s*string\[\];/);
  assert.match(source, /for \(const alias of aliases\)/);
  assert.match(source, /map\.set\(key,\s*entry\);/);
});

test('App resolves account entries by direct key and fallback key parse', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /const resolveTradeLockerAccountEntry = useCallback/);
  assert.match(source, /const direct = accountMap\.get\(raw\);/);
  assert.match(source, /const parsed = parseTradeLockerAccountKey\(raw\);/);
  assert.match(source, /const fallbackKey = buildTradeLockerAccountKey\(\{/);
});
