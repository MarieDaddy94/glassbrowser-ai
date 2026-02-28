const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const electronPath = path.join(process.cwd(), 'electron', 'tradelocker.cjs');

test('profile-scoped connect does not fall back to legacy global secret', () => {
  const source = fs.readFileSync(electronPath, 'utf8');
  assert.match(source, /const profileScopedConnect = explicitProfileKey !== '' \|\| opts\?\.profileScoped === true;/);
  assert.match(source, /if \(!password && !profileScopedConnect\) password = decryptSecret\(this\.state\.secrets\?\.password\) \|\| '';/);
  assert.match(source, /if \(!developerApiKey && !profileScopedConnect\) developerApiKey = decryptSecret\(this\.state\.secrets\?\.developerApiKey\) \|\| '';/);
  assert.match(source, /code:\s*'password_required_for_profile'/);
});

