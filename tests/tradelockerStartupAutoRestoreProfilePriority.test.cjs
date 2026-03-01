const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const hookPath = path.join(process.cwd(), 'hooks', 'useTradeLocker.ts');

test('startup auto-restore reads active TradeLocker profile before generic saved config', () => {
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.match(source, /const TL_PROFILES_KEY = "glass_tradelocker_profiles_v1";/);
  assert.match(source, /const TL_ACTIVE_PROFILE_KEY = "glass_tradelocker_active_profile_v1";/);
  assert.match(source, /const activeProfile = loadActiveTradeLockerAutoRestoreProfile\(\);/);
  assert.match(source, /const env = activeProfile\?\.env \|\| \(savedConfig\?\.env === "live" \? "live" : "demo"\);/);
  assert.match(source, /profileKey: activeProfile\?\.profileKey \|\| undefined,/);
  assert.match(source, /profileScoped: !!activeProfile\?\.profileKey,/);
});

