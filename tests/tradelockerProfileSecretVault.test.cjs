const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const clientPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('TradeLocker default state includes profile-scoped secret vault', () => {
  const source = fs.readFileSync(clientPath, 'utf8');
  assert.match(source, /secrets:\s*\{\s*[\s\S]*profiles:\s*\{\}/);
  assert.match(source, /function ensureTradeLockerProfileSecretMap\(state\)/);
});

test('TradeLocker connect uses profile vault first and only falls back to legacy secret for non-profile connect', () => {
  const source = fs.readFileSync(clientPath, 'utf8');
  assert.match(source, /const explicitProfileKey = normalizeTradeLockerProfileSecretKey\(opts\?\.profileKey\)/);
  assert.match(source, /const profileScopedConnect = explicitProfileKey !== '' \|\| opts\?\.profileScoped === true;/);
  assert.match(source, /if \(!password && profileSecretEntry\?\.password\)/);
  assert.match(source, /if \(!password && !profileScopedConnect\) password = decryptSecret\(this\.state\.secrets\?\.password\) \|\| ''/);
  assert.match(source, /code:\s*'password_required_for_profile'/);
});
