const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const settingsPath = path.join(process.cwd(), 'components', 'SettingsModal.tsx');
const panelPath = path.join(process.cwd(), 'components', 'TradeLockerInterface.tsx');

test('Settings profile loader infers env from profile id base when env is missing', () => {
  const source = fs.readFileSync(settingsPath, 'utf8');
  assert.match(source, /const parsedProfileId = parseTradeLockerProfileId\(String\(entry\?\.id \|\| ""\)\);/);
  assert.match(source, /const inferredEnv = baseParts\[0\] === "live" \|\| baseParts\[0\] === "demo" \? baseParts\[0\] : "";/);
  assert.match(source, /const envRaw = String\(entry\?\.env \|\| ""\)\.trim\(\)\.toLowerCase\(\);/);
});

test('TradeLocker panel profile loader infers env from profile id base when env is missing', () => {
  const source = fs.readFileSync(panelPath, 'utf8');
  assert.match(source, /const parsedProfileId = parseTradeLockerProfileId\(String\(entry\?\.id \|\| ''\)\);/);
  assert.match(source, /const inferredEnv = baseParts\[0\] === 'live' \|\| baseParts\[0\] === 'demo' \? baseParts\[0\] : '';/);
  assert.match(source, /const envRaw = String\(entry\?\.env \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
});

